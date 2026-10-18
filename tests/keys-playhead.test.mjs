// The playhead keeps with the click a kid hears while ⌨️ Keys records
// (Ben, 2026-10-18: it lagged behind at desktop width, 16 rows of 4 bars).
// It lights a pill as the pill is heard (the audio clock less the output's
// delay), and recording leaves the page alone between hits: a hit lights its
// own pill in place, the 40 ms tick writes nothing that hasn't changed, and
// the panel's glow is restyled without its thousand pills. How it looks and
// sounds on a real device needs a browser (`just look keys-on`).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepsHeard, outputDelay } from '../web/sequencer.js';
import { keysOn, keysOff } from './new-beat.mjs';
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
});
after(() => keysOff(page));

test('stepsHeard: a booked pill lights when it is heard, the output\'s delay after its time, and once', () => {
  const queue = [{ row: 0, step: 0, time: 10 }, { row: 1, step: 0, time: 10 }, { row: 0, step: 1, time: 10.15 }];
  const shown = [-1, -1];
  assert.equal(stepsHeard(queue, shown, 10.03, 0.042), false, 'on the clock, not yet out of the speaker');
  assert.deepEqual(shown, [-1, -1]);
  assert.equal(stepsHeard(queue, shown, 10.05, 0.042), true);
  assert.deepEqual(shown, [0, 0], 'both rows on pill 0 once it is heard');
  assert.equal(queue.length, 1, 'taken from the queue');
  assert.equal(stepsHeard(queue, shown, 10.1, 0.042), false, 'nothing new');
  assert.equal(stepsHeard(queue, shown, 10.2, 0.042), true);
  assert.deepEqual(shown, [1, 0]);
  assert.equal(stepsHeard([{ row: 0, step: 1, time: 1 }], [1], 2), false, 'the same pill again is no change');
});

test('outputDelay: output and base latency together, never below 0 or above 0.2 s', () => {
  assert.equal(outputDelay({ outputLatency: 0.032, baseLatency: 0.01 }), 0.042);
  assert.equal(outputDelay({ outputLatency: 0.5, baseLatency: 0.01 }), 0.2, 'Bluetooth headphones can say more');
  assert.equal(outputDelay({}), 0, 'a browser that does not say');
  assert.equal(outputDelay(undefined), 0);
});

test('the keys panel\'s glow changes are not handed down to the pills inside it', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../web/dj.js', import.meta.url), 'utf8');
  assert.match(css, /@property --glow \{[^}]*inherits: false/);
  assert.match(css, /@property --glow-level \{[^}]*inherits: false/);
  assert.match(css, /\.dj \{[^}]*calc\(var\(--glow-level\) \* 60px\)/, 'the panel\'s glow follows it');
  assert.match(js, /setProperty\('--glow-level'/, 'set every frame from the sound\'s level');
  assert.doesNotMatch(js, /el\.panel\?\.style\.setProperty\('--level'/, 'not the handed-down --level');
});

test('recording: a hit on a row lights its pill in place, and the 40 ms tick rewrites nothing unchanged', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  page.key('a', { code: 'KeyA' });   // the Kick's row, set up first
  ctx.currentTime = 7000;
  $('#dj-record').dispatch('click');
  await page.settle();
  ctx.currentTime = 7000.05 + 16 * 0.15 + 0.02;   // just after the count-in's "1"
  await new Promise((r) => setTimeout(r, 60));
  const line = $('#dj-grid').children[0];
  const pills = line.querySelector('.dj-grid-pills');
  page.key('a', { code: 'KeyA' });
  // (assert.ok: a failing assert.equal would print the whole stand-in page)
  assert.ok($('#dj-grid').children[0] === line, 'the grid was not drawn again for one hit');
  assert.ok(pills.children[0].classList.contains('on'), 'its pill is lit');
  // Between hits, the tick writes only what changed.
  const watch = (node) => {
    let value = node.textContent;
    const box = { writes: 0 };
    Object.defineProperty(node, 'textContent', { configurable: true, get: () => value, set: (v) => { value = v; box.writes++; } });
    return box;
  };
  const record = watch($('#dj-record'));
  const status = watch($('#dj-status'));
  const bpm = watch($('#dj-bpm'));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal($('#dj-record').textContent, '■ Stop');
  assert.deepEqual([record.writes, status.writes, bpm.writes], [0, 0, 0], 'five ticks, nothing written again');
  $('#dj-record').dispatch('click');
  assert.ok(record.writes > 0, 'Stop is written when it changes');
  for (const node of [$('#dj-record'), $('#dj-status'), $('#dj-bpm')]) {
    const v = node.textContent;
    delete node.textContent;
    node.textContent = v;
  }
  ctx.currentTime = 0;
});
