// 💃 Grooves on both beat bars, and with ⌨️ Keys on (Ben, 2026-10-12; ADR
// 0020): a groove loads into the scratch beat and opens stopped, and ▶ Play
// loops it behind you while you play the keys; ● Record adds your hits on
// top, in the scratch, and the beat that was open stays in 🗂️ My beats. ↩️ My
// beat undoes the load. The dialog groups the grooves by style, and each has
// a ▶ that plays a short sample. Sound and layout need a browser
// (`just look keys-on`, `just look builder-groove`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff, newBuilderBeatWithRow } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const wait = () => new Promise((r) => setTimeout(r, 60));
const bars = () => document.querySelectorAll('.beat-bar');
const beatsBar = () => bars()[0];
const djBar = () => $('#dj-beatbar');
const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';
const names = () => state.savedBeats.filter((b) => b.personId === state.personId && !b.id.startsWith('beat-scratch-')).map((b) => b.name);
const scratch = () => state.savedBeats.find((b) => b.personId === state.personId && b.id.startsWith('beat-scratch-'));
const groupHead = (id) => $('#groove-list').querySelector(`[data-groove-group="${id}"]`);

test('💃 Grooves sits in the beat bar on both screens, emoji only, named for screen readers', () => {
  const beats = beatsBar().querySelector('[data-beat-grooves]');
  assert.equal(beats, $('#seq-grooves'), 'Beats\' keeps its id, in the beat bar now');
  assert.ok(djBar().querySelector('[data-beat-grooves]'), 'and DJ\'s beat bar has one');
  for (const b of [beats, djBar().querySelector('[data-beat-grooves]')]) {
    assert.equal(b.textContent, '💃', 'the word comes from data-word on wider screens');
    assert.equal(b.dataset.word, 'Grooves');
    assert.match(b.getAttribute('aria-label'), /^Grooves/);
  }
  assert.equal($('.seq-foot').querySelector('#seq-grooves'), null, 'not under the rows any more');
});

// Ben, 2026-10-12: "grooves should have a dancer instead of a die".
test('Grooves is a dancer, not a die: both buttons, the dialog title and the empty-beat hint', () => {
  for (const b of document.querySelectorAll('[data-beat-grooves]')) assert.equal(b.textContent, '💃');
  assert.equal($('#grooves-title').textContent, '💃 Grooves');
  assert.match($('#seq-no-rows').textContent, /💃\sGrooves/);
  assert.doesNotMatch($('#seq-no-rows').textContent, /🎲/);
});

test('the dialog lists the grooves by style, each group folding open and shut', () => {
  $('#beats-tab')?.dispatch('click');
  $('#seq-grooves').dispatch('click');
  assert.equal($('#grooves').open, true);
  const heads = $('#groove-list').querySelectorAll('[data-groove-group]');
  assert.deepEqual(heads.map((h) => h.querySelector('.emoji-all-name').textContent),
    ['💃 Dance', '🎤 Hip hop', '🎸 Rock, pop & country', '🙌 Soul & gospel', '🌴 Latin & Caribbean', '🌍 Drums of the world', '🎷 Swing & odd times']);
  assert.ok(heads.every((h) => h.getAttribute('aria-expanded') === 'false'), 'a short menu of styles at first');
  const latin = groupHead('latin');
  const list = $('#groove-list').querySelector(`#${latin.getAttribute('aria-controls')}`);
  assert.equal(list.hidden, true);
  assert.ok(list.querySelector('[data-groove="bossa"]'), 'Bossa nova is Latin');
  latin.dispatch('click');
  assert.equal(latin.getAttribute('aria-expanded'), 'true');
  assert.equal(list.hidden, false);
  // Under each name, where it comes from; the sounds, bars and tempo only with Advanced (Ben, 2026-10-17).
  assert.match(list.querySelector('[data-groove="bossa"] .groove-about').textContent, /^Gentle music from Rio de Janeiro/);
  assert.equal(list.querySelector('[data-groove="bossa"] .groove-parts'), null);
  latin.dispatch('click');
  assert.equal(list.hidden, true, 'and shut again');
  $('#grooves').close();
});

test('with Advanced on, a groove\'s card also names its sounds, bars and tempo', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('advancedBeats', true);
  try {
    $('#seq-grooves').dispatch('click');
    const card = $('#groove-list').querySelector('[data-groove="bossa"]');
    assert.match(card.querySelector('.groove-parts').textContent, /\+ bass \+ chords · 2 bars · 70 BPM$/);
    assert.match(card.querySelector('.groove-about').textContent, /^Gentle music/, 'and keeps its line');
    $('#grooves').close();
  } finally {
    await setSetting('advancedBeats', false);
  }
});

test('each groove card names who plays it beyond the drums, a chip per instrument in its family\'s color (ADR 0030)', async () => {
  const { FAMILIES } = await import('../web/instruments.js');
  $('#seq-grooves').dispatch('click');
  const chips = (id) => $('#groove-list').querySelector(`[data-groove="${id}"]`).querySelectorAll('.groove-player');
  const soca = chips('soca');
  assert.deepEqual(soca.map((c) => c.dataset.inst), ['steel', 'synth']);
  assert.equal(soca[0].textContent, '🛢️ Steel drum');
  assert.equal(soca[0].dataset.family, 'mallets');
  assert.equal(soca[0].style.props['--fam'], FAMILIES.find((f) => f.id === 'mallets').color);
  assert.ok(chips('gospel').some((c) => c.dataset.inst === 'organ'), 'Gospel: the organ');
  assert.ok(chips('chiptune').some((c) => c.dataset.inst === 'chip'), 'Chiptune: the chip');
  assert.equal($('#groove-list').querySelector('[data-groove="halftime"] .groove-who'), null, 'drums alone: no chips');
  $('#grooves').close();
});

test('with ⌨️ Keys on, a groove loads into the scratch, stopped, copying nothing; ▶ Play plays it behind you; ↩️ My beat brings back the beat that was open', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a beat of the kid's own, in 🗂️ My beats
  const mine = djBar().querySelector('[data-beat-name]').value;
  const saved = names();
  djBar().querySelector('[data-beat-grooves]').dispatch('click');
  assert.equal($('#groove-how').hidden, true, 'nothing to choose with the keys');
  assert.match($('#groove-hint').textContent, /behind you/);
  $('#groove-list').querySelector('[data-groove="house"]').dispatch('click');
  await page.settle();
  assert.equal($('#grooves').open, false);
  assert.equal(playing(), false, 'it opens stopped');
  assert.equal(djBar().querySelector('[data-beat-name]').value, 'House (scratch)');
  assert.equal(djBar().querySelector('[data-beat-keep]').hidden, false);
  assert.equal($('#dj-trying').hidden, false);
  assert.match($('#dj-trying-text').textContent, /“House”: ▶ Play to hear it behind you/);
  assert.equal($('#dj-play').hidden, false);
  $('#dj-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true, '▶ Play plays it');
  assert.equal($('#dj-play').textContent, '■ Stop');
  assert.match($('#dj-trying-text').textContent, /“House” is playing/);
  assert.deepEqual(names(), saved, 'nothing new in 🗂️ My beats');
  // Playing a key while jamming adds no row to the groove.
  const rows = scratch().rows.length;
  page.key('a', { code: 'KeyA' });
  assert.equal(scratch().rows.length, rows, 'no row for the key');
  $('#dj-play').dispatch('click');
  assert.equal(playing(), false, '■ Stop stops it');
  assert.equal($('#dj-play').textContent, '▶ Play');
  assert.equal(djBar().querySelector('[data-beat-name]').value, 'House (scratch)', 'and it stays on screen, stopped');
  assert.equal($('#dj-trying').hidden, false);
  $('#dj-trying-stop').dispatch('click');
  assert.equal($('#dj-trying').hidden, true);
  assert.equal(djBar().querySelector('[data-beat-name]').value, mine, '↩️ My beat: the beat that was open is back');
  assert.deepEqual(names(), saved);
  assert.equal(scratch(), undefined, 'and the scratch as it was: never saved');
});

test('with ⌨️ Keys on, ▶ Play plays the open beat round and round, recording nothing; ● Record waits', async () => {
  const before = JSON.stringify(state.savedBeats);
  assert.equal($('#dj-play').hidden, false, 'a beat is open: ▶ Play shows');
  $('#dj-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true);
  assert.equal($('#dj-play').getAttribute('aria-pressed'), 'true');
  assert.equal($('#dj-record').textContent, '● Record', 'not recording');
  $('#dj-play').dispatch('click');
  assert.equal(playing(), false);
  assert.equal(JSON.stringify(state.savedBeats), before, 'nothing changed');
});

test('each groove in the chooser has ▶: a short sample, without opening it; ■ or closing ends it', async () => {
  const { SAMPLE_SECONDS, sampleSeconds } = await import('../web/sequencer.js');
  assert.equal(SAMPLE_SECONDS, 4);
  assert.equal(sampleSeconds(2), 2, 'a short groove: one pass');
  assert.equal(sampleSeconds(9.6), 4, 'a long one: cut at 4 s');
  const name = djBar().querySelector('[data-beat-name]').value;
  djBar().querySelector('[data-beat-grooves]').dispatch('click');
  const hear = (id) => $('#groove-list').querySelector(`[data-hear="${id}"]`);
  assert.equal(hear('house').textContent, '▶');
  assert.match(hear('house').getAttribute('aria-label'), /^Hear a bit of House/);
  assert.notEqual(hear('house').closest('[data-groove]'), hear('house'), 'beside the card, not inside it');
  hear('house').dispatch('click');
  await page.settle();
  assert.equal(hear('house').textContent, '■');
  assert.equal(hear('house').getAttribute('aria-pressed'), 'true');
  assert.equal($('#grooves').open, true, 'the dialog stays open');
  assert.equal(djBar().querySelector('[data-beat-name]').value, name, 'nothing opened');
  assert.equal(playing(), false, 'the beat player is not used for it');
  hear('four').dispatch('click');
  await page.settle();
  assert.equal(hear('house').textContent, '▶', 'another ▶ takes over');
  assert.equal(hear('four').textContent, '■');
  hear('four').dispatch('click');
  assert.equal(hear('four').textContent, '▶', '■ stops it');
  hear('four').dispatch('click');
  await page.settle();
  $('#grooves').close();
  djBar().querySelector('[data-beat-grooves]').dispatch('click');
  assert.equal(hear('four').textContent, '▶', 'closing the dialog ended it');
  $('#grooves').close();
});

test('● Record onto a groove adds your hits to the scratch; Stop stops it; Undo takes them out; 💾 Keep names it after the groove', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const mine = djBar().querySelector('[data-beat-name]').value;
  ctx.currentTime = 5000;
  djBar().querySelector('[data-beat-grooves]').dispatch('click');
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  await page.settle();
  $('#dj-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true);
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal($('#dj-record').textContent, '■ Stop');
  assert.equal($('#dj-trying').hidden, true, 'Record\'s own Stop ends it now');
  // Into the next bar of the groove (120 BPM: a pill is 0.125 s).
  ctx.currentTime = 5000.05 + 16 * 0.125 + 2 * 0.125;
  await wait();
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  assert.equal(playing(), false, 'stopping the recording stops the groove');
  assert.equal(djBar().querySelector('[data-beat-name]').value, 'Four on the floor (scratch)');
  assert.ok(!names().some((n) => /Four on the floor/.test(n)), 'no copy in 🗂️ My beats');
  assert.ok(names().includes(mine), 'the beat that was open stays in 🗂️ My beats');
  const hitsOf = (b) => b.rows.reduce((n, r) => n + r.steps.filter(Boolean).length, 0);
  assert.equal(hitsOf(scratch()), 4 + 2 + 4 + 1, 'the groove\'s hits, and the one played on top');
  assert.match($('#banner-text').textContent, /^Added 1 note to your scratch beat/);
  $('#banner-action').dispatch('click');
  assert.equal(hitsOf(scratch()), 4 + 2 + 4, 'Undo takes the note out');
  // 💾 Keep: a beat of its own, named after the groove; the scratch empties.
  djBar().querySelector('[data-beat-keep]').dispatch('click');
  const kept = djBar().querySelector('[data-beat-name]').value;
  assert.ok(names().includes(kept), 'in 🗂️ My beats');
  assert.equal(kept, 'Four on the floor', 'too long for a fun name too: the groove\'s own (names.js keptName)');
  assert.equal(scratch(), undefined);
  ctx.currentTime = 0;
});
