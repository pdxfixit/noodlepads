// A held Enter repeats its keydown, and on a focused button each repeat is
// another click. On 🎤 Live's keys and 👆 tiles that played the sound again
// and again, and on one that loops it toggled the loop on and off; on the
// grown-up sum's keypad it typed the digit again. One press, one click: the
// repeats are taken there, as in 🧸 Kids (council, 2026-10-26). The sum's
// keys get a ring seen on its light card. Real key repeat needs a browser.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
});

const press = (node, repeat) => node.dispatch('keydown', { key: 'Enter', repeat }).defaultPrevented;

test('a key and a 👆 tile on 🎤 Live: Enter clicks once, its repeats are taken', () => {
  $('#live-tab').dispatch('click');
  const key = $('#dj-keys').querySelector('[data-code="KeyA"]');
  assert.equal(press(key, false), false, 'the press clicks it');
  assert.equal(press(key, true), true, 'a repeat does not');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  const tile = $('#dj-touch').querySelector('[data-clip]');
  assert.equal(press(tile, false), false);
  assert.equal(press(tile, true), true);
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  $('#pads-tab').dispatch('click');
});

test('the grown-up sum\'s keypad: Enter types once, its repeats are taken; its keys show a dark ring', async () => {
  $('#kids-open').dispatch('click');
  await page.settle();
  $('#settings-open').dispatch('click');
  assert.equal($('#kids-sum').open, true);
  const digit = $('#kids-sum-keys').querySelector('[data-digit="1"]');
  assert.equal(press(digit, false), false);
  assert.equal(press(digit, true), true);
  $('#kids-sum').close();
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.kids-sum-keys :focus-visible \{[^}]*outline: 4px solid var\(--ink\)/);
});
