// Pattern chips (Ben, 2026-10-12, after a music studio's pattern picker): under
// the beat bar, ⌨️ Keys off and on, 8 numbered spots: beats pinned with 📌 in
// 🗂️ My beats first, then the last used, oldest made first, in an order a tap
// never changes (the order itself: beat-pins.test.mjs). The open one is
// pressed. A tap opens that beat;
// while the beat plays, the switch waits for the next bar line and the beat
// keeps playing. Each screen keeps its own open beat (ADR 0008). Sound itself
// needs a browser: here the audio clock is moved by hand.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOn, keysOff } from './new-beat.mjs';
import { state } from '../web/state.js';

let page;
let $;
let ctx;
const wait = () => new Promise((r) => setTimeout(r, 60));

before(async () => {
  console.error = () => {};
  // Saves in one test run land in the same millisecond; "most recent" needs them apart.
  const real = Date.now;
  let n = 0;
  Date.now = () => real() + n++;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ctx = (await import('../web/audio.js')).audio.context();
  $('#beats-toggle').dispatch('click');
  await page.settle();
});

const lines = () => document.querySelectorAll('[data-beat-chips]');
const chips = (i = 0) => lines()[i].children;
const beatsName = () => document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value;
const djName = () => $('#dj-beatbar').querySelector('[data-beat-name]').value;
const mine = () => state.savedBeats.filter((b) => b.personId === state.personId).sort((a, b) => b.saved - a.saved);
const nameOf = (id) => state.savedBeats.find((b) => b.id === id).name;
const nameOn = (c) => c.querySelector('.chip-name').textContent;
const numOn = (c) => c.querySelector('.chip-num').textContent;
const order = (i = 0) => chips(i).map((c) => c.dataset.chip);
const lit = (i = 0) => chips(i).find((c) => c.getAttribute('aria-pressed') === 'true');

test('8 numbered chips: the last 8 beats used, oldest made first, the open one pressed; no label', () => {
  newBeatWithRow(page);
  assert.equal(lines()[0].hidden, true, 'one beat, and it is open: nothing to switch to');
  for (let i = 0; i < 9; i++) newBeatWithRow(page);
  assert.equal(lines()[0].hidden, false);
  assert.equal(chips().length, 8, 'ten beats, eight chips');
  const recent = mine().slice(0, 8).sort((a, b) => a.created - b.created).map((b) => b.id);
  assert.deepEqual(order(), recent);
  assert.deepEqual(chips().map(numOn), ['1', '2', '3', '4', '5', '6', '7', '8'], 'numbered, as a studio numbers its patterns');
  assert.equal(chips()[7].getAttribute('aria-pressed'), 'true');
  assert.equal(nameOn(chips()[7]), beatsName(), 'the newest is the open one, made last: the last spot');
  assert.match(chips()[7].getAttribute('aria-label'), /^8: .+, open now$/);
  assert.ok(chips().slice(0, 7).every((c) => c.getAttribute('aria-pressed') === 'false'));
  for (const c of chips()) assert.ok(nameOn(c).length > 0, 'each chip shows its beat\'s name');
  assert.equal(lines()[0].children.filter((c) => !c.dataset.chip).length, 0, 'no label on the line yet (Ben: wait until the UI changes land)');
});

test('a tap while stopped opens that beat at once, and no chip moves', () => {
  const before = order();
  const id = chips()[3].dataset.chip;
  chips()[3].dispatch('click');
  assert.equal(beatsName(), nameOf(id));
  assert.deepEqual(order(), before, 'opening it is using it, but it keeps its place');
  assert.equal(chips()[3].getAttribute('aria-pressed'), 'true');
});

test('📌 in 🗂️ My beats pins a beat to the first spots, in pin order; the spots left are 8 minus the pins', () => {
  const was = order();
  const oldest = mine().at(-1);   // used longest ago: no spot of its own
  assert.ok(!was.includes(oldest.id));
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const pinOf = (id) => $('#lib-list').querySelector(`[data-pin="${id}"]`);
  assert.equal(pinOf(oldest.id).textContent, '📌');
  assert.equal(pinOf(oldest.id).getAttribute('aria-pressed'), 'false');
  assert.match(pinOf(oldest.id).getAttribute('aria-label'), /^Pin .+ to the chips$/);
  const saved = oldest.saved;
  pinOf(oldest.id).dispatch('click');
  assert.equal(pinOf(oldest.id).getAttribute('aria-pressed'), 'true');
  assert.match(pinOf(oldest.id).getAttribute('aria-label'), /^Unpin /);
  assert.equal(state.savedBeats.find((b) => b.id === oldest.id).saved, saved, 'pinning is not using it');
  assert.equal(order()[0], oldest.id, 'pinned: the first spot');
  assert.equal(numOn(chips()[0]), '1');
  assert.equal(chips()[0].querySelector('.chip-pin')?.textContent, '📌', 'a pinned chip shows 📌');
  assert.equal(chips()[1].querySelector('.chip-pin'), null);
  assert.match(chips()[0].getAttribute('aria-label'), /, pinned$/);
  assert.deepEqual(order().slice(1), was.slice(1), 'seven spots left: the one used longest ago of the eight drops, the rest keep their order');
  pinOf(was[5]).dispatch('click');
  assert.deepEqual(order().slice(0, 2), [oldest.id, was[5]], 'the second pin second');
  assert.equal(chips().length, 8);
  // Unpinning gives its spot back to the beats used most recently.
  pinOf(was[5]).dispatch('click');
  assert.deepEqual(order().slice(0, 1), [oldest.id]);
  assert.ok(order().includes(was[5]));
  $('#library').close();
});

test('a pinned beat stays pinned as it changes; ⧉ a copy of it is not pinned', () => {
  const pinned = order()[0];
  chips()[0].dispatch('click');   // open it
  $('#seq-rows').querySelectorAll('.pill')[2].dispatch('click');   // change it: it saves
  assert.ok(state.savedBeats.find((b) => b.id === pinned).pinned > 0, 'still pinned after a save');
  assert.equal(order()[0], pinned);
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const count = state.savedBeats.length;
  $('#lib-list').querySelector(`[data-dup="${pinned}"]`).dispatch('click');
  assert.equal(state.savedBeats.length, count + 1);
  const copy = state.savedBeats.at(-1);
  assert.ok(!('pinned' in copy), 'the copy is a new beat, unpinned');
  $('#lib-list').querySelector(`[data-pin="${pinned}"]`).dispatch('click');   // unpin, for the tests after
  $('#library').close();
});

test('at most 8 pins: a ninth says to unpin one first', () => {
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const ids = mine().map((b) => b.id);
  for (const id of ids.slice(0, 8)) $('#lib-list').querySelector(`[data-pin="${id}"]`).dispatch('click');
  assert.deepEqual(order(), ids.slice(0, 8), 'eight pins fill every spot, in pin order');
  $('#lib-list').querySelector(`[data-pin="${ids[8]}"]`).dispatch('click');
  assert.equal(state.savedBeats.find((b) => b.id === ids[8]).pinned, undefined);
  assert.match($('#lib-note').textContent, /8 beats are pinned already: unpin one first/);
  for (const id of ids.slice(0, 8)) $('#lib-list').querySelector(`[data-pin="${id}"]`).dispatch('click');
  assert.equal(state.savedBeats.filter((b) => b.pinned).length, 0);
  $('#library').close();
});

test('while playing, a chip waits for the next bar line, then its beat takes over and keeps playing', async () => {
  const { getLog } = await import('../web/log.js');
  const was = beatsName();
  ctx.currentTime = 100;
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true');
  // 1 bar of 4/4 at 100 BPM is 2.4 s; the beat started at 100.05.
  ctx.currentTime = 100.6;
  await wait();
  const id = chips()[2].dataset.chip;
  chips()[2].dispatch('click');
  const chip = () => chips().find((c) => c.dataset.chip === id);
  assert.equal(beatsName(), was, 'not yet: the bar plays to its end');
  assert.ok(chip().classList.contains('queued'));
  assert.match(nameOn(chip()), /^⏳ /);
  assert.match(chip().getAttribute('aria-label'), /starts at the next bar$/);
  ctx.currentTime = 102.3;   // the bar line (102.45) is just past the look-ahead
  await wait();
  assert.equal(beatsName(), was, 'still the old beat before the bar line');
  ctx.currentTime = 102.36;  // the look-ahead reaches the bar line
  await wait();
  assert.equal(beatsName(), nameOf(id), 'the new beat takes over at the bar line');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'it never stopped');
  assert.equal(chip().getAttribute('aria-pressed'), 'true');
  assert.ok(!chip().classList.contains('queued'));
  const sw = getLog().filter((e) => e.kind === 'beat' && e.data.action === 'switch').at(-1)?.data;
  assert.equal(sw?.after, 1, 'after one bar of the old beat');
});

test('■ Stop takes back a chip still waiting, and tapping the open chip does too', async () => {
  const was = beatsName();
  ctx.currentTime = 103;
  await wait();
  chips()[4].dispatch('click');
  assert.ok(chips()[4].classList.contains('queued'));
  lit().dispatch('click');   // the open beat's own chip
  assert.ok(chips().every((c) => !c.classList.contains('queued')), 'the open chip takes it back');
  chips()[4].dispatch('click');
  $('#seq-play').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false');
  assert.ok(chips().every((c) => !c.classList.contains('queued')));
  ctx.currentTime = 110;
  await wait();
  assert.equal(beatsName(), was, 'nothing switched after stopping');
});

// The ⏲️ click ticks every beat on the same clock as the pills: nothing of
// the old beat booked past the bar line shows as a doubled tick there, and
// a gap would show as a missing one.
test('across a switch the beat keeps time: every tick 0.6 s after the last, none doubled at the bar line', async () => {
  const ticks = [];
  const make = ctx.createOscillator;
  ctx.createOscillator = () => ({ ...make.call(ctx), start: (at) => ticks.push(at) });
  if ($('#seq-click').getAttribute('aria-pressed') !== 'true') $('#seq-click').dispatch('click');
  const was = beatsName();
  ctx.currentTime = 300;
  $('#seq-play').dispatch('click');
  await page.settle();
  const t0 = 300.05;
  for (let t = 300; t < 306; t += 0.05) {
    ctx.currentTime = t;
    await new Promise((r) => setTimeout(r, 30));
    if (Math.abs(t - 300.6) < 0.01) chips()[3].dispatch('click');   // in bar 1: switch at 302.45
  }
  assert.notEqual(beatsName(), was, 'it switched');
  $('#seq-play').dispatch('click');
  $('#seq-click').dispatch('click');
  ctx.createOscillator = make;
  const times = ticks.filter((at) => at >= t0 - 1e-6).sort((a, b) => a - b);
  assert.ok(times.length >= 9, `ticks heard: ${times.length}`);
  times.forEach((at, i) => assert.ok(Math.abs(at - (t0 + i * 0.6)) < 1e-6, `tick ${i} at ${at}`));
});

// ADR 0017: one open beat. A chip with ⌨️ Keys on opens it for Beats too.
test('one open beat: a chip with ⌨️ Keys on opens that beat with Keys off too', async () => {
  const onBeats = beatsName();
  keysOn(page);
  assert.equal(lines()[1].hidden, false, 'the keys view has the chips too');
  assert.equal(nameOn(lit(1)), onBeats, 'the open beat is lit there too');
  assert.deepEqual(order(1), order(0), 'the same chips in the same order');
  const other = chips(1).find((c) => nameOn(c) !== onBeats);
  other.dispatch('click');
  assert.equal(djName(), nameOn(other));
  assert.equal(lit(1).dataset.chip, other.dataset.chip);
  keysOff(page);
  await page.settle();
  assert.equal(beatsName(), nameOn(other), 'the same beat with Keys off');
  assert.equal(nameOn(lit()), nameOn(other));
});

test('the chips wait while ⌨️ Keys records into the beat', async () => {
  keysOn(page);
  ctx.currentTime = 200;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.ok(chips(1).length > 1);
  assert.ok(chips(1).every((c) => c.disabled), 'locked while recording');
  $('#dj-record').dispatch('click');
  assert.ok(chips(1).every((c) => !c.disabled), 'back after ■ Stop');
  $('#dj-done-close')?.dispatch('click');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});
