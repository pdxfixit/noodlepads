// WCAG color contrast, for checking that text stays readable on every color
// the app can put behind it. Pure math on #RRGGBB strings.

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export const isHex = (v) => typeof v === 'string' && HEX6.test(v);

function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 1 (none) to 21 (black on white). 4.5 is the bar for body text.
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// `top` painted over `base` at `alpha` (0-1), as a #RRGGBB string.
export function blend(top, base, alpha) {
  const t = channels(top), b = channels(base);
  const mix = t.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Like CSS color-mix(in srgb, a pct%, b).
export function mix(a, pct, b) {
  return blend(a, b, pct / 100);
}

// Text on a person's color is white (the casing, the people list), so a color
// is usable only if white reads on it.
export function whiteReadsOn(hex) {
  return isHex(hex) && contrastRatio('#FFFFFF', hex) >= 4.5;
}
