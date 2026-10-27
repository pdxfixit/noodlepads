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
