// The building blocks of a sound's chain, beside the voices: Higher or
// lower, Muffled ↔ Bright, Make it echo, and the rest (sound design, "Shape
// it"). Each kind declares its numbers (range, default, how they read), so
// a stored step is cleaned the same way everywhere, and says whether it is
// *live*: built from Web Audio nodes, so a slider can move it while the sound
// plays. The same build() makes the live preview and the saved render, so
// what you hear while dragging is what gets saved.
//
// Render-only kinds (stretch, backwards, stutter, fade) are rendered in
// voices.js, which has the stretch. This module needs no other module.

const round = (v, step) => +(Math.round(v / step) * step).toFixed(4);
const times = (v) => `${+v.toFixed(2)}×`;
const notes = (n) => (n === 0 ? 'no change' : `${Math.abs(n)} note${Math.abs(n) === 1 ? '' : 's'} ${n > 0 ? 'up' : 'down'}`);

// A number a step holds. `log` sliders move evenly in ratio (½× to 2× is as
// far as 1× to 4×), for speeds and frequencies.
const num = (key, label, min, max, step, def, text, log = false) => ({ key, label, min, max, step, default: def, text, log });

// Echo's 🥁 On the beat: how far apart, as note lengths of a beat (a quarter
// note). The tempo is the open beat's when the switch was turned on, kept on
// the step, so the sound renders the same later. `key` is its key's label.
export const ECHO_NOTES = [
  { beats: 0.25, name: '1/16 note', key: '1/16' },
  { beats: 0.5, name: '1/8 note', key: '1/8' },
  { beats: 0.75, name: 'dotted 1/8', key: 'dotted 1/8' },
  { beats: 1, name: '1/4 note', key: '1/4' },
  { beats: 2, name: '1/2 note', key: '1/2' },
];

export const KINDS = [
  {
    id: 'pitch', name: 'Higher or lower', emoji: '🎚️',
    nums: [num('notes', 'How much', -24, 24, 1, 3, notes)],
    flags: [{ key: 'keep', label: 'Keep length', default: false }],
    // Renders: it changes the source's speed (or stretches it), not a node's setting.
    live: () => false,
  },
  {
    id: 'stretch', name: 'Faster or slower, same voice', emoji: '⏩',
    nums: [num('speed', 'How much', 0.05, 8, 0.01, 1.5, (v) => (v >= 1 ? `${times(v)} faster` : `${times(1 / v)} slower`), true)],
    live: () => false,
  },
  {
    id: 'tone', name: 'Muffled ↔ Bright', emoji: '🧣',
    nums: [num('tone', 'Muffled ↔ Bright', -1, 1, 0.05, -0.5, (v) => (Math.abs(v) < 0.03 ? 'plain' : v < 0 ? `muffled ${Math.round(-v * 100)}%` : `bright ${Math.round(v * 100)}%`))],
    live: () => true,
    tail: () => 0.05,
    build(ctx, input, s) {
      const lp = ctx.createBiquadFilter();
      const hp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      hp.type = 'highpass';
      lp.Q.value = hp.Q.value = 0.7;
      input.connect(lp).connect(hp);
      const set = (step, at) => {
        const t = step.tone;
        // Muffled: the top comes down to 300 Hz. Bright: the bottom goes up to 4 kHz.
        param(lp.frequency, t < 0 ? 20000 * (300 / 20000) ** -t : 20000, ctx, at);
        param(hp.frequency, t > 0 ? 20 * (4000 / 20) ** t : 10, ctx, at);
      };
      set(s);
      return { output: hp, set };
    },
  },
  {
    id: 'echo', name: 'Make it echo', emoji: '🔁',
    nums: [
      num('repeats', 'Echoes', 1, 8, 1, 3, (v) => `${v}`),
      num('gap', 'How far apart', 0.05, 1, 0.01, 0.25, (v) => `${v.toFixed(2)} s`),
      { ...num('note', 'How far apart', 0, ECHO_NOTES.length - 1, 1, 1, (v) => ECHO_NOTES[v].name), keyText: (v) => ECHO_NOTES[v].key },
      num('bpm', 'Tempo', 60, 180, 1, 100, (v) => `${v} BPM`),
    ],
    flags: [{ key: 'beat', label: '🥁 On the beat', default: false }],
    // On the beat, the slider picks a note length and the gap follows it;
    // otherwise it is seconds. The tempo has no slider: it comes from the beat.
    numsFor: (s) => (s.beat ? [kindById('echo').nums[0], { ...kindById('echo').nums[2], text: (v) => `${ECHO_NOTES[v].name} at ${s.bpm} BPM` }] : kindById('echo').nums.slice(0, 2)),
    // Off the beat, an echo is stored (and keyed) exactly as before the switch existed.
    derive(s) {
      if (s.beat) s.gap = Math.min(1, Math.max(0.05, Math.round((60 / s.bpm) * ECHO_NOTES[s.note].beats * 1000) / 1000));
      else { delete s.note; delete s.bpm; delete s.beat; }
    },
    key: (s) => (s.beat ? `echo(${s.repeats},${s.gap},beat,${s.note},${s.bpm})` : `echo(${s.repeats},${s.gap})`),
    live: () => true,
    tail: (s) => s.gap * s.repeats + 0.3,
    build(ctx, input, s) {
      const out = ctx.createGain();
      const delay = ctx.createDelay(1.5);
      const fb = ctx.createGain();
      const warm = ctx.createBiquadFilter();   // each echo a little duller, like a real one
      warm.type = 'lowpass';
      warm.frequency.value = 5000;
      const wet = ctx.createGain();
      wet.gain.value = ECHO_WET;
      input.connect(out);
      input.connect(delay);
      delay.connect(warm).connect(fb).connect(delay);
      warm.connect(wet).connect(out);
      const set = (step, at) => {
        param(delay.delayTime, step.gap, ctx, at);
        param(fb.gain, echoFeedback(step.repeats), ctx, at);
      };
      set(s);
      return { output: out, set };
    },
  },
  {
    id: 'room', name: 'Room size', emoji: '🏛️',
    nums: [num('size', 'Small room → cave', 0, 1, 0.05, 0.5, (v) => (v < 0.25 ? 'small room' : v < 0.5 ? 'hall' : v < 0.8 ? 'big hall' : 'cave'))],
    live: () => true,
    tail: (s) => 0.3 + 3.5 * s.size,
    build(ctx, input, s) {
      const out = ctx.createGain();
      input.connect(out);
      // A new size needs a new echo tail, so it fades in over the old one.
      let wet = null, size = null;
      const set = (step, at) => {
        if (size !== null && Math.abs(step.size - size) < 0.04) return;
        size = step.size;
        const conv = ctx.createConvolver();
        conv.buffer = roomTail(ctx, 0.3 + 3.5 * size, 6 - 4.5 * size);
        const g = ctx.createGain();
        const level = 0.12 + 0.3 * size;
        input.connect(conv).connect(g).connect(out);
        if (wet) {
          const old = wet;
          g.gain.value = 0;
          param(g.gain, level, ctx, at);
          param(old.gain, 0, ctx, at);
          setTimeout?.(() => { try { old.disconnect(); } catch { /* gone */ } }, 300);
        } else g.gain.value = level;
        wet = g;
      };
      set(s);
      return { output: out, set };
    },
  },
  {
    id: 'crunch', name: 'Crunch', emoji: '🔥',
    nums: [num('amount', 'How much', 0, 1, 0.05, 0.5, (v) => `${Math.round(v * 100)}%`)],
    live: () => true,
    tail: () => 0.02,
    build(ctx, input, s) {
      const shaper = ctx.createWaveShaper();
      const level = ctx.createGain();
      input.connect(shaper).connect(level);
      const set = (step) => {
        const drive = 1 + 40 * step.amount ** 2;
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(drive * (i / (curve.length - 1) * 2 - 1)) / Math.tanh(drive);
        shaper.curve = curve;
        level.gain.value = 1 - 0.4 * step.amount;   // crunch is louder on the ear at the same peak
      };
      set(s);
      return { output: level, set };
    },
  },
  {
    id: 'wobble', name: 'Wobble', emoji: '🌊',
    nums: [
      num('speed', 'How fast', 0.5, 12, 0.5, 5, (v) => `${v} a second`),
      num('depth', 'How much', 0, 1, 0.05, 0.5, (v) => `${Math.round(v * 100)}%`),
    ],
    live: () => true,
    tail: () => 0.05,
    build(ctx, input, s) {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = 0.012;
      const osc = ctx.createOscillator();
      const depth = ctx.createGain();
      osc.connect(depth).connect(d.delayTime);
      osc.start();
      input.connect(d);
      const set = (step, at) => {
        param(osc.frequency, step.speed, ctx, at);
        param(depth.gain, 0.006 * step.depth, ctx, at);
      };
      set(s);
      return { output: d, set };
    },
  },
  {
    id: 'ring', name: 'Robot', emoji: '🤖',
    nums: [num('metal', 'How metal', 20, 600, 1, 60, (v) => `${Math.round(v)}`, true)],
    live: () => true,
    tail: () => 0.02,
    build(ctx, input, s) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.connect(g.gain);
      osc.start();
      input.connect(g);
      const set = (step, at) => param(osc.frequency, step.metal, ctx, at);
      set(s);
      return { output: g, set };
    },
  },
  {
    id: 'squash', name: 'Louder everywhere', emoji: '📢',
    nums: [num('amount', 'How much', 0, 1, 0.05, 0.6, (v) => `${Math.round(v * 100)}%`)],
    live: () => true,
    tail: () => 0.15,
    build(ctx, input, s) {
      const c = ctx.createDynamicsCompressor();
      c.knee.value = 6;
      c.attack.value = 0.003;
      c.release.value = 0.12;
      const makeup = ctx.createGain();
      input.connect(c).connect(makeup);
      const set = (step, at) => {
        param(c.threshold, -6 - 34 * step.amount, ctx, at);
        param(c.ratio, 1 + 15 * step.amount, ctx, at);
        param(makeup.gain, 1 + 4 * step.amount, ctx, at);
      };
      set(s);
      return { output: makeup, set };
    },
  },
  {
    id: 'fade', name: 'Fade in / fade out', emoji: '📐',
    nums: [
      num('in', 'Fade in', 0, 1, 0.05, 0.3, (v) => (v ? `${Math.round(v * 100)}% of it` : 'none')),
      num('out', 'Fade out', 0, 1, 0.05, 0.3, (v) => (v ? `${Math.round(v * 100)}% of it` : 'none')),
    ],
    live: () => false,
  },
  { id: 'reverse', name: 'Backwards', emoji: '🔄', nums: [], live: () => false },
  {
    id: 'repeat', name: 'Stutter', emoji: '🔂',
    nums: [num('times', 'Repeats', 1, 6, 1, 3, (v) => `${v}`)],
    live: () => false,
  },
];

export const kindById = (id) => KINDS.find((k) => k.id === id);

// Make it echo's mix: each echo comes back at ECHO_WET of what went in, and
// after `repeats` echoes the sound is down to about a tenth.
const ECHO_WET = 0.6;
const echoFeedback = (repeats) => 0.1 ** (1 / repeats);

// The gain a live loop plays its live steps at, after `seconds` of sound,
// so that the echoes piling on the sound (in step with it: the most they can
// add) peak no higher than the sound alone. The saved render evens a sound
// out after every step; a live loop cannot, so without this a held note with
// 8 echoes played 10 dB louder while dragging than once let go. 1 when no
// echo comes back while the sound still plays (sound.md, Seams).
export function liveTrim(steps, seconds) {
  let trim = 1;
  for (const s of steps) {
    if (s.type !== 'echo' || s.off) continue;
    const back = Math.min(s.repeats, Math.max(0, Math.ceil(seconds / s.gap) - 1));   // echoes heard over the sound
    if (!back) continue;
    const fb = echoFeedback(s.repeats);
    trim /= 1 + (ECHO_WET * (1 - fb ** back)) / (1 - fb);
  }
  return trim;
}

// Moves an AudioParam to `value`: smoothed over about 20 ms while a sound
// plays (at = the audio clock now), or set outright before a render starts.
function param(p, value, ctx, at) {
  if (at === undefined) { p.value = value; return; }
  p.cancelScheduledValues?.(at);
  if (p.setTargetAtTime) p.setTargetAtTime(value, at, 0.02);
  else p.value = value;
}

// A small seeded random generator (mulberry32): numbers in [0, 1), the same
// run for the same seed on every device and every load.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Noise that dies away: `frames` samples at `rate`, starting at full volume
// and falling off faster for a bigger `decay` (per second). Seeded, so a
// reverb tail or a burst of static is the same every time it is made: a
// sound sounds the same on every load and device, and a test can check it.
export function decayingNoise(frames, rate, decay, seed) {
  const random = seededRandom(seed);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = (random() * 2 - 1) * Math.exp(-decay * i / rate);
  return out;
}

// The same noise as a buffer on `ctx`. Each channel gets its own run (a
// different seed), so the two ears are not the same noise.
export function noiseBuffer(ctx, seconds, decay, seed, channels = 2) {
  const frames = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const b = ctx.createBuffer(channels, frames, ctx.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const noise = decayingNoise(frames, ctx.sampleRate, decay, seed ^ Math.imul(c + 1, 0x9E3779B1));
    if (b.copyToChannel) b.copyToChannel(noise, c); else b.getChannelData(c).set(noise);
  }
  return b;
}

// Each place that makes noise has its own seed, so the room's tail and the
// stadium's hall are not the same noise.
export const NOISE_SEEDS = { room: 0x0ACE, hall: 0x5AD1, staticLead: 0x57A1, staticTail: 0x57A2 };

// A room's echo tail: noise that dies away over `seconds`, faster for a bigger `decay`.
const roomTail = (ctx, seconds, decay) => noiseBuffer(ctx, seconds, decay, NOISE_SEEDS.room, 2);

// A stored step of kind `kind` cleaned: every number clamped to its range
// and rounded to its step, its default where missing; flags true or false.
export function cleanStep(kind, s) {
  const out = { type: kind.id };
  for (const n of kind.nums) {
    const raw = s?.[n.key];   // a number, or a slider's string
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    out[n.key] = Number.isFinite(v) ? Math.min(n.max, Math.max(n.min, round(v, n.step))) : n.default;
  }
  for (const f of kind.flags ?? []) out[f.key] = s?.[f.key] === true;
  kind.derive?.(out);
  // 🔇 on its layer: kept in the chain, not played (voices.js renderPlan).
  if (s?.off === true) out.off = true;
  return out;
}

// A new step of kind `id`, at its defaults.
export const newStep = (id) => cleanStep(kindById(id), {});

// A step that is not a voice, as a short key for the render cache: "echo(3,0.25)".
export function stepKey(s) {
  const kind = kindById(s.type);
  if (kind.key) return kind.key(s);
  return `${s.type}(${[...kind.nums.map((n) => s[n.key]), ...(kind.flags ?? []).map((f) => (s[f.key] ? 1 : 0))].join(',')})`;
}

// Is step `s` live (moved by sliders while it plays)? Voices never are.
export const isLive = (s) => s.type !== 'voice' && !s.off && !!kindById(s.type)?.live(s);

// Splits a chain for the live preview: `head`, rendered once, then `tail`,
// the run of live steps at the end, played live through nodes. `tailIndex`
// is where `tail` starts in the chain.
export function splitChain(chain) {
  let i = chain.length;
  while (i > 0 && isLive(chain[i - 1])) i -= 1;
  return { head: chain.slice(0, i), tail: chain.slice(i), tailIndex: i };
}

// Builds `steps` (all live) after `input` on `ctx` (live or offline).
// Returns the last node, the seconds they ring on for, and set(i, step, at?) to
// move step i's sliders while it plays.
export function buildLive(ctx, input, steps) {
  let node = input;
  const built = steps.map((s) => {
    const b = kindById(s.type).build(ctx, node, s);
    node = b.output;
    return b;
  });
  return {
    output: node,
    tail: steps.reduce((t, s) => t + kindById(s.type).tail(s), 0),
    set: (i, s, at = ctx.currentTime) => built[i]?.set(s, at),
  };
}

// Seconds the live steps ring on after the sound ends.
export const tailOf = (steps) => steps.reduce((t, s) => t + (kindById(s.type)?.tail?.(s) ?? 0), 0);
