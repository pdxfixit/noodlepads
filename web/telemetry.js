// Usage events in the shared standard (pdxfixit/telemetry docs/standard.md,
// Arrow-Rama backlog #151): one call, `track(event, details)`, builds a record
// with every column the standard names (app, platform, form, version, player,
// session, seq, at, tz, event, screen, details) and queues it in memory and
// in localStorage `telemetry-queue`. Nothing is sent from here yet: the shared
// sender comes with flarepress's web transport (phase B), and it asks
// `shouldSend` first.
//
// With the usage switch off (usage.js, the `sendUsage` setting) `track` does
// nothing and the queue is emptied. The player is a plain random id kept on
// this device (`telemetry-player`): not a profile's id and not tied to one,
// made in `newPlayer` alone so its rules (#150) change in one place. The
// session is one page load.
//
// What a record may hold is fixed: each event's details keys are listed in
// EVENTS (the standard's events.toml, plus this app's own), and a value is a
// number, a boolean, null or a short string the app wrote itself. Never what
// a kid made, said or typed: no sound, beat or person names, no messages.

import { remember, recall, forget } from './util.js';
import { usageOn } from './usage.js';

export const APP = 'noodlepads';
export const PLATFORM = 'web';

// Question #425 (open): do players who never use the cloud send events too?
// Until Ben answers, only devices where someone syncs send; one flag changes it.
export const SEND_WITHOUT_CLOUD = false;

// Every event this app sends, with the details keys each may carry. The
// standard's names first (events.toml), then this app's own (`noodlepads.`).
export const EVENTS = {
  'app.open': ['first_run', 'vw', 'vh', 'density', 'font_scale', 'dark', 'reduced_motion', 'lang', 'os', 'input', 'pwa'],
  'app.foreground': ['away_ms'],
  'app.background': ['shown_ms'],
  'screen.view': ['from'],
  'dialog.open': ['dialog'],
  'dialog.close': ['dialog', 'answer', 'ms'],
  'control.use': ['control', 'group', 'layout', 'vw', 'vh', 'input'],
  'content.start': ['kind', 'item', 'resumed'],
  'content.finish': ['kind', 'item', 'ms'],
  'content.abandon': ['kind', 'item', 'ms', 'why'],
  'setting.change': ['key', 'from', 'to'],
  error: ['kind', 'where', 'fatal'],
  'perf.load': ['ms', 'cold'],
  'perf.longtask': ['n', 'ms'],
  // 💾 Keep: a scratch beat or song kept in 🗂️ My beats or My songs.
  'noodlepads.keep': ['kind'],
  // 💃 A groove loaded into the scratch beat, or its ▶ sample heard.
  'noodlepads.groove': ['action'],
  // The cloud: a person put in or opened, set 📴 Offline, a share made,
  // opened, remixed or taken back, a PIN set.
  'noodlepads.cloud': ['action'],
};

export const MAX_QUEUE = 500;      // records waiting on this device; the oldest go first
export const MAX_TEXT = 60;        // a string value's length
const QUEUE_KEY = 'telemetry-queue';
const PLAYER_KEY = 'telemetry-player';
const SAVE_MS = 2000;              // localStorage is written at most this often (and on hiding)
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// A new player id. The one place a player id is made (#150 may change how).
export const newPlayer = () => randomId();

// This device's player id, made on first use: {id, first} (`first`: made just
// now, so this is the device's first run as far as the app can tell).
export function playerId() {
  const kept = recall(PLAYER_KEY);
  if (kept && ID.test(kept)) return { id: kept, first: false };
  const id = newPlayer();
  remember(PLAYER_KEY, id);
  return { id, first: true };
}

// phone, tablet or desktop, from the screen's size and touch: no touch is a
// desktop; a touch screen whose short side is under 600 CSS px is a phone.
export function formOf(width, height, touch) {
  if (!touch) return 'desktop';
  const short = Math.min(Number(width) || 0, Number(height) || 0);
  return short > 0 && short < 600 ? 'phone' : 'tablet';
}

// A details object as a record keeps it: only the event's listed keys, and
// only numbers (whole below 1e12, else rounded to 3 places), booleans, null
// and strings cut to MAX_TEXT.
export function cleanDetails(event, details) {
  const keys = EVENTS[event] ?? [];
  const out = {};
  for (const k of keys) {
    if (!details || !Object.hasOwn(details, k)) continue;
    const v = details[k];
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === 'string' && v) out[k] = v.slice(0, MAX_TEXT);
  }
  return out;
}

// Whether the sender may send: the switch is on, and someone on this device
// is in the cloud unless SEND_WITHOUT_CLOUD (question #425).
export const shouldSend = ({ enabled = usageOn(), cloud = false } = {}) => enabled && (SEND_WITHOUT_CLOUD || cloud);

// The queue as localStorage holds it, junk dropped.
export function readQueue() {
  let raw;
  try { raw = JSON.parse(recall(QUEUE_KEY) || '[]'); } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === 'object' && r.app === APP && typeof r.session === 'string'
    && Number.isInteger(r.seq) && Number.isInteger(r.at) && Object.hasOwn(EVENTS, r.event)).slice(-MAX_QUEUE);
}

// deps (all optional, for the tests): {
//   now()        ms (Date.now)
//   enabled()    the usage switch (usage.js usageOn)
//   screen()     the screen showing, from the app's screen names
//   size()       {width, height, touch} of the device's screen
//   later(fn, ms) a timer (setTimeout)
// }
// Returns {track, flush, clear, setVersion, queued, session, player, first}.
export function createTelemetry(deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const enabled = deps.enabled ?? usageOn;
  const later = deps.later ?? ((fn, ms) => setTimeout(fn, ms));
  const session = randomId();
  const { id: player, first } = playerId();
  let version = null;     // version.json arrives after the first events
  let seq = 0;
  let queue = readQueue();
  let saving = false;

  const save = () => {
    saving = false;
    // Records made before the version is known wait in memory for it.
    const ready = queue.filter((r) => r.version !== null);
    if (ready.length) remember(QUEUE_KEY, JSON.stringify(ready.slice(-MAX_QUEUE)));
    else forget(QUEUE_KEY);
  };
  const soon = () => {
    if (saving) return;
    saving = true;
    later(save, SAVE_MS);
  };

  function track(event, details = {}) {
    if (!enabled() || !Object.hasOwn(EVENTS, event)) return null;
    const at = now();
    const size = safe(deps.size) ?? {};
    const record = {
      app: APP,
      platform: PLATFORM,
      form: formOf(size.width, size.height, size.touch),
      version,
      player,
      session,
      seq: seq++,
      at,
      tz: -new Date(at).getTimezoneOffset(),
      event,
      screen: safe(deps.screen) ?? null,
      details: cleanDetails(event, details),
    };
    queue.push(record);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    soon();
    return record;
  }

  return {
    track,
    session,
    player,
    first,
    // Writes the queue now (the page is hiding).
    flush: save,
    // The switch went off: nothing waits any more, here or in localStorage.
    clear() { queue = []; forget(QUEUE_KEY); },
    // The app's version, once version.json says it: stamped on every record
    // of this page load that waited for it.
    setVersion(v) {
      version = String(v ?? 'dev').slice(0, 40) || 'dev';
      for (const r of queue) if (r.session === session && r.version === null) r.version = version;
      soon();
    },
    queued: () => queue.slice(),
  };
}

function safe(fn) {
  try { return fn?.() ?? null; } catch { return null; }
}

// The page's one instance, so any module can call `track` without wiring.
let current = null;
export function useTelemetry(t) { current = t; return t; }
export const track = (event, details) => current?.track(event, details) ?? null;
export const currentTelemetry = () => current;
