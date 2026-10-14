// Page-wide bits every module uses: element lookup, the notice bar, and a
// quiet announcer for screen readers. Nothing here runs until it is called,
// so modules that import it can still be loaded outside a browser.

import { logEvent } from './log.js';

export const $ = (sel) => document.querySelector(sel);

// One line near the top of the page for things the user should know (a save
// that failed, a backup that loaded). It is a status region, so screen
// readers read it out.
//
// The Settings dialog covers the page, and a backup is saved and loaded from
// it, so the same words also go to the status line inside it. Every notice is
// written to the event log too, so a problem report shows what the user
// was told.
export function showNotice(text) {
  const notice = $('#notice');
  notice.textContent = text;
  notice.hidden = !text;
  const inDialog = $('#settings-note');
  if (inDialog) inDialog.textContent = text;
  if (text) logEvent('notice', { text });
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
// it holds it, and leaving starts the wait again.
export const FADE_MS = 600;
const fading = new WeakMap();   // element -> {timer, ms, clear}
export function fadeAway(el, ms = 8000, { clear = false } = {}) {
  if (!el) return;
  const was = fading.get(el);
  if (was) clearTimeout(was.timer);
  el.classList.remove('fading');
  const state = { ms, clear, timer: 0 };
  const run = () => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      el.classList.add('fading');
      state.timer = setTimeout(() => {
        el.classList.remove('fading');
        if (clear) el.textContent = ''; else el.hidden = true;
      }, FADE_MS);
    }, ms);
  };
  const hold = () => { clearTimeout(state.timer); el.classList.remove('fading'); };
  if (!was) {
    el.addEventListener('pointerenter', () => hold());
    el.addEventListener('focusin', () => hold());
    el.addEventListener('pointerleave', () => fading.get(el)?.run());
    el.addEventListener('focusout', () => fading.get(el)?.run());
  }
  state.run = run;
  fading.set(el, state);
  run();
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
