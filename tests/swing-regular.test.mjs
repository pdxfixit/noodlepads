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

// Bars and Feel are in the 🎛️ panel (docs/design/beat-menu.md), ⌨️ Keys off and on, and both
// change the one open beat.
test('Feel and Bars in the 🎛️ panel press their key, at Regular, with Keys off and on', async () => {
  const { document } = globalThis;
  const { keysOn, keysOff } = await import('./new-beat.mjs');
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');   // nothing is open until 🆕 New
  await page.settle();
  assert.equal(getSetting('advancedBeats'), false, 'Regular: Feel is there, the time signature is not');
  assert.ok(document.querySelector('#seq-menu').contains(document.querySelector('#seq-swing')), 'Feel is in the panel');
  assert.equal(document.querySelector('#seq-sigs').hidden, true);
  document.querySelector('#seq-swing [data-swing="33"]').dispatch('click');
  assert.equal(document.querySelector('#seq-swing [data-swing="33"]').getAttribute('aria-pressed'), 'true');
  assert.equal(seq.swing(), 33, 'the beat\'s own field');
  document.querySelector('#seq-bars [data-bars="2"]').dispatch('click');
  assert.equal(document.querySelector('#seq-bars [data-bars="2"]').getAttribute('aria-pressed'), 'true');
  // ⌨️ Keys on: the same beat, with Feel on its own panel too (it had none before).
  keysOn(page);
  assert.ok(document.querySelector('#dj-setup').contains(document.querySelector('#dj-swing')));
  assert.equal(document.querySelector('#dj-swing [data-swing="33"]').getAttribute('aria-pressed'), 'true', 'it shows the beat\'s Feel');
  document.querySelector('#dj-swing [data-swing="50"]').dispatch('click');
  assert.equal(seq.swing(), 50, 'Shuffle');
  assert.equal(document.querySelector('#dj-swing [data-swing="50"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('#dj-swing [data-swing="33"]').getAttribute('aria-pressed'), 'false');
  assert.equal(document.querySelector('#dj-bars [data-bars="2"]').getAttribute('aria-pressed'), 'true', 'and its Bars');
  keysOff(page);
  assert.equal(document.querySelector('#seq-swing [data-swing="50"]').getAttribute('aria-pressed'), 'true', 'Beats shows it too');
  document.querySelector('#seq-swing [data-swing="0"]').dispatch('click');
  document.querySelector('#seq-bars [data-bars="1"]').dispatch('click');
});
