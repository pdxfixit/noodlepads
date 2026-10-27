// One beat engine (docs/design/one-beat-engine.md), step 8: 🎼 Song's ▶ and a
// 💃 groove's sample (hearBeat) book every hit of what they play at the time,
// rate, length, loudness and fade they always did, whoever books them. The
// hits are kept as a file, tests/fixtures/song-hits.json, written by the code
// before the move onto the engine's list source; this test checks the app
// against it, so it runs unchanged on both sides of the move.
//
// A song of two beats (a plain 4/4 bar; two bars of swung 3/4 with a loud
// pill, a row that cuts itself, one that rings, a muted row, a tune with a
// found note), on three lanes (one louder, one quiet, one muted), with a tempo
// mark. Then a beat heard as a sample, as 💃 Grooves' ▶ does.
// A stand-in audio clock moved by hand 25 ms at a time, and the song's tick
// called by hand after each move (setInterval is caught while ▶ starts), so
// nothing waits on real time. Not tested here: how it sounds, and timing on a
// slow phone (`just look song --cpu 4 --height 680`).
// UPDATE_FIXTURES=1 rewrites the file, for a change meant to alter what Song plays.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const FIXTURE = new URL('./fixtures/song-hits.json', import.meta.url);
const DURATION = { 0: 0.3, 1: 1.0, 2: 0.2, 3: 0.5 };   // seconds each of a person's four sounds lasts
const r = (n) => (n == null ? n : Math.round(n * 1e6) / 1e6);

let page;
let $;
let seq;
let state;
let audio;
let who;
let ids;
let booked;   // every source started on the live context, as a record

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s) => { seq = s; };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  who = state.personId;
  ids = state.manifest.people.find((p) => p.id === who).clips.map((c) => c.id);
  audio.load = async (clip) => {
    const duration = DURATION[ids.indexOf(clip.id)] ?? 0.25;
    return { buffer: { clipId: clip.id, duration }, duration };
  };
  // A found note on the fourth sound: its tune row plays that many semitones lower.
  state.manifest.people.find((p) => p.id === who).clips[3].root = 5;
  await page.settle();
});

const bools = (pills, length) => Array.from({ length }, (_, i) => pills.includes(i));
const row = (clipId, on, extra = {}) => ({ clipId, steps: bools(on, 16), accents: bools([], 16), rate: 1, ring: false, muted: false, ...extra });

function beats() {
  const plain = { id: 'beat-fx-plain', personId: who, name: 'Plain', bpm: 120, bars: 1, swing: 0, signature: '4/4', saved: 1, created: 1,
    rows: [row(ids[0], [0, 4, 8, 12]), row(ids[1], [2, 6, 10, 14])] };
  const long = Array.from({ length: 36 }, (_, i) => i % 3 === 0);   // 3/4: 12 pills a bar, two bars
  const mixed = { id: 'beat-fx-mixed', personId: who, name: 'Mixed', bpm: 90, bars: 2, swing: 33, signature: '3/4', volume: 0.8, saved: 1, created: 1,
    rows: [
      { ...row(ids[0], []), steps: long.slice(0, 24), accents: long.slice(0, 24).map((on, i) => on && i % 6 === 0) },   // loud on the bar's first beat
      row(ids[1], [1, 2, 3, 4, 5, 13, 14], { volume: 0.5 }),                                      // a long sound re-hit: each cuts the last
      row(ids[2], [0, 2, 4, 6, 8, 10], { ring: true }),                                           // rings over itself
      row(ids[3], [3, 7], { muted: true }),                                                        // heard by no one
      { clipId: ids[3], melody: true, steps: bools([0, 4, 8, 14], 24), notes: Array(24).fill(null),
        tune: [{ s: 0, p: 0, l: 2 }, { s: 3.5, p: 7, l: 1 }, { s: 8, p: 12, l: 6 }, { s: 14, p: -5, l: 1 }] },   // a tune: a half-pill start, a held note, a found note
    ] };
  return [plain, mixed];
}

// One source as a plain record: which sound, when (seconds after `t0`), how
// fast and long, and the gain of each node it goes through (the hit's own, the
// beat's mix, the lane, the speaker), with the hit's own fade.
function describe(src, t0) {
  const levels = [];
  for (let n = src.to; n && n.gain; n = n.to) levels.push(r(n.gain.value));
  const own = src.to?.gain.ramps ?? [];
  return {
    clip: src.buffer?.clipId, start: r(src.calls.start[0] - t0), length: r(src.calls.start[2]), stop: src.calls.stop == null ? null : r(src.calls.stop - t0),
    rate: r(src.playbackRate.value), gain: levels, fade: own.map(([kind, v, t]) => (kind === 'set' || kind === 'ramp' ? [kind, v, r(t - t0)] : [kind, v, t])),
  };
}
const order = (a, b) => a.start - b.start || String(a.clip).localeCompare(b.clip) || a.rate - b.rate || a.gain.join().localeCompare(b.gain.join());

// Runs `go()` with the live context recording: gain nodes keep what they were
// set to and connect to, sources what they were told. Returns the recorded
// sources, the clock helpers and the caught 25 ms ticks.
function recording() {
  const ctx = audio.context();
  const plain = { gain: ctx.createGain, source: ctx.createBufferSource, interval: globalThis.setInterval };
  let now = 100;
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => now });
  const param = (value) => ({ value, ramps: [], setValueAtTime(v, t) { this.ramps.push(['set', r(v), t]); }, linearRampToValueAtTime(v, t) { this.ramps.push(['ramp', r(v), t]); }, cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } });
  ctx.createGain = () => {
    const node = { gain: param(1), connect(next) { node.to = next; return next; }, disconnect() {} };
    return node;
  };
  const sources = [];
  ctx.createBufferSource = () => {
    const src = { buffer: null, playbackRate: { value: 1 }, calls: {}, start(at, offset, length) { src.calls.start = [at, offset ?? null, length]; }, stop(at) { src.calls.stop = at; },
      connect(next) { src.to = next; return next; }, disconnect() {} };
    sources.push(src);
    return src;
  };
  const ticks = [];
  globalThis.setInterval = (fn, ms) => (ms === 25 ? ticks.push(fn) : plain.interval(fn, ms));
  return {
    sources, ticks, now: () => now,
    advance: (to) => { while (now < to) { now = r(now + 0.025); for (const t of ticks) t(); } },
    done() {
      globalThis.setInterval = plain.interval;
      ctx.createGain = plain.gain;
      ctx.createBufferSource = plain.source;
      delete ctx.currentTime;
      ctx.currentTime = 0;
    },
  };
}

const written = {};
const kept = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const finish = (key, got) => {
  if (process.env.UPDATE_FIXTURES) {
    written[key] = got;
    if (Object.keys(written).length === 2) writeFileSync(FIXTURE, `${JSON.stringify({ about: 'Every hit 🎼 Song books when it plays a song, and 💃 Grooves\' sample (hearBeat) books for a beat: the sound, seconds after the first pill, rate, length, the gain of each node it goes through and its fade. Written by the one-beat-engine work (docs/design/one-beat-engine.md); tests/song-same-hits.test.mjs checks the app against it.', ...written }, null, 1)}\n`);
    return;
  }
  assert.deepEqual(got, kept()[key]);
};

test('🎼 Song ▶ books every hit of a song at the times, rates and loudness it always did', async () => {
  for (const b of beats()) state.savedBeats.push(b);
  state.songbook.push({ id: 'song-fx', personId: who, name: 'Fixture song', tempo: 100, saved: 1, created: 1,
    tempos: [{ bar: 4, bpm: 140 }],
    lanes: [
      { name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId: 'beat-fx-plain', bar: 0, times: 2 }, { beatId: 'beat-fx-mixed', bar: 2, times: 1 }] },
      { name: 'Quiet', emoji: '🔈', muted: false, volume: 0.4, blocks: [{ beatId: 'beat-fx-mixed', bar: 0, times: 1 }] },
      { name: 'Off', emoji: '🔇', muted: true, volume: 1, blocks: [{ beatId: 'beat-fx-plain', bar: 0, times: 1 }] },
    ] });
  $('#song-tab').dispatch('click');
  $('#song-open').dispatch('click');
  $('#songs-list').children.find((li) => li.querySelector('.lib-name').textContent === 'Fixture song').querySelector('[data-load]').dispatch('click');
  await page.settle();
  const rec = recording();
  try {
    $('#song-play').dispatch('click');
    await page.settle();
    const t0 = rec.now() + 0.1;   // Song starts its first bar 100 ms after ▶
    assert.equal($('#song-play').getAttribute('aria-pressed'), 'true', 'playing');
    assert.equal(rec.ticks.length, 1, 'one player ticking');
    // The song ends itself once its end is heard.
    for (let i = 0; i < 4000 && $('#song-play').getAttribute('aria-pressed') === 'true'; i++) rec.advance(rec.now() + 0.025);
    assert.equal($('#song-play').getAttribute('aria-pressed'), 'false', 'it stopped itself at its end');
    const got = rec.sources.filter((s) => s.calls.start).map((s) => describe(s, t0)).sort(order);
    assert.ok(got.length > 30, `a whole song: ${got.length} hits`);
    assert.ok(got.some((h) => h.gain.at(-2) === 0), 'the muted lane is booked, at no loudness');
    assert.ok(got.some((h) => h.gain.at(-2) === 0.4), 'the quiet lane');
    assert.ok(got.some((h) => h.fade.length), 'a hit cut off by the next');
    finish('song', got);
  } finally {
    rec.done();
  }
});

test('💃 a groove\'s sample (hearBeat) books one pass of a beat at once, as it always did', async () => {
  $('#pads-tab').dispatch('click');
  const rec = recording();
  try {
    const mixed = beats()[1];
    await seq.hearBeat('fx-hear', mixed, { seconds: 4 });
    await page.settle();
    const t0 = rec.now() + 0.05;   // the sample starts 50 ms after the tap
    const got = rec.sources.filter((s) => s.calls.start).map((s) => describe(s, t0)).sort(order);
    assert.ok(got.length > 10, `a pass: ${got.length} hits`);
    assert.ok(got.every((h) => h.start < 4), 'at most the seconds asked for');
    seq.stopHearing();
    finish('hear', got);
  } finally {
    rec.done();
  }
});
