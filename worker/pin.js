// PINs: a salted slow hash (PBKDF2-SHA-256 through WebCrypto), and the
// wrong-try rule: 5 wrong in a row, then a 10-minute wait, kept in D1 on the
// profile being guessed. And share codes, which people read off a screen.
//
// A 4-digit PIN has 10,000 values; no hash makes that hard to try offline.
// The hash keeps the PIN out of the table as plain digits; the waits are what
// slow down guessing through the site: 2,000 waits of 10 minutes, about two
// weeks, to try them all.

import { hex, hashSecret, isShareCode, plainCode, PIN_ROUNDS, CODE_CHARS } from '../web/codes.js';

// The hash, the rounds and the share code rules are web/codes.js (the device's too).
export { hashSecret, isShareCode, plainCode };
export const ROUNDS = PIN_ROUNDS;
export const TRIES = 5;
export const WAIT_MS = 10 * 60 * 1000;

export const isPin = (v) => typeof v === 'string' && /^\d{4}$/.test(v);

export function newSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

// Same length, every byte compared, so the time taken says nothing.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const wait = (until, now) => ({ ok: false, wait: Math.ceil((until - now) / 1000) });

// Which pair of a profile's columns a try is counted in. Opening a profile
// (anyone, no key) counts in `fails` / `locked_until`; a request that carries a
// key (Change PIN, Delete) in `key_fails` / `key_locked_until`, so a stranger's
// wrong tries at /open never lock out a device that has the key. The names are
// fixed here, never from a request.
export const OPENING = { fails: 'fails', until: 'locked_until' };
export const KEYED = { fails: 'key_fails', until: 'key_locked_until' };

// Checks `given` against a profile's PIN (`row`: {id, hash, salt}), and
// records the try in `cols`. Returns {ok: true}, {ok: false, wait} (seconds to
// wait) or {ok: false, tries} (tries left before a wait).
//
// The try is counted first, in one UPDATE that hands back the new count, and
// only then is the PIN compared: requests sent all at once each get their own
// number, so no more than TRIES of them are ever compared in a window. (Read
// first and written after, every one of them read the same count.)
export async function checkSecret(db, row, given, now, cols = OPENING) {
  const { fails: F, until: U } = cols;
  const counted = await db.prepare(`UPDATE profiles SET ${F} = ${F} + 1
    WHERE id = ? AND ${U} <= ? RETURNING ${F} AS fails`).bind(row.id, now).first();
  if (!counted) {
    const locked = await db.prepare(`SELECT ${U} AS until FROM profiles WHERE id = ?`).bind(row.id).first();
    return wait(locked?.until ?? now + WAIT_MS, now);
  }
  const lock = () => db.prepare(`UPDATE profiles SET ${F} = 0, ${U} = ? WHERE id = ? AND ${U} <= ?`)
    .bind(now + WAIT_MS, row.id, now).run();
  // Past the last try of this window: the wait starts, with no compare.
  if (counted.fails > TRIES) {
    await lock();
    return wait(now + WAIT_MS, now);
  }
  const right = typeof given === 'string' && given.length <= 64 && same(await hashSecret(given, row.salt), row.hash);
  if (right) {
    await db.prepare(`UPDATE profiles SET ${F} = 0 WHERE id = ?`).bind(row.id).run();
    return { ok: true };
  }
  if (counted.fails >= TRIES) {
    await lock();
    return wait(now + WAIT_MS, now);
  }
  return { ok: false, tries: TRIES - counted.fails };
}

// Codes people read off a screen (web/codes.js CODE_CHARS).
export function code(length) {
  const raw = crypto.getRandomValues(new Uint8Array(length));
  return [...raw].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// A share code as stored: 8 characters, about 40 bits. Shown as ABCD-2345.
export const shareCode = () => code(8);
