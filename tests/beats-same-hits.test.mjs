// One beat engine (docs/design/one-beat-engine.md), step 6: 🥁 Beats' ▶ books
// every hit of a beat at the time Beats' own player always booked it. The
// expected hits are worked out here from the beat itself, the way
// sequencer.js schedule did it before the engine (each row a pill every
// 60 / bpm / 4 seconds, over rate in Advanced; the beat's own bars; a swung
// pill late by swingDelay; a tune note at its own place in its pill and
// faster for a higher note; a loud pill at ACCENT_GAIN; a muted row none).
// This file imports only what the old player's code has too, so it runs on
// both sides of the move: it passes before Beats' loop moves onto the engine
// and after, unchanged.
//
// Two beats: a plain one bar of 4/4, and two bars of swung 3/4 with a 2×
// row (Advanced), a tune row, a muted row and a loud pill. Their hits are
// also kept as a file, tests/fixtures/beats-hits.json (kit ids, seconds
// after the first pill, rate and gain), so v2 can replay the same beats.
// UPDATE_FIXTURES=1 rewrites it, for a change meant to alter what Beats plays.
//
// A stand-in audio clock moved by hand 25 ms at a time, and the player's
// 25 ms tick called by hand after each move (setInterval is caught while ▶
// starts), so nothing waits on real time. Sounds "load" at once and play
// silently. Not tested here: how it sounds, and timing on a slow phone
// (`just look beats --cpu 4 --height 680`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { ACCENT_GAIN, SIGNATURES, barSteps, cleanPattern, hitGain, noteRate, pillHits, swingDelay } from '../web/beat.js';
import { scratchId } from '../web/scratch.js';
import { setSetting } from '../web/settings.js';

let page;
let $;
let state;
let audio;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.play = async () => {};
});

const round = (t) => Math.round(t * 1e9) / 1e9;
const byTime = (a, b) => a.at - b.at || (a.clip < b.clip ? -1 : a.clip > b.clip ? 1 : 0) || a.rate - b.rate || a.gain - b.gain;
const pills = (length, on, loud = []) => ({ steps: Array.from({ length }, (_, i) => on.includes(i)), accents: Array.from({ length }, (_, i) => loud.includes(i)) });

// The two beats, by the kit sound a row plays (the person's id is put in front).
const BEATS = {
  plain: () => ({ bpm: 120, bars: 1, rows: [
    { sound: 'kick', ...pills(16, [0, 4, 8, 12], [0]) },
    { sound: 'snare', ...pills(16, [4, 12]) },
    { sound: 'shaker', ...pills(16, [0, 2, 4, 6, 8, 10, 12, 14]) },
  ] }),
  swung: () => ({ bpm: 90, bars: 2, signature: '3/4', swing: 40, rows: [
    { sound: 'kick', ...pills(24, [0, 6, 12, 18], [12]) },
    { sound: 'shaker', rate: 2, ...pills(24, Array.from({ length: 24 }, (_, i) => i).filter((i) => i % 3 !== 2)) },   // two of every three pills
    { sound: 'snare', muted: true, ...pills(24, [6, 18]) },
    { sound: 'note-c', melody: true, tune: [{ p: 0, s: 0, l: 2 }, { p: 7, s: 3.5, l: 1 }, { p: 12, s: 8, l: 4 }, { p: 4, s: 23, l: 1 }] },
  ] }),
};

// Every hit Beats' player booked: each row on its own clock, over the beat's
// own bars, until `end`.
function expected(beat, ids, t0, end, advanced) {
  const groups = SIGNATURES[beat.signature ?? '4/4'];
  const total = barSteps(beat.signature) * beat.bars;
  const hits = [];
  beat.rows.forEach((row, i) => {
    if (row.muted) return;
    const dt = 60 / beat.bpm / 4 / (advanced ? row.rate : 1);
    for (let n = 0; t0 + n * dt < end; n++) {
      const step = n % total;
      for (const h of pillHits(row, step)) {
        const at = h.at ? t0 + n * dt + h.at * dt : t0 + n * dt + swingDelay(step, dt, beat.swing, groups);
        hits.push({ clip: ids[i], at, rate: noteRate(h.note), gain: hitGain(row, h.loud) });
      }
    }
  });
  return hits;
}

// Opens `raw` as the person's scratch on Beats, presses ▶ and runs the clock
// by hand for one time round (and the first pills of the next); returns
// what was booked, the beat as cleaned, and the first pill's time.
async function playIt(raw) {
  const pid = state.personId;
  const ids = raw.rows.map((r) => `${pid}-${r.sound}`);
  const beat = cleanPattern({ ...raw, id: scratchId(pid), name: 'Scratch', rows: raw.rows.map(({ sound, ...row }, i) => ({ ...row, clipId: ids[i] })) }, pid);
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== beat.id), { ...beat, created: 1, saved: 1 }];

  const ctx = audio.context();
  let now = 5;
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => now });
  const booked = [];
  const plainSource = ctx.createBufferSource;
  ctx.createBufferSource = () => {
    let voice = null;
    const src = { connect(to) { voice = to; }, disconnect() {}, stop() {}, playbackRate: { value: 1 }, buffer: null,
      start(at) { booked.push({ clip: src.buffer?.clip, at, rate: src.playbackRate.value, gain: round(voice?.gain.value ?? 1) }); } };
    return src;
  };
  const plainLoad = audio.load;
  audio.load = async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 });
  const plainInterval = globalThis.setInterval;
  const ticks = [];
  // The tick is caught. Its id is above 0: Beats is playing while its timer is not 0.
  globalThis.setInterval = (fn, ms) => (ms === 25 ? ticks.push(fn) : plainInterval(fn, ms));
  try {
    $('#beats-toggle').dispatch('click');   // Beats, reading the scratch again
    await page.settle();
    $('#seq-play').dispatch('click');
    await page.settle();
    globalThis.setInterval = plainInterval;
    assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'playing');
    assert.equal(ticks.length, 1, 'one player ticking');
    const t0 = now + 0.05;   // Beats starts its first pill 50 ms after ▶
    const pass = barSteps(beat.signature) * beat.bars * 60 / beat.bpm / 4;
    const end = t0 + pass + 0.25;
    while (now < end + 0.2) {
      now += 0.025;
      ticks[0]();
    }
    $('#seq-play').dispatch('click');
    assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false', 'stopped');
    return { beat, ids, t0, end, got: booked.filter((h) => h.at < end).map((h) => ({ ...h, at: round(h.at) })).sort(byTime) };
  } finally {
    globalThis.setInterval = plainInterval;
    ctx.createBufferSource = plainSource;
    audio.load = plainLoad;
    delete ctx.currentTime;
    ctx.currentTime = 0;
  }
}

const file = new URL('./fixtures/beats-hits.json', import.meta.url);
const kept = process.env.UPDATE_FIXTURES ? { about: '', beats: {} } : JSON.parse(readFileSync(file, 'utf8'));
const written = { about: 'Two beats made on 🥁 Beats and every hit each books: the kit sound, seconds after the first pill, the rate (a tune note faster for a higher note) and the hit\'s own gain (a loud pill louder). A plain bar of 4/4 at 120 BPM; two bars of 3/4 at 90 BPM with swing 40, a 2× row, a tune, a muted row and a loud pill. Written by the one-beat-engine work (docs/design/one-beat-engine.md); tests/beats-same-hits.test.mjs checks the app against it.', beats: {} };

for (const [name, make, advanced, count] of [['plain', BEATS.plain, false, 'plain: a bar of 4/4'], ['swung', BEATS.swung, true, 'swung: two bars of 3/4']]) {
  test(`🥁 Beats ▶ books every hit of ${count} at the time Beats always booked it, and goes round again`, async () => {
    await setSetting('advancedBeats', advanced);
    try {
      const raw = make();
      const { beat, ids, t0, end, got } = await playIt(raw);
      const want = expected(beat, ids, t0, end, advanced).map((h) => ({ ...h, at: round(h.at), gain: round(h.gain) })).sort(byTime);
      assert.ok(want.length > 10, `a full beat: ${want.length} hits`);
      assert.deepEqual(got, want);
      if (name === 'swung') {
        assert.ok(want.some((h) => h.gain === round(hitGain(beat.rows[0], true))), 'a loud pill is in it');
        assert.ok(hitGain(beat.rows[0], true) > hitGain(beat.rows[0], false) && ACCENT_GAIN > 1);
      }
      // The same hits as the file v2 replays: kit ids, seconds after the first pill.
      const pid = state.personId;
      const sound = (id) => id.slice(pid.length + 1);
      written.beats[name] = {
        beat: { bpm: beat.bpm, bars: beat.bars, signature: beat.signature ?? '4/4', swing: beat.swing, advanced, rows: raw.rows.map(({ sound: s, steps, accents, tune, rate, muted }) => ({
          sound: s, ...(rate ? { rate } : {}), ...(muted ? { muted } : {}), ...(tune ? { tune } : { pills: steps.flatMap((on, i) => (on ? [i] : [])), ...(accents.some(Boolean) ? { loud: accents.flatMap((on, i) => (on ? [i] : [])) } : {}) }),
        })) },
        hits: want.map((h) => ({ sound: sound(h.clip), at: round(h.at - t0), rate: round(h.rate), gain: h.gain })),
      };
      if (!process.env.UPDATE_FIXTURES) assert.deepEqual(written.beats[name], kept.beats[name]);
      else if (Object.keys(written.beats).length === 2) writeFileSync(file, `${JSON.stringify(written, null, 1)}\n`);
    } finally {
      await setSetting('advancedBeats', false);
      await page.settle();
    }
  });
}
