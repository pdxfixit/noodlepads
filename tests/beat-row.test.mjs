// One beat panel (Ben, 2026-10-12): Beats with ⌨️ Keys off and on draw a
// row's emoji and its 🔊 · 🧹 · ✕ with the same code (web/beat-row.js) and
// the same classes, and the emoji column is only as wide as the widest emoji
// shown (no room kept for a twin's letter when there is none). The tools sit
// at the row's right (Ben, 2026-10-12: "move the X and clear icons to the
// right side"), in a line: on Beats on the row's header line, over its pills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowEmoji, twinRows } from '../web/beat-row.js';

const read = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');

test('a row shows just its emoji, with a letter only when another row shows the same one', () => {
  assert.deepEqual([...twinRows(['🦶', '🥁', '🎩'])], [], 'no twins');
  assert.deepEqual([...twinRows(['🥁', '🦶', '🥁'])], [0, 2]);
  assert.equal(rowEmoji('🦶', false, 'K'), '🦶');
  assert.equal(rowEmoji('🥁', true, 'S'), '🥁 S');
  assert.equal(rowEmoji('🥁', true, ''), '🥁', 'no letter to add: just the emoji');
});

test('Beats draws its rows with beat-row.js, ⌨️ Keys off and on', () => {
  for (const f of ['sequencer.js', 'dj.js']) {
    const code = read(f);
    assert.match(code, /from '\.\/beat-row\.js'/, f);
    assert.match(code, /rowParts\(/, f);
    assert.match(code, /rowSpeaker\(/, f);
  }
});

test('with ⌨️ Keys on, the emoji column is as wide as the widest emoji shown: rows are a subgrid, no fixed width', () => {
  const css = read('styles.css');
  for (const [parent, row] of [['.dj-grid', '.dj-grid-row']]) {
    const cols = css.match(new RegExp(`^\\${parent} \\{[^}]*grid-template-columns: ([^;]+);`, 'm'))?.[1];
    assert.ok(cols, `${parent} has its columns`);
    const emojiCol = cols.split(/ (?![^(]*\))/).at(-3);   // emoji · pills · tools: the emoji is third from the end
    assert.equal(emojiCol, 'auto', `${parent}: the emoji column sizes to its widest emoji`);
    const rule = css.match(new RegExp(`^\\${row} \\{[^}]*\\}`, 'm'))?.[0] ?? '';
    assert.match(rule, /grid-template-columns: subgrid/, `${row} shares its parent's columns, so pills line up`);
  }
  assert.doesNotMatch(css, /2\.6rem minmax/, 'the old fixed emoji column is gone');
});

test('a row\'s tools are one group at its right: 🔊 · 🧹 · ✕, as the sound sheet\'s layer rows end in 🔈 and ✕', async () => {
  const { installPage } = await import('./fake-dom.mjs');
  installPage({});
  const { rowParts, rowSpeaker } = await import('../web/beat-row.js');
  const labels = { remove: 'Remove', removeAsk: 'Remove?', clear: 'Clear', clearAsk: 'Clear?', pick: 'Pick' };
  const data = { remove: { remove: 0 }, clear: { clear: 0 }, pick: { pick: 0 } };
  const { pick, tools } = rowParts({ emoji: '🦶', speaker: rowSpeaker(0, { level: 1, muted: false }), data, labels });
  assert.equal(pick.className, 'row-emoji');
  assert.equal(tools.className, 'row-tools');
  assert.deepEqual(tools.children.map((c) => c.className.split(' ')[0]), ['speaker', 'row-clear', 'row-x'], '✕ last, at the very edge');
  assert.deepEqual(tools.children.slice(1).map((c) => c.getAttribute('aria-label')), ['Clear', 'Remove'], 'named for screen readers');
  const asked = rowParts({ emoji: '🦶', asked: 'remove', data, labels }).tools;
  assert.equal(asked.querySelector('.row-x').textContent, '✕?', 'still asks first, in red');
  assert.ok(asked.querySelector('.row-x').classList.contains('armed'));
  const locked = rowParts({ emoji: '🦶', locked: true, data, labels }).tools;
  assert.ok([...locked.children].every((b) => b.style.visibility === 'hidden'), 'recording: unseen, keeping their place');

  const css = read('styles.css');
  const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  assert.match(rule('.seq-head'), /display: flex/, 'Beats: one header line at every width');
  assert.match(rule('.seq-head > .row-tools'), /margin-left: auto/, 'Beats: the tools at the header line\'s right');
  assert.doesNotMatch(css, /\.seq-row > \.row-tools/, 'no stacked column of tools on a phone any more');
  assert.match(rule('.row-tools'), /display: flex/, 'in a line, ⌨️ Keys on and off');
});
