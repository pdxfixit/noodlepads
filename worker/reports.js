// POST /api/log: a problem report (ADR 0009; on by default since 2026-10-26), checked, cleaned again
// and kept in D1's `reports` table for 14 days. Each report first deletes the
// ones past their expiry, so nothing scheduled is needed. The IP is never
// used or stored: a device may send 10 a minute, the whole site 1,000 a day.

import { cleanUpload, errorCount } from './clean.js';
import { ORIGIN, reply, readCapped, randomId, withinDaily } from './http.js';

export const MAX_BYTES = 64 * 1024;
export const TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const PER_DEVICE_MINUTE = 10;
export const PER_DAY = 1000;

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
    if (!await withinDaily(env, 'reports', PER_DAY, now)) return reply(429, 'Too many reports today');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reports WHERE expires < ?').bind(now),
      env.DB.prepare('INSERT INTO reports (key, device, app, errors, body, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(logKey(now, upload.device), upload.device, upload.app, errorCount(upload), JSON.stringify(upload), now, now + TTL_MS),
    ]);
  } catch (err) {
    console.error('report:', err);
    return reply(503, 'Reports are resting');
  }
  return reply(204);
}
