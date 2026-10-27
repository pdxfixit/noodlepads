// Time signatures, and the one-time stamp for beats saved before each beat
// had its own. A beat from then has no `signature`; it used to be read by a
// guess (the old Settings signature with Advanced on, else 4/4). Now every
// such beat gets that same answer written into it once, as it is stored
// (store.js upgrade) and as it comes in (backup.js cleanBackup, a beat file),
// so nothing reads a beat by guessing and what a kid hears does not change.
// No imports: store.js uses it while a database upgrades.

// Time signatures, one per beat (pattern.signature; chosen with Advanced on):
// the bar's pills, grouped by the beat. A pill is always a sixteenth and BPM
// always counts quarter notes, so 6/8 is two groups of three eighths.
export const SIGNATURES = {
  '4/4': [4, 4, 4, 4],
  '3/4': [4, 4, 4],
  '5/4': [4, 4, 4, 4, 4],
  '6/8': [6, 6],
  '7/8': [4, 4, 6],
};
export const barSteps = (signature) => (SIGNATURES[signature] || SIGNATURES['4/4']).reduce((a, b) => a + b, 0);

// Whether a settings object says Advanced, or undefined when it says nothing:
// the same reading as settings.js levelOf, so a person stored by an older
// copy (only `advancedBeats`) counts (tests/old-beats.test.mjs checks they agree).
const advancedIn = (values) => {
  if (!values || typeof values !== 'object') return undefined;
  if (values.advancedBeats === true) return true;
  if (values.advancedBeats === false) return false;
  return ['kids', 'regular', 'advanced'].includes(values.level) ? values.level === 'advanced' : undefined;
};

// The signature a beat with none was read in, from settings objects, the
// most specific first (the person's own, then the device's older choices; the
// same order settings.js getSetting reads): the old `timeSignature` when
// Advanced is on, else 4/4.
export function unsignedAs(...layers) {
  if (layers.map(advancedIn).find((a) => a !== undefined) !== true) return '4/4';
  return layers.map((v) => v?.timeSignature).find((s) => Object.hasOwn(SIGNATURES, s)) ?? '4/4';
}

// Stored beats (or open beats) with a signature written into each that has
// none, for the upgrade: `prefs` is IndexedDB's prefs rows ({personId,
// values}), `settings` its settings rows ({key, value}). Only the records that
// changed come back; a beat of someone with no choices reads the device's.
export function stampBeats(records, prefs, settings) {
  const device = Object.fromEntries((settings ?? []).filter((r) => r && typeof r.key === 'string').map((r) => [r.key, r.value]));
  const own = new Map((prefs ?? []).filter((p) => p && typeof p.personId === 'string').map((p) => [p.personId, p.values]));
  const out = [];
  for (const r of records ?? []) {
    if (!r || typeof r !== 'object' || Object.hasOwn(SIGNATURES, r.signature)) continue;
    out.push({ ...r, signature: unsignedAs(own.get(r.personId), device) });
  }
  return out;
}
