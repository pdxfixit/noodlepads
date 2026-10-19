// On wide screens a 2- or 4-bar beat shows its bars side by side (Ben, 2026-10-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barsPerLine, pillHeight } from '../web/sequencer.js';

const fourFour = [4, 4, 4, 4];   // one bar of 4/4: 16 pills in 4 groups
test('bars go side by side only when each still fits on one line', () => {
  assert.equal(barsPerLine(fourFour, 1, 3000), 1, 'one bar is one bar');
  assert.equal(barsPerLine(fourFour, 2, 400), 1, 'a phone stacks them');
  assert.equal(barsPerLine(fourFour, 2, 1200), 2, 'two bars fit across at 1200');
  assert.equal(barsPerLine(fourFour, 4, 1200), 2, 'four bars: two by two');
  assert.equal(barsPerLine(fourFour, 4, 2400), 4, 'four across on a very wide screen');
  assert.equal(barsPerLine(fourFour, 4, 0), 1, 'not measured yet');
});

// More bars stacked make the page taller, so each doubling shortens the
// pills a step, never under a finger's 44 px (Ben, 2026-10-19).
test('pills shorten each time stacked bars double the height, down to 44 px', () => {
  assert.equal(pillHeight(1), 64, 'one bar keeps its tall pills');
  assert.equal(pillHeight(2), 54, 'two bars stacked: a step shorter');
  assert.equal(pillHeight(4), 44, 'four bars stacked: shorter again');
  assert.equal(pillHeight(2, 2), 64, 'two bars side by side add no height');
  assert.equal(pillHeight(4, 2), 54, 'four bars two by two: twice the height of one');
  assert.equal(pillHeight(4, 4), 64, 'four across: one line');
  assert.equal(pillHeight(8), 44, 'never under 44 px');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.pill \{\s*height: var\(--pill-h, 64px\)/, 'the pills read the height the layout sets');
});
