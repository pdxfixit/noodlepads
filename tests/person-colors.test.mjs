// The person colors (a board's casing) stay apart for someone with
// deuteranopia too (Ben, 2026-10-19): every pair is at least 10 apart in
// CIEDE2000, normal vision and as deuteranopia shows them (Machado 2009,
// full severity). Under about 10 two colors read as one at a glance; the ten
// colors before were 3.1 apart (Forest and Maroon). Each old color moves to
// a new one, the move is stored, and the cloud still takes an old one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSON_COLORS, PERSON_COLOR_NAMES, OLD_PERSON_COLORS, personColor } from '../web/model.js';

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { c = Math.min(1, Math.max(0, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]];
const deutan = (c) => { const l = c.map(lin); return DEUTAN.map((row) => gam(row.reduce((sum, m, j) => sum + m * l[j], 0))); };

function lab([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

// CIEDE2000 (Sharma, Wu and Dalal 2005).
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const h1 = (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2 = (deg(Math.atan2(b2, a2p)) + 360) % 360;
  let dh = h2 - h1;
  if (C1 * C2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2 - C1;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1 + C2) / 2;
  let hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + 360) / 2;
  if (C1 * C2 === 0) hb = h1 + h2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hb - 275) / 25) ** 2))));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

const closest = (colors, see) => {
  let worst = { d: Infinity };
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const d = de2000(lab(see(rgb(colors[i]))), lab(see(rgb(colors[j]))));
      if (d < worst.d) worst = { d, pair: `${colors[i]} ~ ${colors[j]}` };
    }
  }
  return worst;
};

test('every two person colors stay apart, in normal vision and with deuteranopia', () => {
  const normal = closest(PERSON_COLORS, (c) => c);
  const deut = closest(PERSON_COLORS, deutan);
  assert.ok(normal.d >= 12, `normal vision: ${normal.pair} only ${normal.d.toFixed(1)} apart`);
  assert.ok(deut.d >= 10, `deuteranopia: ${deut.pair} only ${deut.d.toFixed(1)} apart`);
  // What this guards against: the colors before 2026-10-19.
  assert.ok(closest(Object.keys(OLD_PERSON_COLORS), deutan).d < 4);
});

test('eight colors, two equal lines of four on a phone, each named', () => {
  assert.equal(PERSON_COLORS.length, 8);
  for (const c of PERSON_COLORS) assert.ok(PERSON_COLOR_NAMES[c], c);
  assert.equal(new Set(Object.values(PERSON_COLOR_NAMES)).size, 8);
});

test('each old person color moves to a new one; any other color stays', () => {
  assert.equal(Object.keys(OLD_PERSON_COLORS).length, 10);
  for (const [old, now] of Object.entries(OLD_PERSON_COLORS)) {
    assert.ok(PERSON_COLORS.includes(now), `${old} -> ${now}`);
    assert.equal(personColor(old), now);
    assert.equal(personColor(old.toLowerCase()), now, 'case does not matter');
  }
  for (const c of PERSON_COLORS) assert.equal(personColor(c), c);
  assert.equal(personColor('#123456'), '#123456');
  assert.equal(personColor(undefined), undefined);
});
