// Cloud profiles on this device (docs/design/cloud-profiles.md): which people
// are in the cloud here (IndexedDB `cloud`), putting everyone there by
// themselves, when they sync, the PIN asked when a person is opened, Offline
// (this device only), and share codes both ways. The rules are in
// cloud-sync.js and the routes in cloud-api.js; this binds them to the app's
// storage. The board never waits on any of it: everything works on the
// device, and the cloud catches up.

import { state, readStorage, setPersonEdit } from './state.js';
import { db } from './store.js';
import { audio } from './audio.js';
import { cleanBackup } from './backup.js';
import { followPerson, cleanPrefs } from './settings.js';
import { createCloudApi, CloudError, cloudTrouble } from './cloud-api.js';
import { syncProfile, shareBundle, shareDoc, uploadAudio, hasMade, syncNote, CLOUD_KINDS, CLOUD_MAX_SOUND } from './cloud-sync.js';
import { funName, isFunName } from './names.js';
import { isHiddenBeat, isScratchSong } from './scratch.js';
import { people } from './board.js';
import { newId, recall, remember } from './util.js';
import { logEvent } from './log.js';
import { createSyncTiming, SYNC_DELAY_MS, ACTIVE_MS } from './sync-timing.js';
import { appMeta } from './device-meta.js';
import { track } from './telemetry.js';

// Given by app.js (initCloud), so this module never imports backup-ui.js,
// which imports the People screen, which imports this.
let storeLoaded = async () => {};
let whatIsHere = () => ({ peopleIds: new Set(), clipIds: new Set() });
let renderShare = async () => null;   // (kind, id, {leave}) -> a Blob of it as it plays, or null

// Every call says the app's version, a screen-width bucket and touch (ADR 0016).
const deviceMeta = () => appMeta(state.version, globalThis.screen?.width, (globalThis.navigator?.maxTouchPoints ?? 0) > 0);
export const api = createCloudApi({ fetch: (...args) => globalThis.fetch(...args), meta: deviceMeta });
export { cloudTrouble, CloudError };

export { SYNC_DELAY_MS, ACTIVE_MS };    // when it syncs: sync-timing.js
export const PIN_ROUNDS = 20_000;      // the device's own check of a PIN (link.check)
export const REMEMBER_DAYS = 90;       // how long 🔑 Remember on this device skips the PIN
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const SHARED_KEY = 'shared';           // localStorage: the codes this device opened (Shared with me)
export const MAX_SHARED = 100;
export const SHARE_TOO_LONG = `That sound is too long to share (the most is ${CLOUD_MAX_SOUND / 1048576} MB).`;

// ── is the cloud there? ──

let there = null;       // null: not asked yet
let askedAt = 0;
// Whether this copy of the app has a cloud (noodlepads.com does; the dev
// server and `just look` don't). A "no" is asked again after a minute.
export async function cloudThere() {
  if (there === true) return true;
  if (there === false && Date.now() - askedAt < 60_000) return false;
  askedAt = Date.now();
  try {
    await api.hello();
    there = true;
  } catch {
    there = false;
  }
  return there;
}
// For tests: forget the answer.
export function resetCloudCheck() { there = null; askedAt = 0; }

// ── links and keys ──
//
// A link: {id, key, rev, sent, sounds, pin, check, newPin, rememberUntil,
// noOffer}. `key` is kept for a profile with no PIN, or one this device
// remembers; any other PIN's key lives in `sessionKeys`, for this page's
// life, so the PIN is asked on every visit. `rememberUntil` (ms): after the
// PIN, 🔑 Remember on this device skips it here for REMEMBER_DAYS (Ben,
// 2026-10-26); `noOffer`: they said Not now, so it isn't offered again here.
// `check` ({salt, hash}) lets the device check a PIN itself when offline.
// `newPin`: the profile has a PIN this device has never had typed (set or
// changed on another device since it was last opened here); until it is
// typed, the person can't be opened, and 🤷 I don't know the PIN deletes them
// from this device.

const sessionKeys = new Map();   // person id -> key, not stored
const unlocked = new Set();      // people whose PIN was typed since they were last opened
// People whose PIN was typed on this visit (until the page reloads), however:
// opening them, setting it, or the profile sheet's guard. Their name, picture
// and color can be changed without asking again (people.js, Ben 2026-10-12).
const pinTyped = new Set();

export const linkOf = (personId) => state.cloud.get(personId) ?? null;
export const inCloud = (personId) => state.cloud.has(personId);
export const keyOf = (personId) => linkOf(personId)?.key || sessionKeys.get(personId) || null;
export const isOffline = (personId) => state.peopleEdits.get(personId)?.offline === true;
// A PIN this device remembers, until its day comes.
const remembers = (link) => !!link?.pin && link.rememberUntil > Date.now();
// Only a profile with no PIN, or one remembered here, keeps its key on the device.
const keepsKey = (link) => !link?.pin || remembers(link);
// The profile has a PIN this device has never had typed (a link's `newPin`).
export const pinIsNew = (personId) => !!linkOf(personId)?.newPin;

async function saveLink(link) {
  const stored = keepsKey(link) ? link : { ...link, key: null };
  if (!keepsKey(link) && link.key) sessionKeys.set(link.id, link.key);
  state.cloud.set(link.id, stored);
  try { await db.put('cloud', stored); } catch (err) { console.error('Saving a cloud link failed:', err); }
}

// A link dropped a moment ago, back as it was (people.js deleteHere, when the
// person could not be deleted after all). A key held for this visit only is
// not; their PIN opens them again.
export const restoreLink = (link) => saveLink(link);

// This device stops syncing the person; the profile stays in the cloud.
// `keepBases`: their last-synced copies stay until `forgetBases` (people.js
// deleteHere drops them only once the person is really gone, so a link put
// back keeps its three-way merges).
export async function dropLink(personId, { keepBases = false } = {}) {
  state.cloud.delete(personId);
  sessionKeys.delete(personId);
  unlocked.delete(personId);
  status.delete(personId);
  fetchedFor.delete(personId);
  try { await db.remove('cloud', personId); } catch { /* not stored */ }
  if (!keepBases) await dropBases(personId);
  tell();
}
export const forgetBases = (personId) => dropBases(personId);

// ── status, for the screens ──

// person id -> {state, text, at}. 'trouble' and 'locked' (a PIN this device
// hasn't had, which someone must type) are the ⚠️ ones; 'waiting' is a PIN
// not typed yet on this visit, which every open asks for anyway.
const status = new Map();   // state: 'syncing' | 'ok' | 'trouble' | 'locked' | 'waiting'
const watchers = new Set();
export const statusOf = (personId) => status.get(personId) ?? null;
export function onCloud(fn) { watchers.add(fn); return () => watchers.delete(fn); }
function tell() { for (const fn of watchers) fn(); }
function setStatus(personId, value) { status.set(personId, { ...value, at: Date.now() }); tell(); }

// ── the PIN, when a person is opened ──

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function pinHash(pin, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ROUNDS }, key, 256));
}
async function pinCheck(pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pinHash(pin, salt) };
}

// Whether this device skips their PIN (🔑 Remember on this device): until
// when, in ms, or 0. A remembering whose day has come is forgotten here.
export function rememberedUntil(personId) {
  const link = linkOf(personId);
  if (remembers(link)) return link.rememberUntil;
  if (link?.rememberUntil) forgetHere(personId);
  return 0;
}

// Whether opening this person on this device asks for their PIN now.
export function needsPin(personId) {
  const link = linkOf(personId);
  return !!link?.pin && !unlocked.has(personId) && !rememberedUntil(personId);
}

// The PIN guard: whether reading or changing anything of this person's asks
// for their PIN first (Ben, 2026-10-24): their profile (people.js), their
// counts and sounds on others' screens, backups (backup-ui.js). Only a person
// whose cloud profile has a PIN, and only until it is typed once on this
// visit. A gate on this device's screens: syncs change them as before.
export const pinGuards = (personId) => !!linkOf(personId)?.pin && !pinTyped.has(personId) && !rememberedUntil(personId);

// Checks a PIN for the guard the way opening a person does (unlock: the
// Worker, with its wrong-try count and 10-minute wait; offline, the device's
// own check). Throws as unlock does.
export async function checkPin(personId, pin) {
  await unlock(personId, pin);
}

// The person was switched away from: their PIN is asked the next time.
export function leftPerson(personId) {
  unlocked.delete(personId);
}

// Opens a person with their PIN. Online, the cloud checks it and gives a key
// for this visit; offline, the device's own check lets them in, and the sync
// waits for the next open. A PIN new to this device is checked by the cloud
// only. Throws a CloudError on a wrong PIN.
export async function unlock(personId, pin) {
  const link = linkOf(personId);
  if (!link) return;
  try {
    // A device that remembers them keeps a key that lasts (a session key
    // would be deleted in a week while it is still kept here).
    const opened = await api.open(personId, pin, remembers(link));
    // The key this device held before is dropped in the cloud, so each open
    // leaves one key, not one more.
    const before = keyOf(personId);
    if (before && before !== opened.key) api.forget(personId, before).catch(() => {});
    sessionKeys.delete(personId);
    await saveLink({ ...link, key: opened.key, pin: !!opened.pin, check: await pinCheck(pin), newPin: undefined });
    status.delete(personId);
  } catch (err) {
    // The cloud said no to the PIN (wrong, or too many wrong tries): a usage
    // event, no log entry. A 429 'slow' (a minute's rate limit) is no PIN at all.
    if (err instanceof CloudError && (err.status === 401 || (err.status === 429 && err.error === 'wait'))) track('noodlepads.cloud', { action: 'pin-wrong' });
    if (!(err instanceof CloudError) || err.status !== 0 || !link.check || await pinHash(pin, link.check.salt) !== link.check.hash) throw err;
  }
  unlocked.add(personId);
  pinTyped.add(personId);
  logEvent('cloud', { unlocked: true });
  if (keyOf(personId)) syncNow(personId);
}

// A key the cloud no longer takes (401 on a sync): a PIN was set or changed
// on another device, which closes the profile everywhere (worker/cloud.js
// changeProfile), or Ben cleared a forgotten one (`just cloud-reset-pin`).
// The public list says which, without spending a wrong try: no PIN now, and
// it opens again at once; else the PIN is new here and must be typed before
// the person opens (Ben, 2026-10-19).
async function keyRefused(personId) {
  sessionKeys.delete(personId);
  unlocked.delete(personId);
  pinTyped.delete(personId);
  const link = linkOf(personId);
  if (!link) return;
  const listed = (await api.list().catch(() => null))?.profiles?.find((p) => p.id === personId);
  if (listed && !listed.pin) {
    try {
      const opened = await api.open(personId);
      await saveLink({ ...link, key: opened.key, pin: false, check: undefined, newPin: undefined, rememberUntil: undefined });
      setStatus(personId, { state: 'ok', text: 'Opened again: its PIN was cleared.' });
      return;
    } catch { /* a PIN came meanwhile: as below */ }
  }
  await saveLink({ ...link, key: null, pin: true, check: undefined, newPin: true, rememberUntil: undefined });
  setStatus(personId, { state: 'locked', text: '🔒 They have a new PIN. Open them and type it.' });
}

// 🔑 Remember on this device, offered after their PIN opens them (cloud-ui.js
// offerRemember) and in their profile's PIN part: this device skips the PIN
// for REMEMBER_DAYS. The cloud gives a key that lasts, which this device
// keeps; the visit's own key is dropped. Needs the cloud: throws a CloudError
// as unlock does.
export async function rememberHere(personId, pin) {
  const link = linkOf(personId);
  if (!link) return;
  const opened = await api.open(personId, pin, true);
  const before = keyOf(personId);
  if (before && before !== opened.key) api.forget(personId, before).catch(() => {});
  sessionKeys.delete(personId);
  await saveLink({ ...link, key: opened.key, pin: !!opened.pin, check: await pinCheck(pin), newPin: undefined, rememberUntil: Date.now() + REMEMBER_MS, noOffer: undefined });
  unlocked.add(personId);
  pinTyped.add(personId);
  logEvent('cloud', { remember: true });
  tell();
}

// Not now, on the offer: it isn't offered again on this device (their
// profile's PIN part still has it).
export async function declineRemember(personId) {
  const link = linkOf(personId);
  if (link && !link.noOffer) await saveLink({ ...link, noOffer: true });
}

// Whether to offer 🔑 Remember after their PIN: not when it is on already,
// or after Not now.
export const offersRemember = (personId) => {
  const link = linkOf(personId);
  return !!link?.pin && !link.noOffer && !remembers(link);
};

// Forget this device, or a remembering whose day has come: the PIN is asked
// the next time they are opened. The key that lasts is deleted here and in
// the cloud, so syncs wait for that PIN.
const forgetting = new Set();
export async function forgetHere(personId) {
  const link = linkOf(personId);
  if (!link?.rememberUntil || forgetting.has(personId)) return;
  forgetting.add(personId);
  try {
    const key = link.key || sessionKeys.get(personId);
    sessionKeys.delete(personId);
    await saveLink({ ...link, key: link.pin ? null : link.key, rememberUntil: undefined });
    if (key && link.pin) api.forget(personId, key).catch(() => {});
    logEvent('cloud', { remember: false });
    tell();
  } finally {
    forgetting.delete(personId);
  }
}

// ── sync ──

// The last-synced copy of each of a person's records (IndexedDB `bases`), the
// base of the three-way merge. Keyed "<person>|<kind>:<id>".
const baseKey = (personId, k) => `${personId}|${k}`;
const bases = {
  async load(personId) {
    const all = await db.all('bases').catch(() => []);
    return new Map(all.filter((b) => b.personId === personId).map((b) => [b.id.slice(personId.length + 1), b.body]));
  },
  async save(personId, changes) {
    await db.batch([...changes].map(([k, body]) => (body === null
      ? { store: 'bases', del: baseKey(personId, k) }
      : { store: 'bases', put: { id: baseKey(personId, k), personId, body } })));
  },
};
async function dropBases(personId) {
  try {
    const mine = (await db.all('bases')).filter((b) => b.personId === personId);
    if (mine.length) await db.batch(mine.map((b) => ({ store: 'bases', del: b.id })));
  } catch { /* none kept */ }
}

const running = new Map();   // person id -> promise
const hearing = new Map();   // person id -> Set of onProgress, for the sync running now
const stops = new Map();     // person id -> AbortController of the sync running now
// person id -> Map sound id -> Blob: what an open cut short had fetched, so
// 🔄 Try again picks up there (this visit only; cleared once it's done).
const fetchedFor = new Map();
let applying = 0;            // while a sync stores what it pulled, those writes are not "changes"
// Runs `fn` as the sync's own writes. Only these: a kid's edit while a sync
// waits on the network is a change like any other, and schedules the next sync.
const quietly = (fn) => async (...args) => {
  applying++;
  try { return await fn(...args); } finally { applying--; }
};
// Shown and focused: the 5-minute sync runs only then.
const pageActive = () => {
  const doc = globalThis.document;
  if (!doc) return false;
  return doc.visibilityState !== 'hidden' && (typeof doc.hasFocus !== 'function' || doc.hasFocus());
};
const timing = createSyncTiming({ run: () => syncAll(), active: pageActive });
// What waits to sync (sync-timing.js pending), for the tests.
export const syncPending = () => timing.pending();
// A sync the cloud's minute limit stopped says so, and goes again in a minute.
export const SLOW_TEXT = 'Busy right now: trying again in a minute.';

const storedLists = () => ({
  people: [...state.peopleEdits.values()], clips: state.userClips, overrides: [...state.overrides.values()],
  orders: [...state.orders.values()], patterns: [...state.patterns.values()], beats: state.savedBeats,
  settings: [...state.settings].map(([key, value]) => ({ key, value })),
  decks: [...state.decks.values()], takes: state.takes, songs: [...state.songs.values()], songbook: state.songbook,
  // Only the settings that travel: a person's DJ keyboard from before stays behind.
  prefs: [...state.prefs.values()].map(cleanPrefs),
  layouts: state.layouts, voices: state.myVoices, touchLayouts: state.touchLayouts,
});

async function sha256(blob) {
  return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

const kitIds = () => (state.manifest?.kit ?? []).map((k) => k.id);

function deps() {
  return {
    api,
    bases,
    lists: storedLists,
    kitIds: kitIds(),
    sha256,
    clean: (doc, audioOf) => cleanBackup(doc, audioOf, whatIsHere()),
    merge: quietly((cleaned) => storeLoaded(cleaned)),
    put: quietly(async (store, record) => {
      await db.put(store, record);
      if (store === 'clips' || store === 'overrides') audio.forget(record.id);
    }),
    remove: quietly(async (store, key) => {
      await db.remove(store, key);
      if (store === 'clips' || store === 'overrides') audio.forget(key);
    }),
    // A sync's progress, without undoing what happened meanwhile: a new key
    // (PIN changed) stays, and a link dropped while it ran stays dropped.
    saveLink: async (l) => {
      const now = linkOf(l.id);
      if (now) await saveLink({ ...l, key: keyOf(l.id), pin: now.pin, check: now.check, newPin: now.newPin });
    },
  };
}

// Syncs one person now (one sync at a time each). Never throws: trouble is
// kept as the person's status and said where the cloud is shown.
// `onProgress` hears how far it has got (cloud-sync.js newProgress), joining
// the sync already running for them if there is one.
export function syncNow(personId, { onProgress } = {}) {
  if (!inCloud(personId) || !db.handle) return Promise.resolve(null);
  if (!keyOf(personId)) {
    setStatus(personId, { state: 'waiting', text: '🔒 Syncs once they are opened with their PIN.' });
    return Promise.resolve(null);
  }
  if (onProgress) {
    if (!hearing.has(personId)) hearing.set(personId, new Set());
    hearing.get(personId).add(onProgress);
  }
  if (running.has(personId)) return running.get(personId);
  const stop = new AbortController();
  stops.set(personId, stop);
  const run = (async () => {
    setStatus(personId, { state: 'syncing', text: 'Syncing…' });
    const id = personId;
    try {
      const link = linkOf(id);
      const report = await syncProfile({ ...link, key: keyOf(id), sent: { ...link.sent }, sounds: { ...link.sounds } }, {
        ...deps(),
        signal: stop.signal,
        fetched: fetchedFor.get(id),
        onProgress: (p) => { for (const fn of hearing.get(id) ?? []) fn(p); },
      });
      fetchedFor.delete(id);
      await quietly(async () => { await readStorage(); followPerson(); })();
      logEvent('cloud', { sync: true, pulled: report.pulled, pushed: report.pushed, deleted: report.deleted, sounds: report.sounds, merged: report.merged, clashes: report.clashes, kept: report.kept });
      setStatus(id, { state: 'ok', text: syncNote(report) });
      return report;
    } catch (err) {
      logEvent('cloud', { sync: false, status: err?.status ?? 0, error: String(err?.error ?? err?.message ?? err) });
      if (err instanceof CloudError && err.status === 404 && err.error === 'profile') {
        // Taken out of the cloud elsewhere (set Offline there, or pruned):
        // this device keeps it, and does not put it back by itself.
        await dropLink(id);
        await setPersonEdit(id, { offline: true });
        setStatus(id, { state: 'trouble', text: 'Taken out of the cloud on another device. It stays here, offline. Switch Offline off to put it back.' });
      } else if (err instanceof CloudError && err.status === 401) {
        await keyRefused(id);
      } else if (err?.name === 'QuotaExceededError') {
        setStatus(id, { state: 'trouble', text: 'This device is full. Make some room on it, then try again.' });
      } else if (err instanceof CloudError && err.status === 429 && err.error === 'slow') {
        // A minute's rate limit: the sync comes back by itself (sync-timing.js slow).
        setStatus(id, { state: 'trouble', text: SLOW_TEXT });
        timing.slow();
      } else {
        setStatus(id, { state: 'trouble', text: cloudTrouble(err) });
      }
      return null;
    } finally {
      running.delete(personId);
      hearing.delete(personId);
      stops.delete(personId);
    }
  })();
  running.set(personId, run);
  return run;
}

// ☁️ Open from the cloud (cloud-ui.js): syncs someone just opened here,
// telling `onProgress` how far it has got. Nothing heard for STALL_MS stops
// it: a stalled fetch never ends by itself, and the sheet waits on it, locked
// (Ben, 2026-10-26). Sounds fetched before a stop are kept for this visit,
// so trying again picks up there. Resolves {ok, stored, text}: `stored`, the
// person is on this device even if the rest went wrong.
export const STALL_MS = 20_000;
export async function bringDown(personId, onProgress, { stallMs = STALL_MS } = {}) {
  if (!fetchedFor.has(personId)) fetchedFor.set(personId, new Map());
  let stored = false;
  let timer;
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => stops.get(personId)?.abort(), stallMs);
  };
  watch();
  try {
    const report = await syncNow(personId, {
      onProgress: (p) => {
        stored ||= p.stored;
        watch();
        try { onProgress(p); } catch (err) { console.error('The progress bar failed:', err); }
      },
    });
    return { ok: !!report, stored: stored || !!report, text: report ? '' : statusOf(personId)?.text ?? cloudTrouble(null) };
  } finally {
    clearTimeout(timer);
  }
}

// Don't bring them (☁️ Open from the cloud, after a stop): the link made by
// opening them goes, and its key in the cloud too, so nothing brings them
// here later by itself. Their profile in the cloud is untouched.
export async function leaveInCloud(personId) {
  const key = keyOf(personId);
  await syncEnded(personId);
  await dropLink(personId);
  if (key) api.forget(personId, key).catch(() => {});
  logEvent('cloud', { opened: 'left' });
}

// The sync running for a person, once it ends (null when none runs). Deleting
// someone waits for it after dropping their link (people.js deleteHere): what
// it pulled, their own record among it, would be stored again after the delete.
export const syncEnded = (personId) => running.get(personId) ?? Promise.resolve(null);

// Everyone on the device is in the cloud (Ben, 2026-10-11), except people set
// Offline, and anyone who has made nothing yet (a new device's empty "Me"
// would otherwise fill the public list).
export const wantsCloud = (p) => p.added && !p.hidden && !isOffline(p.id) && !inCloud(p.id)
  && hasMade(storedLists(), p.id, kitIds());

// One syncAll at a time: two at once (the start-up one, and one after a
// change) both made a new person's profile, and the loser said "resting".
// A call while one runs gets one more run after it, shared by every caller.
let allRunning = null;
let allAgain = null;
export function syncAll() {
  if (allAgain) return allAgain;
  if (allRunning) {
    allAgain = allRunning.then(() => { allAgain = null; return syncAll(); });
    return allAgain;
  }
  allRunning = syncEveryone().finally(() => { allRunning = null; });
  return allRunning;
}

async function syncEveryone() {
  timing.ran();
  if (!await cloudThere()) return;
  for (const p of people({ includeHidden: true }).filter(wantsCloud)) {
    try {
      await putInCloud(p.id);
    } catch (err) {
      setStatus(p.id, { state: 'trouble', text: err instanceof CloudError ? cloudTrouble(err) : String(err?.message || err) });
    }
  }
  for (const id of [...state.cloud.keys()]) await syncNow(id);
}

// After a change: sync once things have been quiet for SYNC_DELAY_MS.
export function scheduleSync() {
  timing.changed();
}

// What waits to sync (sync-timing.js pending): for the tests.
export const syncWaiting = () => timing.pending();

// ── putting someone in the cloud, and taking them out ──

// Gives a person a fun name if theirs was typed, so a typed name never leaves
// the device. Returns the person's record.
async function funNamed(personId) {
  const record = state.peopleEdits.get(personId);
  if (!record?.added) throw new Error('only people added in the app can go in the cloud');
  if (record.fun === true && isFunName(record.name)) return record;
  const taken = people({ includeHidden: true }).filter((p) => p.id !== personId).map((p) => p.name);
  await setPersonEdit(personId, { name: funName(taken), fun: true });
  return state.peopleEdits.get(personId);
}

// Makes the person's profile. The same person already there (from a backup
// on another device) is opened instead; one with a PIN waits, locked, for it,
// as a PIN new to this device.
async function putInCloud(personId) {
  const p = await funNamed(personId);
  try {
    const made = await api.create({ id: p.id, name: p.name, avatar: p.avatar ?? '', color: p.color, edited: p.edited ?? Date.now() });
    await saveLink({ id: personId, key: made.key, rev: made.rev, sent: {}, sounds: {}, pin: false });
    logEvent('cloud', { put: true });
  } catch (err) {
    if (!(err instanceof CloudError && err.status === 409)) throw err;
    try {
      const opened = await api.open(personId);
      await saveLink({ id: personId, key: opened.key, rev: 0, sent: {}, sounds: {}, pin: !!opened.pin });
    } catch (e2) {
      if (!(e2 instanceof CloudError && e2.status === 401)) throw e2;
      await saveLink({ id: personId, key: null, rev: 0, sent: {}, sounds: {}, pin: true, newPin: true });
      setStatus(personId, { state: 'locked', text: '🔒 Already in the cloud with a PIN. Open them to join up.' });
    }
  }
}

// ☁️ In the cloud switched on (or a PIN set) in their profile sheet: they go
// in the cloud now, even with nothing made yet, and sync. Back from 📴 Offline
// too. Throws a CloudError when the cloud isn't reachable from here.
export async function putUpNow(personId) {
  if (isOffline(personId)) await setPersonEdit(personId, { offline: false });
  if (!inCloud(personId)) {
    if (!await cloudThere()) throw new CloudError(0, { error: 'no cloud' });
    await putInCloud(personId);
  }
  status.delete(personId);
  logEvent('cloud', { offline: false });
  return syncNow(personId);
}

// Opens a profile from the list on this device (with its PIN, if it has one):
// the link and its key. Its person arrives with the first sync (bringDown).
export async function openProfile(profileId, pin) {
  const opened = await api.open(profileId, pin, !pin);
  const before = linkOf(profileId);
  await saveLink({
    id: profileId, key: opened.key, rev: before?.rev ?? 0, sent: before?.sent ?? {}, sounds: before?.sounds ?? {},
    pin: !!opened.pin, check: pin ? await pinCheck(pin) : undefined,
  });
  if (pin) { unlocked.add(profileId); pinTyped.add(profileId); }
  if (isOffline(profileId)) await setPersonEdit(profileId, { offline: false });
  logEvent('cloud', { opened: true });
}

export async function setPin(personId, current, next) {
  // A sync still running (typing the PIN just now starts one) finishes first:
  // the change closes every key, and that sync would answer it with a stale PIN.
  await running.get(personId);
  const link = linkOf(personId);
  const res = await api.change(personId, keyOf(personId), { pin: current || undefined, newPin: next });
  // A PIN changed here stays remembered here; a removed one has nothing to remember.
  await saveLink({ ...link, key: res.key, pin: !!next, check: next ? await pinCheck(next) : undefined, newPin: undefined, rememberUntil: next ? link.rememberUntil : undefined });
  if (next) { unlocked.add(personId); pinTyped.add(personId); }
  logEvent('cloud', { pin: next ? 'set' : 'removed' });
}

// Deletes a profile from the cloud with `key`, or with a key opened by the
// PIN when there is none. ☁️ Delete their cloud copy too in a profile sheet (people.js)
// calls it for someone already gone from this device.
export async function removeProfile(personId, key, pin) {
  if (!key) key = (await api.open(personId, pin, false)).key;
  await api.remove(personId, key, pin);
  logEvent('cloud', { removed: true });
}

// Deletes the profile from the cloud (its key, and its PIN if it has one).
// This device keeps everything.
export async function deleteFromCloud(personId, pin) {
  await removeProfile(personId, keyOf(personId), pin);
  await dropLink(personId);
}

// 📴 Offline (this device only). On: the cloud copy is deleted first (it asks
// twice, and wants the PIN), and the person is never put back by itself.
// Off: they go to the cloud on the next sync, which starts now.
export async function setOffline(personId, on, pin) {
  if (on) {
    if (inCloud(personId)) await deleteFromCloud(personId, pin);
    await setPersonEdit(personId, { offline: true });
    status.delete(personId);
    tell();
    logEvent('cloud', { offline: true });
    return null;
  }
  await setPersonEdit(personId, { offline: false });
  status.delete(personId);
  logEvent('cloud', { offline: false });
  return syncAll();
}

// ── sharing: a code anyone can open, read-only, until its sharer unshares it ──

// What `personId` may share: their sounds, saved beats and saved songs (not
// their scratch beat or song, ADR 0020: 💾 Keep it first).
export function shareable(personId) {
  return {
    sound: state.userClips.filter((c) => c.personId === personId).map((c) => ({ id: c.id, name: c.label, emoji: c.emoji || '🔊' })),
    beat: state.savedBeats.filter((b) => b.personId === personId && !isHiddenBeat(b)).map((b) => ({ id: b.id, name: b.name, emoji: '🥁' })),
    song: state.songbook.filter((s) => s.personId === personId && !isScratchSong(s)).map((s) => ({ id: s.id, name: s.name, emoji: '🎼' })),
  };
}

// A share code for one sound, beat or song: syncs first, so every sound in it
// is in the cloud, then puts up a recording of it as it plays (the preview
// anyone can play) and the snapshot. Returns {code, title}.
export async function shareItem(personId, kind, itemId) {
  if (isOffline(personId)) throw new Error('This person is offline (this device only). Switch Offline off to share.');
  if (!inCloud(personId)) await syncAll();
  if (!inCloud(personId) || !keyOf(personId)) throw new CloudError(0, { error: 'offline' });
  await syncNow(personId);
  const s = statusOf(personId);
  if (s?.state === 'trouble' || s?.state === 'locked') throw new Error(s.text);
  const made = shareBundle(kind, itemId, storedLists(), personId, kitIds());
  if (!made) throw new Error("That isn't here any more.");
  const link = linkOf(personId);
  const key = keyOf(personId);
  const bundle = { ...made.bundle, clips: made.bundle.clips.map((c) => ({ ...c, sound: link.sounds?.[c.id]?.sound })).filter((c) => c.sound) };
  // A sound that stays on this device (too long for the cloud, or empty)
  // can't be shared: never a code with nothing in it. Sharing several, or a
  // beat or song that plays one, keeps what fits and names what was left out
  // (Ben, 2026-10-26).
  const kept = new Set(bundle.clips.map((c) => c.id));
  const leftClips = made.bundle.clips.filter((c) => !kept.has(c.id));
  const tooLong = (c) => state.userClips.some((u) => u.id === c.id && u.blob?.size > CLOUD_MAX_SOUND);
  if (made.kind === 'sound' && !bundle.clips.length) {
    throw new Error(leftClips.some(tooLong) ? SHARE_TOO_LONG : "That sound has nothing in it to share.");
  }
  let preview = null;
  try {
    // The public preview holds only what the code shares: a sound left out
    // (a kid's long recording) is never in it.
    const leave = new Set(leftClips.map((c) => c.id));
    const ids = Array.isArray(itemId) ? itemId.filter((x) => !leave.has(x)) : itemId;
    const blob = await renderShare(kind, ids, { leave });
    if (blob) preview = (await uploadAudio(api, personId, key, blob, 'audio/wav', sha256)).sound;
  } catch (err) {
    console.error('Recording the share to play failed:', err);   // shared without one: it can still be copied
  }
  const { code } = await api.share(personId, key, { kind: made.kind, title: made.title, bundle, preview });
  logEvent('cloud', { shared: kind });
  return { code, title: made.title, left: leftOutNote(leftClips.map((c) => ({ name: c.label || 'Sound', tooLong: tooLong(c) }))) };
}

// The line under a share code naming the sounds it left out, or ''.
// `left`: [{name, tooLong}].
export function leftOutNote(left) {
  const names = (list) => list.map((l) => l.name).join(', ');
  const long = left.filter((l) => l.tooLong);
  const empty = left.filter((l) => !l.tooLong);
  return [
    long.length ? `Left out, too long for the cloud: ${names(long)}.` : '',
    empty.length ? `Left out, nothing in it: ${names(empty)}.` : '',
  ].filter(Boolean).join(' ');
}

// A share code as people write it: ABCD-2345.
export const showCode = (code) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);
export const plainCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// The codes this device opened (Shared with me), newest first. They stay
// until the kid removes one. `gone`: its sharer unshared it (🚫), so it only
// waits to be removed.
export function sharedHere() {
  try {
    const list = JSON.parse(recall(SHARED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s?.code === 'string' && /^[A-Z2-9]{8}$/.test(s.code)) : [];
  } catch { return []; }
}
function keepShared(list) { remember(SHARED_KEY, JSON.stringify(list.slice(0, MAX_SHARED))); }

// Opens a code: what it is joins Shared with me. Returns the share.
export async function openShare(text) {
  const code = plainCode(text);
  if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('A share code has 8 letters and numbers, like ABCD-2345.');
  const share = await api.shared(code);
  keepShared([{ code, kind: share.kind, title: share.title, at: Date.now() }, ...sharedHere().filter((s) => s.code !== code)]);
  logEvent('cloud', { opened: 'share', kind: share.kind });
  return share;
}

// Removing one from Shared with me only forgets the code on this device.
export function forgetShare(code) {
  keepShared(sharedHere().filter((s) => s.code !== code));
}

const unshared = (err) => err instanceof CloudError && err.status === 404 && err.error === 'share';
function markGone(code) {
  keepShared(sharedHere().map((s) => (s.code === code ? { ...s, gone: true } : s)));
}

// Asks the cloud about each code in Shared with me and marks the ones their
// sharer unshared. Any other trouble (offline, resting) changes nothing.
export async function checkShared() {
  if (!await cloudThere()) return;
  await Promise.all(sharedHere().filter((s) => !s.gone).map((s) => api.shared(s.code).catch((err) => {
    if (unshared(err)) markGone(s.code);
  })));
}

// A share from Shared with me, or a plain sentence if it was unshared.
export async function fetchShare(code) {
  try {
    return await api.shared(code);
  } catch (err) {
    if (!unshared(err) || !sharedHere().some((s) => s.code === code)) throw err;
    markGone(code);
    throw new Error('This was unshared, so it no longer plays. A remix made before stays.');
  }
}

// What `personId` has shared, newest first: [{code, kind, title, created}].
export async function mySharesOf(personId) {
  const key = keyOf(personId);
  if (!inCloud(personId) || !key || !await cloudThere()) return [];
  return (await api.myShares(personId, key)).shares;
}

// 🚫 Unshare (Ben, Q18): the code stops working for everyone. Remixes others
// made stay theirs.
export async function unshareItem(personId, code) {
  const key = keyOf(personId);
  if (!key) throw new CloudError(0, { error: 'offline' });
  await api.unshare(personId, key, code);
  logEvent('cloud', { unshared: true });
}

// 🎛️ Remix onto `personId`'s own board: an editable copy named "<title>
// remix", with fresh ids, the same checks and merge as a backup. The share
// itself never changes, and the remix stays after an unshare. Returns the
// merge, for its summary.
export async function remixShare(code, personId) {
  const share = await fetchShare(code);
  const { doc, soundOf } = shareDoc(share.bundle, personId, kitIds(), newId, { kind: share.kind, title: share.title });
  const audioFor = new Map();
  for (const [clipId, sound] of soundOf) {
    const clip = doc.clips.find((c) => c.id === clipId);
    audioFor.set(clipId, await api.fetchSound(sound, clip?.mime));
  }
  const cleaned = cleanBackup({ ...doc, people: [] }, (c) => audioFor.get(c.id) ?? null, whatIsHere());
  const merged = await storeLoaded(cleaned);
  scheduleSync();
  logEvent('cloud', { remixed: share.kind });
  return merged;
}

// The list of profiles anyone can see.
export async function listProfiles() {
  if (!await cloudThere()) throw new CloudError(0, { error: 'no cloud' });
  return (await api.list()).profiles;
}

// ── start ──

export function initCloud(hooks = {}) {
  if (hooks.storeLoaded) storeLoaded = hooks.storeLoaded;
  if (hooks.whatIsHere) whatIsHere = hooks.whatIsHere;
  if (hooks.renderShare) renderShare = hooks.renderShare;
  // A PIN's key kept by an older Remember (a link's `remember`, before
  // 2026-10-19, with no day it ends) serves this visit only: from the next one
  // the PIN is asked first. One whose 🔑 Remember day has come is forgotten.
  for (const link of [...state.cloud.values()]) {
    if (link.rememberUntil && !remembers(link)) forgetHere(link.id);
    else if (link.pin && link.key) saveLink(link);
  }
  db.onChange = (store) => {
    if (applying || store === 'cloud' || store === 'bases' || store === 'settings') return;
    if (CLOUD_KINDS.includes(store) || store === 'people') scheduleSync();
  };
  syncAll();
  // Every focus and blur syncs (Ben, 2026-10-11), gathered so a quick pair
  // runs once; hiding sends a waiting change at once, as the page may close.
  const doc = globalThis.document;
  doc?.addEventListener?.('visibilitychange', () => timing.transition({ hidden: doc.visibilityState === 'hidden' }));
  globalThis.addEventListener?.('focus', () => timing.transition());
  globalThis.addEventListener?.('blur', () => timing.transition());
  globalThis.addEventListener?.('pagehide', () => timing.transition({ hidden: true }));
}
