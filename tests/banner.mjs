// The banner over the top of the screen (ui.js showBanner): every one-line
// notice, and ↩️ Undo after a change. One shows at a time, so a test asks
// whether an Undo is offered, not only whether the banner shows: a notice
// from earlier (no storage on the stand-in page, say) may still be up.

import { onFileEnd } from './file-end.mjs';

export const bannerShown = () => !document.querySelector('#banner').hidden;
export const hasUndo = () => bannerShown() && !document.querySelector('#banner-action').hidden;

// For a test that runs a module without the stand-in page (a failed save
// shows a notice): just the banner's parts, as showBanner uses them.
// `text.textContent` is what the notice said; `box.hidden` whether it shows.
export function stubBanner() {
  const el = (extra = {}) => ({
    textContent: '', hidden: true,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, focus() {}, contains: () => false,
    ...extra,
  });
  const parts = { '#banner-text': el(), '#banner-action': el(), '#banner-close': el() };
  const box = el({ querySelector: (s) => parts[s] ?? null, append() {}, parentElement: null });
  // A notice fades away on a 10 s timer (ui.js fadeAway) that nothing in such a
  // test stops, and the file would wait for it: stop it when the file's tests are done.
  onFileEnd(async () => (await import('../web/ui.js')).stopFade(box));
  globalThis.document ??= { querySelector: (s) => (s === '#banner' ? box : null), querySelectorAll: () => [], activeElement: null };
  return { box, text: parts['#banner-text'] };
}
