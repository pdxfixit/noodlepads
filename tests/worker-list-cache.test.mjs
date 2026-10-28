// GET /api/profiles is public and anyone can send it, so the Worker keeps the
// answer 60 seconds in Cloudflare's Cache API (worker/cloud.js listFromCache):
// a repeat, with whatever query string, reads nothing from D1 and writes
// nothing. Without the Cache API (the tests' Node) the list is read each time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

// The part of caches.default the Worker uses: put and match by URL, keeping the stored copy.
function fakeCaches() {
  const stored = new Map();
  const log = [];
  return {
    stored, log,
    default: {
      async match(request) {
        log.push(['match', request.url]);
        const hit = stored.get(request.url);
        return hit ? hit.clone() : undefined;
      },
      async put(request, response) {
        log.push(['put', request.url, response.headers.get('Cache-Control')]);
        stored.set(request.url, new Response(await response.text(), { status: response.status, headers: response.headers }));
      },
    },
  };
}

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  const call = (method, path, body) => worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
    method,
    headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { env, call };
}

const make = (call, id) => call('POST', 'profiles', { id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: '2468' });

test('the list is kept 60 seconds: a repeat, whatever its query, reads and writes nothing in D1', async () => {
  const caches = fakeCaches();
  globalThis.caches = caches;
  try {
    const c = cloud();
    await make(c.call, 'p-a');
    const first = await c.call('GET', 'profiles');
    assert.deepEqual((await first.json()).profiles.map((p) => p.id), ['p-a']);
    assert.deepEqual(caches.log.filter(([what]) => what === 'put'), [['put', 'https://noodlepads.com/api/profiles', 'public, max-age=60']]);
    await make(c.call, 'p-b');   // made meanwhile: the kept list does not have it yet
    const before = c.env.DB.queries.length;
    const again = await c.call('GET', 'profiles?cache=busting-attempt');
    assert.equal(again.status, 200);
    assert.deepEqual((await again.json()).profiles.map((p) => p.id), ['p-a']);
    assert.equal(c.env.DB.queries.length, before, 'nothing asked of D1 at all');
    assert.equal(again.headers.get('Cache-Control'), 'no-store', 'and a browser keeps nothing');
    assert.equal(caches.log.filter(([what]) => what === 'put').length, 1, 'a kept list is not stored again');
  } finally {
    delete globalThis.caches;
  }
});

test('with no Cache API the list is read each time, and a Cache API that throws changes nothing', async () => {
  const c = cloud();
  await make(c.call, 'p-a');
  assert.equal((await (await c.call('GET', 'profiles')).json()).profiles.length, 1);
  await make(c.call, 'p-b');
  assert.equal((await (await c.call('GET', 'profiles')).json()).profiles.length, 2, 'fresh');
  globalThis.caches = { default: { async match() { throw new Error('cache down'); }, async put() { throw new Error('cache down'); } } };
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal((await (await c.call('GET', 'profiles')).json()).profiles.length, 2);
  } finally {
    console.error = realError;
    delete globalThis.caches;
  }
});
