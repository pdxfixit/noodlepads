// The page's pattern (web/backdrop.js, decisions.md Screens 2026-10-13): a
// wide set, one picked at random on each visit, nothing remembered. Every
// pattern is a small, well-formed SVG tile in web/bg/, drawn by styles.css
// as a mask behind the panels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BACKDROPS, pickBackdrop, showBackdrop } from '../web/backdrop.js';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const bgDir = new URL('../web/bg/', import.meta.url);
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('a wide set of patterns, each named once', () => {
  assert.ok(BACKDROPS.length >= 16 && BACKDROPS.length <= 24, `${BACKDROPS.length} patterns`);
  assert.equal(new Set(BACKDROPS).size, BACKDROPS.length);
  for (const n of BACKDROPS) assert.match(n, /^[a-z]+$/);
});

test('the pick is random, and every pattern can come up', () => {
  assert.equal(pickBackdrop('', () => 0), BACKDROPS[0]);
  assert.equal(pickBackdrop('', () => 0.999999), BACKDROPS.at(-1));
  assert.equal(pickBackdrop('', () => 1), BACKDROPS.at(-1), 'a random 1 still names a pattern');
  const seen = new Set(BACKDROPS.map((_, i) => pickBackdrop('', () => (i + 0.5) / BACKDROPS.length)));
  assert.equal(seen.size, BACKDROPS.length);
  const many = new Set(Array.from({ length: 2000 }, () => pickBackdrop('')));
  assert.ok(many.size > BACKDROPS.length / 2, 'Math.random spreads over the set');
});

test('?bg= asks for one pattern, or none; anything else is ignored', () => {
  assert.equal(pickBackdrop('?bg=hearts', () => 0), 'hearts');
  assert.equal(pickBackdrop('?look=pads-375&bg=moons', () => 0), 'moons');
  assert.equal(pickBackdrop('?bg=none', () => 0), null);
  assert.equal(pickBackdrop('?bg=../evil', () => 0), BACKDROPS[0]);
  assert.equal(pickBackdrop(undefined, () => 0), BACKDROPS[0]);
});

test('showBackdrop names the pattern on the root and points the mask at its tile', () => {
  const root = { dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
  showBackdrop(root, 'stars');
  assert.equal(root.dataset.bg, 'stars');
  assert.equal(root.style.props['--backdrop'], 'url("bg/stars.svg")');
  const bare = { dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
  showBackdrop(bare, null);
  assert.deepEqual(bare.dataset, {}, 'none: no data-bg, so styles.css draws nothing');
});

// Attributes of one tag, as [name, value] pairs.
const attrsOf = (tag) => [...tag.matchAll(/\s([a-zA-Z:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]);

test('every pattern is a small, well-formed SVG tile, and web/bg has no others', () => {
  const files = readdirSync(bgDir).filter((f) => !f.startsWith('.'));
  assert.deepEqual(files.sort(), BACKDROPS.map((n) => `${n}.svg`).sort());
  for (const n of BACKDROPS) {
    const svg = readFileSync(new URL(`${n}.svg`, bgDir), 'utf8').trim();
    assert.ok(svg.length < 1024, `${n}: ${svg.length} bytes`);
    const root = svg.match(/^<svg\b[^>]*>/);
    assert.ok(root && svg.endsWith('</svg>'), `${n}: one <svg> element`);
    const a = Object.fromEntries(attrsOf(root[0]));
    assert.equal(a.xmlns, 'http://www.w3.org/2000/svg', `${n}: xmlns`);
    for (const k of ['width', 'height']) assert.ok(/^\d+$/.test(a[k]) && a[k] >= 8 && a[k] <= 128, `${n}: ${k} ${a[k]}`);
    // Nothing a mask must not load or run.
    assert.doesNotMatch(svg, /<(script|style|image|foreignObject|use)\b|href=|on[a-z]+=|url\(/i, `${n}: shapes only`);
    // Well formed: every tag closed or self-closed, in order, and no
    // attribute twice on one tag (a browser draws nothing for such a file).
    const open = [];
    for (const [tag, close, name, , self] of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
      const names = attrsOf(tag).map(([k]) => k);
      assert.equal(new Set(names).size, names.length, `${n}: an attribute twice in ${tag}`);
      if (close) assert.equal(open.pop(), name, `${n}: </${name}> closes the wrong tag`);
      else if (!self) open.push(name);
    }
    assert.deepEqual(open, [], `${n}: unclosed ${open.join(', ')}`);
    assert.equal(svg.replace(/<[^>]*>/g, '').trim(), '', `${n}: no stray text`);
  }
});

test('styles.css draws the pattern behind the page and Kids, and the body lets it show', () => {
  assert.match(css, /:root\[data-bg\] body::before,\s*:root\[data-bg\] \.kids::before \{[^}]*z-index: -1;[^}]*mask: var\(--backdrop\) repeat;/);
  const body = css.match(/\nbody \{([^}]*)\}/)[1];
  assert.doesNotMatch(body, /background/, 'a body background would cover the pattern');
  assert.doesNotMatch(css.match(/:root\[data-bg\] body::before,[^}]*\}/)[0], /animation|transition/, 'it never moves');
});

test('the app shows a pattern on each visit and remembers nothing about it', async () => {
  const writes = [];
  const storage = { getItem: () => null, setItem: (k, v) => { writes.push([k, String(v)]); }, removeItem: () => {} };
  console.error = () => {};   // clips fail to load without audio; that is expected here
  installPage({ storage, manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  const root = globalThis.document.documentElement;
  assert.ok(BACKDROPS.includes(root.dataset.bg), `data-bg is ${root.dataset.bg}`);
  assert.equal(root.style.props['--backdrop'], `url("bg/${root.dataset.bg}.svg")`);
  for (const [k, v] of writes) {
    assert.doesNotMatch(k, /bg|backdrop|pattern/i, `stored ${k}`);
    assert.notEqual(v, root.dataset.bg, `stored the pattern under ${k}`);
  }
  assert.doesNotMatch(readFileSync(new URL('../web/backdrop.js', import.meta.url), 'utf8'), /localStorage|remember\(|indexedDB|db\./);
});

// The sticky bars carry the pattern too (Ben, 2026-10-13: "would be good if
// the bkgnd could extend to the sticky panels"), lined up with the page's
// and still opaque.
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[},/]\\s*|\\n)${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

test('the toolbar draws the page\'s tile over its own solid color, cut to the bar', () => {
  for (const bar of ['.toolbar']) {
    const ink = rule(`:root[data-bg] ${bar}::before`);
    assert.match(ink, /position: fixed;/, `${bar}: a screen-sized layer, the page's own box, so the tiles line up`);
    assert.match(ink, /inset: 0;/, `${bar}: from the top left of the screen`);
    assert.match(ink, /z-index: -1;/, `${bar}: under its buttons`);
    assert.match(ink, /background: var\(--backdrop-ink\);/, `${bar}: the page's ink`);
    assert.match(ink, /(^|[^-])mask: var\(--backdrop\) repeat;/, `${bar}: the page's tile`);
    assert.match(rule(`:root[data-bg] ${bar}`), /clip-path: inset\(/, `${bar}: the layer is cut to the bar`);
  }
  // The Pads bar is the top of the pads' dark panel now (Ben, 2026-10-19), so it draws no page tile.
  assert.equal(rule(':root[data-bg] .pads-bar::before'), '');
  // Opaque: the bar keeps its solid casing color under the ink.
  assert.match(css, /\n\.toolbar \{[^}]*background: var\(--board\);/);
  // The toolbar's top line is drawn above the ink, as its shadow was.
  assert.match(rule(':root[data-bg] .toolbar::after'), /background: var\(--board-deep\);/);
});

test('the slim header\'s band draws the tile at the top of the screen, over its solid color', () => {
  const band = rule('body.head-slim .top::before');
  assert.match(band, /position: fixed;[\s\S]*background: var\(--board\);/, 'the band is solid');
  const ink = rule(':root[data-bg] body.head-slim .top::after');
  assert.match(ink, /position: fixed;/);
  assert.match(ink, /inset: 0 0 auto 0;/, 'at the top left of the screen, like the page layer');
  assert.match(ink, /z-index: 6;/, 'over the band (z-index 6), under what sticks');
  assert.match(ink, /height: calc\(var\(--slim-top\) \+ var\(--slim-h\)\);/, 'as tall as the band');
  assert.match(ink, /background: var\(--backdrop-ink\);[\s\S]*(^|[^-])mask: var\(--backdrop\) repeat;/);
  assert.match(rule(':root[data-bg] body.head-slim.screen-pads .top::after'), /height: calc\(var\(--slim-top\) \+ 64px\);/, 'on Pads, as tall as its band');
});
