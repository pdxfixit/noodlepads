// 🧸 Kids' spoken prompts, played (kids-prompts.js says which there are). One
// small player made by kids.js with what it needs from the app, so the rules
// below are tested on stand-ins:
//
//   - only a prompt with a recording plays (`recorded`), so with none the
//     app is as it was;
//   - once per person per screen (`seen` / `mark`, the person's `seen`
//     setting, only kept once the prompt really sounded);
//   - a moment after the screen shows, and never over sound: a pad, a beat,
//     a recording or a tune already sounding, or a kid who has touched
//     anything since the screen showed, ends or skips it (`hush`);
//   - never from a page that is hidden or an audio context a tap has not
//     woken: a prompt that waited for the next tap would speak at a wrong time.
//
// A prompt that was skipped is tried again the next time its screen shows.

export const SAY_DELAY_MS = 400;

// host: recorded() → ids with a recording; wanted(p) → whether this person
// should hear p (Kids level, first steps on, not heard, and still useful);
// mark(p) keeps it heard; busy() → something is sounding or being made;
// ready() → audio may sound now; load(p) → Promise<what start takes>;
// start(p, loaded) → a handle with stop(); delay: ms before it plays.
export function createSay(host, delay = SAY_DELAY_MS) {
  let timer = null;
  let turn = 0;          // bumped by every maybe/hush, so a late answer knows it is stale
  let current = null;    // the handle of the prompt sounding

  function hush() {
    turn++;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (current) { try { current.stop(); } catch { /* it ended already */ } current = null; }
  }

  // The screen `p` belongs to showed: say it soon, if it should be said.
  function maybe(p) {
    hush();
    if (!p || !host.recorded().includes(p.id) || !host.wanted(p)) return;
    const mine = turn;
    timer = setTimeout(async () => {
      timer = null;
      if (mine !== turn || host.busy() || !host.ready()) return;
      let loaded;
      try { loaded = await host.load(p); } catch { return; }   // a file that will not load says nothing
      if (mine !== turn || host.busy()) return;                // the kid moved on while it loaded
      current = host.start(p, loaded);
      host.mark(p);
    }, delay);
  }

  return { maybe, hush };
}
