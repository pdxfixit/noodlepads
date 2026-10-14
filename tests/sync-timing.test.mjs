// When cloud sync runs (web/sync-timing.js), on a fake clock: 20 s after a
// change, on focus and blur (a quick pair runs once), at once on hide with a
// change waiting, and every 5 minutes only while shown and focused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncTiming, SYNC_DELAY_MS, ACTIVE_MS, TRANSITION_MS, MIN_GAP_MS } from '../web/sync-timing.js';

function clock() {
  let t = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    // Moves time on by `ms`, running every timer that comes due, in order.
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

function setup({ active = true } = {}) {
  const c = clock();
  const runs = [];
  const page = { active };
  const timing = createSyncTiming({
    run: (why) => { runs.push([c.now(), why]); timing.ran(); },   // syncAll tells the timing it ran
    active: () => page.active, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer,
  });
  timing.ran();   // the sync on open
  return { c, runs, page, timing };
}

test('a change syncs once things have been quiet for 20 s', () => {
  const { c, runs, timing } = setup();
  timing.changed();
  c.advance(SYNC_DELAY_MS - 1);
  timing.changed();
  c.advance(SYNC_DELAY_MS - 1);
  assert.deepEqual(runs, []);
  c.advance(1);
  assert.deepEqual(runs, [[2 * SYNC_DELAY_MS - 1, 'change']]);
});

test('every 5 minutes while shown and focused', () => {
  const { c, runs } = setup();
  c.advance(3 * ACTIVE_MS);
  assert.deepEqual(runs.map(([t, why]) => [t / ACTIVE_MS, why]), [[1, 'active'], [2, 'active'], [3, 'active']]);
});

test('no polling while hidden or in the background', () => {
  const { c, runs, page, timing } = setup();
  page.active = false;
  timing.transition({ hidden: true });
  c.advance(TRANSITION_MS);
  const after = runs.length;
  c.advance(10 * ACTIVE_MS);
  assert.equal(runs.length, after, 'nothing more while hidden');
  assert.equal(timing.pending().active, false);
  page.active = true;
  timing.transition();
  c.advance(TRANSITION_MS);
  assert.equal(runs.at(-1)[1], 'focus', 'showing again syncs');
  c.advance(ACTIVE_MS);
  assert.equal(runs.at(-1)[1], 'active', 'and the 5 minutes start again');
});

test('a quick blur and focus run one sync', () => {
  const { c, runs, page, timing } = setup();
  c.advance(MIN_GAP_MS);
  page.active = false;
  timing.transition();          // blur
  c.advance(TRANSITION_MS / 2);
  page.active = true;
  timing.transition();          // focus
  c.advance(TRANSITION_MS * 4);
  assert.deepEqual(runs.map(([, why]) => why), ['focus']);
});

test('focus or blur right after a sync, with nothing changed, does not sync again', () => {
  const { c, runs, timing } = setup();
  c.advance(1000);
  timing.transition();
  c.advance(TRANSITION_MS);
  assert.deepEqual(runs, []);
  c.advance(MIN_GAP_MS);
  timing.transition();
  c.advance(TRANSITION_MS);
  assert.equal(runs.length, 1);
});

test('hiding sends a waiting change at once; the blur that follows adds nothing', () => {
  const { c, runs, page, timing } = setup();
  c.advance(MIN_GAP_MS);
  timing.changed();
  c.advance(3000);
  page.active = false;
  timing.transition({ hidden: true });
  assert.deepEqual(runs, [[MIN_GAP_MS + 3000, 'hide']]);
  timing.transition();   // window blur
  c.advance(SYNC_DELAY_MS * 2);
  assert.equal(runs.length, 1, 'one sync, and the change timer was cleared');
});

test('a sync started elsewhere (open, PIN, share) clears what it covers', () => {
  const { c, runs, timing } = setup();
  timing.changed();
  c.advance(5000);
  timing.ran();
  c.advance(SYNC_DELAY_MS);
  assert.deepEqual(runs, []);
  assert.equal(timing.pending().dirty, false);
});

test('the request budget: an hour shown and focused, idle, is 12 syncs', () => {
  const { c, runs } = setup();
  c.advance(60 * 60_000);
  assert.equal(runs.length, 12);
});
