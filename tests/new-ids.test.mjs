// Random ids for everyone (web/reid.js, state.js reIdStoredPeople, ADR 0002):
// the real app starts on a device an older copy left, where one person still
// has a plain id (an older boards.json's: a kid's name), stored in every
// store, linked to a cloud profile under that id, remembered as the person
// showing and in the address. After the start, nothing on the device or in
// the address names the old id, and nothing the app sent did. The cloud
// renames nothing (Ben, Q27: "Drop the rename code"): the link is dropped and
// the person stays on the device under their random id; nobody goes to the
// cloud by themselves, so they are not put back there until a grown-up does.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { FakeD1 } from './fake-d1.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { isCloudId } from '../web/reid.js';

const OLD = 'zed';   // made up; the real ones were first names
const OTHER = 'p-ok-1';
const MOVED = 'kip';             // another plain id, whose profile an older copy here waited to rename
const WAITING = 'p-waiting-1';   // the random id that older copy gave its person (link.was = MOVED)
const LOCKED = 'vex';            // a plain id with a PIN this device does not remember
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const sent = [];     // every request the app made to the cloud: [method, path, body]
const remembered = new Map();
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => remembered.set(k, String(v)),
  removeItem: (k) => remembered.delete(k),
};
const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

// Everything of OLD's in every store, and someone else whose records must not change.
function oldDevice(key, movedKey) {
  const mine = (id) => ({ personId: id });
  return {
    people: [
      { id: OLD, name: 'Admiral Acorn', color: '#1F3FA8', added: true, fun: true, created: 1, edited: 2 },
      { id: OTHER, name: 'Sir Squid', color: '#0C5E4B', added: true, fun: true, created: 3 },
      { id: WAITING, name: 'Baron Bagel', color: '#9E1640', added: true, fun: true, created: 4, edited: 2 },
      { id: LOCKED, name: 'Duke Donut', color: '#4C2A8C', added: true, fun: true, created: 5, edited: 2 },
    ],
    clips: [
      { id: 'user-1', ...mine(OLD), label: 'Burp', emoji: '😂', mime: 'audio/wav', blob: blob(), created: 5 },
      { id: 'user-2', ...mine(OTHER), label: 'Toot', emoji: '📣', mime: 'audio/wav', blob: blob(), created: 6 },
      { id: 'user-3', ...mine(WAITING), label: 'Zap', emoji: '⚡', mime: 'audio/wav', blob: blob(), created: 7 },
      { id: 'user-4', ...mine(LOCKED), label: 'Bloop', emoji: '💧', mime: 'audio/wav', blob: blob(), created: 8 },
    ],
    overrides: [{ id: `${OLD}-kick`, label: 'Boom' }, { id: `${OTHER}-kick`, label: 'Thud' }, { id: `${WAITING}-kick`, label: 'Bonk' }],
    orders: [{ ...mine(OLD), ids: [`${OLD}-kick`, 'user-1'] }],
    patterns: [{ ...mine(OLD), name: 'Open', bpm: 100, rows: [{ clipId: `${OLD}-snare`, steps: [1] }] }],
    beats: [{ id: 'beat-1', ...mine(OLD), name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${OLD}-kick`, steps: [1] }, { clipId: 'user-1', steps: [0, 1] }], created: 6, saved: 6 }],
    decks: [{ ...mine(OLD), keys: { KeyA: `${OLD}-kick`, KeyS: 'user-1' }, beatId: 'beat-1' }],
    takes: [{ id: 'take-1', ...mine(OLD), name: 'Take', created: 7, duration: 1, events: [{ t: 0, clipId: `${OLD}-kick`, kind: 'hit' }] }],
    songs: [{ id: 'song-1', ...mine(OLD), name: 'Song', slots: [{ beatId: 'beat-1', times: 2 }] }],
    songbook: [{ id: 'song-1', ...mine(OLD), name: 'Song', slots: [{ beatId: 'beat-1', times: 2 }], created: 8, saved: 8 }],
    prefs: [{ ...mine(OLD), values: { padSize: 130 } }, { ...mine(OTHER), values: { padSize: 60 } }],
    settings: [{ key: 'sendLogs', value: false }],
    cloud: [{ id: OLD, key, rev: 0, sent: {}, sounds: {}, pin: false }, { id: WAITING, was: MOVED, key: movedKey, rev: 0, sent: {}, sounds: {}, pin: false },
      { id: LOCKED, key: null, rev: 0, sent: {}, sounds: {}, pin: true, remember: false }],
  };
}

// Records as text, audio left out.
const textOf = (rows) => JSON.stringify(rows.map(({ blob: _b, ...r }) => r));
const stored = (store) => idb.rows(DB_NAME, store);

let page;
let state;
let cloud;
let newId;

before(async () => {
  console.error = () => {};   // sounds fail to decode without audio; expected here
  // The cloud as an older copy left it: profiles under plain ids (made
  // under a random one and moved in SQL: the Worker makes no other now).
  const call = async (path, body, key) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  }), env)).json();
  const legacy = async (id, name, pin = '1357') => {
    const { key } = await call('profiles', { id: 'p-made-then-moved', name, avatar: '', color: '#1F3FA8', pin });
    env.DB.db.prepare('UPDATE profiles SET id = ? WHERE id = ?').run(id, 'p-made-then-moved');
    env.DB.db.prepare('UPDATE keys SET profile_id = ? WHERE profile_id = ?').run(id, 'p-made-then-moved');
    return key;
  };
  const key = await legacy(OLD, 'Admiral Acorn');
  const movedKey = await legacy(MOVED, 'Baron Bagel');
  await legacy(LOCKED, 'Admiral Acorn', '2468');

  idb.seed(DB_NAME, DB_VERSION, SCHEMA, oldDevice(key, movedKey));
  globalThis.indexedDB = idb;
  remembered.set('person', OLD);
  remembered.set('chooser-closed', JSON.stringify([`person:${OLD}`, `person:${OTHER}`]));
  page = installPage({ manifest: testManifest(), storage, hash: `#${OLD}` });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    sent.push([init.method ?? 'GET', String(url), typeof init.body === 'string' ? init.body : '']);
    return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
  };
  await (await import('../web/app.js')).ready;   // drawn and wired
  ({ state } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  // Wait for start-up's re-id itself: under the full suite's load it took
  // longer than the old fixed 20 ms settle() (it failed about one run in
  // three that way, 2026-10-11).
  for (const end = Date.now() + 3000; !state.settings.get('renamedPeople')?.[OLD] && Date.now() < end;) await page.settle();
  await cloud.syncAll();
  newId = state.settings.get('renamedPeople')?.[OLD];
});

test('on start, the person with a plain id gets a random one, and every store follows', () => {
  assert.ok(isCloudId(newId), newId);
  for (const { name } of SCHEMA) {
    if (name === 'settings') continue;
    assert.doesNotMatch(textOf(stored(name)), new RegExp(`"${OLD}[-"]`), `${name} names the old id no more`);
  }
  const keyPath = Object.fromEntries(SCHEMA.map((x) => [x.name, x.keyPath]));
  const one = (store, key) => stored(store).find((r) => r[keyPath[store]] === key);
  assert.equal(one('people', newId).name, 'Admiral Acorn');
  assert.equal(one('clips', 'user-1').personId, newId);
  assert.equal(one('overrides', `${newId}-kick`).label, 'Boom');
  assert.deepEqual(one('orders', newId).ids, [`${newId}-kick`, 'user-1']);
  assert.equal(one('patterns', newId).rows[0].clipId, `${newId}-snare`);
  assert.deepEqual(one('beats', 'beat-1').rows.map((r) => r.clipId), [`${newId}-kick`, 'user-1']);
  assert.deepEqual(one('decks', newId).keys, { KeyA: `${newId}-kick`, KeyS: 'user-1' });
  assert.equal(one('takes', 'take-1').events[0].clipId, `${newId}-kick`);
  assert.equal(one('songs', newId).slots[0].beatId, 'beat-1');
  assert.equal(stored('songbook')[0].personId, newId);
  assert.equal(one('prefs', newId).values.padSize, 130);
  assert.ok(stored('clips').find((c) => c.id === 'user-1').blob instanceof Blob, 'the audio is kept');
  // Someone with a random id already is left alone.
  assert.equal(one('clips', 'user-2').personId, OTHER);
  assert.equal(one('overrides', `${OTHER}-kick`).label, 'Thud');
  assert.equal(one('prefs', OTHER).values.padSize, 60);
  // And in memory.
  assert.equal(state.personId, newId);
  assert.ok(!state.peopleEdits.has(OLD));
});

test('the person showing, the address and the closed chooser sections follow', () => {
  assert.equal(remembered.get('person'), newId);
  assert.equal(globalThis.location.hash, `#${newId}`);
  assert.deepEqual(JSON.parse(remembered.get('chooser-closed')).sort(), [`person:${newId}`, `person:${OTHER}`].sort());
});

test('the person stays on the device under the random id, not in the cloud; nothing the app sent named a plain id', async () => {
  const profiles = env.DB.rows('SELECT id FROM profiles').map((r) => r.id);
  assert.deepEqual(profiles.filter(isCloudId), [], 'nobody went up by themselves, though each made something');
  assert.deepEqual(profiles.filter((id) => !isCloudId(id)).sort(), [MOVED, OLD, LOCKED].sort(), 'the plain-id profiles are left as they are');
  assert.equal(stored('cloud').length, 0, 'no link is left: the plain-id ones were dropped, and nobody was linked');
  assert.equal(cloud.inCloud(newId), false);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM records')[0].n, 0, 'nothing of theirs was sent');
  assert.ok(sent.length > 0);
  for (const [, path, body] of sent) {
    const id = /^\/api\/profiles\/([^/?]+)/.exec(path)?.[1];
    if (id) assert.ok(isCloudId(decodeURIComponent(id)), path);
    assert.doesNotMatch(body, new RegExp(`"${OLD}[-"]`), `${path} sent the old id`);
  }
  assert.doesNotMatch(JSON.stringify(env.DB.rows('SELECT * FROM records')), new RegExp(`"${OLD}[-"]`));
});

test('the next start finds nothing to do', async () => {
  const before = textOf(stored('clips'));
  assert.deepEqual(await (await import('../web/state.js')).reIdStoredPeople(), []);
  assert.equal(textOf(stored('clips')), before);
});

test('a re-id that cannot be saved changes nothing, and the next try does it all', async () => {
  const { reIdStoredPeople, persist } = await import('../web/state.js');
  const { readStorage } = await import('../web/state.js');
  await persist('people', { id: 'rue', name: 'Captain Comet', color: '#9E1640', added: true, created: 9 });
  await persist('clips', { id: 'user-9', personId: 'rue', label: 'Zap', mime: 'audio/wav', blob: blob(), created: 9 });
  await persist('orders', { personId: 'rue', ids: ['rue-kick'] });
  await readStorage();
  idb.failCommit(1);
  await assert.rejects(reIdStoredPeople());
  assert.ok(stored('people').some((p) => p.id === 'rue'), 'all of it stays as it was');
  assert.equal(stored('clips').find((c) => c.id === 'user-9').personId, 'rue');
  assert.ok(stored('orders').some((o) => o.personId === 'rue'));
  const [[from, to]] = await reIdStoredPeople();
  assert.equal(from, 'rue');
  assert.equal(stored('clips').find((c) => c.id === 'user-9').personId, to);
  assert.deepEqual(stored('orders').find((o) => o.personId === to).ids, [`${to}-kick`]);
  assert.ok(!stored('people').some((p) => p.id === 'rue'));
});

test('an old backup naming the old id lands on the same person, not a second one', async () => {
  const { storeLoaded, whatIsHere } = await import('../web/backup-ui.js');
  const { cleanBackup } = await import('../web/backup.js');
  const peopleBefore = stored('people').length;
  const audio = blob();
  const data = cleanBackup({
    format: 'noodle-pads', version: '1.0',
    people: [{ id: OLD, name: 'Admiral Acorn', color: '#1F3FA8', added: true, fun: true, created: 1, edited: 2 }],
    clips: [{ id: 'user-old-1', personId: OLD, label: 'Old burp', mime: 'audio/wav', created: 4 }],
    beats: [{ id: 'beat-old-1', personId: OLD, name: 'Old beat', bpm: 90, bars: 1, rows: [{ clipId: `${OLD}-kick`, steps: [1] }], created: 4, saved: 4 }],
  }, () => audio, whatIsHere());
  await storeLoaded(data);
  assert.equal(stored('people').length, peopleBefore, 'no second person');
  assert.equal(stored('clips').find((c) => c.id === 'user-old-1').personId, newId);
  assert.deepEqual(stored('beats').find((b) => b.id === 'beat-old-1').rows.map((r) => r.clipId), [`${newId}-kick`]);
  assert.ok(!stored('people').some((p) => p.id === OLD));
});

// A change waits SYNC_DELAY_MS before it syncs; syncing now clears that wait,
// so the test ends when it is done.
after(async () => {
  await cloud.syncAll();
});

test('a link an older copy kept waiting for a rename is dropped, and its person stays on the device under the id they have', () => {
  const keyPath = Object.fromEntries(SCHEMA.map((x) => [x.name, x.keyPath]));
  const one = (store, key) => stored(store).find((r) => r[keyPath[store]] === key);
  assert.equal(one('people', WAITING).name, 'Baron Bagel');
  assert.equal(stored('people').filter((p) => p.name === 'Baron Bagel').length, 1, 'one person, not two');
  assert.equal(one('cloud', WAITING), undefined, 'no link');
  assert.equal(cloud.inCloud(WAITING), false);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM records WHERE profile_id = ?', WAITING)[0].n, 0, 'nothing was sent under it');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM records WHERE profile_id = ?', MOVED)[0].n, 0, 'nothing went to the old profile');
  assert.deepEqual(stored('bases').filter((b) => b.personId === WAITING), [], 'no merge bases without a link');
  assert.ok(one('clips', 'user-3'), 'their sound is still here');
});

test('a plain-id person whose PIN this device does not remember stays on the device too, with no link and no wait', () => {
  const id = state.settings.get('renamedPeople')[LOCKED];
  assert.ok(isCloudId(id));
  assert.equal(cloud.linkOf(id), null);
  assert.equal(cloud.statusOf(id), null);
  assert.deepEqual(env.DB.rows('SELECT id FROM profiles WHERE id = ?', id), []);
});
