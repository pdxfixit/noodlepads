// Tempo marks on 🎼 Song's screen (ADR 0031; Ben, 2026-10-18): a BPM chip
// above each mark's bar in the ruler, for everyone. With Advanced, the deck's
// tempo opens 🎼 Tempo: the tempo from bar 1, each mark, and ＋ Tempo change;
// a chip opens its mark to change or remove (asks first, then ↩️ Undo).
// Without Advanced the chips only say. The timing is tests/tempo-marks.test.mjs;
// layout needs a browser (`just look song-tempos`, `tempo-sheet`, `tempo-mark`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { hasUndo } from './banner.mjs';
import { dropBeat, allBlocks } from './song-ui.mjs';
import { state } from '../web/state.js';

let page;
let $;
let setSetting;
let firstTempo;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ setSetting } = await import('../web/settings.js'));
});

const tap = (selector) => $(selector).dispatch('click');
const songNow = () => state.songbook.find((s) => s.personId === state.personId && s.id === state.songs.get(state.personId)?.id)
  ?? state.songbook.find((s) => s.personId === state.personId && s.id.startsWith('song-scratch-'));
const chips = () => $('#song-lanes').querySelectorAll('.tempo-chip');
const chipAt = (bar) => chips().find((c) => c.dataset.tempoBar === String(bar));
const sheetOpen = () => $('#tempo-sheet').open;
const editing = () => !$('#tempo-edit-view').hidden;
async function advanced(on) {
  setSetting('advancedBeats', on);
  await page.settle();
}
function setMark(bar, bpm) {
  $('#tempo-bar').value = String(bar);
  $('#tempo-bpm').value = String(bpm);
  tap('#tempo-done');
}

test('a song with no marks: no chip row; Regular types the tempo; Advanced taps it to open 🎼 Tempo', async () => {
  tap('#beats-toggle');
  newBeatWithRow(page);
  $('#seq-rows').querySelectorAll('.pill')[0].dispatch('click');
  tap('#song-tab');
  dropBeat($);
  dropBeat($);
  assert.equal(allBlocks($).length, 2);
  assert.equal($('#song-lanes').querySelector('.song-marks'), null, 'no row of chips without marks');
  assert.equal($('#song-tempo-field').hidden, false);
  assert.equal($('#song-tempo-open').hidden, true, 'Regular: the tempo is typed, as before');
  await advanced(true);
  assert.equal($('#song-tempo-field').hidden, true);
  assert.equal($('#song-tempo-open').hidden, false);
  assert.equal($('#song-tempo-open').querySelector('.tempo-open-bpm').textContent, `${songNow().tempo} BPM`);
  tap('#song-tempo-open');
  assert.equal(sheetOpen(), true);
  assert.equal(editing(), false, 'the list first');
  assert.equal($('#tempo-base').value, String(songNow().tempo));
  assert.equal($('#tempo-marks').hidden, true, 'no marks listed yet');
  // The tempo from bar 1, typed in the sheet: one ↩️ Undo step.
  firstTempo = songNow().tempo;
  assert.notEqual(firstTempo, 120);
  $('#tempo-base').value = '120';
  $('#tempo-base').dispatch('change');
  assert.equal(songNow().tempo, 120);
  assert.equal($('#song-tempo-open').querySelector('.tempo-open-bpm').textContent, '120 BPM');
});

test('＋ Tempo change: a bar and a BPM; a chip shows above its bar; ↩️ Undo takes it back', async () => {
  assert.equal(sheetOpen(), true);
  tap('#tempo-add');
  assert.equal(editing(), true);
  assert.equal($('#tempo-title').textContent, '＋ Tempo change');
  assert.equal($('#tempo-remove').hidden, true, 'nothing to remove yet');
  assert.equal($('#tempo-bar').value, '5', 'four bars in, to start');
  assert.equal($('#tempo-bpm').value, '120', 'the tempo playing there');
  // Bar 1 is the song's own tempo: refused, with a line saying why.
  setMark(1, 140);
  assert.match($('#tempo-hint').textContent, /^Pick a bar from 2 to 128/);
  assert.equal(songNow().tempos, undefined);
  setMark(2, 400);
  assert.match($('#tempo-hint').textContent, /^Pick a tempo from 60 to 180/);
  setMark(2, 140);
  assert.equal(editing(), false, 'back to the list');
  assert.deepEqual(songNow().tempos, [{ bar: 2, bpm: 140 }], 'saved as it changes');
  assert.deepEqual($('#tempo-marks').children.map((li) => li.querySelector('.tempo-mark-bpm').textContent), ['140 BPM']);
  assert.equal(chips().length, 1);
  assert.equal(chipAt(2).tagName, 'BUTTON');
  assert.equal(chipAt(2).querySelector('.tempo-chip-bpm').textContent, '140');
  assert.equal(chipAt(2).style.props['--at'], '1', 'above bar 2');
  assert.ok($('#song-lanes').classList.contains('has-marks'));
  assert.equal($('#song-tempo-open').querySelector('.tempo-open-marks').textContent, ' · 1 change');
  $('#tempo-sheet').close();
  tap('#song-step-undo');
  assert.equal(songNow().tempos, undefined, 'Undo takes the mark back; no marks is no field');
  assert.equal(chips().length, 0);
  tap('#song-step-undo');
  assert.equal(songNow().tempo, firstTempo, 'and the tempo typed before it');
});

test('a chip opens its mark: change it, or remove it (asks first) with ↩️ Undo', async () => {
  tap('#song-tempo-open');
  tap('#tempo-add');
  setMark(3, 90);
  tap('#tempo-add');
  setMark(9, 150);
  $('#tempo-sheet').close();
  assert.deepEqual(chips().map((c) => c.dataset.tempoBar), ['3', '9']);
  chipAt(3).dispatch('click');
  assert.equal(sheetOpen(), true);
  assert.equal(editing(), true, 'straight to the mark');
  assert.equal($('#tempo-title').textContent, 'Tempo change at bar 3');
  assert.equal($('#tempo-bpm').value, '90');
  assert.equal($('#tempo-done').textContent, '✓ Done');
  setMark(4, 100);
  assert.equal(sheetOpen(), false, 'from a chip, Done closes the sheet');
  assert.deepEqual(songNow().tempos, [{ bar: 4, bpm: 100 }, { bar: 9, bpm: 150 }], 'moved to bar 4');
  chipAt(9).dispatch('click');
  tap('#tempo-remove');
  assert.equal($('#tempo-remove').textContent, 'Remove?', 'the first tap asks');
  assert.ok($('#tempo-remove').classList.contains('armed'));
  assert.equal(songNow().tempos.length, 2);
  tap('#tempo-remove');
  assert.deepEqual(songNow().tempos, [{ bar: 4, bpm: 100 }]);
  assert.equal(sheetOpen(), false);
  assert.equal(hasUndo(), true, 'the banner offers ↩️ Undo');
  assert.match($('#banner-text').textContent, /bar 9/);
  tap('#banner-action');
  assert.deepEqual(songNow().tempos, [{ bar: 4, bpm: 100 }, { bar: 9, bpm: 150 }], 'back again');
  assert.equal(chips().length, 2);
});

test('▶ Play song plays with marks, from bar 1 or a bar tapped in the ruler', async () => {
  tap('#song-play');
  await page.settle();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true');
  tap('#song-play');
  $('#song-lanes').querySelector('[data-start-bar="1"]').dispatch('click');
  tap('#song-play');
  await page.settle();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true');
  tap('#song-play');
  $('#song-lanes').querySelector('[data-start-bar="0"]').dispatch('click');
});

test('without Advanced the chips only say; the sheet stays shut', async () => {
  await advanced(false);
  assert.equal(chips().length, 2, 'everyone sees the marks');
  assert.equal(chipAt(4).tagName, 'SPAN', 'not a control');
  assert.equal(chipAt(4).getAttribute('aria-label'), 'From bar 4: 100 BPM');
  chipAt(4).dispatch('click');
  assert.equal(sheetOpen(), false);
  assert.equal($('#song-tempo-field').hidden, false);
  assert.equal($('#song-tempo-open').hidden, true);
  // Advanced off while the sheet is open shuts it.
  await advanced(true);
  tap('#song-tempo-open');
  assert.equal(sheetOpen(), true);
  await advanced(false);
  assert.equal(sheetOpen(), false);
  $('#pads-tab').dispatch('click');
});
