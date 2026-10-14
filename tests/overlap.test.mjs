// 🔔 Overlap (Ben, 2026-10-12): a sound that rings over itself keeps its
// earlier hits sounding, up to MAX_RINGING; off, its next hit cuts it off.
// Beats has it per row on the header line (`ring`), 🎤 Live one button for
// the visit. The rules here are pure; app.test.mjs drives the buttons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ringOver, MAX_RINGING, planTake, takeFrom, cleanTake } from '../web/rhythm.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('ringOver: off, a hit cuts off every earlier hit still sounding; on, they ring, the oldest cut past MAX_RINGING', () => {
  const hits = (n) => Array.from({ length: n }, (_, i) => ({ id: i, end: 10 }));
  const over = { id: 'over', end: 1 };
  assert.deepEqual(ringOver([over, ...hits(2)], 2, false), { keep: [], cut: hits(2) }, 'a hit already over is in neither');
  assert.deepEqual(ringOver(hits(2), 2, true), { keep: hits(2), cut: [] });
  assert.equal(MAX_RINGING, 8);
  const r = ringOver(hits(9), 2, true);
  assert.deepEqual(r.cut.map((v) => v.id), [0, 1], 'the oldest two, so 8 sound with the new one');
  assert.equal(r.keep.length, MAX_RINGING - 1);
});

test('a take keeps which hits rang (🔔 Overlap on Live), and renders as heard: a hit cuts its sound\'s last unless it rang', () => {
  const take = takeFrom([
    { at: 1, clipId: 'k', kind: 'hit' },
    { at: 1.2, clipId: 'k', kind: 'hit' },
    { at: 1.4, clipId: 'k', kind: 'hit', ring: true },
    { at: 1.5, clipId: 'b', kind: 'beat', ring: true },
  ], 3);
  assert.deepEqual(take.events.map((e) => e.ring ?? false), [false, false, true, false], 'only a hit can ring; false is not stored');
  assert.ok(!('ring' in take.events[0]));
  const clean = cleanTake({ id: 'take-x', personId: 'p-a', events: [...take.events, { t: 2, clipId: 'k', kind: 'hit', ring: 'yes' }] });
  assert.deepEqual(clean.events.map((e) => e.ring ?? false), [false, false, true, false, false], 'kept through a backup; junk dropped');
  const plays = planTake(take, new Map([['k', 1], ['b', 1]]));
  assert.deepEqual(plays, [
    { clipId: 'k', at: 0, end: 0.2 },     // cut by the next hit
    { clipId: 'k', at: 0.2 },             // rang on under the third
    { clipId: 'k', at: 0.4 },
    { clipId: 'b', at: 0.5 },             // a beat's own hit: never cut here
  ]);
});

test('the sound picker no longer has 🔔 Overlap; Live\'s sits just right of ⏲️ Click track, before ✏️ Edit keys', () => {
  assert.doesNotMatch(html, /id="chooser-ring"/);
  const start = html.indexOf('<dialog id="chooser"');
  const chooser = html.slice(start, html.indexOf('</dialog>', start));
  assert.doesNotMatch(chooser, /Overlap/);
  const at = (id) => html.indexOf(`id="${id}"`);
  assert.ok(at('dj-click-tempo') < at('dj-overlap') && at('dj-overlap') < at('dj-change'));
});
