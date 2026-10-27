// The deploy checks prove who they are (worker/cloud.js provenCheck): a
// p-smoke-/p-e2e- id gets the checks' allowance (their own daily cap, quick
// clean-up, off the list) only with the Worker secret CHECKS_KEY in the
// X-Checks-Key header. Without it such an id is refused as a bad id. Until
// the secret is in the Worker, the id alone passes, as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { CHECKS_HEADER } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { checksHeaders } from '../tools/look-cloud.mjs';

const SECRET = 'c0ffee'.repeat(8);

function cloud(secret = SECRET) {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  if (secret !== null) env.CHECKS_KEY = secret;   // null: the Worker has none
  const call = async (method, path, { body, key, proof } = {}) => {
    const headers = { Origin: ORIGIN };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (proof !== undefined) headers[CHECKS_HEADER] = proof;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return { status: res.status, data: await res.json() };
  };
  return { env, call };
}

const look = (id) => ({ id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: '2468' });
const SMOKE = 'p-smoke-mv4cyiqj-b8bt';

test("a check's id without the secret is refused as a bad id; with it, it is a check", async () => {
  const c = cloud();
  for (const proof of [undefined, '', 'wrong', SECRET.slice(1), `${SECRET}x`]) {
    for (const id of [SMOKE, 'p-e2e-mv4cyiqj-c9cu']) {
      const r = await c.call('POST', 'profiles', { body: look(id), proof });
      assert.deepEqual([r.status, r.data.error], [400, 'id'], `${id} with ${JSON.stringify(proof)}`);
    }
  }
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, 0, 'nothing made');
  const made = await c.call('POST', 'profiles', { body: look(SMOKE), proof: SECRET });
  assert.equal(made.status, 201);
  const { key } = made.data;
  assert.deepEqual(c.env.DB.rows('SELECT name, n FROM counters'), [{ name: 'check-profiles', n: 1 }], "on the checks' own cap");
  // Every route that names the id wants the secret too, even with the profile's key.
  const routes = [
    ['POST', `profiles/${SMOKE}/open`, { pin: '2468' }],
    ['GET', `profiles/${SMOKE}/records`, undefined],
    ['POST', `profiles/${SMOKE}/records`, { put: [] }],
    ['DELETE', `profiles/${SMOKE}`, { pin: '2468' }],
  ];
  for (const [method, path, body] of routes) {
    const r = await c.call(method, path, { key, body });
    assert.deepEqual([r.status, r.data.error], [400, 'id'], `${method} ${path} without the secret`);
  }
  for (const [method, path, body] of routes) {
    const r = await c.call(method, path, { key, body, proof: SECRET });
    assert.equal(r.status, 200, `${method} ${path} with it`);
  }
});

test('an ordinary profile needs no secret, and the secret earns it nothing', async () => {
  const c = cloud();
  assert.equal((await c.call('POST', 'profiles', { body: look('p-kid') })).status, 201);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-kid-2'), proof: SECRET })).status, 201);
  assert.deepEqual(c.env.DB.rows('SELECT name, n FROM counters'), [{ name: 'profiles', n: 2 }], "kids' cap, both");
});

test('a Worker without the secret fails closed: a check id is refused, whatever the request carries; only a test env opts out', async () => {
  for (const secret of [null, '']) {
    const c = cloud(secret);
    for (const proof of [undefined, '', 'wrong']) {
      const r = await c.call('POST', 'profiles', { body: look(SMOKE), proof });
      assert.deepEqual([r.status, r.data.error], [400, 'id'], `CHECKS_KEY ${JSON.stringify(secret)}, proof ${JSON.stringify(proof)}`);
    }
    assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, 0, 'nothing made');
    c.env.ALLOW_UNPROVEN_CHECKS = 'tests';
    const r = await c.call('POST', 'profiles', { body: look(SMOKE) });
    assert.equal(r.status, 201, 'the tests\' own env opts out');
    assert.equal((await c.call('GET', `profiles/${SMOKE}/records`, { key: r.data.key })).status, 200);
  }
});

test('the checks send the secret from the environment, in the header the Worker reads', () => {
  assert.deepEqual(checksHeaders(SECRET), { [CHECKS_HEADER]: SECRET });
  assert.deepEqual(checksHeaders(''), {}, 'no secret: no header');
  // Trimmed, as deploy.yml trims what it puts into the Worker: a pasted newline never splits the two.
  assert.deepEqual(checksHeaders(` ${SECRET}\n`), { [CHECKS_HEADER]: SECRET });
  assert.deepEqual(checksHeaders(' \n'), {}, 'only spaces: no secret');
});
