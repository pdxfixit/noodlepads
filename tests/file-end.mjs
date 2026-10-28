// What a test file does when its tests are done, so that Node ends it by
// itself and a file that cannot end says so by name.
//
// Node waits for every open handle. The app's timers (the sequencer's tick,
// the play watch, update checks) and anything else a test leaves running kept
// a file alive for ever, so every run needed --test-force-exit, which cuts a
// parallel run's last reports (2026-10-19). Now:
//   - a test helper that starts something calls onFileEnd(fn) with the call
//     that stops it (tests/fake-dom.mjs clears the page's timers);
//   - when the file's tests are done, the root `after` below runs them;
//   - then a watchdog waits EXIT_MS and runs them once more. A timer set
//     after the last test (a late continuation of a test) is cleared then,
//     with a one-line note naming it, and the file ends. A file that is still
//     alive after that (a server, a socket, an interval outside the stand-in)
//     fails, naming itself and what holds it, never a silent hang. The
//     watchdog's own timer is unref'd, so it never keeps a file alive.
// tools/node_tests.sh preloads this module (--import) into every file, so
// the watchdog covers files that import no helper; fake-dom.mjs imports it
// too, so one file run alone (`node --test tests/x.test.mjs`) is covered.
// It must be imported at a file's top level: after() inside a running test
// ties the hook to that one test (tests/file-end.test.mjs checks the files
// that import fake-dom dynamically also import it statically).

import { after } from 'node:test';

export const EXIT_MS = Number(process.env.NOODLE_EXIT_MS) || 10_000;   // the env is for tests/file-end.test.mjs
const realSetTimeout = globalThis.setTimeout;   // not a stand-in's, whenever this runs
const cleanups = [];

// `fn` runs after the file's last test, and again when the watchdog fires; it
// may return a short text saying what it stopped that time (the late timers).
export function onFileEnd(fn) { cleanups.push(fn); }

// What still holds the process open, leaving out the pipes that carry the
// test report itself.
export function holdingOpen() {
  const quiet = new Set(['PipeWrap', 'TTYWrap', 'FSReqPromise', 'ProcessWrap']);
  return [...new Set(process.getActiveResourcesInfo().filter((r) => !quiet.has(r)))];
}

after(() => {
  for (const fn of cleanups) fn();
  const watchdog = realSetTimeout(() => {
    const late = cleanups.map((fn) => fn()).filter((r) => typeof r === 'string' && r);
    const held = holdingOpen();
    if (!held.length) {
      // Only what the page set after the last test was left, and it is stopped.
      if (late.length) console.error(`ℹ ${process.argv[1] ?? 'a test file'}: stopped ${late.join('; ')}, set after its last test`);
      return;
    }
    console.error(`✖ ${process.argv[1] ?? 'a test file'} did not end ${EXIT_MS / 1000} s after its last test: `
      + `still open: ${held.join(', ') || 'nothing listed'}. Stop it in an after() hook (onFileEnd in tests/file-end.mjs).`);
    process.exit(1);
  }, EXIT_MS);
  watchdog.unref();
});
