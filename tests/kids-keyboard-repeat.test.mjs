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

// What a test of the CSS's text can't check: that the ring is seen, and
// not clipped, on a real screen. That is `just look kids-beats` (and keys,
// record) at 320 and 375 px and `--height 680`, with the ring drawn.
test('Kids\' focus ring: an outline only, off the button, so its own shadows stay; the playhead stays on a focused square; the beat grid leaves room for it', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.kids :focus-visible \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /outline: 4px solid #fff; outline-offset: 4px;/);
  assert.doesNotMatch(rule, /box-shadow/, 'a button\'s own shadow (3D, pressed, recording) is never covered');
  const now = css.match(/\.kids \.kids-square\.now:focus-visible \{([^}]*)\}/)?.[1] ?? '';
  assert.match(now, /var\(--led\)/, 'the playhead\'s yellow on a focused square');
  // Its ring, plus a pressed square's 1.08 scale (up to about 3 px a side on
  // a wide screen), stays inside the grid's 12 px: measured with `just look
  // kids-beats --js-file` at 320, 375 and 1100 px.
  const width = Number(now.match(/outline: (\d+)px/)?.[1]);
  const offset = Number(now.match(/outline-offset: (\d+)/)?.[1] ?? 0);
  assert.ok(width + offset + 3 <= 12, `ring ${width} + offset ${offset} + scale 3 within 12 px`);
  assert.match(css, /\.kids-beat \{[^}]*padding: 12px;/, 'room for the ring inside the scrolling grid');
});
