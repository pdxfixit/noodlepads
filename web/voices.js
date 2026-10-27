// Silly voices. Each one renders a new AudioBuffer from a clip's (already
// trimmed) original with an OfflineAudioContext, so the original is never
// changed and a clip's voice can be swapped any time.

import { logEvent } from './log.js';
import { stretchChannels } from './stretch.js';
import { KINDS, kindById, cleanStep, stepKey, buildLive, tailOf, splitChain, isLive, noiseBuffer, NOISE_SEEDS } from './steps.js';
import { tweakSteps, tweakGain, tweaksKey, cleanTweaks } from './tweaks.js';
import { softLimit } from './loudness.js';
import { fadeGain } from './cuts.js';
import { rateOf } from './instruments.js';

export const VOICES = [
  { id: 'normal', name: 'Normal', emoji: '🙂' },
  { id: 'loud', name: 'Loud', emoji: '📢', amount: { label: 'Loudness', min: 1, max: 10, step: 1, default: 10, text: (n) => `${n} of 10` } },
  // `amount` is a per-clip slider setting: how many times higher or lower
  // (Chipmunk, Monster: tape speed, so pitch and length change together) or
  // faster or slower (Fast, Slow: same pitch). Fast past ~4x skips whole
  // chunks of the sound, so it turns choppy.
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', amount: { label: 'Pitch', min: 1.2, max: 4, step: 0.1, default: 1.7, word: 'higher' } },
  { id: 'fast', name: 'Fast', emoji: '⏩', amount: { label: 'Speed', min: 1.2, max: 8, step: 0.1, default: 1.6, word: 'faster' } },
  { id: 'slow', name: 'Slow', emoji: '🐢', amount: { label: 'Speed', min: 1.5, max: 20, step: 0.5, default: 6, word: 'slower' } },
  { id: 'monster', name: 'Monster', emoji: '👹', amount: { label: 'Pitch', min: 1.2, max: 4, step: 0.1, default: 1.6, word: 'lower' } },
  { id: 'robot', name: 'Robot', emoji: '🤖' },
  { id: 'stadium', name: 'Stadium', emoji: '🏟️' },
  { id: 'walkie', name: 'Walkie-talkie', emoji: '📻' },
  { id: 'underwater', name: 'Underwater', emoji: '🫧' },
  { id: 'alien', name: 'Alien', emoji: '👽' },
  { id: 'clones', name: 'Clones', emoji: '👯' },
  { id: 'stutter', name: 'Stutter', emoji: '🔁' },
  { id: 'backwards', name: 'Backwards', emoji: '🔄' },
];

// No rendered sound is longer than this, so a long uploaded file slowed right
// down can't run the browser out of memory. The rest is cut off.
const MAX_RENDER_SECONDS = 180;

// What a phone can play and hold. A chain multiplies its steps' speeds
// (Chipmunk 4x, then Higher +24 notes, then Fast 8x...), so a short sound
// could shrink to a few samples (silence) and a long one grow past memory.
// Every speed change is therefore fitted to the sound it is about to change:
// its result stays between MIN_RENDER_SECONDS and MAX_RENDER_SECONDS long
// (the sliders' own extremes, 4x tape, 8x faster and 20x slower, pass on any
// sound of a normal length: over 80 ms and under 9 s).
export const MIN_RENDER_SECONDS = 0.01;

// No render is longer than MAX_RENDER_SECONDS (an offline context is a
// buffer the size of what it renders: a runaway chain would ask for gigabytes).
export const renderSeconds = (seconds) => Math.min(MAX_RENDER_SECONDS, seconds);

// `rate` (tape speed, or a stretch's speed: 2 is twice as fast) fitted for a
// sound `seconds` long: no slower than fills MAX_RENDER_SECONDS, no faster
// than leaves MIN_RENDER_SECONDS. Not a number or not above 0 is 1.
export function playableRate(rate, seconds) {
  if (!(rate > 0) || !Number.isFinite(rate)) return 1;
  const slowest = Math.min(1, seconds / MAX_RENDER_SECONDS);
  const fastest = Math.max(1, seconds / MIN_RENDER_SECONDS);
  return Math.min(fastest, Math.max(slowest, rate));
}

// Playing a buffer faster than 2x folds what is above (sample rate / 2) / rate
// back down as a harsh fizz (aliasing). The cutoff, in Hz, to take that off
// first, or null when the speed is low enough to need none.
export function aliasCutoff(rate, sampleRate) {
  return rate > 2 ? Math.round((0.45 * sampleRate) / rate) : null;
}

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || VOICES[0];
}

// The amount voice `id` actually uses: `amount` clamped to its range, its
// default when unset, or null for a voice with no amount setting.
export function amountFor(id, amount) {
  const range = voiceById(id).amount;
  if (!range) return null;
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? Math.min(range.max, Math.max(range.min, n)) : range.default;
}

// "6× slower", for labels.
export function amountText(id, amount) {
  const s = amountFor(id, amount);
  if (s === null) return '';
  const range = voiceById(id).amount;
  return range.text ? range.text(s) : `${+s.toFixed(2)}× ${range.word}`;
}

// ── Chains ─────────────────────────────────────────────────────────────
// A sound's effects are a chain of steps, each rendered from what the one
// before made: "Chipmunk, then Stadium". A clip stores a chain of one voice
// the old way (`voice`, `amount`) and a longer one in `fx` as well, so an
// older copy of the app still plays its first voice.

export const MAX_CHAIN = 6;      // the most a stored chain keeps
export const SIMPLE_CHAIN = 3;   // the most simple mode stacks

// The kinds of step a chain can hold: a voice, or one of the building
// blocks in steps.js. Each kind cleans a stored step (known values, numbers
// clamped) or returns null to drop it.
export const STEPS = [
  {
    id: 'voice', name: 'Voice', emoji: '🎭',
    clean: (s) => (VOICES.some((v) => v.id === s.voice) ? { ...voiceStep(s.voice, s.amount), ...(s.off === true ? { off: true } : {}) } : null),
  },
  ...KINDS.map((k) => ({ id: k.id, name: k.name, emoji: k.emoji, clean: (s) => cleanStep(k, s) })),
];

// One voice as a step, its amount clamped (no amount for a voice without one).
export function voiceStep(voice, amount) {
  const a = amountFor(voice, amount);
  return a === null ? { type: 'voice', voice } : { type: 'voice', voice, amount: a };
}

// Keeps the steps this copy of the app knows, cleaned, at most `max` of them.
// Normal does nothing in a chain of other voices, so it is dropped there.
// Returns null when nothing usable is left. Untrusted input is fine.
export function cleanChain(fx, max = MAX_CHAIN) {
  if (!Array.isArray(fx)) return null;
  const steps = fx.slice(0, 50).map((s) => {
    const kind = s && typeof s === 'object' ? STEPS.find((k) => k.id === s.type) : null;
    return kind ? kind.clean(s) : null;
  }).filter(Boolean);
  const doing = steps.filter((s) => !(s.type === 'voice' && s.voice === 'normal'));
  const out = (doing.length ? doing : steps).slice(0, max);
  return out.length ? out : null;
}

// The chain a clip plays: its `fx`, or else its one voice.
export function chainOf(clip) {
  return cleanChain(clip?.fx) ?? [voiceStep(VOICES.some((v) => v.id === clip?.voice) ? clip.voice : 'normal', clip?.amount)];
}

// A short string naming what a clip sounds like, for the render cache. For a
// clip with one voice it is `voice:amount`, exactly as before chains existed;
// other steps read like "echo(3,0.25)". A clip's trim is added after it by
// audio.key ("@0.2-0.5"), and the sheet empties its previews when the trim
// moves, so a new trim always renders anew. The clip's tweaks (tweaks.js)
// come last, and add nothing when there are none.
export function recipeKey(clip) {
  return playingChain(chainOf(clip)).map((s) => (s.type === 'voice' ? `${s.voice}:${s.amount ?? null}` : stepKey(s))).join('>') + tweaksKey(clip?.tweaks);
}

// The steps of a chain that play: a muted one (🔇 on its layer, `off`) is
// left out; nothing left plays Normal.
export function playingChain(chain) {
  const on = (chain ?? []).filter((s) => !s.off);
  return on.length ? on : [voiceStep('normal')];
}

// The `fx` to store for a chain, or undefined when its one voice says it all.
export function storedFx(chain) {
  const steps = cleanChain(chain);
  return steps && (steps.length > 1 || steps[0].type !== 'voice' || steps[0].off) ? steps : undefined;
}

// What to store for a chain: its first voice as `voice` and `amount` (what an
// older copy of the app plays), and the whole chain as `fx` unless that one
// voice is all there is.
export function chainFields(chain) {
  const steps = cleanChain(chain) ?? [voiceStep('normal')];
  const first = steps.find((s) => s.type === 'voice') ?? voiceStep('normal');
  return { voice: first.voice, amount: first.amount, fx: storedFx(steps) };
}

// A step's emoji and name, for chips and labels: a voice's own, or its kind's.
export function stepLook(s) {
  const k = s?.type === 'voice' ? null : kindById(s?.type);
  if (!k) { const v = voiceById(s?.voice); return { emoji: v.emoji, name: v.name }; }
  return { emoji: k.emoji, name: k.name };
}

// What a step's numbers are set to: "3, 0.25 s".
export function stepText(s) {
  if (s?.type === 'voice') return amountText(s.voice, s.amount);
  const k = kindById(s?.type);
  return k ? (k.numsFor?.(s) ?? k.nums).map((n) => n.text(s[n.key])).join(', ') : '';
}

// What 🎲 Surprise me picks from, by family: [voice, lowest, highest amount].
// At most one voice comes from each family, so two never cancel out
// (Chipmunk then Monster) or pile up into mush, and amounts stay where they
// sound good and render quickly.
const SURPRISE = {
  pitch: [['chipmunk', 1.4, 2.6], ['monster', 1.3, 2.2], ['alien']],
  speed: [['fast', 1.3, 2.2], ['slow', 1.5, 3]],
  tone: [['robot'], ['walkie'], ['underwater']],
  copies: [['clones'], ['stutter'], ['backwards']],
  loud: [['loud', 6, 10]],
  room: [['stadium']],   // always last: the echo rings out after everything else
};

// A random chain of 1 to `max` voices from SURPRISE. `random` is
// Math.random, or a stand-in for tests.
export function surpriseChain(random = Math.random, max = SIMPLE_CHAIN) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const families = Object.keys(SURPRISE);
  const count = 1 + Math.min(max - 1, Math.floor(random() * max));
  const chosen = [];
  while (chosen.length < count) {
    const f = pick(families.filter((x) => !chosen.includes(x)));
    chosen.push(f);
  }
  chosen.sort((a, b) => (a === 'room') - (b === 'room'));
  return chosen.map((f) => {
    const [voice, lo, hi] = pick(SURPRISE[f]);
    if (lo === undefined) return voiceStep(voice);
    const step = voiceById(voice).amount.step;
    return voiceStep(voice, +(Math.round((lo + random() * (hi - lo)) / step) * step).toFixed(2));
  });
}

// What 🎲 picks from in Shape it (Advanced), after one or two voices: one
// building block, with each number from a range that sounds good.
const SHAPE_SURPRISE = [
  ['tone', { tone: [-0.8, 0.6] }],
  ['echo', { repeats: [2, 5], gap: [0.12, 0.4] }],
  ['room', { size: [0.2, 0.8] }],
  ['wobble', { speed: [2, 8], depth: [0.2, 0.7] }],
  ['crunch', { amount: [0.2, 0.6] }],
  ['ring', { metal: [30, 200] }],
];

export function surpriseShape(random = Math.random) {
  const voices = surpriseChain(random, 2);
  const [id, ranges] = SHAPE_SURPRISE[Math.min(SHAPE_SURPRISE.length - 1, Math.floor(random() * SHAPE_SURPRISE.length))];
  const step = {};
  for (const [key, [lo, hi]] of Object.entries(ranges)) step[key] = lo + random() * (hi - lo);
  return [...voices, cleanStep(kindById(id), step)];
}

// ⤢ Open a voice (Advanced): the building blocks that sound close to it,
// so a kid finds Stadium is "Make it echo, then Room size" and can change
// either. Null for Normal (nothing to open) and Clones (three copies at once
// is not a chain). Close, not identical: Walkie-talkie loses its beep.
const OPENED = {
  loud: (a) => [{ type: 'squash', amount: a / 10 }],
  chipmunk: (a) => [{ type: 'pitch', notes: Math.round(12 * Math.log2(a)) }],
  monster: (a) => [{ type: 'pitch', notes: -Math.round(12 * Math.log2(a)) }, { type: 'crunch', amount: 0.2 }],
  fast: (a) => [{ type: 'stretch', speed: a }],
  slow: (a) => [{ type: 'stretch', speed: 1 / a }],
  robot: () => [{ type: 'ring', metal: 48 }],
  stadium: () => [{ type: 'echo', repeats: 3, gap: 0.26 }, { type: 'room', size: 0.6 }],
  walkie: () => [{ type: 'tone', tone: 0.45 }, { type: 'crunch', amount: 0.7 }],
  underwater: () => [{ type: 'tone', tone: -0.75 }, { type: 'wobble', speed: 4.5, depth: 0.6 }],
  alien: () => [{ type: 'pitch', notes: 3 }, { type: 'wobble', speed: 9, depth: 0.5 }, { type: 'ring', metal: 190 }],
  stutter: () => [{ type: 'repeat', times: 3 }],
  backwards: () => [{ type: 'reverse' }],
};
export function openVoice(step) {
  const open = step?.type === 'voice' ? OPENED[step.voice] : null;
  return open ? open(amountFor(step.voice, step.amount)).map((s) => cleanStep(kindById(s.type), s)) : null;
}

// "Chipmunk 1.7× higher, then Stadium", for labels.
export function chainText(chain) {
  return (cleanChain(chain) ?? [voiceStep('normal')])
    .map((s) => [stepLook(s).name, stepText(s)].filter(Boolean).join(' '))
    .join(', then ');
}

// The steps a sound plays, in order, and the level it ends at: its chain
// (voices and Shape it steps) and its knobs (`tweaks`, tweaks.js). Knobs
// saved with `first` play before the chain (new sounds: the knobs sit above
// Shape it on the sheet); without it they play after it, as every sound saved
// before knobs did, so those keep sounding exactly the same. Pure, for tests.
export function renderPlan(chain, tweaks = null) {
  const extra = tweakSteps(tweaks);
  const voiced = playingChain(cleanChain(chain) ?? [voiceStep('normal')]);
  // Normal does nothing beside a knob, so it goes (it would keep the silent ends).
  const doing = voiced.filter((s) => !(s.type === 'voice' && s.voice === 'normal'));
  const first = cleanTweaks(tweaks)?.first === true;
  const steps = !extra.length ? voiced : first ? [...extra, ...doing] : [...doing, ...extra];
  return { steps, gain: tweakGain(tweaks) };
}

// Shape it's live loop (sheet.js) for a chain and its knobs: `head`,
// rendered once (with `headTweaks`), then `tail`, played live through nodes:
// the chain's steps from `tailIndex` on, turned down by `gain` at the end.
// Knobs that play first go in the head, so the loop is the whole sound.
// Knobs that play after the chain (sounds saved with old voices and knobs)
// join the tail when each of them can play live; otherwise null, and the
// sound renders when the slider is let go.
export function livePlan(chain, tweaks = null) {
  const split = splitChain(chain);
  const knobs = tweakSteps(tweaks);
  if (!knobs.length) return { ...split, headTweaks: null, gain: tweakGain(tweaks) };
  if (cleanTweaks(tweaks)?.first) return { ...split, headTweaks: cleanTweaks(tweaks), gain: 1 };
  if (!knobs.every(isLive)) return null;
  return { head: split.head, tail: [...split.tail, ...knobs], tailIndex: split.tailIndex, headTweaks: null, gain: tweakGain(tweaks) };
}

// Renders `buffer` through a chain, each voice in turn, normalized so every
// clip is about as loud, with the silent ends cut off, and its knobs
// (`tweaks`) where renderPlan puts them. Each render is timed in the event
// log, so a problem report from a phone says how slow voices are there.
// A preset's `level` in dB as a gain: 0 (or anything not a number at or
// under 0, down to -24) is 1.
export const presetGain = (db) => (typeof db === 'number' && db < 0 && db >= -24 ? 10 ** (db / 20) : 1);

// `presetLevel` (dB, never above 0) turns a preset down after its evening-out:
// boards.json's `level`, so every preset plays as loud as the middle of them
// all on a phone (Ben, 2026-10-23; tools/preset_loudness.py works them out).
export async function applyChain(buffer, chain, tweaks = null, presetLevel = 0) {
  const { steps, gain: voiceGain } = renderPlan(chain, tweaks);
  const gain = voiceGain * presetGain(presetLevel);
  const started = performance.now();
  let out = { buffer, duration: buffer.duration };
  // Audio with 🔊 Louder / 🔉 Quieter in it is already levelled (cuts.js
  // levelForGain): keep its level, only holding peaks under full scale.
  const level = buffer.keepLevel !== true;
  // Normal keeps the sound as it is, its length included: a beat or a DJ
  // take made into a sound must keep its silent tail to loop in time.
  for (const s of steps) out = finish(await renderStep(out.buffer, s), { trim: !(s.type === 'voice' && s.voice === 'normal'), level });
  // Quiet and Quietest (and a preset's `level`): every step is levelled to
  // the same peak, so softer is the finished sound turned down (a fresh
  // buffer from finish()).
  if (gain !== 1) for (let c = 0; c < out.buffer.numberOfChannels; c++) { const d = out.buffer.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= gain; }
  const amounts = steps.map((s) => s.amount ?? null);
  // Normal is only a copy, and every pad renders one at start-up: logging
  // those would push the useful lines out of the log. A ✦ special layer is
  // logged as the voice it belongs to (log-clean.js knows voices and steps).
  if (steps.length > 1 || steps[0].voice !== 'normal' || gain !== 1) logRender(steps.map((s) => s.voice ?? (s.type === 'special' ? SPECIAL_OF[s.special] : s.type)).join('>'), steps.length === 1 ? amounts[0] : amounts, buffer.duration, out.duration, performance.now() - started);
  return out;
}

// One step of a chain, rendered from `buffer`: a voice's recipe, a
// render-only step, or a live step played through its nodes offline.
function renderStep(buffer, s) {
  if (s.type === 'voice') return (RECIPES[s.voice] || RECIPES.normal)(buffer, amountFor(s.voice, s.amount));
  if (s.type === 'special') return (SPECIAL_RENDERS[s.special] || RECIPES.normal)(buffer);
  if (STEP_RENDERS[s.type]) return STEP_RENDERS[s.type](buffer, s);
  return renderLive(buffer, [s]);
}

// Plays `buffer` through live steps in an OfflineAudioContext, long enough
// for their echoes and rooms to ring out; `rate` is a tape speed for the source.
export function renderLive(buffer, steps, rate = 1) {
  const ctx = offline(buffer, buffer.duration / rate + tailOf(steps));
  const src = play(ctx, buffer, { rate });
  buildLive(ctx, src, steps).output.connect(ctx.destination);
  return ctx.startRendering();
}

// Renders `buffer` in one voice `id` (a chain of one).
export function applyVoice(buffer, id = 'normal', amount) {
  return applyChain(buffer, [voiceStep(id, amount)]);
}

// One 'render' entry: which voice (or chain), the seconds in and out, and how long it took.
function logRender(voice, amount, seconds, out, ms) {
  const round = (n) => Math.round(n * 100) / 100;
  logEvent('render', { voice, ...(amount === null ? {} : { amount }), seconds: round(seconds), out: round(out), ms: Math.round(ms) });
}

// ── Building blocks ────────────────────────────────────────────────────

function offline(buffer, seconds) {
  const rate = buffer.sampleRate;
  return new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, Math.ceil(renderSeconds(seconds) * rate)), rate);
}

// `buffer` ready to play at tape speed `rate`: for a fast one, with what would
// fold back (aliasing) taken off first by two lowpass filters in a row.
async function antiAlias(buffer, rate) {
  const hz = aliasCutoff(rate, buffer.sampleRate);
  if (hz === null) return buffer;
  const ctx = offline(buffer, buffer.duration);
  play(ctx, buffer).connect(filter(ctx, 'lowpass', hz, 0.7)).connect(filter(ctx, 'lowpass', hz, 0.7)).connect(ctx.destination);
  return ctx.startRendering();
}

function play(ctx, buffer, { rate = 1, at = 0, offset = 0, duration } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.start(at, offset, duration);
  return src;
}

function gain(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function filter(ctx, type, frequency, Q = 0.8) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function lfo(ctx, frequency, depth, target) {
  const osc = ctx.createOscillator();
  osc.frequency.value = frequency;
  const amount = gain(ctx, depth);
  osc.connect(amount).connect(target);
  osc.start();
  return osc;
}

// Multiplies the signal by a sine wave: the classic sci-fi robot sound.
function ringMod(ctx, frequency) {
  const g = gain(ctx, 0);
  lfo(ctx, frequency, 1, g.gain);
  return g;
}

// Pitch wobble from a delay line whose length is swept by an LFO.
function vibrato(ctx, speed, depthSeconds) {
  const d = ctx.createDelay(0.1);
  d.delayTime.value = 0.012;
  lfo(ctx, speed, depthSeconds, d.delayTime);
  return d;
}

function shaper(ctx, drive) {
  const s = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(drive * (i / (curve.length - 1) * 2 - 1));
  s.curve = curve;
  return s;
}

function feedbackDelay(ctx, seconds, feedback) {
  const d = ctx.createDelay(2);
  d.delayTime.value = seconds;
  const fb = gain(ctx, feedback);
  d.connect(fb).connect(d);
  return d;
}

function beep(ctx, frequency, at, seconds, level) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = frequency;
  const g = gain(ctx, level);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds);
}

// Monster's bass: the low end pushed up and a little drive, at tape speed
// `rate`. The Monster voice and the ✦ boom layer both play through it.
function boomChain(ctx, buffer, rate = 1) {
  const bass = filter(ctx, 'lowshelf', 220);
  bass.gain.value = 9;
  play(ctx, buffer, { rate }).connect(bass).connect(shaper(ctx, 1.6)).connect(ctx.destination);
}

// The walkie-talkie around a sound: a burst of static before, a roger beep
// and a burst of static after. `through(src, ctx)` plays the sound (`src`)
// into the destination: Tinny and crunchy for the voice, as it is for the ✦
// layer (the knobs make that one tinny).
function walkieAround(buffer, through) {
  const lead = 0.14;
  const ctx = offline(buffer, lead + buffer.duration + 0.45);
  const staticBurst = (at, seconds, seed) => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, seconds, 8, seed, ctx.destination.channelCount);
    n.connect(filter(ctx, 'bandpass', 2200, 0.7)).connect(gain(ctx, 0.35)).connect(ctx.destination);
    n.start(at);
  };
  staticBurst(0, lead, NOISE_SEEDS.staticLead);
  through(play(ctx, buffer, { at: lead }), ctx);
  const end = lead + buffer.duration;
  beep(ctx, 1250, end + 0.04, 0.13, 0.12);
  staticBurst(end + 0.18, 0.2, NOISE_SEEDS.staticTail);
  return ctx.startRendering();
}

// Plays `buffer` `speed` times faster without changing its pitch: the
// stretch in stretch.js, run in a Worker when the browser has one so the page
// stays smooth, and on the page otherwise (or if the worker fails).
async function timeStretch(buffer, wanted) {
  const speed = playableRate(wanted, buffer.duration);
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let out = null;
  if (stretcher.usable()) {
    try {
      out = await stretcher.run(channels.map((d) => d.slice()), rate, speed);   // copies: the original stays cached here
    } catch (err) {
      console.error('The stretch worker failed; stretching on the page instead:', err);
      stretcher.broken = true;
    }
  }
  out ??= stretchChannels(channels, rate, speed, MAX_RENDER_SECONDS);
  const result = new AudioBuffer({ length: out[0].length, numberOfChannels: out.length, sampleRate: rate });
  out.forEach((d, c) => result.copyToChannel(d, c));
  return result;
}

// The one stretch worker, started on first use. Each job has an id, so
// answers find their caller whatever order they come back in.
const stretcher = {
  worker: null,
  broken: false,
  next: 1,
  jobs: new Map(),   // id -> {resolve, reject}
  usable() { return !this.broken && typeof Worker === 'function'; },
  start() {
    this.worker = new Worker(new URL('./stretch-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data.id);
      this.jobs.delete(data.id);
      if (data.error) job?.reject(new Error(data.error));
      else job?.resolve(data.channels);
    };
    this.worker.onerror = (e) => {   // the worker didn't load: every job waiting fails over to the page
      e.preventDefault?.();
      this.broken = true;
      for (const job of this.jobs.values()) job.reject(new Error(e.message || 'stretch worker error'));
      this.jobs.clear();
    };
  },
  run(channels, rate, speed) {
    if (!this.worker) this.start();
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      this.worker.postMessage({ id, channels, rate, speed, maxSeconds: MAX_RENDER_SECONDS }, channels.map((d) => d.buffer));
    });
  },
};

// ── Recipes ────────────────────────────────────────────────────────────

const RECIPES = {
  // A copy, because finish() scales in place and the original is cached.
  async normal(buffer) {
    const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
    for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c), c);
    return out;
  },

  // Every voice is already scaled to the same peak by finish(), so turning
  // the volume up can't make a clip louder. This squashes the quiet parts up to
  // the loud ones and clips the edges, so the whole sound sits near the peak:
  // how ads are made loud. The peak (and so the device's own limit) is unchanged.
  // `level` 1-10: 10 is as loud as a clip can get (squashed almost flat
  // against the peak); lower levels squash and clip less. Pushing past 10 only
  // adds crunch, which sounds no louder, so 10 is the top.
  async loud(buffer, level) {
    const t = ((level - 1) / 9) ** 2;  // squared, so the steps sound about even
    const ctx = offline(buffer, buffer.duration + 0.1);
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -6 - 30 * t;
    squash.knee.value = 6;
    squash.ratio.value = 1 + 19 * t;
    squash.attack.value = 0.002;
    squash.release.value = 0.12;
    play(ctx, buffer)
      .connect(gain(ctx, 1 + 3 * t))
      .connect(squash)
      .connect(gain(ctx, 1 + 5 * t))
      .connect(shaper(ctx, 0.3 + 1.9 * t))
      .connect(ctx.destination);
    return ctx.startRendering();
  },

  // Sped-up tape: higher and faster.
  async chipmunk(buffer, amount) {
    const rate = playableRate(amount, buffer.duration);
    const source = await antiAlias(buffer, rate);
    const ctx = offline(source, source.duration / rate);
    play(ctx, source, { rate }).connect(ctx.destination);
    return ctx.startRendering();
  },

  // Faster but the same pitch: you, in a hurry. Chipmunk is faster and higher.
  async fast(buffer, amount) {
    return timeStretch(buffer, amount);
  },

  // Slower but the same pitch: the opposite of Fast. Monster is slower and lower.
  async slow(buffer, amount) {
    return timeStretch(buffer, 1 / amount);
  },

  // Slowed-down tape, with the bass pushed up.
  async monster(buffer, amount) {
    const rate = playableRate(1 / amount, buffer.duration);
    const ctx = offline(buffer, buffer.duration / rate + 0.1);
    boomChain(ctx, buffer, rate);
    return ctx.startRendering();
  },

  async robot(buffer) {
    const ctx = offline(buffer, buffer.duration + 0.2);
    const src = play(ctx, buffer);
    const ring = ringMod(ctx, 48);
    const comb = feedbackDelay(ctx, 0.0065, 0.55);
    src.connect(ring);
    ring.connect(ctx.destination);
    ring.connect(comb).connect(gain(ctx, 0.6)).connect(ctx.destination);
    return ctx.startRendering();
  },

  // Echo plus a big reverb tail: the announcer at a ball game.
  async stadium(buffer) {
    const ctx = offline(buffer, buffer.duration + 2.6);
    const src = play(ctx, buffer);
    src.connect(gain(ctx, 0.9)).connect(ctx.destination);
    const echo = feedbackDelay(ctx, 0.26, 0.42);
    src.connect(echo).connect(filter(ctx, 'lowpass', 2800)).connect(gain(ctx, 0.5)).connect(ctx.destination);
    const hall = ctx.createConvolver();
    hall.buffer = noiseBuffer(ctx, 2.2, 2.6, NOISE_SEEDS.hall, ctx.destination.channelCount);
    src.connect(hall).connect(gain(ctx, 0.12)).connect(ctx.destination);
    return ctx.startRendering();
  },

  // Tinny and crunchy, with a burst of static and a roger beep.
  walkie: (buffer) => walkieAround(buffer, (src, ctx) => src
    .connect(filter(ctx, 'highpass', 650))
    .connect(filter(ctx, 'lowpass', 2600))
    .connect(gain(ctx, 3))
    .connect(shaper(ctx, 3))
    .connect(gain(ctx, 0.6))
    .connect(ctx.destination)),

  async underwater(buffer) {
    const ctx = offline(buffer, buffer.duration + 0.2);
    const muffle = filter(ctx, 'lowpass', 520, 6);
    lfo(ctx, 2.5, 260, muffle.frequency);
    play(ctx, buffer).connect(muffle).connect(vibrato(ctx, 4.5, 0.004)).connect(gain(ctx, 1.4)).connect(ctx.destination);
    return ctx.startRendering();
  },

  async alien(buffer) {
    const rate = 1.22;
    const ctx = offline(buffer, buffer.duration / rate + 0.2);
    const wobble = vibrato(ctx, 9, 0.0035);
    play(ctx, buffer, { rate }).connect(wobble);
    wobble.connect(gain(ctx, 0.6)).connect(ctx.destination);
    wobble.connect(ringMod(ctx, 190)).connect(gain(ctx, 0.7)).connect(ctx.destination);
    return ctx.startRendering();
  },

  // Three of you at once: low, normal and high, slightly out of step.
  async clones(buffer) {
    const voices = [{ rate: 0.74, at: 0 }, { rate: 1, at: 0.03 }, { rate: 1.38, at: 0.06 }];
    const ctx = offline(buffer, buffer.duration / 0.74 + 0.1);
    for (const v of voices) play(ctx, buffer, v).connect(gain(ctx, 0.55)).connect(ctx.destination);
    return ctx.startRendering();
  },

  // Y-y-y-you lose: repeats the first syllable-ish chunk before the whole line.
  stutter: (buffer) => stutter(buffer, 3),
  async backwards(buffer) {
    const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    return out;
  },
};

// Repeats the first syllable-ish chunk `repeats` times, then plays the whole sound.
function stutter(buffer, repeats) {
  const chunk = Math.min(0.22, Math.max(0.1, buffer.duration * 0.2));
  const gap = 0.035;
  const ctx = offline(buffer, repeats * (chunk + gap) + buffer.duration + 0.05);
  let t = 0;
  for (let i = 0; i < repeats; i++) {
    play(ctx, buffer, { at: t, duration: chunk }).connect(ctx.destination);
    t += chunk + gap;
  }
  play(ctx, buffer, { at: t }).connect(ctx.destination);
  return ctx.startRendering();
}

// The ✦ special layers (tweaks.js SPECIALS): what Clones, Walkie-talkie
// and Monster do that no knob can. The knobs do the rest of each voice.
const SPECIAL_RENDERS = {
  clones: (buffer) => RECIPES.clones(buffer),
  // Monster's boom: the bass pushed up and a little drive, at the same speed
  // (the knobs make it deeper and slower).
  async boom(buffer) {
    const ctx = offline(buffer, buffer.duration + 0.1);
    boomChain(ctx, buffer);
    return ctx.startRendering();
  },
  // The walkie-talkie's burst of static before, and its roger beep and static
  // after, around the sound as it is (Muffled ↔ Bright and Crunch make it tinny).
  walkie: (buffer) => walkieAround(buffer, (src, ctx) => src.connect(ctx.destination)),
};
// The voice each special layer belongs to, for the event log.
const SPECIAL_OF = { clones: 'clones', boom: 'monster', walkie: 'walkie' };

// The steps that can't play live: each renders in one go.
const STEP_RENDERS = {
  // Higher or lower. Tape: pitch and length change together. Keep length:
  // stretched first, by as much as the tape will shorten it, then the tape.
  async pitch(buffer, s) {
    const rate = playableRate(rateOf(s.notes), buffer.duration);
    if (!s.keep) return renderLive(await antiAlias(buffer, rate), [], rate);
    return renderLive(await antiAlias(await timeStretch(buffer, 1 / rate), rate), [], rate);
  },
  stretch: (buffer, s) => timeStretch(buffer, s.speed),
  reverse: (buffer) => RECIPES.backwards(buffer),
  repeat: (buffer, s) => stutter(buffer, s.times),
  // Fade in over the first `in` of the sound and out over its last `out`
  // (parts of its length). Where the two overlap, the lower one wins.
  async fade(buffer, s) {
    const out = await RECIPES.normal(buffer);
    const n = out.length;
    const fin = Math.round(s.in * n), fout = Math.round(s.out * n);
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] *= fadeGain(i, n, fin, fout);
    }
    return out;
  },
};

// Loudness-match (peak 0.9) and drop the silent tail an effect leaves behind.
// After a voice, the quiet at either end goes, more strictly than on load: a
// stretched or echoing sound otherwise carries a long, near-silent start or
// tail (Ben, 2026-10-10). Quiet is below FINISH_QUIET of the peak; a little
// is kept before the sound, and the end fades out so the cut never clicks.
export const FINISH_QUIET = 0.008;  // about -42 dB below the peak: echoes and room tails stay (a kid found -34 dB too sharp)
const LEAD_SECONDS = 0.03;
const TAIL_SECONDS = 0.15;

// The audible span of some channels (Float32Arrays): the first and last
// sample above `quiet` of the peak, widened by the pads, as [from, to).
export function audibleSpan(channels, rate, quiet = FINISH_QUIET, lead = LEAD_SECONDS, tail = TAIL_SECONDS) {
  const n = channels[0]?.length ?? 0;
  let peak = 0;
  for (const d of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak === 0) return { from: 0, to: n };
  const floor = peak * quiet;
  let first = n, last = -1;
  for (const d of channels) {
    for (let i = 0; i < n; i++) if (Math.abs(d[i]) > floor) { first = Math.min(first, i); break; }
    for (let i = n - 1; i >= 0; i--) if (Math.abs(d[i]) > floor) { last = Math.max(last, i); break; }
  }
  if (last < first) return { from: 0, to: n };
  return { from: Math.max(0, first - Math.round(lead * rate)), to: Math.min(n, last + 1 + Math.round(tail * rate)) };
}

// softLimit (loudness.js) is the soft ceiling for audio that keeps its own level.
export { softLimit };

function finish(buffer, { trim = true, level = true } = {}) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (const d of channels) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak === 0) return { buffer, duration: buffer.duration };
  const { from, to } = trim ? audibleSpan(channels, buffer.sampleRate) : { from: 0, to: buffer.length };
  const length = Math.max(1, to - from);
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  const scale = level ? 0.9 / peak : 1;
  const fade = trim ? Math.min(length, Math.round(TAIL_SECONDS * buffer.sampleRate)) : 0;
  channels.forEach((d, c) => {
    const o = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const v = d[from + i] * scale * (i >= length - fade ? (length - i) / fade : 1);
      o[i] = level ? v : softLimit(v);
    }
  });
  if (!level) out.keepLevel = true;
  return { buffer: out, duration: out.duration };
}
