// Per-profile rate limits in the Worker (worker/cloud.js LIMITERS): a push,
// a sound's start, a share and an open are each counted by a rate-limit
// binding (site/wrangler.toml), keyed by the hash of the request's key (an
// open: by the profile), never by an address. Over the limit is 429 'slow',
// apart from the daily caps' 429 'busy': the app says "busy right now" and
// syncs again in a minute. Without the bindings (the other tests' env)
// nothing is limited.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../worker/index.js';
import { LIMITERS } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

// A rate-limit binding that allows `limit` calls per key, and says what it was asked.
function fakeLimiter(limit) {
  const counts = new Map();
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return { success: counts.get(key) <= limit };
    },
  };
}

function cloud(limit = 2) {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  for (const name of Object.values(LIMITERS)) env[name] = fakeLimiter(limit);
  const call = async (method, path, { body, key } = {}) => {
    const headers = { Origin: ORIGIN };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, data: await res.json() };
  };
  return { env, call };
}

const look = (id) => ({ id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8' });
const hashOf = (key) => createHash('sha256').update(key).digest('hex');
const sha = (n) => n.toString(16).padStart(64, '0');

async function made(c, id) {
  const r = await c.call('POST', 'profiles', { body: look(id) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.key;
}

test('a push, a sound start and a share are limited per key, by its hash, and over it are 429 slow, never the daily caps\' busy', async () => {
  const c = cloud(2);
  const key = await made(c, 'p-one');
  const push = (n) => c.call('POST', 'profiles/p-one/records', { key, body: { put: [{ kind: 'beats', id: `beat-${n}`, body: { name: 'x' } }] } });
  const start = (n) => c.call('POST', 'profiles/p-one/sounds', { key, body: { sha256: sha(n), bytes: 10, mime: 'audio/wav' } });
  const share = (n) => c.call('POST', 'profiles/p-one/shares', { key, body: { kind: 'beat', title: `Beat ${n}`, bundle: { beats: [{ id: 'beat-1' }] } } });
  for (const [what, send, ok] of [['push', push, 200], ['start', start, 201], ['share', share, 201]]) {
    assert.equal((await send(1)).status, ok, what);
    assert.equal((await send(2)).status, ok, what);
    const over = await send(3);
    assert.deepEqual([over.status, over.data.error], [429, 'slow'], `${what}: the third in the window`);
  }
  for (const name of ['PUSH_LIMITER', 'SOUND_LIMITER', 'SHARE_LIMITER']) {
    assert.deepEqual([...new Set(c.env[name].keys)], [hashOf(key)], `${name} counts the key's hash, never the key itself`);
  }
  // Another family's key has its own count.
  const other = await made(c, 'p-two');
  assert.equal((await c.call('POST', 'profiles/p-two/records', { key: other, body: { put: [] } })).status, 200);
  // Reading is never limited: a big restore pulls as much as it needs.
  assert.equal((await c.call('GET', 'profiles/p-one/records', { key })).status, 200);
});

test('an open is limited per profile (it has no key yet), and a call with no key is left to the key check', async () => {
  const c = cloud(2);
  await made(c, 'p-one');
  await made(c, 'p-two');
  const open = (id) => c.call('POST', `profiles/${id}/open`, { body: {} });
  assert.equal((await open('p-one')).status, 200);
  assert.equal((await open('p-one')).status, 200);
  assert.deepEqual([(await open('p-one')).status, (await open('p-one')).data.error], [429, 'slow']);
  assert.equal((await open('p-two')).status, 200, 'another profile opens');
  assert.deepEqual([...new Set(c.env.OPEN_LIMITER.keys)], ['p-one', 'p-two']);
  const before = c.env.PUSH_LIMITER.keys.length;
  assert.equal((await c.call('POST', 'profiles/p-one/records', { body: { put: [] } })).status, 401);
  assert.equal(c.env.PUSH_LIMITER.keys.length, before, 'no key: nothing counted');
});

test('a limiter that fails lets the call through; no binding limits nothing', async () => {
  const c = cloud();
  c.env.PUSH_LIMITER = { limit: async () => { throw new Error('limiter down'); } };
  const key = await made(c, 'p-one');
  const realError = console.error;
  console.error = () => {};
  try {
    assert.equal((await c.call('POST', 'profiles/p-one/records', { key, body: { put: [] } })).status, 200);
  } finally {
    console.error = realError;
  }
  for (const name of Object.values(LIMITERS)) delete c.env[name];
  for (let i = 0; i < 5; i++) assert.equal((await c.call('POST', 'profiles/p-one/open', { body: {} })).status, 200);
});

test('site/wrangler.toml declares each limiter, a minute window, far above what a family meets', () => {
  const toml = readFileSync(new URL('../site/wrangler.toml', import.meta.url), 'utf8');
  const declared = new Map([...toml.matchAll(/\[\[ratelimits\]\]\s*\nname = "(\w+)"\s*\nnamespace_id = "(\d+)"\s*\nsimple = \{ limit = (\d+), period = (\d+) \}/g)]
    .map(([, name, ns, limit, period]) => [name, { ns, limit: Number(limit), period: Number(period) }]));
  assert.deepEqual(Object.values(LIMITERS).map((n) => [n, declared.get(n)?.limit, declared.get(n)?.period]), [
    ['PUSH_LIMITER', 60, 60], ['SOUND_LIMITER', 600, 60], ['SHARE_LIMITER', 10, 60], ['OPEN_LIMITER', 10, 60],
  ]);
  const ids = [...declared.values()].map((d) => d.ns);
  assert.equal(new Set(ids).size, ids.length, 'each limiter its own namespace');
  // Each flarepress app's feedback limiter is 415N (Isopix 4150, this app
  // 4151); this app's others are its own block, 41510-41519, so no other app
  // on the account can pick the same (docs/deploy-cloudflare.md).
  assert.equal(declared.get('FEEDBACK_LIMITER')?.ns, '4151');
  for (const name of Object.values(LIMITERS)) assert.match(declared.get(name).ns, /^4151\d$/, name);
});
