// The silent-tap report (web/tap-watch.js; Ben, 2026-10-26): a finger tap on
// a pad or a 🎤 Live tile that plays nothing is logged, with how far it got.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchTaps, silence, screenOf, SILENT_AFTER_MS, MAX_REPORTS } from '../web/tap-watch.js';
import { fingerTaps, lately } from '../web/finger.js';
import { cleanPayload } from '../web/log-clean.js';
import { createLogSender } from '../web/log-send.js';

// Just enough of a page: elements that know their parent, selectors by the
// few the watcher asks for, and elementsFromPoint answering from a list.
class El {
  constructor(tag, { cls = '', id = '', data = {}, parent = null } = {}) {
    Object.assign(this, { tagName: tag.toUpperCase(), cls, id, dataset: data, parent });
  }
  getAttribute(name) { return name === 'class' ? this.cls : null; }
  contains(el) { for (let e = el; e; e = e.parent) if (e === this) return true; return false; }
  matches(sel) {
    return sel.split(',').map((s) => s.trim()).some((s) => {
      const parts = s.split(' ');
      const last = parts.at(-1);
      if (!this.is(last)) return false;
      if (parts.length === 1) return true;
      for (let e = this.parent; e; e = e.parent) if (e.is(parts[0])) return true;
      return false;
    });
  }
  // `#id`, `.cls`, `tag[data-x]`, `.cls[data-x]`, `[data-x]`, `dialog[open]`.
  is(one) {
    const m = one.match(/^([a-z]*)(#[\w-]+)?(\.[\w-]+)?(\[[\w-]+\])?$/);
    if (!m) return false;
    const [, tag, id, cls, attr] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (id && this.id !== id.slice(1)) return false;
    if (cls && !this.cls.split(' ').includes(cls.slice(1))) return false;
    if (attr === '[open]') return !!this.open;
    if (attr && !Object.hasOwn(this.dataset, attr.slice(6, -1).replace(/-(\w)/g, (_, c) => c.toUpperCase()))) return false;
    return true;
  }
  closest(sel) { for (let e = this; e; e = e.parent) if (e.matches(sel)) return e; return null; }
}

class Target {
  constructor() { this.on = {}; }
  addEventListener(type, fn) { (this.on[type] ??= []).push(fn); }
  fire(type, e) { for (const fn of this.on[type] ?? []) fn(e); }
}

function page({ screen = 'pads', holdMs = 350 } = {}) {
  const body = new El('body');
  body.classList = { contains: (c) => c === `screen-${screen}` || (screen === 'kids' && c === 'kids') };
  const pads = new El('div', { id: 'pads', parent: body });
  const pad = new El('button', { cls: 'pad', data: { id: 'kick' }, parent: pads });
  const emoji = new El('span', { cls: 'pad-emoji', parent: pad });
  const touch = new El('div', { id: 'dj-touch', parent: body });
  const tile = new El('button', { cls: 'touch-tile', data: { clip: 'snare' }, parent: touch });
  const doc = new Target();
  doc.body = body;
  doc.visibilityState = 'visible';
  doc.stack = [emoji, pad, pads, body];
  doc.dialogs = [];
  doc.elementsFromPoint = () => doc.stack;
  doc.querySelectorAll = (sel) => (sel === 'dialog[open]' ? doc.dialogs : []);
  const win = new Target();
  let t = 0;
  const timers = [];
  let voices = 0;
  const logged = [];
  const deps = {
    doc, win, lately,
    voices: () => voices,
    audioState: () => 'running',
    isLooping: () => false,
    loops: () => 0,
    log: (kind, data) => logged.push({ kind, data }),
    now: () => t,
    setTimer: (fn, ms) => timers.push({ fn, at: t + ms }),
  };
  const watch = watchTaps(deps);
  // What the app's own pad code does with a finger (pads.js): plays on the lift.
  // A hold loops it (one voice), and its lift then does nothing.
  const fingers = fingerTaps({ onTap: () => { voices += 1; }, onHold: () => { voices += 1; }, holdMs });
  let id = 0;
  return {
    doc, win, deps, pad, tile, body, watch, logged, fingers,
    later(ms) { t += ms; for (const x of timers.splice(0)) { if (x.at <= t) x.fn(); else timers.push(x); } },
    // One finger: down and up at (x, y) and (x2, y2); `heard` false when the
    // app's code never gets it (something on top), `played` false when its lift makes no voice.
    tap({ x = 10, y = 10, x2 = x, y2 = y, heard = true, played = true, type = 'touch' } = {}) {
      const e = { pointerId: ++id, pointerType: type, clientX: x, clientY: y, button: 0 };
      win.fire('pointerdown', e);
      if (heard && type !== 'mouse') fingers.down(e, 'kick');
      const up = { ...e, clientX: x2, clientY: y2 };
      win.fire('pointerup', up);
      if (heard && type !== 'mouse') {
        const before = voices;
        fingers.up(up);
        if (!played) voices = before;
      }
    },
  };
}

test('why a finished tap was silent: unheard, no-tap, no-sound, audio-off, or not silent', () => {
  assert.equal(silence({ seen: undefined, made: false, audio: 'running' }), 'unheard');
  assert.equal(silence({ seen: 'down', made: false, audio: 'running' }), 'no-tap');
  assert.equal(silence({ seen: 'tap', made: false, audio: 'running' }), 'no-sound');
  assert.equal(silence({ seen: 'tap', made: true, audio: 'suspended' }), 'audio-off');
  assert.equal(silence({ seen: 'tap', made: true, audio: 'running' }), null);
  assert.equal(silence({ seen: 'hold', made: true, audio: 'running' }), null);
});

test('only Pads, 🎤 Live and 🧸 Kids are watched, and not while editing sounds', () => {
  const body = (...on) => ({ classList: { contains: (c) => on.includes(c) } });
  assert.equal(screenOf(body('screen-pads')), 'pads');
  assert.equal(screenOf(body('screen-live')), 'live');
  assert.equal(screenOf(body('screen-pads', 'kids')), 'kids');
  assert.equal(screenOf(body('screen-pads', 'editing')), null);
  assert.equal(screenOf(body('screen-beats')), null);
});

test('a tap that plays is not logged', () => {
  const p = page();
  p.tap();
  p.later(SILENT_AFTER_MS);
  assert.deepEqual(p.logged, []);
});

test('a pad the app never heard, under something else, is logged as unheard and covered, with what covered it', () => {
  const p = page();
  const veil = new El('div', { cls: 'veil wide', parent: p.body });
  p.doc.stack = [veil, p.pad, p.body];
  p.tap({ heard: false });
  p.later(SILENT_AFTER_MS - 1);
  assert.equal(p.logged.length, 0, 'it waits for a slow first load');
  p.later(1);
  assert.equal(p.logged.length, 1);
  const { kind, data } = p.logged[0];
  assert.equal(kind, 'tap');
  assert.equal(data.screen, 'pads');
  assert.equal(data.on, 'pad');
  assert.equal(data.why, 'unheard');
  assert.equal(data.covered, true);
  assert.equal(data.over, 'div.veil');
  assert.equal(data.audio, 'running');
  assert.equal(data.n, 1);
});

test('a heard tap whose lift made no sound is logged as no-sound; a 🎤 Live tile names itself', () => {
  const p = page({ screen: 'live' });
  p.doc.stack = [p.tile, p.body];
  p.tap({ played: false });
  p.later(SILENT_AFTER_MS);
  assert.equal(p.logged[0].data.why, 'no-sound');
  assert.equal(p.logged[0].data.on, 'tile');
  assert.equal(p.logged[0].data.screen, 'live');
  assert.equal(p.logged[0].data.covered, false);
});

test('a voice made while the audio is not running is logged as audio-off', () => {
  const p = page();
  p.deps.audioState = () => 'suspended';
  p.tap();
  p.later(SILENT_AFTER_MS);
  assert.equal(p.logged[0].data.why, 'audio-off');
  assert.equal(p.logged[0].data.audio, 'suspended');
});

test('not logged: a finger that moved (a scroll), a mouse, a looping pad (its tap stops it), a sheet on top, a pinch', () => {
  const moved = page();
  moved.tap({ heard: false, x2: 40 });
  const mouse = page();
  mouse.tap({ type: 'mouse', heard: false });
  const looping = page();
  looping.deps.isLooping = (id) => id === 'kick';
  looping.tap({ played: false });
  const sheet = page();
  const dialog = new El('dialog', { id: 'sheet', parent: sheet.body });
  dialog.open = true;
  sheet.doc.stack = [dialog, sheet.pad, sheet.body];
  sheet.tap({ heard: false });
  const pinch = page();
  pinch.win.fire('pointerdown', { pointerId: 50, pointerType: 'touch', clientX: 5, clientY: 5 });
  pinch.win.fire('pointerdown', { pointerId: 51, pointerType: 'touch', clientX: 80, clientY: 5 });
  pinch.win.fire('pointerup', { pointerId: 50, pointerType: 'touch', clientX: 5, clientY: 5 });
  pinch.win.fire('pointerup', { pointerId: 51, pointerType: 'touch', clientX: 80, clientY: 5 });
  const cancelled = page();
  cancelled.win.fire('pointerdown', { pointerId: 60, pointerType: 'touch', clientX: 5, clientY: 5 });
  cancelled.win.fire('pointercancel', { pointerId: 60, pointerType: 'touch' });
  cancelled.win.fire('pointerup', { pointerId: 60, pointerType: 'touch', clientX: 5, clientY: 5 });
  for (const [name, p] of Object.entries({ moved, mouse, looping, sheet, pinch, cancelled })) {
    p.later(SILENT_AFTER_MS);
    assert.deepEqual(p.logged, [], name);
  }
});

test(`silent taps in a row count up, and at most ${MAX_REPORTS} are logged a page load`, () => {
  const p = page();
  for (let i = 0; i < MAX_REPORTS + 3; i++) { p.tap({ heard: false }); p.later(SILENT_AFTER_MS); }
  assert.equal(p.logged.length, MAX_REPORTS);
  assert.deepEqual(p.logged.map((l) => l.data.n), [1, 2, 3, 4, 5]);
  p.tap();
  p.later(SILENT_AFTER_MS);
  assert.equal(p.logged.length, MAX_REPORTS, 'a tap that plays logs nothing');
});

test('the log says how long the page had run, been shown and hidden', () => {
  const p = page();
  p.later(90 * 60_000);
  p.doc.visibilityState = 'hidden';
  p.doc.fire('visibilitychange');
  p.later(60 * 60_000);
  p.doc.visibilityState = 'visible';
  p.doc.fire('visibilitychange');
  p.later(30 * 60_000);
  p.tap({ heard: false });
  p.later(SILENT_AFTER_MS);
  const { data } = p.logged[0];
  assert.equal(data.upMin, 180.1);
  assert.equal(data.shownMin, 30.1);
  assert.equal(data.hides, 1);
});

test('a problem report keeps a tap entry, with names blanked from what covered the pad', () => {
  const data = { screen: 'pads', on: 'pad', why: 'unheard', covered: true, over: 'div.Juno', audio: 'running', audioDown: 'suspended',
    dialogs: 1, dialog: '#sheet', loops: 0, fingers: 0, upMin: 12.5, shownMin: 3, hides: 2, n: 1, extra: 'dropped' };
  const out = cleanPayload({ format: 1, device: 'K7Q4-M2XD', entries: [{ n: 1, t: 5, kind: 'tap', data }] }, { names: ['Juno'] });
  const { extra, ...kept } = data;
  assert.equal(extra, 'dropped');
  assert.deepEqual(out.entries[0].data, { ...kept, over: 'div.«name»' });
});

test('a silent tap sends a report 10 s later, as an error does', () => {
  const timers = [];
  const sender = createLogSender({
    fetch: async () => ({ ok: true }), getLog: () => [], enabled: () => true, live: () => true, build: () => null,
    now: () => 0, setTimer: (fn, ms) => { timers.push(ms); return 1; }, clearTimer: () => {},
  });
  sender.entry({ kind: 'tap' });
  assert.deepEqual(timers, [10_000]);
});

test('a tap followed by the page being hidden (another app, the screen off) is not logged: the audio stops by design', () => {
  const p = page();
  p.tap({ heard: false });
  p.doc.visibilityState = 'hidden';
  p.doc.fire('visibilitychange');
  p.later(SILENT_AFTER_MS);
  assert.deepEqual(p.logged, []);
});

test('a pad held until it loops is not logged: the hold made its sound, and the lift does nothing', async () => {
  const p = page({ holdMs: 5 });
  const e = { pointerId: 900, pointerType: 'touch', clientX: 10, clientY: 10, button: 0 };
  p.win.fire('pointerdown', e);
  p.fingers.down(e, 'kick');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(lately.get(900), 'hold');
  p.win.fire('pointerup', e);
  p.fingers.up(e);
  p.later(SILENT_AFTER_MS);
  assert.deepEqual(p.logged, []);
});
