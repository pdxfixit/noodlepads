// POST /api/log: an opt-in problem report (ADR 0009), checked, cleaned again
// and kept in D1's `reports` table for 14 days. Each report first deletes the
// ones past their expiry, and so does every make, open, pull, push, share and
// PIN change, and every look at the profile list (worker/metrics.js
// expireReports): nothing is scheduled. The IP is never
// used or stored: a device may send 10 a minute; the whole site 1,000 routine
// reports a day, and 1,000 holding an error or a silent tap, a share of their own;
// and all kept reports together at most 40 MB.

import { cleanUpload, errorCount } from './clean.js';
import { ORIGIN, reply, readCapped, randomId, withinDaily } from './http.js';

export const MAX_BYTES = 64 * 1024;
export const TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const PER_DEVICE_MINUTE = 10;
export const PER_DAY = 1000;
// A report holding an error or a silent tap (web/tap-watch.js) counts against
// a daily share of its own, so routine reports sent as pages hide never crowd
// one out (Ben, 2026-10-26). Still capped: device codes are the sender's word.
export const PROBLEMS_PER_DAY = 1000;
// All kept reports together, whatever their share: a flood of made-up ones
// can never take room the kids' sounds need (cloud.js LIMITS, 400 MB of the
// free plan's 500 MB).
export const MAX_STORED_BYTES = 40 * 1024 * 1024;
export const isProblem = (upload) => upload.entries.some((e) => e.kind === 'error' || e.kind === 'tap');

// Key: <ISO time>_<device>_<random>. Sorted by time, so a listing reads in order.
export const logKey = (now, device) => `${new Date(now).toISOString()}_${device}_${randomId(5)}`;

export async function handleLog(request, env, now = Date.now()) {
  if (request.method !== 'POST') return new Response('Use POST\n', { status: 405, headers: { 'Cache-Control': 'no-store', Allow: 'POST' } });
  if (!env.DB) return reply(503, 'Problem reports are not set up');
  if (request.headers.get('Origin') !== ORIGIN) return reply(403, 'Wrong origin');
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return reply(415, 'Send JSON');

  const text = await readCapped(request, MAX_BYTES);
  if (text === null) return reply(413, 'Too big');
  let body;
  try { body = JSON.parse(text); } catch { return reply(400, 'Not JSON'); }
  const result = cleanUpload(body);
  if (!result.ok) return reply(400, `Not a problem report: ${result.why}`);
  const { upload } = result;

  try {
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE device = ? AND created > ?')
      .bind(upload.device, now - 60_000).first();
    if (recent.n >= PER_DEVICE_MINUTE) return reply(429, 'Too many reports');
    const [counter, cap] = isProblem(upload) ? ['reports-problems', PROBLEMS_PER_DAY] : ['reports', PER_DAY];
    if (!await withinDaily(env, counter, cap, now)) return reply(429, 'Too many reports today');
    const body = JSON.stringify(upload);
    const stored = await env.DB.prepare('SELECT COALESCE(SUM(LENGTH(body)), 0) AS bytes FROM reports WHERE expires >= ?').bind(now).first();
    if (stored.bytes + body.length > MAX_STORED_BYTES) return reply(507, 'Reports are full');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reports WHERE expires < ?').bind(now),
      env.DB.prepare('INSERT INTO reports (key, device, app, errors, body, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(logKey(now, upload.device), upload.device, upload.app, errorCount(upload), body, now, now + TTL_MS),
    ]);
  } catch (err) {
    console.error('report:', err);
    return reply(503, 'Reports are resting');
  }
  return reply(204);
}
