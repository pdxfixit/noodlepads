// Tooltips on nearly everything (Ben, 2026-10-12): every control the started
// app shows has a title, from its label or text; a hand-written one stays.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { tipFor, addTips, touched } from '../web/tooltips.js';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('a tip comes from the label, else the text', () => {
  const b = document.createElement('button');
  b.textContent = '  🆕   New ';
  assert.equal(tipFor(b), '🆕 New');
  b.setAttribute('aria-label', 'Start a blank beat');
  assert.equal(tipFor(b), 'Start a blank beat');
});

test('every button in the started app has a tooltip', () => {
  addTips(document);   // the stand-in page has no MutationObserver
  const missing = [...document.querySelectorAll('button')].filter((b) => tipFor(b) && !b.getAttribute('title'));
  assert.deepEqual(missing.map((b) => b.id || b.className), []);
});

test('a title written by hand is kept; an automatic one follows its label', () => {
  const own = document.createElement('button');
  own.setAttribute('title', 'Mine');
  own.setAttribute('aria-label', 'Theirs');
  document.body.append(own);
  const auto = document.createElement('button');
  auto.setAttribute('aria-label', 'Remove');
  document.body.append(auto);
  addTips(document);
  assert.equal(own.getAttribute('title'), 'Mine');
  assert.equal(auto.getAttribute('title'), 'Remove');
  auto.setAttribute('aria-label', 'Remove? Tap again');
  addTips(document);
  assert.equal(auto.getAttribute('title'), 'Remove? Tap again');
});

// Only what changed is looked at again (Ben, 2026-10-19: the pill drag
// lagged while every label change re-tipped every control on the page).
test('a batch of page changes touches only the controls in it', () => {
  const box = document.createElement('div');
  const b = document.createElement('button');
  const added = document.createElement('span');
  box.append(b);
  const text = { nodeType: 3, parentElement: b };
  const out = touched([
    { target: b, addedNodes: [] },               // its label changed
    { target: text, addedNodes: [] },            // its text changed
    { target: box, addedNodes: [added, text] },  // new things inside a plain box
  ]);
  assert.deepEqual([...out].length, 2);
  assert.ok(out.has(b) && out.has(added), 'the button once, and what was added; not the box, not the page');
});
