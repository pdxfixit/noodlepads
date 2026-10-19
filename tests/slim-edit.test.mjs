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
    'its text is the foot one\'s, so its name and tooltip are too');
  assert.match(css, /\.slim-edit \{ display: none; \}/, 'hidden everywhere else (Pads, Song, Keys off, the top of the screen)');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \{[^}]*position: fixed;[^}]*right: max\(var\(--gutter\)[^}]*display: block;[^}]*height: 44px;/,
    'on Beats with ⌨️ Keys and on 🎤 Live');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \{[^}]*width: 44px;[^}]*font-size: 0;/,
    'just ✏️ at every width, on both (Ben, 2026-10-19): its words stay in its text, for screen readers and its tooltip');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit::before \{ content: "✏️";/);
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
  // Beats' control bar has it too, after 🎚️, and the keys' foot has none (Ben,
  // 2026-10-19). It opens a menu: ⌨️ Keys · 👆 Tiles · ✏️ Edit keys, so the
  // ⌨️ / 👆 switch by the keys goes on Beats.
  assert.equal($('#dj-change-bar').textContent, '✏️⌨️');
  assert.equal($('#dj-change-bar').getAttribute('aria-label'), '⌨️ Keys or 👆 Tiles, and ✏️ Edit layout');
  $('#dj-change-bar').dispatch('click');
  assert.equal($('#keys-edit').open, false, 'a menu first, not the editor');
  const pop = () => document.querySelector('.more-pop');
  const items = () => pop().querySelectorAll('[data-more-item]').map((b) => b.textContent);
  assert.equal(pop().hidden, false);
  assert.deepEqual(items(), ['⌨️ Keys', '👆 Tiles', '✏️ Edit layout']);
  assert.equal(pop().querySelectorAll('[data-more-item]')[0].getAttribute('aria-checked'), 'true', '⌨️ Keys is the one on');
  pop().querySelectorAll('[data-more-item]')[2].dispatch('click');
  assert.equal($('#keys-edit').open, true, '✏️ Edit layout opens the keys\' editor');
  assert.equal(pop().hidden, true, 'and the menu closes');
  $('#keys-edit').close();
  assert.match(css, /body\.keys-on \.dj-input \{ display: none; \}/, 'the switch by the keys goes on Beats');
  // 👆 Tiles from the menu: what the switch did.
  $('#dj-change-bar').dispatch('click');
  pop().querySelectorAll('[data-more-item]')[1].dispatch('click');
  assert.equal($('#dj-input').querySelector('[data-input="touch"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('#dj-change-bar').textContent, '✏️👆');
  assert.equal(pop().hidden, true);
  $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.match(css, /body\.keys-on \.dj-change-row \{ display: none; \}/, 'no ✏️ at the keys\' foot on Beats; 🎤 Live keeps its own');
  assert.match(css, /@media \(max-width: 600px\) \{\n  #dj-change-bar \{ display: none; \}\n  body\.keys-on #dj-change-tempo \{ display: block; \}/, 'on a phone after ⏲️: the bars\' line is full');
  // A grid on a phone (Ben, 2026-10-19): ⏲️ over 🎚️ and ✏️ over ⇆, each 48 px, the same gaps, both lines right-aligned.
  assert.match(css, /body\.keys-on \.dj-bar :is\(#dj-beat-click, #dj-change-tempo\) \{ width: 48px; padding: 0; \}/);
  assert.match(css, /body\.keys-on \.dj-bar > \.beat-shape \{ gap: 8px; \}\n  body\.keys-on \.dj-bar > \.beat-shape \.mixer-open \{ margin-left: auto; \}/);
  assert.match(css, /body\.keys-on \.dj-bar \.beat-more, body\.keys-on \.dj-bar > \.beat-shape \{ gap: 6px; \}/, 'both lines alike on the narrowest');

  $('#dj-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit layout');
  assert.equal(word(), ' layout', 'kept in step with the foot\'s');
  assert.equal($('#dj-change-bar').textContent, '✏️👆');
  assert.equal($('#dj-change-bar').getAttribute('aria-label'), '⌨️ Keys or 👆 Tiles, and ✏️ Edit layout');
  assert.equal($('#dj-change-tempo').textContent, '✏️👆', 'its phone twin, after ⏲️, too');
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

test('Beats with ⌨️ Keys: the control bar sticks under the slim bar while the keys scroll, at every width, as with Keys off', () => {
  // Ben, 2026-10-19: on a computer it scrolled away. edge-scroll.test.mjs checks neither rule is inside an @media.
  assert.match(css, /\n\.seq \.beat-deck \{ position: sticky; top: var\(--head-h, 0px\);/);
  assert.match(css, /\nbody\.keys-on \.dj-bar \{ position: sticky; top: var\(--head-h, 0px\); z-index: 6; \}/,
    'the whole bar, under the slim bar (never over it or its ✏️), over the keys and the beat\'s rows');
  assert.doesNotMatch(css, /screen-live[^{]*\.dj-bar[^{]*\{[^}]*position: sticky/, '🎤 Live\'s bar scrolls');
});

test('on a phone the Keys control bar\'s lines are ▶ Play · ● Record, then the tempo and ⏲️, and the whole bar sticks (it tucks into the slim bar, mini-deck.test.mjs)', () => {
  const run = html.match(/<div class="beat-run">([\s\S]*?)<\/div>/);
  assert.ok(run, 'the first line has a box of its own');
  assert.deepEqual([...run[1].matchAll(/id="([^"]+)"/g)].map((m) => m[1]), ['dj-play', 'dj-record']);
  assert.ok(html.indexOf('<div class="beat-more">') > html.indexOf('<div class="beat-run">'), 'the tempo and ⏲️ after it, in a box of their own');
  assert.match(css, /\.beat-run, \.beat-more \{ display: contents; \}/, 'both lay out as if not there, elsewhere');
  const phone = block('max-width: 600px');
  assert.match(phone, /body\.keys-on \.dj-bar > \.beat-go \{ display: contents; \}/, 'its two boxes become the bar\'s own lines');
  assert.match(phone, /body\.keys-on \.dj-bar :is\(\.beat-run, \.beat-more\) \{ display: flex; flex: 1 1 100%;/);
  assert.doesNotMatch(phone, /sticky/, 'no line sticks on its own: the bar does, at every width');
});

// A phone has no keyboard to play (Ben, 2026-10-19): under 700 px the tiles
// always show, the ⌨️ / 👆 switch goes (🎤 Live too), and Beats' button is
// just ✏️, which opens ✏️ Edit layout at once, no menu.
test('on a phone: tiles only, and the bar\'s ✏️ edits them at once', () => {
  const wide = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q.includes('max-width: 699px'), addEventListener() {} });
  try {
    keysOn(page);
    $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');   // a pick made on a computer
    assert.equal($('#dj-input').querySelector('[data-input="touch"]').getAttribute('aria-pressed'), 'true', 'tiles, whatever was picked');
    assert.equal($('#dj-change').textContent, '✏️ Edit layout');
    assert.equal($('#dj-change-tempo').textContent, '✏️');
    assert.equal($('#dj-change-tempo').getAttribute('aria-label'), '✏️ Edit layout');
    assert.equal($('#dj-change-tempo').hasAttribute('aria-haspopup'), false);
    $('#dj-change-tempo').dispatch('click');
    assert.equal($('#touch-edit').open, true, 'the tiles\' own view, at once');
    assert.equal(document.querySelector('.more-pop')?.hidden ?? true, true, 'no menu');
    $('#touch-edit').close();
    assert.match(css, /@media \(max-width: 699px\) \{ \.dj-input \{ display: none; \} \}/);
  } finally {
    globalThis.matchMedia = wide;
    $('#dj-input').querySelector('[data-input="keys"]').dispatch('click');
    keysOff(page);
  }
});

// S M L and Q / D are set in ✏️ Edit keys, at every width (Ben, 2026-10-19:
// "the layout editor is where Q/D can be changed as well as S/M/L").
test('S M L and Q / D sit in ✏️ Edit keys, over its keys, not by the keys you play', () => {
  const look = document.querySelector('.ke-look');
  assert.ok(look, 'a line for them');
  assert.ok($('#keys-edit').contains(look), 'in ✏️ Edit keys');
  assert.ok(look.contains($('#dj-size')) && look.contains($('#dj-layout-keys')));
  assert.equal($('#dj').contains($('#dj-size')), false);
  assert.equal($('#dj').contains($('#dj-layout-keys')), false);
});
