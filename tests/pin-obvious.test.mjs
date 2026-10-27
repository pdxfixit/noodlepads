// PINs anyone would try first (web/codes.js obviousPin: four of one digit, a
// straight run, a short list of common picks) are refused when a PIN is made
// or changed, by the Worker (400 pin) and, in plain words, on the app's pad.
// One list serves the Worker, the app and the reset tool
// (tools/cloud_admin.py obvious_pin reads it from web/codes.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { obviousPin, OBVIOUS_PINS, PIN_OBVIOUS, hashSecret } from '../web/codes.js';
import { cloudTrouble, CloudError } from '../web/cloud-api.js';
import { FakeD1 } from './fake-d1.mjs';

test('which PINs are obvious', () => {
  for (const pin of ['0000', '1111', '9999', '1234', '4321', '2345', '8765', '0123', '2580', '1212', '2020']) assert.equal(obviousPin(pin), true, pin);
  for (const pin of ['2468', '1357', '0517', '1235', '9875', '7391']) assert.equal(obviousPin(pin), false, pin);
  assert.ok(OBVIOUS_PINS.every((p) => /^\d{4}$/.test(p)));
  let count = 0;
  for (let n = 0; n < 10_000; n++) if (obviousPin(String(n).padStart(4, '0'))) count++;
  assert.ok(count < 50, 'the list stays short');
});

test('the reset tool and the app agree on all 10,000 PINs', () => {
  const py = spawnSync('python3', ['-I', '-c', [
    'import sys; sys.path.insert(0, "tools"); import cloud_admin as ca',
    'print(",".join(f"{n:04d}" for n in range(10000) if ca.obvious_pin(f"{n:04d}")))',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  const js = [];
  for (let n = 0; n < 10_000; n++) if (obviousPin(String(n).padStart(4, '0'))) js.push(String(n).padStart(4, '0'));
  assert.equal(py.stdout.trim(), js.join(','));
});

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  const call = async (method, path, { body, key } = {}) => {
    const headers = { Origin: ORIGIN };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    return { status: res.status, data: await res.json() };
  };
  return { env, call };
}
const look = (id, pin) => ({ id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin });

test('the Worker refuses an obvious PIN when a profile is made, and when the PIN is changed', async () => {
  const c = cloud();
  for (const pin of ['1234', '0000', '4321', '2580', '1212']) {
    const r = await c.call('POST', 'profiles', { body: look('p-a', pin) });
    assert.deepEqual([r.status, r.data.error], [400, 'pin'], pin);
  }
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, 0, 'nothing made');
  const made = await c.call('POST', 'profiles', { body: look('p-a', '2468') });
  assert.equal(made.status, 201);
  const { key } = made.data;
  for (const newPin of ['1234', '7777']) {
    const r = await c.call('PATCH', 'profiles/p-a', { key, body: { pin: '2468', newPin } });
    assert.deepEqual([r.status, r.data.error], [400, 'pin'], newPin);
  }
  assert.equal((await c.call('POST', 'profiles/p-a/open', { body: { pin: '2468' } })).status, 200, 'the PIN is unchanged');
  assert.equal((await c.call('PATCH', 'profiles/p-a', { key, body: { pin: '2468', newPin: '1357' } })).status, 200);
});

test('a PIN already in use that is obvious still opens: only making and changing are refused', async () => {
  const c = cloud();
  await c.call('POST', 'profiles', { body: look('p-b', '2468') });
  const salt = 'ab'.repeat(16);
  c.env.DB.db.prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(await hashSecret('1234', salt), salt, 'p-b');
  assert.equal((await c.call('POST', 'profiles/p-b/open', { body: { pin: '1234' } })).status, 200);
});

test('the app says why in plain words', () => {
  const said = cloudTrouble(new CloudError(400, { error: 'pin' }));
  assert.equal(said, PIN_OBVIOUS);
  assert.match(PIN_OBVIOUS, /too easy to guess/);
});
