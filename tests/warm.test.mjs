// Warming (web/warm.js): the pads on show load at once, every other sound of
// the person one at a time when the browser is idle. First the warmer on its
// own, then the real app: at start-up only the open groups' sounds load, a
// group opened later loads its sounds at once, and the rest follow in idle
// slots (a phone is not decoding a hundred sounds while the first screen draws).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarmer } from '../web/warm.js';

const clips = (...ids) => ids.map((id) => ({ id }));

function rig() {
  const done = new Set();
  const calls = [];
  const slots = [];
  const warmer = createWarmer({
    load: async (clip) => { calls.push(clip.id); done.add(clip.id); },
    loaded: (clip) => done.has(clip.id),
    idle: (fn) => slots.push(fn),
  });
  // Runs the booked idle slots (each may book the next) until none is left.
  const drain = async () => { while (slots.length) await slots.shift()(); };
  return { warmer, calls, slots, done, drain };
}

test('now loads the pads on show at once, each once', async () => {
  const { warmer, calls } = rig();
  warmer.now(clips('a', 'b'));
  warmer.now(clips('a', 'b', 'c'));
  await Promise.resolve();
  assert.deepEqual(calls, ['a', 'b', 'c']);
});

test('later loads nothing until the browser is idle, then one sound per slot, in order', async () => {
  const { warmer, calls, slots } = rig();
  warmer.later(clips('a', 'b', 'c'));
  assert.deepEqual(calls, [], 'nothing yet');
  assert.equal(slots.length, 1, 'one idle slot booked, not one per sound');
  await slots.shift()();
  assert.deepEqual(calls, ['a']);
  await slots.shift()();
  assert.deepEqual(calls, ['a', 'b']);
});

test('later skips sounds that are loaded already, and a sound taken by now leaves the queue', async () => {
  const { warmer, calls, drain } = rig();
  warmer.later(clips('a', 'b', 'c', 'd'));
  warmer.now(clips('c'));
  await drain();
  assert.deepEqual(calls, ['c', 'a', 'b', 'd'], 'c once, ahead of the rest');
});

test('a new later replaces the old queue (another person is on show)', async () => {
  const { warmer, calls, drain } = rig();
  warmer.later(clips('a', 'b'));
  warmer.later(clips('x', 'y'));
  await drain();
  assert.deepEqual(calls, ['x', 'y']);
});

test('a sound that fails to load does not stop the ones after it', async () => {
  const slots = [];
  const calls = [];
  const done = new Set();
  const warmer = createWarmer({
    load: async (clip) => { calls.push(clip.id); if (clip.id === 'a') throw new Error('broken'); done.add(clip.id); },
    loaded: (clip) => done.has(clip.id),
    idle: (fn) => slots.push(fn),
  });
  warmer.later(clips('a', 'b'));
  while (slots.length) await slots.shift()();
  assert.deepEqual(calls, ['a', 'b']);
});

// ── The real app ───────────────────────────────────────────────────────

test('the app loads the open groups first, a group opened later at once, and the rest when idle', async () => {
  const { installPage } = await import('./fake-dom.mjs');
  const { testManifest } = await import('./test-board.mjs');
  const idle = [];
  globalThis.requestIdleCallback = (fn) => { idle.push(fn); return idle.length; };
  console.error = () => {};
  const page = installPage({ manifest: testManifest() });
  const { audio } = await import('../web/audio.js');
  const loads = [];
  audio.load = async (clip) => {
    loads.push(clip.id);
    const loaded = { buffer: { duration: 0.1 }, duration: 0.1 };
    audio.rendered.set(audio.key(clip), Promise.resolve(loaded));
    return loaded;
  };
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { state } = await import('../web/state.js');
  const { clipsFor } = await import('../web/board.js');

  const onShow = new Set(page.$('#pads').querySelectorAll('.pad[data-id]').map((p) => p.dataset.id));
  const everyone = clipsFor(state.personId).map((c) => c.id);
  assert.ok(onShow.size > 0 && onShow.size < everyone.length, 'some groups are closed');
  assert.deepEqual([...new Set(loads)].sort(), [...onShow].sort(), 'at start only the pads on show are loaded');
  assert.ok(idle.length > 0, 'the rest wait for an idle slot');

  // Opening a closed group loads its sounds now, without waiting for idle.
  const closed = page.$('#pads').querySelectorAll('.pad-group').find((h) => h.getAttribute('aria-expanded') === 'false');
  assert.ok(closed, 'a closed group');
  const before = new Set(loads);
  closed.dispatch('click');
  await page.settle();
  const opened = [...page.$('#pads').querySelectorAll('.pad[data-id]')].map((p) => p.dataset.id).filter((id) => !onShow.has(id));
  assert.ok(opened.length > 0, 'the group has sounds');
  for (const id of opened) assert.ok(loads.includes(id) && !before.has(id), `${id} loads when its group opens`);

  // Idle slots load everything else, one sound each.
  const were = loads.length;
  while (idle.length) await idle.shift()();
  const rest = loads.slice(were);
  assert.equal(new Set(rest).size, rest.length, 'no sound twice');
  for (const id of everyone) assert.ok(loads.includes(id), `${id} is loaded in the end`);
  delete globalThis.requestIdleCallback;
});
