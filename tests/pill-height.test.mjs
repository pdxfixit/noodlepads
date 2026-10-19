// Beat pills shorten each time the bars double, on every screen, bars side
// by side too (Ben, 2026-10-19: "shrink on wide screens too"). The stand-in
// page has no layout, so each row's pill box is given a wide screen's width
// (2400 px, where two bars sit side by side); the look itself is checked
// with `just look beat-groove --wide`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, FakeElement } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  Object.defineProperty(FakeElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.classList.contains('seq-steps') ? 2400 : undefined; },
  });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('two bars side by side on a wide screen still get shorter pills', async () => {
  const $ = page.$;
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  await page.settle();
  const bars = (n) => $('#seq-bars').querySelector(`[data-bars="${n}"]`).dispatch('click');
  const height = () => document.querySelector('.seq-steps').style.props['--pill-h'];
  bars(1); await page.settle();
  assert.equal(height(), '64px', 'one bar: tall pills');
  bars(2); await page.settle();
  assert.ok(document.querySelector('.seq-steps').classList.contains('bars-across'), 'the two bars sit side by side');
  assert.equal(height(), '54px', 'two bars: a step shorter, though the page grows no taller');
  bars(4); await page.settle();
  assert.equal(height(), '44px', 'four bars: shorter again');
});
