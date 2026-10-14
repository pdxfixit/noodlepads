// Player metrics in the Worker (worker/metrics.js, ADR 0016), against a fake
// D1 with the real schema: each device's row, the activity log with its
// place, the keyed IP hash (never the IP), the User-Agent read as families
// (never kept), feature-use counts, 90 days kept, and a Worker that keeps
// working while the tables are missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { parseAgent, ipHash, placeOf, KEEP_MS } from '../worker/metrics.js';
import { appMeta, USES } from '../web/uses.js';
import { FakeD1 } from './fake-d1.mjs';

const T0 = Date.parse('2026-10-12T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'a-test-secret-for-the-ip-hash-0123';
const IP = '203.0.113.77';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PORTLAND = { city: 'Portland', region: 'Oregon', country: 'US', asOrganization: 'Comcast Cable', asn: 7922 };
const SEATTLE = { city: 'Seattle', region: 'Washington', country: 'US', asOrganization: 'T-Mobile USA', asn: 21928 };

function cloud({ secret = SECRET } = {}) {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') }, ...(secret ? { IP_KEY: secret } : {}) };
  let now = T0;
  const realNow = Date.now;
  const call = async (method, path, { body, key, cf = PORTLAND, ip = IP, ua = IPHONE, meta = appMeta('7b5fc5e', 390, true) } = {}) => {
    const headers = { Origin: ORIGIN, 'CF-Connecting-IP': ip, 'User-Agent': ua, 'X-Noodle-App': meta };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const req = new Request(`https://noodlepads.com/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    Object.defineProperty(req, 'cf', { value: cf });   // as Cloudflare adds it
    Date.now = () => now;
    try {
      return await worker.fetch(req, env);
    } finally {
      Date.now = realNow;
    }
  };
  return { env, call, at: (t) => { now = t; } };
}

const make = async (call, id = 'p-a', pin) => (await (await call('POST', 'profiles', {
  body: { id, name: 'Sir Squid', avatar: '', color: '#1F3FA8', ...(pin ? { pin } : {}) },
})).json()).key;

test('the User-Agent is read as browser, OS and device type families', () => {
  const cases = [
    [IPHONE, false, { browser: 'Safari', os: 'iOS', type: 'phone' }],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', false, { browser: 'Chrome', os: 'iOS', type: 'tablet' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', true, { browser: 'Safari', os: 'iOS', type: 'tablet' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', false, { browser: 'Safari', os: 'macOS', type: 'desktop' }],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', true, { browser: 'Chrome', os: 'Android', type: 'phone' }],
    ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36', true, { browser: 'Samsung', os: 'Android', type: 'tablet' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0', false, { browser: 'Edge', os: 'Windows', type: 'desktop' }],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', false, { browser: 'Chrome', os: 'ChromeOS', type: 'desktop' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', false, { browser: 'Firefox', os: 'Linux', type: 'desktop' }],
    ['', false, { browser: 'Other', os: 'Other', type: 'desktop' }],
    [null, false, { browser: 'Other', os: 'Other', type: 'desktop' }],
  ];
  for (const [ua, touch, want] of cases) assert.deepEqual(parseAgent(ua, touch), want, ua);
});

test('the IP hash is keyed: the same IP matches, the IP can\'t be read from it, and no secret means no hash', async () => {
  const h = await ipHash(IP, SECRET);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(await ipHash(IP, SECRET), h, 'the same IP, the same hash');
  assert.notEqual(await ipHash('203.0.113.78', SECRET), h);
  assert.notEqual(await ipHash(IP, `${SECRET}-other`), h, 'another secret, another hash');
  const plain = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(IP)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.ok(!plain.startsWith(h), 'not a plain SHA-256, which anyone could match by trying every address');
  assert.equal(await ipHash(IP, undefined), null);
  assert.equal(await ipHash(IP, 'short'), null, 'a secret too short to trust is no secret');
  assert.equal(await ipHash(null, SECRET), null);
});

test('the place is what Cloudflare read from the request, capped, and no IP', () => {
  const req = new Request('https://noodlepads.com/api/cloud');
  Object.defineProperty(req, 'cf', { value: { ...PORTLAND, city: 'x'.repeat(200), country: 'USA', asn: 'nope', clientIp: IP, latitude: '45.5' } });
  const p = placeOf(req);
  assert.deepEqual(Object.keys(p), ['city', 'region', 'country', 'network', 'asn']);
  assert.equal(p.city.length, 64);
  assert.equal(p.country, 'US');
  assert.equal(p.asn, null);
  assert.deepEqual(placeOf(new Request('https://noodlepads.com/')), { city: null, region: null, country: null, network: null, asn: null });
});

test('make, open, pull, push and share each log one event with its place; the device keeps its families and counts its syncs', async () => {
  const { env, call } = cloud();
  const key = await make(call);
  assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key })).status, 200);
  assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key, cf: SEATTLE, ip: '198.51.100.9' })).status, 200);
  assert.equal((await call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-1', body: { name: 'x' } }], del: [] } })).status, 200);
  assert.equal((await call('POST', 'profiles/p-a/shares', { key, body: { kind: 'beat', title: 'Taco', bundle: { beats: [{ id: 'beat-1' }] } } })).status, 201);
  const other = (await (await call('POST', 'profiles/p-a/open', { body: { remember: true }, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36', meta: appMeta('abc', 1920, false) })).json()).key;
  assert.ok(other);

  const acts = env.DB.rows('SELECT kind, device, city, region, country, network, asn, ip_hash FROM activity ORDER BY id');
  assert.deepEqual(acts.map((a) => a.kind), ['make', 'pull', 'pull', 'push', 'share', 'open']);
  assert.deepEqual([acts[0].city, acts[0].region, acts[0].country, acts[0].network, acts[0].asn], ['Portland', 'Oregon', 'US', 'Comcast Cable', 7922]);
  assert.equal(acts[2].city, 'Seattle');
  assert.equal(acts[0].ip_hash, await ipHash(IP, SECRET));
  assert.notEqual(acts[2].ip_hash, acts[0].ip_hash);
  assert.equal(new Set(acts.slice(0, 5).map((a) => a.device)).size, 1, 'one device until the open');
  assert.notEqual(acts[5].device, acts[0].device, 'another key, another device');

  const devices = env.DB.rows('SELECT * FROM devices ORDER BY first_seen, browser');
  assert.equal(devices.length, 2);
  const phone = devices.find((d) => d.hash === acts[0].device);
  assert.deepEqual({ ...phone, hash: undefined }, {
    hash: undefined, profile_id: 'p-a', first_seen: T0, last_seen: T0, syncs: 2, app: '7b5fc5e', browser: 'Safari', os: 'iOS', type: 'phone', width: 360,
  });
  const keyRow = env.DB.rows('SELECT hash FROM keys ORDER BY created, hash').map((k) => k.hash);
  assert.ok(keyRow.includes(phone.hash), 'the device is its key\'s hash, as stored in keys');
  const pc = devices.find((d) => d.hash !== phone.hash);
  assert.deepEqual([pc.browser, pc.os, pc.type, pc.width, pc.app], ['Chrome', 'Windows', 'desktop', 1920, 'abc']);
});

test('nothing stored holds the IP or the User-Agent', async () => {
  const { env, call } = cloud();
  const key = await make(call);
  await call('GET', 'profiles/p-a/records?since=0', { key });
  await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 2 } } });
  const dump = JSON.stringify(['profiles', 'keys', 'records', 'devices', 'activity', 'uses', 'counters'].map((t) => env.DB.rows(`SELECT * FROM ${t}`)));
  assert.ok(!dump.includes(IP), 'no IP');
  assert.ok(!dump.includes('203.0.113'), 'not even part of it');
  assert.ok(!dump.includes('iPhone OS'), 'no User-Agent');
});

test('without the IP_KEY secret, everything is kept but the IP hash', async () => {
  const { env, call } = cloud({ secret: null });
  const key = await make(call);
  assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key })).status, 200);
  const acts = env.DB.rows('SELECT kind, city, ip_hash FROM activity');
  assert.deepEqual(acts, [{ kind: 'make', city: 'Portland', ip_hash: null }, { kind: 'pull', city: 'Portland', ip_hash: null }]);
});

test('a wrong PIN is logged with no device; a refused key logs nothing', async () => {
  const { env, call } = cloud();
  await make(call, 'p-a', '1234');
  assert.equal((await call('POST', 'profiles/p-a/open', { body: { pin: '0000' }, cf: SEATTLE })).status, 401);
  assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key: 'a'.repeat(32) })).status, 401);
  assert.equal((await call('POST', 'profiles/p-zz/open', { body: {} })).status, 404);
  assert.deepEqual(env.DB.rows('SELECT kind, device, city FROM activity ORDER BY id'), [
    { kind: 'make', device: env.DB.rows('SELECT hash FROM keys')[0].hash, city: 'Portland' },
    { kind: 'pin-wrong', device: null, city: 'Seattle' },
  ]);
});

test('a new PIN gives the device a new key, and it stays one device', async () => {
  const { env, call } = cloud();
  const key = await make(call);
  await call('GET', 'profiles/p-a/records?since=0', { key });
  const res = await call('PATCH', 'profiles/p-a', { key, body: { newPin: '1234' } });
  const { key: next } = await res.json();
  await call('GET', 'profiles/p-a/records?since=0', { key: next });
  const devices = env.DB.rows('SELECT hash, syncs FROM devices');
  assert.equal(devices.length, 1);
  assert.equal(devices[0].syncs, 2);
  assert.deepEqual(env.DB.rows('SELECT hash FROM keys').map((k) => k.hash), [devices[0].hash]);
  assert.deepEqual(env.DB.rows('SELECT kind FROM activity ORDER BY id').map((a) => a.kind), ['make', 'pull', 'pin', 'pull']);
});

test('feature-use counts add up per profile and day; a bad send is refused whole', async () => {
  const { env, call, at } = cloud();
  const key = await make(call);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 5, dj: 1 } } })).status, 200);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 2 } } })).status, 200);
  at(T0 + DAY);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1 } } })).status, 200);
  assert.deepEqual(env.DB.rows('SELECT feature, day, n FROM uses ORDER BY day, feature'), [
    { feature: 'dj', day: '2026-10-12', n: 1 }, { feature: 'pad', day: '2026-10-12', n: 7 }, { feature: 'pad', day: '2026-10-13', n: 1 },
  ]);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1, 'a-name': 1 } } })).status, 400);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1e9 } } })).status, 400);
  assert.equal((await call('POST', 'profiles/p-a/uses', { body: { uses: { pad: 1 } } })).status, 401, 'needs the key');
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1 }, pad: 'x'.repeat(5000) } })).status, 413);
  assert.equal(env.DB.rows("SELECT SUM(n) AS n FROM uses WHERE feature = 'pad'")[0].n, 8, 'the refused sends added nothing');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM activity')[0].n, 1, 'counts are not activity');
  assert.equal(env.DB.rows('SELECT last_seen FROM devices')[0].last_seen, T0 + DAY, 'but the device was seen');
});

test("the Worker takes the newest names (2026-10-12's features) and still the oldest, from a device on an older copy", async () => {
  const { env, call } = cloud();
  const key = await make(call);
  const today = ['roll', 'roll-note', 'song-block', 'mixer', 'beat-chip', 'beat-keep', 'song-keep', 'row-overlap', 'live-overlap', 'more'];
  const old = ['dj', 'dj-freestyle', 'beat-builder'];
  for (const f of [...today, ...old]) assert.ok(USES.includes(f), f);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: Object.fromEntries(today.map((f) => [f, 2])) } })).status, 200);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: Object.fromEntries(old.map((f) => [f, 1])) } })).status, 200);
  assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: Object.fromEntries(USES.map((f) => [f, 1])) } })).status, 200, 'every name at once fits a send');
  const got = Object.fromEntries(env.DB.rows('SELECT feature, n FROM uses').map((r) => [r.feature, r.n]));
  for (const f of today) assert.equal(got[f], 3, f);
  for (const f of old) assert.equal(got[f], 2, f);
});

test('rows older than 90 days go when a profile is opened, made, pushed or shared, never on a pull', async () => {
  const { env, call, at } = cloud();
  const key = await make(call);
  await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1 } } });
  at(T0 + KEEP_MS + DAY);
  await call('GET', 'profiles/p-a/records?since=0', { key });
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM activity')[0].n, 2, 'a pull deletes nothing');
  await make(call, 'p-b');
  assert.deepEqual(env.DB.rows('SELECT kind, profile_id FROM activity ORDER BY id'), [{ kind: 'pull', profile_id: 'p-a' }, { kind: 'make', profile_id: 'p-b' }]);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM uses')[0].n, 0, 'old days\' counts go');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM devices')[0].n, 2, 'a device seen since stays');
  at(T0 + 2 * KEEP_MS + 2 * DAY);
  await make(call, 'p-c');
  assert.deepEqual(env.DB.rows('SELECT profile_id FROM devices'), [{ profile_id: 'p-c' }], 'devices not seen in 90 days go');
});

test('before the migration runs, every route works and only the metrics are skipped', async () => {
  const { env, call } = cloud();
  for (const t of ['devices', 'activity', 'uses']) env.DB.db.exec(`DROP TABLE ${t}`);
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const key = await make(call);
    assert.ok(key);
    assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key })).status, 200);
    assert.equal((await call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'b-1', body: {} }] } })).status, 200);
    assert.equal((await call('POST', 'profiles/p-a/open', { body: {} })).status, 200);
    assert.equal((await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1 } } })).status, 503, 'the device keeps its counts for later');
  } finally {
    console.error = realError;
  }
  assert.deepEqual(errors, [], 'a missing table is expected, not an error');
});

test('another D1 trouble in the metrics is logged, and the answer is still the route\'s', async () => {
  const { env, call } = cloud();
  const key = await make(call);
  const realBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = async (s) => {
    if (s.some((x) => /INTO activity/.test(x.sql))) throw new Error('D1_ERROR: something else');
    return realBatch(s);
  };
  const errors = [];
  const realError = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    assert.equal((await call('GET', 'profiles/p-a/records?since=0', { key })).status, 200);
  } finally {
    console.error = realError;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /metrics \(pull\)/);
});

test('with a ctx, the metrics run after the answer (waitUntil)', async () => {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('') } };
  const waiting = [];
  const req = new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8' }),
  });
  const res = await worker.fetch(req, env, { waitUntil: (p) => waiting.push(p) });
  assert.equal(res.status, 201);
  assert.equal(waiting.length, 1);
  await Promise.all(waiting);
  assert.equal(env.DB.rows('SELECT kind FROM activity')[0].kind, 'make');
});

test('deleting a profile deletes its metrics: it is gone from the cloud at once', async () => {
  const { env, call } = cloud();
  const key = await make(call);
  await make(call, 'p-b');
  await call('GET', 'profiles/p-a/records?since=0', { key });
  await call('POST', 'profiles/p-a/uses', { key, body: { uses: { pad: 1 } } });
  assert.equal((await call('DELETE', 'profiles/p-a', { key, body: {} })).status, 200);
  for (const t of ['activity', 'devices', 'uses']) {
    assert.equal(env.DB.rows(`SELECT COUNT(*) AS n FROM ${t} WHERE profile_id = 'p-a'`)[0].n, 0, t);
  }
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM activity WHERE profile_id = 'p-b'")[0].n, 1, "another profile's stay");
});
