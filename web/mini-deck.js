// The play bar tucked into the slim top band (Ben, 2026-10-19): on 🥁 Beats,
// once the control bar reaches the top and would stick, it hides and single
// buttons ride at the right of the slim band instead, apart from its round
// button, ❓, ⚙️ and ⬆️ at the left: ▶ Play (■ Stop), ● Record (⌨️ Keys on),
// then ✏️ Edit keys (Keys on), and ▾ at the very right, which drops the whole
// bar down under the band (▴ puts it away). Scrolled back up to the bar, it shows in its place.
// The buttons are twins: each one clicks the bar's own, and copies its state.
//
// The band never grows, so as it runs out of room things give way in Ben's
// order (STEPS): ⬆️, then ● Record, then ❓, then ✏️ (Edit keys: its twin on
// the bar is a ▾ away), then ⚙️. Each step is a class on <body>;
// styles.css says what it hides.

import { fitStep } from './lines.js';

export const STEPS = ['tuck-notop', 'tuck-norec', 'tuck-nohelp', 'tuck-noedit', 'tuck-nosettings'];

// The bar is tucked when it has reached the place it sticks, on Beats, with
// the header slim. Pure, for the tests: `top` is where the bar is on screen,
// `stickAt` where it sticks.
export function isTucked({ beats, slim, shown, top, stickAt }) {
  return !!(beats && slim && shown && top <= stickAt + 1);
}

export function initMiniDeck({ doc = globalThis.document, win = globalThis.window } = {}) {
  const body = doc?.body;
  const $ = (s) => doc.querySelector(s);
  const box = $('#mini-deck');
  if (!box || !win) return null;
  const mini = { play: $('#mini-play'), rec: $('#mini-rec'), more: $('#mini-more') };
  const keys = () => body.classList.contains('keys-on');
  // The bar on screen, and its own ▶ Play and ● Record.
  const deck = () => (keys() ? $('.dj-bar') : $('#seq-deck'));
  const play = () => (keys() ? $('#dj-play') : $('#seq-play'));
  const rec = () => (keys() ? $('#dj-record') : null);

  // Copies the bar's buttons: pressed, dimmed, shown, and ▶ or ■.
  function sync() {
    const p = play();
    const r = rec();
    const playing = p?.getAttribute('aria-pressed') === 'true';
    mini.play.textContent = playing ? '■' : '▶';
    mini.play.setAttribute('aria-label', playing ? 'Stop' : 'Play');
    mini.play.setAttribute('aria-pressed', String(playing));
    mini.play.disabled = !!p?.disabled;
    mini.play.hidden = !p || p.hidden;
    const recording = r?.getAttribute('aria-pressed') === 'true';
    mini.rec.textContent = recording ? '■' : '●';
    mini.rec.setAttribute('aria-label', recording ? 'Stop recording' : 'Record');
    mini.rec.setAttribute('aria-pressed', String(recording));
    mini.rec.classList.toggle('recording', recording);
    mini.rec.disabled = !!r?.disabled;
    mini.rec.hidden = !r || r.hidden;
    const open = body.classList.contains('deck-open');
    mini.more.textContent = open ? '▴' : '▾';
    mini.more.setAttribute('aria-expanded', String(open));
  }

  // The first step at which the buttons at the left end at least 16 px before
  // these at the right (▶ ● ✏️ ▾, from the screen's edge).
  function fit() {
    const apply = (n) => STEPS.forEach((c, i) => body.classList.toggle(c, i < n));
    if (!body.classList.contains('deck-tucked')) { apply(0); return; }
    const tools = $('.title-tools');
    const fits = () => tools.getBoundingClientRect().right + 16 <= box.getBoundingClientRect().left;
    apply(fitStep(STEPS.length, (n) => { apply(n); return fits(); }));
  }

  function update() {
    const d = deck();
    const rect = d?.getBoundingClientRect();
    const tucked = isTucked({
      beats: body.classList.contains('screen-beats'),
      slim: body.classList.contains('head-slim'),
      shown: !!rect?.height,
      top: rect?.top ?? 0,
      stickAt: d ? parseFloat(win.getComputedStyle?.(d).top) || 0 : 0,
    });
    const was = body.classList.contains('deck-tucked');
    body.classList.toggle('deck-tucked', tucked);
    // toggle(c, false) leaves the class attribute alone when it is already off;
    // remove() rewrites it, which would wake the observer below, forever.
    if (!tucked) body.classList.toggle('deck-open', false);
    sync();
    if (tucked !== was) fit();
  }

  mini.play.addEventListener('click', () => { play()?.click(); sync(); });
  mini.rec.addEventListener('click', () => { rec()?.click(); sync(); });
  mini.more.addEventListener('click', () => { body.classList.toggle('deck-open'); sync(); });

  win.addEventListener('scroll', update, { passive: true });
  win.addEventListener('resize', () => { update(); fit(); });
  // The bar's buttons change from anywhere (the bar itself, Space, Stop all),
  // and ⌨️ Keys or the screen changes which bar it is.
  if (typeof MutationObserver === 'function') {
    const watch = { attributes: true, attributeFilter: ['aria-pressed', 'disabled', 'hidden'], childList: true, characterData: true, subtree: true };
    const mo = new MutationObserver(sync);
    for (const b of ['#seq-play', '#dj-play', '#dj-record']) { const e = $(b); if (e) mo.observe(e, watch); }
    let keysWas = keys();
    new MutationObserver(() => {
      if (keys() !== keysWas) { keysWas = keys(); update(); fit(); } else update();
    }).observe(body, { attributes: true, attributeFilter: ['class'] });
  }
  update();
  return { update, sync, fit };
}
