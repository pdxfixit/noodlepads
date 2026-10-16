// 👆 touch layouts' pure rules (web/touch.js, ADR 0028): bands of sounds,
// each one group at one size, their starting sounds, the ready-made ones,
// changing a layout in ✏️ Edit layout, and cleaning what comes in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MINE, SIZES, MAX_BANDS, MAX_BAND_SOUNDS, READY_TOUCH, STARTERS, soundsOf, startingSounds, newBand, readyTouch, defaultTouch,
  addBand, removeBand, moveBand, setSize, remainingSounds, addSounds, swapTile, removeTile, sameTouch, keepAsMine,
  touchSounds, touchOrder, cleanBand, cleanTouch, cleanTouchLayout, touchName,
} from '../web/touch.js';

const BOARDS = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
// Pip's sounds as board.js clipsFor gives them: their own, then their copy of the kit (Advanced off).
const kit = BOARDS.kit.filter((k) => !k.advanced).map((k) => ({ id: `pip-${k.id}`, kit: true, group: k.group, label: k.label }));
const own = [{ id: 'user-1', label: 'Burp', created: 1 }, { id: 'user-2', label: 'Moo', created: 3 }, { id: 'user-3', label: 'Ha', created: 2 }];
const sounds = soundsOf([...own, ...kit], 'pip');
const noOwn = soundsOf(kit, 'pip');

test('sizes are 5, 4 and 2 tiles across; at most 8 bands', () => {
  assert.deepEqual(SIZES, { s: 5, m: 4, l: 2 });
  assert.equal(MAX_BANDS, 8);
});

test('every starter and ready-made sound is a real kit sound, never an Advanced-only one', () => {
  const known = new Map(BOARDS.kit.map((k) => [k.id, k]));
  const groups = new Set(BOARDS.kitGroups.map((g) => g.id));
  for (const [g, ids] of Object.entries(STARTERS)) {
    assert.ok(groups.has(g), g);
    for (const id of ids) { assert.equal(known.get(id)?.group, g, id); assert.ok(!known.get(id).advanced, id); }
  }
  assert.ok(READY_TOUCH.length >= 3 && READY_TOUCH.length <= 4);
  for (const r of READY_TOUCH) {
    assert.ok(r.bands.length <= MAX_BANDS);
    for (const b of r.bands) {
      assert.ok(groups.has(b.group), `${r.id}: ${b.group}`);
      assert.ok(SIZES[b.size]);
      for (const id of b.sounds ?? []) { assert.ok(known.has(id), `${r.id}: ${id}`); assert.ok(!known.get(id).advanced, id); }
      assert.equal(new Set(b.sounds ?? []).size, (b.sounds ?? []).length, `${r.id}: no sound twice in a band`);
    }
  }
});

test('a new band starts with its group\'s few: drums, chords, the natural notes, five bass notes; others their first line; My sounds the newest', () => {
  assert.deepEqual(startingSounds('drums', sounds), ['pip-kick', 'pip-snare', 'pip-hihat', 'pip-clap']);
  assert.deepEqual(startingSounds('chords', sounds), ['pip-chord-c', 'pip-chord-am', 'pip-chord-f', 'pip-chord-g']);
  assert.deepEqual(startingSounds('notes', sounds).map((id) => id.slice(4)), ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high']);
  assert.deepEqual(startingSounds('bass', sounds), ['pip-bass-c', 'pip-bass-d', 'pip-bass-e', 'pip-bass-g', 'pip-bass-a']);
  assert.deepEqual(startingSounds('animals', sounds), ['pip-moo', 'pip-quack', 'pip-tweet', 'pip-roar']);
  assert.deepEqual(startingSounds(MINE, sounds), ['user-2', 'user-3', 'user-1'], 'newest first');
  assert.deepEqual(newBand('drums', sounds), { group: 'drums', size: 'l', sounds: ['pip-kick', 'pip-snare', 'pip-hihat', 'pip-clap'] });
  assert.equal(newBand('bass', sounds).size, 's');
  assert.equal(newBand('chords', sounds).size, 'm');
  // A kit sound hidden on this board is left out; with none of the starters, the group's first ones.
  const hidden = soundsOf(kit.filter((c) => !['pip-kick', 'pip-snare', 'pip-hihat', 'pip-clap'].includes(c.id)), 'pip');
  assert.deepEqual(startingSounds('drums', hidden).slice(0, 2), ['pip-open-hat', 'pip-tom-high']);
});

test('ready-made layouts resolve to the person\'s own copies; the default is 🎸 Band, under their newest sounds', () => {
  const band = readyTouch(READY_TOUCH[0], noOwn);
  assert.equal(READY_TOUCH[0].name, 'Band');
  assert.deepEqual(band.bands.map((b) => [b.group, b.size, b.sounds.length]), [['chords', 'm', 4], ['drums', 'l', 4], ['bass', 's', 5]]);
  assert.deepEqual(defaultTouch(noOwn), band, 'no own sounds: just the band');
  const mine = defaultTouch(sounds);
  assert.deepEqual(mine.bands[0], { group: MINE, size: 'm', sounds: ['user-2', 'user-3', 'user-1'] });
  assert.deepEqual(mine.bands.slice(1), band.bands);
  const gone = soundsOf(kit.filter((c) => c.id !== 'pip-moo'), 'pip');
  assert.ok(!readyTouch(READY_TOUCH.find((r) => r.id === 'zoo-band'), gone).bands[0].sounds.includes('pip-moo'), 'a missing kit sound is left out');
});

test('bands: added at the bottom (never past 8), removed, moved, resized; nothing changes the layout it was given', () => {
  const start = { bands: [newBand('drums', sounds)] };
  const frozen = JSON.stringify(start);
  let t = addBand(start, newBand('chords', sounds));
  t = addBand(t, newBand(MINE, sounds));
  assert.deepEqual(t.bands.map((b) => b.group), ['drums', 'chords', MINE]);
  assert.deepEqual(moveBand(t, 2, 0).bands.map((b) => b.group), [MINE, 'drums', 'chords']);
  assert.deepEqual(moveBand(t, 0, 9).bands.map((b) => b.group), ['chords', MINE, 'drums'], 'past the end is the end');
  assert.deepEqual(removeBand(t, 1).bands.map((b) => b.group), ['drums', MINE]);
  assert.equal(setSize(t, 0, 's').bands[0].size, 's');
  assert.equal(setSize(t, 0, 'xl').bands[0].size, 'l', 'an unknown size changes nothing');
  let full = t;
  for (let i = 0; i < 10; i++) full = addBand(full, newBand('bass', sounds));
  assert.equal(full.bands.length, MAX_BANDS);
  assert.equal(JSON.stringify(start), frozen);
});

test('+ more adds the group\'s other sounds; a tile swaps its sound (trading places with a twin) or comes out', () => {
  const t = { bands: [newBand('drums', sounds)] };
  const rest = remainingSounds(t, 0, sounds);
  assert.equal(rest[0], 'pip-open-hat');
  assert.ok(!rest.includes('pip-kick'));
  const more = addSounds(t, 0, rest);
  assert.equal(more.bands[0].sounds.length, 4 + rest.length);
  assert.deepEqual(remainingSounds(more, 0, sounds), []);
  assert.equal(addSounds(t, 0, ['pip-kick']).bands[0].sounds.length, 4, 'a sound already there is not added twice');
  assert.deepEqual(swapTile(t, 0, 0, 'pip-moo').bands[0].sounds, ['pip-moo', 'pip-snare', 'pip-hihat', 'pip-clap'], 'any sound, from any group');
  assert.deepEqual(swapTile(t, 0, 0, 'pip-clap').bands[0].sounds, ['pip-clap', 'pip-snare', 'pip-hihat', 'pip-kick']);
  assert.deepEqual(removeTile(t, 0, 1).bands[0].sounds, ['pip-kick', 'pip-hihat', 'pip-clap']);
  const many = addSounds(t, 0, Array.from({ length: 60 }, (_, i) => `user-x${i}`));
  assert.equal(many.bands[0].sounds.length, MAX_BAND_SOUNDS);
});

test('⭐ My layout keeps a hand-made layout, never one that is just a saved or ready-made one', () => {
  const band = readyTouch(READY_TOUCH[0], noOwn);
  assert.equal(keepAsMine(band, [band]), null);
  const mine = setSize(band, 0, 's');
  assert.deepEqual(keepAsMine(mine, [band]), mine);
  assert.ok(sameTouch(band, JSON.parse(JSON.stringify(band))));
  assert.ok(!sameTouch(band, mine));
});

test('the beat\'s rows follow the layout: band by band, tile by tile; others last', () => {
  const t = { bands: [{ group: 'chords', size: 'm', sounds: ['c', 'am'] }, { group: 'drums', size: 'l', sounds: ['kick', 'c'] }] };
  assert.deepEqual(touchSounds(t), ['c', 'am', 'kick']);
  const rows = [{ clipId: 'kick' }, { clipId: 'moo' }, { clipId: 'am' }, { clipId: 'c' }];
  assert.deepEqual(touchOrder(rows, t), [3, 2, 0, 1]);
});

test('cleaning: safe groups and sizes, short ids, each sound once, at most 8 bands; a saved layout has a safe id and a typed name', () => {
  assert.deepEqual(cleanBand({ group: 'sci-fi', size: 'l', sounds: ['a', 'a', 5, 'x'.repeat(80)] }), { group: 'sci-fi', size: 'l', sounds: ['a', 'x'.repeat(64)] });
  assert.equal(cleanBand({ group: '../x', sounds: [] }), null);
  assert.equal(cleanBand(null), null);
  assert.deepEqual(cleanBand({ group: 'drums' }), { group: 'drums', size: 'm', sounds: [] });
  assert.equal(cleanTouch({ bands: Array.from({ length: 12 }, () => ({ group: 'drums', sounds: [] })) }).bands.length, MAX_BANDS);
  assert.equal(cleanTouch({ bands: 'x' }), null);
  assert.equal(cleanTouch(null), null);
  const l = cleanTouchLayout({ id: 'touch-abc', personId: 'p-1', name: '  My   party layout that is very long  ', created: 5, bands: [{ group: 'drums', size: 's', sounds: ['k'] }], extra: 1 });
  assert.deepEqual(l, { id: 'touch-abc', personId: 'p-1', name: 'My party layout that is', created: 5, bands: [{ group: 'drums', size: 's', sounds: ['k'] }] });
  assert.equal(cleanTouchLayout({ ...l, id: 'layout-1' }), null);
  assert.equal(cleanTouchLayout({ ...l, bands: null }), null);
  assert.equal(cleanTouchLayout({ ...l, name: '  ' }).name, 'Layout');
  assert.equal(touchName('   '), null);
  assert.equal(touchName(' Jam '), 'Jam');
});
