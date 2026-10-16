// Usage events in the shared standard (pdxfixit/telemetry docs/standard.md,
// Arrow-Rama backlog #151, ADR 0026): the app's one call, `track(event,
// details)`. It checks the event and its details against EVENTS and hands
// them to flarepress's shared client (events-client.js, vendored), which
// fills the rest of the record (app, platform, form, version, player,
// session, seq, at, tz, screen), queues it in memory and localStorage, and
// sends batches to POST /api/events (the Worker stores them in R2).
//
// With the usage switch off (usage.js, the `sendUsage` setting) `track` does
// nothing and every queued record is dropped. While it is on, every device
// sends, in the cloud or not (Ben, 2026-10-16, question #425: "Yes,
// everyone"), with its own random code and never a profile. The player is a plain random id kept on this device
// (`telemetry-player`): not a profile's id and not tied to one, made in
// `newPlayer` alone so its rules (#150) change in one place.
//
// The client needs the app's version, which version.json says only after the
// page has started: events before that wait here and go in, in order, once
// `setVersion` is called.
//
// What a record may hold is fixed: each event's details keys are listed in
// EVENTS (the standard's events.toml, plus this app's own), and a value is a
// number, a boolean, null or a short string the app wrote itself. Never what
// a kid made, said or typed: no sound, beat or person names, no messages.

import { remember, recall, forget } from './util.js';
import { usageOn } from './usage.js';
import { createEvents } from './events-client.js';

export const APP = 'noodlepads';

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

export const MAX_TEXT = 60;        // a string value's length
export const MAX_WAITING = 200;    // events waiting for the version
const PLAYER_KEY = 'telemetry-player';
const OLD_QUEUE = 'telemetry-queue';   // this app's own queue before the shared client (2026-10-16)
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

// A details object as a record keeps it: only the event's listed keys, and
// only numbers (rounded to 3 places), booleans, null and strings cut to MAX_TEXT.
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

// Whether the client may keep and send: the switch is on. Every device, in
// the cloud or not (question #425, Ben: "Yes, everyone").
export const shouldSend = ({ enabled = usageOn() } = {}) => enabled === true;

// deps (all optional, for the tests): {
//   enabled()    the usage switch (usage.js usageOn)
//   screen()     the screen showing, from the app's screen names
//   globals      the shared client's window, document, storage, fetch… (events-client.js)
//   endpoint     where batches go (/api/events)
// }
// Returns {track, flush, clear, setVersion, queued, player, first, client()}.
export function createTelemetry(deps = {}) {
  const enabled = deps.enabled ?? usageOn;
  const { id: player, first } = playerId();
  forget(OLD_QUEUE);
  let client = null;
  let waiting = [];   // [event, details] before the version is known

  function track(event, details = {}) {
    if (!enabled() || !Object.hasOwn(EVENTS, event)) return false;
    const clean = cleanDetails(event, details);
    if (client) return client.track(event, clean);
    if (waiting.length < MAX_WAITING) waiting.push([event, clean]);
    return true;
  }

  return {
    track,
    player,
    first,
    client: () => client,
    // Sends what is queued now (the tests; the client sends by itself).
    flush: (opts) => client?.flush(opts) ?? Promise.resolve(),
    // The switch went off: nothing waits any more, here or in localStorage.
    clear() { waiting = []; client?.clear(); },
    // The app's version, once version.json says it: the client starts, and
    // the events that waited for it go in, in order.
    setVersion(v) {
      if (client) return;
      client = createEvents({
        app: APP,
        version: String(v ?? 'dev').slice(0, 40) || 'dev',
        player,
        screen: () => safe(deps.screen),
        enabled: () => shouldSend({ enabled: enabled() }),
        ...(deps.endpoint ? { endpoint: deps.endpoint } : {}),
        ...(deps.globals ? { globals: deps.globals } : {}),
      });
      const early = waiting;
      waiting = [];
      if (enabled()) for (const [e, d] of early) client.track(e, d);
    },
    // What waits to be sent, as records (the tests).
    queued() {
      if (!client) return [];
      const q = client.queued();
      const lines = [...q.batches.flatMap((b) => b.body.split('\n').filter(Boolean)), ...q.records];
      return lines.map((l) => JSON.parse(l));
    },
    waiting: () => waiting.slice(),
  };
}

function safe(fn) {
  try { return fn?.() ?? null; } catch { return null; }
}

// The page's one instance, so any module can call `track` without wiring.
let current = null;
export function useTelemetry(t) { current = t; return t; }
export const track = (event, details) => current?.track(event, details) ?? false;
export const currentTelemetry = () => current;
