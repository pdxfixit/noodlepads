// The tempo key (docs/design/tempo-collapse.md; Ben, 2026-10-26). On a phone
// a control bar's tempo folds into one key: the number over ▾. A tap opens the
// tempo as a line of its own under the bar (styles.css, "The tempo key": 🐢 ⌄
// slider ⌃ 🐇 and the number to type); the key again, or Esc, closes it. The
// line covers nothing, so the pads and rows under the bar keep playing while
// it is open. Wider screens never show the key: their tempo stays in the bar.
//
// One for every bar (Beats, ⌨️ Keys, 🎤 Live's click, 🎼 Song). Each screen
// keeps its own tempo controls inside `box`, and calls show() when its tempo
// changes; this only opens, closes and names the key.

export function tempoKey(key, box, bpm) {
  const num = key.querySelector('.tempo-key-num');
  const isOpen = () => key.getAttribute('aria-expanded') === 'true';
  function show() {
    const v = String(bpm());
    if (num && num.textContent !== v) num.textContent = v;
    // Its name says the tempo and what a tap does (the tooltip reads it too).
    const label = `Tempo ${v} BPM: tap to ${isOpen() ? 'close it' : 'change it'}`;
    if (key.getAttribute('aria-label') !== label) key.setAttribute('aria-label', label);
  }
  function setOpen(on) {
    key.setAttribute('aria-expanded', String(on));
    box.classList.toggle('tempo-open', on);
    show();
  }
  key.addEventListener('click', () => setOpen(!isOpen()));
  // Esc closes it, unless the Esc was ending something inside it (typing a number).
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !isOpen()) return;
    setOpen(false);
    key.focus();
  });
  return { show, isOpen, close: () => setOpen(false) };
}
