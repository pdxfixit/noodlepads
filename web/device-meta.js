// What a device says about itself on every cloud call (ADR 0016, still kept
// for the Worker's `devices` and `activity` tables): the app's version, its
// screen width rounded down to a bucket, and whether it has a touch screen,
// in the X-Noodle-App header. The Worker imports WIDTHS to check it, so this
// module imports nothing that needs a page.

import { usageOn } from './usage.js';

// Screen-width buckets, in CSS pixels: a width is sent as the biggest bucket
// at or below it.
export const WIDTHS = [0, 360, 400, 600, 768, 1024, 1280, 1440, 1920, 2560];

export const widthBucket = (w) => {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return WIDTHS.filter((b) => b <= n).at(-1);
};

// The header every cloud call carries (X-Noodle-App), as a query string:
// "v=7b5fc5e&w=400&t=1". The Worker reads each part only if it is valid.
// With the usage switch off there is no header (null), and the Worker then
// keeps no metrics for the call (worker/metrics.js optedIn).
export function appMeta(version, width, touch) {
  if (!usageOn()) return null;
  const v = String(version ?? 'dev').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'dev';
  return `v=${v}&w=${widthBucket(width)}&t=${touch ? 1 : 0}`;
}
