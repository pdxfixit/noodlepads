// A pad's fill while its sound plays. Written to the page every frame it
// restyled each playing pad (about a millisecond a pad on a slow phone), so
// it is one animation of the pad's ::before, started once (pad-fill.js,
// meter.js run). The skins that draw the progress themselves (--progress)
// still get it written, and a frame of that must not search the page for the
// pad or rewrite what the pad shows.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPadFill, PROGRESS_SKINS } from '../web/pad-fill.js';
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

const firstPad = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);

test('a frame of progress does not search the page for its pad, nor rewrite what the pad shows', async () => {
  const { setProgress } = await import('../web/pads.js');
  const pad = firstPad();
  const id = pad.dataset.id;
  const pads = $('#pads');
  const search = pads.querySelector.bind(pads);
  let searches = 0;
  pads.querySelector = (selector) => { searches++; return search(selector); };
  const set = pad.style.setProperty.bind(pad.style);
  let writes = 0;
  pad.style.setProperty = (name, value) => { writes++; return set(name, value); };
  try {
    for (let i = 1; i <= 60; i++) setProgress(id, i / 100);
    assert.ok(searches <= 1, `one search for 60 frames (${searches})`);
    assert.equal(writes, 60, 'every new value is written');
    for (let i = 0; i < 30; i++) setProgress(id, 0.6);
    assert.equal(writes, 60, 'the same value again is not written');
    assert.equal(pad.style.props['--progress'], 0.6);
    setProgress(id, 0);
    assert.equal(pad.style.props['--progress'], 0);
    assert.equal(pad.classList.contains('playing'), false);
  } finally {
    pads.querySelector = search;
    pad.style.setProperty = set;
    setProgress(id, 0);
  }
});

test('after the board is redrawn the progress goes to the new pad', async () => {
  const { setProgress, renderPads } = await import('../web/pads.js');
  const before = firstPad();
  const id = before.dataset.id;
  setProgress(id, 0.4);
  renderPads();
  const after = firstPad();
  assert.ok(after !== before, 'a redraw makes new pads');
  setProgress(id, 0.4);
  assert.equal(after.style.props['--progress'], 0.4, 'the same value is still written to a new pad');
  assert.ok(after.classList.contains('playing'));
  setProgress(id, 0);
});

// ── The fill as one animation (pad-fill.js) ────────────────────────────

// A pad that records its animations: animate() gives one that can be moved and cancelled.
function animatedPad(id = 'a') {
  const pad = {
    dataset: { id }, isConnected: true, classList: new Set(), animations: [],
    animate(keyframes, options) {
      const anim = { keyframes, options, currentTime: 0, cancelled: false, cancel() { this.cancelled = true; } };
      pad.animations.push(anim);
      return anim;
    },
  };
  pad.classList.add = (c) => Set.prototype.add.call(pad.classList, c);
  pad.classList.remove = (c) => Set.prototype.delete.call(pad.classList, c);
  pad.classList.contains = (c) => Set.prototype.has.call(pad.classList, c);
  return pad;
}

const sound = (t0, duration, loop = false) => ({ t0, duration, loop });

test('a playing sound starts one animation of the pad fill, and each later frame only looks at it', () => {
  const pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => undefined });
  const entry = sound(10, 2);
  for (let frame = 0; frame < 100; frame++) assert.equal(fill.draw('a', entry, 10 + frame / 60), true);
  assert.equal(pad.animations.length, 1, 'one animation for 100 frames');
  const [anim] = pad.animations;
  assert.equal(anim.options.pseudoElement, '::before');
  assert.equal(anim.options.duration, 2000);
  assert.equal(anim.options.iterations, 1);
  assert.deepEqual(anim.keyframes.transform, ['scaleX(0)', 'scaleX(1)']);
  assert.ok(pad.classList.contains('playing'));
  assert.equal(anim.cancelled, false);
});

test('a loop repeats, and one that waits for its bar draws nothing until its time', () => {
  const pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => undefined });
  const entry = sound(10.5, 1, true);
  fill.draw('a', entry, 10);
  const [anim] = pad.animations;
  assert.equal(anim.options.iterations, Infinity);
  assert.equal(anim.currentTime, -500, 'half a second before it begins');
  assert.equal(pad.classList.contains('playing'), false, 'not playing yet');
  fill.draw('a', entry, 10.6);
  assert.ok(pad.classList.contains('playing'));
});

test('an animation that drifts from the audio clock is set right; a small difference is left alone', () => {
  const pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => undefined });
  const entry = sound(0, 4);
  fill.draw('a', entry, 0);
  const [anim] = pad.animations;
  anim.currentTime = 1000;
  fill.draw('a', entry, 1.05);
  assert.equal(anim.currentTime, 1000, '50 ms apart: left alone');
  fill.draw('a', entry, 2);
  assert.equal(anim.currentTime, 2000, 'a second apart: moved back');
  fill.draw('a', entry, 9);
  assert.equal(anim.currentTime, 4000, 'a single play stops at its end');
});

test('a sound that turns into a loop, a new play of the same pad, or a redrawn board starts a fresh animation', () => {
  let pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => undefined });
  const entry = sound(0, 1);
  fill.draw('a', entry, 0.1);
  entry.loop = true;
  fill.draw('a', entry, 0.2);
  assert.equal(pad.animations.length, 2);
  assert.equal(pad.animations[0].cancelled, true);
  assert.equal(pad.animations[1].options.iterations, Infinity);
  const again = sound(5, 1);
  fill.draw('a', again, 5.1);
  assert.equal(pad.animations.length, 3, 'a new play of the sound');
  const old = pad;
  pad = animatedPad();
  old.isConnected = false;
  fill.draw('a', again, 5.2);
  assert.equal(pad.animations.length, 1, 'the board was redrawn: the new pad gets it');
});

test('clear and sweep take the fill off, and the pad stops playing', () => {
  const pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => undefined });
  const entry = sound(0, 2);
  fill.draw('a', entry, 0.5);
  fill.clear('a');
  assert.equal(pad.animations[0].cancelled, true);
  assert.equal(pad.classList.contains('playing'), false);
  assert.equal(fill.active(), 0);
  fill.draw('a', entry, 0.6);
  assert.equal(fill.active(), 1);
  fill.sweep(new Map([['a', entry]]));
  assert.equal(fill.active(), 1, 'still playing: kept');
  fill.sweep(new Map());
  assert.equal(fill.active(), 0, 'no longer playing: let go');
  assert.equal(pad.animations[1].cancelled, true);
});

test('a skin that draws --progress, a browser without animations, or a sound with no pad falls back or is skipped', () => {
  const pad = animatedPad();
  const fill = createPadFill({ padFor: () => pad, skin: () => 'slam' });
  assert.equal(fill.draw('a', sound(0, 1), 0.2), false, 'Slam draws --progress: written each frame');
  assert.equal(pad.animations.length, 0);
  const plain = { dataset: {}, isConnected: true, classList: new Set() };
  assert.equal(createPadFill({ padFor: () => plain, skin: () => undefined }).draw('a', sound(0, 1), 0.2), false, 'no animate()');
  const refusing = animatedPad();
  refusing.animate = () => { throw new TypeError('no pseudoElement'); };
  assert.equal(createPadFill({ padFor: () => refusing, skin: () => undefined }).draw('a', sound(0, 1), 0.2), false, 'animate() refuses');
  assert.equal(createPadFill({ padFor: () => null, skin: () => undefined }).draw('preview', sound(0, 1), 0.2), true, 'a preview is not a pad: nothing to draw');
});

test('the meter asks the fill first and writes --progress only for what it did not handle', async () => {
  const { meter } = await import('../web/meter.js');
  const { audio } = await import('../web/audio.js');
  const ctxWas = audio.ctx;
  const analyserWas = audio.analyser;
  audio.ctx = { currentTime: 3 };
  audio.analyser = { getFloatTimeDomainData: (a) => a.fill(0) };
  const written = [];
  const asked = [];
  const swept = [];
  const saved = { fill: meter.fill, sweep: meter.sweep, setProgress: meter.setProgress, grille: meter.grille, raf: globalThis.requestAnimationFrame };
  meter.fill = (id) => { asked.push(id); return id === 'a'; };
  meter.sweep = (playing) => swept.push([...playing.keys()]);
  meter.setProgress = (id, p) => written.push([id, p]);
  meter.grille = { children: [] };
  globalThis.requestAnimationFrame = (fn) => { globalThis.requestAnimationFrame = () => 0; fn(); return 1; };
  audio.playing.set('a', { t0: 2, duration: 4, loop: false });
  audio.playing.set('b', { t0: 2, duration: 4, loop: false });
  try {
    meter.raf = 0;
    meter.run();
    assert.deepEqual(asked, ['a', 'b']);
    assert.deepEqual(written, [['b', 0.25]], 'only b is written');
    assert.deepEqual(swept, [['a', 'b']]);
  } finally {
    audio.playing.delete('a');
    audio.playing.delete('b');
    Object.assign(meter, { fill: saved.fill, sweep: saved.sweep, setProgress: saved.setProgress, grille: saved.grille, raf: 0 });
    globalThis.requestAnimationFrame = saved.raf;
    audio.ctx = ctxWas;
    audio.analyser = analyserWas;
  }
});

test('styles.css: every skin that reads --progress is one the fill leaves to setProgress', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const reading = new Set();
  for (const m of css.matchAll(/@scope \(\[data-skin="([a-z]+)"\]\)[^{]*\{/g)) {
    // The block's end: the next @scope at the start of a line, or the end.
    const start = m.index + m[0].length;
    const next = css.indexOf('\n@scope', start);
    const block = css.slice(start, next < 0 ? css.length : next);
    if (/var\(--progress/.test(block)) reading.add(m[1]);
  }
  assert.deepEqual([...reading].sort(), [...PROGRESS_SKINS].sort());
  // The default look draws the fill on ::before from the same --progress, which the animation overrides.
  assert.match(css, /\.pad::before \{[^}]*transform: scaleX\(var\(--progress, 0\)\)/);
});
