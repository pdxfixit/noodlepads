// 🥁 Beats' play bar tucks into the slim bar (Ben, 2026-10-19): once the
// control bar has scrolled all the way under it, it hides, and ▶ (■) and ▾ ride
// in the slim bar beside ⬆️; ▾ drops the whole bar down. ● Record stays on the
// bar, so ⬆️ has room (Ben, 2026-10-25). As the slim bar runs out of room,
// ⬆️, ❓, ✏️, then ⚙️ give way. Where they sit
// is checked with `just look beat-groove keys-on --scroll 700 --wide`; this
// checks the rule, the order and the wiring.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keysOn, keysOff, newBeatWithRow } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { isTucked, STEPS } from '../web/mini-deck.js';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
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

test('the bar is tucked once it reaches where it sticks, on Beats with the header slim', () => {
  const at = { beats: true, slim: true, shown: true, top: 52, stickAt: 52 };
  assert.equal(isTucked(at), true);
  assert.equal(isTucked({ ...at, top: 140 }), false, 'still below the slim bar: in its place');
  assert.equal(isTucked({ ...at, slim: false }), false, 'the top of the screen');
  assert.equal(isTucked({ ...at, beats: false }), false, 'Pads, Song, Live');
  assert.equal(isTucked({ ...at, shown: false }), false, 'a bar not on screen');
});

test('the slim bar gives way in Ben\'s order: ⬆️, ❓, ✏️, ⚙️', () => {
  assert.deepEqual(STEPS, ['tuck-notop', 'tuck-nohelp', 'tuck-noedit', 'tuck-nosettings']);
  for (const [cls, what] of [['tuck-notop', '.to-top'], ['tuck-nohelp', '#help-open'], ['tuck-noedit', '.slim-edit'], ['tuck-nosettings', '#settings-open']]) {
    assert.ok(css.includes(`body.deck-tucked.${cls} ${what}`), `${cls} hides ${what}`);
  }
  assert.match(css, /body\.deck-tucked:not\(\.deck-open\) \.seq \.beat-deck,\nbody\.deck-tucked:not\(\.deck-open\)\.keys-on \.dj-bar \{ visibility: hidden; \}/,
    'the bar hides where it sticks, unless ▾ dropped it down');
  assert.match(css, /\.mini-deck \{ display: none; \}/);
  assert.match(css, /body\.deck-tucked \.mini-deck \{\n  position: fixed;[^}]*right: max\(var\(--gutter\)[^}]*display: flex;/, 'at the slim bar\'s right, apart from the buttons at its left');
  assert.match(css, /body\.deck-tucked\.keys-on:not\(\.tuck-noedit\) \.mini-more \{ margin-left: calc\(44px \+ 6px\); \}/, '▶ ✏️ ▾: room for ✏️ before ▾');
  assert.match(css, /body\.deck-tucked\.keys-on \.slim-edit \{ right: calc\(/, '✏️ one button in from the edge');
  const head = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const ids = [...head.slice(head.indexOf('id="mini-deck"'), head.indexOf('</header>')).matchAll(/id="(mini-(?:play|rec|more))"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['mini-play', 'mini-more'], 'no ● Record (it stays on the bar, Ben 2026-10-25), and ▾ last, at the very right');
});

// Ben, 2026-10-25: the bar hid where it stuck, at the slim bar's foot, and
// left a blank band its height over the rows until scrolled that far again.
// It sticks all under the slim bar instead, so it scrolls away whole; ▾ drops
// it down to the slim bar's foot; the band stays over it on its way under.
test('the bar scrolls all the way under the slim bar before it tucks, leaving no blank band', () => {
  const top = 'top: calc(var(--head-h, 0px) - var(--deck-h, 0px));';
  assert.ok(css.includes(`.seq .beat-deck { position: sticky; ${top}`), 'Keys off');
  assert.ok(css.includes(`body.keys-on .dj-bar { position: sticky; ${top}`), 'Keys on');
  assert.match(css, /body\.deck-open \.seq \.beat-deck,\nbody\.deck-open\.keys-on \.dj-bar \{ top: var\(--head-h, 0px\); \}/, '▾ drops it to the slim bar\'s foot');
  const band = css.match(/body\.head-slim \.top::before \{[^}]*z-index: (\d+);/);
  const deck = css.match(/\.seq \.beat-deck \{ position: sticky;[^}]*z-index: (\d+);/);
  assert.ok(Number(band[1]) > Number(deck[1]), 'the slim band covers the bar as it goes under');
  assert.match(css, /:root\[data-bg\] body\.head-slim \.top::after \{[^}]*z-index: 7;/, 'and the band\'s pattern');
});

test('the bar\'s height is measured into --deck-h, Keys off and on', () => {
  $('#beats-toggle').dispatch('click');
  for (const [on, sel] of [[false, '#seq-deck'], [true, '.dj-bar']]) {
    if (on) keysOn(page); else keysOff(page);
    const d = document.querySelector(sel);
    d.getBoundingClientRect = () => ({ left: 0, top: 300, right: 375, bottom: 503.4, width: 375, height: 203.4 });
    page.winEvent('scroll');
    assert.equal(d.style.getPropertyValue('--deck-h'), '203px', sel);
  }
  keysOff(page);
});

// The bar where it sticks: the slim bar's height, as a browser would measure it.
function stuck(el) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 375, bottom: 120, width: 375, height: 120 });
}

test('tucked on Beats: ▶ plays and stops the beat, ▾ drops the whole bar down, and scrolling back up puts it in its place', async () => {
  $('#beats-toggle').dispatch('click');
  newBeatWithRow(page);
  stuck($('#seq-deck'));
  window.scrollY = 600;   // scrolled: ui.js slims the header
  page.winEvent('scroll');
  assert.ok(document.body.classList.contains('deck-tucked'));
  assert.equal($('#mini-play').textContent, '▶');

  $('#mini-play').dispatch('click');
  await page.settle();
  // The beat starts once the audio is unlocked; in a browser a MutationObserver
  // copies the bar's ■ Stop at once. The stand-in page has none: a scroll does.
  page.winEvent('scroll');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'true', 'the bar\'s own ▶ Play');
  assert.equal($('#mini-play').textContent, '■');
  assert.equal($('#mini-play').getAttribute('aria-label'), 'Stop');
  $('#mini-play').dispatch('click');
  assert.equal($('#seq-play').getAttribute('aria-pressed'), 'false');
  assert.equal($('#mini-play').textContent, '▶');

  $('#mini-more').dispatch('click');
  assert.ok(document.body.classList.contains('deck-open'));
  assert.equal($('#mini-more').getAttribute('aria-expanded'), 'true');
  assert.equal($('#mini-more').textContent, '▴');
  $('#seq-deck').getBoundingClientRect = () => ({ left: 0, top: 300, right: 375, bottom: 420, width: 375, height: 120 });
  page.winEvent('scroll');
  assert.equal(document.body.classList.contains('deck-tucked'), false, 'back in its place');
  assert.equal(document.body.classList.contains('deck-open'), false, 'and ▾ is put away');
  assert.equal($('#mini-more').textContent, '▾');
  window.scrollY = 0;
});

test('with ⌨️ Keys on, ▶ plays the beat from the slim bar; ● Record stays on the bar, a ▾ away', async () => {
  keysOn(page);
  stuck(document.querySelector('.dj-bar'));
  window.scrollY = 600;   // scrolled: ui.js slims the header
  page.winEvent('scroll');
  assert.ok(document.body.classList.contains('deck-tucked'));
  assert.equal(document.querySelector('#mini-rec'), null, 'no ● in the slim bar');
  assert.equal(document.body.classList.contains('tuck-norec'), false);
  $('#mini-play').dispatch('click');
  await page.settle();
  page.winEvent('scroll');
  assert.equal($('#dj-play').getAttribute('aria-pressed'), 'true', 'the Keys bar\'s own ▶ Play');
  assert.equal($('#mini-play').textContent, '■');
  $('#mini-play').dispatch('click');
  await page.settle();
  assert.equal($('#dj-play').getAttribute('aria-pressed'), 'false');
  window.scrollY = 0;
  page.winEvent('scroll');
  assert.equal(document.body.classList.contains('deck-tucked'), false, 'the top of the screen');
  keysOff(page);
});
