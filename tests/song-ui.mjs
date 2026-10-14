// Helpers for driving 🎼 Song's playlist on the stand-in page (ADR 0024):
// pick a beat in the strip, drop it on a lane, read the blocks back.

// The strip's beat chips.
export const stripChips = ($) => $('#song-beats').children;
export const chipName = (c) => c.querySelector(".chip-name").textContent;
// The blocks on lane `lane`: [{bar, len, name, el}], in bar order.
export function blocksOn($, lane = 0) {
  const track = $(`#song-lanes [data-track="${lane}"]`);
  return (track?.children ?? []).filter((c) => c.dataset.block !== undefined)
    .map((el) => ({ bar: Number(el.style.props['--at']), len: Number(el.style.props['--len']), name: el.querySelector('.block-name').textContent, el }))
    .sort((a, b) => a.bar - b.bar);
}
export const allBlocks = ($) => $('#song-lanes').querySelectorAll('.song-block');
// A spot (bar) on lane `lane`, to tap.
export const cellAt = ($, lane, bar) => $(`#song-lanes [data-track="${lane}"]`).children.find((c) => c.dataset.bar === String(bar));

// Picks the beat named `name` (or the first) in the strip, if not picked yet.
export function pickBeat($, name) {
  const chip = name ? stripChips($).find((c) => chipName(c) === name) : stripChips($)[0];
  if (!chip) throw new Error(`no beat ${name ?? ''} in the song's strip`);
  if (chip.getAttribute('aria-pressed') !== 'true') chip.dispatch('click');
  return chip;
}
// Picks a beat and drops it on lane `lane` right after its last block (or at `bar`).
export function dropBeat($, { lane = 0, bar, name } = {}) {
  pickBeat($, name);
  const at = bar ?? blocksOn($, lane).reduce((end, b) => Math.max(end, b.bar + b.len), 0);
  cellAt($, lane, at).dispatch('click');
}
