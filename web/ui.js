// Page-wide bits every module uses: element lookup, the notice bar, and a
// quiet announcer for screen readers. Nothing here runs until it is called,
// so modules that import it can still be loaded outside a browser.

import { logEvent } from './log.js';

export const $ = (sel) => document.querySelector(sel);

// Things the user should know (a save that failed, a backup that loaded), in
// the banner over the top of the screen (showBanner, below). Every notice is
// written to the event log too, so a problem report shows what the user
// was told. An empty text puts the last notice away.
//
// One banner shows at a time, so a notice said again and again (a save that
// fails on every change) would push each ↩️ Undo away as it came. The same
// words within a minute of the last time never take the place of an Undo;
// they are still logged.
export const NOTICE_MS = 10000;
export const REPEAT_MS = 60000;
let notice = null;
let lastNotice = { text: '', at: -Infinity };
export function showNotice(text) {
  if (!text) { notice?.close(); notice = null; return; }
  logEvent('notice', { text });
  const now = Date.now();
  const again = text === lastNotice.text && now - lastNotice.at < REPEAT_MS;
  lastNotice = { text, at: now };
  if (again && showing?.action) return;
  notice = showBanner(text, { ms: NOTICE_MS });
}

// ── The banner ──────────────────────────────────────────────────────────
// Every one-line notice floats over the top of the screen and fades away by
// itself; it never takes room in the page, so nothing under it moves (Ben,
// 2026-10-16: "notifications should not appear in the primary UI space").
// One shows at a time: a new one takes the place of the one showing.
//
// showBanner(text, options) shows it and returns its handle:
// {close(), focus(), open}. close() puts it away only while it is still the
// one showing. Options:
// - action {label, fn}: its yellow button (↩️ Undo). A tap runs fn, then
//   the banner goes.
// - ms: how long it waits before fading (fadeAway: a finger, the mouse or
//   focus on it holds it).
// - onClose(why): runs once when it goes, however it goes ('closed', 'faded'
//   or 'replaced'), so its owner can forget what its Undo would undo.
// - focusBack: an element, or a function finding one, that takes focus when
//   the banner goes with focus inside it. Without one, focus goes back to
//   where it was when the banner came.
//
// A modal dialog makes the rest of the page inert, so while one is open the
// banner moves inside it; as a popover it sits in the top layer, over the
// dialog and the sticky header alike.
export const BANNER_MS = 8000;
let showing = null;   // {box, handle, onClose, focusBack, before, action}
// Whether a banner shows now (tips.js waits for a notice or an Undo to go).
export const bannerShowing = () => !!showing;
let home = null;      // where the banner lives in index.html
const wired = new WeakSet();

const pop = (box, on) => {
  try { if (on) box.showPopover?.(); else box.hidePopover?.(); } catch { /* already so, or no popovers here */ }
};

function bannerParts() {
  const box = typeof document === 'undefined' ? null : document.querySelector('#banner');
  if (typeof box?.querySelector !== 'function') return null;   // a test's stand-in document
  const parts = { box, text: box.querySelector('#banner-text'), action: box.querySelector('#banner-action'), close: box.querySelector('#banner-close') };
  if (!wired.has(box)) {
    wired.add(box);
    home = box.parentElement;
    parts.close.addEventListener('click', () => showing?.handle.close());
    parts.action.addEventListener('click', () => {
      const s = showing;
      if (!s?.action) return;
      s.action.fn();
      s.handle.close();   // a no-op when fn showed a banner of its own
    });
  }
  return parts;
}

// The open dialog the person is in (or the last one opened), else home.
function placeBanner(box) {
  const open = [...document.querySelectorAll('dialog[open]')];
  const host = open.find((d) => d.contains(document.activeElement)) ?? open.at(-1) ?? home;
  if (!host || box.parentElement === host) return;
  pop(box, false);
  host.append(box);
  if (host === home) return;
  // The dialog closing hides what is inside it: the banner goes home.
  host.addEventListener('close', () => {
    if (showing?.box !== box || box.parentElement !== host) return;
    placeBanner(box);
    pop(box, true);
  }, { once: true });
}

function endBanner(s, why) {
  if (showing !== s) return;
  showing = null;
  const { box } = s;
  stopFade(box);
  if (why !== 'replaced') {
    const hadFocus = box.contains(document.activeElement);
    box.hidden = true;
    pop(box, false);
    if (hadFocus) {
      const back = typeof s.focusBack === 'function' ? s.focusBack() : s.focusBack;
      const to = back ?? (s.before?.isConnected ? s.before : null);
      to?.focus?.({ preventScroll: true });
    }
  }
  s.onClose?.(why);
}

export function showBanner(text, { action = null, ms = BANNER_MS, onClose = null, focusBack = null } = {}) {
  const parts = bannerParts();
  const s = { box: parts?.box, action, onClose, focusBack, before: null, handle: null };
  s.handle = {
    close: () => endBanner(s, 'closed'),
    focus: () => { if (showing === s) (action ? parts.action : parts.close).focus(); },
    get open() { return showing === s; },
  };
  if (!parts) return s.handle;
  const { box } = parts;
  const inside = box.contains(document.activeElement);
  const prev = showing?.box === box ? showing : null;
  s.before = prev ? prev.before : inside ? null : document.activeElement;
  if (prev) endBanner(prev, 'replaced');
  showing = s;
  parts.text.textContent = text;
  parts.action.textContent = action?.label ?? '';
  parts.action.hidden = !action;
  box.classList.toggle('has-action', !!action);
  placeBanner(box);
  box.hidden = false;
  pop(box, true);
  // It slides in again when a new one replaces the one showing.
  box.classList.remove('banner-in');
  void box.offsetWidth;
  box.classList.add('banner-in');
  fadeAway(box, ms, { then: () => endBanner(s, 'faded') });
  if (inside && !action) parts.close.focus();   // its Undo had focus, and is gone
  return s.handle;
}

// Says something to screen readers only, for changes that have no visible
// text of their own (a pad picked up to be moved).
export function announce(text) {
  const live = $('#announce');
  if (!live) return;
  live.textContent = '';
  // A region that is cleared and refilled a moment later is read again even
  // when the words are the same as last time.
  setTimeout(() => { live.textContent = text; }, 50);
}

// Notices fade away by themselves (Ben, 2026-10-11: "all notices should"):
// after `ms` the element fades out over FADE_MS, then is hidden (a bar) or
// emptied (a line of text, `clear`). A finger, the mouse or keyboard focus on
// it holds it, and leaving starts the wait again. `then()` runs once it has
// gone. stopFade() stops the wait for an element put away some other way.
export const FADE_MS = 600;
const fading = new WeakMap();   // element -> {timer, ms, clear, stopped}
export function fadeAway(el, ms = 8000, { clear = false, then = null } = {}) {
  if (!el) return;
  const was = fading.get(el);
  if (was) clearTimeout(was.timer);
  el.classList.remove('fading');
  const state = { ms, clear, timer: 0, stopped: false };
  const run = () => {
    clearTimeout(state.timer);
    if (state.stopped) return;
    state.timer = setTimeout(() => {
      el.classList.add('fading');
      state.timer = setTimeout(() => {
        el.classList.remove('fading');
        if (clear) el.textContent = ''; else el.hidden = true;
        state.stopped = true;
        then?.();
      }, FADE_MS);
    }, ms);
  };
  const hold = () => { clearTimeout(state.timer); if (!state.stopped) el.classList.remove('fading'); };
  // The handlers are added once and act on the latest wait, so a second
  // notice in the same element holds as well as the first.
  if (!was) {
    el.addEventListener('pointerenter', () => fading.get(el)?.hold());
    el.addEventListener('focusin', () => fading.get(el)?.hold());
    el.addEventListener('pointerleave', () => fading.get(el)?.run());
    el.addEventListener('focusout', () => fading.get(el)?.run());
  }
  state.run = run;
  state.hold = hold;
  fading.set(el, state);
  // Focus already inside holds it from the start.
  if (!el.contains?.(globalThis.document?.activeElement)) run();
}
export function stopFade(el) {
  const state = el && fading.get(el);
  if (state) { clearTimeout(state.timer); state.stopped = true; }
  el?.classList.remove('fading');
}

// The header (title, ❓, ⚙️ and the person's round button) is the full title
// row at the top of a screen. Scrolled past it, its buttons ride in a slim
// bar at the top left with ⬆️ back to the top (Ben, 2026-10-11, Q26), so the
// person's button stays in view. styles.css draws both from the one class
// body.head-slim; the header keeps its height, so nothing jumps.
export const SLIM_AFTER = 12;   // px scrolled: the title row starts to leave the top
export const isSlim = (scrollY) => scrollY > SLIM_AFTER;

export function trackSlimHead({ win = globalThis.window, doc = globalThis.document, body = doc?.body, toTop = doc?.querySelector('#to-top') } = {}) {
  if (!win || !body) return;
  const set = () => body.classList.toggle('head-slim', isSlim(win.scrollY || 0));
  win.addEventListener?.('scroll', set, { passive: true });
  set();
  toTop?.addEventListener('click', () => {
    const still = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    win.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    // ⬆️ goes away at the top: keep the keyboard's place on the board's name.
    doc?.querySelector('#board-title')?.focus?.({ preventScroll: true });
  });
}
