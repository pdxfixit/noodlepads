// Guessing a PIN through the site gets slower with every window (migration
// 010, worker/pin.js checkSecret): 5 wrong tries lock for 10 minutes, and each
// full window without a right PIN doubles the next lock, up to a day. A right
// PIN, a new PIN or a reset starts again at 10 minutes. Opening and the
// requests that carry a key count their strikes apart, as they count tries.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { WAIT_MS, MAX_WAIT_MS } from '../worker/pin.js';
import { FakeD1 } from './fake-d1.mjs';

const T0 = Date.parse('2026-10-27T12:00:00Z');
const PIN = '2468';

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  let now = T0;
  const call = async (method, path, { body, key } = {}) => {
    const headers = { Origin: ORIGIN };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
      return { status: res.status, data: await res.json() };
    } finally {
      Date.now = realNow;
    }
  };
  return { env, call, later: (ms) => { now += ms; } };
}

async function made(c, id = 'p-a') {
  const r = await c.call('POST', 'profiles', { body: { id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: PIN } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.key;
}

// Five wrong tries; returns the wait (seconds) the fifth one is answered with.
async function lockOut(c, send) {
  let last;
  for (let i = 0; i < 5; i++) last = await send('0001');
  assert.equal(last.status, 429, 'the fifth wrong try locks');
  return last.data.wait;
}

const open = (c) => (pin) => c.call('POST', 'profiles/p-a/open', { body: { pin } });

test('each full window without a right PIN doubles the next lock, up to a day', async () => {
  const c = cloud();
  await made(c);
  const waits = [];
  for (let i = 0; i < 11; i++) {
    waits.push(await lockOut(c, open(c)));
    assert.equal((await open(c)(PIN)).status, 429, 'even the right PIN waits');
    c.later(Math.min(MAX_WAIT_MS, WAIT_MS * 2 ** i) + 1000);
  }
  const minutes = waits.map((w) => w / 60);
  assert.deepEqual(minutes, [10, 20, 40, 80, 160, 320, 640, 1280, 1440, 1440, 1440]);
  assert.equal(MAX_WAIT_MS, 24 * 60 * 60 * 1000);
});

test('a right PIN starts the waits again at 10 minutes', async () => {
  const c = cloud();
  await made(c);
  assert.equal(await lockOut(c, open(c)), 600);
  c.later(WAIT_MS + 1000);
  assert.equal(await lockOut(c, open(c)), 1200, 'the second window is twice the first');
  c.later(2 * WAIT_MS + 1000);
  assert.equal((await open(c)(PIN)).status, 200, 'the wait is over: the right PIN opens');
  assert.equal(c.env.DB.rows('SELECT strikes FROM profiles')[0].strikes, 0, 'and clears the strikes');
  assert.equal(await lockOut(c, open(c)), 600, 'back to 10 minutes');
});

test('a new PIN starts the waits again, and the keyed requests count their strikes apart from opening', async () => {
  const c = cloud();
  const key = await made(c);
  const del = (pin) => c.call('DELETE', 'profiles/p-a', { key, body: { pin } });
  assert.equal(await lockOut(c, open(c)), 600);
  c.later(WAIT_MS + 1000);
  assert.equal(await lockOut(c, open(c)), 1200);
  assert.deepEqual(c.env.DB.rows('SELECT strikes, key_strikes FROM profiles')[0], { strikes: 2, key_strikes: 0 }, 'opening strikes are its own');
  assert.equal(await lockOut(c, del), 600, 'a keyed request starts at 10 minutes');
  c.later(WAIT_MS + 1000);
  assert.equal(await lockOut(c, del), 1200);
  c.later(2 * WAIT_MS + 1000);
  const changed = await c.call('PATCH', 'profiles/p-a', { key, body: { pin: PIN, newPin: '1357' } });
  assert.equal(changed.status, 200);
  assert.deepEqual(c.env.DB.rows('SELECT strikes, key_strikes, fails, key_fails FROM profiles')[0], { strikes: 0, key_strikes: 0, fails: 0, key_fails: 0 });
});
