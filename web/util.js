// Small helpers shared by several modules. No DOM, so tests can load them.

// A file extension for an audio MIME type, for download names and zip entries.
export function extensionFor(mime = '') {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'audio';
}

// A safe file-name piece from a label: "Ba dum tss!" -> "ba-dum-tss".
export function slug(text) {
  return (text || 'sound').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sound';
}

// "Pip, Juno and Toby"; one name alone; nothing for none.
export function joinNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// "1 sound", "2 sounds".
export function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Today as YYYY-MM-DD in local time (toISOString would give UTC's date).
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A record id like "user-lq3x9k-a1b2". Backups only accept ids of this shape
// (lowercase letters, digits and dashes), so keep it that way.
export function newId(prefix, now = Date.now(), random = Math.random()) {
  return `${prefix}-${now.toString(36)}-${random.toString(36).slice(2, 6)}`;
}

// Where a build's commit is on GitHub (the repo is public).
export const COMMIT_URL = 'https://github.com/pdxfixit/noodlepads/commit/';

// When a build went live, from its stamp: the deploy writes "2026-10-19 04:27
// UTC"; Ben's Mac fallback, its own US zone ("2026-10-11 13:45 PDT"). Null
// when it can't be read.
const STAMP_ZONES = { UTC: 0, GMT: 0, Z: 0, PST: -8, PDT: -7, MST: -7, MDT: -6, CST: -6, CDT: -5, EST: -5, EDT: -4 };
export function builtAt(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})\s*([A-Z]{1,4})?$/.exec(String(date ?? '').trim());
  const off = m && STAMP_ZONES[m[6] ?? 'UTC'];
  if (!m || off === undefined) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - off, +m[5]));
}

// "Oct 19, 9:27 PM": when it went live, in the device's own words and time
// zone (`locale` and `timeZone` are for tests). '' when the stamp can't be read.
export function updatedText(date, { locale, timeZone } = {}) {
  const at = builtAt(date);
  if (!at) return '';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(at);
}

// What the label next to the corner of the page says: the commit, then the
// date. No release number: nothing keeps a semver up to date, and a bare
// "1.0" said nothing (Ben, 2026-10-19). version.json is written by the
// deploy; a missing one (or the dev server's "dev") is a dev copy. `version`
// stays the bare commit: the update check and reports compare it. `url` is
// the commit on GitHub, when it is one.
export function versionLabel(v) {
  if (!v || typeof v !== 'object') return { version: 'dev', text: 'dev copy', date: '', url: '' };
  const version = String(v.version || 'dev').slice(0, 40);
  if (version === 'dev') return { version, text: 'dev copy', date: '', url: '' };
  // The date carries its time zone ("2026-10-11 13:45 PDT").
  const date = v.date ? String(v.date).slice(0, 26) : '';
  const url = /^[0-9a-f]{7,40}$/.test(version) ? `${COMMIT_URL}${version}` : '';
  return { version, text: `${version}${date ? ` · ${date}` : ''}`, date, url, updated: updatedText(date) };
}

// Per-viewer niceties (the last person, beats showing) that must never break
// the app: localStorage can be missing or throw in a private window.
export function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* per-viewer nicety only */ }
}
export function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function forget(key) {
  try { localStorage.removeItem(key); } catch { /* per-viewer nicety only */ }
}
