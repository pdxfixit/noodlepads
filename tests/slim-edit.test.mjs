// ✏️ Edit keys in the slim bar (Ben, 2026-10-18): on 🥁 Beats with ⌨️ Keys
// on, scrolled, a twin of the ✏️ at the foot of the keys rides at the right of
// the slim bar, as ✏️ Edit sounds does on Pads. It says Edit keys or Edit
// layout with the one at the foot and opens the same view. Where it sits is
// checked with `just look keys-on --scroll 700 --wide`; this checks the
// wiring, and the styles as text.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keysOn, keysOff } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = () => {};
});
after(() => keysOff(page));

const word = () => $('#dj-change-top').querySelector('.edit-more').textContent;

test('the slim bar holds ✏️ Edit keys, shown only on Beats with ⌨️ Keys on once scrolled', () => {
  const header = html.slice(html.indexOf('<header class="top">'), html.indexOf('</header>'));
  assert.match(header, /<button type="button" class="slim-edit" id="dj-change-top">✏️ Edit<span class="edit-more"> keys<\/span><\/button>/,
    'its text is the foot one\'s, so its name and tooltip are too; on a phone the word hides, as on Pads');
  assert.match(css, /\.slim-edit \{ display: none; \}/, 'hidden everywhere else (🎤 Live, Keys off, the top of the screen)');
  assert.match(css, /body\.head-slim\.keys-on \.slim-edit \{[^}]*position: fixed;[^}]*right: max\(var\(--gutter\)[^}]*display: block;[^}]*min-height: 44px;/);
});

test('with ⌨️ Keys on, the slim bar\'s ✏️ opens ✏️ Edit keys, and with 👆 ✏️ Edit layout, as the foot\'s does', () => {
  keysOn(page);
  assert.ok(document.body.classList.contains('keys-on'));
  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit keys');
  assert.equal(word(), ' keys');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#keys-edit').open, true, 'the keys\' own view');
  assert.equal($('#touch-edit').open, false);
  $('#keys-edit').close();

  $('#dj-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit layout');
  assert.equal(word(), ' layout', 'kept in step with the foot\'s');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#touch-edit').open, true, 'the touch layout\'s own view');
  assert.equal($('#keys-edit').open, false);
  $('#touch-edit').close();
  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
});
