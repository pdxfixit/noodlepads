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

// PINs anyone would try first: four of one digit, a straight run up or down,
// and this short list of common picks. A PIN is refused when it is made or
// changed (worker/cloud.js, the PIN pad), never when it is typed to open: a
// profile already holding one keeps working. tools/cloud_admin.py reads this
// line for its reset, so keep the list on one line, in single quotes.
export const OBVIOUS_PINS = ['1212', '1122', '1313', '2580', '0852', '1004', '2000', '6969', '1984', '2020'];
export function obviousPin(pin) {
  const d = [...String(pin)].map(Number);
  const steps = new Set(d.slice(1).map((n, i) => n - d[i]));
  return (steps.size === 1 && [...steps].every((s) => s >= -1 && s <= 1)) || OBVIOUS_PINS.includes(pin);
}
// What the pad says when one is refused, here and from the Worker's 400 'pin'.
export const PIN_OBVIOUS = "That PIN is too easy to guess, like 1234 or 0000. Pick four numbers that aren't in a row or all the same.";

export async function hashSecret(secret, saltHex, rounds = PIN_ROUNDS) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}
