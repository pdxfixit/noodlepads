// Player metrics (ADR 0016, narrowed by ADR 0027): which devices use a
// profile, from where, and when (worker/schema.sql: devices, activity). The
// feature-use counts and visit summaries it once also kept (uses, visits)
// went with ADR 0027; the shared telemetry events (ADR 0026) cover them. D1
// keeps events 14 days and a device's row 90; the telemetry runner copies
// them first, and keeps them for good.
//
// What is kept of a request: the country Cloudflare reads from it
// (request.cf), and no finer place (Ben, 2026-10-16: country only), never
// the IP. Of the User-Agent,
// only the browser, OS and device-type families. Of the device's own header
// (X-Noodle-App, web/device-meta.js appMeta): the app version, a width bucket, touch.
//
// A call without that header (the device's usage switch is off, Ben
// 2026-10-16: off sends nothing) leaves no metrics at all: no device row, no
// event (`optedIn`).
//
// Metrics never fail a request: every write is caught. While the tables are
// missing (the migration not yet run), it skips them without a word.

import { WIDTHS } from '../web/device-meta.js';
import { parseAgent } from '../web/agent.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 14 * DAY_MS;          // activity
export const DEVICE_KEEP_MS = 90 * DAY_MS;   // a device's row: its first-seen and sync count
export const KINDS = ['make', 'open', 'pull', 'push', 'share', 'pin', 'pin-wrong'];
// The events that also delete old rows: every one but a pull, the most
// common, so the delete runs often but not on every sync.
const SWEEPS = new Set(['make', 'open', 'push', 'share', 'pin']);
const FIELD = 64;

const missingTable = (err) => /no such table/i.test(String(err?.message ?? err));

// A string from request.cf, or null.
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, FIELD) : null);

// Where a request came from, as Cloudflare saw it: the country alone.
export function placeOf(request) {
  const cf = request.cf ?? {};
  return { country: text(cf.country)?.slice(0, 2) ?? null };
}

// The browser, OS and device type a User-Agent names, as families: the same
// rules problem reports use (web/agent.js).
export { parseAgent };

// Whether the device's usage switch is on: it sends X-Noodle-App only then.
export const optedIn = (request) => !!request.headers.get('X-Noodle-App');

// The device's own header (web/device-meta.js appMeta), each part only if valid.
export function readMeta(request) {
  const raw = request.headers.get('X-Noodle-App') ?? '';
  const p = new URLSearchParams(raw.slice(0, 200));
  const v = p.get('v');
  const w = Number(p.get('w'));
  return {
    app: v && /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : null,
    width: WIDTHS.includes(w) && w > 0 ? w : null,
    touch: p.get('t') === '1',
  };
}

// Runs `statements()` as one batch; a missing table skips quietly, any other
// trouble is logged. Never throws. Returns whether it ran.
async function quietly(env, statements, why) {
  try {
    await env.DB.batch(statements());
    return true;
  } catch (err) {
    if (!missingTable(err)) console.error(`metrics (${why}):`, err);
    return false;
  }
}

// One event: the device's row (made or brought up to date) and a row in the
// activity log. `seen`: {kind, profile, device, was?}; `was` is the device's
// key before a new PIN gave it another, so it stays one device.
export async function noteEvent(env, request, seen, now) {
  if (!KINDS.includes(seen?.kind) || typeof seen.profile !== 'string') return false;
  if (seen.kind !== 'pin-wrong') await expireReports(env, now);
  // Switched off: nothing noted, but old rows still go on time.
  if (!optedIn(request)) return SWEEPS.has(seen.kind) ? quietly(env, () => sweep(env, now), 'sweep') : false;
  const place = placeOf(request);
  const meta = readMeta(request);
  const agent = parseAgent(request.headers.get('User-Agent'), meta.touch);
  return quietly(env, () => {
    const out = [];
    const { DB } = env;
    if (seen.device) {
      if (seen.was) out.push(DB.prepare('UPDATE devices SET hash = ? WHERE hash = ?').bind(seen.device, seen.was));
      out.push(DB.prepare(`INSERT INTO devices (hash, profile_id, first_seen, last_seen, syncs, app, browser, os, type, width)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (hash) DO UPDATE SET last_seen = excluded.last_seen, syncs = syncs + excluded.syncs,
          app = COALESCE(excluded.app, app), browser = excluded.browser, os = excluded.os, type = excluded.type,
          width = COALESCE(excluded.width, width)`)
        .bind(seen.device, seen.profile, now, now, seen.kind === 'pull' ? 1 : 0, meta.app, agent.browser, agent.os, agent.type, meta.width));
    }
    out.push(DB.prepare(`INSERT INTO activity (at, profile_id, device, kind, country)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(now, seen.profile, seen.device ?? null, seen.kind, place.country));
    if (SWEEPS.has(seen.kind)) out.push(...sweep(env, now));
    return out;
  }, seen.kind);
}

// Rows past KEEP_MS (a device's past DEVICE_KEEP_MS) go: nothing scheduled.
export function sweep(env, now) {
  const before = now - KEEP_MS;
  return [
    env.DB.prepare('DELETE FROM activity WHERE at < ?').bind(before),
    env.DB.prepare('DELETE FROM devices WHERE last_seen < ?').bind(now - DEVICE_KEEP_MS),
  ];
}

// Problem reports past their expiry go on every make, open, pull, push,
// share and PIN change, and on a look at the profile list (cloud.js
// handleCloud), in a query of their own, so trouble with the metrics tables
// never keeps one. reports.js deletes them too, when the next report arrives;
// with these, one goes about 14 days on, once the site is next used. Nothing
// is scheduled. Each delete that finds some says how many in the Worker's
// log. Returns how many went; never throws.
export async function expireReports(env, now) {
  try {
    const res = await env.DB.prepare('DELETE FROM reports WHERE expires < ?').bind(now).run();
    const gone = Number(res?.meta?.changes ?? 0);
    if (gone) console.log(`reports: ${gone} expired, deleted`);
    return gone;
  } catch (err) {
    if (!missingTable(err)) console.error('metrics (reports):', err);
    return 0;
  }
}

// A deleted profile's metrics go with it ("gone from the cloud at once",
// web/privacy.js). The local archive keeps what it copied before.
export const forgetProfile = (env, profile) => quietly(env, () => [
  env.DB.prepare('DELETE FROM activity WHERE profile_id = ?').bind(profile),
  env.DB.prepare('DELETE FROM devices WHERE profile_id = ?').bind(profile),
], 'delete');

