// 🎹 Who plays, phase 2 (ADR 0030): the instrument picker everywhere besides
// Pads. The pure parts (another instrument's copy of a note, a band
// swapped, a band's starters on the picked instrument, the toy keys'
// instruments), then the real app on the stand-in page: the beat row's
// sound chooser, 🎹 Add a tune's "Who plays it?", the piano roll's swap
// (every note kept), ✏️ Edit keys, a 👆 band in ✏️ Edit layout, and 🧸
// Kids' round instrument button. A beat, key or band keeps the exact sound
// it was given: only an explicit swap changes one. How each instrument
// sounds needs a real device.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff } from './new-beat.mjs';
import { versionFor, ownIdOf } from '../web/instruments.js';
import { soundsOf, swapBand, startingSounds, MINE } from '../web/touch.js';
import { KIDS_KEYS, KIDS_INSTRUMENTS, nextKidsInstrument, keyKitId } from '../web/kids-logic.js';
import { KEY_ROWS } from '../web/rhythm.js';

// ── The pure parts ──

test('another instrument\'s copy of a note is the same note: piano-e for note-e, back to note-e on Pluck', () => {
  assert.equal(versionFor('note-e', 'notes', 'piano'), 'piano-e');
  assert.equal(versionFor('note-e', 'notes', 'pluck'), 'note-e', 'the group\'s own sound is the preset itself');
  assert.equal(versionFor('chord-am', 'chords', 'guitar'), 'guitar-am-chord');
  assert.equal(versionFor('bass-c', 'bass', '808'), '808-c');
  assert.equal(versionFor('note-e', 'notes', 'upright'), null, 'Upright plays only Bass');
  assert.equal(versionFor('kick', 'drums', 'piano'), null, 'no instrument plays the drums');
  assert.equal(ownIdOf({ kitId: 'piano-e', plays: 'note-e' }), 'note-e');
  assert.equal(ownIdOf({ kitId: 'note-e' }), 'note-e');
});

test('a band swapped keeps its other sounds and never holds one twice', () => {
  const t = { bands: [{ group: 'notes', size: 'm', sounds: ['a', 'b', 'mine'] }] };
  const out = swapBand(t, 0, (id) => ({ a: 'x', b: 'x' }[id] ?? id));
  assert.deepEqual(out.bands[0].sounds, ['x', 'mine']);
  assert.deepEqual(t.bands[0].sounds, ['a', 'b', 'mine'], 'the layout it was given is left alone');
  assert.deepEqual(swapBand(t, 3, () => 'x'), t, 'no such band: nothing changes');
});

test('with Piano picked, a new band of Notes starts on the piano\'s C to high C', () => {
  const own = ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high'];
  const clips = own.map((k) => ({ id: `p-piano-${k.slice(5)}`, kit: true, group: 'notes', plays: k }));
  const s = soundsOf(clips, 'p');
  assert.equal(s.kit.get('note-c'), 'p-piano-c', 'the piano\'s C stands for the C');
  assert.deepEqual(startingSounds('notes', s), clips.map((c) => c.id));
  assert.deepEqual(s.groups.get(MINE), []);
  // With every instrument's presets listed, the group's own C is the C.
  const all = soundsOf([{ id: 'p-note-c', kit: true, group: 'notes' }, ...clips], 'p');
  assert.equal(all.kit.get('note-c'), 'p-note-c');
});

test('🧸 the toy keys\' instruments: Pluck, Piano, Marimba, Steel drum, Kalimba, round again', () => {
  assert.deepEqual(KIDS_INSTRUMENTS, ['pluck', 'piano', 'marimba', 'steel', 'kalimba']);
  assert.equal(nextKidsInstrument('pluck'), 'piano');
  assert.equal(nextKidsInstrument('kalimba'), 'pluck');
  assert.equal(nextKidsInstrument('flute'), 'pluck', 'one picked elsewhere starts the list again');
  assert.equal(keyKitId(KIDS_KEYS[2], 'marimba'), 'marimba-e');
  assert.equal(keyKitId(KIDS_KEYS[2], 'pluck'), 'note-e');
  assert.equal(keyKitId(KIDS_KEYS[5], 'steel'), 'steel-c', 'a high key is its low note, an octave up');
});

// ── The real app ──

let page;
let $;
let state;
let played;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  played = [];
  audio.play = async (clip) => { played.push(clip.id); };
});

const pid = () => state.personId;
const pick = (k) => state.prefs.get(pid())?.values?.[k];
// The open beat: 🆕 New opens the person's scratch beat, kept in the library.
const rows = () => (state.patterns.get(pid()) ?? state.savedBeats.find((b) => b.personId === pid() && b.id.startsWith('beat-scratch-')))?.rows ?? [];
const section = (group) => $('#chooser-grid').children.find((s) => s.querySelector(`[data-toggle-group="${group}"]`));
const roll = () => $('#roll');
const rollPart = (name) => roll().querySelector(`[data-roll="${name}"]`);

test('the beat row\'s sound chooser: Notes, Chords and Bass say who plays them; a pick is the person\'s and changes no row', async () => {
  keysOff(page);
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');
  $('#seq-add').dispatch('click');
  $('#chooser-ok').dispatch('click');                                    // a row of the sound ticked first
  const before = rows()[0].clipId;
  $('#seq-rows').querySelector('[data-pick="0"]').dispatch('click');
  assert.equal($('#chooser').open, true);
  for (const g of ['notes', 'chords', 'bass']) assert.ok(section(g).querySelector(`[data-inst-pick="${g}"]`), g);
  assert.equal(section('drums').querySelector('[data-inst-pick]'), null);
  const who = () => section('notes').querySelector('[data-inst-pick="notes"]');
  assert.equal(who().getAttribute('aria-label'), 'Who plays Notes: Pluck');
  assert.ok(who().title, 'a tooltip of its own');
  who().dispatch('click');
  const list = () => $('#chooser-grid').querySelector('#inst-list-chooser-notes');
  assert.ok(list(), 'the instruments, by family, under the name');
  assert.deepEqual(list().querySelectorAll('.inst-family-name').map((h) => h.textContent), ['Keys', 'Mallets', 'Strings', 'Wind']);
  list().querySelector('[data-inst="piano"]').dispatch('click');
  await page.settle();
  assert.equal(list(), null, 'it closes on a pick');
  assert.equal(pick('instNotes'), 'piano', 'the person\'s own pick, as on Pads');
  assert.equal(who().getAttribute('aria-label'), 'Who plays Notes: Piano');
  assert.equal(section('notes').querySelector('[data-toggle-group]').getAttribute('aria-expanded'), 'true', 'the group opens on the new notes');
  const ids = section('notes').querySelectorAll('[data-choose]').map((b) => b.dataset.choose);
  assert.ok(ids.length >= 8 && ids.every((id) => id.startsWith(`${pid()}-piano-`)), ids.join());
  assert.ok($('#pads').querySelector(`[data-inst-pick="notes"]`).getAttribute('aria-label').endsWith('Piano'), 'Pads shows the same pick');
  $('#chooser').close();
  assert.equal(rows()[0].clipId, before, 'the row keeps its sound');
});

test('🎹 Add a tune asks who plays it: the tune starts on that instrument\'s C, and the pick is kept', async () => {
  $('#seq-add-tune').dispatch('click');
  assert.equal($('#tune-who').open, true);
  const choices = () => $('#tune-who-list').querySelectorAll('[data-inst]');
  assert.deepEqual(choices().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.inst), ['piano'], 'the person\'s pick ticked');
  choices().find((b) => b.dataset.inst === 'marimba').dispatch('click');
  await page.settle();
  assert.equal($('#tune-who').open, false);
  assert.equal(roll().open, true, 'the roll opens on it');
  const tune = rows().at(-1);
  assert.equal(tune.melody, true);
  assert.equal(tune.clipId, `${pid()}-marimba-c`);
  assert.equal(pick('instNotes'), 'marimba');
});

test('the roll\'s top line swaps who plays the tune, and every note stays where it was', async () => {
  const cell = (p, s) => rollPart('grid').querySelector(`.note-cell[data-p="${p}"][data-s="${s}"]`);
  cell(4, 2).dispatch('click');
  cell(7, 6).dispatch('click');
  const i = rows().length - 1;
  const notes = structuredClone(rows()[i].tune);
  assert.equal(notes.length, 2);
  const who = () => rollPart('inst').querySelector('[data-inst-pick]');
  assert.equal(rollPart('inst').hidden, false);
  assert.equal(who().getAttribute('aria-label'), 'Who plays Notes: Marimba');
  assert.ok(who().title);
  assert.equal(rollPart('insts').hidden, true);
  who().dispatch('click');
  assert.equal(rollPart('insts').hidden, false);
  const list = rollPart('insts').querySelector('.inst-list');
  assert.deepEqual(list.querySelectorAll('[aria-pressed="true"]').map((b) => b.dataset.inst), ['marimba']);
  list.querySelector('[data-inst="flute"]').dispatch('click');
  await page.settle();
  assert.equal(rows()[i].clipId, `${pid()}-flute-c`, 'the same C, on the flute');
  assert.deepEqual(rows()[i].tune, notes, 'every note kept');
  assert.equal(rollPart('insts').hidden, true, 'the list closes');
  assert.equal(who().getAttribute('aria-label'), 'Who plays Notes: Flute');
  assert.match(rollPart('status').textContent, /Flute plays the tune now/);
  assert.equal(pick('instNotes'), 'flute', 'the person\'s pick follows, as every picker\'s does');
  // A row on a sound no instrument plays has no swap.
  rollPart('done').dispatch('click');
  assert.equal(roll().open, false);
});

test('✏️ Edit keys: the keys nobody changed keep Pluck; an open Notes group says who plays it, and filling a row uses the pick', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
  $('#dj-change').dispatch('click');
  assert.equal($('#keys-edit').open, true);
  const key = (code) => $('#ke-keys').querySelector(`[data-code="${code}"]`);
  played.length = 0;
  key('Digit5').dispatch('click');                         // no sounds picked: a tap plays the key
  assert.deepEqual(played, [`${pid()}-note-g`], 'the default keys stay on the group\'s own notes, Flute picked or not');
  assert.equal($('#ke-inst').hidden, true, 'no picker for a group no instrument plays');
  const notes = () => $('#ke-groups').querySelector('[data-group="kit-notes"]');
  notes().dispatch('click');
  const who = () => $('#ke-inst').querySelector('[data-inst-pick="notes"]');
  assert.equal($('#ke-inst').hidden, false);
  assert.equal(who().getAttribute('aria-label'), 'Who plays Notes: Flute');
  assert.ok($('#ke-picks').querySelectorAll('[data-sound]').every((b) => b.dataset.sound.startsWith(`${pid()}-flute-`)));
  who().dispatch('click');
  assert.ok($('#ke-inst').querySelector('#inst-list-keys-notes'));
  $('#ke-inst').querySelector('[data-inst="piano"]').dispatch('click');
  await page.settle();
  assert.equal(pick('instNotes'), 'piano');
  assert.equal($('#ke-inst').querySelector('.inst-list'), null, 'it closes on a pick');
  assert.match($('#ke-note').textContent, /Piano plays 🎹 Notes now/);
  const sounds = $('#ke-picks').querySelectorAll('[data-sound]').map((b) => b.dataset.sound);
  assert.ok(sounds.length >= 8 && sounds.every((id) => id.startsWith(`${pid()}-piano-`)), sounds.join());
  notes().dispatch('click');                               // the open group, tapped again: onto a row
  const row = $('#ke-note').textContent.match(/is on the (.+?)\./)?.[1];
  const names = ['number row', 'top letter row', 'middle row', 'bottom row'];
  assert.ok(names.includes(row), $('#ke-note').textContent);
  played.length = 0;
  key(KEY_ROWS[names.indexOf(row)][0]).dispatch('click');
  assert.deepEqual(played, [`${pid()}-piano-c`], 'the row plays the piano');
  $('#ke-undo').dispatch('click');
  $('#keys-edit').close();
});

test('👆 a band of Chords says who plays it; a pick plays every tile\'s chord on that instrument, and ↩️ Undo puts them back', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('instChords', 'guitar');
  await page.settle();
  $('#dj-input').querySelector('[data-input="touch"]').dispatch('click');
  const tiles = () => $('#dj-touch').querySelectorAll('[data-clip]').map((t) => t.dataset.clip);
  assert.ok(tiles().includes(`${pid()}-chord-c`), 'the default layout keeps the group\'s own chords, Guitar picked or not');
  $('#dj-change').dispatch('click');
  assert.equal($('#touch-edit').open, true);
  const bands = state.decks.get(pid())?.touch?.bands;
  assert.equal(bands, undefined, 'nothing stored yet');
  const names = $('#te-bands').querySelectorAll('.te-band-name').map((n) => n.textContent);
  const i = names.indexOf('🎶 Chords');
  assert.ok(i >= 0, names.join());
  const who = () => $('#te-bands').querySelector(`[data-inst-pick][data-inst-band="${i}"]`);
  assert.equal(who().getAttribute('aria-label'), 'Who plays Chords: Synth', 'the band\'s own instrument');
  assert.ok(who().title);
  assert.equal($('#te-bands').querySelector('[data-inst-pick][data-inst-band="0"]'), null, '🎤 My sounds has none');
  const before = [...$('#te-bands').querySelector(`.te-band[data-band="${i}"]`).querySelectorAll('[data-tile]')].length;
  who().dispatch('click');
  $('#te-bands').querySelector(`[data-inst="piano"][data-inst-band="${i}"]`).dispatch('click');
  await page.settle();
  const band = state.decks.get(pid()).touch.bands[i];
  assert.ok(band.sounds.length === before && band.sounds.every((id) => /-piano-[a-z0-9]+-chord$/.test(id)), band.sounds.join());
  assert.ok(band.sounds.includes(`${pid()}-piano-c-chord`), 'the same chords, on the piano');
  assert.equal(who().getAttribute('aria-label'), 'Who plays Chords: Piano');
  assert.equal(pick('instChords'), 'piano');
  assert.match($('#te-note').textContent, /Piano plays 🎶 Chords now/);
  $('#te-undo').dispatch('click');
  assert.ok(state.decks.get(pid()).touch.bands[i].sounds.includes(`${pid()}-chord-c`), 'Undo puts the chords back');
  $('#touch-edit').close();
  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
});

test('🧸 Kids: a round instrument button on Keys; each tap plays the toy keys on the next one, kept as the person\'s', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('instNotes', 'pluck');
  await setSetting('level', 'kids');
  await page.settle();
  $('[data-kids-tab="keys"]').dispatch('click');
  const button = $('#kids-inst');
  assert.equal(button.textContent, '💧', 'Pluck, by its picture: no words');
  assert.match(button.getAttribute('aria-label'), /^Next instrument/);
  const { audio } = await import('../web/audio.js');
  const plain = audio.play;
  const heard = [];
  audio.play = async (clip, opts) => { heard.push([clip.kitId, opts?.rate ?? 1]); };
  const tapKeys = () => {
    const keys = $('#kids-keys').querySelectorAll('.kids-key');
    keys[2].dispatch('pointerdown', { pointerId: 3 }); keys[2].dispatch('pointerup', { pointerId: 3 });
    keys[5].dispatch('pointerdown', { pointerId: 4 }); keys[5].dispatch('pointerup', { pointerId: 4 });
  };
  const faces = () => $('#kids-keys').querySelectorAll('.kids-key-face').map((f) => f.textContent);
  const fruit = faces();
  button.dispatch('click');
  await page.settle();
  assert.equal(pick('instNotes'), 'piano');
  assert.equal(button.textContent, '🎹');
  tapKeys();
  assert.deepEqual(heard, [['piano-e', 1], ['piano-c', 2]], 'the same notes on the piano, the high one an octave up');
  assert.deepEqual(faces(), fruit, 'each key keeps its fruit');
  for (const want of ['marimba', 'steel', 'kalimba', 'pluck']) {
    button.dispatch('click');
    await page.settle();
    assert.equal(pick('instNotes'), want);
  }
  heard.length = 0;
  tapKeys();
  assert.deepEqual(heard, [['note-e', 1], ['note-c', 2]], 'round to Pluck again');
  audio.play = plain;
  await setSetting('level', 'regular');
  await page.settle();
});
