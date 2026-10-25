// A box that scrolls sideways follows the playhead a page at a time, and a
// scroll by the kid stops it until the next play (Ben, 2026-10-25: Beats'
// rows, the piano roll, Song's lanes; web/follow.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTurn, follower } from '../web/follow.js';

test('pageTurn: nothing while the playhead shows; else it goes to the left edge, beside the heads', () => {
  const at = (left, scroll = 0) => pageTurn({ left, right: left + 32, view: 375, head: 112, scroll });
  assert.equal(at(200), null, 'in sight');
  assert.equal(at(360), 360 - 112 - 6, 'off the right edge: a page turns');
  assert.equal(at(100, 500), 500 + 100 - 112 - 6, 'under the heads (after a loop round): back');
  assert.equal(at(-400, 300), 0, 'never before the start');
});

// A stand-in box: a scroll event follows every change of scrollLeft, a
// moment later, as a browser's does.
function box() {
  const b = new EventTarget();
  let x = 0;
  Object.defineProperty(b, 'scrollLeft', { get: () => x, set: (v) => { x = Math.max(0, v); setTimeout(() => b.dispatchEvent(new Event('scroll'))); } });
  return b;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('follower: its own scrolls keep it following; the kid\'s stop it until the next start', async () => {
  const b = box();
  const f = follower(b);
  f.to(100);
  assert.equal(b.scrollLeft, 0, 'not playing: no scroll');
  f.start();
  f.to(240);
  await tick();
  assert.equal(b.scrollLeft, 240);
  assert.ok(f.on, 'its own scroll is not the kid\'s');
  b.scrollLeft = 40;   // the kid swipes back
  await tick();
  assert.ok(!f.on);
  f.to(480);
  assert.equal(b.scrollLeft, 40, 'stays where the kid put it');
  f.start();
  f.to(480);
  await tick();
  assert.equal(b.scrollLeft, 480, 'the next play follows again');
  assert.ok(f.on);
  f.stop();
  assert.ok(!f.on);
});
