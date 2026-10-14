// A device as the old app left it, through the whole path older sounds
// take (⚙️ Settings → Older sounds found, leftover.js readOldStores): the
// stores as IndexedDB holds them (any old schema version), the checks
// (backup.js cleanBackup with the old-store conversions, starters.js) and
// the merge (merge.js). The rule: everything a kid made arrives, and
// anything that can't is said in the notice. The people here are made up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanBackup, leftOutNote, audioMime } from '../web/backup.js';
import { mergeLoaded } from '../web/merge.js';
import { colorName } from '../web/model.js';
import { nameSoundOf, STARTERS } from '../web/starters.js';
import { readOldStores } from '../web/leftover.js';
import { isFunName } from '../web/names.js';

const web = new URL('../web/', import.meta.url);
const BOARDS = JSON.parse(readFileSync(new URL('boards.json', web), 'utf8'));
const kitIds = BOARDS.kit.map((k) => k.id);
const here = () => ({
  peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(kitIds), addedPeopleIds: new Set(),
  takenNames: ['Me'], takenColors: ['#1F3FA8'], colorOk: (c) => Object.hasOwn(BOARDS.palette, colorName(BOARDS.palette, c)),
});
const audio = (n, type = 'audio/webm;codecs=opus', seed = n) => new Blob([Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 256)], { type });
// A Blob that says it is big without holding the bytes (a song saved as a sound).
class Sized extends Blob { constructor(n, type) { super([], { type }); this.n = n; } get size() { return this.n; } }

// zed and quin were people in the old boards.json; p-… was added in the app.
let n = 0;
const rec = (personId, over = {}) => ({
  id: `user-${(1700000000000 + n).toString(36)}-r${(n++).toString(36).padStart(3, '0')}`,
  personId, label: `Rec ${n}`, emoji: '🐶', color: 'red', voice: 'normal', mime: 'audio/webm;codecs=opus',
  blob: audio(500 + n), created: 1760000000000 + n, ...over,
});
function oldDevice() {
  n = 0;
  const clips = [
    rec('zed'),
    rec('zed', { voice: 'chipmunk', amount: 2.5, mime: 'audio/mp4', blob: audio(900, 'audio/mp4') }),
    rec('zed', { voice: 'slow', amount: 6, fx: [{ type: 'voice', voice: 'robot' }, { type: 'voice', voice: 'stadium' }] }),
    rec('zed', { trim: { start: 0.1, end: 0.9 }, fade: { in: 0.05, out: 0.2 }, root: 60 }),
    rec('zed', { label: 'A label far longer than twenty-four letters', emoji: '🦖' }),
    rec('zed', { mime: '', blob: audio(700, '') }),                    // a file chosen with no type
    rec('zed', { mime: 'video/3gpp', blob: audio(800, 'video/3gpp') }), // a phone recorder's .3gp
    rec('zed', { color: 'sunflower' }),                                 // an old color name
    rec('zed', { mime: 'audio/wav', exact: true, blob: new Sized(34 * 1024 * 1024, 'audio/wav') }), // a song made a sound
    rec('quin', { label: 'Burp' }),
    rec('p-lb2x1-ab12', { label: 'Mine' }),
    rec('olly', { label: 'On a deleted board' }),
  ];
  clips.push(rec('zed', { from: { id: clips[0].id, how: 'chop' } }));
  return {
    // As the old app stored them: renames and hides for the old boards.json
    // people, and the person added in the app.
    people: [
      { id: 'zed', name: 'Zeddo' },
      { id: 'quin', color: '#9E1640' },
      { id: 'olly', hidden: true },
      { id: 'wim', hidden: true },                    // deleted, nothing of theirs left
      { id: 'p-lb2x1-ab12', name: 'Rocket', color: '#0C5E4B', added: true, created: 5 },
    ],
    clips,
    overrides: [
      { id: 'zed-airhorn', label: 'Horn of doom', voice: 'monster', amount: 2 },  // a renamed starter
      { id: 'zed-laser', hidden: true },                                        // a hidden starter
      { id: 'zed-name', voice: 'robot' },                                       // the spoken name clip
      { id: 'zed-kick', label: 'Boot' },                                        // a kit copy
      { id: 'quin-boing', emoji: '🦘' },
    ],
    orders: [{ personId: 'zed', ids: ['zed-name', 'zed-airhorn', clips[0].id, 'zed-kick'] }],
    patterns: [{ personId: 'quin', name: 'Open', bpm: 100, rows: [{ clipId: 'quin-rimshot', steps: [true, false, true] }, { clipId: 'quin-kick', steps: [true] }] }],
    beats: [{ id: 'beat-old-1', personId: 'zed', name: 'Boom', bpm: 120, rows: [
      { clipId: 'zed-airhorn', steps: [true] }, { clipId: clips[1].id, steps: [false, true] }, { clipId: 'zed-tada', steps: [true] },
    ] }],
    decks: [{ personId: 'zed', keys: { KeyQ: 'zed-drumroll', KeyW: clips[0].id } }],
    takes: [{ id: 'take-old-1', personId: 'zed', name: 'Jam', duration: 3, events: [{ t: 0.5, clipId: 'zed-sad-trombone', kind: 'hit' }] }],
  };
}

test('the old starter sounds are presets under the same ids, with their old audio; the spoken name clip is known by id', () => {
  for (const sound of STARTERS) {
    const preset = BOARDS.kit.find((k) => k.id === sound);
    assert.ok(preset, `${sound} is a preset`);
    assert.ok(readFileSync(new URL(preset.file, web)).length > 1000, `${sound} has its audio`);
  }
  assert.equal(nameSoundOf('zed-name', kitIds), 'zed');
  assert.equal(nameSoundOf('zed-airhorn', kitIds), null);
  assert.equal(nameSoundOf('zed-kick', kitIds), null);
  assert.equal(nameSoundOf('user-abc-1', kitIds), null);
});

test('a sound stored with no type, or a video type, keeps its audio; text or a picture does not', () => {
  assert.equal(audioMime('audio/webm;codecs=opus'), 'audio/webm;codecs=opus');
  assert.equal(audioMime('video/3gpp'), 'audio/3gpp');
  assert.equal(audioMime('', 'audio/mp4'), 'audio/mp4');
  assert.equal(audioMime(undefined, ''), 'audio/x-unknown');
  assert.equal(audioMime('application/octet-stream'), 'audio/x-unknown');
  assert.equal(audioMime('text/html', 'audio/webm'), null);
  assert.equal(audioMime('image/png'), null);
});

test('an old device: every recording arrives, a kid\'s starter edits land on the presets, and the rest is said', async () => {
  const stores = oldDevice();
  const data = readOldStores(stores, here());

  // Every recording, by id, with its audio byte for byte.
  const byId = new Map(data.clips.map((c) => [c.id, c]));
  for (const c of stores.clips) {
    const got = byId.get(c.id);
    assert.ok(got, `${c.label} arrived`);
    assert.equal(got.personId, c.personId);
    if (!(c.blob instanceof Sized)) assert.deepEqual(new Uint8Array(await got.blob.arrayBuffer()), new Uint8Array(await c.blob.arrayBuffer()));
  }
  const [plain, voiced, chained, trimmed, long, untyped, video, oldColor] = stores.clips.map((c) => byId.get(c.id));
  assert.deepEqual([voiced.voice, voiced.amount, voiced.mime], ['chipmunk', 2.5, 'audio/mp4']);
  assert.ok(chained.fx, 'the chain of voices comes');
  assert.deepEqual([trimmed.trim, trimmed.fade, trimmed.root], [{ start: 0.1, end: 0.9 }, { in: 0.05, out: 0.2 }, 60]);
  assert.equal(long.label, 'A label far longer than', 'cut to 24 letters and trimmed: changed, not lost');
  assert.equal(untyped.mime, 'audio/x-unknown');
  assert.equal(video.mime, 'audio/3gpp');
  assert.equal(oldColor.color, 'sunflower', 'an old color name is mapped when the pad is drawn');
  assert.equal(plain.voice, 'normal');
  assert.equal(byId.get(stores.clips.at(-1).id).from.id, stores.clips[0].id);

  // Starters are presets under the same ids: the renamed airhorn is an
  // edit of the kid's Airhorn preset, a hidden one stays hidden, and every
  // beat, open beat, DJ key, take and pad order that plays one is unchanged.
  assert.equal(data.clips.length, stores.clips.length, 'no starter becomes a sound of its own');
  const edits = Object.fromEntries(data.overrides.map((o) => [o.id, o]));
  assert.deepEqual(Object.keys(edits).sort(), ['quin-boing', 'zed-airhorn', 'zed-kick', 'zed-laser']);
  assert.deepEqual([edits['zed-airhorn'].label, edits['zed-airhorn'].voice, edits['zed-airhorn'].amount], ['Horn of doom', 'monster', 2]);
  assert.equal(edits['quin-boing'].emoji, '🦘');
  assert.equal(edits['zed-laser'].hidden, true);
  assert.deepEqual(data.beats[0].rows.map((r) => r.clipId), ['zed-airhorn', stores.clips[1].id, 'zed-tada']);
  assert.equal(data.patterns[0].rows[0].clipId, 'quin-rimshot');
  assert.equal(data.patterns[0].rows[1].clipId, 'quin-kick', 'kit rows stay');
  assert.equal(data.decks[0].keys.KeyQ, 'zed-drumroll');
  assert.equal(data.takes[0].events[0].clipId, 'zed-sad-trombone');
  assert.deepEqual(data.orders[0].ids, ['zed-name', 'zed-airhorn', stores.clips[0].id, 'zed-kick']);

  // People: the rename kept, the others with fun names, the deleted board
  // back as deleted because it still has a sound.
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  assert.equal(people.zed.name, 'Zeddo');
  assert.ok(isFunName(people.quin.name), people.quin.name);
  assert.ok(people.quin.avatar, 'a picture too');
  assert.equal(people.quin.color, '#9E1640');
  assert.equal(people.olly.hidden, true);
  assert.equal(people.wim, undefined, 'a bare deleted record goes');
  assert.equal(people['p-lb2x1-ab12'].name, 'Rocket');

  // What is left out, and said: the one change to the spoken name clip.
  assert.deepEqual(data.left, { nameSound: 1 });
  assert.equal(data.skipped, 0, 'no record of the stores was dropped');
  const note = leftOutNote(data);
  assert.match(note, /Left out: 1 change to the old name sounds/);
  assert.match(note, /1 sound is on a deleted board: 👥 People → Bring back\./);
  assert.ok(note.includes(`${people.quin.name}: a board from the old app, with a made-up name. 🎲 in 👥 People picks another.`), note);

  // The merge onto a new device keeps all of it, and the empty Me goes.
  const merged = await mergeLoaded({ people: [{ id: 'p-me', name: 'Me', color: '#1F3FA8', added: true, created: 1 }] }, data, { kitIds });
  assert.equal(merged.put.clips.length, data.clips.length);
  assert.equal(merged.added.sounds, stores.clips.length);
  assert.deepEqual(merged.dropPeople, ['p-me']);

  // Bringing them in again changes nothing.
  const again = readOldStores(oldDevice(), here());
  const twice = await mergeLoaded({ ...merged.put, people: merged.put.people }, again, { kitIds });
  assert.equal(twice.put.clips.length, 0, 'nothing doubled');
});

test('the notice names every reason in plain words, and covers anything else', () => {
  assert.equal(leftOutNote({ skipped: 0, left: {} }), '');
  assert.equal(leftOutNote({ skipped: 3, left: { 'clips:notAudio': 1, beats: 1 } }), ' Left out: 1 sound whose file isn\'t a sound file, 1 damaged beat, 1 other item.');
  assert.match(leftOutNote({ skipped: 1, left: { 'clips:tooBig': 1 } }), /1 sound too big to load \(over 80 MB\)/);
});

test('a cleanBackup caller from before (cloud sync) still works without the new options', () => {
  const out = cleanBackup({ clips: [rec('p-a', { blob: undefined })] }, () => audio(10), { peopleIds: new Set(), clipIds: new Set(), addedPeopleIds: new Set(['p-a']) });
  assert.equal(out.clips.length, 1);
});
