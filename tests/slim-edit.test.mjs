// ✏️ Edit keys in the slim bar (Ben, 2026-10-18): on 🥁 Beats with ⌨️ Keys
// on and on 🎤 Live, scrolled, a twin of the ✏️ at the foot of the keys rides
// at the right of the slim bar, as ✏️ Edit sounds does on Pads. It says Edit
// keys or Edit layout with the one at the foot and opens the same view. Under
// it, Beats with ⌨️ Keys keeps its control bar stuck while the keys scroll, as
// with Keys off. Where they sit is checked with `just look keys-on --scroll
// 700 --wide` and `just look live --scroll 700 --wide`; this checks the
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

test('the slim bar holds ✏️ Edit keys, shown only on Beats with ⌨️ Keys on and on 🎤 Live once scrolled', () => {
  const header = html.slice(html.indexOf('<header class="top">'), html.indexOf('</header>'));
  assert.match(header, /<button type="button" class="slim-edit" id="dj-change-top">✏️ Edit<span class="edit-more"> keys<\/span><\/button>/,
    'its text is the foot one\'s, so its name and tooltip are too; on a phone the word hides, as on Pads');
  assert.match(css, /\.slim-edit \{ display: none; \}/, 'hidden everywhere else (Pads, Song, Keys off, the top of the screen)');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \{[^}]*position: fixed;[^}]*right: max\(var\(--gutter\)[^}]*display: block;[^}]*min-height: 44px;/,
    'on Beats with ⌨️ Keys and on 🎤 Live');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \.edit-more \{[^}]*clip-path: inset\(50%\)/, 'just ✏️ Edit on a phone, on both');
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

test('on 🎤 Live the slim bar\'s ✏️ opens ✏️ Edit keys or ✏️ Edit layout too, kept in step with the foot\'s', () => {
  $('#live-tab').dispatch('click');
  assert.ok(document.body.classList.contains('screen-live'), 'the class its style keys on');
  assert.equal(document.body.classList.contains('keys-on'), false, 'Live is not Beats with ⌨️ Keys');
  $('#dj-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit layout');
  assert.equal(word(), ' layout');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#touch-edit').open, true, 'the touch layout\'s own view');
  $('#touch-edit').close();

  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit keys');
  assert.equal(word(), ' keys');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#keys-edit').open, true, 'the keys\' own view');
  assert.equal($('#touch-edit').open, false);
  $('#keys-edit').close();
  $('#pads-tab').dispatch('click');
});

// The media block that opens at `query` (a top-level @media), as text.
const block = (query) => {
  const at = css.indexOf(`@media (${query}) {\n  body.keys-on`);
  assert.ok(at >= 0, `an @media (${query}) block for Beats with ⌨️ Keys`);
  return css.slice(at, css.indexOf('\n}', at));
};

test('Beats with ⌨️ Keys: under 900 px the control bar sticks under the slim bar while the keys scroll, as with Keys off', () => {
  // Keys off: the whole bar under 900 px, only ▶ Play · tempo on a phone.
  assert.match(css, /@media \(max-width: 899px\) \{\n  \.seq \.beat-deck \{ position: sticky;/);
  const mid = block('max-width: 899px');
  assert.match(mid, /body\.keys-on \.dj-bar \{ position: sticky; top: var\(--head-h, 0px\); z-index: 6; \}/,
    'the whole bar, under the slim bar (never over it or its ✏️), over the keys and the beat\'s rows');
  assert.doesNotMatch(css, /@media \(min-width: 900px\)[^{]*\{[^}]*\.dj-bar[^}]*position: sticky/, 'from 900 px it scrolls, as Keys off\'s does');
  assert.doesNotMatch(mid, /screen-live/, '🎤 Live\'s bar scrolls');
});

test('on a phone only the Keys control bar\'s first line, ▶ Play · ● Record, sticks', () => {
  const run = html.match(/<div class="beat-run">([\s\S]*?)<\/div>/);
  assert.ok(run, 'the first line has a box of its own');
  assert.deepEqual([...run[1].matchAll(/id="([^"]+)"/g)].map((m) => m[1]), ['dj-play', 'dj-record']);
  assert.ok(html.indexOf('<div class="beat-more">') > html.indexOf('<div class="beat-run">'), 'the tempo and ⏲️ after it, in a box of their own');
  assert.match(css, /\.beat-run, \.beat-more \{ display: contents; \}/, 'both lay out as if not there, elsewhere');
  const phone = block('max-width: 600px');
  assert.match(phone, /body\.keys-on \.dj-bar, body\.keys-on \.dj-bar > \.beat-go \{ display: contents; \}/, 'its lines become the panel\'s own, so one can stick over the keys');
  assert.match(phone, /body\.keys-on \.dj-bar \.beat-run \{ position: sticky; top: var\(--head-h, 0px\); z-index: 6; \}/);
  assert.doesNotMatch(phone, /\.beat-more \{[^}]*sticky|beat-shape \{[^}]*sticky/, 'the tempo line and the bars scroll away');
});
