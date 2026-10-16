// 📮 Send problem reports: with the sendLogs setting on, this device sends
// its event log, cleaned by log-clean.js, to the soundboard's own /api/log
// (docs/design/automatic-logs.md). Each upload holds the entries since the
// last one that got through. It goes when the page is hidden (closed, app
// switched, screen locked) and 10 s after an error, never more than once a
// minute, and never from a dev copy. Sending can never break the app: every
// failure is swallowed, and the entries wait for the next try (the log keeps
// the newest 400, so what waits is bounded).
//
// The device code below tells one tablet's reports from another's.

import { recall, remember, forget } from './util.js';
import { state } from './state.js';
import { audio } from './audio.js';
import { people, clipsFor } from './board.js';
import { SETTINGS, getSetting, onSetting } from './settings.js';
import { getLog, onLog } from './log.js';
import { cleanPayload } from './log-clean.js';
import { parseAgent } from './agent.js';

// The only host that sends. A dev copy (localhost, the Wi-Fi address) never does.
export const LIVE_HOST = 'noodlepads.com';
export const SEND_URL = '/api/log';
export const MIN_GAP_MS = 60_000;      // at most one upload a minute
export const ERROR_DELAY_MS = 10_000;  // after an error, wait to gather what happened next
// keepalive requests may carry 64 KiB in all; the Worker refuses more than 64 KB.
export const MAX_BODY_BYTES = 60_000;

const CODE_KEY = 'log-device';
// No 0/O or 1/I, so a code read aloud off a tablet is copied right.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code = null;

// A new random code like "K7Q4-M2XD". `random` is for tests.
export function makeDeviceCode(random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) {
  const pick = () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  const four = () => Array.from({ length: 4 }, pick).join('');
  return `${four()}-${four()}`;
}

const valid = (c) => typeof c === 'string' && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(c);

// This device's code, made and remembered the first time it is asked for.
// If this browser won't remember it, it lasts until the page is reloaded.
export function deviceCode() {
  if (valid(code)) return code;
  const stored = recall(CODE_KEY);
  code = valid(stored) ? stored : makeDeviceCode();
  if (code !== stored) remember(CODE_KEY, code);
  return code;
}

// Reports switched off: the code is gone, and a new one is made if they are
// switched on again.
export function forgetDeviceCode() {
  code = null;
  forget(CODE_KEY);
}

const bytes = (text) => new TextEncoder().encode(text).length;

// The sending, apart from the page so it can be tested.
// deps: {fetch, getLog, enabled(), live(), build(entries) -> cleaned payload | null,
//   now(), setTimer(fn, ms), clearTimer(id)}
export function createLogSender(deps) {
  const { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = deps;
  let sentUpTo = 0;          // the `n` of the newest entry that got through
  let lastTry = -Infinity;   // when the last upload was tried
  let busy = false;
  let timer = null;

  const unsent = () => deps.getLog().filter((e) => e.n > sentUpTo);

  // One upload, if one is due. Resolves true when it got through; never throws.
  async function send() {
    if (busy) return false;
    try {
      if (!deps.enabled() || !deps.live()) return false;
      if (now() - lastTry < MIN_GAP_MS) return false;
      let entries = unsent();
      if (!entries.length) return false;
      let payload = deps.build(entries);
      if (!payload) return false;
      let body = JSON.stringify(payload);
      // Too big for one upload: the oldest entries are left out, and counted.
      let left = 0;
      while (bytes(body) > MAX_BODY_BYTES && entries.length > 1) {
        const cut = Math.max(1, Math.floor(entries.length / 4));
        entries = entries.slice(cut);
        left += cut;
        payload = deps.build(entries);
        if (!payload) return false;
        payload.dropped += left;
        body = JSON.stringify(payload);
      }
      if (bytes(body) > MAX_BODY_BYTES) return false;
      const upTo = entries.at(-1).n;
      busy = true;
      lastTry = now();
      const res = await deps.fetch(SEND_URL, {
        method: 'POST', keepalive: true, credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body,
      });
      if (!res?.ok) return false;
      sentUpTo = Math.max(sentUpTo, upTo);
      return true;
    } catch {
      return false;
    } finally {
      busy = false;
    }
  }

  return {
    send,
    // The page was hidden: send now, if the minute allows.
    hidden: () => send(),
    // A new log entry: an error sends 10 s later (later still if the last
    // upload was under a minute ago).
    entry(e) {
      if (e?.kind !== 'error' || timer !== null || !deps.enabled() || !deps.live()) return;
      const wait = Math.max(ERROR_DELAY_MS, lastTry + MIN_GAP_MS - now());
      timer = setTimer(() => { timer = null; send(); }, wait);
    },
    // Reports were switched on: only what happens from now on is sent.
    start() { sentUpTo = deps.getLog().at(-1)?.n ?? 0; },
    stop() { if (timer !== null) clearTimer(timer); timer = null; },
    unsent,
  };
}

// Every name typed on this device: people, sounds, beats, songs, takes, DJ layouts, a kid's own voices, and
// the bundled people's ids (they are first names). log-clean.js blanks them.
export function namesOnDevice(s = state) {
  const everyone = people({ includeHidden: true });
  return [
    ...everyone.flatMap((p) => [p.name, p.id]),
    ...(s.manifest?.people ?? []).flatMap((p) => [p.name, p.id]),
    ...[...s.peopleEdits.values()].map((p) => p.name),
    ...everyone.flatMap((p) => clipsFor(p.id, { includeHidden: true }).map((c) => c.label)),
    ...s.userClips.map((c) => c.label),
    ...[...s.overrides.values()].map((o) => o.label),
    ...s.savedBeats.map((b) => b.name),
    ...[...s.patterns.values()].map((p) => p.name),
    ...s.takes.map((t) => t.name),
    ...[...s.songs.values()].map((x) => x.name),
    ...s.songbook.map((x) => x.name),
    ...(s.layouts ?? []).map((l) => l.name),
    ...(s.myVoices ?? []).map((v) => v.name),
  ].filter((n) => typeof n === 'string' && n);
}

const session = `s-${Math.random().toString(36).slice(2, 8)}`;

// The upload, as log-clean.js cleans it: the payload of the plan's § 2.
function buildPayload(entries) {
  const everyone = people({ includeHidden: true });
  const ctx = audio.ctx;
  return cleanPayload({
    format: 1,
    app: state.version,
    device: deviceCode(),
    session,
    sent: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    // The browser, OS and device type only, never the User-Agent itself.
    env: {
      ...parseAgent(globalThis.navigator?.userAgent, (globalThis.navigator?.maxTouchPoints ?? 0) > 0),
      screen: [globalThis.screen?.width, globalThis.screen?.height],
      dpr: globalThis.devicePixelRatio,
      tz: globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone,
      audio: ctx ? { sampleRate: ctx.sampleRate, baseLatencyMs: (ctx.baseLatency ?? NaN) * 1000, state: ctx.state } : null,
    },
    settings: Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, getSetting(k)])),
    counts: {
      people: everyone.length,
      sounds: everyone.reduce((sum, p) => sum + clipsFor(p.id, { includeHidden: true }).length, 0),
      recorded: state.userClips.length,
      beats: state.savedBeats.length,
      takes: state.takes.length,
      songs: state.songbook.length,
    },
    dropped: 0,
    entries,
  }, {
    names: namesOnDevice(),
    kitIds: new Set((state.manifest?.kit ?? []).map((k) => k.id)),
    origin: globalThis.location?.origin,
  });
}

// Call once at start-up, after the settings are read.
export function initLogSend() {
  const sender = createLogSender({
    fetch: (...args) => globalThis.fetch(...args),
    getLog,
    enabled: () => getSetting('sendLogs') === true,
    live: () => globalThis.location?.hostname === LIVE_HOST,
    build: buildPayload,
  });
  onLog((e) => sender.entry(e));
  // Listeners also hear the value again when a backup loads; only a change counts.
  let on = getSetting('sendLogs') === true;
  onSetting('sendLogs', (now) => {
    if (now === on) return;
    on = now;
    if (on) sender.start();
    else { sender.stop(); forgetDeviceCode(); }
  });
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sender.hidden();
  });
  return sender;
}
