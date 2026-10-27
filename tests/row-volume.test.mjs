// A beat row's loudness (web/row-volume.js): the stored level and its
// cleaning, the gain every hit plays at, the round trips a beat makes
// (beat file, backup, share), then the speaker in the real app on the
// stand-in page: tap mutes, arrows step, a drag sets it with one Undo.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cleanVolume, stepLevel, speakerIcon, speakerLabel, setRowLevel, rowLevel } from '../web/row-volume.js';
import { cleanRow, cleanPattern, samePattern, planHits, hitGain, ACCENT_GAIN, beatToFile, beatFromFile } from '../web/beat.js';
import { readBackup, makeBackup } from '../web/backup.js';
import { shareBundle, shareDoc } from '../web/cloud-sync.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
import { newBeatWithRow, newBuilderBeatWithRow, keysOn, keysOff } from './new-beat.mjs';

const on = (...at) => Array.from({ length: 16 }, (_, i) => at.includes(i));

test('a stored level is 0 to 1 in hundredths; anything else plays at full', () => {
  assert.equal(cleanVolume(0.5), 0.5);
  assert.equal(cleanVolume(0.333), 0.33);
  assert.equal(cleanVolume(-2), 0);
  assert.equal(cleanVolume(7), 1);
  for (const junk of [undefined, null, '0.5', NaN, Infinity, {}, true]) assert.equal(cleanVolume(junk), 1, String(junk));
});

test('a row keeps `volume` only below full, so a beat at full stores what it did before', () => {
  assert.equal('volume' in cleanRow({ clipId: 'x' }), false);
  assert.equal('volume' in cleanRow({ clipId: 'x', volume: 1 }), false);
  assert.equal('volume' in cleanRow({ clipId: 'x', volume: 'loud' }), false);
  assert.equal(cleanRow({ clipId: 'x', volume: 0.4 }).volume, 0.4);
  assert.equal(cleanRow({ clipId: 'x', volume: -1 }).volume, 0);
  const row = cleanRow({ clipId: 'x', volume: 0.4 });
  setRowLevel(row, 1);
  assert.equal('volume' in row, false, 'turned back up to full, the field goes');
  const a = cleanPattern({ rows: [{ clipId: 'x', steps: on(0) }] });
  const b = cleanPattern({ rows: [{ clipId: 'x', steps: on(0), volume: 0.5 }] });
  assert.ok(!samePattern(a, b), 'a level change is a change to the beat');
  assert.ok(samePattern(a, cleanPattern({ rows: [{ clipId: 'x', steps: on(0), volume: 1 }] })));
});

test('a row at 50 % plays its hits at half the gain; a loud hit there is half a loud hit', () => {
  const full = cleanRow({ clipId: 'a', steps: on(0) });
  const half = cleanRow({ clipId: 'b', steps: on(0), volume: 0.5 });
  assert.equal(hitGain(full, false), 1);
  assert.equal(hitGain(full, true), ACCENT_GAIN);
  assert.equal(hitGain(half, false), 0.5);
  assert.equal(hitGain(half, true), ACCENT_GAIN / 2);
  assert.ok(hitGain(half, false) < hitGain(full, false));
});

test('a muted row and a row turned all the way down play no hits; the level comes back when it is turned up', () => {
  const p = cleanPattern({ bpm: 120, rows: [
    { clipId: 'a', steps: on(0, 8) },
    { clipId: 'b', steps: on(0, 8), volume: 0 },
    { clipId: 'c', steps: on(0, 8), muted: true, volume: 0.6 },
  ] });
  assert.deepEqual([...new Set(planHits(p, 'plain', 2).map((h) => h.row))], [0]);
  assert.equal(p.rows[2].volume, 0.6, 'muting keeps the level');
  p.rows[1].volume = 0.2;
  assert.deepEqual([...new Set(planHits(p, 'plain', 2).map((h) => h.row))], [0, 1]);
});

test('the speaker: arrows step by ten, its icon and spoken label follow the level', () => {
  assert.equal(stepLevel(0.8, 1), 0.9);
  assert.equal(stepLevel(0.73, 1), 0.8);
  assert.equal(stepLevel(0.73, -1), 0.7);
  assert.equal(stepLevel(1, 1), 1);
  assert.equal(stepLevel(0, -1), 0);
  assert.equal(stepLevel(0.7, -1), 0.6);
  assert.deepEqual([0, 0.2, 0.5, 0.8, 1].map((v) => speakerIcon(v, false)), ['🔇', '🔈', '🔉', '🔊', '🔊']);
  assert.equal(speakerIcon(1, true), '🔇');
  assert.equal(speakerLabel('Kick', 0.8, false), 'Kick loudness 80 %');
  assert.equal(speakerLabel('Kick', 0.5, true), 'Kick loudness 50 %, muted');
});

test('a beat file carries each row\'s level; a hostile level is clamped', () => {
  const beat = cleanPattern({ name: 'Mix', bpm: 100, rows: [
    { clipId: 'p-kick', steps: on(0), volume: 0.5 }, { clipId: 'p-snare', steps: on(4) }] }, 'p');
  const { file } = beatToFile(beat, ['kick', 'snare']);
  assert.equal(file.rows[0].volume, 0.5);
  assert.equal('volume' in file.rows[1], false);
  const back = beatFromFile(JSON.stringify(file), 'q', ['kick', 'snare']);
  assert.deepEqual(back.rows.map(rowLevel), [0.5, 1]);
  const hostile = beatFromFile(JSON.stringify({ ...file, rows: [{ ...file.rows[0], volume: 99 }, { ...file.rows[1], volume: -3 }] }), 'q', ['kick', 'snare']);
  assert.deepEqual(hostile.rows.map(rowLevel), [1, 0]);
});

test('a backup keeps each row\'s level, clamped', async () => {
  const state = {
    people: [{ id: 'pip', name: 'Pipsqueak', color: '#1F3FA8' }],
    clips: [],
    beats: [{ id: 'beat-v-1', personId: 'pip', name: 'Mix', bpm: 90, created: 1, saved: 2,
      rows: [{ clipId: 'pip-airhorn', steps: on(0), volume: 0.25 }, { clipId: 'pip-airhorn', steps: on(2), volume: 5 }] }],
    patterns: [{ personId: 'pip', bpm: 90, rows: [{ clipId: 'pip-airhorn', steps: on(0), volume: 0.7 }] }],
  };
  const bundled = { peopleIds: new Set(['pip']), clipIds: new Set(['pip-airhorn']), colorOk: () => true };
  const out = await readBackup(await makeBackup(state, 'dev'), bundled);
  assert.deepEqual(out.beats[0].rows.map(rowLevel), [0.25, 1]);
  assert.equal('volume' in out.beats[0].rows[1], false);
  assert.equal(out.patterns[0].rows[0].volume, 0.7);
});

test('a share code carries each row\'s level to the copy that lands', () => {
  const lists = {
    clips: [], people: [],
    beats: [{ id: 'beat-1', personId: 'p-a', name: 'Mix', bpm: 100, bars: 1, swing: 0,
      rows: [{ clipId: 'p-a-kick', steps: on(0), volume: 0.3 }, { clipId: 'p-a-snare', steps: on(4) }] }],
  };
  const made = shareBundle('beat', 'beat-1', lists, 'p-a', ['kick', 'snare']);
  assert.equal(made.bundle.beats[0].rows[0].volume, 0.3);
  let n = 0;
  const { doc } = shareDoc(made.bundle, 'p-c', ['kick', 'snare'], (k) => `${k}-new-${++n}`, { kind: 'beat', title: 'Mix' });
  assert.deepEqual(doc.beats[0].rows.map(rowLevel), [0.3, 1]);
});

// ── The speaker in the real app ──

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  $('#beats-toggle').dispatch('click');
  await page.settle();
  if (!$('#seq-rows').querySelector('.seq-row')) {
    newBeatWithRow(page);
    await page.settle();
  }
});

const row = () => $('#seq-rows').children.find((c) => c.classList.contains('seq-row'));
const speaker = () => row().querySelector('[data-speaker]');
const pop = () => document.querySelector('.vol-pop');

test('a row\'s speaker: a tap mutes and unmutes and keeps the level; ↑ ↓ step it by ten, with one Undo for the run', () => {
  assert.ok(speaker(), 'each row has a speaker');
  assert.match(speaker().getAttribute('aria-label'), / loudness 100 %$/);
  speaker().dispatch('click');
  assert.equal(speaker().getAttribute('aria-pressed'), 'true');
  assert.equal(speaker().textContent, '🔇');
  assert.ok(row().classList.contains('muted'));
  speaker().dispatch('click');
  assert.equal(speaker().getAttribute('aria-pressed'), 'false');
  assert.equal(speaker().textContent, '🔊');

  speaker().dispatch('keydown', { key: 'ArrowDown' });
  speaker().dispatch('keydown', { key: 'ArrowDown' });
  speaker().dispatch('keydown', { key: 'ArrowLeft' });
  assert.match(speaker().getAttribute('aria-label'), / loudness 70 %$/);
  assert.equal(row().style.props['--vol'], '0.7', 'its pills draw fainter');
  assert.equal(hasUndo(), true);
  assert.match($('#banner-text').textContent, /loudness 70 %\.$/);
  $('#banner-action').dispatch('click');
  assert.match(speaker().getAttribute('aria-label'), / loudness 100 %$/, 'one Undo for the whole run');
});

test('holding or dragging a speaker opens its slider; a drag sets the level, is not a tap, and is one Undo', () => {
  const b = speaker();
  b.dispatch('pointerdown', { clientX: 100, clientY: 100, button: 0 });
  page.winEvent('pointermove', { clientX: 60, clientY: 100 });   // left: quieter
  page.winEvent('pointermove', { clientX: 20, clientY: 100 });
  assert.equal(pop()?.hidden, false, 'the popover shows');
  page.winEvent('pointerup', {});
  b.dispatch('click');   // the click that ends a drag
  assert.equal(speaker().getAttribute('aria-pressed'), 'false', 'a drag never mutes');
  assert.match(speaker().getAttribute('aria-label'), / loudness 50 %$/);
  assert.equal(pop().querySelector('.vol-slider').value, '50');
  // The popover's own slider sets it too.
  const slider = pop().querySelector('.vol-slider');
  slider.value = '30';
  slider.dispatch('input');
  slider.dispatch('change');
  assert.match(speaker().getAttribute('aria-label'), / loudness 30 %$/);
  // A tap elsewhere closes it.
  page.docEvent('pointerdown', { target: document.body });
  assert.equal(pop().hidden, true);
  $('#banner-action').dispatch('click');
  assert.match(speaker().getAttribute('aria-label'), / loudness 100 %$/);
});

test('turning a muted row\'s level unmutes it', () => {
  speaker().dispatch('click');
  assert.equal(speaker().getAttribute('aria-pressed'), 'true');
  speaker().dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(speaker().getAttribute('aria-pressed'), 'false');
  assert.match(speaker().getAttribute('aria-label'), / loudness 90 %$/);
  $('#banner-action').dispatch('click');
  assert.equal(speaker().getAttribute('aria-pressed'), 'true', 'Undo puts the mute back too');
  speaker().dispatch('click');
});

test('the keys view\'s grid (Beats with ⌨️ Keys): each row has a speaker; a tap mutes, arrows turn it down, and the done bar\'s Undo puts it back', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  const line = () => $('#dj-grid').children[0];
  const sp = () => line().querySelector('[data-speaker]');
  assert.ok(sp(), 'a speaker at the row\'s end');
  sp().dispatch('click');
  assert.equal(sp().getAttribute('aria-pressed'), 'true');
  assert.equal(line().style.props['--vol'], '0', 'muted: its pills draw faintest');
  sp().dispatch('click');
  sp().dispatch('keydown', { key: 'ArrowDown' });
  sp().dispatch('keydown', { key: 'ArrowDown' });
  assert.match(sp().getAttribute('aria-label'), / loudness 80 %$/);
  assert.equal(line().style.props['--vol'], '0.8');
  assert.match($('#banner-text').textContent, /loudness 80 %\.$/);
  $('#banner-action').dispatch('click');
  assert.match(sp().getAttribute('aria-label'), / loudness 100 %$/, 'one Undo for the run');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});
