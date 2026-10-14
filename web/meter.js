// The level meter: speaker grilles (rows of dots) that light up with the
// sound, and the pad progress fills, redrawn together once per frame while
// anything is playing.

import { audio } from './audio.js';

export function buildGrille(node, count) {
  node.replaceChildren(...Array.from({ length: count }, () => document.createElement('span')));
}

export function drawGrille(node, level) {
  const dots = node.children;
  const lit = Math.round(level * dots.length);
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('lit', i < lit);
}

// Loudness 0-1 of what `analyser` hears now.
export function levelOf(analyser, scratch) {
  analyser.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
  return Math.min(1, Math.sqrt(sum / scratch.length) * 4.5);
}

export const meter = {
  raf: 0,
  level: 0,
  scratch: new Float32Array(512),
  // Set once by the app: the grilles to draw, how to show a pad's progress,
  // and whether the sound sheet is open / recording (it draws its own grille
  // from the microphone then).
  grille: null,
  sheetGrille: null,
  setProgress: () => {},
  onLevel: () => {},   // the level each frame (DJ mode's glow follows it)
  sheetOpen: () => false,
  recording: () => false,

  run() {
    if (this.raf) return;
    const step = () => {
      const ctx = audio.context();
      for (const [id, e] of audio.playing) {
        const t = Math.max(0, (ctx.currentTime - e.t0) / e.duration);  // a loop waiting for its bar starts at 0
        this.setProgress(id, e.loop ? t % 1 : Math.min(1, t));
      }
      this.level = Math.max(levelOf(audio.analyser, this.scratch), this.level * 0.86);
      drawGrille(this.grille, this.level);
      this.onLevel(this.level);
      if (this.sheetOpen() && !this.recording()) drawGrille(this.sheetGrille, this.level);
      if (audio.playing.size || this.level > 0.02) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = 0;
        this.level = 0;
        drawGrille(this.grille, 0);
        this.onLevel(0);
        if (!this.recording()) drawGrille(this.sheetGrille, 0);
      }
    };
    this.raf = requestAnimationFrame(step);
  },
};
