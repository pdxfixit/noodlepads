// The beat bar on a phone (Ben, 2026-10-18; docs/design/beat-from-a-song.md):
// where the five tools with their words don't fit beside the name, 💃 Grooves,
// ⌨️ Keys and 🗂️ My beats move to a row of their own above the title, still
// worded, and the title line keeps ✏️ or 💾 and 🆕. Wide screens keep one
// line. The switch is measured on the bar (lines.js fitLine), on both bars
// (⌨️ Keys off and on). The stand-in page has no layout, so each bar is given
// a width here; the look itself is checked with `just look beats`/`keys-on`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const web = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');
let page;
let bars;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  bars = [...document.querySelectorAll('.beat-bar')];
  // Beats' bar is a phone's: one line needs 520 px of its 340, and fits once
  // split. The keys' bar is a wide screen's: one line fits.
  Object.defineProperty(bars[0], 'clientWidth', { get: () => 340 });
  Object.defineProperty(bars[0], 'scrollWidth', { get: () => (bars[0].classList.contains('fit-split') ? 340 : 520) });
  Object.defineProperty(bars[1], 'clientWidth', { get: () => 900 });
  Object.defineProperty(bars[1], 'scrollWidth', { get: () => 900 });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('both beat bars are measured: a narrow one splits, a wide one stays on one line', async () => {
  const { BEAT_BAR_STEPS } = await import('../web/sequencer.js');
  assert.deepEqual(BEAT_BAR_STEPS, ['fit-split', 'fit-tight', 'fit-stack']);
  assert.equal(bars.length, 2, 'Beats and ⌨️ Keys each have the bar');
  assert.equal(bars[0].classList.contains('fit-split'), true, 'the phone bar puts the tools on their own row');
  assert.equal(bars[0].classList.contains('fit-tight'), false, 'and goes no further than it needs');
  assert.equal(bars[1].classList.contains('fit-split'), false, 'the wide bar keeps one line');
});

test('🆕 New can go emoji-only on the phone title line, and still says what it does', () => {
  for (const bar of bars) {
    const b = bar.querySelector('[data-beat-new]');
    assert.equal(b.dataset.word, 'New');
    assert.match(b.getAttribute('aria-label'), /^New: /);
  }
});

test('the split bar: Grooves, Keys and My beats first, in thirds, worded; Keep and New emoji alone', () => {
  const css = web('styles.css');
  assert.match(css, /\.beat-bar \.seq-tool\[data-word\]::after \{ content: " " attr\(data-word\); \}/, 'the bar\'s words show at every width, not only from 560 px');
  assert.match(css, /\.beat-bar\.fit-split :is\(\.doc-grooves, \.doc-keys, \.doc-open\) \{ order: -1; flex: 1 1 calc\(\(100% - 17px\) \/ 3\);/);
  assert.match(css, /\.beat-bar\.fit-split :is\(\.doc-keep, \.doc-new\)::after \{ content: none; \}/);
  assert.match(css, /\.beat-bar:not\(\.fit-split\) \.beat-name \{ min-width: 9em; \}/, 'one line only while the name keeps room');
  assert.doesNotMatch(css, /\.doc-bar:has\(\.doc-keys\)/, 'the old fixed-width grid is gone');
});
