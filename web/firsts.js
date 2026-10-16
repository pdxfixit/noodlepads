// A new person's first steps (ADR 0028): the pure parts the welcome
// (welcome.js) and the one-time tips, hint dots and nudge (tips.js) share.
// Imports nothing, so settings.js, merge3.js and the tests can take it.

// The test hook: `globalThis.noodleFirstSteps = false`, set before the app
// starts, turns every first step off (the welcome, and the tips, dots, 🧸
// hand and level-up nudge that follow it). Only the stand-in page
// (tests/fake-dom.mjs installPage, unless a test asks for them) and `just
// look` (unless a view asks for them) set it, so a fresh device there shows
// the app as before. Nothing in the app sets it, and no person can.
export const firstStepsOn = () => globalThis.noodleFirstSteps !== false;

// ── What a person has seen ──
// One person setting, `seen` (settings.js): the ids of the tips, dots and
// other one-time things they have had, as one sorted, comma-separated
// string ('dot-keys,tip-pads'). A string, so it compares by value, travels
// with the person (the cloud, backups) as every setting does, and a newer
// copy's ids an older one doesn't know are kept, not dropped. tip-* and
// dot-* are what ❓ Help's 💡 Show tips again clears.
const SEEN_ID = /^[a-z][a-z0-9-]{0,23}$/;
export const SEEN_MAX = 48;

// A stored value as this copy keeps it, or undefined when it is not a string.
export function cleanSeen(v) {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  return [...new Set(v.split(',').filter((id) => SEEN_ID.test(id)))].sort().slice(0, SEEN_MAX).join(',');
}
export const seenSet = (v) => new Set((cleanSeen(v) ?? '').split(',').filter(Boolean));
export const withSeen = (v, id) => cleanSeen(`${cleanSeen(v) ?? ''},${id}`);
// Everything seen on either side: a sync where both devices saw something
// keeps both (merge3.js), so no tip shows twice.
export const unionSeen = (a, b) => cleanSeen(`${cleanSeen(a) ?? ''},${cleanSeen(b) ?? ''}`);
// 💡 Show tips again: the tips and dots go; the rest (the 🧸 hand, the
// nudge) stays.
export const withoutTips = (v) => [...seenSet(v)].filter((id) => !/^(tip|dot)-/.test(id)).join(',');

// ── One-time tips (Regular and Advanced) ──
// One line each, in the banner over the top, once per person, at most one
// per screen visit (tips.js says when).
export const TIPS = {
  'tip-pads': '👆 Hold a pad to make it loop.',
  'tip-beats': '👆 Tap squares, then ▶ Play. Or start from a 💃 groove.',
  'tip-song': '🎼 Make a song from your beats: 💾 Keep one on 🥁 Beats, then tap it here and tap a lane.',
  'tip-live': '🎤 Play the keys like an instrument. ● Record keeps a 🎬 take to play back.',
  'tip-sheet': '🎭 Tap a voice to hear your sound change. Your recording stays as it was.',
};
export const PAD_TAPS_FOR_TIP = 3;   // pad taps on 🔊 Pads before "Hold a pad"

// Whether a beat has any hits: a pill on in a plain row, or a note in a
// tune row (sequencer.js rows: `steps`, `melody` and `tune`).
export function beatHasHits(beat) {
  return (beat?.rows ?? []).some((r) => (r?.melody ? (r.tune?.length ?? 0) > 0 : (r?.steps ?? []).some(Boolean)));
}
