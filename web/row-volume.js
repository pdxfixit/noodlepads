// A beat row's loudness (Ben, 2026-10-11: "a full volume control for that
// particular instrument. So one can do mixing as well as volume. Plain
// muting."). One speaker per row, on Beats and in the keys view's grid:
// tap it to mute or unmute (the level stays), hold or drag it for a
// loudness slider in a small popover beside it. Its icon goes 🔇 🔈 🔉 🔊
// with the level, and a bar along its bottom fills with the level. It is an
// .icon-btn like the row's other tools: lit yellow while muted.
//
// A row stores `volume` (0 to 1) only when it is below full: an older copy
// of the app ignores it and plays the row at full volume.

export const VOLUME_STEP = 0.1;     // ↑ ↓ ← → on a focused speaker
export const SPEAKER_HOLD_MS = 400;  // hold this long and the slider shows
const DRAG_START = 8;                // px a finger moves before it is a drag, not a tap
const DRAG_TRAVEL = 160;             // px of drag from silent to full

// A stored level, made safe: 0 to 1 in hundredths, full when missing or wrong.
export function cleanVolume(v) {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}
export const rowLevel = (row) => cleanVolume(row?.volume);
// Sets a row's level in place; full volume is stored as no `volume` at all.
export function setRowLevel(row, v) {
  const level = cleanVolume(v);
  if (level >= 1) delete row.volume; else row.volume = level;
  return level;
}
export const percent = (level) => Math.round(cleanVolume(level) * 100);
// One step up or down from a level, landing on the tens (73 % ↑ is 80 %).
export function stepLevel(level, dir) {
  const tens = Math.round(cleanVolume(level) * 100) / 10;
  const next = dir > 0 ? Math.floor(tens + 1e-9) + 1 : Math.ceil(tens - 1e-9) - 1;
  return cleanVolume(next / 10);
}
// The speaker's icon: 🔇 muted or silent, then 🔈 🔉 🔊 as it gets louder.
export function speakerIcon(level, muted) {
  const v = cleanVolume(level);
  if (muted || v === 0) return '🔇';
  return v < 0.34 ? '🔈' : v < 0.67 ? '🔉' : '🔊';
}
export const speakerLabel = (name, level, muted) => `${name} loudness ${percent(level)} %${muted ? ', muted' : ''}`;

// Draws a speaker for a row (a button with `data-speaker="<key>"`), or
// brings one up to date. `name` is the row's sound, for its spoken label.
export function drawSpeaker(b, { level, muted, name }) {
  b.textContent = speakerIcon(level, muted);
  b.style.setProperty('--level', String(cleanVolume(level)));
  b.setAttribute('aria-pressed', String(!!muted));
  b.setAttribute('aria-label', speakerLabel(name, level, muted));
  b.title = muted ? 'Muted: tap to hear it. Hold or drag for loudness.' : 'Tap to mute. Hold or drag for loudness.';
  b.classList.toggle('muted', !!muted);
  return b;
}
export function makeSpeaker(key, state, extraClass = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `speaker icon-btn${extraClass ? ` ${extraClass}` : ''}`;
  b.dataset.speaker = key;
  return drawSpeaker(b, state);
}

// The speakers under `root`. `state(key)` gives {level, muted, name} for a
// row; `toggle(key)` mutes or unmutes it; `change(key, level, done)` sets
// its level, `done` false while a drag or slide is still going and true at
// its end (save then, and offer Undo once for the whole gesture). Returns
// {close(), refresh()}: refresh() redraws the open popover after the rows
// were drawn again. `inline(key)`, if given, says the row already shows its
// own slider (a wide screen): a hold or drag then sets the level there, with
// no popover.
export function speakerControls(root, { state, toggle, change, inline = () => false }) {
  let press = null;     // the pointer down on a speaker: {key, x, y, level, timer, dragging}
  let swallow = false;  // the click that ends a hold or drag is not a tap
  let pop = null;       // the popover: {box, slider, num, key}
  const speakerOf = (t) => t?.closest?.('[data-speaker]');
  const find = (key) => root.querySelector(`[data-speaker="${CSS.escape(String(key))}"]`);

  function makePop() {
    const box = document.createElement('div');
    box.className = 'vol-pop';
    box.hidden = true;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.className = 'vol-slider';
    const num = document.createElement('output');
    num.className = 'vol-num';
    box.append(slider, num);
    slider.addEventListener('input', () => { if (pop) { change(pop.key, Number(slider.value) / 100, false); refresh(); } });
    slider.addEventListener('change', () => { if (pop) { change(pop.key, Number(slider.value) / 100, true); refresh(); } });
    slider.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !pop) return;
      e.preventDefault();
      const key = pop.key;
      close();
      find(key)?.focus();
    });
    document.body.append(box);
    return { box, slider, num, key: null };
  }
  function open(key) {
    if (inline(key)) return;
    pop ??= makePop();
    pop.key = key;
    pop.box.hidden = false;
    refresh();
  }
  function close() {
    if (!pop || pop.box.hidden) return;
    pop.box.hidden = true;
    pop.key = null;
  }
  // The popover shows the row's level, beside its speaker: to its left when
  // there is room (the speakers sit at a row's right end), else to its right.
  function refresh() {
    if (!pop || pop.box.hidden) return;
    const b = find(pop.key);
    if (!b) { close(); return; }
    const s = state(pop.key);
    if (!s) { close(); return; }
    if (document.activeElement !== pop.slider || !press) pop.slider.value = String(percent(s.level));
    pop.slider.setAttribute('aria-label', `${s.name} loudness`);
    pop.slider.setAttribute('aria-valuetext', `${percent(s.level)} %`);
    pop.num.textContent = `${percent(s.level)} %`;
    pop.box.style.setProperty('--level', String(s.level));
    const r = b.getBoundingClientRect();
    const w = pop.box.offsetWidth || 220;
    const h = pop.box.offsetHeight || 52;
    const vw = document.documentElement.clientWidth || window.innerWidth || 0;
    let left;
    let top = r.top + r.height / 2 - h / 2;
    if (r.left - w - 8 >= 8) left = r.left - w - 8;
    else if (r.right + 8 + w <= vw - 8) left = r.right + 8;
    else {
      // A phone: no room at either side, so above the speaker (below it at
      // the top of the screen), never over it.
      left = r.left + r.width / 2 - w / 2;
      top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    }
    left = Math.max(8, Math.min(left, vw - w - 8));
    pop.box.style.left = `${left}px`;
    pop.box.style.top = `${Math.max(8, top)}px`;
  }

  root.addEventListener('pointerdown', (e) => {
    const b = speakerOf(e.target);
    if (!b || e.button !== 0 || b.disabled) return;
    swallow = false;
    const key = b.dataset.speaker;
    const s = state(key);
    if (!s) return;
    clearTimeout(press?.timer);
    press = { key, x: e.clientX, y: e.clientY, level: s.level, dragging: false,
      timer: setTimeout(() => { if (press?.key === key) { swallow = true; open(key); } }, SPEAKER_HOLD_MS) };
  });
  window.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) < DRAG_START) return;
    if (!press.dragging) {
      press.dragging = true;
      clearTimeout(press.timer);
      swallow = true;
      open(press.key);
    }
    // Right or up is louder, whichever way the finger went further.
    const by = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
    change(press.key, cleanVolume(press.level + by / DRAG_TRAVEL), false);
    refresh();
  });
  const release = () => {
    if (!press) return;
    clearTimeout(press.timer);
    const { key, dragging } = press;
    press = null;
    if (dragging) { change(key, state(key)?.level ?? 1, true); refresh(); }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  // A phone's long-press menu would cover the slider.
  root.addEventListener('contextmenu', (e) => { if (speakerOf(e.target)) e.preventDefault(); });

  root.addEventListener('click', (e) => {
    const b = speakerOf(e.target);
    if (!b) return;
    if (swallow) { swallow = false; return; }
    // Shift (Shift-click, Shift+Enter, Shift+Space) does what a hold does.
    if (e.shiftKey) { open(b.dataset.speaker); return; }
    toggle(b.dataset.speaker);
    refresh();
  });
  // Enter and Space are the button's own click (mute); arrows change the level.
  root.addEventListener('keydown', (e) => {
    const b = speakerOf(e.target);
    if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Escape' && pop && !pop.box.hidden) { e.preventDefault(); close(); return; }
    if (!dir) return;
    e.preventDefault();
    const s = state(b.dataset.speaker);
    if (!s) return;
    change(b.dataset.speaker, stepLevel(s.level, dir), true);
    refresh();
  });
  // It stays where it opened (fixed, over the page), so a scroll closes it.
  window.addEventListener('scroll', () => { if (!press) close(); }, { passive: true });
  // A tap anywhere but the popover or its speaker closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!pop || pop.box.hidden) return;
    if (pop.box.contains(e.target)) return;
    const b = speakerOf(e.target);
    if (b && b.dataset.speaker === pop.key && root.contains(b)) return;
    close();
  }, true);
  return { close, refresh, isOpen: () => !!pop && !pop.box.hidden, key: () => pop?.key ?? null };
}
