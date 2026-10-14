import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { luminance, contrastRatio, blend, mix, whiteReadsOn, isHex } from '../web/contrast.js';

const boards = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
const INK = '#1C1740';  // --ink in styles.css: the text on every pad

test('contrastRatio matches the WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(contrastRatio('#FFFFFF', '#777777'), contrastRatio('#777777', '#FFFFFF'));
  assert.ok(luminance('#000000') < luminance('#808080') && luminance('#808080') < luminance('#FFFFFF'));
});

test('blend and mix paint one color over another', () => {
  assert.equal(blend('#FFFFFF', '#000000', 0.5), '#808080');
  assert.equal(blend('#FF0000', '#0000FF', 1), '#ff0000');
  assert.equal(mix('#FFFFFF', 25, '#000000'), '#404040');
});

test('isHex and whiteReadsOn only accept #RRGGBB that carry white text', () => {
  assert.ok(isHex('#1F3FA8') && isHex('#abcdef'));
  for (const bad of ['1F3FA8', '#1F3FA', '#1F3FA8F', 'red', '', null, undefined, 5]) assert.ok(!isHex(bad), String(bad));
  assert.ok(whiteReadsOn('#1F3FA8'));
  assert.ok(!whiteReadsOn('#FFFFFF'));
  assert.ok(!whiteReadsOn('#FFD60A'));
  assert.ok(!whiteReadsOn('red'));
});

test('dark ink reads (4.5:1) on every pad color in the palette', () => {
  for (const [name, hex] of Object.entries(boards.palette)) {
    assert.ok(contrastRatio(INK, hex) >= 4.5, `${name} ${hex}: ${contrastRatio(INK, hex).toFixed(2)}`);
  }
});

test('white reads (4.5:1) on every person color in boards.json', () => {
  for (const p of boards.people) {
    assert.ok(whiteReadsOn(p.color), `${p.name} ${p.color}: ${contrastRatio('#FFFFFF', p.color).toFixed(2)}`);
  }
});

test('white text reads on every DJ key family color', async () => {
  const { FAMILY_COLORS } = await import('../web/dj.js');
  for (const [family, color] of Object.entries(FAMILY_COLORS)) {
    assert.ok(contrastRatio('#FFFFFF', color) >= 4.5, `${family} ${color}: ${contrastRatio('#FFFFFF', color).toFixed(2)}`);
  }
});
