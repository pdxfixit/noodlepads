// 🎼 Song's playhead and lit blocks follow the sound a kid hears: the audio
// clock less the output's delay (sequencer.js outputDelay), as Beats'
// playhead does. They ran ahead of the sound by that delay (up to 0.2 s on
// Bluetooth). The real app; frames are run by hand, as the stand-in page
// never runs requestAnimationFrame.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { dropBeat, blocksOn } from './song-ui.mjs';

let page;
let $;
let ctx;
let frame = null;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  const { audio } = await import('../web/audio.js');
  ctx = audio.wake();
  globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
  await page.settle();
});

test('a block stays lit until its last bar has come out of the speaker', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  $('#seq-rows').querySelectorAll('.pill')[0].dispatch('click');
  $('#song-tab').dispatch('click');
  dropBeat($);
  dropBeat($);
  const [first, second] = blocksOn($);
  assert.ok(first && second, 'two one-bar blocks');
  ctx.outputLatency = 0.15;
  ctx.currentTime = 10;
  $('#song-play').dispatch('click');
  await page.settle();
  assert.equal($('#song-play').getAttribute('aria-pressed'), 'true');
  // The song starts at 10.1; a bar at 100 BPM is 2.4 s. At 12.55 the clock is
  // 0.05 s into bar 2, which is heard 0.15 s later: bar 1 still sounds.
  ctx.currentTime = 12.55;
  frame?.();
  const lit = () => blocksOn($).map((b) => b.el.classList.contains('now'));
  assert.deepEqual(lit(), [true, false], 'the first block is still heard');
  const at = Number($('#song-lanes').querySelector('.song-playhead').style.props['--at']);
  assert.ok(at < 1, `the line is still in bar 1 (${at})`);
  ctx.currentTime = 12.75;   // 0.05 s into bar 2, as heard
  frame?.();
  assert.deepEqual(lit(), [false, true]);
  $('#song-play').dispatch('click');
  ctx.outputLatency = 0;
  ctx.currentTime = 0;
});
