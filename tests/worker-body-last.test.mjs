// The Worker checks who is asking (the key, and the rate limit, from the
// headers and path alone) before it reads a request's body, so a stranger's
// 4 MB push is refused without being read, and a made-up key costs nothing
// (worker/cloud.js push, makeShare, startSound, changeProfile, deleteProfile,
// forgetAllKeys, takeUses).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { LIMITERS } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

const env = () => ({ DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } });

// A request whose body says if anything read it (highWaterMark 0: nothing
// asks the stream for data until a reader does).
function watched(method, path, { key, size = 0 } = {}) {
  const state = { read: false };
  const body = new ReadableStream({
    pull(controller) {
      state.read = true;
      controller.enqueue(new TextEncoder().encode('{"put":[]}'));
      controller.close();
    },
  }, { highWaterMark: 0 });
  const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (size) headers['Content-Length'] = String(size);
  if (key) headers.Authorization = `Bearer ${key}`;
  const request = new Request(`https://noodlepads.com/api/${path}`, { method, headers, body, duplex: 'half' });
  return { request, state };
}

const send = async (e, method, path, opts) => {
  const { request, state } = watched(method, path, opts);
  const res = await worker.fetch(request, e);
  return { status: res.status, body: await res.json(), read: state.read };
};

const FAKE_KEY = 'a'.repeat(32);
const ROUTES = [
  ['POST', 'profiles/p-one/records'],
  ['POST', 'profiles/p-one/sounds'],
  ['POST', 'profiles/p-one/shares'],
  ['PATCH', 'profiles/p-one'],
  ['DELETE', 'profiles/p-one'],
  ['DELETE', 'profiles/p-one/keys'],
  ['POST', 'profiles/p-one/uses'],
];

test('a made-up key is refused before the body is read, on every route that takes a body', async () => {
  const e = env();
  for (const [method, path] of ROUTES) {
    const r = await send(e, method, path, { key: FAKE_KEY });
    assert.ok(r.status === 401 || r.status === 404, `${method} ${path}: ${r.status}`);
    assert.equal(r.read, false, `${method} ${path} did not read the body`);
    const none = await send(e, method, path, {});
    assert.equal(none.read, false, `${method} ${path} with no key did not read the body`);
  }
});

test('a key over its rate limit is refused before the body is read', async () => {
  const e = env();
  const made = await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p-one', name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: '2468' }),
  }), e);
  assert.equal(made.status, 201);
  const { key } = await made.json();
  const closed = { async limit() { return { success: false }; } };
  e[LIMITERS.records] = closed;
  e[LIMITERS.sounds] = closed;
  e[LIMITERS.shares] = closed;
  for (const [method, path] of [['POST', 'profiles/p-one/records'], ['POST', 'profiles/p-one/sounds'], ['POST', 'profiles/p-one/shares']]) {
    const r = await send(e, method, path, { key });
    assert.deepEqual([r.status, r.body.error], [429, 'slow'], `${method} ${path}`);
    assert.equal(r.read, false, `${method} ${path} did not read the body`);
  }
});
