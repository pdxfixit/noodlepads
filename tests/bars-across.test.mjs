// On wide screens a 2- or 4-bar beat shows its bars side by side (Ben, 2026-10-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barsPerLine } from '../web/sequencer.js';

const fourFour = [4, 4, 4, 4];   // one bar of 4/4: 16 pills in 4 groups
test('bars go side by side only when each still fits on one line', () => {
  assert.equal(barsPerLine(fourFour, 1, 3000), 1, 'one bar is one bar');
  assert.equal(barsPerLine(fourFour, 2, 400), 1, 'a phone stacks them');
  assert.equal(barsPerLine(fourFour, 2, 1200), 2, 'two bars fit across at 1200');
  assert.equal(barsPerLine(fourFour, 4, 1200), 2, 'four bars: two by two');
  assert.equal(barsPerLine(fourFour, 4, 2400), 4, 'four across on a very wide screen');
  assert.equal(barsPerLine(fourFour, 4, 0), 1, 'not measured yet');
});
