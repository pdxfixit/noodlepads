// The fill that runs across a pad while its sound plays. Written to the page
// every frame it restyled each playing pad (about a millisecond a pad on a
// slow phone, frame after frame), so the fill is one animation of the pad's
// ::before instead, started once when the sound starts: the browser runs a
// transform off the main thread, and the page does nothing per frame.
//
// meter.js calls draw() each frame with each sound that plays; this starts a
// pad's animation the first time, and only looks at it after (cheap: no write,
// no layout). The audio clock stays the truth: a pad whose animation drifts
// from it (a suspended context, a loop that moved to its bar) is set right.
// A look that draws the progress itself with --progress (the skins' dials,
// styles.css) still gets it written each frame: draw() says it did not handle
// those, and meter.js falls back to setProgress.

// The skins whose CSS reads var(--progress) (tests/pad-progress.test.mjs keeps this list true).
export const PROGRESS_SKINS = new Set(['slam', 'spinner']);

const DRIFT_MS = 120;   // an animation further than this from the audio clock is moved back

// Where the animation should be, in ms: a loop keeps counting, a single play stops at its end.
const want = (entry, elapsed, length) => (entry.loop ? elapsed : Math.min(elapsed, length));

export function createPadFill({ padFor, skin = () => document.documentElement.dataset.skin }) {
  const fills = new Map();   // sound id -> { pad, entry, anim, loop, t0, duration }

  const clear = (id) => {
    const f = fills.get(id);
    if (!f) return;
    fills.delete(id);
    f.anim.cancel();   // the fill goes back to --progress, which is 0
    f.pad.classList.remove('playing');
  };

  // Draws the fill for `entry` (an audio.playing value). True when the fill
  // is handled here (or there is no pad to draw), false when the caller must
  // write --progress each frame.
  function draw(id, entry, now) {
    if (PROGRESS_SKINS.has(skin())) { clear(id); return false; }
    const elapsed = (now - entry.t0) * 1000;   // ms; negative while a loop waits for its bar
    const length = entry.duration * 1000;
    let f = fills.get(id);
    if (f && (!f.pad.isConnected || f.entry !== entry || f.loop !== entry.loop || f.t0 !== entry.t0 || f.duration !== entry.duration)) {
      clear(id);
      f = undefined;
    }
    if (!f) {
      const pad = padFor(id);
      if (!pad) return true;   // a sound that is not a pad (a preview)
      if (typeof pad.animate !== 'function') return false;
      let anim;
      try {
        anim = pad.animate({ transform: ['scaleX(0)', 'scaleX(1)'] }, {
          duration: length,
          iterations: entry.loop ? Infinity : 1,
          easing: 'linear',
          fill: 'forwards',   // a sound that has played through stays full until audio.js says it has stopped
          pseudoElement: '::before',
        });
      } catch { return false; }   // a browser without animations on ::before
      anim.currentTime = want(entry, elapsed, length);   // negative while a loop waits for its bar: nothing is drawn yet
      f = { pad, entry, anim, loop: entry.loop, t0: entry.t0, duration: entry.duration, lit: false };
      fills.set(id, f);
    }
    if (!f.lit && elapsed > 0) { f.lit = true; f.pad.classList.add('playing'); }   // a loop waiting for its bar is not playing yet
    const at = want(entry, elapsed, length);
    if (Math.abs(Number(f.anim.currentTime) - at) > DRIFT_MS) f.anim.currentTime = at;
    return true;
  }

  // Lets go of the fill of any sound that is no longer playing (a cut that said nothing).
  function sweep(playing) {
    for (const [id, f] of fills) if (playing.get(id) !== f.entry) clear(id);
  }

  return { draw, clear, sweep, active: () => fills.size };
}
