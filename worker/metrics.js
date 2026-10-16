// Player metrics (ADR 0016): which devices use a profile, from where, when,
// which parts of the app, and how each visit went (worker/schema.sql:
// devices, activity, uses, visits). D1 keeps events, counts and visits 14
// days and a device's row 90; `just harvest` copies them first into the
// archive on Ben's Mac, which keeps them for good.
//
// What is kept of a request: the city, region, country and network that
// Cloudflare reads from it (request.cf), never the IP. Of the User-Agent,
// only the browser, OS and device-type families. Of the device's own header
// (X-Noodle-App, web/uses.js appMeta): the app version, a width bucket, touch.
//
// A call without that header (the device's usage switch is off, Ben
// 2026-10-16: off sends nothing) leaves no metrics at all: no device row, no
// event, no counts, no visit (`optedIn`).
//
// Metrics never fail a request: every write is caught. While the tables are
// missing (the migration not yet run), it skips them without a word.

import { USES, WIDTHS, MAX_COUNT } from '../web/uses.js';
import { cleanVisit, MAX_SEND } from '../web/visits.js';
import { utcDay } from './http.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 14 * DAY_MS;          // activity, uses, visits
export const DEVICE_KEEP_MS = 90 * DAY_MS;   // a device's row: its first-seen and sync count
export const KINDS = ['make', 'open', 'pull', 'push', 'share', 'pin', 'pin-wrong'];
// The events that also delete old rows: every one but a pull, the most
// common, so the delete runs often but not on every sync.
const SWEEPS = new Set(['make', 'open', 'push', 'share', 'pin']);
const FIELD = 64;

const missingTable = (err) => /no such table/i.test(String(err?.message ?? err));

// A string from request.cf, or null.
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, FIELD) : null);

// Where a request came from, as Cloudflare saw it. No IP.
export function placeOf(request) {
  const cf = request.cf ?? {};
  return {
    city: text(cf.city),
    region: text(cf.region),
    country: text(cf.country)?.slice(0, 2) ?? null,
    network: text(cf.asOrganization),
    asn: Number.isSafeInteger(cf.asn) && cf.asn > 0 ? cf.asn : null,
  };
}

// The browser, OS and device type a User-Agent names, as families.
// `touch`: the device said it has a touch screen (an iPad asks for the
// desktop site and says "Macintosh").
export function parseAgent(ua, touch = false) {
  const s = typeof ua === 'string' ? ua.slice(0, 512) : '';
  const has = (re) => re.test(s);
  const browser = has(/Edg(e|A|iOS)?\//) ? 'Edge'
    : has(/SamsungBrowser\//) ? 'Samsung'
      : has(/OPR\/|Opera/) ? 'Opera'
        : has(/Firefox\/|FxiOS\//) ? 'Firefox'
          : has(/Chrome\/|CriOS\/|Chromium\//) ? 'Chrome'
            : has(/Safari\//) && has(/Version\//) ? 'Safari'
              : 'Other';
  const ipad = has(/iPad/) || (has(/Macintosh/) && touch);
  const os = has(/iPhone|iPod/) || ipad ? 'iOS'
    : has(/Android/) ? 'Android'
      : has(/CrOS/) ? 'ChromeOS'
        : has(/Windows/) ? 'Windows'
          : has(/Macintosh|Mac OS X/) ? 'macOS'
            : has(/Linux/) ? 'Linux'
              : 'Other';
  const type = ipad || (os === 'Android' && !has(/Mobile/)) || has(/Tablet/) ? 'tablet'
    : has(/iPhone|iPod/) || (os === 'Android' && has(/Mobile/)) || has(/Mobi/) ? 'phone'
      : 'desktop';
  return { browser, os, type };
}

// Whether the device's usage switch is on: it sends X-Noodle-App only then.
export const optedIn = (request) => !!request.headers.get('X-Noodle-App');

// The device's own header (web/uses.js appMeta), each part only if valid.
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
    out.push(DB.prepare(`INSERT INTO activity (at, profile_id, device, kind, city, region, country, network, asn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(now, seen.profile, seen.device ?? null, seen.kind, place.city, place.region, place.country, place.network, place.asn));
    if (SWEEPS.has(seen.kind)) out.push(...sweep(env, now));
    return out;
  }, seen.kind);
}

// Rows past KEEP_MS (a device's past DEVICE_KEEP_MS) go, as reports past
// their expiry do: nothing scheduled.
export function sweep(env, now) {
  const before = now - KEEP_MS;
  return [
    env.DB.prepare('DELETE FROM activity WHERE at < ?').bind(before),
    env.DB.prepare('DELETE FROM devices WHERE last_seen < ?').bind(now - DEVICE_KEEP_MS),
    env.DB.prepare('DELETE FROM uses WHERE day < ?').bind(utcDay(before)),
    env.DB.prepare('DELETE FROM visits WHERE at < ?').bind(before),
  ];
}

// A deleted profile's metrics go with it ("gone from the cloud at once",
// web/privacy.js). The local archive keeps what it copied before.
export const forgetProfile = (env, profile) => quietly(env, () => [
  env.DB.prepare('DELETE FROM activity WHERE profile_id = ?').bind(profile),
  env.DB.prepare('DELETE FROM devices WHERE profile_id = ?').bind(profile),
  env.DB.prepare('DELETE FROM uses WHERE profile_id = ?').bind(profile),
  env.DB.prepare('DELETE FROM visits WHERE profile_id = ?').bind(profile),
], 'delete');

// {uses: {feature: n}} from a device: every name from web/uses.js USES, every
// count a whole number from 1 to MAX_COUNT. Anything else: null.
export function cleanUses(body) {
  const u = body?.uses;
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  const entries = Object.entries(u);
  if (!entries.length || entries.length > USES.length) return null;
  for (const [f, n] of entries) {
    if (!USES.includes(f) || !Number.isInteger(n) || n < 1 || n > MAX_COUNT) return null;
  }
  return Object.fromEntries(entries);
}

// {visits: [...]} from a device (web/visits.js): each visit checked as the
// app checks it, the bad ones dropped, at most MAX_SEND. [] when none.
export function cleanVisits(body, now) {
  const v = body?.visits;
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_SEND).map((x) => cleanVisit(x, now)).filter(Boolean);
}

// Adds a device's counts to today's (UTC) for the profile, stores its
// finished visits, and brings the device's row up to date. Whether they were
// stored: false while the tables are missing, so the device keeps them for
// later. `uses` may be null when only visits came. Without X-Noodle-App
// (the switch off) nothing is stored, and the device is told it went.
export async function addUses(env, request, profile, device, uses, now, visits = []) {
  if (!optedIn(request)) return true;
  const meta = readMeta(request);
  const agent = parseAgent(request.headers.get('User-Agent'), meta.touch);
  return quietly(env, () => [
    env.DB.prepare(`INSERT INTO devices (hash, profile_id, first_seen, last_seen, syncs, app, browser, os, type, width)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      ON CONFLICT (hash) DO UPDATE SET last_seen = excluded.last_seen, app = COALESCE(excluded.app, app),
        browser = excluded.browser, os = excluded.os, type = excluded.type, width = COALESCE(excluded.width, width)`)
      .bind(device, profile, now, now, meta.app, agent.browser, agent.os, agent.type, meta.width),
    ...Object.entries(uses ?? {}).map(([f, n]) => env.DB.prepare(`INSERT INTO uses (profile_id, feature, day, n) VALUES (?, ?, ?, ?)
      ON CONFLICT (profile_id, feature, day) DO UPDATE SET n = n + excluded.n`).bind(profile, f, utcDay(now), n)),
    // The app version is the one sending, which is the one that made the
    // visit unless the page updated in between.
    ...visits.map((v) => env.DB.prepare(`INSERT INTO visits (at, profile_id, device, app, secs, first, screens, level, load_ms, latency_ms, errors, error_sigs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(v.at, profile, device, meta.app, v.secs, v.first, v.screens.join(',') || null, v.level, v.load, v.latency,
        Object.values(v.errors).reduce((a, n) => a + n, 0), Object.keys(v.errors).length ? JSON.stringify(v.errors) : null)),
  ], 'uses');
}
