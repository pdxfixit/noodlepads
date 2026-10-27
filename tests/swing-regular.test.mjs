// Swing at Regular (Ben, 2026-10-26): a beat saved with swing, before this or
// at Advanced, plays swung for a Regular person too. The real app, reached
// through its test hook (app.js noodleTestSeq); sound is not needed, only the
// plan of hits a song or a share preview books.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let seq;
let state;
let getSetting;

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s) => { seq = s; };
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ getSetting } = await import('../web/settings.js'));
  await page.settle();
});

test('an old beat saved with Shuffle plays swung at Regular, on its eighths and its sixteenths', () => {
  assert.equal(getSetting('advancedBeats'), false, 'Regular');
  const clip = state.manifest.people.find((p) => p.id === state.personId).clips[0].id;
  const steps = (...on) => Array.from({ length: 16 }, (_, i) => on.includes(i));
  const plan = (swing, ...on) => seq.beatPlan({ id: 'beat-old', personId: state.personId, name: 'Old', bpm: 120, bars: 1, swing, rows: [{ clipId: clip, steps: steps(...on) }] });
  const times = (p) => p.hits.map((h) => +h.time.toFixed(4));
  assert.equal(plan(50, 0).pattern.swing, 50, 'the stored value loads');
  assert.deepEqual(times(plan(50, 0, 2, 4, 6)).slice(0, 4), [0, 0.375, 0.5, 0.875], 'eighths: the "and" is half an eighth late');
  assert.deepEqual(times(plan(50, 0, 1, 2, 3)).slice(0, 4), [0, 0.1875, 0.375, 0.4375], 'sixteenths bounce too');
  assert.deepEqual(times(plan(0, 0, 2, 4, 6)).slice(0, 4), [0, 0.25, 0.5, 0.75], 'straight stays straight');
});

test('on a phone the bars and swing share one row as pickers: each has a select twin that presses its key', async () => {
  const { document } = globalThis;
  const pick = (id) => document.querySelector(`#${id} .seq-pick`);
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');   // nothing is open until 🆕 New
  await page.settle();
  assert.deepEqual(pick('seq-bars').querySelectorAll('option').map((o) => o.textContent), ['1 bar', '2 bars', '4 bars']);
  assert.deepEqual(pick('seq-swing').querySelectorAll('option').map((o) => o.textContent), ['Straight', 'Swing', 'Shuffle']);
  const swing = pick('seq-swing');
  swing.value = '33';
  swing.dispatch('change');
  assert.equal(document.querySelector('#seq-swing [data-swing="33"]').getAttribute('aria-pressed'), 'true', 'the picker presses the key');
  const bars = pick('seq-bars');
  bars.value = '2';
  bars.dispatch('change');
  assert.equal(document.querySelector('#seq-bars [data-bars="2"]').getAttribute('aria-pressed'), 'true');
  document.querySelector('#seq-swing [data-swing="0"]').dispatch('click');
  document.querySelector('#seq-bars [data-bars="1"]').dispatch('click');
});
