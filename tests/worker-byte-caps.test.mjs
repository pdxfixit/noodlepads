// A record's and a share's size caps count bytes, not characters
// (worker/cloud.js byteLength): text made of two- and three-byte characters
// is twice or three times its length in the database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { LIMITS } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };

async function call(method, path, { body, key } = {}) {
  const headers = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, { method, headers, body: JSON.stringify(body) }), env);
  return { status: res.status, data: await res.json() };
}

async function made(id) {
  const r = await call('POST', 'profiles', { body: { id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: '2468' } });
  assert.equal(r.status, 201);
  return r.data.key;
}

test('a record over the cap in bytes is refused although it is under it in characters', async () => {
  const key = await made('p-rec');
  // Under the cap as characters, over it as bytes (2 bytes each).
  const text = 'é'.repeat(LIMITS.recordBytes / 2 + 1000);
  assert.ok(text.length < LIMITS.recordBytes);
  const over = await call('POST', 'profiles/p-rec/records', { key, body: { put: [{ kind: 'beats', id: 'b-big', body: { text } }] } });
  assert.deepEqual([over.status, over.data.error], [413, 'record size']);
  const fits = await call('POST', 'profiles/p-rec/records', { key, body: { put: [{ kind: 'beats', id: 'b-ok', body: { text: 'é'.repeat(1000) } }] } });
  assert.equal(fits.status, 200);
});

test('a share over the cap in bytes is refused although it is under it in characters', async () => {
  const key = await made('p-share');
  // About 1,050,000 bytes in a bundle of 1,040,000 characters: over the 1 MB cap only by bytes.
  const text = 'a'.repeat(1_030_000) + 'é'.repeat(10_000);
  const r = await call('POST', 'profiles/p-share/shares', { key, body: { kind: 'beat', title: 'Big', bundle: { beats: [{ id: 'b', n: text }] } } });
  assert.deepEqual([r.status, r.data.error], [413, 'bundle']);
});
