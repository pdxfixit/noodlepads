// Small helpers shared by several modules. No DOM, so tests can load them.

// A held Enter repeats its keydown, and on a focused button each repeat is
// another click: a sound played on and on, a loop or a pill toggled on and
// off, a digit typed again. One press, one click: `box` takes Enter's
// repeats on whatever matches `sel` inside it (Shift+Enter's too). It
// touches only the `box` it is given, so this file stays free of the page.
export function onePressOneClick(box, sel = 'button') {
  box?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.repeat && e.target.closest?.(sel)) e.preventDefault(); });
}

// A file extension for an audio MIME type, for download names and zip entries.
export function extensionFor(mime = '') {
  const m = String(mime);
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'audio';
}

// A safe file-name piece from a label: "Ba dum tss!" -> "ba-dum-tss".
// Letters with accents split first, so "Café" gives "cafe"; `fallback` is
// what a label with nothing left becomes.
export function slug(text, fallback = 'sound') {
  return String(text || fallback).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

// "Pip, Juno and Toby"; one name alone; nothing for none.
export function joinNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// "1 sound", "2 sounds", "2 people"; `many` for any other plural ("keys changed").
export function count(n, word, many = word === 'person' ? 'people' : `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
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
// date. The release shows in About only (Ben, 2026-10-20). version.json is
// written by the deploy: `version` is the whole label, "v1.0.215-4d5ef56"
// (the release from web/version.js, site.conf release=), and `commit` the
// short commit. A missing file (or the dev server's "dev") is a dev copy.
// `version` stays the whole label: the update check, telemetry and reports
// compare it. `commit` is what About shows, from version.json's `commit`, or
// `version` itself when that is a bare commit (a stamp from before release=);
// `url` is that commit on GitHub, when there is one. `release` is the label's
// X.Y.Z ("1.0.215"), or '' for a stamp without one.
export function versionLabel(v) {
  if (!v || typeof v !== 'object') return { version: 'dev', release: '', commit: '', text: 'dev copy', date: '', url: '' };
  const version = String(v.version || 'dev').slice(0, 40);
  if (version === 'dev') return { version, release: '', commit: '', text: 'dev copy', date: '', url: '' };
  const release = /^v(\d+\.\d+\.\d+)-/.exec(version)?.[1] ?? '';
  // The date carries its time zone ("2026-10-11 13:45 PDT").
  const date = v.date ? String(v.date).slice(0, 26) : '';
  const sha = (s) => (/^[0-9a-f]{7,40}$/.test(s) ? s : '');
  const commit = sha(String(v.commit ?? '')) || sha(version);
  const url = commit ? `${COMMIT_URL}${commit}` : '';
  return { version, release, commit, text: `${commit || version}${date ? ` · ${date}` : ''}`, date, url, updated: updatedText(date) };
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

// A pad, key or tile whose sound loops: lit, and pressed for a screen reader
// ("Kick, toggle button, pressed"), so it is heard that a tap stops it. One
// that is not looping says nothing, as a tap only plays it.
export function showLooping(button, on) {
  button.classList.toggle('looping', on);
  if (on) button.setAttribute('aria-pressed', 'true');
  else button.removeAttribute('aria-pressed');
}
