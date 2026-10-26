// Where the page's usage events come from (telemetry.js, the shared standard's
// six categories), each caught once at a layer everything passes through, so
// a new button, dialog or setting is tracked without code of its own:
//
//   lifecycle  app.open (the environment, once), app.foreground and
//              app.background (the page shown and hidden)
//   screens    screen.view (app.js's screen switch calls `screen`),
//              dialog.open and dialog.close (dialogs.js onDialogOpen)
//   controls   control.use: one click listener on the page, for every
//              control tooltips.js knows (CONTROLS), named by its label
//   content    content.start, finish and abandon for beats, songs, takes and
//              recording into a beat, read from the event log (log.js)
//   settings   setting.change, from and to, from the log (settings.js
//              setSetting logs every change)
//   errors     error (kind and file:line, never the message), perf.load,
//              perf.longtask, perf.latency (the sound's delay, once a visit)
//   play       noodlepads.play: pads, keys, roll notes and song blocks played
//              this visit, one count each (play-count.js), as the page hides
//   level      noodlepads.level: the person's level, once a page load, after
//              app.open (app.js says it when the first person's level is known)
//
// A control's name is never text a kid typed: a control from index.html is
// named by its label as the page first drew it, any other by its id, a data-
// attribute's name or its class. Pads, keys, pills and the like are play, not
// controls, and are left out (as board taps are in the other apps).

import { CONTROLS, tipFor } from './tooltips.js';
import { takePlay } from './play-count.js';
import { LEVELS } from './settings.js';

// Play surfaces: tapped hundreds of times a visit, and play, not controls.
export const PLAY = '.pad, .dj-key, .pill, .kids-pad, .kids-key, .kids-square, .kids-drum, .roll-hit, .lane-cell';
// data- attributes that hold a value about a record, never a control's name.
const NOT_NAMES = new Set(['data-id', 'data-auto-tip', 'data-code', 'data-key', 'data-index', 'data-row', 'data-col', 'data-step',
  'data-color', 'data-more-word', 'data-person', 'data-clip', 'data-n', 'data-bar', 'data-lane', 'data-block', 'data-at']);
const SPLIT_PX = 1400;   // from here a screen's two parts sit side by side (styles.css, Wide screens)

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

const attrNames = (el) => el.getAttributeNames?.() ?? [...(el.attributes?.keys?.() ?? [])];
const classes = (el) => (typeof el?.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : []);
const word = (s) => String(s ?? '').replace(/[^\w-]/g, '').slice(0, 60);

// The labels of the controls index.html draws, as the page first has them
// (before anyone's sounds or names are on it). Call once, at start.
const staticLabels = new WeakMap();
export function learnLabels(root) {
  for (const el of root?.querySelectorAll?.(CONTROLS) ?? []) {
    const tip = tipFor(el);
    if (tip) staticLabels.set(el, tip.slice(0, 60));
  }
}

// The name control.use gives a control: its first label, else its id, else
// its first data- attribute's name, else its first class, else its tag.
export function controlName(el) {
  if (staticLabels.has(el)) return staticLabels.get(el);
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return word(el.id);
  const data = attrNames(el).find((n) => n.startsWith('data-') && !NOT_NAMES.has(n));
  if (data) return word(data.slice(5));
  return word(classes(el)[0]) || String(el.tagName ?? '').toLowerCase();
}

// The toolbar, bar or sheet holding a control: its nearest ancestor with an
// id, or that is a landmark (header, nav, a toolbar…), named by its id, else
// its first class, else its tag.
const LANDMARK = /^(HEADER|NAV|FOOTER|MAIN|DIALOG|SECTION|ASIDE)$/;
export function groupOf(el) {
  for (let e = el.parentElement; e && e.tagName !== 'BODY'; e = e.parentElement) {
    if (e.id) return word(e.id);
    if (LANDMARK.test(e.tagName ?? '') || e.getAttribute?.('role') === 'toolbar') return word(classes(e)[0]) || e.tagName.toLowerCase();
  }
  return null;
}

// Which arrangement showed the control, where arrangements vary: `split` on
// wide screens, the line's give-way step (lines.js `fit-*`), and `more` for a
// control in or behind a ⋯ menu (overflow.js). 'base' when none applies.
export function layoutOf(el, vw) {
  const parts = [];
  if (vw >= SPLIT_PX) parts.push('split');
  let fit = null;
  let more = false;
  for (let e = el; e; e = e.parentElement) {
    const cs = classes(e);
    fit ??= cs.filter((c) => c.startsWith('fit-')).at(-1) ?? null;
    if (cs.includes('more-tight') || e.getAttribute?.('role') === 'menu') more = true;
  }
  if (fit) parts.push(fit);
  if (more) parts.push('more');
  return parts.join(' ') || 'base';
}

// The event log entry's content event, or null. `open` remembers what has
// started: {kind: ms}, so a finish knows how long it ran.
export function contentOf(entry, open, now) {
  const d = entry?.data ?? {};
  const start = (kind) => { open[kind] = now; return ['content.start', { kind, resumed: false }]; };
  const end = (kind, event, more = {}) => {
    const from = open[kind];
    delete open[kind];
    return from === undefined && event !== 'content.abandon' ? null : [event, { kind, ...(from === undefined ? {} : { ms: now - from }), ...more }];
  };
  switch (entry?.kind) {
    case 'beat':
      if (d.action === 'play') return start('beat');
      if (d.action === 'stop') return end('beat', 'content.finish');
      return null;
    case 'song':
      if (d.action === 'play') return start('song');
      if (d.action === 'stop') return end('song', 'content.finish');
      return null;
    // ● Record into the open beat (Beats with ⌨️ Keys).
    case 'dj':
      if (d.rec === 'start') return start('beat-record');
      if (d.rec === 'stop') return d.added > 0 ? end('beat-record', 'content.finish') : end('beat-record', 'content.abandon', { why: 'empty' });
      return null;
    // A sound recorded on Kids, sounds cut out of a recording, a voice rendered
    // onto a sound (a preview counts too): made in one step, so only a finish.
    case 'kids':
      return d.recorded !== undefined ? ['content.finish', { kind: 'sound-record', ms: Math.round(d.recorded * 1000) }] : null;
    case 'chop':
      return d.made ? ['content.finish', { kind: 'chop' }] : null;
    case 'render':
      return ['content.finish', { kind: 'voice', ms: d.ms }];
    // ● Record a take on 🎤 Live.
    case 'take':
      if (d.rec === 'start') return start('take');
      if (d.rec === 'stop') return d.made ? end('take', 'content.finish') : end('take', 'content.abandon', { why: 'empty' });
      return null;
    default: return null;
  }
}

// This app's own events, from the log: 💾 Keep, grooves, the cloud.
export function appEventOf(entry) {
  const d = entry?.data ?? {};
  if ((entry?.kind === 'beat' || entry?.kind === 'song') && d.action === 'keep') return ['noodlepads.keep', { kind: entry.kind }];
  if (entry?.kind === 'beat' && (d.action === 'groove' || d.action === 'sample')) return ['noodlepads.groove', { action: d.action === 'groove' ? 'load' : 'sample' }];
  if (entry?.kind === 'cloud') {
    const action = d.shared ? 'share' : d.remixed ? 'remix' : d.opened === 'share' ? 'share-open' : d.opened === true ? 'open'
      : d.put ? 'put' : d.offline === true ? 'offline' : d.pin === 'set' ? 'pin-set' : d.unshared ? 'unshare' : null;
    return action ? ['noodlepads.cloud', { action }] : null;
  }
  return null;
}

// An error as the standard keeps it: what kind, and where (errorSig, above).
export function errorOf(data = {}) {
  const kind = data.storage ? 'storage' : data.source ? 'error' : 'promise';
  return { kind, where: errorSig(data), fatal: false };
}

// The browser family from the user agent: edge, opera, samsung, firefox,
// chrome, safari or other. Those built on Chrome say "Chrome" too, so they
// are asked first; Safari alone says only "Safari" (with "Version/"). Nothing
// of the version, and never the user agent itself.
export function browserOf(ua) {
  const s = String(ua ?? '');
  if (/Edg(e|A|iOS)?\//.test(s)) return 'edge';
  if (/OPR\/|OPT\/|Opera/.test(s)) return 'opera';
  if (/SamsungBrowser\//.test(s)) return 'samsung';
  if (/Firefox\/|FxiOS\//.test(s)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(s)) return 'chrome';
  if (/Safari\//.test(s) && /Version\//.test(s)) return 'safari';
  return 'other';
}

// The environment app.open carries, from the window. Pure given `win`.
export function environment(win, first) {
  const mq = (q) => win.matchMedia?.(q)?.matches === true;
  const ua = String(win.navigator?.userAgent ?? '');
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (win.navigator?.maxTouchPoints ?? 0) > 1) ? 'iOS'
    : /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const font = parseFloat(win.getComputedStyle?.(win.document?.documentElement)?.fontSize);
  return {
    first_run: first,
    vw: win.innerWidth ?? null,
    vh: win.innerHeight ?? null,
    density: win.devicePixelRatio ?? null,
    font_scale: Number.isFinite(font) && font > 0 ? Math.round((font / 16) * 100) / 100 : null,
    dark: mq('(prefers-color-scheme: dark)'),
    reduced_motion: mq('(prefers-reduced-motion: reduce)'),
    lang: String(win.navigator?.language ?? '').split('-')[0].toLowerCase().slice(0, 8) || null,
    os,
    input: mq('(hover: hover) and (pointer: fine)') ? 'mouse' : (win.navigator?.maxTouchPoints ?? 0) > 0 ? 'touch' : 'mouse',
    pwa: mq('(display-mode: standalone)'),
    browser: browserOf(ua),
  };
}

const safe = (fn) => { try { return fn?.() ?? null; } catch { return null; } };

// Wires every hook. deps: {
//   telemetry     createTelemetry's
//   onLog         log.js onLog
//   onDialogOpen  dialogs.js onDialogOpen
//   root          where clicks are heard (document.body)
//   doc, win      the page's document and window
//   now()         ms
//   latency()     the sound's delay in ms, or null when no sound has played
// }
// Returns {screen(name)}: app.js says each screen shown.
export function trackPage(deps) {
  const { telemetry: t, win = globalThis, doc = globalThis.document } = deps;
  const now = deps.now ?? (() => Date.now());
  const track = (e, d) => t.track(e, d);
  let screen = null;
  let shownAt = now();
  let hiddenAt = 0;
  let pointer = null;
  const open = {};
  const dialogs = new Map();   // an open dialog -> when it opened
  let levelSent = false;

  track('app.open', environment(win, t.first));

  // Lifecycle, and the long tasks counted while shown.
  let long = { n: 0, ms: 0 };
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      hiddenAt = now();
      if (long.n) track('perf.longtask', long);
      long = { n: 0, ms: 0 };
      const delay = safe(deps.latency);
      if (delay > 0) track('perf.latency', { ms: Math.round(delay) });
      const played = takePlay();
      if (played) track('noodlepads.play', played);
      // Heard before the shared client's own listener (it starts later), so
      // this record is in the batch it sends as the page hides.
      track('app.background', { shown_ms: hiddenAt - shownAt });
    } else {
      shownAt = now();
      track('app.foreground', { away_ms: hiddenAt ? shownAt - hiddenAt : null });
    }
  });
  try {
    new win.PerformanceObserver((list) => {
      for (const e of list.getEntries()) { long.n += 1; long.ms += Math.round(e.duration); }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* no long-task timing in this browser */ }

  // How long the page took to load, once it has.
  const loaded = () => {
    const nav = win.performance?.getEntriesByType?.('navigation')?.[0];
    if (!nav?.loadEventEnd) return;
    track('perf.load', { ms: Math.round(nav.loadEventEnd), cold: (nav.transferSize ?? 0) > 0 });
  };
  if (doc?.readyState === 'complete') setTimeout(loaded, 0);
  else win.addEventListener?.('load', () => setTimeout(loaded, 0));

  // Dialogs: opened, and closed with how long they held.
  deps.onDialogOpen?.((dialog) => {
    const name = word(dialog?.id) || 'dialog';
    if (dialogs.has(dialog)) return;
    dialogs.set(dialog, now());
    track('dialog.open', { dialog: name });
    dialog.addEventListener?.('close', function closed() {
      if (!dialogs.has(dialog)) return;
      const ms = now() - dialogs.get(dialog);
      dialogs.delete(dialog);
      const answer = /^[a-z][a-z0-9-]{0,23}$/.test(dialog.returnValue ?? '') ? dialog.returnValue : null;
      track('dialog.close', { dialog: name, ...(answer ? { answer } : {}), ms });
      dialog.removeEventListener?.('close', closed);
    });
  });

  // Controls: one listener, before the control's own handler changes it.
  deps.root?.addEventListener?.('pointerdown', (e) => { pointer = e.pointerType || null; }, true);
  deps.root?.addEventListener?.('click', (e) => {
    if (e.isTrusted === false) return;   // a click made by code (a ⋯ menu pressing the real button)
    const el = e.target?.closest?.(CONTROLS);
    if (!el || el.matches?.(PLAY)) return;
    const vw = win.innerWidth ?? null;
    track('control.use', {
      control: controlName(el),
      group: groupOf(el),
      layout: layoutOf(el, vw ?? 0),
      vw,
      vh: win.innerHeight ?? null,
      input: e.detail === 0 ? 'key' : e.pointerType || pointer || 'mouse',
    });
  }, true);

  // Content, settings, errors and this app's own events, from the log.
  deps.onLog?.((entry) => {
    const content = contentOf(entry, open, now());
    if (content) track(...content);
    const own = appEventOf(entry);
    if (own) track(...own);
    if (entry?.kind === 'setting') track('setting.change', { key: entry.data?.key, from: entry.data?.was, to: entry.data?.value });
    if (entry?.kind === 'error') track('error', errorOf(entry.data));
  });

  return {
    screen(name) {
      if (!name || name === screen) return;
      const from = screen;
      screen = name;
      track('screen.view', { from, to: name });
    },
    // The person's level (kids, regular or advanced), once a page load, so a
    // person who never changes it still shows (setting.change shows only a
    // change). app.js says it once the first person's level is known.
    level(value) {
      if (levelSent || !LEVELS.includes(value)) return;
      levelSent = true;
      track('noodlepads.level', { level: value });
    },
    current: () => screen,
  };
}
