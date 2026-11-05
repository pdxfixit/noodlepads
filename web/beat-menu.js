// The 🎛️ key on 🥁 Beats' control bar and the settings panel it opens
// (docs/design/beat-menu.md; Ben, 2026-11-05: "bars and tempo are rarely used;
// they could all be moved into a sub menu"). The bar keeps what a kid taps
// while playing; the tempo, ⏲️ Click track, Bars, Feel, the time signature,
// 🎚️ Mixer and ⇆ Move sit in one panel under the bar. One for ⌨️ Keys off
// (sequencer.js) and on (dj.js), at every width. 🎼 Song and 🎤 Live keep the
// generic tempo key (tempo-key.js).
//
// The key shows 🎛️ over the tempo and a dot while ⏲️ is on, so a ticking click
// is never hidden. The panel closes on the key again, on Esc (focus back on
// the key), or on a tap outside, and that tap only closes it: it is swallowed
// before it plays a pad or flips a pill. Opening or closing changes nothing
// else: nothing is stored, a beat, ⏲️ or a recording goes on, and it starts
// closed. The controls inside are the screens' own, moved here as they were.

export function beatMenu(key, panel, deck, { bpm, clicking = () => false, doc = globalThis.document } = {}) {
  const num = key.querySelector('.beat-key-num');
  const isOpen = () => key.getAttribute('aria-expanded') === 'true';

  // The key's face and name: the tempo, and whether ⏲️ ticks.
  function show() {
    const v = String(bpm());
    if (num && num.textContent !== v) num.textContent = v;
    const click = !!clicking();
    key.classList.toggle('click-on', click);
    const label = `Beat settings, tempo ${v}${click ? ', click track on' : ''}`;
    if (key.getAttribute('aria-label') !== label) key.setAttribute('aria-label', label);
  }

  // A tap outside the key and the panel only closes it. A dialog on top (🎚️ Mixer)
  // is not outside: its taps are its own. A deck that is not on screen (another
  // screen, no beat) lets the tap through and closes.
  const hiddenNow = () => deck.isConnected === false || !!panel.closest?.('[hidden]') || !!deck.closest?.('[hidden]');
  const OUTSIDE = ['pointerdown', 'mousedown', 'touchstart'];
  const REST = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'];
  let swallowTimer = 0;
  function endSwallow() {
    clearTimeout(swallowTimer);
    for (const type of REST) doc.removeEventListener(type, rest, true);
  }
  // The rest of that same tap (its up, mouse and click events) goes nowhere too:
  // until its click, or 600 ms.
  function rest(e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.type === 'click') endSwallow();
  }
  function outside(e) {
    const t = e.target;
    if (!t || key.contains(t) || panel.contains(t) || t.closest?.('dialog')) return;
    const gone = hiddenNow();
    setOpen(false);
    if (gone) return;
    e.stopPropagation();
    e.preventDefault();
    for (const type of REST) doc.addEventListener(type, rest, true);
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(endSwallow, 600);
  }
  function listen(on) {
    for (const type of OUTSIDE) doc[on ? 'addEventListener' : 'removeEventListener'](type, outside, true);
  }

  function setOpen(on) {
    if (on === isOpen()) return;
    key.setAttribute('aria-expanded', String(on));
    deck.classList.toggle('menu-open', on);
    listen(on);
    show();
  }
  key.addEventListener('click', () => setOpen(!isOpen()));
  // Esc closes it, unless the Esc was ending something inside it (typing a tempo).
  deck.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !isOpen()) return;
    e.preventDefault();   // handled: the page's Esc (⏹️ Stop all, app.js) stands down
    setOpen(false);
    key.focus();
  });
  return { show, isOpen, close: () => setOpen(false) };
}
