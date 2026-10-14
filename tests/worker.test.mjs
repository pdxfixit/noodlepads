// The Worker's /api/log route and its routing, against a fake D1 on Node's
// own SQLite (fake-d1.mjs) and a stand-in for the static assets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ORIGIN, MAX_BYTES, TTL_MS, handleLog } from '../worker/index.js';
import { FakeD1 } from './fake-d1.mjs';

function fakeEnv() {
  const assets = [];
  return {
    assets,
    DB: new FakeD1(),
    ASSETS: { fetch: async (req) => { assets.push(new URL(req.url).pathname); return new Response('asset', { status: 200 }); } },
  };
}

const reports = (env) => env.DB.rows('SELECT * FROM reports ORDER BY key');

const upload = (extra = {}) => ({
  format: 1, app: '3e7f681 2026-10-11', device: 'K7Q4-M2XD', session: 's-9f3a', sent: '2026-10-11T19:42:07Z',
  env: { ua: 'Mozilla/5.0 (Linux; Android 14; SM-X200)', screen: [800, 1280], dpr: 1.5, tz: 'America/Los_Angeles',
    audio: { sampleRate: 48000, baseLatencyMs: 10.7, state: 'running' } },
  settings: { advancedBeats: true, timeSignature: '4/4' },
  counts: { people: 3, sounds: 41 },
  dropped: 0,
  entries: [
    { t: 95012, kind: 'error', data: { message: 'Failed to decode audio data', source: 'audio.js', line: 231 } },
    { t: 97400, kind: 'beat', data: { action: 'stop', seconds: 16.2, hits: 88 } },
  ],
  ...extra,
});

function post(body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://noodlepads.com/api/log', {
    method: 'POST', body: text,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers },
  });
}

test('a good report is cleaned and kept in D1 for 30 days, keyed by time and device', async () => {
  const env = fakeEnv();
  const now = Date.parse('2026-10-11T19:42:08.123Z');
  const res = await handleLog(post(upload()), env, now);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const [row, ...rest] = reports(env);
  assert.equal(rest.length, 0);
  assert.match(row.key, /^2026-10-11T19:42:08\.123Z_K7Q4-M2XD_[a-z2-7]{8}$/);
  assert.equal(row.expires - row.created, TTL_MS);
  assert.equal(TTL_MS, 30 * 86400000);
  assert.deepEqual([row.app, row.device, row.errors], ['3e7f681 2026-10-11', 'K7Q4-M2XD', 1]);
  const value = JSON.parse(row.body);
  assert.equal(value.entries.length, 2);
  assert.equal(value.entries[0].data.message, 'Failed to decode audio data');
});

test('the IP is never stored', async () => {
  const env = fakeEnv();
  await handleLog(post(upload()), env);
  assert.ok(!JSON.stringify(reports(env)).includes('203.0.113.9'));
});

test('a report deletes the expired ones first: no scheduled job', async () => {
  const env = fakeEnv();
  const day = 86400000;
  const t0 = Date.parse('2026-10-01T00:00:00Z');
  await handleLog(post(upload()), env, t0);
  await handleLog(post(upload({ device: 'AAAA-BBBB' })), env, t0 + 29 * day);
  assert.equal(reports(env).length, 2);
  await handleLog(post(upload({ device: 'CCCC-DDDD' })), env, t0 + 31 * day);
  assert.deepEqual(reports(env).map((r) => r.device), ['AAAA-BBBB', 'CCCC-DDDD']);
});

test('10 a minute from one device, then 429; another device still sends', async () => {
  const env = fakeEnv();
  const now = Date.parse('2026-10-11T12:00:00Z');
  for (let i = 0; i < 10; i++) assert.equal((await handleLog(post(upload()), env, now + i)).status, 204);
  assert.equal((await handleLog(post(upload()), env, now + 20)).status, 429);
  assert.equal((await handleLog(post(upload({ device: 'AAAA-BBBB' })), env, now + 30)).status, 204);
  assert.equal((await handleLog(post(upload()), env, now + 61_000)).status, 204, 'a minute later it may send again');
});

test('1,000 a day for the whole site, then 429 until the next UTC day', async () => {
  const env = fakeEnv();
  const now = Date.parse('2026-10-11T12:00:00Z');
  env.DB.db.prepare("INSERT INTO counters (name, day, n) VALUES ('reports', '2026-10-11', 1000)").run();
  assert.equal((await handleLog(post(upload()), env, now)).status, 429);
  assert.equal((await handleLog(post(upload()), env, now + 86400000)).status, 204);
});

test('another site’s page cannot post: wrong or missing Origin is 403', async () => {
  for (const origin of ['https://evil.example', 'http://noodlepads.com', '']) {
    const env = fakeEnv();
    const res = await handleLog(post(upload(), { Origin: origin }), env);
    assert.equal(res.status, 403, String(origin));
    assert.equal(reports(env).length, 0);
  }
});

test('only JSON is accepted', async () => {
  const env = fakeEnv();
  assert.equal((await handleLog(post(upload(), { 'Content-Type': 'text/plain' }), env)).status, 415);
  assert.equal((await handleLog(post('{not json'), env)).status, 400);
  assert.equal(reports(env).length, 0);
});

test('a body over 64 KB is refused, whatever Content-Length says', async () => {
  const env = fakeEnv();
  const big = upload({ entries: [{ t: 1, kind: 'notice', data: { text: 'x'.repeat(MAX_BYTES) } }] });
  assert.equal((await handleLog(post(big), env)).status, 413);
  const chunk = new TextEncoder().encode('x'.repeat(16 * 1024));
  let sent = 0;
  const stream = new ReadableStream({ pull(c) { if (sent++ < 6) c.enqueue(chunk); else c.close(); } });
  const req = new Request('https://noodlepads.com/api/log', {
    method: 'POST', body: stream, duplex: 'half',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
  });
  assert.equal((await handleLog(req, env)).status, 413);
  assert.equal(reports(env).length, 0);
});

test('junk that is not the app’s format is refused', async () => {
  const env = fakeEnv();
  for (const body of [[], 'hello', { format: 2, device: 'K7Q4-M2XD', entries: [] },
    upload({ device: 'buy my stuff' }), upload({ device: undefined }), upload({ entries: 'x' })]) {
    assert.equal((await handleLog(post(body), env)).status, 400, JSON.stringify(body));
  }
  assert.equal(reports(env).length, 0);
});

test('only POST', async () => {
  const res = await handleLog(new Request('https://noodlepads.com/api/log'), fakeEnv());
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});

test('without the database the route says so; a resting database is 503, not a crash', async () => {
  assert.equal((await handleLog(post(upload()), { ASSETS: fakeEnv().ASSETS })).status, 503);
  const env = fakeEnv();
  env.DB.fail = 'D1_ERROR: daily limit exceeded';
  assert.equal((await handleLog(post(upload()), env)).status, 503);
});

test('every other path goes to the static assets; /api/ paths go to the cloud routes', async () => {
  const env = fakeEnv();
  for (const path of ['/', '/index.html', '/clips/kit/kick.wav', '/no-such-file', '/apiary']) {
    const res = await worker.fetch(new Request(`https://noodlepads.com${path}`), env);
    assert.equal(await res.text(), 'asset', path);
  }
  assert.deepEqual(env.assets, ['/', '/index.html', '/clips/kit/kick.wav', '/no-such-file', '/apiary']);
  assert.equal((await worker.fetch(new Request('https://noodlepads.com/api/other'), env)).status, 404);
  const hello = await worker.fetch(new Request('https://noodlepads.com/api/cloud'), env);
  assert.equal(hello.status, 200);
  assert.equal((await hello.json()).ok, true);
  assert.equal((await worker.fetch(post(upload()), env)).status, 204);
});
