// Feature-use counts (ADR 0016): how often each part of the app is used, per
// person, counted on this device and sent with that person's next sync
// (cloud-sync.js), where the cloud sums them per day. Counts only: which
// screen or tool, never what was made with it. Kept in localStorage `uses`
// until the cloud has them. Also what the device says about itself on every
// cloud call (`appMeta`): the app's version, its screen width rounded down
// to a bucket, and whether it has a touch screen.
//
// The Worker imports USES and WIDTHS to check what it is sent, so this
// module imports nothing that needs a page.

import { remember, recall } from './util.js';

// Every feature counted. A new one goes at the end; the Worker refuses any
// name not here. A name the app no longer sends stays, so a device still on
// an older copy keeps sending counts the Worker accepts ('dj',
// 'dj-freestyle', 'beat-builder': the DJ screen before ADR 0017).
export const USES = [
  'pads',          // the Pads screen shown
  'beats',         // the Beats screen shown
  'dj',            // the DJ screen shown (older copies; now 'live')
  'song',          // the Song screen shown
  'pad',           // a pad played
  'dj-freestyle',  // DJ's Freestyle picked (older copies)
  'beat-builder',  // DJ's Beat Builder picked (older copies; now 'beat-keys')
  'grooves',       // the grooves list opened
  'beat-play',     // a beat played (Beats, with ⌨️ Keys or without)
  'beat-record',   // ● Record into the beat (Beats with ⌨️ Keys)
  'song-play',     // a song played
  'record',        // a sound recorded from the microphone
  'chop',          // sounds cut out of a recording
  'share',         // a share code made
  'share-open',    // someone's share code opened
  'remix',         // a share remixed onto the board
  'backup',        // a backup saved
  'live',          // the 🎤 Live screen shown
  'beat-keys',     // ⌨️ Keys turned on, on Beats
  'kids-pads',     // 🧸 Kids: the Pads tab shown
  'kids-record',   // 🧸 Kids: the Record tab shown
  'kids-beats',    // 🧸 Kids: the Beats tab shown
  'kids-keys',     // 🧸 Kids: the Keys tab shown
  'kids-unlock',   // 🧸 Kids: a grown-up answered the sum behind ⚙️
  'roll',          // 🎹 the piano roll opened (sequencer.js openRoll)
  'roll-note',     // 🎹 a note placed in the roll (roll.js add)
  'song-block',    // 🎼 a beat placed on a song's lane (song.js tapSpot)
  'mixer',         // 🎚️ the Mixer opened (sequencer.js openMixer)
  'beat-chip',     // a beat's chip tapped to switch to it (sequencer.js pickChip)
  'beat-keep',     // 💾 Keep: the scratch beat kept in 🗂️ My beats (from the log)
  'song-keep',     // 💾 Keep: the scratch song kept in 🗂️ My songs (from the log)
  'row-overlap',   // 🔔 Overlap turned on for a beat row (sequencer.js toggleRing)
  'live-overlap',  // 🔔 Overlap turned on, on 🎤 Live (dj.js)
  'more',          // a row's ⋯ menu opened (overflow.js moreMenu)
];
const KNOWN = new Set(USES);

// Screen-width buckets, in CSS pixels: a width is sent as the biggest bucket
// at or below it.
export const WIDTHS = [0, 360, 400, 600, 768, 1024, 1280, 1440, 1920, 2560];
export const MAX_COUNT = 100_000;   // one feature in one send
const MAX_PEOPLE = 20;              // people with counts waiting on this device
const KEY = 'uses';

export const widthBucket = (w) => {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return WIDTHS.filter((b) => b <= n).at(-1);
};

// The header every cloud call carries (X-Noodle-App), as a query string:
// "v=7b5fc5e&w=400&t=1". The Worker reads each part only if it is valid.
export function appMeta(version, width, touch) {
  const v = String(version ?? 'dev').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) || 'dev';
  return `v=${v}&w=${widthBucket(width)}&t=${touch ? 1 : 0}`;
}

// What localStorage holds: {personId: {feature: n}}, junk dropped.
function read() {
  let raw;
  try { raw = JSON.parse(recall(KEY) || '{}'); } catch { raw = {}; }
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [who, counts] of Object.entries(raw).slice(0, MAX_PEOPLE)) {
    if (!counts || typeof counts !== 'object') continue;
    const clean = {};
    for (const [f, n] of Object.entries(counts)) {
      if (KNOWN.has(f) && Number.isInteger(n) && n > 0) clean[f] = Math.min(n, MAX_COUNT);
    }
    if (Object.keys(clean).length) out[who] = clean;
  }
  return out;
}

const write = (all) => remember(KEY, JSON.stringify(all));

// One more use of `feature` by `personId`. Unknown features and no person
// count nothing.
export function countUse(feature, personId) {
  if (!KNOWN.has(feature) || typeof personId !== 'string' || !personId) return;
  const all = read();
  if (!all[personId] && Object.keys(all).length >= MAX_PEOPLE) return;
  const mine = all[personId] ?? (all[personId] = {});
  mine[feature] = Math.min((mine[feature] ?? 0) + 1, MAX_COUNT);
  write(all);
}

// The counts waiting for `personId`, or null when there are none.
export function pendingUses(personId) {
  const mine = read()[personId];
  return mine && Object.keys(mine).length ? { ...mine } : null;
}

// The cloud has `sent`: take it off what waits (uses counted while it was
// sending stay).
export function sentUses(personId, sent) {
  const all = read();
  const mine = all[personId];
  if (!mine) return;
  for (const [f, n] of Object.entries(sent ?? {})) {
    if (mine[f] === undefined) continue;
    const left = mine[f] - n;
    if (left > 0) mine[f] = left;
    else delete mine[f];
  }
  if (!Object.keys(mine).length) delete all[personId];
  write(all);
}

// The feature a log entry (log.js) shows was used, or null. Most features are
// counted this way, from events the app logs already, so the screens that
// own them need no code of their own for counting.
export function useOfLog(entry) {
  const d = entry?.data ?? {};
  switch (entry?.kind) {
    case 'beat': return { play: 'beat-play', keep: 'beat-keep' }[d.action] ?? null;
    case 'dj': return d.rec === 'start' ? 'beat-record' : null;
    case 'song': return { play: 'song-play', keep: 'song-keep' }[d.action] ?? null;
    case 'chop': return d.made ? 'chop' : null;
    case 'backup': return d.saved === true ? 'backup' : null;
    case 'cloud':
      if (d.shared) return 'share';
      if (d.remixed) return 'remix';
      if (d.opened === 'share') return 'share-open';
      return null;
    default: return null;
  }
}

// Counts what the log shows, for whoever is the current person (`who()`).
// `onLog` is log.js's. Returns a function that stops it.
export function watchUses(onLog, who) {
  return onLog((entry) => {
    const f = useOfLog(entry);
    if (f) countUse(f, who());
  });
}
