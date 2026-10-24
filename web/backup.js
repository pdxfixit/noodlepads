// Backups: everything a browser holds for the soundboard, as one zip that
// another copy of the app (another device, or another address) can load.
//
//   backup.json     {app: 'noodlepads', format: '1.1', exported, version, people, clips, overrides,
//                    orders, patterns, beats, settings, decks, takes, songs, songbook, prefs, layouts, voices, touchLayouts}; each clip names its audio file.
//                    `layouts` (since the DJ's key editor) is each person's saved key layouts; an older 1.x copy skips it.
//                    `touchLayouts` (since 👆 touch layouts, ADR 0029) is each person's saved touch layouts; an older 1.x copy skips it.
//                    `voices` (since ⭐ Save voice) is each person's own voices, knob settings with a name; an older 1.x copy skips it.
//                    `songs` holds each person's open song, `songbook` every saved song.
//   sounds/<id>.<ext>  the audio of each sound made in the app
//
// Format 1.0 is Noodle Pads 1.0's; from 1.0 on, a newer copy of the app must
// still load every 1.x backup. A backup from before it (the testing copies,
// a handful of devices) loads once more through the same old-store
// conversions as older sounds found on this device (cleanBackup's
// `oldStores`). That path goes after launch (TODO.md).
//
// A backup file is untrusted input: readBackup keeps only fields it knows,
// of the right type and size, and drops anything else.

import { zip, unzip } from './zip.js';
import { VOICES, storedFx } from './voices.js';
import { cleanTweaks } from './tweaks.js';
import { cleanPattern } from './sequencer.js';
import { extensionFor } from './util.js';
import { whiteReadsOn } from './contrast.js';
import { cleanTrim, cleanFrom, cleanEdits, cleanFade } from './cuts.js';
import { allowedValue, inBackups, cleanPrefs } from './settings.js';
import { cleanDeck, cleanTake } from './rhythm.js';
import { cleanLayout } from './keyset.js';
import { cleanTouchLayout, MAX_TOUCH_LAYOUTS } from './touch.js';
import { cleanMyVoice } from './voice-knobs.js';
import { cleanSong, SONG_ID } from './song.js';
import { cleanSynth } from './synth.js';
import { adoptPeople, nextPersonColor, freePicture, PERSON_ID } from './model.js';
import { isListedEmoji } from './emoji-check.js';
import { funName, isFunName, MAX_PERSON } from './names.js';
import { dropNameSounds } from './starters.js';
import { count } from './util.js';
import { cleanGroups, groupIdOf } from './groups.js';
import { cleanStamp, STAMP, STAMPED } from './merge3.js';
import { reIdDoc, PERSON_STORES } from './reid.js';
import { scratchId, songScratchId } from './scratch.js';

export const BACKUP_APP = 'noodlepads';
// Backups saved before the 1.0 rename say 'noodle-pads'; they load the same.
const OUR_APPS = new Set([BACKUP_APP, 'noodle-pads']);
// 1.1 added groups of a kid's own sounds (a clip's `group`, an order's
// `groups`): a 1.0 copy skips them, and a 1.0 backup simply has none.
export const BACKUP_FORMAT = '1.1';

// A backup from the app before 1.0: an app id ending in "-soundboard" (not
// written out here: it named a person), or this app id with format 1 as a
// number. It loads with the old-store conversions.
export function beforeOne(doc) {
  const app = doc?.app;
  return (typeof app === 'string' && /^[a-z]+-soundboard$/.test(app) && (doc.format === 1 || doc.format === '1.0'))
    || (OUR_APPS.has(app) && doc.format === 1);
}

// Why a backup.json can't be loaded, or null when it can: Noodle Pads,
// format 1.x, or a backup from before 1.0 (beforeOne).
export function refusal(doc) {
  if (beforeOne(doc)) return null;
  const app = doc?.app;
  if (!OUR_APPS.has(app)) return "it isn't a Noodle Pads backup";
  const major = typeof doc.format === 'string' ? /^(\d{1,4})\.\d{1,4}$/.exec(doc.format)?.[1] : null;
  if (major === '1') return null;
  if (major && Number(major) > 1) return `it was made by a newer version (format ${doc.format})`;
  return "its backup.json doesn't say which format it is";
}

const CLIP_ID = /^user-[a-z0-9-]{1,48}$/;
const BEAT_ID = /^beat-[a-z0-9-]{1,48}$/;
const VOICE_RECORD_ID = /^voice-[a-z0-9-]{1,48}$/;

// How much of a backup is taken. A real one is a few dozen records and some
// short sounds; these are far above that and low enough that a hostile file
// can't fill the browser's storage or memory.
const MAX_JSON_BYTES = 8 * 1024 * 1024;
// One sound: the biggest the app itself makes is a 3-minute song or DJ take
// saved as a sound (a stereo WAV: 35 MB at 48 kHz, 69 MB at 96 kHz).
export const MAX_SOUND_BYTES = 80 * 1024 * 1024;
const MAX_RECORDS = { people: 100, clips: 2000, overrides: 2000, orders: 100, patterns: 100, beats: 1000, settings: 50, decks: 100, takes: 500, songs: 100, songbook: 1000, prefs: 100, layouts: 500, voices: 500, touchLayouts: MAX_TOUCH_LAYOUTS };

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
// A name or label: trimmed, cut to `max`, and undefined when nothing is left.
const title = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max).trim() || undefined : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const voiceId = (v) => (VOICES.some((x) => x.id === v) ? v : undefined);
// A sound's note (🎵 Find its note): a whole MIDI number, 0 to 127.
const rootNote = (v) => (Number.isInteger(v) && v >= 0 && v <= 127 ? v : undefined);
// A chain: kept unless its one voice says it all (that is `voice`).
const fxChain = (v) => storedFx(v);

function dropUndefined(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

// state: {people, clips, overrides, orders, patterns, beats, settings} as arrays
// of the stored records ({key, value} for settings; `settings` may be left
// out); clips carry their audio Blob. Returns a zip Blob.
export async function makeBackup(state, version = 'dev') {
  const files = [];
  const clips = [];
  for (const c of state.clips) {
    const file = `sounds/${c.id}.${extensionFor(c.mime)}`;
    files.push({ name: file, data: new Uint8Array(await c.blob.arrayBuffer()) });
    const { blob, ...meta } = c;
    clips.push({ ...meta, file });
  }
  const doc = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exported: new Date().toISOString(),
    version,
    people: state.people,
    clips,
    overrides: state.overrides,
    orders: state.orders,
    patterns: state.patterns,
    beats: state.beats,
    settings: (state.settings ?? []).filter((r) => inBackups(r?.key)),
    decks: state.decks ?? [],
    takes: state.takes ?? [],
    songs: state.songs ?? [],
    songbook: state.songbook ?? [],
    prefs: state.prefs ?? [],
    layouts: state.layouts ?? [],
    voices: state.voices ?? [],
    touchLayouts: state.touchLayouts ?? [],
  };
  files.unshift({ name: 'backup.json', data: new TextEncoder().encode(JSON.stringify(doc, null, 1)) });
  return zip(files);
}

// One person's part of `lists` (the stores as lists), for 🗂️ See all's
// ⬇️ Save a backup of them (Ben, 2026-10-24): their person record, all they
// made, their pad order and their own settings, in the same format, so
// 📂 Load a backup on any device adds them. The device's settings stay out:
// they belong to the device. Pure.
export function personBackupLists(lists, personId) {
  const mine = (name) => (Array.isArray(lists?.[name]) ? lists[name] : []).filter((r) => r?.personId === personId);
  return {
    people: (lists?.people ?? []).filter((p) => p?.id === personId),
    clips: mine('clips'),
    overrides: (lists?.overrides ?? []).filter((o) => typeof o?.id === 'string' && o.id.startsWith(`${personId}-`)),
    orders: mine('orders'),
    patterns: mine('patterns'),
    beats: mine('beats'),
    settings: [],
    decks: mine('decks'),
    takes: mine('takes'),
    songs: mine('songs'),
    songbook: mine('songbook'),
    prefs: mine('prefs'),
    layouts: mine('layouts'),
    voices: mine('voices'),
    touchLayouts: mine('touchLayouts'),
  };
}

// The one person a loaded backup is about, or null: a backup with exactly
// one person in it (⬇️ Export a backup makes these) and nothing of anyone
// else's. Loading one asks whether to restore them or load their things into
// someone here (Ben, 2026-10-24). `data` is cleaned (cleanBackup). Pure.
export function onePersonIn(data) {
  const who = Array.isArray(data?.people) && data.people.length === 1 ? data.people[0] : null;
  if (!who?.id) return null;
  for (const name of PERSON_STORES) {
    if (name === 'people' || name === 'overrides') continue;
    if ((data[name] ?? []).some((r) => r?.personId !== undefined && r.personId !== who.id)) return null;
  }
  return (data.overrides ?? []).every((o) => typeof o?.id === 'string' && o.id.startsWith(`${who.id}-`)) ? who : null;
}

// Does backup-shaped `data` hold anything of `personId`'s: them, a record
// of theirs, or an edit of their copy of the kit? Pure.
export function namesPerson(data, personId) {
  return PERSON_STORES.some((name) => (data?.[name] ?? []).some((r) => (name === 'people' ? r?.id === personId
    : name === 'overrides' ? typeof r?.id === 'string' && r.id.startsWith(`${personId}-`)
      : r?.personId === personId)));
}

// `data` without anything of the people in `ids`: what a backup leaves out
// for someone whose PIN wasn't typed (Ben, 2026-10-24). Pure.
export function withoutPeople(data, ids) {
  const gone = new Set(ids);
  const out = { ...data };
  for (const name of PERSON_STORES) {
    if (!Array.isArray(data?.[name])) continue;
    out[name] = data[name].filter((r) => (name === 'people' ? !gone.has(r?.id)
      : name === 'overrides' ? ![...gone].some((id) => typeof r?.id === 'string' && r.id.startsWith(`${id}-`))
        : !gone.has(r?.personId)));
  }
  return out;
}

// A one-person backup's things as `to`'s, for "load it all into someone
// here": every record that names `from` names `to` (reid.js, their copy of
// the kit's edits too), their scratch beat and song become `to`'s (merge.js
// keeps `to`'s own and adds this one beside it when they differ), and the
// person, their settings and the device's settings stay out: `to` keeps
// their own name, look and settings. Pure.
export function intoPerson(data, from, to) {
  const moved = reIdDoc(data, from, to);
  const scratch = (r) => {
    if (r?.id === scratchId(from)) return { ...r, id: scratchId(to) };
    if (r?.id === songScratchId(from)) return { ...r, id: songScratchId(to) };
    return r;
  };
  const out = { ...moved, people: [], prefs: [], settings: [] };
  for (const name of ['beats', 'patterns', 'songs', 'songbook']) if (Array.isArray(moved[name])) out[name] = moved[name].map(scratch);
  return out;
}

// file: the chosen zip. bundled: {peopleIds: Set, clipIds: Set} from boards.json,
// plus addedPeopleIds (people already added on this device) and colorOk(name)
// (is this a palette color?) when known. Returns cleaned records, ready to
// store, plus `skipped`, how many records were dropped for being malformed.
export async function readBackup(file, bundled) {
  const entries = await unzip(file);
  const raw = entries.get('backup.json');
  if (!raw) throw new Error("it isn't a Noodle Pads backup (no backup.json)");
  if (raw.length > MAX_JSON_BYTES) throw new Error('its backup.json is far bigger than a backup should be');
  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new Error('its backup.json is damaged'); }
  const why = refusal(doc);
  if (why) throw new Error(why);
  // Each sound's audio is a file in the zip, named by the clip.
  const audioOf = (c) => {
    const data = typeof c?.file === 'string' ? entries.get(c.file) : undefined;
    return data && data.length <= MAX_SOUND_BYTES ? new Blob([data]) : null;
  };
  return cleanBackup(doc, audioOf, bundled, { oldStores: beforeOne(doc) });
}

// A sound's type. Audio types are kept. A file chosen in the old app could be
// stored with no type, or a video type (a phone's recorder app can save
// .3gp or .mp4); the bytes are still sound, so they come in as audio. Any
// other type (text, a picture) is not a sound: null.
export function audioMime(mime, blobType) {
  const kind = (m) => {
    const t = typeof m === 'string' ? m.trim().toLowerCase().slice(0, 64) : '';
    if (t.startsWith('audio/')) return t;
    if (t.startsWith('video/')) return `audio/${t.slice(6)}`;
    return !t || t === 'application/octet-stream' ? '' : null;   // '' says nothing; null is not sound
  };
  const said = kind(mime);
  if (said !== '') return said;
  return kind(blobType) || 'audio/x-unknown';
}

// The checks every incoming copy of someone's data goes through, from a
// backup zip or from older sounds found on this device (leftover.js): `doc` holds the stores as
// lists, the way backup.json does, and `audioOf(clip)` gives that clip's
// audio as a Blob, or null when it has none or it is too big. Anything it
// does not know, or of the wrong type or size, is dropped and counted.
// `oldStores` is for older sounds found and backups from before 1.0: data from before 1.0, where people an
// older boards.json named become added people, and an open song may have no id.
export function cleanBackup(doc, audioOf, bundled, { oldStores = false } = {}) {
  let skipped = 0;
  // Why each dropped record was dropped, for the notice (leftOutNote): a
  // reason name -> how many. A record dropped with no reason given counts
  // under its store's name.
  const left = {};
  const leave = (why, n = 1) => { if (n > 0) left[why] = (left[why] ?? 0) + n; };
  // Data from before 1.0: the old starter sounds are presets now, under the
  // same ids, so a kid's edits of them come as preset edits; the spoken name
  // clips are left out, and counted (starters.js).
  if (oldStores) {
    const dropped = dropNameSounds(doc, { kitIds: [...(bundled.kitIds ?? [])] });
    doc = dropped.doc;
    for (const [why, n] of Object.entries(dropped.left)) leave(why, n);
  }
  // Cleans each record of one list with `fix` (which returns the record, or
  // null to drop it, or a reason string to drop it for that reason), cut to
  // the list's cap. Whatever is dropped counts.
  const clean = (name, fix, list = doc[name]) => {
    const all = Array.isArray(list) ? list : [];
    if (all.length > MAX_RECORDS[name]) leave(`${name}:cap`, all.length - MAX_RECORDS[name]);
    const out = [];
    for (const r of all.slice(0, MAX_RECORDS[name])) {
      const got = fix(r);
      // When it was last edited (merge3.js) stays with it.
      if (got && typeof got === 'object' && STAMPED.has(name) && cleanStamp(r?.[STAMP]) !== undefined) got[STAMP] = r[STAMP];
      if (got && typeof got === 'object') out.push(got);
      else leave(typeof got === 'string' ? got : name);
    }
    skipped += all.length - out.length;
    return out;
  };

  // Old stores only: people an older boards.json named, and their names with
  // it, become people added in the app (model.js adoptPeople); a record of one
  // that is already here, or that adoptPeople drops, is left out without
  // counting. In a backup, a person who is neither added nor in boards.json
  // is dropped and counted.
  const capped = Object.fromEntries(Object.entries(MAX_RECORDS)
    .map(([name, max]) => [name, Array.isArray(doc[name]) ? doc[name].slice(0, max) : []]));
  const isAdded = (p) => p?.added === true;
  const fromFile = (p) => bundled.peopleIds.has(p?.id);
  const adopted = oldStores ? adoptPeople(capped, {
    known: new Set([...bundled.peopleIds, ...(bundled.addedPeopleIds ?? [])]),
    kitIds: [...(bundled.kitIds ?? [])],
    takenNames: [...(bundled.takenNames ?? []), ...capped.people.filter(isAdded).map((p) => p.name)],
    takenColors: [...(bundled.takenColors ?? []), ...capped.people.filter(isAdded).map((p) => p.color)],
    takenPictures: [...(bundled.takenPictures ?? []), ...capped.people.filter(isAdded).map((p) => p.avatar)],
  }).add : [];
  const listed = Array.isArray(doc.people) ? doc.people : [];
  // Names and pictures in use, for a person who comes with none (below).
  const usedNames = [...(bundled.takenNames ?? []), ...listed.map((p) => p?.name), ...adopted.map((p) => p.name)].filter((n) => typeof n === 'string');
  const usedPictures = [...(bundled.takenPictures ?? []), ...listed.map((p) => p?.avatar), ...adopted.map((p) => p.avatar)];
  const toClean = oldStores
    ? listed.filter((p) => isAdded(p) || fromFile(p) || typeof p?.id !== 'string' || !PERSON_ID.test(p.id))
    : listed;
  const people = clean('people', (p) => {
    const id = text(p?.id, 64);
    const added = p?.added === true;
    if (!id || (added ? !PERSON_ID.test(id) || bundled.peopleIds.has(id) : !bundled.peopleIds.has(id))) return null;
    // A person added in the app with no name left (blank) still owns their
    // sounds, so they come in with a fun name and a picture, like anyone new.
    const blank = added && !title(p.name, MAX_PERSON);
    const name = blank ? funName(usedNames) : title(p.name, MAX_PERSON);
    if (blank) usedNames.push(name);
    const avatar = added && isListedEmoji(p.avatar) ? p.avatar : blank ? freePicture(usedPictures) : undefined;
    if (blank) usedPictures.push(avatar);
    return dropUndefined({
      id,
      name,
      // White text sits on a person's color, so a color it can't be read on is left out.
      // An added person needs a color to be drawn: one with none gets the next free one.
      color: whiteReadsOn(p.color) ? p.color : added ? nextPersonColor([...(bundled.takenColors ?? []), ...listed.map((q) => q?.color)].filter((c) => typeof c === 'string')) : undefined,
      hidden: p.hidden === true ? true : undefined,
      added: added || undefined,
      created: added ? num(p.created) ?? Date.now() : undefined,
      edited: added ? num(p.edited) : undefined,   // when the name, color or avatar last changed (merge.js)
      avatar,                                                                // one emoji from the picture chooser's full list
      fun: blank || (added && p.fun === true && isFunName(name)) ? true : undefined,   // the name came from the generator
      offline: added && p.offline === true ? true : undefined,               // kept out of the cloud (cloud.js)
      solo: added && p.solo === true ? true : undefined,                     // the device's own first person (model.js isDefaultPerson)
    });
  }, toClean);
  people.push(...adopted.slice(0, Math.max(0, MAX_RECORDS.people - people.length)));
  const personIds = new Set([...bundled.peopleIds, ...people.filter((p) => p.added).map((p) => p.id)]);
  // Clips may belong to people added on this device before; the caller says which.
  const knownPerson = (id) => personIds.has(id) || (bundled.addedPeopleIds?.has(id) ?? false);
  // Pad colors are palette names. Without a palette to check against, keep the name.
  const colorName = (v) => {
    const c = text(v, 24);
    return c && (bundled.colorOk ? bundled.colorOk(c) : true) ? c : undefined;
  };

  const clips = clean('clips', (c) => {
    if (!CLIP_ID.test(c?.id)) return 'clips';
    if (!knownPerson(c.personId)) return 'clips:person';
    const audio = audioOf(c);
    if (!(audio instanceof Blob)) return 'clips:noAudio';
    if (audio.size > MAX_SOUND_BYTES) return 'clips:tooBig';
    const mime = audioMime(c.mime, audio.type);
    if (!mime) return 'clips:notAudio';
    return dropUndefined({
      id: c.id,
      personId: c.personId,
      label: title(c.label, 24) || 'Sound',
      emoji: text(c.emoji, 8),
      color: colorName(c.color),
      voice: voiceId(c.voice) ?? 'normal',
      amount: num(c.amount),
      fx: fxChain(c.fx),
      tweaks: cleanTweaks(c.tweaks) ?? undefined,   // the sound sheet's Tweaks
      trim: cleanTrim(c.trim) ?? undefined,
      edits: cleanEdits(c.edits) ?? undefined,   // the wave editor
      fade: cleanFade(c.fade) ?? undefined,
      from: cleanFrom(c.from) ?? undefined,
      synth: cleanSynth(c.synth) ?? undefined,   // how a ✨ sound was made
      root: rootNote(c.root),
      group: groupIdOf(c.group),   // its group in My sounds (groups.js)
      blob: new Blob([audio], { type: mime }),
      mime,
      created: num(c.created) ?? Date.now(),
      exact: c.exact === true ? true : undefined,
    });
  });

  // An edit may be to a boards.json sound on this device, or to a person's
  // copy of the kit (`<person>-<kit id>`), including a person this backup adds.
  const isKitCopy = (id) => typeof id === 'string' && [...(bundled.kitIds ?? [])]
    .some((k) => id.endsWith(`-${k}`) && knownPerson(id.slice(0, -k.length - 1)));
  const overrides = clean('overrides', (o) => (bundled.clipIds.has(o?.id) || isKitCopy(o?.id) ? dropUndefined({
    id: o.id,
    label: title(o.label, 24),
    emoji: text(o.emoji, 8),
    color: colorName(o.color),
    voice: voiceId(o.voice),
    amount: num(o.amount),
    fx: fxChain(o.fx),
    tweaks: cleanTweaks(o.tweaks) ?? undefined,
    trim: cleanTrim(o.trim) ?? undefined,
    edits: cleanEdits(o.edits) ?? undefined,
    fade: cleanFade(o.fade) ?? undefined,
    root: rootNote(o.root),
    hidden: o.hidden === true ? true : undefined,
  }) : 'overrides:gone'));

  // A pad order, and the person's groups of their own sounds (groups.js).
  const orders = clean('orders', (o) => (knownPerson(o?.personId) && Array.isArray(o.ids)
    ? dropUndefined({
      personId: o.personId,
      ids: o.ids.filter((x) => typeof x === 'string').slice(0, 500).map((x) => x.slice(0, 64)),
      groups: cleanGroups(o.groups) ?? undefined,
    })
    : null));

  const patterns = clean('patterns', (p) => (knownPerson(p?.personId) ? cleanPattern(p, p.personId) : null));

  const beats = clean('beats', (b) => (BEAT_ID.test(b?.id) && knownPerson(b.personId)
    ? {
      ...cleanPattern(b, b.personId),
      id: b.id,
      name: title(b.name, 24) || 'Beat',
      created: num(b.created) ?? Date.now(),
      saved: num(b.saved) ?? Date.now(),
      // 📌 pinned to the pattern chips: when, only while pinned (ADR 0021).
      ...(num(b.pinned) > 0 ? { pinned: num(b.pinned) } : {}),
    }
    : null));

  // Only settings this copy of the app declares, with a value it allows. A
  // setting from a newer copy, or a value it doesn't know, is dropped and
  // counted. The problem-report switch comes too (Ben, Q5).
  const settings = clean('settings', (r) => {
    const value = inBackups(r?.key) ? allowedValue(r.key, r.value) : undefined;
    return value === undefined ? 'settings' : { key: r.key, value };
  });

  const decks = clean('decks', (d) => (knownPerson(d?.personId) ? cleanDeck(d) : null));
  const takes = clean('takes', (t) => (knownPerson(t?.personId) ? cleanTake(t) : null));
  const layouts = clean('layouts', (l) => (knownPerson(l?.personId) ? cleanLayout(l) : null));
  const touchLayouts = clean('touchLayouts', (l) => (knownPerson(l?.personId) ? cleanTouchLayout(l) : null));
  // A kid's own voice: a safe id, a name or emoji, and knobs that change something.
  const voices = clean('voices', (v) => (VOICE_RECORD_ID.test(v?.id) && knownPerson(v.personId) ? cleanMyVoice(v) : null));
  // A block naming a beat that isn't here stays; it shows as deleted. Old
  // stores may hold an open song without an id (from before songs were a
  // list); the app links it on open. A backup's open song has its id. A song
  // from before the playlist (slots only, backups 1.0 and 1.1 made before
  // ADR 0024) becomes lanes here, timed by the backup's own beats.
  const beatOf = (id) => beats.find((b) => b.id === id) ?? null;
  const songs = clean('songs', (s) => {
    const song = knownPerson(s?.personId) ? cleanSong(s, undefined, beatOf) : null;
    return song && (song.id || oldStores) ? song : null;
  });
  const songbook = clean('songbook', (s) => (SONG_ID.test(s?.id) && knownPerson(s.personId)
    ? { ...cleanSong(s, undefined, beatOf), created: num(s.created) ?? Date.now(), saved: num(s.saved) ?? Date.now() }
    : null));

  // What the kid should know about what came: sounds on a board that was
  // deleted (they wait under Bring back), and boards the old app named, which
  // arrive with fun names (model.js adoptPeople).
  const hiddenPeople = new Set(people.filter((p) => p.hidden).map((p) => p.id));
  const notes = {
    hiddenSounds: clips.filter((c) => hiddenPeople.has(c.personId)).length,
    players: adopted.filter((p) => p.fun && !p.hidden).map((p) => p.name),
  };
  // A person's own settings: only those this copy knows, with values it allows.
  const prefs = clean('prefs', (p) => (knownPerson(p?.personId) ? cleanPrefs(p) : null));

  return {
    people, clips, overrides, orders, patterns, beats, settings, decks, takes, songs, songbook, prefs, layouts, voices, touchLayouts, skipped, left, notes,
    exported: text(doc.exported, 40),
    version: text(doc.version, 40),
  };
}

// What a kid is told about what didn't come, from cleanBackup's `left` and
// `notes`, in plain words: " Left out: 2 sounds whose file isn't a sound
// file, 1 damaged beat." Empty when everything came. Device-only settings
// (the problem-report switch) stay behind by design and are not mentioned.
const LEFT_WORDS = {
  'clips:notAudio': (n) => `${count(n, 'sound')} whose file isn't a sound file`,
  'clips:noAudio': (n) => `${count(n, 'sound')} with no audio saved`,
  'clips:tooBig': (n) => `${count(n, 'sound')} too big to load (over ${MAX_SOUND_BYTES / 1048576} MB)`,
  'clips:person': (n) => `${count(n, 'sound')} of a board that isn't there`,
  nameSound: (n) => `${count(n, 'change')} to the old name sounds (they said a name, so they're gone)`,
  'overrides:gone': (n) => `${count(n, 'change')} to sounds the app doesn't have any more`,
  settings: (n) => `${count(n, 'setting')} this version doesn't have`,
};
const STORE_WORDS = {
  people: 'person', clips: 'sound', overrides: 'sound change', orders: 'pad order', patterns: 'open beat',
  beats: 'beat', settings: 'setting', decks: 'key set', takes: 'take', songs: 'open song', songbook: 'song', layouts: 'key layout', voices: 'own voice', touchLayouts: 'touch layout',
};

export function leftOutNote({ skipped = 0, left = {}, notes = {} } = {}) {
  const parts = [];
  let said = 0;
  for (const [why, n] of Object.entries(left)) {
    said += n;
    const store = why.split(':')[0];
    if (LEFT_WORDS[why]) parts.push(LEFT_WORDS[why](n));
    else if (why.endsWith(':cap')) parts.push(`${count(n, STORE_WORDS[store] ?? 'item')} past the most a backup may hold`);
    else parts.push(count(n, `damaged ${STORE_WORDS[store] ?? 'item'}`));
  }
  // Anything dropped that no reason covers still gets a line.
  if (skipped > said) parts.push(count(skipped - said, 'other item'));
  let out = parts.length ? ` Left out: ${parts.join(', ')}.` : '';
  if (notes.hiddenSounds) out += ` ${count(notes.hiddenSounds, 'sound')} ${notes.hiddenSounds === 1 ? 'is' : 'are'} on a deleted board: 👥 People → Bring back.`;
  if (notes.players?.length) out += ` ${notes.players.join(', ')}: ${notes.players.length === 1 ? 'a board' : 'boards'} from the old app, with ${notes.players.length === 1 ? 'a made-up name' : 'made-up names'}. 🎲 in 👥 People picks another.`;
  return out;
}
