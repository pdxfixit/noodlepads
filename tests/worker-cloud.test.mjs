// Cloud profiles in the Worker (worker/cloud.js), against a fake D1 on Node's
// own SQLite, so the real SQL in worker/schema.sql runs: the list, fun names
// only, the PIN and its waits, keys (remembered or not, forgotten), records
// and revs, sounds in pieces, share codes, and last activity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { CHUNK_BYTES, MAX_SOUND_BYTES, LIMITS, SESSION_KEY_MS, ACTIVE_STEP_MS, ROW_BYTES, KEY_IDLE_MS, KEYS_PER_PROFILE, PENDING_MS, CHECK_MS, RESERVE_MS, pieceCount, pieceSize } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { WAIT_MS } from '../worker/pin.js';
import { FakeD1 } from './fake-d1.mjs';
import { CLOUD_MAX_SOUND } from '../web/cloud-sync.js';

const T0 = Date.parse('2026-10-11T12:00:00Z');

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  let now = T0;
  const realNow = Date.now;
  // The routes read the time from Date.now(); each call runs at the test's clock.
  const call = async (method, path, { body, key, raw, origin = ORIGIN, headers = {} } = {}) => {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (key) h.Authorization = `Bearer ${key}`;
    let payload;
    if (raw) payload = raw;
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    Date.now = () => now;
    try {
      const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, { method, headers: h, body: payload }), env);
      const type = res.headers.get('Content-Type') || '';
      const data = type.startsWith('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer());
      return { status: res.status, data, headers: res.headers };
    } finally {
      Date.now = realNow;
    }
  };
  return { env, call, at: (t) => { now = t; }, later: (ms) => { now += ms; } };
}

const look = (id, extra = {}) => ({ id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', ...extra });

async function made(c, id = 'p-one', extra = {}) {
  const r = await c.call('POST', 'profiles', { body: look(id, extra) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.key;
}

const sha = (n) => n.toString(16).padStart(64, '0');

// A profile an older copy of the app made under a plain id (an older
// boards.json's, a kid's name), which the Worker no longer makes: made under
// a random id, then moved to the plain one in SQL. Returns its key.
async function legacyProfile(c, id, extra = {}) {
  const key = await made(c, 'p-made-then-moved', extra);
  c.env.DB.db.prepare('UPDATE profiles SET id = ? WHERE id = ?').run(id, 'p-made-then-moved');
  c.env.DB.db.prepare('UPDATE keys SET profile_id = ? WHERE profile_id = ?').run(id, 'p-made-then-moved');
  return key;
}

test('pieces: a D1 row holds 2 MB, so audio goes in pieces of 1.9 MB', () => {
  assert.equal(CHUNK_BYTES, 1_900_000);
  assert.ok(CHUNK_BYTES < 2_000_000);
  assert.equal(pieceCount(1), 1);
  assert.equal(pieceCount(CHUNK_BYTES), 1);
  assert.equal(pieceCount(CHUNK_BYTES + 1), 2);
  assert.equal(pieceSize(CHUNK_BYTES + 1, 1), 1);
  assert.equal(pieceCount(MAX_SOUND_BYTES), 14, "the cloud's 25 MB cap is 14 pieces");
  assert.equal(MAX_SOUND_BYTES, CLOUD_MAX_SOUND, 'the app knows what the cloud keeps');
});

test('a profile is made with a fun name, an avatar from the list and a person color; anything typed is refused', async () => {
  const c = cloud();
  for (const [bad, why] of [
    [{ name: 'Sam' }, 'name'], [{ name: 'Admiral Acornx' }, 'name'], [{ avatar: 'A' }, 'avatar'], [{ avatar: '👍🏽' }, 'avatar'], [{ avatar: '🧛‍♂️' }, 'avatar'], [{ avatar: '🦖🦖' }, 'avatar'],
    [{ color: 'red' }, 'color'], [{ id: 'Not An Id' }, 'id'],
  ]) {
    const r = await c.call('POST', 'profiles', { body: { ...look('p-x'), ...bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.data.error, why);
  }
  const key = await made(c, 'p-x');
  assert.match(key, /^[a-z2-7]{32}$/);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-x') })).status, 409, 'an id already in the list');
  assert.equal(c.env.DB.rows('SELECT hash FROM keys')[0].hash.length, 64, 'only the key\'s hash is stored');
  assert.ok(!JSON.stringify(c.env.DB.rows('SELECT * FROM keys')).includes(key));
});

// The picture chooser's "…" offers every emoji (web/emoji-check.js), so the
// cloud takes any one of those, and still nothing typed.
test('an avatar may be any one emoji from the full list, not only the short list', async () => {
  const c = cloud();
  for (const [i, avatar] of ['🧛', '❤️', '#️⃣', ''].entries()) {
    const r = await c.call('POST', 'profiles', { body: look(`p-e${i}`, { avatar }) });
    assert.equal(r.status, 201, avatar);
  }
  assert.deepEqual(c.env.DB.rows('SELECT avatar FROM profiles ORDER BY id').map((r) => r.avatar), ['🧛', '❤️', '#️⃣', '']);
});

test('the list shows fun names and avatars to anyone, newest first, and whether each has a PIN', async () => {
  const c = cloud();
  await made(c, 'p-one');
  c.later(1000);
  await made(c, 'p-two', { name: 'Sir Squid', pin: '1234' });
  const r = await c.call('GET', 'profiles', { origin: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.profiles.map((p) => [p.id, p.name, p.pin]), [['p-two', 'Sir Squid', true], ['p-one', 'Admiral Acorn', false]]);
  assert.deepEqual(Object.keys(r.data.profiles[0]).sort(), ['avatar', 'color', 'edited', 'id', 'name', 'pin']);
  assert.ok(!JSON.stringify(r.data).includes('pin_hash') && !JSON.stringify(r.data).includes('salt'));
});

test('opening: no PIN opens; a PIN is checked; 5 wrong tries, then a 10-minute wait', async () => {
  const c = cloud();
  await made(c, 'p-open');
  assert.equal((await c.call('POST', 'profiles/p-open/open', { body: {} })).status, 200);
  await made(c, 'p-pin', { pin: '4321' });
  const row = c.env.DB.rows("SELECT pin_hash, pin_salt FROM profiles WHERE id = 'p-pin'")[0];
  assert.match(row.pin_hash, /^[0-9a-f]{64}$/);
  assert.match(row.pin_salt, /^[0-9a-f]{32}$/);
  assert.ok(!row.pin_hash.includes('4321'));
  assert.equal((await c.call('POST', 'profiles/p-pin/open', { body: {} })).status, 401);
  for (const left of [3, 2, 1]) {
    const r = await c.call('POST', 'profiles/p-pin/open', { body: { pin: '0000' } });
    assert.equal(r.status, 401);
    assert.equal(r.data.tries, left);
  }
  const fifth = await c.call('POST', 'profiles/p-pin/open', { body: { pin: '0000' } });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.data.wait, WAIT_MS / 1000);
  c.later(60_000);
  const right = await c.call('POST', 'profiles/p-pin/open', { body: { pin: '4321' } });
  assert.equal(right.status, 429, 'even the right PIN waits');
  assert.equal(right.data.wait, 540);
  c.later(WAIT_MS);
  const open = await c.call('POST', 'profiles/p-pin/open', { body: { pin: '4321' } });
  assert.equal(open.status, 200);
  assert.equal(open.data.name, 'Admiral Acorn');
  assert.equal(open.data.pin, true);
});

// The council's review, 2026-10-26: the count was read before the compare and
// written after, so tries sent all at once each saw 0 and got a guess.
test('PIN tries sent all at once still get 5 guesses in all, then the wait', async () => {
  const c = cloud();
  await made(c, 'p-pin', { pin: '0019' });
  const pins = Array.from({ length: 20 }, (_, i) => String(i).padStart(4, '0'));   // the right one last
  const tries = await Promise.all(pins.map((pin) => c.call('POST', 'profiles/p-pin/open', { body: { pin } })));
  assert.ok(!tries.some((r) => r.status === 200), 'the twentieth guess never opened it');
  const guessed = tries.filter((r) => r.status === 401);
  assert.equal(guessed.length, 4, 'four wrong guesses say how many are left');
  assert.deepEqual(guessed.map((r) => r.data.tries).sort(), [1, 2, 3, 4]);
  assert.equal(tries.filter((r) => r.status === 429).length, 16, 'the fifth starts the wait; the rest were never compared');
  assert.equal((await c.call('POST', 'profiles/p-pin/open', { body: { pin: '0019' } })).status, 429, 'the right PIN waits too');
  c.later(WAIT_MS);
  assert.equal((await c.call('POST', 'profiles/p-pin/open', { body: { pin: '0019' } })).status, 200);
  assert.equal(c.env.DB.rows("SELECT fails FROM profiles WHERE id = 'p-pin'")[0].fails, 0, 'a right PIN starts the count again');
});

test('records need the profile\'s own key; a push is one rev; a pull brings what changed since', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const other = await made(c, 'p-b');
  const beat = { id: 'beat-1', personId: 'p-a', name: 'Wobbly Taco', bpm: 100, rows: [] };
  assert.equal((await c.call('POST', 'profiles/p-a/records', { body: { put: [] } })).status, 401, 'no key');
  assert.equal((await c.call('POST', 'profiles/p-a/records', { key: other, body: { put: [] } })).status, 401, "another profile's key");
  const one = await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-1', body: beat }, { kind: 'orders', id: 'p-a', body: { personId: 'p-a', ids: [] } }] } });
  assert.deepEqual(one.data, { rev: 1, was: 0 });
  const two = await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-1', body: { ...beat, bpm: 120 } }] } });
  assert.deepEqual(two.data, { rev: 2, was: 1 });
  const all = await c.call('GET', 'profiles/p-a/records?since=0', { key });
  assert.deepEqual(all.data.records.map((r) => [r.kind, r.id]), [['orders', 'p-a'], ['beats', 'beat-1']]);
  assert.equal(all.data.records[1].body.bpm, 120);
  assert.equal(all.data.rev, 2);
  const since = await c.call('GET', 'profiles/p-a/records?since=2', { key });
  assert.deepEqual([since.data.records, since.data.rev, since.data.more], [[], 2, false]);
  assert.deepEqual(since.data.profile, { id: 'p-a', name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', edited: T0, pin: false, created: T0 }, 'and the look, for the newer-edit rule');
  const del = await c.call('POST', 'profiles/p-a/records', { key, body: { del: [{ kind: 'beats', id: 'beat-1' }] } });
  assert.equal(del.data.rev, 3);
  const gone = await c.call('GET', 'profiles/p-a/records?since=2', { key });
  assert.deepEqual(gone.data.records, [{ kind: 'beats', id: 'beat-1', deleted: true }]);
  for (const bad of [{ kind: 'people', id: 'p-a', body: {} }, { kind: 'beats', id: '../x', body: {} }, { kind: 'beats', id: 'b', body: 'x' }]) {
    assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: { put: [bad] } })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: { put: Array.from({ length: 201 }, (_, i) => ({ kind: 'beats', id: `b-${i}`, body: {} })) } })).status, 413);
});

test('a pull pages by 500 and never splits one push', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  for (let p = 0; p < 4; p++) {
    const put = Array.from({ length: 150 }, (_, i) => ({ kind: 'takes', id: `take-${p}-${i}`, body: { n: i } }));
    assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: { put } })).status, 200);
  }
  const first = await c.call('GET', 'profiles/p-a/records?since=0', { key });
  assert.equal(first.data.more, true);
  assert.equal(first.data.records.length, 450, 'three whole pushes');
  assert.equal(first.data.rev, 3);
  const second = await c.call('GET', `profiles/p-a/records?since=${first.data.rev}`, { key });
  assert.equal(second.data.records.length, 150);
  assert.equal(second.data.more, false);
  assert.equal(second.data.rev, 4);
});

test('a sound uploads in pieces of the right size, plays back whole, and is never uploaded twice', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const bytes = CHUNK_BYTES + 10;
  const audio = new Uint8Array(bytes).map((_, i) => i % 251);
  const start = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(1), bytes, mime: 'audio/webm;codecs=opus' } });
  assert.equal(start.status, 201);
  assert.match(start.data.id, /^s-[a-z2-7]{26}$/);
  assert.deepEqual(start.data.need, [0, 1]);
  const id = start.data.id;
  assert.equal((await c.call('GET', `sounds/${id}`, { origin: null })).status, 404, 'not playable until every piece is in');
  assert.equal((await c.call('PUT', `sounds/${id}/1`, { key, raw: audio.slice(0, 9) })).status, 400, 'a piece of the wrong size');
  const p1 = await c.call('PUT', `sounds/${id}/1`, { key, raw: audio.slice(CHUNK_BYTES) });
  assert.deepEqual(p1.data.need, [0]);
  const p0 = await c.call('PUT', `sounds/${id}/0`, { key, raw: audio.slice(0, CHUNK_BYTES) });
  assert.deepEqual(p0.data.need, []);
  const back = await c.call('GET', `sounds/${id}`, { origin: null });
  assert.equal(back.status, 200, 'no key needed to play it');
  assert.equal(back.headers.get('Content-Type'), 'audio/webm;codecs=opus');
  assert.match(back.headers.get('Cache-Control'), /immutable/);
  assert.equal(back.data.length, bytes);
  assert.deepEqual(back.data, audio);
  const again = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(1), bytes, mime: 'audio/webm' } });
  assert.deepEqual(again.data, { id, need: [] }, 'the same audio is already there');
  const other = await made(c, 'p-b');
  assert.equal((await c.call('PUT', `sounds/${id}/0`, { key: other, raw: audio.slice(0, CHUNK_BYTES) })).status, 404, "only its owner adds pieces");
  assert.equal((await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(2), bytes: MAX_SOUND_BYTES + 1, mime: 'audio/wav' } })).status, 413);
  assert.equal((await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(2), bytes: 10, mime: 'text/html' } })).status, 400);
});

test('a sound record must name audio the profile has, whole; deleting the last record that names it deletes the audio', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const { data: { id } } = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(3), bytes: 4, mime: 'audio/wav' } });
  const clip = { id: 'user-1', personId: 'p-a', label: 'Burp', mime: 'audio/wav', sound: id, sha256: sha(3) };
  const early = await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'clips', id: 'user-1', body: clip }] } });
  assert.equal(early.status, 409);
  assert.equal(early.data.sound, id);
  await c.call('PUT', `sounds/${id}/0`, { key, raw: new Uint8Array([1, 2, 3, 4]) });
  assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'clips', id: 'user-1', body: clip }] } })).status, 200);
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM sound_chunks')[0].n, 1);
  await c.call('POST', 'profiles/p-a/records', { key, body: { del: [{ kind: 'clips', id: 'user-1' }] } });
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM sounds')[0].n, 0);
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM sound_chunks')[0].n, 0);
});

test('a profile holds at most 40 MB of sound, and the whole cloud 400 MB', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  c.env.DB.db.prepare("INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-x', 'p-a', 'audio/wav', ?, 1, 'x', 1, 0)").run(LIMITS.profileBytes - 5);
  const full = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(4), bytes: 10, mime: 'audio/wav' } });
  assert.equal(full.status, 507);
  assert.equal(full.data.error, 'profile full');
  const key2 = await made(c, 'p-b');
  c.env.DB.db.prepare("INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-y', 'p-z', 'audio/wav', ?, 1, 'y', 1, 0)").run(LIMITS.totalBytes - LIMITS.profileBytes);
  const all = await c.call('POST', 'profiles/p-b/sounds', { key: key2, body: { sha256: sha(5), bytes: 10, mime: 'audio/wav' } });
  assert.equal(all.data.error, 'cloud full');
});

// The council's review, 2026-10-26: 5,000 pushes a day of 4 MB each is far
// past D1's 500 MB, so one device could fill the database and stop every
// family's sync. Records are capped like sounds: 10 MB a profile, 60 MB in all.
test('a profile holds at most 10 MB of records, and everyone 60 MB; a push that adds nothing still lands', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const big = (i) => ({ kind: 'takes', id: `take-${i}`, body: { n: i, notes: 'x'.repeat(499_990) } });
  const push = (body, k = key, id = 'p-a') => c.call('POST', `profiles/${id}/records`, { key: k, body });
  for (const ids of [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12, 13], [14, 15, 16, 17, 18, 19]]) {
    assert.equal((await push({ put: ids.map(big) })).status, 200);
  }
  const bytes = () => c.env.DB.rows("SELECT record_bytes AS b FROM profiles WHERE id = 'p-a'")[0].b;
  const counted = () => c.env.DB.rows("SELECT SUM(COALESCE(LENGTH(CAST(body AS BLOB)), 0) + 100) AS b FROM records WHERE profile_id = 'p-a'")[0].b;
  assert.equal(bytes(), counted(), 'the profile keeps its records\' size');
  assert.ok(bytes() < LIMITS.profileRecordBytes && bytes() + 500_100 > LIMITS.profileRecordBytes);
  const full = await push({ put: [big(20)] });
  assert.equal(full.status, 507);
  assert.equal(full.data.error, 'records full');
  assert.equal(c.env.DB.rows("SELECT rev FROM profiles WHERE id = 'p-a'")[0].rev, 3, 'nothing landed');
  assert.equal((await push({ put: [{ kind: 'takes', id: 'take-0', body: { n: 0 } }] })).status, 200, 'an edit that shrinks lands');
  assert.equal((await push({ del: [{ kind: 'takes', id: 'take-1' }] })).status, 200, 'a delete lands');
  assert.equal(bytes(), counted());
  assert.equal((await push({ put: [big(20)] })).status, 200, 'and makes room');
  // Everyone's: every profile's count, added up (here, p-a and a big p-z).
  const key2 = await made(c, 'p-b');
  c.env.DB.db.prepare("INSERT INTO profiles (id, name, color, edited, created, record_bytes, bytes_counted) VALUES ('p-z', 'Sir Squid', '#1F3FA8', 0, 0, ?, 1)")
    .run(LIMITS.totalRecordBytes - bytes() - 1000);
  const all = await push({ put: [{ kind: 'beats', id: 'beat-1', body: { name: 'x'.repeat(2000) } }] }, key2, 'p-b');
  assert.equal(all.status, 507);
  assert.equal(all.data.error, 'cloud full');
  assert.equal((await push({ put: [{ kind: 'beats', id: 'beat-1', body: {} }] }, key2, 'p-b')).status, 200, 'a small one still fits');
  // A count that drifted high (a push from an older Worker) is made again before it refuses.
  c.env.DB.db.prepare("UPDATE profiles SET record_bytes = ? WHERE id = 'p-b'").run(LIMITS.profileRecordBytes);
  assert.equal((await push({ put: [{ kind: 'beats', id: 'beat-2', body: {} }] }, key2, 'p-b')).status, 200);
  assert.equal(c.env.DB.rows("SELECT record_bytes AS b FROM profiles WHERE id = 'p-b'")[0].b, 2 * (2 + ROW_BYTES));
});

// The security seat, 2026-10-26: checked first and written later, pushes sent
// at once all passed on the same count and overshot the cap.
test('pushes sent at once take their room one at a time, so they never overshoot the cap', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const batch = (p) => ({ put: Array.from({ length: 7 }, (_, i) => ({ kind: 'takes', id: `take-${p}-${i}`, body: { notes: 'x'.repeat(499_990) } })) });
  c.env.DB.slow = true;
  const res = await Promise.all([0, 1, 2, 3, 4].map((p) => c.call('POST', 'profiles/p-a/records', { key, body: batch(p) })));
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 200, 507, 507, 507], 'two fit in 10 MB; three wait');
  c.env.DB.slow = false;
  const [{ kept, counted }] = c.env.DB.rows(`SELECT (SELECT record_bytes FROM profiles WHERE id = 'p-a') AS kept,
    (SELECT SUM(LENGTH(CAST(body AS BLOB)) + 100) FROM records) AS counted`);
  assert.equal(kept, counted, 'the reservations settled to the exact count');
  assert.ok(kept <= LIMITS.profileRecordBytes);
  // A write that fails gives its room back.
  const realBatch = c.env.DB.batch.bind(c.env.DB);
  c.env.DB.batch = async () => { throw new Error('D1_ERROR: boom'); };
  const realError = console.error;
  console.error = () => {};
  const failed = await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-1', body: {} }] } });
  console.error = realError;
  c.env.DB.batch = realBatch;
  assert.equal(failed.status, 503);
  assert.equal(c.env.DB.rows("SELECT record_bytes AS b FROM profiles WHERE id = 'p-a'")[0].b, kept);
  assert.equal(c.env.DB.rows("SELECT reserved_bytes AS b FROM profiles WHERE id = 'p-a'")[0].b, 0, 'and holds no room');
});

// The security seat, 2026-10-26: when a write took longer than its take, a
// refused push recounted what was written, wiped the room the others had
// taken, and got in: 14 MB on the 10 MB cap. Reservations are kept apart now.
test('pushes whose writes are slower than their takes still never overshoot; a reservation left behind lapses', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const batch = (p) => ({ put: Array.from({ length: 7 }, (_, i) => ({ kind: 'takes', id: `take-${p}-${i}`, body: { notes: 'x'.repeat(499_990) } })) });
  c.env.DB.slow = true;
  const realBatch = c.env.DB.batch.bind(c.env.DB);
  c.env.DB.batch = async (statements) => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    return realBatch(statements);
  };
  const res = await Promise.all(Array.from({ length: 8 }, (_, p) => c.call('POST', 'profiles/p-a/records', { key, body: batch(p) })));
  c.env.DB.slow = false;
  c.env.DB.batch = realBatch;
  assert.equal(res.filter((r) => r.status === 200).length, 2, 'two fit in 10 MB');
  const [{ kept, counted, reserved }] = c.env.DB.rows(`SELECT (SELECT record_bytes FROM profiles WHERE id = 'p-a') AS kept,
    (SELECT reserved_bytes FROM profiles WHERE id = 'p-a') AS reserved, (SELECT SUM(LENGTH(CAST(body AS BLOB)) + 100) FROM records) AS counted`);
  assert.deepEqual([kept, reserved], [counted, 0]);
  assert.ok(counted <= LIMITS.profileRecordBytes);
  // A write that died after taking its room (no settle, no release) stops holding it after a minute.
  c.env.DB.db.prepare("UPDATE profiles SET reserved_bytes = ?, reserved_at = ? WHERE id = 'p-a'").run(LIMITS.profileRecordBytes, T0);
  const small = { put: [{ kind: 'beats', id: 'beat-1', body: {} }] };
  assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: small })).data.error, 'records full', 'held, for now');
  c.later(RESERVE_MS + 1);
  assert.equal((await c.call('POST', 'profiles/p-a/records', { key, body: small })).status, 200, 'lapsed');
});

// The security seat, 2026-10-26: a push the older Worker takes between
// migration 006 and the deploy leaves a count low, which no refusal would
// ever correct. The newer Worker counts every such profile again itself.
test('counts an older Worker left low are made again from the first pushes after the deploy', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const others = [];
  for (let i = 0; i < 7; i++) others.push([`p-old-${i}`, await made(c, `p-old-${i}`)]);
  for (const [id, k] of [['p-a', key], ...others]) {
    await c.call('POST', `profiles/${id}/records`, { key: k, body: { put: [{ kind: 'beats', id: 'beat-1', body: { name: 'x'.repeat(1000) } }] } });
  }
  // As migration 006 leaves them, after the older Worker wrote more: low, and not counted by this one.
  c.env.DB.db.prepare('UPDATE profiles SET record_bytes = 0, bytes_counted = 0').run();
  const low = () => c.env.DB.rows('SELECT id FROM profiles WHERE bytes_counted = 0 OR record_bytes = 0 ORDER BY id').map((r) => r.id);
  await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-2', body: {} }] } });
  assert.equal(low().length, 8 - 6, 'the writer and five more are counted');
  assert.ok(!low().includes('p-a'));
  await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-3', body: {} }] } });
  assert.deepEqual(low(), [], 'then the rest');
  const [{ kept, counted }] = c.env.DB.rows(`SELECT (SELECT SUM(record_bytes) FROM profiles) AS kept,
    (SELECT SUM(LENGTH(CAST(body AS BLOB)) + 100) FROM records) AS counted`);
  assert.equal(kept, counted, 'every count exact');
});

test("a profile's record bytes stay exact through edits, deletes, tombstones and stale writes", async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const push = (body) => c.call('POST', 'profiles/p-a/records', { key, body });
  const exact = () => {
    const [{ kept, counted }] = c.env.DB.rows(`SELECT (SELECT record_bytes FROM profiles WHERE id = 'p-a') AS kept,
      (SELECT COALESCE(SUM(COALESCE(LENGTH(CAST(body AS BLOB)), 0) + 100), 0) FROM records WHERE profile_id = 'p-a') AS counted`);
    assert.equal(kept, counted);
  };
  await push({ put: [{ kind: 'beats', id: 'beat-1', body: { name: 'Ünïcödé' } }, { kind: 'beats', id: 'beat-1', body: { name: 'twice in one push' } }], since: 0 });
  exact();
  await push({ put: [{ kind: 'beats', id: 'beat-2', body: { n: 1 } }], del: [{ kind: 'beats', id: 'beat-1' }, { kind: 'beats', id: 'never-was' }], since: 1 });
  exact();
  // A device behind (since 1) writes beat-2, which rev 2 wrote: it stays as it is.
  const stale = await push({ put: [{ kind: 'beats', id: 'beat-2', body: { n: 'x'.repeat(5000) } }, { kind: 'beats', id: 'beat-3', body: {} }], since: 1 });
  assert.deepEqual(stale.data.stale, [{ kind: 'beats', id: 'beat-2' }]);
  exact();
  await push({ put: [{ kind: 'beats', id: 'beat-1', body: { back: true } }] });
  exact();
});

// The council's review, 2026-10-26: a start counted its declared bytes before
// anything uploaded, and an unfinished sound never went, so a few 25 MB starts
// made the cloud "full" for everyone.
test('an unfinished sound counts for others only as far as it uploaded, and is given up after an hour', async () => {
  const c = cloud();
  c.env.DB.db.prepare("INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-z', 'p-z', 'audio/wav', ?, 1, 'z', 1, 0)")
    .run(LIMITS.totalBytes - 26 * 1024 * 1024);
  const start = (key, id, n, bytes = MAX_SOUND_BYTES) => c.call('POST', `profiles/${id}/sounds`, { key, body: { sha256: sha(n), bytes, mime: 'audio/wav' } });
  const a = await made(c, 'p-a');
  const b = await made(c, 'p-b');
  assert.equal((await start(a, 'p-a', 1)).status, 201);
  assert.equal((await start(b, 'p-b', 2)).status, 201, "p-a's start, with nothing uploaded, takes no room from p-b");
  const own = await start(a, 'p-a', 3);
  assert.deepEqual([own.status, own.data.error], [507, 'profile full'], 'its own start counts whole against its own 40 MB');
  // Pieces that did arrive count for everyone.
  const part = await start(a, 'p-a', 4, CHUNK_BYTES + 10);
  assert.equal((await c.call('PUT', `sounds/${part.data.id}/0`, { key: a, raw: new Uint8Array(CHUNK_BYTES) })).status, 200);
  const cc = await made(c, 'p-c');
  assert.equal((await start(cc, 'p-c', 5)).data.error, 'cloud full', 'its 1.9 MB that arrived leave too little for 25 MB more');
  c.later(PENDING_MS + 1);
  assert.equal((await start(cc, 'p-c', 5)).status, 201, 'given up, its piece counts no more');
  assert.equal((await c.call('PUT', `sounds/${part.data.id}/1`, { key: a, raw: new Uint8Array(10) })).status, 404, 'given up: no more pieces');
  const again = await start(a, 'p-a', 3);
  assert.equal(again.status, 201, 'an hour on, the unfinished ones are gone');
  assert.deepEqual(c.env.DB.rows("SELECT id FROM sounds WHERE profile_id = 'p-a'").map((r) => r.id), [again.data.id]);
  assert.deepEqual(c.env.DB.rows('SELECT DISTINCT sound_id FROM sound_chunks'), [], 'with their pieces');
  assert.equal(c.env.DB.rows("SELECT COUNT(*) AS n FROM sounds WHERE id = 's-z'")[0].n, 1, 'a whole sound stays');
});

test('changing the PIN needs the current one, and closes the profile on every other device', async () => {
  const c = cloud();
  const key = await made(c, 'p-a', { pin: '1111' });
  const elsewhere = (await c.call('POST', 'profiles/p-a/open', { body: { pin: '1111' } })).data.key;
  const wrong = await c.call('PATCH', 'profiles/p-a', { key, body: { pin: '9999', newPin: '2222' } });
  assert.equal(wrong.status, 401);
  const ok = await c.call('PATCH', 'profiles/p-a', { key, body: { pin: '1111', newPin: '2222' } });
  assert.equal(ok.status, 200);
  assert.match(ok.data.key, /^[a-z2-7]{32}$/);
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: elsewhere })).status, 401, 'the other device must open it again');
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key })).status, 401, 'the old key too');
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: ok.data.key })).status, 200);
  const off = await c.call('PATCH', 'profiles/p-a', { key: ok.data.key, body: { pin: '2222', newPin: null } });
  assert.equal(off.status, 200);
  assert.equal(c.env.DB.rows("SELECT pin_hash FROM profiles WHERE id = 'p-a'")[0].pin_hash, null);
});

test('a new look keeps the newer edit; only fun names and listed avatars', async () => {
  const c = cloud();
  const key = await made(c, 'p-a', { edited: T0 - 5000 });
  assert.equal((await c.call('PATCH', 'profiles/p-a', { key, body: { name: 'Duke Dumpling', edited: T0 - 1000 } })).status, 200);
  assert.equal((await c.call('PATCH', 'profiles/p-a', { key, body: { name: 'Lady Lemon', edited: T0 - 3000 } })).status, 200);
  assert.equal(c.env.DB.rows("SELECT name FROM profiles WHERE id = 'p-a'")[0].name, 'Duke Dumpling', 'an older edit loses');
  assert.equal((await c.call('PATCH', 'profiles/p-a', { key, body: { name: 'My Real Name' } })).status, 400);
  assert.equal((await c.call('PATCH', 'profiles/p-a', { key, body: { name: 'Salacious Crumb', edited: T0 } })).status, 200, 'a special name (names.js SPECIAL_NAMES)');
  assert.equal(c.env.DB.rows("SELECT name FROM profiles WHERE id = 'p-a'")[0].name, 'Salacious Crumb');
});

test('deleting a profile needs its key and PIN, and deletes everything in it', async () => {
  const c = cloud();
  const key = await made(c, 'p-a', { pin: '1234' });
  const { data: { id } } = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(6), bytes: 3, mime: 'audio/wav' } });
  await c.call('PUT', `sounds/${id}/0`, { key, raw: new Uint8Array([1, 2, 3]) });
  await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'clips', id: 'user-1', body: { sound: id } }] } });
  assert.equal((await c.call('DELETE', 'profiles/p-a', { key, body: { pin: '0000' } })).status, 401);
  assert.equal((await c.call('DELETE', 'profiles/p-a', { key, body: { pin: '1234' } })).status, 200);
  for (const table of ['profiles', 'records', 'sounds', 'sound_chunks', 'keys']) {
    assert.equal(c.env.DB.rows(`SELECT COUNT(*) AS n FROM ${table}`)[0].n, 0, table);
  }
  assert.equal((await c.call('GET', `sounds/${id}`)).status, 404);
});

async function sound(c, key, id, n, bytes = [7, 7]) {
  const { data } = await c.call('POST', `profiles/${id}/sounds`, { key, body: { sha256: sha(n), bytes: bytes.length, mime: 'audio/wav' } });
  await c.call('PUT', `sounds/${data.id}/0`, { key, raw: new Uint8Array(bytes) });
  return data.id;
}

test('a share code: anyone who has it sees the snapshot, read-only, with no key, PIN or Origin', async () => {
  const c = cloud();
  const a = await made(c, 'p-a', { pin: '1234' });
  const s = await sound(c, a, 'p-a', 7);
  const preview = await sound(c, a, 'p-a', 8, [1, 2, 3]);
  const bundle = { clips: [{ id: 'user-1', label: 'Burp', sound: s }], beats: [{ id: 'beat-1', rows: [{ clipId: 'user-1' }] }], songs: [] };
  const body = { kind: 'beat', title: 'Wobbly Taco', bundle, preview };
  assert.equal((await c.call('POST', 'profiles/p-a/shares', { body })).status, 401, 'only the profile shares its things');
  const made1 = await c.call('POST', 'profiles/p-a/shares', { key: a, body });
  assert.equal(made1.status, 201);
  assert.match(made1.data.code, /^[A-HJ-NP-Z2-9]{8}$/, '8 characters, none of 0 O 1 I');
  const again = await c.call('POST', 'profiles/p-a/shares', { key: a, body });
  assert.deepEqual([again.status, again.data.code], [200, made1.data.code], 'the same thing shared again: the same code');
  const typed = `${made1.data.code.slice(0, 4).toLowerCase()}-${made1.data.code.slice(4)}`;
  const seen = await c.call('GET', `shares/${typed}`, { origin: null });
  assert.equal(seen.status, 200, 'lower case and a dash are fine');
  assert.deepEqual([seen.data.kind, seen.data.title, seen.data.preview], ['beat', 'Wobbly Taco', preview]);
  assert.deepEqual(seen.data.bundle, bundle);
  assert.equal((await c.call('GET', 'shares/AAAAAAAA')).status, 404);
  assert.equal((await c.call('GET', 'shares/nope')).status, 404);
  const other = await made(c, 'p-b', { name: 'Sir Squid' });
  const theirs = await c.call('POST', 'profiles/p-b/shares', { key: other, body });
  assert.equal(theirs.status, 409, "a share names only the profile's own sounds");
});

// The council's review, 2026-10-26: deleting a profile kept its shares, and
// 🚫 Unshare needs the profile's key, so a deleted kid's shared voice could
// never be unshared. A share now lasts until it is unshared or its profile goes.
test('a share outlives the sound it uses, until its profile is deleted: then its codes and audio go, and a remix stays', async () => {
  const c = cloud();
  const a = await made(c, 'p-a');
  const s = await sound(c, a, 'p-a', 7);
  const gone = await sound(c, a, 'p-a', 9, [9]);
  await c.call('POST', 'profiles/p-a/records', { key: a, body: { put: [{ kind: 'clips', id: 'user-1', body: { sound: s } }, { kind: 'clips', id: 'user-2', body: { sound: gone } }] } });
  const { data: { code } } = await c.call('POST', 'profiles/p-a/shares', { key: a, body: { kind: 'sound', title: 'Burp', bundle: { clips: [{ id: 'user-1', sound: s }] } } });
  const { data: { code: beat } } = await c.call('POST', 'profiles/p-a/shares', { key: a, body: { kind: 'beat', title: 'Boom', bundle: { beats: [{ id: 'beat-1' }] } } });
  await c.call('POST', 'profiles/p-a/records', { key: a, body: { del: [{ kind: 'clips', id: 'user-1' }, { kind: 'clips', id: 'user-2' }] } });
  assert.deepEqual(c.env.DB.rows('SELECT id FROM sounds').map((r) => r.id), [s], 'the unshared sound went; the shared one stays');
  assert.equal((await c.call('GET', `shares/${code}`)).status, 200);
  // Someone remixed it: their own record, with their own copy of the audio (web/cloud.js remixShare, then their sync).
  const b = await made(c, 'p-b', { name: 'Sir Squid' });
  const theirs = await sound(c, b, 'p-b', 7);
  await c.call('POST', 'profiles/p-b/records', { key: b, body: { put: [{ kind: 'clips', id: 'user-9', body: { sound: theirs } }] } });
  const { data: { code: their } } = await c.call('POST', 'profiles/p-b/shares', { key: b, body: { kind: 'sound', title: 'Burp remix', bundle: { clips: [{ id: 'user-9', sound: theirs }] } } });
  assert.equal((await c.call('DELETE', 'profiles/p-a', { key: a, body: {} })).status, 200);
  for (const x of [code, beat]) assert.equal((await c.call('GET', `shares/${x}`)).status, 404, 'its codes stop working');
  assert.equal((await c.call('GET', `sounds/${s}`)).status, 404, 'its audio is gone');
  assert.deepEqual(c.env.DB.rows('SELECT id FROM sounds').map((r) => r.id), [theirs], 'only the remix\'s copy is left');
  assert.deepEqual(c.env.DB.rows('SELECT code FROM shares').map((r) => r.code), [their]);
  assert.deepEqual(c.env.DB.rows('SELECT code FROM share_sounds').map((r) => r.code), [their]);
  assert.deepEqual((await c.call('GET', `sounds/${theirs}`)).data, new Uint8Array([7, 7]), 'the remix still plays');
});

// The security seat, 2026-10-26: 200 shares a profile of up to 1 MB each was
// storage no cap counted. A share's bundle now counts with the records.
test("a share's bundle counts against the profile's 10 MB and everyone's 60 MB; unsharing gives it back; 50 a profile", async () => {
  const c = cloud();
  const a = await made(c, 'p-a');
  const s = await sound(c, a, 'p-a', 7);
  await c.call('POST', 'profiles/p-a/records', { key: a, body: { put: [{ kind: 'clips', id: 'user-1', body: { sound: s } }] } });
  const clip = Buffer.byteLength(JSON.stringify({ sound: s })) + ROW_BYTES;
  const bytes = () => c.env.DB.rows("SELECT record_bytes AS b FROM profiles WHERE id = 'p-a'")[0].b - clip;
  const body = (title, n = 900_000) => ({ kind: 'beat', title, bundle: { clips: [{ id: 'user-1', sound: s }], beats: [{ id: 'beat-1', name: 'x'.repeat(n) }], songs: [] } });
  const { data: { code } } = await c.call('POST', 'profiles/p-a/shares', { key: a, body: body('Boom') });
  const bundle = JSON.stringify(body('Boom').bundle);
  assert.equal(bytes(), Buffer.byteLength(bundle) + Buffer.byteLength('Boom') + 2 * ROW_BYTES, 'its bundle, title, row and sound row');
  assert.equal((await c.call('DELETE', `profiles/p-a/shares/${code}`, { key: a })).status, 200);
  assert.equal(bytes(), 0, 'unsharing gives it back');
  // Everyone's.
  c.env.DB.db.prepare("INSERT INTO profiles (id, name, color, edited, created, record_bytes, bytes_counted) VALUES ('p-z', 'Sir Squid', '#1F3FA8', 0, 0, ?, 1)")
    .run(LIMITS.totalRecordBytes - 500_000);
  const full = await c.call('POST', 'profiles/p-a/shares', { key: a, body: body('Boom') });
  assert.deepEqual([full.status, full.data.error], [507, 'cloud full']);
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM shares')[0].n, 0, 'nothing was shared');
  assert.equal((await c.call('POST', 'profiles/p-a/shares', { key: a, body: body('Small', 10) })).status, 201, 'a small one fits');
  // 50 a profile.
  assert.equal(LIMITS.sharesPerProfile, 50);
  for (let i = 0; i < 49; i++) {
    c.env.DB.db.prepare("INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES (?, 'p-a', 'beat', 'x', '{}', ?, 0)").run(`CODE${i}`, `h${i}`);
  }
  const many = await c.call('POST', 'profiles/p-a/shares', { key: a, body: body('One more', 10) });
  assert.deepEqual([many.status, many.data.error], [507, 'shares full']);
});

// Ben, 2026-10-11 (Q18): "allow to be unshared. copies remain". The sharer
// lists their own shares and can end one: the code stops working for
// everyone, and audio only that share used goes with it. A remix holds its
// own copy, so it stays.
test('🚫 Unshare: only the sharer, the code stops working, and audio nothing else uses goes', async () => {
  const c = cloud();
  const a = await made(c, 'p-a');
  const kept = await sound(c, a, 'p-a', 7);              // a sound they still have
  const preview = await sound(c, a, 'p-a', 8, [1, 2]);   // the share's recording: only the share uses it
  await c.call('POST', 'profiles/p-a/records', { key: a, body: { put: [{ kind: 'clips', id: 'user-1', body: { sound: kept } }] } });
  const body = { kind: 'sound', title: 'Burp', bundle: { clips: [{ id: 'user-1', sound: kept }] }, preview };
  const { data: { code } } = await c.call('POST', 'profiles/p-a/shares', { key: a, body });
  const other = await c.call('POST', 'profiles/p-a/shares', { key: a, body: { ...body, title: 'Burp too', preview: null } });

  assert.equal((await c.call('GET', 'profiles/p-a/shares')).status, 401, 'only with the profile\'s key');
  const mine = await c.call('GET', 'profiles/p-a/shares', { key: a });
  assert.deepEqual(mine.data.shares.map((x) => x.title).sort(), ['Burp', 'Burp too']);
  const b = await made(c, 'p-b', { name: 'Sir Squid' });
  assert.deepEqual((await c.call('GET', 'profiles/p-b/shares', { key: b })).data.shares, [], 'nobody else\'s');

  assert.equal((await c.call('DELETE', `profiles/p-b/shares/${code}`, { key: b })).status, 404, 'nobody else can unshare it');
  assert.equal((await c.call('DELETE', `profiles/p-a/shares/${code}`, { key: a, origin: null })).status, 403);
  assert.equal((await c.call('DELETE', `profiles/p-a/shares/${code}`, { key: a })).status, 200);
  assert.equal((await c.call('GET', `shares/${code}`)).status, 404, 'the code stops working for everyone');
  assert.equal((await c.call('DELETE', `profiles/p-a/shares/${code}`, { key: a })).status, 404, 'already gone');
  assert.deepEqual(c.env.DB.rows('SELECT id FROM sounds').map((r) => r.id), [kept], 'its own recording went; the sound they still have stays');
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM share_sounds WHERE code = ?', code)[0].n, 0);
  assert.equal((await c.call('GET', `shares/${other.data.code}`)).status, 200, 'their other share still works');

  // A sound the profile deleted, kept only for a share, goes once that is unshared.
  await c.call('POST', 'profiles/p-a/records', { key: a, body: { del: [{ kind: 'clips', id: 'user-1' }] } });
  assert.deepEqual(c.env.DB.rows('SELECT id FROM sounds').map((r) => r.id), [kept], 'still used by the other share');
  await c.call('DELETE', `profiles/p-a/shares/${other.data.code}`, { key: a });
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM sounds')[0].n, 0);
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM sound_chunks')[0].n, 0);
});

test('a key not remembered is a session key, deleted after a week; Forget on this device drops a key', async () => {
  const c = cloud();
  await made(c, 'p-a', { pin: '1234' });
  const session = (await c.call('POST', 'profiles/p-a/open', { body: { pin: '1234', remember: false } })).data.key;
  const kept = (await c.call('POST', 'profiles/p-a/open', { body: { pin: '1234' } })).data.key;
  assert.deepEqual(c.env.DB.rows('SELECT session FROM keys ORDER BY session').map((r) => r.session), [0, 0, 1]);
  c.later(SESSION_KEY_MS + 1);
  await c.call('POST', 'profiles/p-a/open', { body: { pin: '1234' } });
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: session })).status, 401, 'the old session key is gone');
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: kept })).status, 200, 'a remembered one stays');
  assert.equal((await c.call('DELETE', 'profiles/p-a/key', { key: kept, origin: null })).status, 403);
  assert.equal((await c.call('DELETE', 'profiles/p-a/key', { key: kept })).status, 200);
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: kept })).status, 401, 'forgotten');
});

// The council's review, 2026-10-26: every open made a key that lasted
// forever, as many as anyone asked for.
test('a profile keeps the keys of its 20 most recently used devices; opening on one more drops the one unused longest', async () => {
  const c = cloud();
  const first = await made(c, 'p-a');
  const open = async () => { c.later(1000); return (await c.call('POST', 'profiles/p-a/open', { body: {} })).data.key; };
  const early = [];
  for (let i = 0; i < 5; i++) early.push(await open());
  c.later(ACTIVE_STEP_MS + 1);
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: first })).status, 200, 'the first device is used again');
  const late = [];
  for (let i = 0; i < 16; i++) late.push(await open());
  assert.equal(c.env.DB.rows("SELECT COUNT(*) AS n FROM keys WHERE profile_id = 'p-a'")[0].n, KEYS_PER_PROFILE);
  const works = async (key) => (await c.call('GET', 'profiles/p-a/records', { key })).status === 200;
  assert.ok(await works(first), 'used lately: kept, though made first');
  assert.deepEqual([await works(early[0]), await works(early[1]), await works(early[2])], [false, false, true], 'the two unused longest went');
  assert.ok(await works(late.at(-1)));
});

test('a key unused for 180 days stops working; one used every month never does', async () => {
  const c = cloud();
  const idle = await made(c, 'p-a');
  const monthly = (await c.call('POST', 'profiles/p-a/open', { body: {} })).data.key;
  for (let month = 0; month < 12; month++) {
    c.later(30 * 24 * ACTIVE_STEP_MS);
    assert.equal((await c.call('GET', 'profiles/p-a/records', { key: monthly })).status, 200, `month ${month + 1}`);
  }
  assert.ok(12 * 30 * 24 * ACTIVE_STEP_MS > KEY_IDLE_MS);
  assert.equal((await c.call('GET', 'profiles/p-a/records', { key: idle })).status, 401, 'half a year unused');
  assert.deepEqual(c.env.DB.rows('SELECT COUNT(*) AS n FROM keys')[0].n, 1, 'and deleted');
  // An older Worker's key has no `used`: its `created` counts.
  c.env.DB.db.prepare("INSERT INTO keys (hash, profile_id, created) VALUES ('old', 'p-a', ?)").run(T0);
  c.env.DB.db.prepare("INSERT INTO keys (hash, profile_id, created) VALUES ('new', 'p-a', ?)").run(T0 + 360 * 24 * ACTIVE_STEP_MS);
  await c.call('POST', 'profiles/p-a/open', { body: {} });
  assert.deepEqual(c.env.DB.rows("SELECT hash FROM keys WHERE hash IN ('old', 'new')").map((r) => r.hash), ['new'], 'an open sweeps the idle ones');
});

test('last activity: opening, pulling and pushing mark it, at most once an hour', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const active = () => c.env.DB.rows("SELECT active FROM profiles WHERE id = 'p-a'")[0].active;
  assert.equal(active(), T0);
  c.later(ACTIVE_STEP_MS / 2);
  await c.call('GET', 'profiles/p-a/records', { key });
  assert.equal(active(), T0, 'within the hour: no write');
  c.later(ACTIVE_STEP_MS);
  await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'prefs', id: 'p-a', body: { personId: 'p-a', values: { padSize: 'l' } } }] } });
  assert.equal(active(), T0 + ACTIVE_STEP_MS * 1.5);
  c.later(ACTIVE_STEP_MS * 2);
  await c.call('POST', 'profiles/p-a/open', { body: {} });
  assert.equal(active(), T0 + ACTIVE_STEP_MS * 3.5);
});

// Ben, 2026-10-26: 10 new profiles a day across the site.
test('daily caps: 10 new profiles a UTC day', async () => {
  const c = cloud();
  for (let i = 0; i < 10; i++) await made(c, `p-day-${i}`);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-late') })).status, 429, 'the eleventh waits for tomorrow');
  c.later(86400000);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-late') })).status, 201);
});

// The council's review, 2026-10-26: any profile made and deleted the same
// day gave its place back, so making and deleting never used the cap up.
test("daily caps: a deleted profile gives no place back; the deploy checks' have a cap of their own", async () => {
  const c = cloud();
  const day = (name) => c.env.DB.rows("SELECT n FROM counters WHERE name = ? AND day = '2026-10-11'", name)[0]?.n ?? 0;
  const churn = await made(c, 'p-churn');
  assert.equal((await c.call('DELETE', 'profiles/p-churn', { key: churn, body: {} })).status, 200);
  assert.equal(day('profiles'), 1, 'made and deleted today still counts');
  for (const id of ['p-smoke-mv4cyiqj-b8bt', 'p-e2e-mv4cyiqj-c9cu']) {
    const key = await made(c, id);
    assert.equal((await c.call('DELETE', `profiles/${id}`, { key, body: {} })).status, 200);
  }
  assert.deepEqual([day('profiles'), day('check-profiles')], [1, 2], "the checks' count apart from kids'");
  c.env.DB.db.prepare("UPDATE counters SET n = ? WHERE name = 'profiles'").run(LIMITS.newProfilesPerDay);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-one-more') })).status, 429, 'fifty a day, however many went again');
  assert.equal((await c.call('POST', 'profiles', { body: look('p-smoke-mv4cyiqj-d0dv') })).status, 201, 'a check still runs');
  c.env.DB.db.prepare("UPDATE counters SET n = ? WHERE name = 'check-profiles'").run(LIMITS.checkProfilesPerDay);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-e2e-mv4cyiqj-e1ew') })).status, 429, "and the checks' cap holds too");
});

// The security seat, 2026-10-26: p-smoke-/p-e2e- is an id anyone can type, so
// a check profile holds only what a check needs, never shows, and goes soon.
test("a deploy check's profile holds 64 KB of records, one sound of 4 MB and one share, never shows in the list, and goes after 10 minutes", async () => {
  const c = cloud();
  const id = 'p-smoke-mv4cyiqj-b8bt';
  const key = await made(c, id);
  await made(c, 'p-kid');
  assert.deepEqual((await c.call('GET', 'profiles', { origin: null })).data.profiles.map((p) => p.id), ['p-kid'], 'not in the list');
  const push = (n) => c.call('POST', `profiles/${id}/records`, { key, body: { put: [{ kind: 'beats', id: `beat-${n}`, body: { name: 'x'.repeat(30_000) } }] } });
  assert.equal((await push(1)).status, 200);
  assert.equal((await push(2)).status, 200);
  assert.equal((await push(3)).data.error, 'records full', '64 KB');
  const start = (n, bytes) => c.call('POST', `profiles/${id}/sounds`, { key, body: { sha256: sha(n), bytes, mime: 'audio/wav' } });
  assert.equal((await start(1, 4 * 1024 * 1024 + 1)).data.error, 'profile full', '4 MB at most');
  const one = await start(2, CHUNK_BYTES + 54321);
  assert.equal(one.status, 201, "cloud-smoke's sound fits");
  assert.equal((await start(3, 10)).data.error, 'profile full', 'one sound');
  assert.equal((await c.call('POST', `profiles/${id}/shares`, { key, body: { kind: 'beat', title: 'Smoke test', bundle: { beats: [{ id: 'beat-1' }] } } })).status, 201);
  assert.equal((await c.call('POST', `profiles/${id}/shares`, { key, body: { kind: 'beat', title: 'Two', bundle: { beats: [{ id: 'beat-1' }] } } })).data.error, 'shares full', 'one share');
  // A kid's profile made 10 minutes on sweeps it away, with everything in it.
  c.later(CHECK_MS + 1);
  await made(c, 'p-kid-2');
  assert.equal((await c.call('GET', `profiles/${id}/records`, { key })).status, 401);
  for (const table of ['records', 'sounds', 'shares', 'keys']) {
    assert.equal(c.env.DB.rows(`SELECT COUNT(*) AS n FROM ${table} WHERE profile_id = ?`, id)[0].n, 0, table);
  }
  assert.deepEqual(c.env.DB.rows('SELECT id FROM profiles ORDER BY id').map((r) => r.id), ['p-kid', 'p-kid-2']);
});

test('writes come only from the site’s own page', async () => {
  const c = cloud();
  assert.equal((await c.call('POST', 'profiles', { body: look('p-a'), origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.call('POST', 'profiles', { body: look('p-a'), origin: null })).status, 403);
});

test('a resting database (over a daily limit) is 503 with over: true, never a crash', async () => {
  const c = cloud();
  const realError = console.error;
  console.error = () => {};
  c.env.DB.fail = 'D1_ERROR: Exceeded daily rows read limit';
  const r = await c.call('GET', 'profiles');
  console.error = realError;
  assert.equal(r.status, 503);
  assert.deepEqual(r.data, { error: 'cloud', over: true });
});

test('a push is all or nothing', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const realBatch = c.env.DB.batch.bind(c.env.DB);
  c.env.DB.batch = async (statements) => realBatch([...statements, c.env.DB.prepare('INSERT INTO nowhere VALUES (1)')]);
  const realError = console.error;
  console.error = () => {};
  const r = await c.call('POST', 'profiles/p-a/records', { key, body: { put: [{ kind: 'beats', id: 'beat-1', body: {} }] } });
  console.error = realError;
  assert.equal(r.status, 503);
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM records')[0].n, 0);
  assert.equal(c.env.DB.rows("SELECT rev FROM profiles WHERE id = 'p-a'")[0].rev, 0);
});

test('the public list never shows a profile whose id is a plain name from an older boards.json', async () => {
  const c = cloud();
  await made(c, 'p-one');
  await legacyProfile(c, 'pip');
  const r = await c.call('GET', 'profiles', { origin: null });
  assert.deepEqual(r.data.profiles.map((p) => p.id), ['p-one']);
  assert.doesNotMatch(JSON.stringify(r.data), /"pip"/);
});

test('a profile is made only with a random id: a plain one (a name) is refused', async () => {
  const c = cloud();
  for (const id of ['zed', 'zed-2', 'me', 'p-', 'P-ABC']) {
    const r = await c.call('POST', 'profiles', { body: look(id) });
    assert.equal(r.status, 400, id);
    assert.equal(r.data.error, 'id');
  }
  assert.equal(c.env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, 0);
});

// Ben, 2026-10-11 (Q27): "Drop the rename code". Both live plain-id
// profiles were moved by hand; the cloud renames nothing.
test('there is no rename route: a plain-id profile stays as it is', async () => {
  const c = cloud();
  const key = await legacyProfile(c, 'zed');
  const r = await c.call('POST', 'profiles/zed/rename', { key, body: { to: 'p-new-1' } });
  assert.equal(r.status, 404);
  assert.deepEqual(c.env.DB.rows('SELECT id FROM profiles').map((x) => x.id), ['zed']);
});

test('a share made before shares left out whose it was still shows no one\'s id', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const { data: { id: sound } } = await c.call('POST', 'profiles/p-a/sounds', { key, body: { sha256: sha(11), bytes: 1, mime: 'audio/wav' } });
  await c.call('PUT', `sounds/${sound}/0`, { key, raw: new Uint8Array([1]) });
  const { data: { code } } = await c.call('POST', 'profiles/p-a/shares', { key, body: { kind: 'beat', title: 'Boom', bundle: {
    clips: [{ id: 'user-1', personId: 'p-a', sound }], beats: [{ id: 'beat-1', personId: 'p-a', rows: [] }], songs: [{ id: 'song-1', personId: 'p-a', slots: [] }],
  } } });
  const r = await c.call('GET', `shares/${code}`, { origin: null });
  assert.doesNotMatch(JSON.stringify(r.data), /personId|p-a/);
  assert.equal(r.data.bundle.clips[0].sound, sound);
});

test('a push with `since` leaves a record someone wrote after that pull, and names it stale; without, every record is written', async () => {
  const c = cloud();
  const key = await made(c, 'p-a');
  const beat = (bpm) => ({ kind: 'beats', id: 'beat-1', body: { id: 'beat-1', bpm } });
  const push = (body) => c.call('POST', 'profiles/p-a/records', { key, body });
  assert.deepEqual((await push({ put: [beat(100)], since: 0 })).data, { rev: 1, was: 0, stale: [] });
  // Two devices pulled at rev 1; A pushes first, B's push of the same beat waits.
  assert.deepEqual((await push({ put: [beat(120)], since: 1 })).data.stale, []);
  const b = await push({ put: [beat(90), { kind: 'orders', id: 'p-a', body: { personId: 'p-a', ids: [] } }], del: [{ kind: 'beats', id: 'beat-2' }], since: 1 });
  assert.deepEqual(b.data, { rev: 3, was: 2, stale: [{ kind: 'beats', id: 'beat-1' }] }, 'the new record and the delete landed');
  const pulled = await c.call('GET', 'profiles/p-a/records?since=0', { key });
  assert.equal(pulled.data.records.find((r) => r.id === 'beat-1').body.bpm, 120, "A's edit is kept");
  // A delete is guarded the same way.
  assert.deepEqual((await push({ del: [{ kind: 'beats', id: 'beat-1' }], since: 1 })).data.stale, [{ kind: 'beats', id: 'beat-1' }]);
  // Caught up, B's push lands.
  assert.deepEqual((await push({ put: [beat(95)], since: 4 })).data.stale, []);
  // An older copy of the app sends no `since`: written, as before.
  assert.deepEqual((await push({ put: [beat(80)] })).data, { rev: 6, was: 5 });
  assert.equal((await c.call('GET', 'profiles/p-a/records?since=5', { key })).data.records[0].body.bpm, 80);
});
