// The pad size slider's maths (web/pad-size.js). Ben, 2026-10-11: "the
// largest possible size of pads doesn't match what the slider can do." So
// its ends are the smallest and biggest pads this bed can show, and every
// step between them changes the pads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAD_MIN, PAD_MAX, PAD_STOPS, padWidth, autoWidth, sliderAt, fromOldSize } from '../web/pad-size.js';

// Pad beds as styles.css draws them: [screen width, bed width, gap].
const BEDS = [[320, 264, 12], [375, 319, 12], [700, 644, 12], [900, 828, 18], [1100, 1028, 18], [1920, 1848, 18], [3440, 2328, 18]];
const fits = (bed, gap, w) => Math.floor((bed + gap) / (w + gap) + 1e-9);

test('the slider\'s ends are the smallest pads that read and the biggest the bed can show', () => {
  for (const [screen, bed, gap] of BEDS) {
    const least = padWidth(bed, gap, 0);
    const n = fits(bed, gap, least - 0.01);
    assert.ok(least >= PAD_MIN && least < PAD_MIN * (n + 1) / n + gap, `${screen}: the far left is the smallest pad (${least})`);
    assert.equal(n, fits(bed, gap, PAD_MIN), `${screen}: as many on a line as fit at ${PAD_MIN} px`);
    assert.ok(Math.abs(n * least + (n - 1) * gap - bed) < 0.01, `${screen}: and they fill the line`);
    assert.equal(padWidth(bed, gap, 1), Math.min(PAD_MAX, bed), `${screen}: the far right is the biggest`);
  }
  assert.equal(fits(319, 12, padWidth(319, 12, 1)), 1, 'on a phone, the far right is one whole-width column');
  assert.equal(padWidth(1848, 18, 1), PAD_MAX, 'a wide screen stops at a sensible biggest pad');
});

test('every step on the slider changes the pads', () => {
  for (const [screen, bed, gap] of BEDS) {
    let was = 0;
    for (let pos = 0; pos <= 100; pos++) {
      const w = padWidth(bed, gap, pos / 100);
      assert.ok(w > was + 0.3, `${screen} at ${pos}: ${w} after ${was}`);
      was = w;
    }
  }
});

test('the screen\'s own size fills the line: two on a phone, as before; more on wider screens', () => {
  const cols = (bed, gap) => fits(bed, gap, autoWidth(bed, gap) - 0.1);
  assert.equal(cols(264, 12), 2, '320 px');
  assert.equal(cols(319, 12), 2, '375 px');
  assert.equal(cols(644, 12), 3, '700 px');
  assert.ok(cols(1848, 18) >= 8, '1920 px: many columns');
  for (const [screen, bed, gap] of BEDS) {
    const w = autoWidth(bed, gap);
    const n = cols(bed, gap);
    assert.ok(Math.abs(n * w + (n - 1) * gap - bed) < 0.5, `${screen}: the line is full`);
    assert.equal(padWidth(bed, gap, 'auto'), w);
    const pos = sliderAt(bed, gap, 'auto');
    assert.ok(pos > 0 && pos < 100, `${screen}: the slider sits between its ends (${pos})`);
  }
});

test('the kept size is a share of the way, so it means the same on every screen', () => {
  assert.equal(PAD_STOPS[0], 'auto');
  assert.equal(PAD_STOPS.length, 102);
  assert.ok(PAD_STOPS.includes(0.07) && PAD_STOPS.includes(0.5) && PAD_STOPS.includes(1));
  assert.equal(sliderAt(319, 12, 0.37), 37);
  assert.equal(padWidth(10, 12, 0.5), 10, 'a bed narrower than the smallest pad: one pad, the bed\'s width');
});

test('older copies\' sizes read as the nearest place on the slider', () => {
  assert.equal(fromOldSize(100), 'auto', 'Medium is the screen\'s own size');
  assert.equal(fromOldSize('m'), 'auto');
  assert.equal(fromOldSize(50), 0, '50 % was smaller than a phone\'s smallest now');
  assert.equal(fromOldSize(220), 1, '220 % was one big column on a phone');
  assert.ok(fromOldSize('s') < fromOldSize(85) && fromOldSize(85) < fromOldSize('l'));
  for (const bad of [49, 221, 101, 102.5, 'xl', null, undefined, 0.5]) assert.equal(fromOldSize(bad), undefined, String(bad));
});

// Ben, 2026-10-19: the slider and ✏️ Edit sounds sit on the dark band at
// the top of the pads' panel, as 🎤 Live's ● Record and 🎬 Takes do; the
// slider at the left, saying "Size" where it has the room.
test('the size slider sits at the left of the pads\' dark top band, with a word where there is room', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="pads-size" id="pads-size">\s*<label class="pads-size-word" for="pads-size-slider">Size<\/label>/);
  assert.doesNotMatch(css, /\.pads-bar \.pads-size \{ margin-inline: auto; \}/, 'no longer centered');
  assert.match(css, /\n\.pads-size \{[^}]*margin-right: auto;/, 'at the left: the room it leaves goes after it');
  assert.doesNotMatch(css, /@media \(min-width: 560px\) \{\s*\.pads-bar \{ padding-left:/, 'unscrolled, nothing holds room before it');
  assert.match(css, /\n\.pads-bar \{[^}]*position: sticky;[^}]*background: var\(--deck\);/, 'the darker band of Live\'s deck');
  assert.match(css, /\.pads-bar:not\(\[hidden\]\) \+ \.pads \{ border-radius: 0 0 22px 22px;/, 'the band and the pads are one panel');
  assert.match(css, /\.pads-size \{[^}]*container: pad-size \/ inline-size;/);
  assert.match(css, /@container pad-size \(max-width: \d+px\) \{ \.pads-size-word \{ display: none; \} \}/, 'the word goes where the room is short');
  assert.match(css, /@media \(max-width: 559px\) \{\s*body\.head-slim\.screen-pads \.pads-size \{ display: none; \}/, 'under 560 px it hides when the bar sticks');
});
