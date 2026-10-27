import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, readBackup, heardWav, MAX_HEARD_BYTES, cleanBackup, personBackupLists, onePersonIn, intoPerson, namesPerson, withoutPeople, BACKUP_APP, BACKUP_FORMAT, MAX_SOUND_BYTES, refusal, beforeOne } from '../web/backup.js';
import { buildZip, blobOf, bytes, utf8, failure, fakeBuffer } from './helpers.mjs';
import { unzip } from '../web/zip.js';
import { isFunName } from '../web/names.js';

const bundled = (extra = {}) => ({
  peopleIds: new Set(['pip', 'juno']),
  clipIds: new Set(['pip-airhorn', 'juno-laser']),
  colorOk: (name) => ['red', 'blue', 'yellow'].includes(name),
  ...extra,
});

const goodClip = (over = {}) => ({
  id: 'user-abc-1234', personId: 'pip', label: 'Boom', emoji: '💥', color: 'red',
  voice: 'chipmunk', amount: 2, mime: 'audio/webm', created: 1000, file: 'sounds/user-abc-1234.webm', ...over,
});

// A backup zip from a document and the sound files it points at.
const backupOf = (doc, sounds = { 'sounds/user-abc-1234.webm': bytes(1, 2, 3) }) => blobOf(buildZip([
  { name: 'backup.json', data: utf8(JSON.stringify({ app: BACKUP_APP, format: BACKUP_FORMAT, ...doc })) },
  ...Object.entries(sounds).map(([name, data]) => ({ name, data })),
]));

const read = (doc, sounds, b = bundled()) => readBackup(backupOf(doc, sounds), b);

test('makeBackup then readBackup returns what went in', async () => {
  const state = {
    people: [
      { id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' },
      { id: 'p-new-1', name: 'Nana', color: '#0C5E4B', added: true, created: 5 },
    ],
    clips: [{ ...goodClip(), personId: 'p-new-1', blob: new Blob([bytes(7, 8, 9)], { type: 'audio/webm' }), exact: true }],
    overrides: [{ id: 'pip-airhorn', label: 'Honk', hidden: true }],
    orders: [{ personId: 'pip', ids: ['pip-airhorn', 'pip-laser'] }],
    patterns: [{ personId: 'pip', name: 'x', bpm: 120, rows: [{ clipId: 'pip-airhorn', steps: Array(16).fill(true) }] }],
    beats: [{ id: 'beat-q-1', personId: 'pip', name: 'Groove', bpm: 90, rows: [{ clipId: 'pip-airhorn', steps: [] }], created: 1, saved: 2 }],
    settings: [{ key: 'timeSignature', value: '3/4' }],
  };
  const out = await readBackup(await makeBackup(state, '1.2.3'), bundled());
  assert.deepEqual(out.settings, [{ key: 'timeSignature', value: '3/4' }]);
  assert.equal(out.skipped, 0);
  assert.equal(out.version, '1.2.3');
  assert.deepEqual(out.people, state.people);
  assert.deepEqual(out.overrides, state.overrides);
  assert.deepEqual(out.orders, state.orders);
  assert.equal(out.patterns[0].bpm, 120);
  assert.equal(out.patterns[0].rows[0].steps.length, 16);
  assert.equal(out.beats[0].name, 'Groove');
  assert.equal(out.beats[0].saved, 2);
  assert.equal(out.clips.length, 1);
  const c = out.clips[0];
  assert.equal(c.id, 'user-abc-1234');
  assert.equal(c.personId, 'p-new-1');
  assert.equal(c.exact, true);
  assert.equal(c.voice, 'chipmunk');
  assert.equal(c.amount, 2);
  assert.equal(c.blob.type, 'audio/webm');
  assert.deepEqual(new Uint8Array(await c.blob.arrayBuffer()), bytes(7, 8, 9));
  assert.ok(!('file' in c));
});

test('a chain of voices (fx) survives a backup, on a recorded sound and on an edit of a bundled one', async () => {
  const fx = [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'stadium' }];
  const state = {
    people: [], orders: [], patterns: [], beats: [],
    clips: [{ ...goodClip(), fx, blob: new Blob([bytes(1)], { type: 'audio/webm' }) }],
    overrides: [{ id: 'pip-airhorn', voice: 'slow', amount: 8, fx: [{ type: 'voice', voice: 'slow', amount: 8 }, { type: 'voice', voice: 'robot' }] }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.clips[0].fx, fx);
  assert.equal(out.clips[0].voice, 'chipmunk', 'the first voice is kept as `voice` too');
  assert.deepEqual(out.overrides[0].fx, state.overrides[0].fx);
  assert.equal(out.skipped, 0);
});

test('Tweaks survive a backup, on a recorded sound and on an edit of a bundled one; junk tweaks are cleaned', async () => {
  const tweaks = { pitch: -5, speed: -0.3, echo: 1, volume: 2, warble: 1, backwards: true };
  const state = {
    people: [], orders: [], patterns: [], beats: [],
    clips: [
      { ...goodClip(), tweaks, blob: new Blob([bytes(1)], { type: 'audio/webm' }) },
      { ...goodClip({ id: 'user-abc-5678' }), tweaks: { pitch: -99, echo: 'lots', volume: 0, nope: 1 }, blob: new Blob([bytes(2)], { type: 'audio/webm' }) },
      { ...goodClip({ id: 'user-abc-9999' }), tweaks: 'deeper', blob: new Blob([bytes(3)], { type: 'audio/webm' }) },
    ],
    overrides: [{ id: 'pip-airhorn', tweaks: { pitch: 4 } }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.clips[0].tweaks, tweaks);
  assert.deepEqual(out.clips[1].tweaks, { pitch: -24 }, 'clamped; a word and a normal value dropped');
  assert.ok(!('tweaks' in out.clips[2]));
  assert.deepEqual(out.overrides[0].tweaks, { pitch: 4 });
  assert.equal(out.skipped, 0);
});

test('a trim and a chop\'s `from` survive a backup, on a recorded sound and on an edit of a bundled one', async () => {
  const state = {
    people: [], orders: [], patterns: [], beats: [],
    clips: [{ ...goodClip(), trim: { start: 0.25, end: 1.5 }, from: { id: 'pip-airhorn', how: 'chop' }, blob: new Blob([bytes(1)], { type: 'audio/webm' }) }],
    overrides: [{ id: 'pip-airhorn', trim: { start: 0, end: 0.8 } }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.clips[0].trim, { start: 0.25, end: 1.5 });
  assert.deepEqual(out.clips[0].from, { id: 'pip-airhorn', how: 'chop' });
  assert.deepEqual(out.overrides, state.overrides);
  assert.equal(out.skipped, 0);
});

test('junk trims and `from` values are dropped, and the sound is kept', async () => {
  const junkTrims = ['1-2', [0, 1], { start: 2, end: 1 }, { start: 0, end: 0.001 }, { start: '0', end: '1' }, { start: 0, end: Infinity }, null];
  const junkFroms = ['user-abc-1', { id: '../x', how: 'chop' }, { id: 'user-abc-1', how: 'steal' }, { id: 'x'.repeat(99), how: 'mix' }, {}, 7, null];
  const out = await read({
    clips: junkTrims.map((trim, i) => goodClip({ id: `user-abc-${i}`, trim, from: junkFroms[i] })),
    overrides: [{ id: 'pip-airhorn', trim: { start: -5, end: 1e9 } }, { id: 'juno-laser', trim: 'all', label: 'Zap' }],
  });
  assert.equal(out.clips.length, junkTrims.length, 'every sound is kept');
  for (const c of out.clips) assert.ok(!('trim' in c) && !('from' in c), JSON.stringify(c));
  assert.deepEqual(out.overrides[0].trim, { start: 0, end: 600 }, 'clamped into range');
  assert.ok(!('trim' in out.overrides[1]));
  assert.equal(out.skipped, 0);
});

test('the wave editor\'s edits and fade survive a backup, on a recorded sound and on an edit of a bundled one', async () => {
  const edits = [{ kind: 'reverse', start: 0.2, end: 0.5 }, { kind: 'gain', start: 0, end: 1, amount: 4 }, { kind: 'silence', start: 1, end: 1.2 }];
  const state = {
    people: [], orders: [], patterns: [], beats: [],
    clips: [{ ...goodClip(), edits, fade: { in: 0.1, out: 0.3 }, blob: new Blob([bytes(1)], { type: 'audio/webm' }) }],
    overrides: [{ id: 'pip-airhorn', edits: [{ kind: 'silence', start: 0, end: 0.4 }], fade: { in: 0, out: 0.2 } }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.clips[0].edits, edits);
  assert.deepEqual(out.clips[0].fade, { in: 0.1, out: 0.3 });
  assert.deepEqual(out.overrides, state.overrides);
  assert.equal(out.skipped, 0);
});

test('junk edits and fades are dropped or clamped, and the sound is kept', async () => {
  const junkEdits = ['reverse', [{ kind: 'boom', start: 0, end: 1 }], [{ kind: 'gain', start: 0, end: 1 }], [null, 7], { kind: 'reverse' }];
  const junkFades = [{ in: -1, out: 0 }, 'slow', { in: 'x' }, [], null];
  const out = await read({
    clips: junkEdits.map((edits, i) => goodClip({ id: `user-abc-${i}`, edits, fade: junkFades[i] })),
    overrides: [{ id: 'pip-airhorn', edits: [{ kind: 'gain', start: -3, end: 1e9, amount: 1e6, x: 'y' }, { kind: 'warp', start: 0, end: 1 }], fade: { in: 1e9, out: 0.5 } }],
  });
  assert.equal(out.clips.length, junkEdits.length, 'every sound is kept');
  for (const c of out.clips) assert.ok(!('edits' in c) && !('fade' in c), JSON.stringify(c));
  assert.deepEqual(out.overrides[0].edits, [{ kind: 'gain', start: 0, end: 600, amount: 8 }], 'clamped, the unknown kind dropped');
  assert.deepEqual(out.overrides[0].fade, { in: 600, out: 0.5 });
  assert.equal(out.skipped, 0);
});

test('a junk chain is cleaned: unknown steps dropped, amounts clamped, one voice left means no fx', async () => {
  const out = await read({
    clips: [
      goodClip({ fx: [{ type: 'voice', voice: 'slow', amount: 999 }, { type: 'laser' }, 'x', null, { type: 'voice', voice: 'nope' }, { type: 'voice', voice: 'robot', amount: 3 }] }),
      goodClip({ id: 'user-abc-2', file: 'sounds/user-abc-1234.webm', fx: [{ type: 'voice', voice: 'robot' }, { type: 'warp' }] }),
      goodClip({ id: 'user-abc-3', file: 'sounds/user-abc-1234.webm', fx: 'chipmunk' }),
    ],
    overrides: [{ id: 'pip-airhorn', fx: Array(40).fill({ type: 'voice', voice: 'robot' }) }],
  });
  assert.deepEqual(out.clips[0].fx, [{ type: 'voice', voice: 'slow', amount: 20 }, { type: 'voice', voice: 'robot' }]);
  assert.ok(!('fx' in out.clips[1]), 'a chain of one is stored as `voice` only');
  assert.ok(!('fx' in out.clips[2]));
  assert.equal(out.overrides[0].fx.length, 6, 'at most six steps');
});

test('an empty backup is fine', async () => {
  const out = await read({});
  assert.deepEqual([out.people, out.clips, out.overrides, out.orders, out.patterns, out.beats, out.settings], [[], [], [], [], [], [], []]);
  assert.equal(out.skipped, 0);
});

test('refuses files that are not soundboard backups', async () => {
  assert.match(await failure(readBackup(blobOf(buildZip([{ name: 'other.txt', data: bytes(1) }])), bundled())), /no backup.json/);
  assert.match(await failure(readBackup(blobOf(buildZip([{ name: 'backup.json', data: utf8('{not json') }])), bundled())), /damaged/);
  assert.match(await failure(readBackup(blobOf(buildZip([{ name: 'backup.json', data: utf8('null') }])), bundled())), /isn't a Noodle Pads backup/);
  assert.match(await failure(read({ app: 'something-else' })), /isn't a Noodle Pads backup/);
  assert.match(await failure(read({ format: '2.0' })), /newer version \(format 2\.0\)/);
  for (const format of [undefined, '1', 'one', '1.0.0', '01x.2', 2, null]) {
    assert.match(await failure(read({ format })), /doesn't say which format/, String(format));
  }
  assert.match(await failure(readBackup(blobOf(utf8('hello')), bundled())), /isn't a zip/);
});

test('refuses a backup.json that is absurdly large', async () => {
  const big = utf8(JSON.stringify({ app: BACKUP_APP, format: 1, pad: 'x'.repeat(9 * 1024 * 1024) }));
  assert.match(await failure(readBackup(blobOf(buildZip([{ name: 'backup.json', data: big, method: 8 }])), bundled())), /far bigger/);
});

test('a special name in a backup stays a fun name, so the person still syncs', async () => {
  const out = await read({ people: [{ id: 'p-crumb-1', added: true, name: 'Salacious Crumb', fun: true, color: '#1F3FA8', created: 1 }] });
  assert.equal(out.people[0].name, 'Salacious Crumb');
  assert.equal(out.people[0].fun, true);
});

test('people: only known ids, trimmed names, readable colors', async () => {
  const out = await read({
    people: [
      { id: 'pip', name: '  A very long name that goes on  ', color: '#1F3FA8', hidden: true },
      { id: 'juno', color: '#FFFFFF', hidden: 'yes' },       // white can't carry white text; hidden must be true
      { id: 'Not Ours', name: 'Not a person id' },
      { id: 'p-ok-1', added: true, name: 'Nana', color: 'red', created: 'later' },
      { id: 'p-nameless', added: true },
      { id: 'P-Bad', added: true, name: 'Caps' },
      { id: 'pip', added: true, name: 'Bundled id claimed as added' },
      null, 7, 'str', [],
    ],
  });
  assert.deepEqual(out.people.map((p) => p.id), ['pip', 'juno', 'p-ok-1', 'p-nameless']);
  assert.ok(isFunName(out.people[3].name), 'a nameless added person still owns their sounds, so they come in, with a fun name');
  assert.equal(out.people[3].fun, true);
  assert.ok(out.people[3].avatar, 'and a picture');
  assert.equal(out.people[0].name, 'A very long name tha', 'cut to 20 characters, the longest fun name');
  assert.equal(out.people[0].color, '#1F3FA8');
  assert.equal(out.people[0].hidden, true);
  assert.deepEqual(out.people[1], { id: 'juno' });
  assert.match(out.people[2].color, /^#[0-9A-F]{6}$/i, 'an added person with an unreadable color gets a person color, so the app can draw them');
  assert.equal(typeof out.people[2].created, 'number');
  assert.equal(out.skipped, 7);
});

test('clips: hostile fields are dropped or clamped, extra fields never copied', async () => {
  const sounds = {
    'sounds/ok.webm': bytes(1),
    'sounds/two.webm': bytes(2),
  };
  const out = await read({
    clips: [
      goodClip({ id: 'user-ok-1', file: 'sounds/ok.webm', label: 'L'.repeat(60), emoji: 'E'.repeat(30), color: 'neon', voice: 'nope', amount: 'fast', evil: '<img onerror=x>', __proto__: { polluted: 1 } }),
      goodClip({ id: 'user-ok-2', file: 'sounds/two.webm', color: 'blue', amount: NaN, label: '   ' }),
      goodClip({ id: 'user-nofile', file: 'sounds/missing.webm' }),
      goodClip({ id: 'user-pathy', file: 'sounds/../../etc/passwd' }),
      goodClip({ id: 'user-filenum', file: 7 }),
      goodClip({ id: 'user-wrongmime', file: 'sounds/ok.webm', mime: 'text/html' }),
      goodClip({ id: 'user-nomime', file: 'sounds/ok.webm', mime: undefined }),
      goodClip({ id: 'USER-caps', file: 'sounds/ok.webm' }),
      goodClip({ id: 'user-../x', file: 'sounds/ok.webm' }),
      goodClip({ id: 'user-' + 'a'.repeat(60), file: 'sounds/ok.webm' }),
      goodClip({ id: 'user-nobody', personId: 'No body', file: 'sounds/ok.webm' }),
      goodClip({ id: 'user-numperson', personId: 5, file: 'sounds/ok.webm' }),
      'junk', null,
    ],
  }, sounds);
  assert.deepEqual(out.clips.map((c) => c.id), ['user-ok-1', 'user-ok-2', 'user-nomime']);
  const [a, b, c] = out.clips;
  assert.equal(c.mime, 'audio/x-unknown', 'a sound stored with no type keeps its audio');
  assert.equal(a.label.length, 24);
  assert.equal(a.emoji.length, 8);
  assert.equal(a.color, undefined);
  assert.equal(a.voice, 'normal');
  assert.equal(a.amount, undefined);
  assert.ok(!('evil' in a));
  assert.equal(({}).polluted, undefined);
  assert.equal(b.color, 'blue');
  assert.equal(b.label, 'Sound');
  assert.equal(out.skipped, 11);
  assert.equal(out.left['clips:notAudio'], 1);
});

test('clips: a sound over the size cap is dropped, and one the app can make is not', () => {
  // A 3-minute song saved as a sound is a 35 MB WAV at 48 kHz, 69 MB at 96 kHz.
  assert.ok(MAX_SOUND_BYTES >= 180 * 96000 * 2 * 2 + 44);
  // A Blob that says it is big, without holding the bytes.
  class Sized extends Blob { constructor(n) { super([], { type: 'audio/wav' }); this.n = n; } get size() { return this.n; } }
  const sized = (n) => new Sized(n);
  const doc = { clips: [goodClip({ id: 'user-song' }), goodClip({ id: 'user-huge' })] };
  const sizes = { 'user-song': 70 * 1024 * 1024, 'user-huge': MAX_SOUND_BYTES + 1 };
  const out = cleanBackup(doc, (c) => sized(sizes[c.id]), bundled());
  assert.deepEqual(out.clips.map((c) => c.id), ['user-song']);
  assert.deepEqual(out.left, { 'clips:tooBig': 1 });
});

test('clips of a person already added on this device are kept, and that person is left as they are', async () => {
  const doc = { clips: [goodClip({ personId: 'p-earlier-1' })] };
  const here = await read(doc, undefined, bundled({ addedPeopleIds: new Set(['p-earlier-1']) }));
  assert.equal(here.clips.length, 1);
  assert.deepEqual(here.people, [], 'no new person for someone already here');
});

test('a backup says noodlepads, format 1.2; any 1.x loads, and so does one from before 1.0', async () => {
  assert.equal(BACKUP_APP, 'noodlepads');
  assert.equal(BACKUP_FORMAT, '1.2');
  const saved = JSON.parse(new TextDecoder().decode((await unzip(await makeBackup({ people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [] }))).get('backup.json')));
  assert.equal(saved.app, 'noodlepads');
  assert.equal(saved.format, '1.2');
  assert.equal(refusal({ app: 'noodlepads', format: '1.0' }), null);
  assert.equal(refusal({ app: 'noodlepads', format: '1.7' }), null, 'a later 1.x only adds what this copy can skip');
  assert.equal(refusal({ app: 'noodle-pads', format: '1.1' }), null, 'a backup saved before the 1.0 rename still loads');
  assert.equal(beforeOne({ app: 'noodle-pads', format: 1 }), true, 'and so does an older-sounds backup made before it');
  assert.equal((await read({ format: '1.3', clips: [goodClip()] })).clips.length, 1);
  // Before 1.0: an app id ending in -soundboard, or this id with format 1 as a
  // number. The testing copies' backups load once more (Ben, 2026-10-11).
  for (const doc of [{ app: 'family-soundboard', format: 1 }, { app: 'family-soundboard', format: '1.0' }, { app: BACKUP_APP, format: 1 }]) {
    assert.equal(beforeOne(doc), true, JSON.stringify(doc));
    assert.equal((await read({ ...doc, clips: [goodClip()] })).clips.length, 1, JSON.stringify(doc));
  }
  assert.equal(beforeOne({ app: BACKUP_APP, format: '1.0' }), false);
  for (const app of ['soundboard', '-soundboard', 'Family-Soundboard', 'evil/-soundboard', null, 7]) {
    assert.match(refusal({ app, format: '1.0' }), /isn't a Noodle Pads backup/, String(app));
  }
});

test('a backup from before 1.0 keeps its people: ones an older boards.json named become added people', async () => {
  const out = await read({
    app: 'family-soundboard', format: 1,
    people: [{ id: 'old-a', name: 'Rocket', color: '#0B5C7A' }],
    clips: [goodClip({ personId: 'old-a' })],
  }, undefined, bundled({ peopleIds: new Set(), kitIds: new Set(['kick']) }));
  assert.deepEqual(out.people.map((p) => [p.id, p.name, p.added]), [['old-a', 'Rocket', true]]);
  assert.equal(out.clips.length, 1, 'their sound comes too');
});

test('a 1.0 backup never turns unknown people into added ones: that is for data from before 1.0', async () => {
  const out = await read({
    people: [{ id: 'old-a', name: 'Rocket', color: '#0B5C7A' }],
    clips: [goodClip({ personId: 'old-a' })],
  }, undefined, bundled({ peopleIds: new Set(), kitIds: new Set(['kick']) }));
  assert.deepEqual(out.people, []);
  assert.deepEqual(out.clips, []);
  assert.equal(out.skipped, 2, 'both refused, and counted for the notice');
});

test('an added person keeps any plain id, but never one boards.json has', async () => {
  const out = await read({ people: [{ id: 'old-a', added: true, name: 'Rocket' }, { id: 'pip', added: true, name: 'Claim' }] });
  assert.deepEqual(out.people.map((p) => p.id), ['old-a']);
  assert.equal(out.skipped, 1);
});

test('overrides: only boards.json clips, typed fields only', async () => {
  const out = await read({
    overrides: [
      { id: 'pip-airhorn', label: 'Honk', emoji: '📯', color: 'red', voice: 'monster', amount: 2.5, hidden: true, extra: 1 },
      { id: 'pip-airhorn', label: '', color: 'purple', voice: 'x', amount: Infinity, hidden: 'true' },
      { id: 'not-a-bundled-clip', label: 'x' },
      {}, null,
    ],
  });
  assert.deepEqual(out.overrides[0], { id: 'pip-airhorn', label: 'Honk', emoji: '📯', color: 'red', voice: 'monster', amount: 2.5, hidden: true });
  assert.equal(out.overrides.length, 1, 'one with nothing left changes nothing: no edit (model.js isEmptyOverride)');
  assert.equal(out.skipped, 3);
});

test('orders: strings only, capped in count; an id too long is left out, never cut into another', async () => {
  const out = await read({
    orders: [
      { personId: 'pip', ids: ['a', 5, null, 'b'.repeat(100), ...Array(600).fill('c')] },
      { personId: 'No body', ids: ['a'] },
      { personId: 'juno', ids: 'not a list' },
    ],
  });
  assert.equal(out.orders.length, 1);
  assert.equal(out.orders[0].ids.length, 499, '500 strings kept, less the one too long');
  assert.equal(out.orders[0].ids[1], 'c', 'the 100-character id is gone, not cut to 64');
  assert.equal(out.skipped, 2);
});

test('patterns and beats are cleaned like any beat', async () => {
  const wild = { personId: 'pip', bpm: 9999, name: 'N'.repeat(50), rows: Array(30).fill({ clipId: 'pip-airhorn', steps: [1, 0, 'yes'] }) };
  const out = await read({
    patterns: [wild, { personId: 'No body' }],
    beats: [
      { ...wild, id: 'beat-1-a', saved: 'x' },
      { ...wild, id: 'bad id' },
      { ...wild, id: 'beat-2-b', personId: 'No body' },
    ],
  });
  assert.equal(out.patterns.length, 1);
  assert.equal(out.patterns[0].bpm, 180);
  assert.equal(out.patterns[0].rows.length, 16);
  assert.deepEqual(out.patterns[0].rows[0].steps.slice(0, 4), [true, false, true, false]);
  assert.equal(out.patterns[0].rows[0].steps.length, 16);
  assert.equal(out.beats.length, 1);
  assert.equal(out.beats[0].id, 'beat-1-a');
  assert.equal(out.beats[0].name.length, 24);
  assert.equal(typeof out.beats[0].saved, 'number');
  assert.equal(out.skipped, 3);
});

test('lists of the wrong type are treated as empty', async () => {
  const out = await read({ people: 'x', clips: 5, overrides: {}, orders: null, patterns: true, beats: 'beats' });
  assert.equal(out.skipped, 0);
  assert.deepEqual(out.clips, []);
});

test('a list longer than its cap is cut, and the rest counted as skipped', async () => {
  const people = Array.from({ length: 150 }, (_, i) => ({ id: `p-${i}`, name: `P${i}`, added: true }));
  const out = await read({ people });
  assert.equal(out.people.length, 100);
  assert.equal(out.skipped, 50);
});

test('exported and version are short strings or absent', async () => {
  const out = await read({ exported: 'x'.repeat(100), version: 42 });
  assert.equal(out.exported.length, 40);
  assert.equal(out.version, undefined);
});

test('a backup made before settings existed loads, with no settings', async () => {
  const out = await readBackup(await makeBackup({ people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [] }), bundled());
  assert.deepEqual(out.settings, []);
  assert.equal(out.skipped, 0);
});

test('settings keep only keys this app declares, with values it allows', async () => {
  const out = await read({
    settings: [
      { key: 'timeSignature', value: '6/8' },
      { key: 'timeSignature', value: '13/16' },         // not an allowed value
      { key: 'rowTempoMode', value: 'bpm' },            // a setting this copy no longer has
      { key: 'fontSize', value: 'big' },                // not a setting here
      { key: '__proto__', value: 'speed' },             // never a setting
      { key: 'toString', value: 'speed' },              // inherited, not declared
      { key: 'timeSignature', value: '4/4', extra: 1 },
      null, 'timeSignature',
    ],
  });
  assert.deepEqual(out.settings, [{ key: 'timeSignature', value: '6/8' }, { key: 'timeSignature', value: '4/4' }]);
  assert.equal(out.skipped, 7);
});

test('a settings list of the wrong type is treated as empty, and a long one is cut', async () => {
  assert.deepEqual((await read({ settings: 'timeSignature' })).settings, []);
  const many = Array.from({ length: 80 }, () => ({ key: 'timeSignature', value: '3/4' }));
  const out = await read({ settings: many });
  assert.equal(out.settings.length, 50);
  assert.equal(out.skipped, 30);
});

test('the advanced beat settings round-trip, with booleans kept as booleans and bad values dropped', async () => {
  const out = await read({
    settings: [
      { key: 'advancedBeats', value: true },
      { key: 'advancedBeats', value: 'true' },
      { key: 'timeSignature', value: '7/8' },
      { key: 'timeSignature', value: '9/8' },
    ],
  });
  assert.deepEqual(out.settings, [{ key: 'advancedBeats', value: true }, { key: 'timeSignature', value: '7/8' }]);
  assert.equal(out.skipped, 2);
});

test('a backup from before the pad size slider loads its S M L, or its percent, as the nearest size', async () => {
  const out = await read({
    settings: [{ key: 'padSize', value: 'l' }, { key: 'padSize', value: 85 }, { key: 'padSize', value: 'huge' }],
  });
  assert.deepEqual(out.settings, [{ key: 'padSize', value: 0.59 }, { key: 'padSize', value: 0.23 }]);
  assert.equal(out.skipped, 1);
});

test('a backup with a dropped DJ keyboard (Auto, AZERTY, Colemak) leaves it out, so this device keeps its own', async () => {
  const out = await read({ settings: [{ key: 'djLayout', value: 'colemak' }, { key: 'djLayout', value: 'auto' }, { key: 'djLayout', value: 'dvorak' }] });
  assert.deepEqual(out.settings, [{ key: 'djLayout', value: 'dvorak' }]);
  assert.equal(out.skipped, 2);
});

test('DJ decks and takes travel in a backup, cleaned; a backup without them loads', async () => {
  const { cleanDeck, cleanTake } = await import('../web/rhythm.js');
  // Decks keep only real key codes, each a sound id or null.
  assert.deepEqual(cleanDeck({ personId: 'juno', keys: { KeyA: 'juno-kick', KeyS: null, Escape: 'x', KeyD: 42 } }),
    { personId: 'juno', keys: { KeyA: 'juno-kick', KeyS: null } });
  assert.equal(cleanDeck({ personId: 'juno' }), null);
  // Takes: a safe id, events in range and in order, junk dropped.
  const take = cleanTake({
    id: 'take-abc', personId: 'juno', name: 'Turbo Hoedown', duration: 9999, created: 1,
    events: [{ t: 2, clipId: 'juno-kick', kind: 'hit' }, { t: 1.23456, clipId: 'juno-snare', kind: 'beat' },
      { t: 1e9, clipId: 'juno-kick', kind: 'hit' }, { t: 1, clipId: 'juno-kick', kind: 'explode' }, { t: 1, kind: 'hit' }],
  });
  assert.equal(take.duration, 180);
  assert.deepEqual(take.events, [{ t: 1.235, clipId: 'juno-snare', kind: 'beat' }, { t: 2, clipId: 'juno-kick', kind: 'hit' }]);
  assert.equal(cleanTake({ id: '../evil', personId: 'juno' }), null);
  assert.equal(cleanTake({ id: 'take-x', personId: 'juno', name: '' }, () => 'Fun Name').name, 'Fun Name');
  assert.equal(cleanTake({ id: 'take-y', personId: 'juno', events: Array.from({ length: 20000 }, (_, i) => ({ t: i / 1000, clipId: 'a', kind: 'hit' })) }).events.length, 10000);
});

test('a backup carries DJ decks and takes for known people, and drops strangers\' and broken ones', async () => {
  const take = { id: 'take-q-1', personId: 'pip', name: 'Turbo Hoedown', created: 1, duration: 3, events: [{ t: 0.5, clipId: 'pip-airhorn', kind: 'hit' }] };
  const out = await read({
    decks: [{ personId: 'pip', keys: { KeyA: 'pip-airhorn' } }, { personId: 'A stranger', keys: {} }],
    takes: [take, { ...take, id: 'take-q-2', personId: 'A stranger' }, { ...take, id: 'nope' }],
  });
  assert.deepEqual(out.decks, [{ personId: 'pip', keys: { KeyA: 'pip-airhorn' } }]);
  assert.deepEqual(out.takes, [take]);
  assert.equal(out.skipped, 3);
  const old = await read({});
  assert.deepEqual([old.decks, old.takes], [[], []], 'a backup from before DJ mode loads');
});

test('the open beat round-trips in a backup (patterns); an older copy\'s Beat Builder id on the deck (ADR 0008) still loads, read by nobody since ADR 0017', async () => {
  const beat = { id: 'beat-q-1', personId: 'pip', name: 'Groove', bpm: 100, bars: 1, swing: 0, rows: [], signature: '4/4' };
  const state = { people: [], clips: [], overrides: [], orders: [], patterns: [beat], beats: [{ ...beat, created: 1, saved: 2 }],
    decks: [{ personId: 'pip', keys: {}, beatId: 'beat-q-1' }] };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.patterns, [beat]);
  assert.deepEqual(out.decks, [{ personId: 'pip', keys: {}, beatId: 'beat-q-1' }], 'the same beat may be open on both');
  const dirty = await read({ decks: [{ personId: 'pip', keys: {}, beatId: '../evil' }] });
  assert.deepEqual(dirty.decks, [{ personId: 'pip', keys: {} }], 'an unsafe id is nothing open');
  const old = await read({ patterns: [{ personId: 'pip', name: 'Old', bpm: 90, rows: [] }], decks: [{ personId: 'pip', keys: {} }] });
  assert.equal(old.patterns.length, 1, 'a backup from before keeps its open beat; the app sorts it out on open');
  assert.equal(old.decks[0].beatId, undefined, 'and DJ starts with nothing open');
});

// A song is a playlist (ADR 0024): a tempo and lanes of blocks, plus the
// slots older copies read.
const lanes = (...firstBlocks) => [
  { name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: firstBlocks },
  { name: 'Bass', emoji: '🎸', muted: true, volume: 0.5, blocks: [] },
  { name: 'Keys', emoji: '🎹', muted: false, volume: 1, blocks: [] },
  { name: 'Voice', emoji: '🎤', muted: false, volume: 1, blocks: [] },
];

test('songs round-trip in a backup, cleaned; strangers\' and bad blocks dropped; a backup without them loads', async () => {
  const song = { id: 'song-q-1', personId: 'pip', name: 'Funky Anthem', tempo: 120,
    lanes: lanes({ beatId: 'beat-q-1', bar: 0, times: 2 }, { beatId: 'beat-gone-2', bar: 2, times: 1 }),
    slots: [{ beatId: 'beat-q-1', times: 2 }, { beatId: 'beat-gone-2', times: 1 }] };
  const state = { people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [], songs: [song] };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.songs, [song], 'a block whose beat is not in the backup stays: it shows as deleted');
  const dirty = await read({ songs: [
    { id: 'song-d-1', personId: 'pip', name: '', tempo: 999, lanes: [{ blocks: [{ beatId: '../x', bar: 0, times: 1 }, { beatId: 'beat-a', bar: 1, times: 999 }] }] },
    { id: 'song-d-2', personId: 'A stranger', name: 'Nope', lanes: [] },
  ] });
  assert.equal(dirty.songs.length, 1);
  assert.equal(dirty.songs[0].name, 'Song');
  assert.equal(dirty.songs[0].tempo, 180);
  assert.deepEqual(dirty.songs[0].lanes[0].blocks, [{ beatId: 'beat-a', bar: 1, times: 64 }]);
  assert.deepEqual(dirty.songs[0].slots, [{ beatId: 'beat-a', times: 4 }], 'older copies read at most ×4');
  assert.equal(dirty.skipped, 1);
  assert.deepEqual((await read({})).songs, [], 'a backup with no songs loads');
});

test("a backup's songs from before the playlist (1.0, 1.1) load as lanes: slots in order on lane 1, timed by the backup's beats", async () => {
  const beat = (id, bpm, bars) => ({ id, personId: 'pip', name: id, bpm, bars, swing: 0, rows: [], created: 1, saved: 1 });
  const out = await read({
    beats: [beat('beat-q-1', 88, 2), beat('beat-q-2', 140, 1)],
    songbook: [{ id: 'song-q-1', personId: 'pip', name: 'Funky Anthem', slots: [{ beatId: 'beat-q-1', times: 2 }, { beatId: 'beat-q-2', times: 3 }], created: 1, saved: 2 }],
  });
  const song = out.songbook[0];
  assert.equal(song.tempo, 88, "the first slot's beat's tempo");
  assert.deepEqual(song.lanes[0].blocks, [{ beatId: 'beat-q-1', bar: 0, times: 2 }, { beatId: 'beat-q-2', bar: 4, times: 3 }]);
  assert.equal(song.lanes.length, 4);
  assert.deepEqual(song.slots, [{ beatId: 'beat-q-1', times: 2 }, { beatId: 'beat-q-2', times: 3 }]);
});

test('songs as a list round-trip (the open songs and every saved song); the one-song-per-person shape does not load', async () => {
  const open = { id: 'song-q-1', personId: 'pip', name: 'Funky Anthem', tempo: 100, lanes: lanes({ beatId: 'beat-q-1', bar: 0, times: 2 }), slots: [{ beatId: 'beat-q-1', times: 2 }] };
  const saved = [{ ...open, created: 1, saved: 2 }, { id: 'song-q-2', personId: 'pip', name: 'Sleepy Ditty', tempo: 90, lanes: lanes(), slots: [], created: 3, saved: 4 }];
  const state = { people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [], songs: [open], songbook: saved };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.songs, [open]);
  assert.deepEqual(out.songbook, saved);
  const dirty = await read({ songbook: [{ id: 'nope', personId: 'pip' }, { ...saved[1], personId: 'A stranger' }, { id: 'song-x', personId: 'pip', name: 'X', slots: [], created: 1, saved: 9 }] });
  assert.deepEqual(dirty.songbook.map((s) => s.id), ['song-x']);
  assert.equal(dirty.skipped, 2);
  // An open song without an id (the shape before songs were a list) is from before 1.0: refused, and counted.
  const old = await read({ songs: [{ personId: 'pip', name: 'Funky Anthem', slots: [{ beatId: 'beat-q-1', times: 2 }] }] });
  assert.deepEqual(old.songs, []);
  assert.equal(old.skipped, 1);
});

test('a shaped chain (echo, pitch, fade…) comes back whole; junk numbers are clamped, unknown kinds dropped', async () => {
  const fx = [
    { type: 'voice', voice: 'chipmunk', amount: 2 },
    { type: 'echo', repeats: 3, gap: 0.25 },
    { type: 'pitch', notes: -5, keep: true },
    { type: 'fade', in: 0.2, out: 0.4 },
  ];
  const out = await read({
    clips: [
      goodClip({ fx }),
      goodClip({ id: 'user-abc-2', fx: [{ type: 'echo', repeats: 99, gap: 'far', evil: '<script>' }, { type: 'pitch', notes: 4.4, keep: 'yes' }, { type: 'warp' }] }),
      goodClip({ id: 'user-abc-3', fx: [{ type: 'tone', tone: -0.4 }] }),
    ],
  });
  assert.deepEqual(out.clips[0].fx, fx, 'round trip');
  assert.deepEqual(out.clips[1].fx, [{ type: 'echo', repeats: 8, gap: 0.25 }, { type: 'pitch', notes: 4, keep: false }],
    'clamped to range, a non-number gets its default, only true is true, extra fields and unknown kinds go');
  assert.deepEqual(out.clips[2].fx, [{ type: 'tone', tone: -0.4 }], 'one step that is not a voice is still kept as fx');
});

test('a ✨ made sound keeps its recipe; a junk recipe is cleaned or dropped', async () => {
  const synth = { tone: 'buzzy', from: 1600, to: 120, length: 0.35, shape: 'drop', pulses: 1 };
  const out = await read({
    clips: [
      goodClip({ synth }),
      goodClip({ id: 'user-abc-2', synth: { tone: 'evil', from: 1e9, length: -1, shape: 'drop', pulses: 2, script: '<x>' } }),
      goodClip({ id: 'user-abc-3', synth: 'laser' }),
    ],
  });
  assert.deepEqual(out.clips[0].synth, synth, 'round trip');
  assert.deepEqual(out.clips[1].synth, { tone: 'smooth', from: 12000, to: 38, length: 0.05, shape: 'drop', pulses: 2 });
  assert.ok(!('synth' in out.clips[2]), 'not a recipe: left out');
});

test('a sound\'s note (root) comes back on sounds and kit edits; anything but a whole note 0-127 is dropped', async () => {
  const out = await read({
    clips: [
      goodClip({ root: 67 }),
      ...[128, -1, 60.5, '60', null].map((root, i) => goodClip({ id: `user-abc-r${i}`, root })),
    ],
    overrides: [{ id: 'pip-airhorn', root: 0 }],
  });
  assert.equal(out.clips[0].root, 67);
  for (const c of out.clips.slice(1)) assert.ok(!('root' in c), JSON.stringify(c.id));
  assert.equal(out.overrides[0].root, 0);
  const junk = await read({ overrides: [{ id: 'pip-airhorn', root: 1e6, label: 'Honk' }] });
  assert.ok(!('root' in junk.overrides[0]));
});

test('where a sound came from (from: {id, how}) comes back; junk is dropped', async () => {
  const out = await read({
    clips: [
      goodClip({ from: { id: 'user-abc-9', how: 'mix', extra: 1 } }),
      goodClip({ id: 'user-abc-2', from: { id: 'pip-airhorn', how: 'chop' } }),
      ...[{ id: 'x', how: 'steal' }, { id: 7, how: 'mix' }, { id: 'x'.repeat(65), how: 'mix' }, 'user-abc-9', null]
        .map((from, i) => goodClip({ id: `user-abc-f${i}`, from })),
    ],
  });
  assert.deepEqual(out.clips[0].from, { id: 'user-abc-9', how: 'mix' });
  assert.deepEqual(out.clips[1].from, { id: 'pip-airhorn', how: 'chop' });
  for (const c of out.clips.slice(2)) assert.ok(!('from' in c), c.id);
});

// 📮 Problem reports: backups carry the switch (Ben, 2026-10-11, Q5: "Carry
// it"). The device code lives in localStorage, never in a backup.
test('backups save and load the problem-report switch, and never the device code', async () => {
  const blob = await makeBackup({
    people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    settings: [{ key: 'sendLogs', value: true }, { key: 'advancedBeats', value: true }, { key: 'renamedPeople', value: { zed: 'p-z-1' } }],
  });
  const text = new TextDecoder().decode((await unzip(blob)).get('backup.json'));
  assert.deepEqual(JSON.parse(text).settings, [{ key: 'sendLogs', value: true }, { key: 'advancedBeats', value: true }]);
  assert.ok(!text.includes('log-device'), 'no device code');
  const out = await read({ settings: [{ key: 'sendLogs', value: true }, { key: 'timeSignature', value: '3/4' }] });
  assert.deepEqual(out.settings, [{ key: 'sendLogs', value: true }, { key: 'timeSignature', value: '3/4' }]);
});

test('a person keeps their avatar (from the picture list) and `fun` (only on a generated name)', async () => {
  const p = (over) => ({ id: 'p-x-1', name: 'Sir Squid', color: '#1F3FA8', added: true, created: 1, ...over });
  const out = await read({ people: [
    p({ avatar: '🦖', fun: true }),
    p({ id: 'p-x-2', avatar: '<b>', fun: true, name: 'Typed Name' }),
    // Any emoji from the chooser's full list ("…"), but only one, and no skin tones or joins.
    p({ id: 'p-x-3', avatar: '🧛' }),
    p({ id: 'p-x-4', avatar: '👍🏽' }),
    p({ id: 'p-x-5', avatar: '🧛‍♂️' }),
  ] }, {});
  assert.deepEqual(out.people.map((x) => [x.avatar, x.fun]), [['🦖', true], [undefined, undefined], ['🧛', undefined], [undefined, undefined], [undefined, undefined]]);
});

test('saved DJ key layouts and ⭐ My keys round-trip in a backup, cleaned; strangers\' and broken ones dropped; older backups load', async () => {
  const layout = { id: 'layout-q-1', personId: 'pip', name: 'Party keys', created: 3, keys: { KeyA: 'pip-airhorn' } };
  const state = {
    people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    decks: [{ personId: 'pip', keys: { KeyA: 'pip-airhorn' }, mine: { KeyS: 'pip-laser' } }],
    layouts: [layout, { ...layout, id: 'layout-q-2', personId: 'A stranger' }, { ...layout, id: '../evil' }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.equal(out.layouts.length, 1);
  assert.equal(out.layouts[0].name, 'Party keys');
  assert.equal(out.layouts[0].keys.KeyA, 'pip-airhorn');
  assert.equal(out.layouts[0].keys.KeyS, null, 'all 40 keys, the rest No sound');
  assert.equal(out.layouts[0].keys.Digit1, null, 'a layout from before the number row loads with it empty');
  assert.equal(out.decks[0].mine.KeyS, 'pip-laser');
  assert.equal(out.decks[0].mine.KeyA, null);
  assert.equal(out.skipped, 2);
  // The number row round-trips: the live keys, ⭐ My keys and a saved layout.
  const numbered = {
    ...state,
    decks: [{ personId: 'pip', keys: { Digit1: 'pip-airhorn', Digit0: null }, mine: { Digit5: 'pip-laser' } }],
    layouts: [{ ...layout, keys: { Digit3: 'pip-airhorn' } }],
  };
  const back = await readBackup(await makeBackup(numbered), bundled());
  assert.deepEqual(back.decks[0].keys, { Digit1: 'pip-airhorn', Digit0: null });
  assert.equal(back.decks[0].mine.Digit5, 'pip-laser');
  assert.equal(back.layouts[0].keys.Digit3, 'pip-airhorn');
  assert.deepEqual((await read({})).layouts, [], 'a backup from before layouts loads');
});

test('👆 touch layouts round-trip in a backup, cleaned: the live one and ⭐ My layout on the deck, the saved ones; strangers\' and broken ones dropped; older backups load (ADR 0029)', async () => {
  const saved = { id: 'touch-q-1', personId: 'pip', name: '  Jam   pads ', created: 3, bands: [{ group: 'drums', size: 'l', sounds: ['pip-kick', 'pip-kick', 7] }, { group: '<b>', size: 'm', sounds: [] }] };
  const touch = { bands: [{ group: 'mine', size: 'x', sounds: ['pip-airhorn'] }] };
  const state = {
    people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    decks: [{ personId: 'pip', keys: {}, touch, touchMine: { bands: [] } }],
    touchLayouts: [saved, { ...saved, id: 'touch-q-2', personId: 'A stranger' }, { ...saved, id: '../evil' }, { ...saved, id: 'touch-q-3', bands: 'nope' }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.touchLayouts, [{ id: 'touch-q-1', personId: 'pip', name: 'Jam pads', created: 3, bands: [{ group: 'drums', size: 'l', sounds: ['pip-kick'] }] }]);
  assert.equal(out.skipped, 3);
  assert.deepEqual(out.decks[0].touch, { bands: [{ group: 'mine', size: 'm', sounds: ['pip-airhorn'] }] }, 'an unknown size is M');
  assert.deepEqual(out.decks[0].touchMine, { bands: [] });
  assert.deepEqual((await read({})).touchLayouts, [], 'a backup from before touch layouts loads');
  const older = await read({ people: [{ id: 'pip', name: 'Pipsqueak' }], decks: [{ personId: 'pip', keys: { KeyA: 'pip-kick' } }] });
  assert.deepEqual(older.decks[0], { personId: 'pip', keys: { KeyA: 'pip-kick' } }, 'a deck from before has no touch layout: the default plays');
});

test("a kid's own voices round-trip in a backup, cleaned; strangers' and broken ones dropped; older backups load", async () => {
  const mine = { id: 'voice-q-1', personId: 'pip', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7, echo: 2, nonsense: 4 }, created: 3, used: 4 };
  const state = {
    people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    voices: [mine, { ...mine, id: 'voice-q-2', personId: 'A stranger' }, { ...mine, id: '../evil' }, { ...mine, id: 'voice-q-3', knobs: {} }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.voices, [{ id: 'voice-q-1', personId: 'pip', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7, echo: 2 }, created: 3, used: 4 }]);
  assert.equal(out.skipped, 3);
  assert.deepEqual((await read({})).voices, [], 'a backup from before own voices loads');
});

// Ben, 2026-10-16: a person's pad skin travels with them, in backups too.
test('a person\'s pad skin round-trips in a backup; one this copy does not know is dropped', async () => {
  const state = {
    people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    prefs: [{ personId: 'pip', values: { padSkin: 'slam' } }, { personId: 'juno', values: { padSkin: 'glitter', timeSignature: '3/4' } }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.prefs, [{ personId: 'pip', values: { padSkin: 'slam' } }, { personId: 'juno', values: { timeSignature: '3/4' } }]);
});

// ADR 0028: what a person has seen of their first steps rides in a backup,
// cleaned; a backup from before it (every 1.x one) loads as before.
test("a person's seen tips round-trip in a backup, cleaned; older backups load without them", async () => {
  const state = {
    people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [],
    prefs: [{ personId: 'pip', values: { seen: 'tip-pads,dot-keys', level: 'regular' } }, { personId: 'juno', values: { seen: { evil: true }, padSkin: 'jelly' } }],
  };
  const out = await readBackup(await makeBackup(state), bundled());
  assert.deepEqual(out.prefs, [{ personId: 'pip', values: { seen: 'dot-keys,tip-pads', level: 'regular' } }, { personId: 'juno', values: { padSkin: 'jelly' } }]);
});

// 🗂️ See all's ⬇️ Export a backup (Ben, 2026-10-24): one person's backup, in
// the same format, so 📂 Load a backup on another device adds just them.
const twoPeople = () => ({
  people: [
    { id: 'p-wren-1', name: 'Plucky Walrus', color: '#0C5E4B', added: true, created: 5 },
    { id: 'p-juno-1', name: 'Agent Alpaca', color: '#1F3FA8', added: true, created: 6 },
  ],
  clips: [
    { ...goodClip(), personId: 'p-wren-1', blob: new Blob([bytes(7, 8, 9)], { type: 'audio/webm' }) },
    { ...goodClip({ id: 'user-xyz-9999', file: 'sounds/user-xyz-9999.webm' }), personId: 'p-juno-1', blob: new Blob([bytes(1)], { type: 'audio/webm' }) },
  ],
  overrides: [{ id: 'p-wren-1-kick', emoji: '🦶' }, { id: 'p-juno-1-kick', hidden: true }],
  orders: [{ personId: 'p-wren-1', ids: [] }, { personId: 'p-juno-1', ids: [] }],
  patterns: [],
  beats: [
    { id: 'beat-w-1', personId: 'p-wren-1', name: 'Wren groove', bpm: 90, rows: [], created: 1, saved: 2 },
    { id: 'beat-j-1', personId: 'p-juno-1', name: 'Juno groove', bpm: 90, rows: [], created: 1, saved: 2 },
  ],
  settings: [{ key: 'timeSignature', value: '3/4' }],
  takes: [{ id: 'take-w', personId: 'p-wren-1' }, { id: 'take-j', personId: 'p-juno-1' }],
  voices: [{ id: 'v-j', personId: 'p-juno-1' }],
  prefs: [{ personId: 'p-wren-1', values: { level: 'advanced' } }, { personId: 'p-juno-1', values: {} }],
});

test('one person\'s backup holds them and all of theirs, and nobody else\'s', () => {
  const mine = personBackupLists(twoPeople(), 'p-wren-1');
  assert.deepEqual(mine.people.map((p) => p.id), ['p-wren-1']);
  assert.deepEqual(mine.clips.map((c) => c.id), ['user-abc-1234']);
  assert.deepEqual(mine.overrides.map((o) => o.id), ['p-wren-1-kick'], 'edits of their own copy of the kit');
  assert.deepEqual(mine.beats.map((b) => b.id), ['beat-w-1']);
  assert.deepEqual(mine.takes.map((t) => t.id), ['take-w']);
  assert.deepEqual(mine.voices, []);
  assert.deepEqual(mine.prefs, [{ personId: 'p-wren-1', values: { level: 'advanced' } }], 'their own settings travel');
  assert.deepEqual(mine.settings, [], 'the device\'s settings stay with the device');
  for (const k of ['songs', 'songbook', 'layouts', 'touchLayouts', 'decks', 'patterns']) assert.deepEqual(mine[k], [], k);
});

test('one person\'s backup loads on a device that has never had them', async () => {
  const out = await readBackup(await makeBackup(personBackupLists(twoPeople(), 'p-wren-1'), '1.0.1'), bundled({ kitIds: new Set(['kick']) }));
  assert.equal(out.skipped, 0);
  assert.deepEqual(out.overrides.map((o) => o.id), ['p-wren-1-kick']);
  assert.deepEqual(out.people.map((p) => p.id), ['p-wren-1']);
  assert.deepEqual(out.clips.map((c) => [c.id, c.personId]), [['user-abc-1234', 'p-wren-1']]);
  assert.deepEqual(new Uint8Array(await out.clips[0].blob.arrayBuffer()), bytes(7, 8, 9));
  assert.deepEqual(out.beats.map((b) => b.name), ['Wren groove']);
  assert.deepEqual(out.settings, []);
});

// Loading a one-person backup asks: restore them, or load it all into
// someone here (Ben, 2026-10-24).
test('a backup is about one person only when it holds one person and nothing of anyone else\'s', () => {
  const wren = personBackupLists(twoPeople(), 'p-wren-1');
  assert.equal(onePersonIn(wren)?.id, 'p-wren-1');
  assert.equal(onePersonIn(twoPeople()), null, 'a whole-device backup with two people');
  assert.equal(onePersonIn({ ...wren, clips: [...wren.clips, { id: 'u', personId: 'p-juno-1' }] }), null, 'someone else\'s sound in it');
  assert.equal(onePersonIn({ ...wren, overrides: [{ id: 'p-juno-1-kick' }] }), null, 'someone else\'s preset edit in it');
  assert.equal(onePersonIn({ ...wren, people: [] }), null);
});

test('loading into someone here: every thing becomes theirs; the person, their settings and the device\'s stay out', () => {
  const lists = personBackupLists(twoPeople(), 'p-wren-1');
  lists.beats.push({ id: 'beat-scratch-p-wren-1', personId: 'p-wren-1', name: 'Scratch', bpm: 100, rows: [] });
  lists.songbook.push({ id: 'song-scratch-p-wren-1', personId: 'p-wren-1', name: 'Scratch', lanes: [] });
  lists.settings = [{ key: 'timeSignature', value: '3/4' }];
  const out = intoPerson(lists, 'p-wren-1', 'p-toby-1');
  assert.deepEqual(out.people, []);
  assert.deepEqual(out.prefs, [], 'they keep their own level, look and settings');
  assert.deepEqual(out.settings, []);
  assert.deepEqual(out.clips.map((c) => c.personId), ['p-toby-1']);
  assert.equal(out.clips[0].blob, lists.clips[0].blob, 'the audio comes as it is');
  assert.deepEqual(out.overrides.map((o) => o.id), ['p-toby-1-kick'], 'an edit of their kit becomes an edit of this person\'s');
  assert.deepEqual(out.beats.map((b) => [b.id, b.personId]), [['beat-w-1', 'p-toby-1'], ['beat-scratch-p-toby-1', 'p-toby-1']]);
  assert.deepEqual(out.songbook.map((s) => s.id), ['song-scratch-p-toby-1']);
  assert.deepEqual(out.orders.map((o) => o.personId), ['p-toby-1']);
  assert.ok(!JSON.stringify({ ...out, clips: [] }).includes('p-wren-1'), 'nothing names them any more');
});

// A backup leaves out someone whose PIN wasn't typed (Ben, 2026-10-24).
test('a backup can tell whether it holds anything of a person, and leave them out', () => {
  const all = twoPeople();
  assert.ok(namesPerson(all, 'p-wren-1'));
  assert.ok(namesPerson({ overrides: [{ id: 'p-wren-1-kick' }] }, 'p-wren-1'), 'an edit of their kit counts');
  assert.ok(!namesPerson({ clips: [{ id: 'u', personId: 'p-juno-1' }] }, 'p-wren-1'));
  const out = withoutPeople(all, ['p-wren-1']);
  assert.ok(!namesPerson(out, 'p-wren-1'), 'nothing of theirs is left');
  assert.deepEqual(out.people.map((p) => p.id), ['p-juno-1']);
  assert.deepEqual(out.clips.map((c) => c.personId), ['p-juno-1']);
  assert.deepEqual(out.overrides.map((o) => o.id), ['p-juno-1-kick']);
  assert.deepEqual(out.settings, all.settings, 'the device\'s settings stay');
});

// ── Format 1.2: each own sound "as heard" (ADR 0001, docs/formats.md) ──

const wavOf = (n) => new Blob([bytes(0x52, 0x49, 0x46, 0x46, n)], { type: 'audio/wav' });
const heardState = () => ({
  people: [{ id: 'p-pip-1', name: 'Pip', color: '#1F3FA8', added: true, created: 1 }],
  orders: [], patterns: [], beats: [],
  clips: [
    { ...goodClip({ id: 'user-aa-1', personId: 'p-pip-1' }), blob: new Blob([bytes(1, 2)], { type: 'audio/webm' }) },
    { ...goodClip({ id: 'user-aa-2', personId: 'p-pip-1', voice: 'normal' }), blob: new Blob([bytes(3, 4)], { type: 'audio/webm' }) },
  ],
});
const docOf = async (blob) => JSON.parse(new TextDecoder().decode((await unzip(blob)).get('backup.json')));

test('a 1.2 backup carries each own sound as heard, a WAV beside the original, named by the clip', async () => {
  const zipBlob = await makeBackup(heardState(), 'dev', { heardOf: async (c) => wavOf(c.id === 'user-aa-1' ? 7 : 8) });
  const files = await unzip(zipBlob);
  const doc = await docOf(zipBlob);
  assert.equal(doc.format, '1.2');
  assert.deepEqual(doc.clips.map((c) => [c.file, c.heard]), [
    ['sounds/user-aa-1.webm', 'sounds/user-aa-1.heard.wav'],
    ['sounds/user-aa-2.webm', 'sounds/user-aa-2.heard.wav'],
  ]);
  assert.deepEqual(files.get('sounds/user-aa-1.webm'), bytes(1, 2), 'the original stays as it was recorded');
  assert.deepEqual(files.get('sounds/user-aa-1.heard.wav'), bytes(0x52, 0x49, 0x46, 0x46, 7));
  assert.deepEqual(files.get('sounds/user-aa-2.heard.wav'), bytes(0x52, 0x49, 0x46, 0x46, 8));
});

test('a sound whose heard copy can not be made goes without one, and the backup still saves', async () => {
  const zipBlob = await makeBackup(heardState(), 'dev', {
    heardOf: async (c) => { if (c.id === 'user-aa-1') throw new Error('did not decode'); return null; },
  });
  const doc = await docOf(zipBlob);
  assert.equal(doc.clips.length, 2);
  for (const c of doc.clips) assert.ok(!('heard' in c), c.id);
  assert.equal([...(await unzip(zipBlob)).keys()].filter((n) => n.includes('.heard.')).length, 0);
  // No heardOf at all (a test, a caller that has no audio): none, as before 1.2.
  assert.ok(!('heard' in (await docOf(await makeBackup(heardState()))).clips[0]));
});

test('heard copies stop at MAX_HEARD_BYTES in all: a sound past it goes without one', async () => {
  assert.ok(MAX_HEARD_BYTES > 0 && MAX_HEARD_BYTES < 300 * 1024 * 1024, 'under the 300 MB a backup may unpack to, with room for the originals');
  const sizes = [Math.floor(MAX_HEARD_BYTES * 0.6), Math.floor(MAX_HEARD_BYTES * 0.6), 10];
  // Real Blobs of those sizes are too big to build cheaply; a Blob whose size is claimed stands in.
  class Sized extends Blob {
    constructor(n) { super([]); this.n = n; }
    get size() { return this.n; }
    async arrayBuffer() { return new ArrayBuffer(0); }
  }
  const state = heardState();
  state.clips.push({ ...goodClip({ id: 'user-aa-3', personId: 'p-pip-1' }), blob: new Blob([bytes(5)], { type: 'audio/webm' }) });
  let k = 0;
  const doc = await docOf(await makeBackup(state, 'dev', { heardOf: async () => new Sized(sizes[k++]) }));
  assert.deepEqual(doc.clips.map((c) => !!c.heard), [true, false, true], 'the second would pass the cap; the small third still fits');
});

test('a 1.2 backup loads in this app: the heard copy is read past, nothing is dropped or counted', async () => {
  const zipBlob = await makeBackup(heardState(), 'dev', { heardOf: async () => wavOf(7) });
  const out = await readBackup(zipBlob, bundled());
  assert.equal(out.skipped, 0);
  assert.deepEqual(out.left, {});
  assert.equal(out.clips.length, 2);
  for (const c of out.clips) {
    assert.ok(!('heard' in c) && !('file' in c), 'the app plays its own sound with its own recipe; nothing of the heard copy is stored');
    assert.equal(c.blob.type, 'audio/webm');
  }
  assert.deepEqual(new Uint8Array(await out.clips[0].blob.arrayBuffer()), bytes(1, 2));
});

test('a 1.1 copy would read a 1.2 backup: the heard file and field are all it adds', async () => {
  const doc = await docOf(await makeBackup(heardState(), 'dev', { heardOf: async () => wavOf(7) }));
  const { heard, ...rest } = doc.clips[0];
  assert.deepEqual(Object.keys(rest).sort(), Object.keys((await docOf(await makeBackup(heardState()))).clips[0]).sort());
  assert.ok(heard);
});

test('heardWav is the part that plays as a 16-bit WAV, not the buffer\'s whole length', async () => {
  const buffer = fakeBuffer([Array.from({ length: 800 }, (_, i) => (i < 400 ? 0.5 : 0.25))], 8000);
  const wav = heardWav({ buffer, duration: 0.05 });   // 400 frames
  assert.equal(wav.type, 'audio/wav');
  const view = new DataView(await wav.arrayBuffer());
  assert.equal(wav.size, 44 + 400 * 2);
  assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  assert.equal(view.getUint16(22, true), 1, 'channels');
  assert.equal(view.getUint32(24, true), 8000, 'sample rate');
  assert.equal(view.getUint16(34, true), 16, 'bits');
  assert.equal(view.getUint32(40, true), 800, 'data bytes');
  assert.ok(Math.abs(view.getInt16(44, true) - Math.round(0.5 * 0x7fff)) <= 1);
  // The whole buffer when its duration says so (or says nothing); stereo keeps both channels.
  assert.equal(heardWav({ buffer, duration: 0.1 }).size, 44 + 800 * 2);
  assert.equal(heardWav({ buffer, duration: 9 }).size, 44 + 800 * 2, 'never past the buffer');
  assert.equal(heardWav({ buffer: fakeBuffer([[0, 0.1], [0, -0.1]]) , duration: 2 / 8000 }).size, 44 + 2 * 2 * 2);
  assert.equal(heardWav(null), null);
  assert.equal(heardWav({ buffer: fakeBuffer([[]]), duration: 0 }), null);
});
