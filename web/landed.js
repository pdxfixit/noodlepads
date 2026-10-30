// ✨ Landed: where something just went. When a beat, song, take or sound is
// kept, the button that opens its collection (🗂️ Beats, 🗂️ Songs, 🎬 Takes,
// 🔊 Pads) glows once, as a pad does when it is pressed, so a kid sees where
// it went without reading a line. The look is `.landed` in styles.css (a
// steady ring instead of a pulse under reduced motion). Every match glows: the
// same button is in the bar, the keys view and the slim bar.

const GLOW_MS = 700;
const timers = new WeakMap();

export function landed(selector) {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll(selector)) {
    clearTimeout(timers.get(el));
    el.classList.remove('landed');
    void el.offsetWidth;   // so a second save right after the first glows again
    el.classList.add('landed');
    timers.set(el, setTimeout(() => el.classList.remove('landed'), GLOW_MS));
  }
}
