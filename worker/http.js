// Small pieces every route shares: answers, reading a body with a cap, ids,
// hashes, and the daily counters that keep the site on the free plan.

export const ORIGIN = 'https://noodlepads.com';
export const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function reply(status, text = '') {
  return new Response(status === 204 ? null : `${text}\n`, {
    status,
    headers: status === 204 ? HEADERS : { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// An error the app can act on: {error: why, ...more}.
export const fail = (status, why, more = {}) => json(status, { error: why, ...more });

// Thrown inside a route to answer with `fail` from anywhere.
export class Refuse extends Error {
  constructor(status, why, more = {}) { super(why); this.status = status; this.why = why; this.more = more; }
}

// The body as bytes, or null when it is over `max` bytes. Stops reading at
// the limit, so a huge body is never held in memory.
export async function readBytes(request, max) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return all;
}

export async function readCapped(request, max) {
  const bytes = await readBytes(request, max);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

// A JSON body from the site's own page: the Origin, the type and the size are
// checked, and anything else is refused.
export async function readJson(request, max = 64 * 1024) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new Refuse(415, 'type');
  const text = await readCapped(request, max);
  if (text === null) throw new Refuse(413, 'size');
  try {
    const value = JSON.parse(text || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new Refuse(400, 'json');
  }
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

// `bytes` random bytes as base32 (lowercase letters and 2–7).
export function randomId(bytes = 16) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of raw) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

// HMAC-SHA256 of `text` under `key` (a string), as hex.
export async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
}

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// D1 hands a BLOB back as an ArrayBuffer or an array of numbers, depending on
// the call; the fake gives a Uint8Array. All three become a Uint8Array.
export function toBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v);
  return new Uint8Array(0);
}

export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

// Counts one more `name` today (UTC) and says whether that is within `limit`.
// One write each; old days' rows are left (one a day per counter).
export async function withinDaily(env, name, limit, now) {
  const row = await env.DB.prepare(
    'INSERT INTO counters (name, day, n) VALUES (?, ?, 1) ON CONFLICT (name, day) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(name, utcDay(now)).first();
  return (row?.n ?? 1) <= limit;
}
