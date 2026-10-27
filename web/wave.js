// The wave in the sound sheet: a sound drawn as bars, which light up behind a
// line that sweeps across while it plays. A kid sees that sound has a shape
// and a length, and that a voice changes both (Slow stretches it, Stadium
// adds a tail). Drawing only: peaks() in audio.js does the math.

import { audio, peaks } from './audio.js';

const BAR = 3;   // CSS px per bar
const GAP = 1;   // CSS px between bars
export const WAVE_PAD = 10;  // CSS px kept clear at each end, inside the rounded corners (chop.js places its handles by it)
const PAD = WAVE_PAD;
const MIN_SWEEP = 0.5;   // seconds: a loop shorter than this is held lit, not swept
const stillWanted = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createWave(canvas) {
  let buffer = null;     // what is drawn
  let span = 0;          // seconds the full width stands for
  let cache = { buffer: null, columns: 0, values: null };
  let raf = 0;
  let kept = null;       // {start, end} seconds: the bars outside it are cut off (trim), drawn grey
  let picked = null;     // {start, end} seconds: the part picked in the wave editor, banded
  let colors = null;     // {lit, cut, head}: read from the page once per sound shown or followed, not per frame

  function readColors() {
    const style = getComputedStyle(canvas);
    const lit = style.color;
    colors = { lit, cut: style.getPropertyValue('--wave-cut').trim() || lit, head: style.getPropertyValue('--wave-head').trim() || lit };
  }

  function draw(progress = 0) {
    const g = canvas.getContext?.('2d');
    if (!g || !buffer) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    g.clearRect(0, 0, w, h);

    // The sound fills the width only when it is the longest one in play, so
    // a sound made shorter or longer shows it.
    const used = Math.min(1, buffer.duration / (span || buffer.duration));
    const pad = PAD * dpr;
    const inner = Math.max(1, w - 2 * pad);
    const step = (BAR + GAP) * dpr;
    const columns = Math.max(1, Math.floor((inner * used) / step));
    if (cache.buffer !== buffer || cache.columns !== columns) {
      const values = peaks(buffer, columns);
      const top = Math.max(...values) || 1;   // the loudest part reaches the top
      cache = { buffer, columns, values: values.map((v) => v / top) };
    }
    if (!colors) readColors();
    const { lit, cut } = colors;
    const head = pad + progress * used * inner;
    // The part picked in the wave editor: a band behind its bars.
    if (picked) {
      const x0 = pad + (picked.start / buffer.duration) * used * inner;
      const x1 = pad + (picked.end / buffer.duration) * used * inner;
      g.fillStyle = lit;
      g.globalAlpha = 0.2;
      g.fillRect(x0, 0, Math.max(dpr, x1 - x0), h);
    }
    cache.values.forEach((v, k) => {
      const x = pad + k * step;
      const bar = Math.max(dpr * 2, v * (h - 2 * pad));
      const at = ((k + 0.5) / columns) * buffer.duration;
      const off = kept && (at < kept.start || at > kept.end);
      g.fillStyle = off ? cut : lit;
      g.globalAlpha = off ? 0.55 : x < head ? 1 : 0.32;   // not played yet: faint
      g.fillRect(x, (h - bar) / 2, BAR * dpr, bar);
    });
    g.globalAlpha = 1;
    if (progress > 0 && progress < 1) {
      g.fillStyle = colors.head;
      g.fillRect(Math.round(head - dpr), 0, Math.max(2, Math.round(2 * dpr)), h);
    }
  }

  return {
    // Draws `next` (an AudioBuffer); `longest` is the length of the longest
    // sound it is compared with (the plain recording or the voiced one).
    show(next, longest = next.duration) {
      buffer = next;
      span = Math.max(longest, next.duration);
      colors = null;
      canvas.setAttribute('aria-label', `The sound's wave: ${next.duration.toFixed(1)} seconds`);
      draw(0);
    },
    // Moves the line across while the sound `id` plays, then settles back.
    // `from` and `to` (0 to 1) are the part of the wave it is playing.
    follow(id, from = 0, to = 1) {
      cancelAnimationFrame(raf);
      colors = null;   // read again on the first frame drawn
      const still = stillWanted();
      let looped = false;
      let held = false;   // drawn lit once; then only watched
      const frame = () => {
        const entry = audio.playing.get(id);
        if (!entry || !audio.ctx) { draw(0); return; }
        // A loop sweeps again on each pass, as the pads' fill does, until it
        // ends: let go (audio.unloop), it finishes its pass sweeping. With
        // reduced motion, or too short to follow (a strobe), it is held lit.
        looped ||= entry.loop;
        if (looped && (entry.duration < MIN_SWEEP || still)) {
          if (!held) draw(1);
          held = true;
          raf = requestAnimationFrame(frame);
          return;
        }
        held = false;
        const t = Math.max(0, (audio.ctx.currentTime - entry.t0) / entry.duration);
        const p = looped ? t % 1 : Math.min(1, t);
        draw(from + p * (to - from));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    redraw() { draw(0); },
    // Greys the bars outside `range` ({start, end} seconds), or none (null).
    shade(range) { kept = range; draw(0); },
    // Bands the part `range` ({start, end} seconds) picked in the wave editor, or none (null).
    pick(range) { picked = range; draw(0); },
    clear() {
      cancelAnimationFrame(raf);
      kept = picked = null;
      buffer = null;
      cache = { buffer: null, columns: 0, values: null };
      canvas.getContext?.('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
