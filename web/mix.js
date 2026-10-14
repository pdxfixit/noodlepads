// ➕ Mix with another sound (Advanced): two sounds layered into one new pad,
// the way producers build their own drum hits (a boom under a clap). Pure:
// sample arrays in, sample arrays out. The sheet renders both sounds as they
// play now, mixes them here, and saves the result as a new WAV.

export const MIX = {
  offset: { min: 0, max: 2, step: 0.05, default: 0 },      // seconds the second sound waits
  balance: { min: 0, max: 1, step: 0.05, default: 0.5 },   // 0: all this one, 1: all the other
};
export const MAX_MIX_SECONDS = 30;

const clamp = (v, { min, max, default: d }) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
export const cleanMix = (m) => ({ offset: clamp(m?.offset, MIX.offset), balance: clamp(m?.balance, MIX.balance) });

// Each side's level for a balance: both full in the middle, one fading out
// toward either end, so half and half is as loud as either alone.
export const mixLevels = (balance) => [Math.min(1, 2 * (1 - balance)), Math.min(1, 2 * balance)];

// One channel of `chans` at `rate`, read at `to` Hz (straight-line in between).
function resample(d, rate, to) {
  if (rate === to) return d;
  const n = Math.max(1, Math.round((d.length * to) / rate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * rate) / to;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (d[j] ?? 0) * (1 - f) + (d[j + 1] ?? d[j] ?? 0) * f;
  }
  return out;
}

// `a` and `b`: {channels: Float32Array[], rate}. `b` starts `offset` seconds
// in; `balance` sets the levels. The result is at a's rate, with as many
// channels as the wider one (a mono sound plays in both), peak 0.9.
export function mixSounds(a, b, mix) {
  const { offset, balance } = cleanMix(mix);
  const rate = a.rate;
  const bChans = b.channels.map((d) => resample(d, b.rate, rate));
  const at = Math.round(offset * rate);
  const length = Math.min(Math.round(MAX_MIX_SECONDS * rate), Math.max(a.channels[0].length, at + bChans[0].length));
  const width = Math.max(a.channels.length, bChans.length);
  const [ga, gb] = mixLevels(balance);
  const out = Array.from({ length: width }, (_, c) => {
    const o = new Float32Array(length);
    const da = a.channels[Math.min(c, a.channels.length - 1)];
    const db = bChans[Math.min(c, bChans.length - 1)];
    for (let i = 0; i < Math.min(length, da.length); i++) o[i] += ga * da[i];
    for (let i = 0; i < db.length && at + i < length; i++) o[at + i] += gb * db[i];
    return o;
  });
  let peak = 0;
  for (const o of out) for (const v of o) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (const o of out) for (let i = 0; i < o.length; i++) o[i] *= 0.9 / peak;
  return out;
}
