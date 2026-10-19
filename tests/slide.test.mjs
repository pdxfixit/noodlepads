// ⇆ Move's pure rules (web/slide.js): what a pick is, and what sliding the
// picked pills along their rows does to a beat.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pillKey, pickAll, section, shiftPick, slideRows } from '../web/slide.js';
import { cleanRow } from '../web/sequencer.js';

const on = (...steps) => Array.from({ length: 16 }, (_, i) => steps.includes(i));
const lit = (row) => row.steps.flatMap((x, i) => (x ? [i] : []));
// The beat Ben described: right, but starting on pill 3.
const late = () => [
  cleanRow({ clipId: 'kick', steps: on(2, 5, 10, 12), accents: on(2) }),
  cleanRow({ clipId: 'snare', steps: on(6, 14) }),
];

test('sliding the whole beat 2 left puts it back on pill 1, every row in step', () => {
  const rows = slideRows(late(), pickAll(2, 16), -2, 16);
  assert.deepEqual(lit(rows[0]), [0, 3, 8, 10]);
  assert.deepEqual(lit(rows[1]), [4, 12]);
  assert.equal(rows[0].accents[0], true, 'a loud hit moves with its pill');
  assert.equal(rows[0].accents[2], false);
});

test('pills slid off one end come round the other; sliding back undoes it', () => {
  const start = late();
  const rows = slideRows(start, pickAll(2, 16), 5, 16);
  assert.deepEqual(lit(rows[0]), [1, 7, 10, 15]);
  const back = slideRows(rows, shiftPick(pickAll(2, 16), 5, 16), -5, 16);
  assert.deepEqual(back.map(lit), start.map(lit));
  assert.deepEqual(lit(start[0]), [2, 5, 10, 12], 'the old rows are left as they were');
});

test('a picked section replaces what it lands on, and leaves its old place empty', () => {
  const rows = [cleanRow({ clipId: 'hat', steps: on(0, 2, 4, 6, 8, 10, 12, 14) })];
  // Pills 9–12 (one on at 10, one at 12) slid 2 left land on 7–10.
  const out = slideRows(rows, section(0, 9, 0, 12), -2, 16);
  assert.deepEqual(lit(out[0]), [0, 2, 4, 6, 8, 10, 14], '7 and 9 take 9 and 11 (off), 8 and 10 take 10 and 12 (on); 11 and 12 go empty');
});

test('only picked rows move: a pick of one row leaves the others alone', () => {
  const out = slideRows(late(), section(1, 0, 1, 15), 1, 16);
  assert.deepEqual(lit(out[0]), [2, 5, 10, 12]);
  assert.deepEqual(lit(out[1]), [7, 15]);
});

test('a slide of 0, or a whole turn, changes nothing', () => {
  const rows = late();
  for (const d of [0, 16, -32]) assert.deepEqual(slideRows(rows, pickAll(2, 16), d, 16), rows);
});

test('pills past the beat (kept from a longer shape) stay where they are', () => {
  const row = cleanRow({ clipId: 'k', steps: [...on(0), true, ...Array(15).fill(false)] });   // 32 pills, pill 16 on
  const out = slideRows([row], pickAll(1, 16), 3, 16);
  assert.deepEqual(lit(out[0]), [3, 16]);
});

test('a tune row moves the notes starting in picked pills, half pills with them', () => {
  const row = cleanRow({ clipId: 'piano', melody: true, steps: on(), tune: [{ p: 0, s: 2, l: 2 }, { p: 4, s: 3.5, l: 1 }, { p: 7, s: 8, l: 1 }] });
  const out = cleanRow(slideRows([row], section(0, 2, 0, 3), -2, 16)[0]);
  assert.deepEqual(out.tune, [{ p: 0, s: 0, l: 2 }, { p: 4, s: 1.5, l: 1 }, { p: 7, s: 8, l: 1 }]);
  assert.deepEqual(lit(out), [0, 1, 8], 'its pills follow its notes');
});

test('a tune row: notes starting where moved ones land are replaced', () => {
  const row = cleanRow({ clipId: 'piano', melody: true, steps: on(), tune: [{ p: 0, s: 0, l: 1 }, { p: 2, s: 4, l: 1 }] });
  const out = slideRows([row], section(0, 4, 0, 4), -4, 16)[0];
  assert.deepEqual(out.tune, [{ p: 2, s: 0, l: 1 }]);
});

test('picking: a section is a rectangle either way round; a pick follows its pills round the end', () => {
  assert.deepEqual([...section(1, 5, 0, 3)].sort(), ['0:3', '0:4', '0:5', '1:3', '1:4', '1:5']);
  assert.equal(pickAll(2, 4).size, 8);
  assert.deepEqual([...shiftPick(new Set(['0:0', '1:3']), -1, 4)].sort(), ['0:3', '1:2']);
  assert.ok(pickAll(1, 2).has(pillKey(0, 1)));
});
