// 🎧 From a song's listener (web/listen.js, web/listen-dsp.js), on made-up
// songs (tests/listen-synth.mjs): drums with a bass line, a pad and hiss
// under them, fed in uneven chunks as an AudioWorklet or a file would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createListener, fingerprint, closestSound, barLikeness, fillHats, bpmFor, MIN_BPM, MAX_BPM } from '../web/listen.js';
import { fftSize } from '../web/listen-dsp.js';
import { barSteps } from '../web/beat.js';
import { render, feedAll, drumSounds, rng, GROOVE } from './listen-synth.mjs';

// Renders a song, listens to all of it, taking a snapshot every half second.
function listen(spec, sampleRate = 44100) {
  const song = render({ sampleRate, lead: 0.5, ...spec });
  const listener = createListener({ sampleRate });
  const snaps = [];
  const half = Math.round(sampleRate / 2);
  for (let i = 0; i < song.samples.length; i += half) {
    feedAll(listener, song.samples.subarray(i, Math.min(song.samples.length, i + half)), i);
    snaps.push(listener.snapshot());
  }
  return { song, result: listener.finish(), snaps };
}

// A row's steps as the hit steps of each bar: [[0, 8], [0, 8]].
const hitsOf = (steps, B) => {
  const out = [];
  for (let b = 0; b < steps.length / B; b++) out.push(steps.slice(b * B, (b + 1) * B).flatMap((x, i) => (x ? [i] : [])));
  return out;
};
const assertBeat = (part, want, msg = '') => {
  const B = barSteps(part.signature);
  for (const row of ['kick', 'snare', 'hat']) {
    const bars = Array.isArray(want[row][0]) ? want[row] : [want[row]];
    assert.deepEqual(hitsOf(part.steps[row], B), bars, `${msg} ${row}`);
  }
};

test('a steady 4/4 groove gives its tempo and beat, at slow, middling and fast tempos', () => {
  for (const [bpm, groove, sr] of [[70, 'rock', 44100], [100, 'rock', 48000], [128, 'chorus', 44100], [165, 'rock', 48000]]) {
    const { result } = listen({ seed: bpm, sections: [{ bars: 10, bpm, ...GROOVE[groove] }] }, sr);
    assert.equal(result.parts.length, 1, `${bpm}: one part`);
    const [a] = result.parts;
    assert.equal(a.id, 'A');
    assert.ok(Math.abs(a.bpm - bpm) <= 1, `${bpm}: heard ${a.bpm}`);
    assert.equal(a.signature, '4/4');
    assert.equal(a.swing, 0);
    assert.equal(a.bars, 1);
    assertBeat(a, GROOVE[groove], `${bpm}`);
    assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 10 }]);
    assert.deepEqual(result.tempos, []);
  }
});

test('a drummer drifting a few percent stays one part, the grid following', () => {
  const { result } = listen({ seed: 4, jitter: 0.008, sections: [{ bars: 16, bpm: 100, bpmEnd: 104, ...GROOVE.rock }] });
  assert.equal(result.parts.length, 1);
  assert.ok(result.parts[0].bpm >= 100 && result.parts[0].bpm <= 104, `heard ${result.parts[0].bpm}`);
  assertBeat(result.parts[0], GROOVE.rock);
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 16 }]);
  assert.deepEqual(result.tempos, []);
});

test('a song that speeds up a quarter stays one part; its tempo marks follow it up', () => {
  const { result } = listen({ seed: 15, sections: [{ bars: 24, bpm: 96, bpmEnd: 120, ...GROOVE.rock }] });
  assert.equal(result.parts.length, 1);
  assertBeat(result.parts[0], GROOVE.rock);
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 24 }]);
  assert.ok(Math.abs(result.parts[0].bpm - 97) <= 2, `starts at ${result.parts[0].bpm}`);
  assert.ok(result.tempos.length >= 2, JSON.stringify(result.tempos));
  for (let i = 1; i < result.tempos.length; i++) assert.ok(result.tempos[i].bpm > result.tempos[i - 1].bpm && result.tempos[i].bar > result.tempos[i - 1].bar);
  assert.ok(result.tempos.at(-1).bpm >= 112);
});

test('a sudden tempo change starts a new part, with a tempo mark and a tempo change while listening', () => {
  const { result, snaps } = listen({ seed: 9, sections: [{ bars: 8, bpm: 92, ...GROOVE.rock }, { bars: 8, bpm: 120, ...GROOVE.chorus }] });
  assert.deepEqual(result.parts.map((p) => [p.id, p.bpm]), [['A', 92], ['B', 120]]);
  assertBeat(result.parts[0], GROOVE.rock, 'A');
  assertBeat(result.parts[1], GROOVE.chorus, 'B');
  const [a, b] = result.order;
  assert.equal(result.order.length, 2);
  assert.equal(a.partId, 'A');
  assert.equal(b.partId, 'B');
  // The bars around the change may be dropped; the song's bars stay in a row.
  assert.ok(a.bars >= 7 && a.bars <= 8 && b.bars >= 6 && b.bars <= 8, JSON.stringify(result.order));
  assert.equal(b.startBar, a.startBar + a.bars);
  assert.deepEqual(result.tempos, [{ bar: b.startBar, bpm: 120 }]);
  const last = snaps.at(-1);
  assert.deepEqual(last.tempoChange, { atBar: b.startBar, from: 92, to: 120 });
  // While the new tempo is found it says so; then it listens on in part B.
  const i = snaps.findIndex((s) => s.parts.length === 1 && s.status === 'finding-tempo' && s.seconds > 10);
  assert.ok(i > 0, 'finding the new tempo');
  assert.equal(last.status, 'listening');
  assert.equal(last.current.partId, 'B');
  assert.equal(last.bpm, 120);
});

test('verse, chorus, verse at one tempo: two parts, the verse reused (A B A)', () => {
  const { result } = listen({ seed: 2, sections: [{ bars: 8, bpm: 100, ...GROOVE.rock }, { bars: 8, bpm: 100, ...GROOVE.chorus }, { bars: 8, bpm: 100, ...GROOVE.rock }] });
  assert.equal(result.parts.length, 2);
  assertBeat(result.parts[0], GROOVE.rock, 'verse');
  assertBeat(result.parts[1], GROOVE.chorus, 'chorus');
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 8 }, { partId: 'B', startBar: 9, bars: 8 }, { partId: 'A', startBar: 17, bars: 8 }]);
  assert.deepEqual(result.tempos, []);
});

test('a chorus whose kick changes over 2 bars is a part of its own, a 2-bar beat', () => {
  const chorus = { kick: [[0, 3, 8, 10], [0, 8, 11, 14]], snare: [4, 12], hat: GROOVE.rock.hat };
  const { result } = listen({ seed: 6, sections: [{ bars: 8, bpm: 100, ...GROOVE.rock }, { bars: 8, bpm: 100, ...chorus }, { bars: 6, bpm: 100, ...GROOVE.rock }] }, 48000);
  assert.deepEqual(result.order.map((o) => o.partId), ['A', 'B', 'A']);
  assert.equal(result.parts[1].bars, 2);
  assertBeat(result.parts[1], { kick: chorus.kick, snare: [[4, 12], [4, 12]], hat: [GROOVE.rock.hat, GROOVE.rock.hat] });
});

test('a one-bar fill is not a part, and its hits are voted out', () => {
  const fills = { 4: GROOVE.fill, 9: { kick: [0], snare: [12, 13, 14, 15], hat: [0, 2, 4, 6, 8] } };
  const { result } = listen({ seed: 3, sections: [{ bars: 12, bpm: 108, ...GROOVE.rock, fills }] });
  assert.equal(result.parts.length, 1);
  assertBeat(result.parts[0], GROOVE.rock);
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 12 }]);
});

test('a loud bass line and pad are not kicks or snares', () => {
  // The bass three times as loud: about 5 dB under the kick, its second
  // harmonic where a snare's body is.
  for (const seed of [8, 15]) {
    const { result } = listen({ seed, bass: 3, pad: 3, sections: [{ bars: 10, bpm: 100, ...GROOVE.rock }] });
    assert.equal(result.parts.length, 1, `seed ${seed}`);
    assertBeat(result.parts[0], GROOVE.rock, `seed ${seed}`);
  }
});

test('everything at once: a voice, a loud bass and pad, hiss, a loose drummer and ghost notes, verse chorus verse', () => {
  const { result } = listen({
    seed: 43, voice: 1, bass: 2, pad: 2, noise: 0.01, jitter: 0.01, ghosts: 0.3,
    sections: [{ bars: 8, bpm: 96, ...GROOVE.rock }, { bars: 8, bpm: 96, ...GROOVE.chorus }, { bars: 8, bpm: 96, ...GROOVE.rock }],
  });
  assert.deepEqual(result.order.map((o) => o.partId), ['A', 'B', 'A']);
  assertBeat(result.parts[0], GROOVE.rock, 'verse');
  assertBeat(result.parts[1], GROOVE.chorus, 'chorus');
  assert.deepEqual(result.parts.map((p) => p.bpm), [96, 96]);
});

test('swing and shuffle: late off-beat sixteenths pick Swing (33) or Shuffle (50)', () => {
  const sixteenths = Array.from({ length: 16 }, (_, i) => i);
  for (const [swing, bpm] of [[33, 90], [50, 96]]) {
    const groove = { kick: [0, 7, 10], snare: [4, 12], hat: sixteenths };
    const { result } = listen({ seed: swing, sections: [{ bars: 10, bpm, swing, ...groove }] });
    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].swing, swing);
    assert.equal(result.parts[0].bpm, bpm);
    assertBeat(result.parts[0], groove, `swing ${swing}`);
  }
  const { result } = listen({ seed: 8, sections: [{ bars: 8, bpm: 96, ...GROOVE.chorus }] });
  assert.equal(result.parts[0].swing, 0);
});

test('3/4, 6/8, 5/4 and 7/8 are told apart, bars as long as the signature says', () => {
  const songs = [
    ['3/4', 110, { kick: [0], snare: [4, 8], hat: [0, 2, 4, 6, 8, 10] }],
    ['6/8', 120, { kick: [0], snare: [6], hat: [0, 2, 4, 6, 8, 10] }],
    ['5/4', 110, { kick: [0, 8, 14], snare: [4, 12, 16], hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18] }],
    ['7/8', 120, { kick: [0, 8], snare: [4, 10], hat: [0, 2, 4, 6, 8, 10, 12] }],
  ];
  for (const [signature, bpm, groove] of songs) {
    const { result } = listen({ seed: bpm, sections: [{ bars: 14, bpm, signature, ...groove }] });
    assert.equal(result.parts.length, 1, signature);
    const [a] = result.parts;
    assert.equal(a.signature, signature);
    assert.equal(a.bpm, bpm, signature);
    assert.equal(a.steps.kick.length, barSteps(signature) * a.bars);
    assertBeat(a, groove, signature);
  }
});

test('silence at the start: it waits, then starts bar 1 where the music does', () => {
  const { result, snaps, song } = listen({ lead: 4, seed: 12, sections: [{ bars: 8, bpm: 104, ...GROOVE.rock }] });
  for (const s of snaps.filter((x) => x.seconds < 4)) {
    assert.equal(s.status, 'finding-tempo');
    assert.equal(s.bpm, null);
    assert.equal(s.current.partId, null);
    assert.deepEqual(s.current.recent, { kick: [], snare: [], hat: [] });
  }
  assert.ok(Math.abs(result.seconds - song.seconds) < 0.01);
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 8 }]);
  assert.equal(result.parts[0].bpm, 104);
  assertBeat(result.parts[0], GROOVE.rock);
});

test('the snapshot rolls the last 3 bars: hits that fit bright (2), one-offs dim (1), the future -1', () => {
  // Bar 7 of the song (6 here, counting from 0) has an extra kick on step 6.
  const fills = { 6: { ...GROOVE.rock, kick: [0, 6, 8] } };
  const { snaps } = listen({ seed: 21, sections: [{ bars: 10, bpm: 100, ...GROOVE.rock, fills }] });
  // (After bar 10 comes the second of silence that ends the song.)
  const listening = snaps.filter((s) => s.status === 'listening' && s.current.bar <= 10);
  assert.ok(listening.length > 5);
  for (const s of listening) {
    assert.equal(s.signature, '4/4');
    assert.equal(s.current.partId, 'A');
    assert.equal(s.bpm, 100);
    const { bar, step, recent } = s.current;
    for (const row of ['kick', 'snare', 'hat']) {
      assert.equal(recent[row].length, Math.min(3, bar));
      for (const cells of recent[row]) assert.equal(cells.length, 16);
      const now = recent[row].at(-1);
      now.forEach((c, i) => assert.equal(c === -1, i > step, `${row} step ${i} at ${step}`));
    }
    // Every bar played so far: the groove's hits are 2.
    for (const [b, cells] of recent.snare.entries()) {
      const played = b < recent.snare.length - 1 ? 16 : step + 1;
      for (let i = 0; i < played; i++) assert.equal(cells[i], [4, 12].includes(i) ? 2 : 0, `snare bar ${b} step ${i}`);
    }
  }
  // The extra kick shows as a one-off while bar 7 is on screen.
  const s = listening.find((x) => x.current.bar === 8 && x.current.step >= 0);
  assert.ok(s, 'a snapshot during bar 8');
  assert.deepEqual(s.current.recent.kick[1].map((c, i) => (c > 0 ? `${i}:${c}` : null)).filter(Boolean), ['0:2', '6:1', '8:2']);
  assert.equal(s.current.recent.kick[0][0], 2);
});

test('tempos outside the app\'s range are halved or doubled to fit', () => {
  const { result } = listen({ seed: 5, sections: [{ bars: 16, bpm: 200, ...GROOVE.rock }] });
  for (const p of result.parts) assert.ok(p.bpm >= MIN_BPM && p.bpm <= MAX_BPM, `heard ${p.bpm}`);
  assert.equal(result.parts[0].bpm, 100);
});

test('the finished result keeps the contract the screens build on', () => {
  const { result, snaps } = listen({ seed: 30, sections: [{ bars: 6, bpm: 112, ...GROOVE.rock }, { bars: 6, bpm: 112, ...GROOVE.chorus }] });
  assert.deepEqual(Object.keys(result).sort(), ['order', 'parts', 'seconds', 'tempos']);
  for (const p of result.parts) {
    assert.deepEqual(Object.keys(p).sort(), ['bars', 'bpm', 'id', 'prints', 'signature', 'steps', 'swing']);
    assert.ok([1, 2, 4].includes(p.bars));
    for (const row of ['kick', 'snare', 'hat']) {
      assert.equal(p.steps[row].length, p.bars * barSteps(p.signature));
      assert.ok(p.steps[row].every((x) => typeof x === 'boolean'));
      assert.ok(p.prints[row] === null || p.prints[row] instanceof Float32Array);
    }
  }
  for (const o of result.order) assert.ok(result.parts.some((p) => p.id === o.partId));
  const s = snaps.at(-1);
  assert.deepEqual(Object.keys(s).sort(), ['bpm', 'current', 'parts', 'seconds', 'signature', 'status', 'swing', 'tempoChange']);
  assert.deepEqual(Object.keys(s.current).sort(), ['bar', 'partId', 'recent', 'step']);
  for (const p of s.parts) assert.deepEqual(Object.keys(p).sort(), ['bars', 'bpm', 'id', 'signature', 'swing']);
  // Nothing heard: nothing made.
  const quiet = createListener({ sampleRate: 44100 });
  quiet.feed(new Float32Array(44100 * 3));
  assert.deepEqual(quiet.finish(), { seconds: 3, parts: [], order: [], tempos: [] });
  assert.throws(() => createListener({}));
});

test('a tempo is a whole BPM in the app\'s range; a length that is no tempo is null, never a hang', () => {
  assert.equal(bpmFor(15 / 100), 100);
  assert.equal(bpmFor(15 / 200), 100);
  assert.equal(bpmFor(15 / 40), 80);
  assert.equal(bpmFor(15 / 99.6), 100);
  // A part with no bars left (merged into another at the end) has no tempo:
  // halving an endless BPM never reaches the range (2026-10-18).
  for (const s of [0, Infinity, null, NaN, -1]) assert.equal(bpmFor(s), null, String(s));
});

test('a snapshot after finish() answers at once, listing only the parts finish() kept, lettered A, B, C', () => {
  // A bass line and a pad with no drums: what it takes for hits merge into
  // one part at the end, which once left a part with no bars, whose tempo
  // the snapshot then halved forever.
  const sr = 44100;
  const song = render({ sampleRate: sr, lead: 0.5, seed: 4, sections: [{ bars: 10, bpm: 100, kick: [], snare: [], hat: [] }] });
  const listener = createListener({ sampleRate: sr });
  feedAll(listener, song.samples);
  const result = listener.finish();
  // Parts merged away leave no gap in the letters (this song once gave A, B, E).
  assert.ok(result.parts.length >= 2, 'this song makes parts to merge');
  assert.deepEqual(result.parts.map((p) => p.id), [...'ABCDEFGH'].slice(0, result.parts.length));
  for (const o of result.order) assert.ok(result.parts.some((p) => p.id === o.partId), o.partId);
  const s = listener.snapshot();
  assert.deepEqual(s.parts.map((p) => p.id), result.parts.map((p) => p.id));
  for (const p of s.parts) assert.ok(p.bpm >= MIN_BPM && p.bpm <= MAX_BPM);
  assert.equal(listener.finish(), result);
});

test('a whole song fed at once (a decoded file) is heard as if it streamed', () => {
  const sr = 44100;
  const song = render({ sampleRate: sr, lead: 0.5, seed: 2, sections: [{ bars: 6, bpm: 100, ...GROOVE.rock }, { bars: 6, bpm: 100, ...GROOVE.chorus }] });
  const once = createListener({ sampleRate: sr });
  once.feed(song.samples);
  const result = once.finish();
  assert.deepEqual(result.order, [{ partId: 'A', startBar: 1, bars: 6 }, { partId: 'B', startBar: 7, bars: 6 }]);
  assertBeat(result.parts[0], GROOVE.rock, 'A');
  assertBeat(result.parts[1], GROOVE.chorus, 'B');
  assert.ok(Math.abs(result.seconds - song.seconds) < 0.01);
});

test('it keeps up: a minute of song is listened to in a small share of a minute', () => {
  const { samples, seconds } = render({ sampleRate: 48000, seed: 1, sections: [{ bars: 30, bpm: 120, ...GROOVE.chorus }] });
  const listener = createListener({ sampleRate: 48000 });
  const t0 = performance.now();
  for (let i = 0; i < samples.length; i += 128) {
    listener.feed(samples.subarray(i, i + 128));
    if (i % 4800 === 0) listener.snapshot();
  }
  listener.finish();
  const used = (performance.now() - t0) / 1000;
  assert.ok(used < seconds * 0.2, `${used.toFixed(2)} s for ${seconds.toFixed(0)} s of song`);
});

// Made-up sounds that are not drums too: a tom, a cowbell, a clap.
function otherSounds(sr, r) {
  const n = (s) => Math.round(sr * s);
  const tom = Float32Array.from({ length: n(0.4) }, (_, i) => 0.8 * Math.sin(2 * Math.PI * (130 + 60 * Math.exp(-i / sr / 0.05)) * (i / sr)) * Math.exp(-i / sr / 0.2));
  const bell = Float32Array.from({ length: n(0.3) }, (_, i) => 0.3 * (Math.sign(Math.sin(2 * Math.PI * 540 * i / sr)) + Math.sign(Math.sin(2 * Math.PI * 800 * i / sr))) * Math.exp(-i / sr / 0.08));
  const clap = Float32Array.from({ length: n(0.2) }, (_, i) => {
    const t = i / sr;
    const bursts = [0, 0.01, 0.02].reduce((s, at) => s + (t >= at ? Math.exp(-(t - at) / 0.008) : 0), 0) + 0.5 * Math.exp(-t / 0.05);
    return 0.4 * (r() * 2 - 1) * bursts;
  });
  return { tom, bell, clap };
}

test('fingerprint and closestSound pick the right one of several sounds, whatever the level or sample rate', () => {
  const kit = (sr, seed) => {
    const d = drumSounds(sr, seed, { kick: { decay: 0.15 } });
    return { kick: d.kick[0], snare: d.snare[0], hat: d.hat[0], ...otherSounds(sr, rng(seed)) };
  };
  const candidates = Object.entries(kit(44100, 1)).map(([id, s]) => ({ id, print: fingerprint(s, 44100) }));
  for (const c of candidates) assert.equal(c.print.length, candidates[0].print.length);
  // Other takes of each sound: new noise, quieter, after a little silence, at 48 kHz.
  for (const [id, s] of Object.entries(kit(48000, 99))) {
    const take = new Float32Array(s.length + 2000);
    take.set(s.map((x) => 0.3 * x), 2000);
    assert.equal(closestSound(fingerprint(take, 48000), candidates), id, id);
  }
  // A long dusty kick and a short tight one are told apart by their decay.
  const kicks = (sr, seed) => {
    const long = drumSounds(sr, seed, { kick: { decay: 0.4, top: 40, bottom: 50 } }).kick[0];
    const short = drumSounds(sr, seed, { kick: { decay: 0.05, top: 90, bottom: 55 } }).kick[0];
    return { long, short };
  };
  const two = Object.entries(kicks(44100, 2)).map(([id, s]) => ({ id, print: fingerprint(s, 44100) }));
  for (const [id, s] of Object.entries(kicks(48000, 3))) assert.equal(closestSound(fingerprint(s, 48000), two), id);
  assert.equal(fingerprint(new Float32Array(1000), 44100), null);
  assert.equal(closestSound(null, candidates), null);
  assert.equal(closestSound(candidates[0].print, []), null);
});

test('each row\'s fingerprint, heard in the mix, is closest to the sound that played it', () => {
  const sr = 44100;
  const sounds = drumSounds(sr, 40);
  const { result } = (() => {
    const song = render({ sampleRate: sr, lead: 0.5, seed: 40, sounds, sections: [{ bars: 10, bpm: 100, ...GROOVE.rock }] });
    const listener = createListener({ sampleRate: sr });
    feedAll(listener, song.samples);
    return { result: listener.finish() };
  })();
  const others = otherSounds(sr, rng(41));
  const candidates = [
    ...['kick', 'snare', 'hat'].map((id) => ({ id, print: fingerprint(sounds[id][1], sr) })),
    ...Object.entries(others).map(([id, s]) => ({ id, print: fingerprint(s, sr) })),
  ];
  const { prints } = result.parts[0];
  for (const row of ['kick', 'snare', 'hat']) assert.equal(closestSound(prints[row], candidates), row, row);
});

test('bars compare by the cells that differ: two kicks more is another bar, a missed hat is not', () => {
  const bar = (kick, snare, hat) => [kick, snare, hat].map((on) => Uint8Array.from({ length: 16 }, (_, i) => (on.includes(i) ? 1 : 0)));
  const rock = bar([0, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.equal(barLikeness(rock, rock), 1);
  assert.ok(barLikeness(rock, bar([0, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12])) >= 0.8);
  assert.ok(barLikeness(rock, bar([0, 3, 8, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14])) < 0.8);
  assert.ok(barLikeness(rock, bar([0], [4, 8, 10, 12, 13, 14, 15], [0, 2])) < 0.5);
  assert.equal(barLikeness(bar([], [], []), bar([], [], [])), 1);
  // A hat inside a snare (that the ears may miss) is no difference.
  assert.equal(barLikeness(rock, bar([0, 8], [4, 12], [0, 2, 6, 8, 10, 14])), 1);
});

test('a steady hat stream gets its hat back where a snare hid it, and only there', () => {
  const cells = (snare, hat) => [new Uint8Array(16), Uint8Array.from({ length: 16 }, (_, i) => +snare.includes(i)), Uint8Array.from({ length: 16 }, (_, i) => +hat.includes(i))];
  const on = (c) => [...c[2]].flatMap((x, i) => (x ? [i] : []));
  assert.deepEqual(on(fillHats(cells([4, 12], [0, 2, 6, 8, 10, 14]), 16)), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(on(fillHats(cells([4, 12], [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15]), 16)), Array.from({ length: 16 }, (_, i) => i));
  // Hats off the snare, or a gap where no snare is, stay as they are.
  assert.deepEqual(on(fillHats(cells([4, 12], [2, 6, 10, 14]), 16)), [2, 6, 10, 14]);
  assert.deepEqual(on(fillHats(cells([4, 12], [0, 2, 6, 10, 14]), 16)), [0, 2, 6, 10, 14]);
});

test('the spectrum window is about 23 ms at every common sample rate', () => {
  assert.equal(fftSize(44100), 1024);
  assert.equal(fftSize(48000), 1024);
  assert.equal(fftSize(96000), 2048);
});
