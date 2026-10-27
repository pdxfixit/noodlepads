// A beat row's ends, the same on Beats and in the keys view (Ben, 2026-10-12:
// "more consistent (and the whole UI) between dj + beats"): the emoji before
// the pills, and the row's tools after them, at its right: 🔔 · 🔊 · 🧹 · ✕, as
// the sound sheet's layer rows end in 🔈 and ✕ (Ben, 2026-10-12: "move the X
// and clear icons to the right side … match other interface lines"). The
// tools sit in a line (styles.css, .row-tools) and look alike: each is an
// .icon-btn, the same outlined square, lit yellow while on (Ben, 2026-10-12:
// "the buttons need to be consistent -- especially those on the beat rows"). Each screen places the parts
// and handles the taps by the data-* names it passes here: Beats puts the
// emoji and tools on a row's header line, its pills below (sequencer.js);
// with ⌨️ Keys on a row is one line, emoji · pills · tools (dj.js).
//
// With ⌨️ Keys on the rows sit on one parent grid (styles.css, .dj-grid) and
// take its columns as a subgrid, so the emoji column is as wide as the
// widest emoji actually shown: just the emoji, unless two rows share one and
// a letter tells them apart. Every row's pills still start at the same place.

import { makeSpeaker } from './row-volume.js';
import { moreButton, movable } from './overflow.js';

// What a row's emoji button shows: its sound's emoji, with a letter after
// it when another row shows the same emoji (several drums share 🥁).
export const rowEmoji = (emoji, twin, letter) => (twin && letter ? `${emoji} ${letter}` : emoji);

// Which rows share an emoji with another row: a Set of their indexes.
export function twinRows(emojis) {
  const seen = new Map();
  emojis.forEach((e) => seen.set(e, (seen.get(e) ?? 0) + 1));
  return new Set(emojis.flatMap((e, i) => (seen.get(e) > 1 ? [i] : [])));
}

// A row button. The tools are .icon-btn, the app's one icon-button look
// (styles.css); the emoji stays plain, the row's picture.
function tool(className, text, label, data, look = 'icon-btn') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = look ? `${className} ${look}` : className;
  b.textContent = text;
  b.setAttribute('aria-label', label);
  Object.assign(b.dataset, data);
  return b;
}

// One row's emoji button and its tools: {pick, tools}. The screen puts
// `pick` before the pills and `tools` after them.
// - asked: 'remove' or 'clear' while that button waits for its second tap
//   (it turns red and says so: destructive actions ask first).
// - canClear: the row has a pill to clear (else 🧹 waits).
// - locked: recording into the beat: ✕ and 🧹 keep their place, unseen, so
//   the rows don't shift, and the emoji waits.
// - ring: the row's 🔔 Let it ring, {on, data, label}: pressed, its hits ring
//   over each other; else each hit cuts off the last (Ben, 2026-10-12: "per
//   sound… next to mute, clear, etc"). First of the tools, before the speaker.
// - speaker: the row's speaker (rowSpeaker).
// - data: the data-* names and values each button carries: {remove, clear, pick}.
// - labels: {remove, removeAsk, clear, clearAsk, pick}, for screen readers.
// - more: {key, label} gives the tools a ⋯ at their end: where the line runs
//   out of room, 🔔 🧹 ✕ move into its menu and 🔊 stays (overflow.js; Ben,
//   2026-10-12).
// - menu: {key, label, change: [icon, word], extra}: the emoji itself opens
//   the row's menu (overflow.js) and only 🔊 shows beside it (Ben,
//   2026-10-25: Beats' rows keep their controls on the left). The menu lists
//   🔄 Change sound (a button carrying data.pick), 🔔 🧹 ✕ and `extra` (more
//   buttons, ↑ ↓), each a real button the CSS keeps out of sight.
export function rowParts({ asked = null, canClear = true, locked = false, emoji, title = '', pickable = true, ring = null, speaker, data, labels, more = null, menu = null }) {
  const x = tool('row-x', asked === 'remove' ? '✕?' : '✕', asked === 'remove' ? labels.removeAsk : labels.remove, data.remove);
  x.classList.toggle('armed', asked === 'remove');
  const sweep = tool('row-clear', asked === 'clear' ? '🧹?' : '🧹', asked === 'clear' ? labels.clearAsk : labels.clear, data.clear);
  sweep.classList.toggle('armed', asked === 'clear');
  sweep.disabled = !canClear;
  for (const b of [x, sweep]) b.style.visibility = locked ? 'hidden' : '';
  const pick = tool('row-emoji', emoji, labels.pick, data.pick, '');
  pick.title = title;
  pick.disabled = !pickable || locked;
  const bell = ring && tool('row-ring', '🔔', ring.label, ring.data);
  if (bell) {
    bell.setAttribute('aria-pressed', String(!!ring.on));
    bell.title = ring.on ? 'Let it ring is on: hits ring over each other' : 'Let it ring is off: each hit cuts off the last';
  }
  const tools = document.createElement('div');
  tools.className = 'row-tools';
  if (menu) {
    const change = tool('row-change', menu.change[0], labels.pick, data.pick);
    change.disabled = pick.disabled;
    const opens = tool('row-emoji', emoji, menu.label, { more: menu.key }, '');
    opens.title = title;
    opens.disabled = locked;
    opens.setAttribute('aria-haspopup', 'menu');
    opens.setAttribute('aria-expanded', 'false');
    movable(change, menu.change[1]);
    movable(bell, 'Let it ring');
    movable(sweep, 'Clear');
    movable(x, 'Remove');
    tools.append(...[speaker, change, bell, sweep, x, ...(menu.extra ?? [])].filter(Boolean));
    return { pick: opens, tools };
  }
  if (more) {
    movable(bell, 'Let it ring');
    movable(sweep, 'Clear');
    movable(x, 'Remove');
  }
  tools.append(...[bell, speaker, sweep, x, more && moreButton(more.key, more.label)].filter(Boolean));
  return { pick, tools };
}

// The row's speaker, first of its tools: tap mutes, hold or drag sets its
// loudness (row-volume.js, ADR 0015).
export const rowSpeaker = (key, level) => makeSpeaker(key, level, 'row-vol');
