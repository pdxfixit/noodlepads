// A name is at most 24 characters (a person's 20, a song lane's 16), and
// every cut counts the same way and never splits a character (names.js
// cutName). Most cuts were `.slice(0, 24)`, by UTF-16 units: a name with an
// emoji in the 24th place kept half of it, a broken character on its pad,
// beat, song or take, in backups and in the cloud.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutName, nameLength, sharedRemixName, keptName } from '../web/names.js';
import { groupName } from '../web/groups.js';
import { layoutName } from '../web/keyset.js';
import { touchName } from '../web/touch.js';
import { cleanMyVoice } from '../web/voice-knobs.js';
import { cleanTake, cleanDeck } from '../web/rhythm.js';
import { cleanPattern } from '../web/beat.js';
import { cleanSong, uniqueSongName } from '../web/song.js';
import { cleanLane } from '../web/playlist.js';
import { cleanBackup } from '../web/backup.js';
import { adoptPeople } from '../web/model.js';

const LONG = `${'a'.repeat(23)}🦄zz`;      // 26 characters, the unicorn 24th
const CUT = `${'a'.repeat(23)}🦄`;
const broken = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

test('cutName: by characters, never half an emoji, never a piece of one built of several', () => {
  assert.equal(cutName(LONG), CUT);
  assert.equal(cutName(LONG, 23), 'a'.repeat(23));
  assert.equal(cutName('short'), 'short');
  assert.equal(cutName(`${'a'.repeat(23)}👍🏽`), `${'a'.repeat(23)}`, 'a thumb and its skin tone are two characters: both go');
  assert.equal(cutName(`${'a'.repeat(22)}👍🏽z`), `${'a'.repeat(22)}👍🏽`);
  assert.equal(nameLength(CUT), 24);
  assert.equal(cutName(null), '');
  assert.equal(cutName(`${'a'.repeat(23)}\uD83E`), 'a'.repeat(23), 'half an emoji an old cut left is dropped');
  assert.equal(cutName(`ab\uDD84c`), 'abc');
});

test('cutName is bounded: a name of a megabyte is cut in a few milliseconds', () => {
  const huge = '🦄a'.repeat(350000);   // about 1 MB of UTF-16
  cutName(huge);
  const start = performance.now();
  const out = cutName(huge);
  assert.ok(performance.now() - start < 50, `${performance.now() - start} ms`);
  assert.equal(out, '🦄a'.repeat(12));
  assert.equal(cutName(`${'x'.repeat(1e6)}🦄`, 24), 'x'.repeat(24));
});

test('every name and label is cut the same way', () => {
  const backup = cleanBackup({
    app: 'noodlepads', format: '1.1',
    people: [{ id: 'p-pip-1', name: `${'a'.repeat(19)}🦄z`, color: '#2D3FD6', avatar: '🦉', added: true, created: 1 }],
    beats: [{ id: 'beat-a', personId: 'p-pip-1', name: LONG, bpm: 100, bars: 1, swing: 0, rows: [], created: 1, saved: 1 }],
  }, () => null, { peopleIds: new Set(), clipIds: new Set(), colorOk: () => true });
  const cuts = {
    group: groupName(LONG),
    keyLayout: layoutName(LONG),
    touchLayout: touchName(LONG),
    voice: cleanMyVoice({ id: 'voice-a', personId: 'p', name: LONG, emoji: '🎤', knobs: { pitch: 3 }, created: 1, used: 1 })?.name,
    take: cleanTake({ id: 'take-a', personId: 'p', name: LONG, duration: 1, events: [] })?.name,
    beat: cleanPattern({ name: LONG, bpm: 100, bars: 1, rows: [] }, 'p').name,
    song: cleanSong({ personId: 'p', name: LONG, lanes: [], slots: [] }).name,
    uniqueSong: uniqueSongName(CUT, [{ id: 'song-b', name: CUT }]),
    backupBeat: backup.beats[0]?.name,
  };
  for (const [what, name] of Object.entries(cuts)) {
    assert.equal(broken(name ?? ''), false, `${what}: ${name}`);
    assert.ok(nameLength(name) <= 24, what);
  }
  assert.equal(cuts.beat, CUT);
  assert.equal(cuts.song, CUT);
  assert.equal(cuts.take, CUT);
  assert.equal(cuts.group, CUT);
  assert.equal(cuts.backupBeat, CUT);
  assert.equal(backup.people[0]?.name, `${'a'.repeat(19)}🦄`, 'a person: 20');
  assert.equal(cleanLane({ name: `${'a'.repeat(15)}🦄z` }).name, `${'a'.repeat(15)}🦄`, 'a song lane: 16');
  const [adopted] = adoptPeople({ people: [{ id: 'old', name: `${'a'.repeat(15)}🦄z` }], clips: [{ personId: 'old' }] }).add;
  assert.equal(adopted.name, `${'a'.repeat(15)}🦄`, 'an adopted person: 16');
  for (const made of [sharedRemixName(`${'a'.repeat(17)}🦄z`), keptName(LONG, [CUT])]) {
    assert.equal(broken(made), false, made);
  }
});

test('a backup\'s emoji is never cut inside a character; a take\'s sound id is never cut at all', () => {
  const family = '👨‍👩‍👧‍👦';   // 7 characters, 11 UTF-16 units
  const out = cleanBackup({ app: 'noodlepads', format: '1.1', overrides: [{ id: 'pip-kick', emoji: family }, { id: 'pip-snare', emoji: 'a😀😀😀😀' }] },
    () => null, { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick', 'pip-snare']), colorOk: () => true });
  assert.equal(out.overrides[0].emoji, family, 'whole, never 👨‍👩‍👧');
  assert.equal(out.overrides[1].emoji, 'a😀😀😀😀');
  const take = cleanTake({ id: 'take-a', personId: 'p', name: 'Jam', duration: 1, events: [
    { t: 0, clipId: `${'a'.repeat(63)}🦄z`, kind: 'hit' }, { t: 0, clipId: 'user-a\uD83E', kind: 'hit' }, { t: 0, clipId: 'user-b', kind: 'hit' }] });
  assert.deepEqual(take.events.map((e) => e.clipId), ['user-b'], 'a sound id too long, or broken, is refused: never cut into another one');
});

// Only names and pictures are cut that way: an id or a color is taken as it
// is or refused, so a broken one is never mended into one already here.
test('a backup\'s broken person id or color is refused, never mended into another', () => {
  const out = cleanBackup({
    app: 'noodlepads', format: '1.1',
    people: [{ id: 'p-pip-1\uD83E', name: 'Pip', color: '#2D3FD6', avatar: '🦉', added: true, created: 1 }, { id: `p-${'a'.repeat(70)}`, name: 'Juno', color: '#2D3FD6', avatar: '🦉', added: true, created: 2 }],
    overrides: [{ id: 'pip-kick', label: 'Kick it', color: 'red\uD800' }],
  }, () => null, { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: (c) => c === 'red' });
  assert.deepEqual(out.people.map((p) => p.id), [], 'neither becomes p-pip-1, nor a cut id');
  assert.equal(out.overrides[0].label, 'Kick it');
  assert.equal(out.overrides[0].color, undefined, 'not mended into red');
});

// Every id in what comes in is taken whole or refused: a deck's keys and its
// person, a take's person, a pad order's ids. A cut id could be another one.
test('a deck\'s sound ids and person, a take\'s person and a pad order\'s ids are never cut', () => {
  const long = `user-${'a'.repeat(70)}`;
  const deck = cleanDeck({ personId: 'p-pip-1', keys: { KeyA: long, KeyS: 'user-b' } });
  assert.deepEqual(deck.keys, { KeyS: 'user-b' }, 'the long sound id is left out, not cut');
  assert.equal(cleanDeck({ personId: `p-${'a'.repeat(70)}`, keys: {} }), null);
  assert.equal(cleanTake({ id: 'take-a', personId: `p-${'a'.repeat(70)}`, name: 'Jam', duration: 1, events: [] }), null);
  const out = cleanBackup({ app: 'noodlepads', format: '1.1', orders: [{ personId: 'pip', ids: [long, 'pip-kick', 'pip-x\uD83E'] }] },
    () => null, { peopleIds: new Set(['pip']), clipIds: new Set(['pip-kick']), colorOk: () => true });
  assert.deepEqual(out.orders[0].ids, ['pip-kick']);
});
