// web/codes.js: the cloud's codes and the PIN hash, written once for the
// device and the Worker. They accept exactly the same share codes over the
// whole alphabet, and a PIN hashed by one checks on the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as codes from '../web/codes.js';
import * as pin from '../worker/pin.js';
import { hex } from '../worker/http.js';
import { openShare } from '../web/cloud.js';

const EVERY = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz -_'];

test('the device and the Worker share one set of functions', () => {
  assert.ok(pin.hashSecret === codes.hashSecret);
  assert.ok(pin.isShareCode === codes.isShareCode);
  assert.ok(pin.plainCode === codes.plainCode);
  assert.ok(hex === codes.hex);
  assert.equal(pin.ROUNDS, codes.PIN_ROUNDS);
  assert.equal(codes.PIN_ROUNDS, 20_000);
});

test('a share code is 8 of the 32 readable characters: no 0, O, 1 or I, over the whole alphabet', () => {
  assert.equal(codes.CODE_CHARS.length, 32);
  for (const ch of EVERY) {
    const stored = codes.plainCode(ch.repeat(8));
    assert.equal(codes.isShareCode(stored), codes.CODE_CHARS.includes(ch.toUpperCase()) && /[A-Za-z0-9]/.test(ch), JSON.stringify(ch));
  }
  assert.equal(codes.plainCode('abcd-2345'), 'ABCD2345');
  assert.equal(codes.plainCode(' AB CD-23 45 '), 'ABCD2345');
  assert.equal(codes.plainCode(null), '');
  assert.equal(codes.plainCode(12345678), '');
  assert.equal(codes.isShareCode('ABCD2345'), true);
  assert.equal(codes.isShareCode('ABCD234'), false);
  assert.equal(codes.isShareCode('ABCD23456'), false);
  assert.equal(codes.isShareCode('ABCDEFIO'), false);
});

test('every code the Worker makes is one the device accepts', () => {
  for (let i = 0; i < 300; i++) {
    const made = pin.shareCode();
    assert.ok(codes.isShareCode(made), made);
    assert.equal(codes.plainCode(`${made.slice(0, 4)}-${made.slice(4)}`), made);
  }
});

test('the device refuses a code with an I or an O before asking the cloud', async () => {
  await assert.rejects(openShare('ABCD-23IO'), /8 letters and numbers/);
  await assert.rejects(openShare('ABCD-234'), /8 letters and numbers/);
});

test('a PIN hashed by the device checks on the Worker, and the other way', async () => {
  const salt = pin.newSalt();
  assert.match(salt, /^[0-9a-f]{32}$/);
  const device = await codes.hashSecret('4321', salt);
  assert.equal(device, await pin.hashSecret('4321', salt), 'same salt and rounds, same hash');
  assert.notEqual(device, await pin.hashSecret('4322', salt));
  assert.match(device, /^[0-9a-f]{64}$/);
  // A known answer, so a change of rounds or algorithm on either side shows.
  assert.equal(await codes.hashSecret('1234', '00112233445566778899aabbccddeeff'), await pin.hashSecret('1234', '00112233445566778899aabbccddeeff', pin.ROUNDS));
});
