// Old beats get their time signature stamped once (Ben, 2026-10-27): a beat
// saved before each beat had its own has none, and used to be read by a guess
// (the old Settings signature with Advanced on, else 4/4). Now the guess is
// written into the beat as it is stored (the database upgrade) and as it comes
// in (a backup, a beat file), so what a kid hears does not change and nothing
// guesses. The pure rule, the upgrade on a stand-in IndexedDB, a 1.0 backup, a
// beat file, and the song's pass length (tests/song-unsigned.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeIndexedDB } from './fake-idb.mjs';
import { unsignedAs, stampBeats, SIGNATURES } from '../web/old-beats.js';
import { db, DB_NAME, DB_VERSION, SCHEMA } from '../web/store.js';
import { levelOf } from '../web/settings.js';
import { cleanBackup, readBackup, BACKUP_APP } from '../web/backup.js';
import { beatFromFile, cleanPattern } from '../web/beat.js';
import { buildZip, blobOf, utf8 } from './helpers.mjs';

const row = { clipId: 'pip-kick', steps: [true, ...Array(15).fill(false)] };
const beat = (over = {}) => ({ id: 'beat-a1', personId: 'pip', name: 'Old', bpm: 100, bars: 1, rows: [row], created: 1, saved: 2, ...over });

test('the guess it stamps: the old signature with Advanced on, else 4/4; the person first, then the device', () => {
  assert.equal(unsignedAs(), '4/4');
  assert.equal(unsignedAs({ advancedBeats: true, timeSignature: '3/4' }), '3/4');
  assert.equal(unsignedAs({ advancedBeats: false, timeSignature: '3/4' }), '4/4', 'Advanced off: 4/4 whatever the old setting');
  assert.equal(unsignedAs({ timeSignature: '3/4' }), '4/4', 'no Advanced anywhere');
  assert.equal(unsignedAs({ level: 'advanced', timeSignature: '6/8' }), '6/8', 'a level of Advanced counts');
  assert.equal(unsignedAs({ level: 'kids', timeSignature: '6/8' }), '4/4');
  assert.equal(unsignedAs({ advancedBeats: true }, { timeSignature: '7/8' }), '7/8', 'a person with no signature of their own reads the device');
  assert.equal(unsignedAs({ advancedBeats: false }, { advancedBeats: true, timeSignature: '3/4' }), '4/4', 'the person who chose Regular is not moved by the device');
  assert.equal(unsignedAs(undefined, { advancedBeats: true, timeSignature: '5/4' }), '5/4');
  assert.equal(unsignedAs({ advancedBeats: true, timeSignature: '13/16' }), '4/4', 'a signature nobody can play reads as 4/4');
});

test('it reads Advanced as settings.js does, for every shape a person is stored in', () => {
  const shapes = [undefined, {}, { advancedBeats: true }, { advancedBeats: false }, { level: 'advanced' }, { level: 'regular' }, { level: 'kids' },
    { level: 'advanced', advancedBeats: false }, { level: 'kids', advancedBeats: true }, { level: 'nope' }, { advancedBeats: 'yes' }];
  for (const values of shapes) {
    // The device says Regular, so only the person's own reading can make it Advanced.
    const advanced = levelOf(values) === 'advanced';
    assert.equal(unsignedAs({ ...values, timeSignature: '3/4' }, { timeSignature: '3/4', advancedBeats: false }) === '3/4', advanced, JSON.stringify(values));
  }
});

test('stampBeats: only a beat with no signature changes, by its own person\'s settings', () => {
  const out = stampBeats(
    [beat(), beat({ id: 'beat-a2', signature: '5/4' }), beat({ id: 'beat-a3', personId: 'juno' }), beat({ id: 'beat-a4', personId: 'toby' })],
    [{ personId: 'pip', values: { advancedBeats: true, timeSignature: '3/4' } }, { personId: 'juno', values: { advancedBeats: false } }],
    [{ key: 'advancedBeats', value: true }, { key: 'timeSignature', value: '6/8' }],
  );
  assert.deepEqual(out.map((b) => [b.id, b.signature]), [['beat-a1', '3/4'], ['beat-a3', '4/4'], ['beat-a4', '6/8']]);
  assert.ok(out.every((b) => Object.hasOwn(SIGNATURES, b.signature)));
  assert.deepEqual(stampBeats(null, null, null), []);
});

test('the database upgrade stamps every stored beat and open beat, and touches nothing else', async () => {
  const fake = fakeIndexedDB();
  fake.seed(DB_NAME, 15, SCHEMA, {
    beats: [
      beat(),                                                       // Advanced, 3/4
      beat({ id: 'beat-b2', personId: 'juno', name: 'Plain' }),     // Regular
      beat({ id: 'beat-b3', personId: 'toby', name: 'Device' }),    // no choices of their own
      beat({ id: 'beat-b4', signature: '5/4', name: 'Signed' }),
    ],
    patterns: [{ personId: 'pip', name: '', bpm: 100, bars: 1, rows: [row] }, { personId: 'juno', name: '', bpm: 90, bars: 1, signature: '6/8', rows: [] }],
    prefs: [{ personId: 'pip', values: { advancedBeats: true, level: 'advanced', timeSignature: '3/4' } }, { personId: 'juno', values: { level: 'regular', advancedBeats: false } }],
    settings: [{ key: 'advancedBeats', value: true }, { key: 'timeSignature', value: '7/8' }, { key: 'sendUsage', value: false }],
    songbook: [{ id: 'song-x1', personId: 'pip', name: 'S', lanes: [] }],
  });
  const before = JSON.stringify([fake.rows(DB_NAME, 'prefs'), fake.rows(DB_NAME, 'settings'), fake.rows(DB_NAME, 'songbook')]);
  globalThis.indexedDB = fake;
  await db.open();
  db.handle = null;
  const sig = (store) => Object.fromEntries(fake.rows(DB_NAME, store).map((r) => [r.id ?? r.personId, r.signature]));
  assert.deepEqual(sig('beats'), { 'beat-a1': '3/4', 'beat-b2': '4/4', 'beat-b3': '7/8', 'beat-b4': '5/4' });
  assert.deepEqual(sig('patterns'), { pip: '3/4', juno: '6/8' });
  assert.equal(JSON.stringify([fake.rows(DB_NAME, 'prefs'), fake.rows(DB_NAME, 'settings'), fake.rows(DB_NAME, 'songbook')]), before);
  assert.equal(fake.rows(DB_NAME, 'beats').find((b) => b.id === 'beat-a1').rows[0].clipId, 'pip-kick', 'the rest of a beat is as it was');
  assert.equal((await fake.databases())[0].version, DB_VERSION);
});

test('a new database has nothing to stamp, and a stamped one is not touched again', async () => {
  const fresh = fakeIndexedDB();
  globalThis.indexedDB = fresh;
  await db.open();
  db.handle = null;
  assert.deepEqual(fresh.rows(DB_NAME, 'beats'), []);
  const same = fakeIndexedDB();
  same.seed(DB_NAME, DB_VERSION, SCHEMA, { beats: [beat()] });
  globalThis.indexedDB = same;
  await db.open();
  db.handle = null;
  assert.equal(same.rows(DB_NAME, 'beats')[0].signature, undefined, 'at the current version the upgrade does not run');
});

test('an upgrade that cannot read a store still finishes: the database must open', async () => {
  const fake = fakeIndexedDB();
  fake.seed(DB_NAME, 15, SCHEMA.filter((s) => s.name !== 'prefs'), { beats: [beat()] });   // a broken database: no prefs store
  globalThis.indexedDB = fake;
  await db.open();
  db.handle = null;
  assert.equal(fake.rows(DB_NAME, 'beats')[0].signature, undefined);
});

test('a request that fails in the upgrade does not stop the database opening, and the beats stay unsigned', async () => {
  const seeded = () => {
    const fake = fakeIndexedDB();
    fake.seed(DB_NAME, 15, SCHEMA, {
      beats: [beat()],
      patterns: [{ personId: 'pip', name: '', bpm: 100, bars: 1, rows: [row] }],
      prefs: [{ personId: 'pip', values: { advancedBeats: true, timeSignature: '3/4' } }],
    });
    return fake;
  };
  for (const failure of [{ getAll: 'prefs' }, { getAll: 'settings' }, { getAll: 'beats' }, { getAll: 'patterns' }]) {
    const fake = seeded();
    fake.failRequests(failure);
    globalThis.indexedDB = fake;
    await db.open();   // would reject if the failed read aborted the upgrade
    db.handle = null;
    assert.equal(fake.rows(DB_NAME, 'beats')[0].signature, undefined, `${JSON.stringify(failure)}: left unsigned`);
    assert.equal(fake.rows(DB_NAME, 'patterns')[0].signature, undefined);
    assert.equal((await fake.databases())[0].version, DB_VERSION);
  }
  const fake = seeded();
  fake.failRequests({ put: 'beats' });
  globalThis.indexedDB = fake;
  await db.open();
  db.handle = null;
  assert.equal(fake.rows(DB_NAME, 'beats')[0].signature, undefined, 'a beat that cannot be written is left as it was');
  assert.equal(fake.rows(DB_NAME, 'patterns')[0].signature, '3/4', 'the others are still stamped');
});

// ── coming in ──

const here = (extra = {}) => ({ peopleIds: new Set(['pip', 'juno']), clipIds: new Set(['pip-kick']), colorOk: () => true, ...extra });
const backupOf = (doc) => blobOf(buildZip([{ name: 'backup.json', data: utf8(JSON.stringify({ app: BACKUP_APP, ...doc })) }]));

test('a 1.0 backup with an unsigned beat loads stamped by its own settings, and nothing is dropped', async () => {
  const doc = {
    format: '1.0',
    beats: [beat(), beat({ id: 'beat-c2', personId: 'juno' }), beat({ id: 'beat-c3', signature: '6/8' })],
    patterns: [{ personId: 'pip', name: '', bpm: 100, rows: [row] }],
    prefs: [{ personId: 'pip', values: { advancedBeats: true, level: 'advanced', timeSignature: '3/4' } }],
    settings: [{ key: 'advancedBeats', value: false }],
  };
  const out = await readBackup(backupOf(doc), here());
  assert.deepEqual(out.beats.map((b) => [b.id, b.signature]), [['beat-a1', '3/4'], ['beat-c2', '4/4'], ['beat-c3', '6/8']]);
  assert.equal(out.patterns[0].signature, '3/4');
  assert.equal(out.skipped, 0);
  assert.deepEqual(out.left, {});
  assert.equal(out.beats[0].rows[0].clipId, 'pip-kick');
});

test('a 1.0 backup with no settings of its own is stamped by this device\'s, and a 1.1 backup the same', async () => {
  for (const format of ['1.0', '1.1']) {
    const out = await readBackup(backupOf({ format, beats: [beat()] }), here({ settingsHere: { prefs: new Map([['pip', { advancedBeats: true, timeSignature: '7/8' }]]), device: {} } }));
    assert.equal(out.beats[0].signature, '7/8', format);
    const bare = await readBackup(backupOf({ format, beats: [beat()] }), here());
    assert.equal(bare.beats[0].signature, '4/4', 'with no choices anywhere');
  }
});

test('a cloud pull (cleanBackup of beats alone) stamps from the person\'s settings here', () => {
  const cleaned = cleanBackup({ beats: [beat()], people: [] }, () => null, here({ settingsHere: { prefs: new Map([['pip', { level: 'advanced', timeSignature: '5/4' }]]), device: {} } }));
  assert.equal(cleaned.beats[0].signature, '5/4');
});

test('a backup\'s beat that already has a signature keeps it', () => {
  const cleaned = cleanBackup({ beats: [beat({ signature: '6/8' })], prefs: [{ personId: 'pip', values: { advancedBeats: true, timeSignature: '3/4' } }], people: [] }, () => null, here());
  assert.equal(cleaned.beats[0].signature, '6/8');
});

test('a beat file with no signature is stamped with what the person reads it in; one with a signature keeps it', () => {
  const file = (over = {}) => JSON.stringify({ format: 'noodlepads-beat', version: 1, name: 'Old file', bpm: 100, bars: 1, rows: [{ sound: 'kick', steps: [true] }], ...over });
  assert.equal(beatFromFile(file(), 'pip', ['kick'], '3/4').signature, '3/4');
  assert.equal(beatFromFile(file({ signature: '7/8' }), 'pip', ['kick'], '3/4').signature, '7/8');
  assert.equal(beatFromFile(file(), 'pip', ['kick']).signature, undefined, 'asked for no stamp, it stays unsigned and plays as 4/4');
});

test('cleanPattern writes `unsigned` only into a beat with none, and only a signature that exists', () => {
  assert.equal(cleanPattern(beat(), 'pip', '3/4').signature, '3/4');
  assert.equal(cleanPattern(beat({ signature: '5/4' }), 'pip', '3/4').signature, '5/4');
  assert.equal(cleanPattern(beat(), 'pip', '9/9').signature, undefined);
  assert.equal(cleanPattern(beat(), 'pip').signature, undefined);
});
