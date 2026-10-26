// ✏️ Layout in the slim bar (Ben, 2026-10-18): on 🥁 Beats with ⌨️ Keys on
// and on 🎤 Live, scrolled, a twin of the ✏️ at the foot of the keys rides at
// the right of the slim bar, as ✏️ Edit sounds does on Pads. ✏️ Layout opens
// the editor at once everywhere, and its top line picks ⌨️ Keys or 👆 Pads
// (Ben, 2026-10-19). Under it, Beats with ⌨️ Keys keeps its control bar stuck
// while the keys scroll, as with Keys off. Where they sit is checked with
// `just look keys-on --scroll 700 --wide` and `just look live --scroll 700
// --wide`; this checks the wiring, and the styles as text.

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

const pressed = (sw) => $(sw).querySelectorAll('[data-input]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.input);

test('the slim bar holds ✏️ Layout, shown only on Beats with ⌨️ Keys on and on 🎤 Live once scrolled', () => {
  const header = html.slice(html.indexOf('<header class="top">'), html.indexOf('</header>'));
  assert.match(header, /<button type="button" class="slim-edit" id="dj-change-top" aria-label="✏️ Layout: how the keys or pads are laid out">✏️<span class="edit-more"> Layout<\/span><\/button>/,
    'its name and tooltip are the foot one\'s');
  assert.match(css, /\.slim-edit \{ display: none; \}/, 'hidden everywhere else (Pads, Song, Keys off, the top of the screen)');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \{[^}]*position: fixed;[^}]*right: max\(var\(--gutter\)[^}]*display: block;[^}]*height: 44px;/,
    'on Beats with ⌨️ Keys and on 🎤 Live');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit \{[^}]*width: 44px;[^}]*font-size: 0;/,
    'just ✏️ at every width, on both (Ben, 2026-10-19): its words stay in its text, for screen readers and its tooltip');
  assert.match(css, /body\.head-slim:is\(\.keys-on, \.screen-live\) \.slim-edit::before \{ content: "✏️";/);
});

test('with ⌨️ Keys on, ✏️ Layout (the bar\'s, the slim bar\'s) opens the keys\' view with ⌨️ Keys and the bands\' with 👆 Pads', () => {
  keysOn(page);
  assert.ok(document.body.classList.contains('keys-on'));
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.equal($('#dj-change').hidden, true, '🎤 Live\'s own ✏️ hides: the bar\'s is after 🎚️');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#keys-edit').open, true, 'the keys\' own view');
  assert.equal($('#touch-edit').open, false);
  $('#keys-edit').close();
  // Beats' control bar has it too, after 🎚️, and the keys' foot has none:
  // one tap, the editor, no menu (Ben, 2026-10-19).
  assert.equal($('#dj-change-bar').textContent, '✏️ Layout');
  assert.equal($('#dj-change-bar').hasAttribute('aria-haspopup'), false);
  $('#dj-change-bar').dispatch('click');
  assert.equal($('#keys-edit').open, true, 'the editor at once');
  assert.equal(document.querySelector('.more-pop')?.hidden ?? true, true, 'no menu');
  $('#keys-edit').close();
  assert.equal(document.querySelector('[data-pick-input], [data-pick-edit], .input-menu'), null, 'the old menu is gone');
  assert.equal(document.querySelector('#dj-input'), null, 'and the switch by the keys: it lives in ✏️ Layout');
  assert.match(css, /@media \(max-width: 600px\) \{\n  #dj-change-bar \{ display: none; \}\n  body\.keys-on #dj-change-tempo \{ display: block; \}/, 'on a phone after ⏲️: the bars\' line is full');
  // A grid on a phone (Ben, 2026-10-19): ⏲️ over 🎚️ and ✏️ over ⇆, each 48 px, the same gaps, both lines right-aligned.
  assert.match(css, /body\.keys-on \.dj-bar :is\(#dj-beat-click, #dj-change-tempo\) \{ width: 48px; padding: 0; \}/);
  assert.match(css, /body\.keys-on \.dj-bar > \.beat-shape \{ gap: 8px; \}\n  body\.keys-on \.dj-bar > \.beat-shape \.mixer-open \{ margin-left: auto; \}/);
  assert.match(css, /body\.keys-on \.dj-bar \.beat-more, body\.keys-on \.dj-bar > \.beat-shape \{ gap: 6px; \}/, 'both lines alike on the narrowest');

  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').hidden, true, 'whichever plays');
  assert.equal($('#dj-change-bar').textContent, '✏️ Layout');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#touch-edit').open, true, 'the touch layout\'s own view');
  assert.equal($('#keys-edit').open, false);
  $('#touch-edit').close();
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
});

// Ben, 2026-10-19: "the edit keys should take the keys/pads toggle into it,
// and be renamed … Layout". Both views carry ⌨️ Keys | 👆 Pads in their title
// line; the other one swaps the view, and what plays, at once.
test('✏️ Layout\'s ⌨️ Keys | 👆 Pads picks what plays, and swaps the view open for the other one\'s', () => {
  keysOn(page);
  for (const id of ['#ke-input', '#te-input']) {
    const sw = $(id);
    assert.ok(sw.closest('.ke-head'), `${id} is in its view's title line`);
    assert.deepEqual(sw.querySelectorAll('[data-input]').map((b) => b.textContent), ['⌨️ Keys', '👆 Pads']);
  }
  assert.equal($('#keys-edit-title').textContent, '✏️ Layout');
  assert.equal($('#touch-edit-title').textContent, '✏️ Layout');
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  $('#dj-change-bar').dispatch('click');
  assert.equal($('#keys-edit').open, true);
  assert.equal($('#ke-input').hidden, false, 'shown from 700 px');
  assert.deepEqual(pressed('#ke-input'), ['keys']);

  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#keys-edit').open, false, 'the keys\' view closes');
  assert.equal($('#touch-edit').open, true, 'the bands\' opens in its place');
  assert.deepEqual(pressed('#te-input'), ['touch']);
  assert.deepEqual(pressed('#ke-input'), ['touch'], 'both switches say the same');
  assert.equal($('#dj-touch').hidden, false, 'and the pads play behind it');
  assert.equal($('#dj-keys').hidden, true);

  $('#te-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#touch-edit').open, true, 'the one already on changes nothing');
  $('#te-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.equal($('#touch-edit').open, false);
  assert.equal($('#keys-edit').open, true, 'and back');
  assert.equal($('#dj-keys').hidden, false);
  $('#keys-edit').close();
});

test('on 🎤 Live ✏️ Layout (on its bar, the slim bar\'s) opens the keys\' or the bands\' view too', () => {
  $('#live-tab').dispatch('click');
  assert.ok(document.body.classList.contains('screen-live'), 'the class its style keys on');
  assert.equal(document.body.classList.contains('keys-on'), false, 'Live is not Beats with ⌨️ Keys');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').hidden, false, 'Live\'s own, on its bar');
  assert.ok($('.dj-bar').contains($('#dj-change')));
  assert.equal($('#dj-change').dataset.word, 'Layout');
  $('#dj-change-top').dispatch('click');
  assert.equal($('#touch-edit').open, true, 'the touch layout\'s own view');
  $('#touch-edit').close();

  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  $('#dj-change').dispatch('click');
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
  // It sticks all under the slim bar (--deck-h, mini-deck.test.mjs), until ▾ drops it down.
  assert.match(css, /\n\.seq \.beat-deck \{ position: sticky; top: calc\(var\(--head-h, 0px\) - var\(--deck-h, 0px\)\);/);
  assert.match(css, /\nbody\.keys-on \.dj-bar \{ position: sticky; top: calc\(var\(--head-h, 0px\) - var\(--deck-h, 0px\)\); z-index: 6; \}/,
    'the whole bar, under the slim bar (never over it or its ✏️), over the keys and the beat\'s rows');
  assert.doesNotMatch(css, /screen-live[^{]*\.dj-bar[^{]*\{[^}]*position: sticky/, '🎤 Live\'s bar scrolls');
});

test('on a phone the Keys control bar is one line, ▶ Play · ● Record · the tempo key · ⏲️ · ✏️, and the whole bar sticks (it tucks into the slim bar, mini-deck.test.mjs)', () => {
  const run = html.match(/<div class="beat-run">([\s\S]*?)<\/div>/);
  assert.ok(run, 'the first line has a box of its own');
  assert.deepEqual([...run[1].matchAll(/id="([^"]+)"/g)].map((m) => m[1]), ['dj-play', 'dj-record']);
  assert.ok(html.indexOf('<div class="beat-more">') > html.indexOf('<div class="beat-run">'), 'the tempo and ⏲️ after it, in a box of their own');
  assert.match(css, /\.beat-run, \.beat-more \{ display: contents; \}/, 'both lay out as if not there, elsewhere');
  // Ben, 2026-10-26: one line on a phone; the boxes lay out as if not there.
  assert.match(css, /body\.keys-on \.dj-bar > \.beat-go \{ display: flex; \}/, 'one line of its own');
  assert.doesNotMatch(css, /body\.keys-on \.dj-bar :is\(\.beat-run, \.beat-more\) \{ display: flex/, 'no box a line of its own');
  const phone = block('max-width: 600px');
  assert.doesNotMatch(phone, /sticky/, 'no line sticks on its own: the bar does, at every width');
});

// A phone has no keyboard to play (Ben, 2026-10-19): under 700 px the pads
// always show, ✏️ Layout has no ⌨️ Keys | 👆 Pads (🎤 Live too), and Beats'
// button is just ✏️, after ⏲️.
test('on a phone: pads only, no switch, and the bar\'s ✏️ edits them at once', () => {
  const wide = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q.includes('max-width: 699px'), addEventListener() {} });
  try {
    keysOn(page);
    $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');   // a pick made on a computer
    assert.equal($('#ke-input').querySelector('[data-input="touch"]').getAttribute('aria-pressed'), 'true', 'pads, whatever was picked');
    assert.equal($('#dj-change-tempo').textContent, '✏️');
    assert.equal($('#dj-change-tempo').getAttribute('aria-label'), '✏️ Layout: how the pads are laid out');
    $('#dj-change-tempo').dispatch('click');
    assert.equal($('#touch-edit').open, true, 'the pads\' own view, at once');
    assert.equal($('#te-input').hidden, true, 'no ⌨️ Keys | 👆 Pads');
    assert.equal($('#ke-input').hidden, true);
    $('#touch-edit').close();
  } finally {
    globalThis.matchMedia = wide;
    $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
    keysOff(page);
  }
});

// S M L and Q / D are set in ✏️ Edit keys, at every width (Ben, 2026-10-19:
// "the layout editor is where Q/D can be changed as well as S/M/L").
test('S M L and Q / D sit in ✏️ Layout\'s keys view, over its keys, not by the keys you play', () => {
  const look = document.querySelector('.ke-look');
  assert.ok(look, 'a line for them');
  assert.ok($('#keys-edit').contains(look), 'in ✏️ Edit keys');
  assert.ok(look.contains($('#dj-size')) && look.contains($('#dj-layout-keys')));
  assert.equal($('#dj').contains($('#dj-size')), false);
  assert.equal($('#dj').contains($('#dj-layout-keys')), false);
});
