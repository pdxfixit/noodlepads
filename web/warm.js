// Warming: which sounds the app prepares before they are tapped, and in what
// order. The pads on show (the open groups) are loaded at once, so a first
// tap sounds. Every other sound of the person is loaded one at a time when the
// browser is idle, so a phone is not decoding and rendering a hundred sounds
// while the first screen draws (and a kid's first taps wait behind them).
// app.js makes one warmer; pads.js tells it what is on show.

// Calls `fn` when the browser has nothing better to do. Safari has no
// requestIdleCallback, so a short timer stands in for it there.
export function whenIdle(fn) {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 50);
}

// `load(clip)` starts a sound's load (audio.load) and gives its promise;
// `loaded(clip)` says it is loaded or loading already. A load that fails is
// the pad's business (audio.js marks it broken), never the warmer's.
export function createWarmer({ load, loaded, idle = whenIdle }) {
  let queue = [];
  let waiting = false;   // an idle slot is booked, or a load is running

  // Called at once, so a sound is marked loading before the next look at it.
  const start = (clip) => {
    try { return Promise.resolve(load(clip)).catch(() => {}); } catch { return Promise.resolve(); }
  };

  // Loads these now: the pads on show.
  function now(clips) {
    const ids = new Set(clips.map((c) => c.id));
    queue = queue.filter((c) => !ids.has(c.id));
    for (const clip of clips) if (!loaded(clip)) start(clip);
  }

  // Loads these one at a time, when idle. Replaces what was waiting (another
  // person is on show now).
  function later(clips) {
    queue = [...clips];
    pump();
  }

  function pump() {
    if (waiting || !queue.length) return;
    waiting = true;
    idle(async () => {
      let clip = queue.shift();
      while (clip && loaded(clip)) clip = queue.shift();
      if (clip) await start(clip);
      waiting = false;
      pump();
    });
  }

  return { now, later, queued: () => queue.length };
}
