// The beat bar refits when what is on it changes without its width changing
// (docs/design/beat-from-a-song.md, "The beat bar on a phone"): 💾 Keep with
// its word is wider than ✏️, so a bar that had to split for the scratch beat
// goes back to one line once the beat is kept. showBeatBars() refits both bars;
// a resize alone would never catch it. The stand-in page has no layout, so the
// bar is given a width here, and its frames are run by hand.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';

let page;
let bar;
const frames = [];
// Runs the frames asked for so far (a refit waits a frame: lines.js fitLine).
const runFrames = () => { for (const f of frames.splice(0)) f(); };

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  globalThis.requestAnimationFrame = (f) => frames.push(f);
  bar = document.querySelectorAll('.beat-bar')[0];
  // 760 px of bar: one line fits beside ✏️, not beside the worded 💾 Keep.
  const keepShown = () => !bar.querySelector('[data-beat-keep]').hidden;
  Object.defineProperty(bar, 'clientWidth', { get: () => 760 });
  Object.defineProperty(bar, 'scrollWidth', { get: () => (!bar.classList.contains('fit-split') && keepShown() ? 800 : 760) });
  await (await import('../web/app.js')).ready;
  await page.settle();
  runFrames();
});

test('the scratch beat\'s bar splits for 💾 Keep, and goes back to one line once the beat is kept', async () => {
  assert.equal(bar.querySelector('[data-beat-keep]').hidden, false, 'a fresh device has the scratch beat open');
  assert.equal(bar.classList.contains('fit-split'), true, 'with 💾 Keep worded, the five tools do not fit on one line');
  newBeatWithRow(page);
  await page.settle();
  runFrames();
  assert.equal(bar.querySelector('[data-beat-keep]').hidden, true, 'a kept beat has ✏️');
  assert.equal(bar.classList.contains('fit-split'), false, 'beside ✏️ they fit, so the bar is one line again');
});
