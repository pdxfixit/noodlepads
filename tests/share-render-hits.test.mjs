// What a share's preview plays (share-render.js renderAudio): every hit a
// beat and a song book offline, with its time, sound, rate, length and
// loudness, pinned as a JSON fixture (tests/fixtures/share-render-hits.json).
// It is green on the beat player as it is, and must stay green when the three
// schedulers become one beat engine (docs/design/one-beat-engine.md, step 2):
// a preview sounds the same on any player.
//
// The beats cover what the planner and the hit path do: a plain 4/4 beat; a
// 2-bar 3/4 beat with swing, a loud pill, a muted row, a quiet row, a row that
// cuts its own earlier hits and one that rings, a tune row (half-pill note,
// a held note, a sound with a found note), and the beat's master level. The
// song plays both at its own tempo, one lane louder than the other.
// Not tested here: how it sounds (the context records, it does not render).
// To rewrite the fixture after a change meant to alter the sound:
// UPDATE_FIXTURES=1 node --test --test-force-exit tests/share-render-hits.test.mjs

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { FakeOfflineAudioContext } from './helpers.mjs';

const FIXTURE = new URL('./fixtures/share-render-hits.json', import.meta.url);
const DURATION = { 0: 0.3, 1: 1.0, 2: 0.2, 3: 0.5 };   // seconds each of a person's four sounds lasts
const r = (n) => (n == null ? n : Math.round(n * 1e6) / 1e6);

let page;
let seq;
let state;
let who;
let ids;
let renderAudio;
let sources;   // every source an offline context was asked for, in order

// An offline context that records, not renders: each source with when it
// starts and stops, its rate, and the gains between it and the speaker.
class Recording extends FakeOfflineAudioContext {
  createGain() {
    const param = (value) => ({ value, ramps: [], setValueAtTime(v, t) { this.ramps.push(['set', r(v), r(t)]); }, linearRampToValueAtTime(v, t) { this.ramps.push(['ramp', r(v), r(t)]); }, cancelScheduledValues() {}, setTargetAtTime() {} });
    const node = { gain: param(1), connect(next) { node.to = next; return next; }, disconnect() {} };
    return node;
  }
  createBufferSource() {
    const src = {
      buffer: null, playbackRate: { value: 1 }, calls: {},
      start(at, offset, length) { src.calls.start = [r(at), offset ?? null, r(length)]; },
      stop(at) { src.calls.stop = r(at); },
      connect(next) { src.to = next; return next; },
    };
    sources.push(src);
    return src;
  }
}

// One source as a plain record: which sound, when, how fast, and the gain of
// each node it goes through (the hit's own, then the row's mix, the master, a lane).
function describe(src, clipOf) {
  const levels = [];
  for (let n = src.to; n && n.gain; n = n.to) levels.push(r(n.gain.value));
  const own = src.to?.gain.ramps ?? [];
  return {
    clip: clipOf(src.buffer), start: src.calls.start?.[0], length: src.calls.start?.[2], stop: src.calls.stop ?? null,
    rate: r(src.playbackRate.value), gain: levels, fade: own,
  };
}

before(async () => {
  console.error = () => {};
  globalThis.noodleTestSeq = (s) => { seq = s; };
  globalThis.OfflineAudioContext = Recording;
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ renderAudio } = await import('../web/share-render.js'));
  const { audio } = await import('../web/audio.js');
  who = state.personId;
  const person = state.manifest.people.find((p) => p.id === who);
  ids = person.clips.map((c) => c.id);
  // Each sound is its own object with its own length, so a cut-off or a note's end is visible.
  audio.load = async (clip) => {
    const duration = DURATION[ids.indexOf(clip.id)] ?? 0.25;
    return { buffer: { clipId: clip.id, duration }, duration };
  };
  audio.wake();
  // A found note on the fourth sound: its tune row plays that many semitones lower (pitch.js rootShift).
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

// The hits a render booked, sorted so the record does not depend on the order rows were walked.
async function hitsOf(kind, id) {
  sources = [];
  const out = await renderAudio(kind, id, {
    seq,
    rate: 22050,
    clipById: (cid) => state.manifest.people.flatMap((p) => p.clips).find((c) => c.id === cid) ?? null,
    beatById: (bid) => state.savedBeats.find((b) => b.id === bid),
    songById: (sid) => state.songbook.find((s) => s.id === sid),
  });
  assert.ok(out, `${kind} ${id} rendered`);
  return sources.map((s) => describe(s, (b) => b?.clipId)).sort((a, b) => a.start - b.start || String(a.clip).localeCompare(b.clip) || a.rate - b.rate);
}

test('a share preview books every hit of a beat and of a song at the times and loudness it always did', async () => {
  for (const b of beats()) state.savedBeats.push(b);
  state.songbook.push({ id: 'song-fx', personId: who, name: 'Fixture song', tempo: 100, saved: 1, created: 1,
    lanes: [
      { name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId: 'beat-fx-plain', bar: 0, times: 2 }, { beatId: 'beat-fx-mixed', bar: 2, times: 1 }] },
      { name: 'Quiet', emoji: '🔈', muted: false, volume: 0.4, blocks: [{ beatId: 'beat-fx-mixed', bar: 0, times: 1 }] },
      { name: 'Off', emoji: '🔇', muted: true, volume: 1, blocks: [{ beatId: 'beat-fx-plain', bar: 0, times: 1 }] },
    ] });
  const got = {
    plain: await hitsOf('beat', 'beat-fx-plain'),
    mixed: await hitsOf('beat', 'beat-fx-mixed'),
    song: await hitsOf('song', 'song-fx'),
  };
  assert.ok(got.plain.length > 0 && got.mixed.length > 0 && got.song.length > 0, 'every render booked hits');
  if (process.env.UPDATE_FIXTURES) {
    writeFileSync(FIXTURE, `${JSON.stringify(got, null, 1)}\n`);
    return;
  }
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  for (const name of ['plain', 'mixed', 'song']) {
    assert.equal(got[name].length, want[name].length, `${name}: the number of hits`);
    assert.deepEqual(got[name], want[name], `${name}: every hit and time`);
  }
});
