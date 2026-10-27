// Beats' playhead (playhead.js, sequencer.js showSteps): where its bars go,
// that they are kept and moved rather than made again, and that a step reads
// the page's layout before it writes anything (a read after a write makes the
// browser lay the page out again; that was twice a step). The real app on the
// stand-in page, which has no layout: the boxes are made up. How it looks
// needs a browser (`just look beat-groove`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { playheadSpans, createBars } from '../web/playhead.js';

const box = (left, top, width = 32, height = 44) => ({ left, top, width, bottom: top + height });

test('playheadSpans: rows in step, each on one line: one bar from the first row to the last', () => {
  const rects = [box(100, 10), box(100, 70), box(100, 130)];
  assert.deepEqual(playheadSpans(rects, { start: box(40, 10), end: box(400, 10) }), [[116, 4, 180]]);
});

test('playheadSpans: rows at different steps, or wrapped onto two lines: a short bar on each playing pill', () => {
  const apart = [box(100, 10), box(200, 70)];
  assert.deepEqual(playheadSpans(apart, { start: box(40, 10), end: box(400, 10) }), [[116, 4, 60], [216, 64, 120]]);
  const together = [box(100, 10), box(100, 70)];
  assert.deepEqual(playheadSpans(together, { start: box(40, 10), end: box(40, 60) }), [[116, 4, 60], [116, 64, 120]], 'a phone wraps each row: a bar per row');
  assert.deepEqual(playheadSpans([], { start: box(0, 0), end: box(0, 0) }), []);
});

test('createBars keeps its bars and writes only what moved', () => {
  const host = document.createElement('div');
  const bars = createBars(host);
  bars.paint([[116, 4, 180]]);
  const [bar] = host.children;
  assert.equal(bar.className, 'seq-bar');
  assert.equal(bar.style.transform, 'translate(116px, 4px)');
  assert.equal(bar.style.height, '176px');
  let writes = 0;
  for (const name of ['transform', 'height']) {
    let value = bar.style[name];
    Object.defineProperty(bar.style, name, { configurable: true, get: () => value, set: (v) => { writes++; value = v; } });
  }
  bars.paint([[116, 4, 180]]);
  assert.equal(writes, 0, 'the same place: nothing written');
  bars.paint([[216, 4, 180]]);
  assert.ok(host.children[0] === bar, 'the same bar moved');
  assert.equal(bar.style.transform, 'translate(216px, 4px)');
  assert.equal(writes, 1, 'only its transform: the height did not change');
  bars.paint([[216, 4, 60], [216, 64, 120]]);
  assert.equal(host.children.length, 2);
  assert.ok(host.children[0] === bar);
  bars.paint([]);
  assert.equal(host.children.length, 0, 'none when nothing plays');
  assert.equal(bars.count(), 0);
});

// ── The real sequencer ─────────────────────────────────────────────────

let page;
let $;
let seq;

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s) => { seq = s; };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  const { audio } = await import('../web/audio.js');
  audio.load = async () => ({ buffer: { duration: 0.1 }, duration: 0.1 });
  audio.wake();
  await page.settle();
});

test('a step reads the boxes it needs before it writes a class, a bar or a scroll, and moves one bar', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  const frames = [];
  const realFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  try {
    ctx.currentTime = 100;
    $('#seq-play').dispatch('click');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await page.settle();
    assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the beat plays');
    // Every box the page is asked for and every class it is given, in order.
    const log = [];
    const pills = $('#seq-rows').querySelectorAll('.pill');
    assert.ok(pills.length >= 16, 'a row of pills');
    for (const pill of pills) {
      pill.getBoundingClientRect = () => { log.push('read'); return box(40 + log.length, 10); };
      for (const name of ['add', 'remove']) {
        const real = pill.classList[name].bind(pill.classList);
        pill.classList[name] = (...c) => { if (c[0] === 'now') log.push('write'); return real(...c); };
      }
    }
    const steps = [];
    for (let t = 0; t < 4; t++) {
      ctx.currentTime += 0.2;
      await new Promise((r) => setTimeout(r, 60));   // the engine's tick books the hits that are due
      log.length = 0;
      const frame = frames.pop();
      assert.ok(frame, 'the playhead asks for a frame');
      frame();
      steps.push([...log]);
    }
    const changed = steps.filter((s) => s.includes('write'));
    assert.ok(changed.length >= 2, 'the playhead moved over the steps');
    for (const s of changed) {
      const firstWrite = s.indexOf('write');
      assert.ok(!s.slice(firstWrite).includes('read'), `no box is read after a write: ${s.join(' ')}`);
      assert.ok(firstWrite > 0, 'the boxes were read first');
    }
    assert.equal($('#seq-rows').querySelector('.seq-playhead').children.length, 1, 'one bar down the rows');
  } finally {
    globalThis.requestAnimationFrame = realFrame;
    if ($('#seq-play').getAttribute('aria-pressed') === 'true') $('#seq-play').dispatch('click');
    $('#beats-toggle').dispatch('click');
  }
});
