// A beat row's buttons look alike (Ben, 2026-10-12: "the buttons need to be
// consistent -- especially those on the beat rows (mute, overlap etc)"):
// 🔔 🔊 🧹 ✕ and ⋯ are one class, .icon-btn, the same outlined square; on
// is the app's one yellow fill; 🔊 draws its loudness as a bar along its
// bottom, not a ring. The keys view's compact rows scale the same squares.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

test('a row\'s 🔔 🔊 🧹 ✕ and ⋯ share one class, the speaker in Song\'s lanes too', async () => {
  const { installPage } = await import('./fake-dom.mjs');
  installPage({});
  const { rowParts, rowSpeaker } = await import('../web/beat-row.js');
  const { makeSpeaker } = await import('../web/row-volume.js');
  const labels = { remove: 'Remove', removeAsk: 'Remove?', clear: 'Clear', clearAsk: 'Clear?', pick: 'Pick' };
  const data = { remove: { remove: 0 }, clear: { clear: 0 }, pick: { pick: 0 } };
  const { tools } = rowParts({ emoji: '🦶', ring: { on: true, data: { ring: 0 }, label: 'Overlap' },
    speaker: rowSpeaker(0, { level: 0.5, muted: true, name: 'Kick' }), data, labels, more: { key: 0, label: 'More' } });
  const kinds = tools.children.map((c) => c.className.split(' ')[0]);
  assert.deepEqual(kinds, ['row-ring', 'speaker', 'row-clear', 'row-x', 'more-btn']);
  for (const b of tools.children) assert.ok(b.classList.contains('icon-btn'), `${b.className}: one shared look`);
  assert.equal(tools.querySelector('.row-ring').getAttribute('aria-pressed'), 'true', '🔔 on is pressed');
  assert.equal(tools.querySelector('.speaker').getAttribute('aria-pressed'), 'true', '🔊 muted is pressed');
  assert.ok(makeSpeaker(1, { level: 1, muted: false, name: 'Drums' }, 'lane-vol').classList.contains('icon-btn'), 'Song\'s lane speaker');
});

test('the CSS: one 44 px outlined square; on is the yellow fill; asking is red; no tool-specific look left', () => {
  const base = rule('.icon-btn');
  assert.match(base, /min-width: 44px;/);
  assert.match(base, /height: 44px;/);
  assert.match(base, /border: 2px solid rgb\(255 255 255 \/ 0\.5\);/, 'outlined like .seq-tool');
  assert.match(rule('.seq-tool'), /border: 2px solid rgb\(255 255 255 \/ 0\.5\);/, 'the beat bar\'s tools have the same outline');
  assert.match(rule('.icon-btn[aria-pressed="true"]'), /background: var\(--led\);/, 'on: the yellow of the chosen bars');
  assert.match(rule('.seq-barsel button[aria-pressed="true"]'), /background: var\(--led\);/);
  assert.match(rule('.icon-btn.armed'), /background: #B3261E;/, 'asking first: red');
  for (const old of ['.row-ring[aria-pressed="true"]', '.row-ring', '.row-x, .row-clear', '.speaker:hover', '.speaker.muted'])
    assert.equal(rule(old), '', `${old} no longer draws its own look`);
  assert.equal(rule('.dj-grid-row .icon-btn'), '', 'with ⌨️ Keys on too, the full 44 px squares (Ben, 2026-10-26)');
});

test('the speaker draws its loudness as a bar along its bottom, not a ring', () => {
  const bar = rule('.speaker::before');
  assert.match(bar, /bottom: 4px;/);
  assert.match(bar, /linear-gradient\(to right, var\(--led\) calc\(var\(--level\) \* 100%\)/, 'filled to the level');
  assert.doesNotMatch(css, /\.speaker[^{]*\{[^}]*conic-gradient/, 'no ring');
  assert.doesNotMatch(bar, /mask/, 'no ring mask');
  assert.doesNotMatch(rule('.speaker'), /border-radius: 50%/, 'square, like the tools beside it');
  assert.match(rule('.speaker[aria-pressed="true"]::before'), /var\(--ink\)/, 'muted: the bar stays readable on the yellow');
});

test('the mixer\'s Mute and Solo light the same yellow when on', () => {
  assert.match(rule('.mix-mute[aria-pressed="true"], .mix-solo[aria-pressed="true"]'), /background: var\(--led\);/);
});
