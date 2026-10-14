// Pad size: the pure maths behind the Pads screen's size slider (pads.js).
//
// Ben, 2026-10-11: "the largest possible size of pads doesn't match what the
// slider can do." So the slider's ends are exactly the smallest and largest
// pads this screen can show, measured from the pad bed's own width, and
// every position in between makes the pads a little bigger or smaller.
//
// The stored size is where the slider sits between those ends, 0 to 1, so
// it means the same on a phone and a wide screen: 0 is the smallest pads
// (the most on a line), 1 the biggest (one whole-width column on a phone).
// 'auto' is the screen's own size: the line filled with as many pads of
// about PAD_TARGET px as fit, never fewer than two.

export const PAD_MIN = 76;       // px: the smallest pad that still reads (a word, a picture)
export const PAD_MAX = 400;      // px: the biggest pad on a wide screen; a phone's whole line is less
export const PAD_TARGET = 180;   // px: about how wide the screen's own ('auto') pads are

// Every size a person can keep: 'auto', then 0 to 1 every 0.01.
export const PAD_STOPS = ['auto', ...Array.from({ length: 101 }, (_, i) => i / 100)];

// The smallest and biggest pad on a bed `bed` px wide, `gap` px apart. The
// smallest fills the line with as many pads of at least PAD_MIN as fit, so
// the far left has no wide empty edges.
export function padRange(bed, gap) {
  const max = Math.max(1, Math.min(PAD_MAX, bed));
  const most = Math.floor((bed + gap) / (PAD_MIN + gap));
  return { min: most >= 1 ? Math.min(max, (bed + gap) / most - gap) : max, max };
}

// The slider is even in (pad + gap), on a ratio scale: each step grows the
// pad by the same share, so the small end is not crammed into a sliver.
function ends(bed, gap) {
  const { min, max } = padRange(bed, gap);
  return { lo: min + gap, hi: max + gap };
}

// The screen's own pad width: the line filled with pads of about PAD_TARGET px.
export function autoWidth(bed, gap) {
  const { min, max } = padRange(bed, gap);
  const fits = Math.max(1, Math.floor((bed + gap) / (min + gap)));
  const cols = Math.min(fits, Math.max(2, Math.round((bed + gap) / (PAD_TARGET + gap))));
  return Math.min(max, Math.max(min, (bed + gap) / cols - gap));
}

// Where a pad `width` px wide sits on the slider, 0 to 1.
export function fractionOf(bed, gap, width) {
  const { lo, hi } = ends(bed, gap);
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, Math.log((width + gap) / lo) / Math.log(hi / lo)));
}

// The pad width for a kept size ('auto' or 0 to 1) on this bed.
export function padWidth(bed, gap, size) {
  if (size === 'auto' || typeof size !== 'number' || !(size >= 0 && size <= 1)) return autoWidth(bed, gap);
  const { lo, hi } = ends(bed, gap);
  return lo * (hi / lo) ** size - gap;
}

// The slider's position, 0 to 100, for a kept size on this bed.
export const sliderAt = (bed, gap, size) => Math.round(100 * (size === 'auto' ? fractionOf(bed, gap, autoWidth(bed, gap)) : size));

// Copies before this kept a percent, 50 to 220, of the screen's own pad
// width (100 was Medium), and before that S M L. Read on a 375 px phone, the
// screen they were made for: its bed is 319 px and Medium was two columns.
export function fromOldSize(old) {
  const percent = { s: 60, m: 100, l: 130 }[old] ?? old;
  if (!Number.isInteger(percent) || percent % 5 || percent < 50 || percent > 220) return undefined;   // it kept every 5
  if (percent === 100) return 'auto';
  const bed = 319;
  const gap = 12;
  const width = (percent / 100) * ((bed - gap) / 2);
  return Math.round(100 * fractionOf(bed, gap, width)) / 100;
}
