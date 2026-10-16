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

import { remember, recall, forget } from './util.js';
import { usageOn } from './usage.js';

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
  // Dialogs opened (dialogs.js openDialog, by DIALOG_USES below).
  'settings',      // ⚙️ Settings
  'help',          // ❓ Help
  'people',        // 👥 People
  'profile',       // a person's profile sheet
  'names',         // 🎲 Pick a name
  'avatar',        // a person's picture
  'cloud-sheet',   // ☁️ Cloud
  'cloud-list',    // the cloud's list of people
  'share-sheet',   // the share dialog
  'bulk',          // ✏️ Edit sounds' chosen sounds (Move to group, Color · picture, …)
  'shared-list',   // what this person shares
  'pin',           // 🔒 PIN
  'my-beats',      // 🗂️ My beats
  'lane-sheet',    // 🎼 a song lane's sheet
  'my-songs',      // 🗂️ My songs
  'pictures',      // the picture chooser
  'takes',         // 🎤 Live's takes
  'keys-edit',     // ✏️ Edit keys
  'chooser',       // a sound chooser
  'sound-sheet',   // a pad's sound sheet (new sound or edit)
  // From the log (useOfLog below).
  'beat-new',      // 🆕 New beat
  'groove-load',   // 💃 a groove loaded
  'groove-sample', // 💃 a groove's ▶ sample
  'beat-grow',     // ● Record grew the beat (1 → 2 → 4 bars)
  'song-new',      // 🆕 New song
  'song-sound',    // a song saved as a sound
  'backup-load',   // 📂 a backup loaded
  'voice',         // a voice rendered onto a sound (a preview counts too)
  'setting',       // any setting changed
  'level-kids',    // the level set to 🧸 Kids
  'level-regular', // the level set to Regular
  'level-advanced',// the level set to Advanced
  'person-add',    // a person added
  'person-delete', // a person deleted
  'cloud-put',     // a person put in the cloud
  'cloud-open',    // a profile opened from the cloud
  'offline',       // 📴 Offline turned on
  'pin-set',       // a PIN set
  'unshare',       // a share taken back
  'kids-voice',    // 🧸 Kids: a voice picked
];
const KNOWN = new Set(USES);

// The feature each dialog counts when it opens, by the <dialog>'s id in
// index.html. Grooves, the mixer, the roll and the Kids sum are counted where
// they open (and by what they do), so they are not here.
export const DIALOG_USES = {
  'settings-dialog': 'settings',
  help: 'help',
  'people-dialog': 'people',
  'profile-dialog': 'profile',
  'names-dialog': 'names',
  'avatar-dialog': 'avatar',
  'cloud-dialog': 'cloud-sheet',
  'cloud-list': 'cloud-list',
  'share-dialog': 'share-sheet',
  'bulk-dialog': 'bulk',
  'shared-dialog': 'shared-list',
  'pin-dialog': 'pin',
  library: 'my-beats',
  'lane-sheet': 'lane-sheet',
  songs: 'my-songs',
  pictures: 'pictures',
  takes: 'takes',
  'keys-edit': 'keys-edit',
  chooser: 'chooser',
  sheet: 'sound-sheet',
};
export const useOfDialog = (dialog) => DIALOG_USES[dialog?.id] ?? null;

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
// With the usage switch off there is no header (null), and the Worker then
// keeps no metrics for the call (worker/metrics.js optedIn).
export function appMeta(version, width, touch) {
  if (!usageOn()) return null;
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
// Nothing is counted while the usage switch is off (usage.js).
export function countUse(feature, personId) {
  if (!usageOn() || !KNOWN.has(feature) || typeof personId !== 'string' || !personId) return;
  const all = read();
  if (!all[personId] && Object.keys(all).length >= MAX_PEOPLE) return;
  const mine = all[personId] ?? (all[personId] = {});
  mine[feature] = Math.min((mine[feature] ?? 0) + 1, MAX_COUNT);
  write(all);
}

// The counts waiting for `personId`, or null when there are none (always
// null while the usage switch is off).
export function pendingUses(personId) {
  if (!usageOn()) return null;
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

// The usage switch went off: every count waiting on this device goes.
export const clearUses = () => forget(KEY);

// The feature a log entry (log.js) shows was used, or null. Most features are
// counted this way, from events the app logs already, so the screens that
// own them need no code of their own for counting.
export function useOfLog(entry) {
  const d = entry?.data ?? {};
  switch (entry?.kind) {
    case 'beat': return { play: 'beat-play', keep: 'beat-keep', new: 'beat-new', groove: 'groove-load', sample: 'groove-sample' }[d.action] ?? null;
    case 'dj': return { start: 'beat-record', grow: 'beat-grow' }[d.rec] ?? null;
    case 'song': return { play: 'song-play', keep: 'song-keep', new: 'song-new', sound: 'song-sound' }[d.action] ?? null;
    case 'chop': return d.made ? 'chop' : null;
    case 'backup': return d.saved === true ? 'backup' : d.loaded === true ? 'backup-load' : null;
    case 'render': return 'voice';
    case 'setting':
      if (d.key === 'level') return { kids: 'level-kids', regular: 'level-regular', advanced: 'level-advanced' }[d.value] ?? 'setting';
      return 'setting';
    case 'person':
      if (d.added) return 'person-add';
      if (d.deleted) return 'person-delete';
      return null;
    case 'kids': return d.voice && d.recorded === undefined ? 'kids-voice' : null;
    case 'cloud':
      if (d.shared) return 'share';
      if (d.remixed) return 'remix';
      if (d.opened === 'share') return 'share-open';
      if (d.opened === true) return 'cloud-open';
      if (d.put) return 'cloud-put';
      if (d.offline === true) return 'offline';
      if (d.pin === 'set') return 'pin-set';
      if (d.unshared) return 'unshare';
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
