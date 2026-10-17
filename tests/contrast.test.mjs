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

// The instrument picker (inst-picker.js): white names on each family's color.
test('white text reads on every instrument family color', async () => {
  const { FAMILIES } = await import('../web/instruments.js');
  for (const f of FAMILIES) assert.ok(contrastRatio('#FFFFFF', f.color) >= 4.5, `${f.id} ${f.color}: ${contrastRatio('#FFFFFF', f.color).toFixed(2)}`);
});

// Pad skins (styles.css "Pad skins"; Ben, 2026-10-16): the name sits on a
// dark plate in Slam buttons, Switch and Spinner, and on dark rubber in Lit
// pads until it lights up (then it is ink on the pad's color, as on tiles).
test('the skins\' light words read (4.5:1) on their dark plates, and on a broken pad\'s stripes', () => {
  const PLATE_TEXT = '#F2EEFF';   // Slam buttons, Switch, Spinner
  const LIT_TEXT = '#EDE9F8';     // Lit pads
  for (const [text, on] of [[PLATE_TEXT, '#191427'], [PLATE_TEXT, '#2C2640'], [PLATE_TEXT, '#221C33'], [LIT_TEXT, '#221C33'], [LIT_TEXT, '#2C2640']]) {
    assert.ok(contrastRatio(text, on) >= 4.5, `${text} on ${on}: ${contrastRatio(text, on).toFixed(2)}`);
  }
  // The light words are written in styles.css as tested here.
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`color: ${PLATE_TEXT};`) && css.includes('--plate: #191427;'));
  assert.ok(css.includes(`color: ${LIT_TEXT};`) && css.includes('background: #221C33;'));
});
