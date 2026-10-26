// `just cloud-reset-pin … --to 1234` sets a PIN from Python (tools/cloud_admin.py
// pin_hash); the Worker checks it in JavaScript (worker/pin.js hashSecret). The
// two must make the same hash, or the new PIN would never open the profile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { hashSecret, ROUNDS } from '../worker/pin.js';

const tools = new URL('../tools/', import.meta.url).pathname;
const python = (pin, salt) => execFileSync('python3', ['-c',
  `import sys; sys.path.insert(0, ${JSON.stringify(tools)}); import cloud_admin; print(cloud_admin.PIN_ROUNDS, cloud_admin.pin_hash(sys.argv[1], sys.argv[2]))`,
  pin, salt]).toString().trim().split(' ');

test('a PIN hashed by cloud_admin.py is the one the Worker checks', async () => {
  for (const [pin, salt] of [['1234', '00112233445566778899aabbccddeeff'], ['0000', 'f0e1d2c3b4a5968778695a4b3c2d1e0f']]) {
    const [rounds, hash] = python(pin, salt);
    assert.equal(Number(rounds), ROUNDS, 'the same number of rounds');
    assert.equal(hash, await hashSecret(pin, salt));
  }
});
