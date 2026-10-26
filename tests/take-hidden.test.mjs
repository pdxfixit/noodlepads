// A phone locked, or the app switched away, mid-take: the take ends there,
// kept, as Esc keeps it. It ran on out of sight for up to 3 minutes, silent
// (council, 2026-10-26). Not tested here: a real lock screen.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff } from './new-beat.mjs';

let page;
let $;
let state;
let ctx;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  ctx = audio.context();
});

test('the page hidden mid-take: the take ends and is kept, with what was played', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  ctx.currentTime = 7;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime = 7.5;
  page.key('s', { code: 'KeyS' });
  const before = state.takes.length;
  ctx.currentTime = 8;
  document.hidden = true;
  page.docEvent('visibilitychange');
  document.hidden = false;
  assert.equal($('#dj-record').textContent, '● Record', 'not recording');
  assert.equal(state.takes.length, before + 1, 'kept');
  assert.equal(state.takes.at(-1).events.length, 2);
  ctx.currentTime = 0;
});

// The council (2026-10-26): a page hidden also stops a take playing back,
// and ends a recording into the beat (kept, with its ↩️ Undo), even in its
// count-in, as a Live take ends.
test('the page hidden: a take playing back stops, and a beat recording in its count-in ends', async () => {
  const sources = [];
  const { audio } = await import('../web/audio.js');
  const make = ctx.createBufferSource?.bind(ctx);
  ctx.createBufferSource = () => {
    const s = { stops: [], playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() {}, stop(t) { s.stops.push(t); } };
    sources.push(s);
    return s;
  };
  const load = audio.load;
  audio.load = async () => ({ buffer: {}, duration: 0.2 });
  ctx.currentTime = 30;
  $('#live-tab').dispatch('click');
  $('#dj-done-play').dispatch('click');   // the take from the test above
  await new Promise((r) => setImmediate(r));
  assert.equal($('#dj-done-play').textContent, '■ Stop');
  assert.ok(sources.length >= 2, 'its hits booked');
  // A hit that has sounded leaves the booked list: ■ Stop has nothing to cut there.
  sources[0].onended?.();
  const hide = () => { document.hidden = true; page.docEvent('visibilitychange'); document.hidden = false; };
  hide();
  assert.equal($('#dj-done-play').textContent, '▶ Play', 'the take stopped');
  assert.deepEqual(sources[0].stops, [], 'the one that ended is not cut again');
  assert.ok(sources.slice(1).every((s) => s.stops.length), 'the rest are cut');
  audio.load = load;
  if (make) ctx.createBufferSource = make;
  // A recording into the beat, hidden in its count-in.
  keysOn(page);
  ctx.currentTime = 40;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal($('#dj-record').textContent, '■ Stop', 'recording, counting in');
  hide();
  assert.equal($('#dj-record').textContent, '● Record', 'ended');
  keysOff(page);
  ctx.currentTime = 0;
});
