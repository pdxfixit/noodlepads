// A group's header on 🔊 Pads (Ben, 2026-10-18): its tooltip says what it
// is ("🎮 Game: 9 sounds. Tap to open.", not "▸🎮 Game9"), every group's
// count ends the line, after who plays it on Notes, Chords and Bass, and a
// closed group is one box: the stroke is its header's edge.
// Not tested here: how the boxes look (checked with just look pads).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { tipFor } from '../web/tooltips.js';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const header = (id) => page.$('#pads').querySelectorAll('.pad-group').find((h) => h.dataset.group === id);

test('a group header\'s tooltip is its name and count, in words', async () => {
  const game = header('game');
  const n = game.parent.querySelectorAll('.pad-group-count')[0].textContent;
  const open = game.getAttribute('aria-expanded') === 'true';
  assert.equal(game.getAttribute('aria-label'), `🎮 Game: ${n} sounds. Tap to ${open ? 'close' : 'open'}.`);
  assert.equal(tipFor(game), game.getAttribute('aria-label'), 'the tooltip is the label');
});

test('Notes, Chords and Bass: the count comes after who plays them, at the end of the line', () => {
  for (const id of ['notes', 'chords', 'bass']) {
    const row = header(id).parent;
    assert.ok(row.classList.contains('pad-group-inst'), id);
    const kids = row.children;
    assert.equal(kids.at(-1).className, 'pad-group-count', `${id}: the count ends the line`);
    assert.ok(kids.at(-2).classList.contains('inst-pick'), `${id}: after who plays it`);
    assert.equal(header(id).querySelectorAll('.pad-group-count').length, 0);
  }
});

test('a closed group draws one box: its stroke hugs the header', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.pad-fold:not\(:has\(\.pad-group\[aria-expanded="true"\]\)\) \{ outline-offset: 0;/);
  assert.match(css, /\.pad-fold:not\(:has\(\.pad-group\[aria-expanded="true"\]\)\) > :is\(\.pad-group, \.pad-group-row\) \{ box-shadow: none; \}/);
});
