// 🧸 Kids from a keyboard (494319c: Enter or Space on a pad, a toy key or
// the mic is a click with no pointer). A held Enter repeats its keydown, and
// each repeat is another click: a pad played again and again, a toy key
// tapped again, the mic toggled on and off. Kids now takes Enter's repeats
// on its buttons, so one press is one click (council, 2026-10-26). A
// finger's tap, then the click the browser sends after it, plays once.
// The focus ring itself needs a browser (`just look kids-pads`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
const played = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async (clip) => { played.push(clip.id); };
  $('#kids-open').dispatch('click');
  await page.settle();
});

test('Enter held on a Kids button: its first keydown is left to click it, its repeats are taken', () => {
  $('[data-kids-tab="pads"]').dispatch('click');
  for (const node of [$('#kids-pages').querySelector('.kids-pad'), $('#kids-mic'), $('#kids-stop')]) {
    assert.equal(node.dispatch('keydown', { key: 'Enter' }).defaultPrevented, false, 'the press clicks it');
    assert.equal(node.dispatch('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true, 'a repeat does not');
  }
  $('[data-kids-tab="keys"]').dispatch('click');
  const key = $('#kids-keys').querySelector('.kids-key');
  assert.equal(key.dispatch('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  $('[data-kids-tab="pads"]').dispatch('click');
});

test('a finger\'s tap on a Kids pad, then the browser\'s click: one play', () => {
  const pad = $('#kids-pages').querySelector('.kids-pad');
  played.length = 0;
  pad.dispatch('pointerdown', { button: 0, pointerId: 2, pointerType: 'touch', clientX: 5, clientY: 5 });
  page.winEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 5, clientY: 5 });
  pad.dispatch('click', { detail: 1 });
  assert.deepEqual(played, [pad.dataset.clip]);
});

test('Kids\' buttons show a focus ring with a dark band and a white ring, seen on any fill', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.kids :focus-visible \{[^}]*outline: 4px solid #fff;[^}]*box-shadow: 0 0 0 4px #111/);
});
