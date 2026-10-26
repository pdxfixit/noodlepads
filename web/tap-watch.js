// The silent-tap report (Ben, 2026-10-26): a finger tap on a pad (🔊 Pads,
// 🧸 Kids) or a key or tile (🎤 Live) that plays nothing is logged as a `tap`
// entry, which a problem report sends (log-send.js, cleaned by log-clean.js).
// Ben's installed app once stopped sounding taps after running a while, and
// a fresh load fixed it; this says, next time, how far a tap got:
//
//   unheard    the app's own finger code never took it (finger.js): something
//              on top of the pad, or the pad's listener gone
//   no-tap     the finger code took it but the lift played nothing
//   no-sound   the lift asked for a sound and no voice was made (audio.js)
//   audio-off  a voice was made but the audio isn't running
//
// with what lay on top of the pad, the audio's state, open dialogs, and how
// long the page had run and been shown. It listens on the window in the
// capture phase, so it hears the finger before anything can stop it.
// A sound counts when audio.js makeVoice makes its voice: a tap that sounds
// some other way (an oscillator of its own) would be reported as no-sound.
// `just taps` checks the whole path in headless Chrome.

import { isFinger, stayedPut } from './finger.js';

export const SILENT_AFTER_MS = 3000;   // a sound's first load can take a moment
export const MAX_REPORTS = 5;          // per page load

// What a finger plays, by screen.
const TARGETS = {
  pads: { sel: '#pads .pad[data-id]', on: () => 'pad' },
  live: { sel: '#dj-touch [data-clip], #dj-keys [data-code]', on: (el) => (el.dataset.code ? 'key' : 'tile') },
  kids: { sel: '#kids-pages .kids-pad', on: () => 'pad' },
};
// Parts of a pad that do something else: its ✏️, 🗑️ and pick badges, a group's header.
const NOT_PLAY = '[data-edit], [data-x], [data-pick], [data-inst-pick], .pad-group, dialog[open]';

// The screen a finger can play on now, or null (Edit sounds, Beats, Song).
export function screenOf(body) {
  const c = body?.classList;
  if (!c) return null;
  if (c.contains('kids')) return 'kids';
  if (c.contains('editing')) return null;
  if (c.contains('screen-pads')) return 'pads';
  if (c.contains('screen-live')) return 'live';
  return null;
}

// "div.update-bar", "#welcome": enough to name what covered a pad.
const describe = (el) => (el?.id ? `#${el.id}` : `${String(el?.tagName ?? '').toLowerCase()}.${String(el?.getAttribute?.('class') ?? '').trim().split(/\s+/)[0]}`).slice(0, 60);

// Why a finished tap played nothing, or null when it played. Pure.
//   seen: finger.js `lately` for this finger; made: a voice was made since
//   the finger went down; audio: the audio's state now.
export function silence({ seen, made, audio }) {
  if (!seen) return 'unheard';
  if (seen === 'down') return 'no-tap';
  if (!made) return 'no-sound';
  if (audio && audio !== 'running') return 'audio-off';
  return null;
}

const minutes = (ms) => Math.round(ms / 6000) / 10;

// deps: {doc, win, lately (finger.js), voices() (audio.js voicesMade),
//   audioState() ('running', … or null), isLooping(id), loops() (how many
//   sounds loop), log(kind, data), now(), setTimer(fn, ms)}
// Returns {pending}: the taps waiting to be checked, for tests.
export function watchTaps(deps) {
  const { doc, win, now = () => Date.now(), setTimer = setTimeout } = deps;
  const started = now();
  let shownAt = started;
  let hides = 0;
  let inARow = 0;
  let reported = 0;
  const down = new Map();   // pointer id -> the tap so far

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') hides += 1;
    else shownAt = now();
  });

  function check(tap) {
    // Hidden since (another app, the screen off): the audio stops by design.
    if (hides !== tap.hides) return;
    const why = silence({ seen: deps.lately.get(tap.id), made: deps.voices() > tap.voices, audio: deps.audioState() });
    if (!why) { inARow = 0; return; }
    inARow += 1;
    if (reported >= MAX_REPORTS) return;
    reported += 1;
    const dialogs = [...doc.querySelectorAll('dialog[open]')];
    const t = now();
    deps.log('tap', {
      screen: tap.screen, on: tap.on, why, covered: tap.covered, ...(tap.over ? { over: tap.over } : {}),
      audio: deps.audioState(), audioDown: tap.audio, dialogs: dialogs.length, ...(dialogs.length ? { dialog: describe(dialogs.at(-1)) } : {}),
      loops: deps.loops(), fingers: tap.fingers, upMin: minutes(t - started), shownMin: minutes(t - shownAt), hides, n: inARow,
    });
  }

  win.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return;
    // Another finger down: a pinch or a chord of taps, which can mean silence.
    for (const tap of down.values()) tap.many = true;
    const screen = screenOf(doc.body);
    const target = screen && TARGETS[screen];
    if (!target) return;
    // The pad under the finger, even when something else is on top of it.
    const stack = doc.elementsFromPoint?.(e.clientX, e.clientY) ?? [e.target];
    const pad = stack.map((el) => el?.closest?.(target.sel)).find(Boolean);
    if (!pad || stack[0]?.closest?.(NOT_PLAY)) return;
    const id = pad.dataset.id ?? pad.dataset.clip;
    // A tap on a looping sound stops it: silence is the point.
    if (id ? deps.isLooping(id) : deps.loops() > 0) return;
    const covered = !!stack[0] && !pad.contains(stack[0]);
    deps.lately.delete(e.pointerId);   // only what this finger does counts
    down.set(e.pointerId, {
      id: e.pointerId, x: e.clientX, y: e.clientY, screen, on: target.on(pad), covered,
      over: covered ? describe(stack[0]) : null, voices: deps.voices(), audio: deps.audioState(),
      fingers: down.size, many: down.size > 0, hides,
    });
  }, true);
  win.addEventListener('pointerup', (e) => {
    const tap = down.get(e.pointerId);
    down.delete(e.pointerId);
    if (!tap || tap.many || !stayedPut(tap.x, tap.y, e.clientX, e.clientY)) return;
    setTimer(() => check(tap), SILENT_AFTER_MS);
  }, true);
  win.addEventListener('pointercancel', (e) => { down.delete(e.pointerId); }, true);

  return { pending: down };
}
