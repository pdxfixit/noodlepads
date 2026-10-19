// ADR 0017 (Ben, 2026-10-12): four peer tabs in the bottom bar, 🔊 Pads ·
// 🥁 Beats · 🎼 Song · 🎤 Live, and no screen has a sub-switch. Beats' ⌨️ Keys
// shows the keys under the open beat (once DJ's Beat Builder); Live is what
// DJ's Freestyle was. How the bar fits at 320 px needs a browser
// (`just look --wide`); this checks the page, the rules and the wiring.

import { test, before } from 'node:test';
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
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('the bottom bar is four tabs in order, then Stop all; no screen has a sub-switch', () => {
  const tabs = $('.screens').querySelectorAll('[data-screen]');
  assert.deepEqual(tabs.map((b) => b.dataset.screen), ['pads', 'beats', 'song', 'live']);
  // The stand-in page keeps no text of nested spans on one line: read the labels from the page source.
  const labels = [...html.matchAll(/data-screen="(\w+)"[^>]*><span aria-hidden="true">(\S+)<\/span><span class="tool-name"> (\w+)<\/span>/g)].map((m) => `${m[1]}: ${m[2]} ${m[3]}`);
  assert.deepEqual(labels, ['pads: 🔊 Pads', 'beats: 🥁 Beats', 'song: 🎼 Song', 'live: 🎤 Live']);
  assert.equal($('#dj-modes'), null, 'no 🎤 Freestyle · 🥁 Beat Builder');
  assert.equal($('#beats-modes'), null, 'no 🥁 Beat · 🎼 Song');
  assert.equal($('#dj-tab'), null, 'DJ is 🎤 Live now');
});

test('Stop all is ⏹️ alone on a phone, and screen readers still hear "Stop all"', () => {
  const stop = $('#stop-all');
  assert.equal(stop.getAttribute('aria-label'), 'Stop all');
  assert.match(html, /id="stop-all" aria-label="Stop all"><span aria-hidden="true">⏹️<\/span><span class="tool-name"> Stop<span class="tool-more"> all<\/span><\/span><\/button>/);
  const narrow = css.slice(css.indexOf('@media (max-width: 559px) {\n  .tool-stop'));
  assert.match(narrow.slice(0, narrow.indexOf('\n}')), /\.tool-stop \.tool-name \{[^}]*clip-path: inset\(50%\)/, 'the word is hidden, not removed');
  assert.match(narrow.slice(0, narrow.indexOf('\n}')), /\.tool-stop \{[^}]*min-width: 52px/, 'a full-size target');
});

test('each tab shows its screen and lights itself; Live is the keys with takes and no beat', async () => {
  const shown = () => ['#pads', '#seq', '#song', '#dj'].filter((s) => !$(s).hidden);
  keysOff(page);
  assert.deepEqual(shown(), ['#seq']);
  $('#song-tab').dispatch('click');
  assert.deepEqual(shown(), ['#song']);
  $('#live-tab').dispatch('click');
  assert.deepEqual(shown(), ['#dj']);
  assert.equal($('#live-tab').getAttribute('aria-pressed'), 'true');
  assert.equal($('#dj').getAttribute('aria-label'), 'Live');
  assert.equal($('#dj-beatbar').hidden, true, 'no beat bar on Live');
  assert.equal($('#dj-takes-open').hidden, false, '🎬 Takes');
  assert.equal($('#dj-click').hidden, false, '⏲️ Click track in the footer');
  assert.ok($('.dj-end').contains($('#dj-click')) && $('.dj-end').contains($('#dj-change')), 'beside ✏️ Layout');
  assert.match($('#screen-hint').textContent, /^(Tap|Click) a key/);
  $('#pads-tab').dispatch('click');
  assert.deepEqual(shown(), ['#pads']);
});

test('⌨️ Keys sits in both beat bars and swaps Beats\' rows for the keys under the open beat', () => {
  keysOff(page);
  for (const id of ['#seq-keys', '#dj-keys-toggle']) {
    const b = $(id);
    assert.ok(b.closest('.beat-bar'), `${id} in a beat bar`);
    assert.equal(b.textContent, '⌨️');
    assert.equal(b.dataset.word, 'Keys');
    assert.match(b.getAttribute('aria-label'), /^Keys/);
  }
  assert.equal($('#seq-keys').getAttribute('aria-pressed'), 'false');
  assert.equal($('#dj').hidden, true);
  $('#seq-keys').dispatch('click');
  assert.equal($('#seq').hidden, true);
  assert.equal($('#dj').hidden, false);
  assert.equal($('#dj-beatbar').hidden, false, 'the beat bar, with the same beat');
  assert.equal($('#dj-takes-open').hidden, true, 'takes are Live\'s');
  assert.equal($('#dj-keys-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal($('#beats-toggle').getAttribute('aria-pressed'), 'true', 'still the Beats tab');
  assert.ok(document.body.classList.contains('keys-on'));
  assert.match($('#screen-hint').textContent, /its sound gets a row/);
  $('#dj-keys-toggle').dispatch('click');
  assert.equal($('#seq').hidden, false);
  assert.equal($('#dj').hidden, true);
  assert.equal(document.body.classList.contains('keys-on'), false);
});

test('the letter keys play only while the keys are on screen: Live, or Beats with ⌨️ Keys on', () => {
  keysOff(page);
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, false, 'Beats, Keys off');
  keysOn(page);
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, true, 'Beats, Keys on');
  $('#song-tab').dispatch('click');
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, false, 'Song');
  $('#live-tab').dispatch('click');
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, true, 'Live');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

// A device on an older copy remembered 'dj' and its mode. DJ's Beat Builder
// comes back as Beats with ⌨️ Keys on; Freestyle (or no mode) as 🎤 Live.
test('a screen remembered by an older copy opens its new home', async () => {
  const { startScreen } = await import('../web/app.js');
  assert.deepEqual(startScreen('dj', 'beat'), { screen: 'beats', keys: true });
  assert.deepEqual(startScreen('dj', 'free'), { screen: 'live' });
  assert.deepEqual(startScreen('dj', null), { screen: 'live' });
  assert.deepEqual(startScreen('song', 'beat'), { screen: 'song' }, 'Song is a tab, Advanced or not');
  assert.deepEqual(startScreen('beats', 'beat'), { screen: 'beats' }, 'only DJ\'s own mode moves');
  assert.deepEqual(startScreen('live', null), { screen: 'live' });
  assert.deepEqual(startScreen('nowhere', null), { screen: 'pads' });
});
