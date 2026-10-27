// One beat engine (docs/design/one-beat-engine.md): 🧸 Kids' ▶ books every
// hit of a beat made in Kids at the time Kids' own player always booked it.
// The expected hits are worked out here from the beat itself, the way
// kids.js playBeat did it before the engine (a pill every 60 / bpm / 4
// seconds from the start, 16 pills a bar, a tune note at its own place in
// its pill and faster for a higher note). This file imports only what the
// old player's code has too, so it runs on both sides of the move: it must
// pass before the engine lands and after.
//
// The hits are also kept as a file, tests/fixtures/kids-beat-hits.json (kit
// ids, seconds after the first pill), so v2 can replay the same beat.
// UPDATE_FIXTURES=1 rewrites it, for a change meant to alter the beat Kids
// makes (its drums are kick, snare, shaker and clap since 2026-10-26).
//
// A stand-in audio clock moved by hand 25 ms at a time, and the player's
// 25 ms tick called by hand after each move (setInterval is caught while ▶
// starts), so nothing waits on real time. Sounds "load" at once and play
// silently. Not tested here: how it sounds, and timing on a slow phone
// (`just look kids-beats --cpu 4`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { KIDS_DRUMS, newKidsBeat, withBars, withSquare, withTuneNote, pillSeconds, tuneRowOf } from '../web/kids-logic.js';
import { STEPS, noteRate } from '../web/beat.js';
import { startsIn } from '../web/notes.js';
import { kidsBeatId } from '../web/scratch.js';

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
const byTime = (a, b) => a.at - b.at || (a.clip < b.clip ? -1 : a.clip > b.clip ? 1 : 0) || a.rate - b.rate;

// A beat as Kids makes it: four bars (a ● tune grew it), squares on every
// drum, a tune with a held note, a half-pill note and a note on the very
// last pill.
function kidsBeat(pid) {
  const drums = KIDS_DRUMS.map((d) => `${pid}-${d}`);
  let beat = withBars(newKidsBeat(pid, drums, kidsBeatId(pid)), 4);
  const on = { 0: [0, 4], 1: [2, 6], 2: [0, 1, 2, 3, 4, 5, 6, 7], 3: [7] };
  for (const [drum, squares] of Object.entries(on)) for (const s of squares) beat = withSquare(beat, drums, Number(drum), s, true);
  beat = { ...beat, bpm: 140 };
  const tune = `${pid}-note-c`;
  beat = withTuneNote(beat, { clipId: tune, pitch: 0, s: 0, l: 2, fresh: true });
  beat = withTuneNote(beat, { clipId: tune, pitch: 7, s: 4.5, l: 1 });
  beat = withTuneNote(beat, { clipId: tune, pitch: 12, s: 20, l: 4 });
  beat = withTuneNote(beat, { clipId: tune, pitch: 4, s: 63, l: 1 });
  return { beat, drums };
}

// Every hit Kids' player booked: each drum's first row on its pills, the
// tune row's notes where they start, for every pill before `end`.
function expected(beat, drums, t0, end) {
  const dt = pillSeconds(beat.bpm);
  const total = STEPS * beat.bars;
  const tune = tuneRowOf(beat);
  const hits = [];
  for (let n = 0; t0 + n * dt < end; n++) {
    const p = n % total;
    const at = t0 + n * dt;
    for (const id of drums) if (beat.rows.find((r) => r.clipId === id)?.steps[p]) hits.push({ clip: id, at, rate: 1 });
    for (const note of startsIn(tune.tune, p)) hits.push({ clip: tune.clipId, at: at + (note.s - p) * dt, rate: noteRate(note.p) });
  }
  return hits;
}

test('🧸 Kids ▶ books every hit of the kid\'s beat at the time Kids always booked it, and goes round again', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
  const pid = state.personId;
  const { beat, drums } = kidsBeat(pid);
  state.savedBeats = [...state.savedBeats.filter((b) => b.id !== beat.id), beat];

  // The stand-in clock, every sound started on it, and the player's tick.
  const ctx = audio.context();
  let now = 5;
  Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => now });
  const booked = [];
  const plainSource = ctx.createBufferSource;
  ctx.createBufferSource = () => {
    const src = { connect() {}, disconnect() {}, stop() {}, playbackRate: { value: 1 }, buffer: null, start(at) { booked.push({ clip: src.buffer?.clip, at, rate: src.playbackRate.value }); } };
    return src;
  };
  const plainLoad = audio.load;
  audio.load = async (clip) => ({ buffer: { clip: clip.id }, duration: 0.3 });
  const plainInterval = globalThis.setInterval;
  const ticks = [];
  globalThis.setInterval = (fn, ms) => { if (ms === 25) { ticks.push(fn); return 0; } return plainInterval(fn, ms); };

  try {
    $('[data-kids-tab="beats"]').dispatch('click');
    assert.equal($('#kids-beat').querySelectorAll('.kids-square[aria-pressed="true"]').length, 13, 'the squares the beat has on');
    $('#kids-play').dispatch('click');
    await page.settle();
    globalThis.setInterval = plainInterval;
    assert.equal($('#kids-play').getAttribute('aria-pressed'), 'true', 'playing');
    assert.equal(ticks.length, 1, 'one player ticking');
    const t0 = now + 0.06;   // Kids starts its first pill 60 ms after ▶
    const pass = STEPS * beat.bars * pillSeconds(beat.bpm);
    const end = t0 + pass + 0.25;   // one time round, and the first pills of the next
    while (now < end + 0.2) {
      now += 0.025;
      ticks[0]();
    }
    $('#kids-play').dispatch('click');
    assert.equal($('#kids-play').getAttribute('aria-pressed'), 'false', 'stopped');
    const got = booked.filter((h) => h.at < end).map((h) => ({ ...h, at: round(h.at) })).sort(byTime);
    const want = expected(beat, drums, t0, end).map((h) => ({ ...h, at: round(h.at) })).sort(byTime);
    assert.equal(want.length, 60, `a full beat: ${want.length} hits`);
    assert.deepEqual(got, want);
    // The same hits as the file v2 replays: kit ids, seconds after the first pill.
    const file = new URL('./fixtures/kids-beat-hits.json', import.meta.url);
    const kept = JSON.parse(readFileSync(file, 'utf8'));
    const sound = (id) => id.slice(pid.length + 1);
    const asFile = {
      about: kept.about,
      beat: {
        bpm: beat.bpm,
        bars: beat.bars,
        rows: [
          ...drums.map((id) => ({ sound: sound(id), pills: beat.rows.find((r) => r.clipId === id).steps.flatMap((on, i) => (on ? [i] : [])) })),
          { sound: sound(tuneRowOf(beat).clipId), tune: tuneRowOf(beat).tune.map(({ p, s, l }) => ({ p, s, l })) },
        ],
      },
      hits: want.map((h) => ({ sound: sound(h.clip), at: round(h.at - t0), rate: round(h.rate) })),
    };
    if (process.env.UPDATE_FIXTURES) writeFileSync(file, `${JSON.stringify(asFile, null, 1)}\n`);
    else assert.deepEqual(asFile, kept);
  } finally {
    globalThis.setInterval = plainInterval;
    ctx.createBufferSource = plainSource;
    audio.load = plainLoad;
    delete ctx.currentTime;
    ctx.currentTime = 0;
    await setSetting('level', 'regular');
    await page.settle();
  }
});
