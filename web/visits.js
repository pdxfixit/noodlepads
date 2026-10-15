// Visits (ADR 0016): one short summary per visit, for people in the cloud.
// A visit is the page in view: it starts when the page shows and ends when
// it hides (another tab, the phone locked, the page closed). The summary says
// how long it was in view, which screens it showed, the person's level, how
// fast the page loaded, the sound's delay (audio latency), and which file
// and line any error came from. Never what was made, said or typed.
//
// Summaries wait in localStorage `visits` under the person who was current
// when the visit ended, and go up with that person's next sync
// (cloud-sync.js), as feature-use counts do (uses.js). A person who is not in
// the cloud never sends theirs; the oldest are dropped past MAX_WAITING.
//
// The Worker imports the lists and `cleanVisit` to check what it is sent, so
// this module imports nothing that needs a page.

import { remember, recall } from './util.js';

// What a visit can name. A new screen goes at the end.
export const VISIT_SCREENS = ['pads', 'beats', 'song', 'live', 'kids'];
export const VISIT_LEVELS = ['kids', 'regular', 'advanced'];   // settings.js LEVELS
export const MIN_SECS = 2;               // shorter is a flick past, not a visit
export const MAX_SECS = 24 * 60 * 60;
export const MAX_ERRORS = 10;            // different places one visit names
export const MAX_WAITING = 30;           // visits waiting on this device, all people
export const MAX_SEND = 20;              // visits in one send (the Worker reads 32 KB at most)
const KEY = 'visits';

// Where an error came from, as "file.js:line", or a word when it has no
// place: "storage" (the browser's database), "promise" (a rejected promise),
// "other". Nothing of the message itself.
const SIG = /^([a-z0-9][a-z0-9_-]{0,40}\.m?js:\d{1,6}|storage|promise|other)$/;
export function errorSig(data = {}) {
  if (data.storage) return 'storage';
  const file = typeof data.source === 'string' ? data.source.split(/[?#]/)[0].split('/').pop().toLowerCase() : '';
  const sig = `${file}:${Number.isInteger(data.line) ? data.line : 0}`;
  if (file && SIG.test(sig)) return sig;
  return data.source ? 'other' : 'promise';
}

const whole = (n, lo, hi) => (Number.isInteger(n) && n >= lo && n <= hi ? n : null);

// A visit as stored and sent: {at, secs, first, screens, level, load,
// latency, errors: {sig: n}}. Anything wrong in it: null. The Worker uses
// this too, so the app never stores what the cloud would refuse.
export function cleanVisit(v, now = Date.now()) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const at = whole(v.at, 1_600_000_000_000, now + 60_000);
  const secs = whole(v.secs, MIN_SECS, MAX_SECS);
  if (at === null || secs === null) return null;
  const screens = Array.isArray(v.screens) ? [...new Set(v.screens.filter((s) => VISIT_SCREENS.includes(s)))] : [];
  const errors = {};
  if (v.errors && typeof v.errors === 'object' && !Array.isArray(v.errors)) {
    for (const [sig, n] of Object.entries(v.errors).slice(0, MAX_ERRORS)) {
      if (SIG.test(sig) && whole(n, 1, 10_000) !== null) errors[sig] = n;
    }
  }
  return {
    at,
    secs,
    first: VISIT_SCREENS.includes(v.first) ? v.first : screens[0] ?? null,
    screens,
    level: VISIT_LEVELS.includes(v.level) ? v.level : null,
    load: whole(v.load, 0, 120_000),
    latency: whole(v.latency, 0, 2_000),
    errors,
  };
}

// What localStorage holds: [{person, visit}], junk dropped.
function read() {
  let raw;
  try { raw = JSON.parse(recall(KEY) || '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((w) => {
    const visit = typeof w?.person === 'string' && w.person ? cleanVisit(w.visit) : null;
    return visit ? [{ person: w.person, visit }] : [];
  }).slice(-MAX_WAITING);
}
const write = (all) => remember(KEY, JSON.stringify(all.slice(-MAX_WAITING)));

// Keeps a finished visit for `personId`. No person: nothing kept.
export function keepVisit(personId, visit) {
  const clean = cleanVisit(visit);
  if (!clean || typeof personId !== 'string' || !personId) return false;
  write([...read(), { person: personId, visit: clean }]);
  return true;
}

// The visits waiting for `personId`, oldest first, or null when none.
export function pendingVisits(personId) {
  const mine = read().filter((w) => w.person === personId).map((w) => w.visit).slice(0, MAX_SEND);
  return mine.length ? mine : null;
}

// The cloud has `sent`: take those off (by start time; a visit kept while it
// was sending stays).
export function sentVisits(personId, sent) {
  const gone = new Set((sent ?? []).map((v) => v.at));
  write(read().filter((w) => !(w.person === personId && gone.has(w.visit.at))));
}

// Follows the visits of this page. deps: {
//   now()            ms
//   who()            the current person's id
//   level()          their level (settings.js)
//   load()           ms the page took to load, or null (asked at the end of the page's first visit)
//   latency()        the sound's delay in ms, or null when no sound has played
//   onLog            log.js onLog: errors are counted from the log
//   doc              the page's document (visibilityState, events); optional
//   win              the window (pagehide); optional
// }
// Returns {screen(name), end(), current()}: `screen` says a screen was
// shown; `end` finishes the visit (the page hid); `current` is what it holds
// so far.
export function trackVisits(deps) {
  let visit = null;
  let shownAt = 0;
  let loadAsked = false;

  const start = () => {
    shownAt = deps.now();
    visit = { at: shownAt, secs: 0, first: null, screens: [], errors: {}, firstOfPage: !loadAsked };
    loadAsked = true;
    if (pendingScreen) screen(pendingScreen);
  };
  let pendingScreen = null;
  const screen = (name) => {
    pendingScreen = name;
    if (!visit || !VISIT_SCREENS.includes(name)) return;
    visit.first ??= name;
    if (!visit.screens.includes(name)) visit.screens.push(name);
  };
  const end = () => {
    if (!visit) return;
    const done = visit;
    visit = null;
    done.secs = Math.round((deps.now() - shownAt) / 1000);
    // The load time belongs to the page's first visit, asked at its end,
    // when the page has finished loading for sure.
    if (done.firstOfPage) done.load = safe(deps.load);
    delete done.firstOfPage;
    done.level = safe(deps.level);
    const latency = safe(deps.latency);
    done.latency = Number.isFinite(latency) ? Math.round(latency) : null;
    keepVisit(safe(deps.who), done);
  };

  deps.onLog?.((entry) => {
    if (entry?.kind !== 'error' || !visit) return;
    const sig = errorSig(entry.data);
    if (visit.errors[sig] !== undefined || Object.keys(visit.errors).length < MAX_ERRORS) {
      visit.errors[sig] = (visit.errors[sig] ?? 0) + 1;
    }
  });
  deps.doc?.addEventListener?.('visibilitychange', () => {
    if (deps.doc.visibilityState === 'hidden') end();
    else if (!visit) start();
  });
  deps.win?.addEventListener?.('pagehide', end);
  if (!deps.doc || deps.doc.visibilityState !== 'hidden') start();
  return { screen, end, current: () => visit };
}

function safe(fn) {
  try { return fn?.() ?? null; } catch { return null; }
}
