// A looping pad pulses forever, so its pulse must be something the browser can
// animate off the main thread (opacity or transform). Animating a box-shadow
// or a filter restyles and repaints the pad every frame: four looping pads
// cost more than a beat playing (measured with `just look --cpu 4`). The look
// itself needs a browser (`just look pads --js-file …`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const keyframes = (name) => css.match(new RegExp(`@keyframes ${name} \\{([^@]*?\\n?)\\}\\s*(?:\\n|$)`))?.[1] ?? css.match(new RegExp(`@keyframes ${name} \\{[^\\n]*\\}`))?.[0];

test('the keys\' and touch tiles\' loop pulse changes only opacity', () => {
  const body = keyframes('dj-pulse');
  assert.ok(body, 'dj-pulse exists');
  assert.match(body, /opacity/);
  assert.doesNotMatch(body, /filter|box-shadow/);
  assert.match(css, /\.dj-key\.looping::after, \.touch-tile\.looping::after \{[^}]*animation: dj-pulse/);
  assert.doesNotMatch(css, /\.(dj-key|touch-tile)\.looping \{ animation/, 'the tile itself is not animated');
});

test('a looping pad in Tiles pulses a ring inside it by opacity, and is not animated itself', () => {
  const body = keyframes('loop-ring');
  assert.ok(body, 'loop-ring exists');
  assert.match(body, /opacity/);
  assert.doesNotMatch(body, /filter|box-shadow/);
  assert.match(css, /:root:not\(\[data-skin\]\) \.pad\.looping \{ animation: none; \}/);
  assert.match(css, /:root:not\(\[data-skin\]\) \.pad\.looping::after \{[^}]*animation: loop-ring/);
});
