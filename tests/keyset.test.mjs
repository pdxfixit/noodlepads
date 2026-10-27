// DJ ✏️ Edit keys' pure rules (web/keyset.js): placing sounds, moving what
// was in the way, swapping, clearing, loading a row, and the layouts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEY_ROWS, KEY_CODES } from '../web/rhythm.js';
import { FAMILIES, INSTRUMENTS, presetInstrument } from '../web/instruments.js';
import {
  fullKeys, placeSounds, loadRow, nextFreeRow, swapKeys, clearKey, sameKeys, changedKeys,
  READY_LAYOUTS, readyKeys, keepAsMine, cleanLayout, layoutName, rowOf,
} from '../web/keyset.js';

const [NUMBERS, TOP, HOME, BOTTOM] = KEY_ROWS;
// A keyboard from a list of [code, id] pairs; the rest No sound.
const board = (pairs = []) => ({ ...fullKeys(), ...Object.fromEntries(pairs) });

test('fullKeys: all 40 keys, a missing or odd one as No sound', () => {
  const k = fullKeys({ KeyA: 'kick', KeyS: '', KeyD: 5, Nope: 'x' });
  assert.equal(Object.keys(k).length, 40);
  assert.equal(k.Digit1, null, 'a board from before the number row has it empty');
  assert.equal(k.KeyA, 'kick');
  assert.equal(k.KeyS, null);
  assert.equal(k.KeyD, null);
  assert.equal(k.Nope, undefined);
  assert.equal(rowOf('Digit7'), 0);
  assert.equal(rowOf('KeyZ'), 3);
});

test('placeSounds: sounds land from the key on, in reading order, and what was there moves to the nearest free key', () => {
  const keys = board([['KeyA', 'kick'], ['KeyS', 'snare'], ['KeyD', 'hat']]);
  const { keys: out, left } = placeSounds(keys, 'KeyS', ['moo', 'quack']);
  assert.equal(out.KeyA, 'kick');
  assert.equal(out.KeyS, 'moo');
  assert.equal(out.KeyD, 'quack');
  // snare and hat were pushed off: same row first, left to right, never onto the keys just placed.
  assert.equal(out.KeyF, 'snare');
  assert.equal(out.KeyG, 'hat');
  assert.deepEqual(left, []);
  assert.equal(placeSounds(keys, 'KeyS', ['moo', 'quack']).moved, 2);
  assert.equal(keys.KeyS, 'snare', 'the keys given are never changed');
});

test('placeSounds: picks run on into the next row, and those past the last key are left', () => {
  const { keys: out, left } = placeSounds(board(), 'Period', ['a', 'b', 'c']);
  assert.equal(out.Period, 'a');
  assert.equal(out.Slash, 'b');
  assert.deepEqual(left, ['c']);
  const wrapped = placeSounds(board(), 'KeyP', ['a', 'b']).keys;
  assert.equal(wrapped.KeyP, 'a');
  assert.equal(wrapped.KeyA, 'b', 'from the end of the top row on to the home row');
});

test('placeSounds: a sound already placed is not pushed, and a full board says what did not fit', () => {
  const keys = Object.fromEntries(KEY_CODES.map((c, i) => [c, `s${i}`]));
  const { keys: out, left } = placeSounds(keys, 'Digit1', ['new', 's0']);
  assert.equal(out.Digit1, 'new');
  assert.equal(out.Digit2, 's0');
  assert.deepEqual(left, ['s1'], 's0 was placed again, so only s1 lost its key');
  const same = placeSounds(board([['KeyQ', 'a']]), 'KeyQ', ['a', 'a']);
  assert.equal(same.keys.KeyW, null, 'a sound picked twice goes on once');
});

test('loadRow: a group fills a row from its first key; what it pushed goes to other rows; extra sounds are left', () => {
  const keys = board([['KeyQ', 'laser'], ['KeyW', 'warp'], ['KeyA', 'kick']]);
  const { keys: out, left } = loadRow(keys, 1, ['moo', 'quack']);
  assert.equal(out.KeyQ, 'moo');
  assert.equal(out.KeyW, 'quack');
  assert.equal(out.KeyA, 'kick');
  // laser and warp moved to the first free keys outside the top letter row, top to bottom: the number row first.
  assert.equal(out.Digit1, 'laser');
  assert.equal(out.Digit2, 'warp');
  const numbersFull = loadRow(board([...NUMBERS.map((c) => [c, 'n']), ['KeyQ', 'laser']]), 1, ['moo']);
  assert.equal(numbersFull.keys.KeyA, 'laser', 'then the next row down');
  assert.deepEqual(left, []);
  const many = loadRow(board(), 3, Array.from({ length: 12 }, (_, i) => `g${i}`));
  assert.deepEqual(BOTTOM.map((c) => many.keys[c]), Array.from({ length: 10 }, (_, i) => `g${i}`));
  assert.deepEqual(many.left, ['g10', 'g11']);
  // Keys past the group keep what they had.
  const short = loadRow(board([['Slash', 'boom']]), 3, ['a']);
  const digits = loadRow(board(), 0, ['a', 'b']);
  assert.deepEqual([digits.keys.Digit1, digits.keys.Digit2], ['a', 'b'], 'a group dropped on the number row');
  assert.equal(short.keys.Slash, 'boom');
});

test('loadRow: a pushed sound with no free key anywhere is left', () => {
  const keys = Object.fromEntries(KEY_CODES.map((c, i) => [c, `s${i}`]));
  const { left, moved } = loadRow(keys, 1, ['x']);
  assert.deepEqual(left, ['s10']);
  assert.equal(moved, 0);
});

test('nextFreeRow: the emptiest row, the top one on a tie', () => {
  assert.equal(nextFreeRow(board()), 0);
  assert.equal(nextFreeRow(board(NUMBERS.map((c) => [c, 'x']))), 1);
  assert.equal(nextFreeRow(board([...NUMBERS, ...TOP].map((c) => [c, 'x']))), 2);
  assert.equal(nextFreeRow(board([...NUMBERS, ...TOP, ...HOME].map((c) => [c, 'x']))), 3);
  assert.equal(nextFreeRow(board([...NUMBERS, ...TOP.slice(2), ...HOME, ...BOTTOM.slice(1)].map((c) => [c, 'x']))), 1);
});

test('swapKeys and clearKey', () => {
  const keys = board([['KeyA', 'kick'], ['KeyZ', 'bass']]);
  const s = swapKeys(keys, 'KeyA', 'KeyZ');
  assert.equal(s.KeyA, 'bass');
  assert.equal(s.KeyZ, 'kick');
  assert.equal(swapKeys(keys, 'KeyA', 'KeyX').KeyX, 'kick', 'onto an empty key is a move');
  assert.equal(clearKey(keys, 'KeyA').KeyA, null);
  assert.ok(sameKeys(swapKeys(keys, 'KeyA', 'Nope'), keys));
});

test('changedKeys: only what differs from the defaults is stored', () => {
  const base = board([['KeyA', 'kick'], ['KeyS', 'snare']]);
  const full = board([['KeyA', 'kick'], ['KeyS', null], ['KeyD', 'moo']]);
  assert.deepEqual(changedKeys(full, base), { KeyS: null, KeyD: 'moo' });
});

test('every ready-made layout is four rows of ten kit sounds, the number row too, each name and id its own', () => {
  // Only presets everyone sees: an Advanced-only one (the sharps and flats) would be No sound with Advanced off.
  const kit = new Set(JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kit.filter((k) => !k.advanced).map((k) => k.id));
  assert.equal(READY_LAYOUTS.length, 4 + FAMILIES.length, 'four for kinds of playing, one for each instrument family');
  assert.equal(new Set(READY_LAYOUTS.map((l) => l.id)).size, READY_LAYOUTS.length);
  assert.equal(new Set(READY_LAYOUTS.map((l) => l.name)).size, READY_LAYOUTS.length);
  for (const l of READY_LAYOUTS) {
    assert.equal(l.rows.length, 4, l.name);
    assert.ok(l.rows[0].every(Boolean), `${l.name}: something on every number key`);
    assert.equal(new Set(l.rows.flat()).size, 40, `${l.name}: no sound twice`);
    for (const row of l.rows) {
      assert.equal(row.length, 10, l.name);
      for (const id of row) assert.ok(id === null || kit.has(id), `${l.name}: ${id} is a kit sound`);
    }
  }
  // Beat lab: drums along the bottom (Ben, 2026-10-11).
  const lab = READY_LAYOUTS.find((l) => l.id === 'beat-lab');
  assert.ok(lab.rows[3].includes('kick') && lab.rows[3].includes('snare'));
});

const KIT = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kit;

test('each instrument family has its own ready-made layout (ADR 0030, phase 3), offered beside the others', () => {
  for (const f of FAMILIES) {
    assert.equal(READY_LAYOUTS.filter((l) => l.family === f.id).length, 1, `${f.name} has one layout`);
  }
  assert.ok(READY_LAYOUTS.filter((l) => !l.family).length >= 4, 'the layouts for kinds of playing are still there');
});

test('every pitched key of a family layout is played by that family, and the whole range of its notes is there', () => {
  const byId = new Map(KIT.map((k) => [k.id, k]));
  for (const l of READY_LAYOUTS.filter((x) => x.family)) {
    const family = new Set(INSTRUMENTS.filter((i) => i.family === l.family).map((i) => i.id));
    const used = new Set();
    for (const id of l.rows.flat()) {
      const clip = byId.get(id);
      const inst = presetInstrument(clip);
      if (!inst) continue;                                  // a drum or a silly sound
      assert.ok(family.has(inst), `${l.name}: ${id} is played by ${inst}, not by the ${l.family} family`);
      used.add(inst);
    }
    // Each note row is C up to high C, in order, on one instrument.
    const noteRows = l.rows.filter((row) => byId.get(row[0])?.group === 'notes');
    assert.ok(noteRows.length >= 2, `${l.name}: at least two note rows`);
    for (const row of noteRows) {
      assert.deepEqual(row.slice(0, 8).map((id) => byId.get(id).group), Array(8).fill('notes'), l.name);
      const inst = byId.get(row[0]).inst;
      assert.deepEqual(row.slice(0, 8), ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c-high'].map((n) => `${inst}-${n}`), `${l.name}: ${inst} from C up to high C`);
    }
    // Every instrument of the family that plays Notes is on its layout (Pluck has no row of its own beside Synth).
    for (const i of INSTRUMENTS.filter((x) => x.family === l.family && x.groups.includes('notes') && x.id !== 'pluck' && x.id !== 'organ')) {
      assert.ok(used.has(i.id), `${l.name}: ${i.name} is on it`);
    }
  }
});

test('a family layout names its presets as they are, so it is the same whoever is picked; a stored layout of them still loads', () => {
  const band = READY_LAYOUTS.find((l) => l.id === 'keyboard-band');
  const keys = readyKeys(band, (kitId) => `p-x-${kitId}`);
  assert.equal(keys.Digit1, 'p-x-chip-c');
  assert.equal(keys.KeyQ, 'p-x-piano-c');
  assert.equal(keys.KeyA, 'p-x-organ-c-chord');
  assert.equal(keys.KeyZ, 'p-x-808-c');
  // Picked as a layout, saved by a person, stored: it reads back whole.
  const saved = cleanLayout({ id: 'layout-abc', personId: 'p-x', name: 'Mine', created: 1, keys });
  assert.ok(sameKeys(saved.keys, keys));
  assert.equal(saved.keys.KeyQ, 'p-x-piano-c');
});

test('readyKeys: a layout as one person\'s keys; a kit sound they lack is No sound', () => {
  const lab = READY_LAYOUTS.find((l) => l.id === 'beat-lab');
  const keys = readyKeys(lab, (kitId) => (kitId === 'kick' ? 'p-x-kick' : null));
  assert.equal(keys.KeyZ, 'p-x-kick');
  assert.equal(keys.KeyX, null);
  assert.equal(Object.keys(keys).length, 40);
  assert.equal(readyKeys(lab, (kitId) => `p-x-${kitId}`).Digit1, 'p-x-cowbell', 'the number row is the layout\'s first');
});

test('keepAsMine: a hand-made board is kept; one that is just a layout is not', () => {
  const lab = board([['KeyA', 'kick']]);
  assert.equal(keepAsMine(lab, [lab]), null);
  const mine = board([['KeyA', 'moo']]);
  assert.deepEqual(keepAsMine(mine, [lab]), fullKeys(mine));
});

test('cleanLayout: a safe id, a short name, all 40 keys; anything else is dropped', () => {
  const l = cleanLayout({ id: 'layout-abc', personId: 'p-1', name: '  My   party layout that is very long  ', created: 5, keys: { KeyA: 'kick', KeyS: 7, Nope: 'x' }, extra: 1 });
  assert.equal(l.name, 'My   party layout that i');
  assert.equal(l.name.length, 24);
  assert.equal(l.keys.KeyA, 'kick');
  assert.equal(l.keys.KeyS, null);
  assert.equal(Object.keys(l.keys).length, 40);
  assert.equal(l.keys.Digit1, null, 'a layout saved before the number row loads with it empty');
  assert.equal(cleanLayout({ ...l, keys: { Digit9: 'moo' } }).keys.Digit9, 'moo', 'a number key is kept');
  assert.equal(l.extra, undefined);
  assert.equal(cleanLayout({ ...l, id: 'beat-1' }), null);
  assert.equal(cleanLayout({ ...l, keys: null }), null);
  assert.equal(cleanLayout({ ...l, name: '   ' }).name, 'Layout');
  assert.equal(layoutName('   '), null);
  assert.equal(layoutName(' 🚀 Rockets '), '🚀 Rockets');
});
