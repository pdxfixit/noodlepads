// Beats' rows with their controls on the left (Ben, 2026-10-25): each row's
// head stays at the left while its pills, on one line, scroll sideways with
// every other row's; a ruler over them numbers the bars; the emoji opens the
// row's menu. The stand-in page has no layout: the look is checked with
// `just look beat-groove --wide`, the playhead's page turns with `--js`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow, keysOff } from './new-beat.mjs';
import { rowParts } from '../web/beat-row.js';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('the rows scroll sideways together, each head stuck at the left over the pills', () => {
  assert.match(rule('.seq-scroll'), /overflow-x: auto/);
  assert.match(rule('.seq-rows'), /width: max-content/, 'the rows as wide as their pills, not wrapped to the screen');
  assert.match(rule('.seq-head'), /position: sticky/);
  assert.match(rule('.seq-head'), /left: 0/);
  assert.match(rule('.seq-head'), /background: var\(--bed\)/, 'opaque: pills pass under it');
  assert.match(rule('.seq-steps'), /display: flex/, 'bars side by side');
  assert.match(rule('.seq-beat'), /repeat\(var\(--size\), 32px\)/, 'pills keep their phone width');
  assert.match(rule('.seq-head [data-more-word]'), /display: none/, 'the menu\'s buttons wait out of sight');
});

test('a pill under 44 px wide takes taps in the gaps around it too', () => {
  assert.match(rule('.seq-row .pill::after'), /position: absolute/);
  assert.match(rule('.seq-row .pill::after'), /inset: -5px -2\.5px/, 'half of each 5 px gap, and the group\'s 5 px edge');
  assert.match(rule('.pill'), /height: 44px/);
});

test('the piano roll\'s squares are as wide as Beats\' pills, half pills too', () => {
  assert.match(rule('.roll-grid'), /--half-min: 16px/, 'two columns a pill: 32 px');
  assert.doesNotMatch(css, /^\.roll-grid\.half \{ --half-min/m, 'Advanced half pills don\'t shrink the squares');
});

test('with a menu, the emoji opens it and 🔊 shows alone; the rest are its items', () => {
  const labels = { remove: 'Remove', removeAsk: 'Remove?', clear: 'Clear', clearAsk: 'Clear?', pick: 'Change' };
  const data = { remove: { remove: 0 }, clear: { clear: 0 }, pick: { pick: 0 } };
  const speaker = document.createElement('button');
  speaker.className = 'speaker';
  const { pick, tools } = rowParts({ emoji: '🦶', data, labels, speaker, ring: { on: false, data: { ring: 0 }, label: 'Overlap' },
    menu: { key: 0, label: 'Row 1 menu', change: ['🔄', 'Change sound'] } });
  assert.equal(pick.dataset.more, '0', 'the emoji opens the menu');
  assert.equal(pick.dataset.pick, undefined, 'not the chooser itself');
  assert.equal(tools.children[0], speaker);
  assert.deepEqual([...tools.children].slice(1).map((b) => b.getAttribute('data-more-word')), ['Change sound', 'Overlap', 'Clear', 'Remove']);
  assert.equal(tools.querySelector('.row-change').dataset.pick, '0', 'Change sound opens the chooser');
});

test('a ruler numbers the bars over the rows, and a row has no fold', async () => {
  const $ = page.$;
  keysOff(page);
  newBeatWithRow(page);
  await page.settle();
  $('#seq-bars').querySelector('[data-bars="2"]').dispatch('click');
  await page.settle();
  const ruler = $('#seq-rows').children.find((c) => c.classList.contains('seq-ruler'));
  assert.ok(ruler, 'a ruler');
  assert.ok(ruler.children[0].classList.contains('seq-head'), 'an empty head over the rows\' heads');
  assert.deepEqual(ruler.querySelectorAll('.seq-tick.one').map((t) => t.textContent), ['1', '2']);
  assert.ok($('#seq-rows').closest('.seq-scroll'), 'the rows sit in the box that scrolls');
  assert.equal($('#seq-rows').querySelector('.seq-fold'), null);
});
