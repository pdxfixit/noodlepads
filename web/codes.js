// The cloud's codes and the PIN hash, written once for both ends: the device
// (cloud.js, log-send.js) and the Worker (worker/pin.js, worker/http.js). Pure:
// WebCrypto only, no page, storage or imports, so the Worker can load it.

// Codes people read off a screen: no 0/O or 1/I, so one read aloud off a
// tablet is copied right (share codes, a device's code).
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// A share code as stored: 8 characters of CODE_CHARS, about 40 bits. Shown as
// ABCD-2345 (cloud.js showCode).
export const isShareCode = (v) => typeof v === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(v);
// What someone typed, as stored: capitals, no spaces or dashes.
export const plainCode = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

export const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

// A PIN is hashed with PBKDF2-SHA-256, salted. The Worker's free plan gives a
// request 10 ms of CPU; 20,000 rounds take about 2 ms. The device keeps its own
// check of a PIN (link.check) with the same rounds, and tools/cloud_admin.py
// makes the same hash (tests/pin-hash-python.test.mjs).
export const PIN_ROUNDS = 20_000;

export async function hashSecret(secret, saltHex, rounds = PIN_ROUNDS) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}
