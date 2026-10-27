// 🧸 Kids has a beat of its own (Ben, 2026-10-27): `beat-kidsown-<person>`,
// hidden, kept across visits, apart from the grown-up's scratch beat. A Kids
// visit never writes the scratch. Starts the real app on a device that
// already has data (a fake IndexedDB, filled before the start, so what Kids
// finds is what a reload finds): one person with a scratch beat and a Kids
// beat with a tune, one whose scratch still holds a Kids grid from before
// (it stays where it is; Kids starts its own, lit).
// Not tested here: the sound (audio is spied on, not heard).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { newKidsBeat, withSquare, withTuneNote, tuneRowOf, KIDS_DRUMS } from '../web/kids-logic.js';
import { kidsBeatId, scratchId, isHiddenBeat } from '../web/scratch.js';

const A = 'p-aaa-1';   // a scratch beat of their own, and a Kids beat with a tune
const B = 'p-bbb-2';   // a Kids grid in the scratch from before, no Kids beat
const idb = fakeIndexedDB();
let page;
let $;
let state;

const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });
const drums = (pid) => KIDS_DRUMS.map((d) => `${pid}-${d}`);
const stored = (pid, prefix) => idb.rows(DB_NAME, 'beats').find((b) => b.personId === pid && b.id.startsWith(prefix));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

before(async () => {
  console.error = () => {};
  // A's scratch: one kick on the first pill, nothing like a Kids grid.
  const scratchA = {
    id: scratchId(A), personId: A, name: 'Scratch', bpm: 100, bars: 1, swing: 0, signature: '4/4',
    rows: [{ clipId: `${A}-kick`, steps: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false] }],
    created: 1, saved: 1,
  };
  // A's Kids beat: the starter, a clap on square 3, a tune of one note.
  let kidsA = withSquare(newKidsBeat(A, drums(A), kidsBeatId(A), 2), drums(A), 3, 3, true, 2);
  kidsA = withTuneNote(kidsA, { clipId: `${A}-note-c`, pitch: 0, s: 0, l: 2, fresh: true }, 3);
  // B's scratch: a Kids grid as the Kids beat was the scratch before (every shaker square lit, no snare).
  let gridB = newKidsBeat(B, drums(B), scratchId(B), 2);
  for (let s = 0; s < 8; s++) gridB = withSquare(gridB, drums(B), 2, s, true, 2);
  gridB = withSquare(gridB, drums(B), 1, 2, false, 2);
  gridB = withSquare(gridB, drums(B), 1, 6, false, 2);
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person(A, 'Admiral Acorn', 1), person(B, 'Baron Bagel', 2)],
    beats: [scratchA, kidsA, gridB],
    settings: [{ key: 'person', value: A }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest(), hash: `#${A}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
});

const lit = () => $('#kids-beat').querySelectorAll('.kids-square').map((q, i) => (q.getAttribute('aria-pressed') === 'true' ? i : null)).filter((i) => i !== null);
const seqRows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
const answerSum = () => {
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
};
const intoKids = async () => {
  $('#kids-open').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  $('[data-kids-tab="beats"]').dispatch('click');
};
const outOfKids = async () => {
  $('#settings-open').dispatch('click');
  answerSum();
  await page.settle();
  $('#settings-dialog').close();
  assert.equal(document.body.classList.contains('kids'), false);
};

test('Kids finds its own beat where a reload leaves it (grid and tune), never the scratch', async () => {
  assert.equal(state.personId, A);
  await intoKids();
  // The starter kick and snare, and the clap on square 3 (the fourth drum's cells start at 24).
  assert.deepEqual(lit(), [0, 4, 8 + 2, 8 + 6, 24 + 3], 'the grid that was kept, not A\'s one kick');
  assert.equal(tuneRowOf(stored(A, 'beat-kidsown-'))?.tune?.length, 1, 'and its tune is in the stored record');
});

test('a Kids visit leaves the grown-up\'s scratch beat as it was, here and in storage; Kids keeps its own', async () => {
  const before = structuredClone(stored(A, 'beat-scratch-'));
  const squares = $('#kids-beat').querySelectorAll('.kids-square');
  squares[16 + 5].dispatch('click');   // the shaker's sixth square
  $('#kids-slow').dispatch('click');   // and a slower tempo
  await page.settle();
  assert.ok(sameJson(stored(A, 'beat-scratch-'), before), 'the scratch record in IndexedDB is the same bytes');
  assert.ok(sameJson(state.savedBeats.find((b) => b.id === scratchId(A)), before), 'and in memory');
  const own = stored(A, 'beat-kidsown-');
  assert.equal(own.id, kidsBeatId(A));
  assert.equal(own.bpm, 80, 'Kids\' tempo is its own');
  assert.equal(own.rows.find((r) => r.clipId === `${A}-shaker`).steps[10], true, 'the new square is kept in Kids\' record');
  assert.equal(before.bpm, 100);
  // Out again: the beat maker holds the scratch's one kick, not the kid's rows, and a pill keeps it so.
  await outOfKids();
  $('#beats-toggle').dispatch('click');
  assert.equal(document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value, 'Scratch beat');
  assert.equal(seqRows().length, 1, 'the scratch\'s one row; none of Kids\' four drums and a tune');
  seqRows()[0].querySelectorAll('.pill')[2].dispatch('click');
  await page.settle();
  const after = stored(A, 'beat-scratch-');
  assert.equal(after.rows.length, 1);
  assert.equal(after.rows[0].steps[2], true, 'a grown-up\'s pill lands in the scratch');
  assert.ok(sameJson(stored(A, 'beat-kidsown-'), own), 'and does not touch Kids\' beat');
  // Hidden: not in 🗂️ Beats.
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-open]').dispatch('click');
  assert.equal($('#lib-list').children.length, 0, 'Kids\' beat is not in 🗂️ Beats');
  $('#library').close();
  assert.ok(isHiddenBeat(own));
  $('#pads-tab').dispatch('click');
});

test('a scratch that still holds a Kids grid from before stays; Kids starts its own beat, lit', async () => {
  const scratchBefore = structuredClone(stored(B, 'beat-scratch-'));
  $('#people').querySelectorAll('[data-person]').find((p) => p.dataset.person === B).dispatch('click');
  await page.settle();
  assert.equal(state.personId, B);
  assert.equal(stored(B, 'beat-kidsown-'), undefined, 'none yet');
  await intoKids();
  assert.deepEqual(lit(), [0, 4, 8 + 2, 8 + 6], 'the first Kids beat starts lit, not as the scratch\'s every-shaker grid');
  assert.equal(stored(B, 'beat-kidsown-'), undefined, 'nothing saved just for looking');
  $('#kids-beat').querySelectorAll('.kids-square')[24 + 1].dispatch('click');
  await page.settle();
  assert.ok(sameJson(stored(B, 'beat-scratch-'), scratchBefore), 'the old grid in the scratch is not moved, changed or deleted');
  assert.equal(stored(B, 'beat-kidsown-').id, kidsBeatId(B));
  const clap = stored(B, 'beat-kidsown-').rows.find((r) => r.clipId === `${B}-clap`);
  assert.deepEqual(clap.steps.map((s, i) => (s ? i : null)).filter((i) => i !== null), [2]);
  await outOfKids();
  $('#pads-tab').dispatch('click');
});
