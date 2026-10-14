// When cloud sync runs (docs/design/cloud-profiles.md § 6, "When"): on open,
// 20 s after the last change, on every focus and blur (window focus/blur and
// the page showing or hiding), and every 5 minutes while the page is shown
// and focused. Nothing runs on a timer while the page is hidden or in the
// background. A quick blur and focus run one sync, not two. Pure: the clock,
// the timers and the sync itself are handed in, so the tests drive it with a
// fake clock. cloud.js binds it to the page.

export const SYNC_DELAY_MS = 20_000;       // after the last change
export const ACTIVE_MS = 5 * 60_000;       // while shown and focused
export const TRANSITION_MS = 1_500;        // focus and blur gathered into one sync
export const MIN_GAP_MS = 10_000;          // a focus or blur this soon after a sync, with nothing changed, skips

// run(why): starts a sync (cloud.js syncAll, which never runs two at once).
// active(): whether the page is shown and focused.
export function createSyncTiming({
  run, active = () => true, now = () => Date.now(),
  // unref (Node only): a waiting sync never keeps a test run from ending.
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); t?.unref?.(); return t; }, clearTimer = (t) => clearTimeout(t),
} = {}) {
  let changeTimer = null;
  let transitionTimer = null;
  let activeTimer = null;
  let dirty = false;          // a change is waiting for its sync
  let lastRun = -Infinity;

  const stop = (t) => { if (t !== null) clearTimer(t); return null; };

  // The 5-minute sync, armed only while shown and focused.
  function arm() {
    activeTimer = stop(activeTimer);
    if (!active()) return;
    activeTimer = setTimer(() => {
      activeTimer = null;
      if (active()) fire('active'); else arm();
    }, ACTIVE_MS);
  }

  function fire(why) {
    ran();
    return run(why);
  }

  // A sync started (by this, or by anything else that calls syncAll): the
  // waits it covers are done.
  function ran() {
    changeTimer = stop(changeTimer);
    transitionTimer = stop(transitionTimer);
    dirty = false;
    lastRun = now();
    arm();
  }

  return {
    ran,
    // Something a person owns changed: sync once things are quiet.
    changed() {
      dirty = true;
      changeTimer = stop(changeTimer);
      changeTimer = setTimer(() => { changeTimer = null; fire('change'); }, SYNC_DELAY_MS);
    },
    // The page gained or lost focus, or was shown or hidden. `hidden`: it is
    // going away, maybe for good, so a waiting change goes now.
    transition({ hidden = false } = {}) {
      if (!active()) activeTimer = stop(activeTimer);
      else if (activeTimer === null) arm();
      if (hidden && dirty) { fire('hide'); return; }
      transitionTimer = stop(transitionTimer);
      transitionTimer = setTimer(() => {
        transitionTimer = null;
        if (dirty || now() - lastRun >= MIN_GAP_MS) fire('focus');
      }, TRANSITION_MS);
    },
    // For tests and the ☁️ sheet: what is waiting.
    pending: () => ({ change: changeTimer !== null, transition: transitionTimer !== null, active: activeTimer !== null, dirty }),
  };
}
