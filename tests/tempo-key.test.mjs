// The tempo key (web/tempo-key.js; Ben, 2026-10-26: "the BPM control … far
// more capable of collapsing … some sort of a click open slider … these
// buttons all need to live on the same line"). On a phone every bar's tempo
// is one key, the number over ▾, that opens the tempo as a line of its own
// under the bar. Which width shows the key, and that the bars keep one line,
// is layout: `just look live keys-on beats song` at 320 to 600 px checks it
// (docs/design/tempo-collapse.md).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff } from './new-beat.mjs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const KEYS = [
  ['#seq-tempo-key', 'seq-tempo'],          // 🥁 Beats
  ['#dj-tempo-key', 'dj-tempo'],            // ⌨️ Keys
  ['#dj-click-key', 'dj-click-tempo'],      // 🎤 Live's click
  ['#song-tempo-key', 'song-tempo-box'],    // 🎼 Song
];
const open = (k) => $(k).getAttribute('aria-expanded') === 'true';

test('every bar with a tempo has a key, just before the tempo it opens', () => {
  for (const [k, box] of KEYS) {
    assert.equal($(k).getAttribute('aria-controls'), box, k);
    const kids = $(k).parent.children;   // the stand-in page has no nextElementSibling
    assert.ok(kids[kids.indexOf($(k)) + 1] === $(`#${box}`), `${k} sits just before #${box} (the CSS folds the box after it)`);
    assert.equal(open(k), false, `${k} starts closed`);
  }
});

test('🎤 Live: a tap opens the click\'s tempo as its own line, a tap again or Esc closes it; it names the tempo', () => {
  $('#live-tab').dispatch('click');
  const k = '#dj-click-key';
  const box = $('#dj-click-tempo');
  $(k).dispatch('click');
  assert.equal(open(k), true);
  assert.ok(box.classList.contains('tempo-open'));
  assert.match($(k).getAttribute('aria-label'), /^Tempo \d+ BPM: tap to close it$/);
  const slider = $('#dj-click-bpm');
  slider.value = String(Number(slider.max));
  slider.dispatch('input');
  assert.equal($(k).querySelector('.tempo-key-num').textContent, '180', 'open, the key reads the tempo the slider set…');
  assert.equal($(k).querySelector('.tempo-key-open').textContent, 'BPM', '…over BPM (Ben, 2026-10-26)');
  assert.equal($(k).getAttribute('aria-label'), 'Tempo 180 BPM: tap to close it', 'and is named with the tempo the slider set');
  box.dispatch('keydown', { key: 'Escape' });
  assert.equal(open(k), false, 'Esc closes it');
  assert.equal($(k).querySelector('.tempo-key-open').textContent, '▾', 'closed, ▾ under the number again');
  assert.ok(!box.classList.contains('tempo-open'));
  assert.equal($(k).getAttribute('aria-label'), 'Tempo 180 BPM: tap to change it');
  $(k).dispatch('click');
  $(k).dispatch('click');
  assert.equal(open(k), false, 'the key again closes it');
  slider.value = '0';
  slider.dispatch('input');
});

test('Esc that ends typing a number only ends the typing', () => {
  $('#beats-toggle').dispatch('click');
  const k = '#seq-tempo-key';
  $(k).dispatch('click');
  $('#seq-bpm-out').dispatch('click');                     // tap the number: type one
  $('#seq-bpm-type').dispatch('keydown', { key: 'Escape' });
  assert.equal(open(k), true, 'the tempo stays open');
  $(k).dispatch('click');
  assert.equal(open(k), false);
});

test('🥁 Beats and ⌨️ Keys: the key follows the beat\'s tempo', () => {
  $('#beats-toggle').dispatch('click');
  $('#seq-bpm-out').dispatch('click');
  $('#seq-bpm-type').value = '120';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
  assert.equal($('#seq-tempo-key').querySelector('.tempo-key-num').textContent, '120');
  keysOn(page);
  assert.equal($('#dj-tempo-key').querySelector('.tempo-key-num').textContent, '120', 'the keys view\'s key reads the same beat');
  keysOff(page);
});

test('🎼 Song: the key reads the song\'s tempo, and its line holds ➖ the tempo ➕', () => {
  $('#song-tab').dispatch('click');
  const box = $('#song-tempo-box');
  assert.ok(box.contains($('#song-tempo-down')) && box.contains($('#song-tempo-up')) && box.contains($('#song-tempo-open')), 'with Advanced, the way into 🎼 Tempo (＋ Tempo change) is in the same line');
  $('#song-tempo-up').dispatch('click');
  const n = $('#song-tempo').value;
  assert.equal($('#song-tempo-key').querySelector('.tempo-key-num').textContent, n);
});

test('▶ and ● keep an icon beside their word, ■ while running, for a short line to show', () => {
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-record').dataset.icon, '●');
  $('#dj-record').dispatch('click');
  assert.equal($('#dj-record').textContent, '■ Stop');
  assert.equal($('#dj-record').dataset.icon, '■');
  $('#dj-record').dispatch('click');
  assert.equal($('#dj-record').dataset.icon, '●');
  assert.match(html, /id="seq-play" data-icon="▶"/);
  assert.match(html, /id="dj-takes-open" data-icon="🎬" aria-label="🎬 Takes: everything you recorded">🎬 Takes</, '🎬 Takes keeps its word for screen readers');
});

test('the CSS: no key on a wide screen; on a phone the key, the closed tempo out of sight, the open one a line of its own', () => {
  assert.match(css, /\n\.tempo-key \{ display: none; \}\n@media \(max-width: 600px\) \{\n {2}\.tempo-key \{ display: grid;/);
  assert.match(css, /\.tempo-key \+ :is\(\.tempo-box, \.song-tempo\):not\(\.tempo-open\) \{ display: none; \}/);
  assert.match(css, /\.tempo-key \+ :is\(\.tempo-box, \.song-tempo\)\.tempo-open \{ display: flex; order: 9; flex: 1 1 100%;/);
  assert.match(css, /\.tempo-key \+ \.tempo-box\.tempo-open \.tempo-step::before \{ content: "🐢" \/ "";/);
  assert.match(css, /\.tempo-key \+ \.tempo-box\.tempo-open :is\(output, \.seq-bpm-num, \.seq-bpm-type\) \{ display: none; \}/, 'no number row: it is on the key');
  // Words give way by the panel's own width, showing data-icon.
  assert.match(css, /@container panel \(max-width: 22\.99rem\) \{\n {2}\.dj-bar \.dj-rec \{ padding: 0; font-size: 0; \}\n {2}\.dj-bar \.dj-rec::before \{ content: attr\(data-icon\) \/ "";/);
});

// The slider is new on phones (in the tempo line): a drag fires `input` many
// times a second. Each step retimes the beat and the click; saving and
// bringing looping pads back in line wait for the drag's end (`change`), as
// Beats' own slider does (council, performance and audio seats, 2026-10-26).
test('🎤 Live and ⌨️ Keys: a drag of the slider brings loops in line once, when it ends', async () => {
  const { audio } = await import('../web/audio.js');
  const real = audio.syncLoops;
  let syncs = 0;
  audio.syncLoops = (...a) => { syncs++; return real?.apply(audio, a); };
  try {
    $('#live-tab').dispatch('click');
    const click = $('#dj-click-bpm');
    for (const v of ['3', '4', '5']) { click.value = v; click.dispatch('input'); }
    assert.equal(syncs, 0, 'not on every step');
    click.dispatch('change');
    assert.equal(syncs, 1, 'once at the end');
    keysOn(page);
    $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
    syncs = 0;
    const beat = $('#dj-bpm-slider');
    for (const v of ['6', '7']) { beat.value = v; beat.dispatch('input'); }
    assert.equal(syncs, 0);
    beat.dispatch('change');
    assert.equal(syncs, 1);
    assert.equal($('#dj-tempo-key').querySelector('.tempo-key-num').textContent, $('#dj-bpm').textContent.replace(' BPM', ''), 'the key read every step');
    keysOff(page);
  } finally {
    audio.syncLoops = real;
  }
});

// Ben, 2026-10-26: "the buttons should generally be on a grid"; at 320 px
// "record and takes should have equal amount of width"; no dotted line under
// the number. Where each key lands is layout (`just look beats keys-on live
// --widths 320,375,430,600` measures the columns); these pin the rules.
test('the CSS: Beats\' keys on a grid, 🎤 Live at 320 px half and half, no dotted line under the tempo', () => {
  assert.match(css, /@media \(max-width: 600px\) \{\n {2}\.beat-deck \.beat-go \.seq-click, \.beat-deck \.tempo-key \{ width: 48px; padding: 0; \}\n {2}\.beat-deck > :is\(\.beat-go, \.beat-shape\) \{ gap: 8px; \}/);
  assert.match(css, /@container panel \(max-width: 18\.6rem\) \{\n {2}body\.screen-live \.dj-bar :is\(\.dj-rec, #dj-takes-open\) \{ order: 0; flex: 1 1 calc\(50% - 3px\);/);
  assert.match(css, /body\.screen-live \.dj-bar :is\(\.tempo-key, #dj-click, #dj-overlap, #dj-change\) \{ order: 1; flex: 1 1 0; width: auto; \}/);
  assert.doesNotMatch(css, /underline dotted/, 'no dotted line under the tempo');
});

// Ben, 2026-10-26: one row, 🐢 the slider 🐇, the animals nudging the tempo;
// and 🎼 Song "exactly the same for how they manage BPM, the tile, the slider".
test('🐢 and 🐇 nudge the tempo to the next common one, on every bar alike', () => {
  $('#live-tab').dispatch('click');
  const slider = $('#dj-click-bpm');
  slider.value = '0';
  slider.dispatch('input');
  slider.dispatch('change');
  const box = $('#dj-click-tempo');
  box.querySelector('.tempo-step.up').dispatch('click');                 // 🐇
  assert.equal($('#dj-click-key').querySelector('.tempo-key-num').textContent, '70', 'from 60 to 70');
  box.querySelector('.tempo-step.down').dispatch('click');               // 🐢
  assert.equal($('#dj-click-key').querySelector('.tempo-key-num').textContent, '60');
  $('#song-tab').dispatch('click');
  const t = Number($('#song-tempo').value);
  $('#song-tempo-up').dispatch('click');                                  // 🐇 on Song: the same steps
  assert.equal(Number($('#song-tempo').value), [60, 70, 80, 90, 100, 110, 120, 128, 130, 140, 150, 160, 170, 180].find((v) => v > t) ?? 180);
});

test('🎼 Song has the same slider: the key reads it as it moves, and a drag is one Undo step', () => {
  $('#song-tab').dispatch('click');
  const slider = $('#song-tempo-slider');
  assert.ok($('#song-tempo-box').contains(slider), 'in the song\'s tempo line');
  const before = $('#song-tempo').value;
  slider.value = String(Number(slider.max));
  slider.dispatch('input');
  assert.equal($('#song-tempo-key').querySelector('.tempo-key-num').textContent, '180', 'the key reads the slider');
  assert.equal($('#song-tempo').value, before, 'the song waits for the drag to end');
  slider.dispatch('change');
  assert.equal($('#song-tempo').value, '180');
  $('#song-step-undo').dispatch('click');
  assert.equal($('#song-tempo').value, before, 'one ↩️ Undo puts the whole drag back');
});
