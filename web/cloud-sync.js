// Cloud sync's rules (docs/design/cloud-profiles.md § 6), and the sync of
// one profile run against injected storage and an API, so the same code runs
// in the app (cloud.js) and in the tests (two fake devices, one fake D1).
//
// A sync is a pull, then a push. Pulled records go through cleanBackup like
// a backup. Each is then merged three ways (merge3.js) against the copy this
// device kept at its last sync (the base): unchanged here takes the cloud's,
// unchanged there keeps this device's, changed on both merges field by field,
// and where that isn't safe both are kept (the backup merge, merge.js), so
// nothing is lost. Then every record that differs from what the cloud has is
// pushed, its audio first, and only over a cloud copy this device has seen.

import { sharedRemixName } from './names.js';
import { groupName } from './groups.js';
import { STAMP, resolve } from './merge3.js';
import { songBeatIds, mapSongBeats } from './playlist.js';

// The stores that belong to one person (`voices` is ⭐ My voices, IndexedDB
// `voices`). orders, patterns, decks, songs and
// prefs (the person's settings) hold one record per person, keyed by personId.
export const CLOUD_KINDS = ['clips', 'overrides', 'orders', 'patterns', 'beats', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices'];
export const ONE_EACH = new Set(['orders', 'patterns', 'decks', 'songs', 'prefs']);
// What counts as a person having made something: a person with none of these
// (a new device's empty "Me") never goes to the cloud by itself.
const MADE = new Set(['clips', 'overrides', 'beats', 'takes', 'songbook', 'layouts', 'voices']);
export const CHUNK_BYTES = 1_900_000;
// The biggest sound the cloud keeps (worker/cloud.js MAX_SOUND_BYTES). The
// app makes longer ones (a 3-minute song as a sound); those stay on the
// device, and the sync carries on with everything else.
export const CLOUD_MAX_SOUND = 25 * 1024 * 1024;
export const PER_PUSH = 200;

const list = (doc, name) => (Array.isArray(doc?.[name]) ? doc[name] : []);
export const keyOf = (kind, id) => `${kind}:${id}`;

// Every record of `personId`, as Map "kind:id" -> {kind, id, record}.
// `lists` holds the stores as lists, the way a backup does.
export function recordsOf(lists, personId, kitIds = []) {
  const out = new Map();
  const add = (kind, id, record) => out.set(keyOf(kind, id), { kind, id, record });
  for (const kind of ['clips', 'beats', 'takes', 'songbook', 'layouts', 'voices']) {
    for (const r of list(lists, kind)) if (r?.personId === personId && typeof r.id === 'string') add(kind, r.id, r);
  }
  for (const kind of ONE_EACH) {
    for (const r of list(lists, kind)) if (r?.personId === personId) add(kind, personId, r);
  }
  const kit = new Set(kitIds);
  for (const o of list(lists, 'overrides')) {
    if (typeof o?.id === 'string' && o.id.startsWith(`${personId}-`) && kit.has(o.id.slice(personId.length + 1))) add('overrides', o.id, o);
  }
  return out;
}

// Whether `personId` has made anything yet (MADE).
export function hasMade(lists, personId, kitIds = []) {
  for (const { kind } of recordsOf(lists, personId, kitIds).values()) if (MADE.has(kind)) return true;
  return false;
}

// Fields that are not the record's content: the audio and where it is kept,
// and when it was last edited (merge3.js STAMP).
const NOT_CONTENT = new Set(['blob', 'sound', 'sha256', 'bytes', STAMP]);

// A record as text with its keys in order, so two records compare by content.
export function canonical(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(typeof Blob !== 'undefined' && v instanceof Blob)) {
      return Object.fromEntries(Object.keys(v).filter((k) => !NOT_CONTENT.has(k) && v[k] !== undefined).sort().map((k) => [k, walk(v[k])]));
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

// cyrb53: a fast 53-bit hash of a string, for "has this changed".
function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// A clip's audio is part of its content: two clips with the same settings and
// different audio differ. `sha` is the audio's SHA-256, when known.
export const hashOf = (record, sha = '') => cyrb53(canonical(record) + (sha ? `#${sha}` : ''));

// What to push: records whose hash differs from what the cloud has (`sent`),
// and deletes for those the cloud has that are gone here. `shaOf(key)` gives
// a clip's audio hash.
export function planPush(local, sent, shaOf = () => '') {
  const put = [];
  for (const [k, r] of local) if (sent[k] !== hashOf(r.record, shaOf(k))) put.push(r);
  const del = Object.keys(sent).filter((k) => !local.has(k)).map((k) => {
    const at = k.indexOf(':');
    return { kind: k.slice(0, at), id: k.slice(at + 1) };
  });
  return { put, del };
}

// What a sync does with one pulled record (merge3.js resolve). `local` and
// `remote` are this device's and the cloud's (cleaned), or null when that
// side has none; `base` the last-synced copy this device kept, or null.
// `sent` is the hash of the record as the cloud had it at the last sync, and
// `hash(record)` hashes one side. A base whose hash is not `sent` (saved by a
// sync cut off halfway) is not trusted. With no base but a `sent` hash (a
// link from before bases were kept), the hash still tells which side is
// unchanged. A record new on this device only through the cloud (`fresh`)
// goes through the backup merge, which also spots one the device already has
// under another id. Returns {action, record?, clashes?}.
export function decideRecord(kind, { base = null, local = null, remote = null, sent, hash }) {
  const trusted = base && sent !== undefined && hash(base) === sent ? base : null;
  if (!trusted && sent !== undefined) {
    const localSame = local && hash(local) === sent;
    const remoteSame = remote && hash(remote) === sent;
    if (!local && !remote) return { action: 'same' };
    if (localSame) return remote ? resolve(kind, local, local, remote) : { action: 'delete' };
    if (remoteSame) return { action: 'keep' };
    return resolve(kind, null, local, remote);
  }
  if (!trusted && !local && remote) return { action: 'fresh' };
  return resolve(kind, trusted, local, remote);
}

// Pulled records as a backup-shaped document for cleanBackup: each record in
// its store, made this person's, and the person themselves.
export function pulledDoc(personId, person, records) {
  const doc = Object.fromEntries(CLOUD_KINDS.map((k) => [k, []]));
  doc.people = person ? [person] : [];
  for (const { kind, body } of records) {
    // A kind this copy of the app does not know (a newer copy's) waits in the cloud.
    if (!body || typeof body !== 'object' || !Array.isArray(doc[kind])) continue;
    const record = { ...body };
    if (kind === 'overrides') { if (!String(record.id).startsWith(`${personId}-`)) continue; } else record.personId = personId;
    doc[kind].push(record);
  }
  return doc;
}

// A profile's look as a person added in the app.
export const personFrom = (look) => ({
  id: look.id, name: look.name, color: look.color, avatar: look.avatar || undefined,
  added: true, fun: true, created: look.created ?? 1, edited: look.edited,
});

// The pieces of a sound of `bytes` bytes: [start, end) each.
export function pieces(bytes, size = CHUNK_BYTES) {
  const out = [];
  for (let at = 0; at < bytes; at += size) out.push([at, Math.min(bytes, at + size)]);
  return out.length ? out : [[0, 0]];
}

// ── shares ──

// What a share holds: the sound, beat or song `id` of `personId` (for
// sounds, `id` may be a list: several in one code), with
// the recorded sounds it uses (each naming its cloud sound) and, for a song,
// its beats. Kit sounds go by kit id (`kit:<id>`), to land on the
// receiver's own kit. Recorded sounds of anyone else are left out.
export function shareBundle(kind, id, lists, personId, kitIds = []) {
  const clips = new Map(list(lists, 'clips').filter((c) => c.personId === personId).map((c) => [c.id, c]));
  const beatsById = new Map(list(lists, 'beats').filter((b) => b.personId === personId).map((b) => [b.id, b]));
  const kit = new Set(kitIds);
  const out = { clips: [], beats: [], songs: [] };
  const usedClips = new Set();
  const clipRef = (clipId) => {
    if (clips.has(clipId)) { usedClips.add(clipId); return clipId; }
    const k = typeof clipId === 'string' && clipId.startsWith(`${personId}-`) ? clipId.slice(personId.length + 1) : null;
    return k && kit.has(k) ? `kit:${k}` : null;
  };
  const addBeat = (b) => {
    if (!b || out.beats.some((x) => x.id === b.id)) return;
    const rows = (b.rows ?? []).map((r) => ({ ...r, clipId: clipRef(r.clipId) })).filter((r) => r.clipId);
    const { personId: _who, pinned: _pin, ...beat } = b;   // a 📌 is the sharer's own, not the beat's
    out.beats.push({ ...beat, rows });
  };
  let title = '';
  if (kind === 'sound' && Array.isArray(id)) {
    // Several sounds in one code (✏️ Edit sounds → 🔗 Share): named after
    // their group when they share one, else "3 sounds".
    const ids = [...new Set(id)].filter((x) => clips.has(x));
    if (!ids.length) return null;
    for (const x of ids) usedClips.add(x);
    if (ids.length === 1) title = clips.get(ids[0]).label;
    else {
      const groupsOf = new Set(ids.map((x) => clips.get(x).group));
      const groups = list(lists, 'orders').find((o) => o.personId === personId)?.groups ?? [];
      const name = groupsOf.size === 1 ? groupName(groups.find((g) => g?.id === [...groupsOf][0])?.name) : '';
      title = name || `${ids.length} sounds`;
    }
  } else if (kind === 'sound') {
    if (!clips.has(id)) return null;
    usedClips.add(id);
    title = clips.get(id).label;
  } else if (kind === 'beat') {
    if (!beatsById.has(id)) return null;
    addBeat(beatsById.get(id));
    title = beatsById.get(id).name;
  } else if (kind === 'song') {
    const song = list(lists, 'songbook').find((s) => s.id === id && s.personId === personId);
    if (!song) return null;
    for (const beatId of songBeatIds(song)) addBeat(beatsById.get(beatId));
    const { personId: _who, ...rest } = song;
    out.songs.push(mapSongBeats(rest, (beatId) => (out.beats.some((b) => b.id === beatId) ? beatId : null)));
    title = song.name;
  } else {
    return null;
  }
  // A share is public: whose it was stays out of it (the receiver's own id
  // goes in when it is copied, shareDoc).
  out.clips = [...usedClips].map((cid) => {
    const { blob, personId: _who, group: _group, ...rest } = clips.get(cid);   // a group is the sharer's own too
    return rest;
  });
  return { kind, title: String(title || 'Shared').slice(0, 24), bundle: out };
}

// A share remixed onto someone's own board: its records made theirs (`toId`),
// with fresh ids so nothing on the device is touched, as a backup-shaped
// document; with `title`, the shared thing is renamed "<title> remix". The
// original stays as it is, and the remix outlives an unshare. Returns
// {doc, soundOf: Map(new clip id -> cloud sound id)}.
export function shareDoc(bundle, toId, kitIds, newId, { kind, title } = {}) {
  const kit = new Set(kitIds);
  const clipIds = new Map();
  const soundOf = new Map();
  const doc = { clips: [], beats: [], songbook: [] };
  for (const c of list(bundle, 'clips')) {
    if (typeof c?.id !== 'string' || typeof c.sound !== 'string') continue;
    const id = newId('user');
    clipIds.set(c.id, id);
    soundOf.set(id, c.sound);
    doc.clips.push({ ...c, id, personId: toId, created: Date.now() });
  }
  const clipFor = (ref) => {
    if (clipIds.has(ref)) return clipIds.get(ref);
    if (typeof ref === 'string' && ref.startsWith('kit:') && kit.has(ref.slice(4))) return `${toId}-${ref.slice(4)}`;
    return null;
  };
  const beatIds = new Map();
  for (const b of list(bundle, 'beats')) {
    if (typeof b?.id !== 'string') continue;
    const id = newId('beat');
    beatIds.set(b.id, id);
    const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => ({ ...r, clipId: clipFor(r.clipId) })).filter((r) => r.clipId);
    const { pinned: _pin, ...beat } = b;   // a remix starts unpinned
    doc.beats.push({ ...beat, id, personId: toId, rows, created: Date.now(), saved: Date.now() });
  }
  for (const s of list(bundle, 'songs')) {
    if (!s || typeof s !== 'object') continue;
    const song = mapSongBeats(s, (beatId) => beatIds.get(beatId) ?? null);
    doc.songbook.push({ ...song, slots: song.slots ?? [], id: newId('song'), personId: toId, created: Date.now(), saved: Date.now() });
  }
  // A remix (Ben, Q18): the shared thing itself is named "<title> remix".
  // A share of several sounds keeps their names.
  if (title !== undefined && !(kind === 'sound' && doc.clips.length > 1)) {
    const main = kind === 'sound' ? doc.clips[0] : kind === 'beat' ? doc.beats[0] : kind === 'song' ? doc.songbook[0] : null;
    if (main && kind === 'sound') main.label = sharedRemixName(title);
    else if (main) main.name = sharedRemixName(title);
  }
  return { doc, soundOf };
}

// ── one profile's sync ──

// deps: {
//   api                      cloud-api.js
//   lists()                  the device's stores as lists
//   kitIds                   the kit's ids
//   sha256(blob)             hex
//   clean(doc, audioOf)      backup.js cleanBackup against this device
//   merge(cleaned)           store it the way a backup is loaded (merge.js)
//   put(store, record), remove(store, key)   one record each
//   saveLink(link)           keep the link (IndexedDB `cloud`)
//   bases                    optional: {load(personId) -> Map "kind:id" -> record,
//                            save(personId, Map "kind:id" -> record | null)}, the
//                            last-synced copy of each record (IndexedDB `bases`)
// }
// `link`: {id, key, rev, sent, sounds}. Returns what happened, for a notice
// and the log: {pulled, pushed, deleted, sounds, merged, clashes, kept}.
export const SYNC_ROUNDS = 3;
const noAudio = (record) => {
  if (!record || typeof record !== 'object') return record;
  const { blob: _audio, ...rest } = record;
  return rest;
};

export async function syncProfile(link, deps) {
  const id = link.id;
  link.sent ??= {};
  link.sounds ??= {};
  const shaOf = (k) => (k.startsWith('clips:') ? link.sounds[k.slice(6)]?.sha256 ?? '' : '');
  const report = { pulled: 0, pushed: 0, deleted: 0, sounds: 0, merged: 0, clashes: 0, kept: 0 };
  const bases = deps.bases ? await deps.bases.load(id) : new Map();
  const baseChanges = new Map();
  const bases_ = {
    set(k, record) { const b = noAudio(record); bases.set(k, b); baseChanges.set(k, b); },
    drop(k) { if (bases.has(k) || baseChanges.has(k)) { bases.delete(k); baseChanges.set(k, null); } },
    async save() {
      if (deps.bases && baseChanges.size) await deps.bases.save(id, new Map(baseChanges));
      baseChanges.clear();
    },
  };
  let profile = null;
  // Pull, merge and push; again while the cloud says another device wrote a
  // record this push carried after this device's pull (`stale`), so that
  // record is merged too, never overwritten.
  for (let round = 1; ; round++) {
    profile = await pullOnce(link, deps, shaOf, report, bases, bases_) ?? profile;
    let stale;
    try {
      stale = await pushAll(link, deps, shaOf, report, bases_);
    } catch (err) {
      // The cloud no longer has a sound this device thought it had: send it
      // again, once.
      if (err?.status !== 409 || err.error !== 'sound') throw err;
      for (const [clipId, s] of Object.entries(link.sounds)) if (s.sound === err.sound) delete link.sounds[clipId];
      stale = await pushAll(link, deps, shaOf, report, bases_);
    }
    if (!stale || round >= SYNC_ROUNDS) break;
  }
  await pushLook(link, deps, profile);
  return report;
}

async function pullOnce(link, deps, shaOf, report, bases, bases_) {
  const { api } = deps;
  const id = link.id;
  const pulled = [];
  let since = link.rev ?? 0;
  let profile = null;
  for (;;) {
    const page = await api.pull(id, link.key, since);
    pulled.push(...page.records);
    profile = page.profile ?? profile;
    since = page.rev;
    if (!page.more) break;
  }
  const local = recordsOf(deps.lists(), id, deps.kitIds);
  // The last word on each record wins, in pull order.
  const latest = new Map();
  for (const p of pulled) latest.set(keyOf(p.kind, p.id), p);
  const remoteSha = (p) => p.body?.sha256 ?? '';

  // Records that need nothing fetched: deleted here and unchanged there, or
  // the same on both sides. Everything else is cleaned like a backup, each
  // sound's audio from this device when it has it, else from the cloud.
  const audio = new Map();
  const toClean = [];
  for (const [k, p] of latest) {
    if (p.deleted) continue;
    const here = local.get(k)?.record;
    const hashed = hashOf(p.body, remoteSha(p));
    if (!here && link.sent[k] === hashed) { latest.set(k, { ...p, skip: true }); continue; }
    if (here && hashOf(here, shaOf(k)) === hashed) { latest.set(k, { ...p, same: true }); continue; }
    if (p.kind === 'clips' && typeof p.body?.sound === 'string') {
      if (here?.blob && (link.sounds[p.id]?.sha256 ?? p.body.sha256) === p.body.sha256) audio.set(p.id, here.blob);
      else audio.set(p.id, await api.fetchSound(p.body.sound, p.body.mime));
    }
    toClean.push(p);
  }
  const audioOf = (c) => audio.get(c.id) ?? null;
  const person = profile ? personFrom({ ...profile, id }) : null;
  const cleaned = deps.clean(pulledDoc(id, person, toClean), audioOf);
  const remote = new Map();
  for (const kind of CLOUD_KINDS) {
    for (const r of cleaned[kind] ?? []) remote.set(keyOf(kind, ONE_EACH.has(kind) ? id : r.id), r);
  }

  // Each record's fate (merge3.js), then the stores.
  const fate = new Map();   // k -> {p, action, record}
  for (const [k, p] of latest) {
    const here = local.get(k)?.record ?? null;
    if (p.skip) { fate.set(k, { p, action: 'keep' }); continue; }
    if (p.same) { fate.set(k, { p, action: 'same' }); continue; }
    const there = p.deleted ? null : remote.get(k);
    if (there === undefined) continue;   // dropped by the checks, like a bad backup record
    const sha = p.kind === 'clips' ? (remoteSha(p) || shaOf(k)) : '';
    const d = decideRecord(p.kind, {
      base: bases.get(k) ?? null, local: here, remote: there, sent: link.sent[k],
      hash: (r) => hashOf(r, r === there ? sha : shaOf(k)),
    });
    fate.set(k, { p, ...d, there });
  }
  const by = (action) => [...fate.values()].filter((f) => f.action === action);
  const keyed = (kind, r) => (ONE_EACH.has(kind) ? id : r.id);

  for (const f of by('take')) await deps.put(f.p.kind, f.there);
  for (const f of by('merged')) {
    if (f.p.kind === 'clips') audio.set(f.p.id, local.get(keyOf('clips', f.p.id))?.record?.blob ?? audio.get(f.p.id));
    const one = deps.clean(pulledDoc(id, person, [{ kind: f.p.kind, body: f.record }]), audioOf)[f.p.kind]?.[0];
    if (one) await deps.put(f.p.kind, one);
    report.merged++;
    report.clashes += f.clashes ?? 0;
  }
  for (const f of by('delete')) await deps.remove(f.p.kind, keyed(f.p.kind, f.p));
  // New here, a clash kept as two, and the person's look: the backup merge.
  const viaMerge = [...by('fresh'), ...by('keepBoth')];
  report.kept += by('keepBoth').length;
  const doc = deps.clean(pulledDoc(id, person, viaMerge.map((f) => ({ kind: f.p.kind, body: f.there }))), audioOf);
  await deps.merge(doc);
  report.pulled += by('take').length + by('merged').length + by('delete').length + viaMerge.length;

  // What the cloud has now, as this device stores it: `sent` and the base.
  const after = recordsOf(deps.lists(), id, deps.kitIds);
  for (const [k, f] of fate) {
    const { p, action } = f;
    if (p.kind === 'clips' && p.body?.sound && action !== 'delete' && !p.deleted) link.sounds[p.id] = { sha256: p.body.sha256, sound: p.body.sound };
    const cloudIs = (record) => { link.sent[k] = hashOf(record, shaOf(k)); bases_.set(k, record); };
    if (p.deleted || action === 'delete') {
      // Gone in the cloud: forgotten here. A record this device changed (or
      // never deleted) is pushed again as new.
      delete link.sent[k];
      bases_.drop(k);
      // A sound deleted elsewhere lost its audio in the cloud; this device sends it again.
      if (k.startsWith('clips:') && action !== 'delete') delete link.sounds[k.slice(6)];
      continue;
    }
    if (action === 'take' || action === 'same' || action === 'fresh') {
      if (after.has(k)) cloudIs(after.get(k).record);
    } else if (action === 'merged') {
      cloudIs(f.there);   // the push sends the merge
    } else if (action === 'keep' && f.there && !p.skip) {
      cloudIs(f.there);   // the push sends this device's
    }
    // keepBoth: this device's stays under the id, and the push sends it over
    // the cloud's, which is kept here under a new id (pushed too).
  }
  link.rev = since;
  await bases_.save();
  await deps.saveLink(link);
  return profile;
}

// Pushes what differs from the cloud. Returns how many records the cloud
// left because another device wrote them after this device's pull.
async function pushAll(link, deps, shaOf, report, bases_) {
  const { api } = deps;
  const { id } = link;
  const now = recordsOf(deps.lists(), id, deps.kitIds);
  for (const [k, r] of now) {
    if (r.kind === 'clips' && !link.sounds[r.id] && r.record.blob?.size > CLOUD_MAX_SOUND) {
      now.delete(k);
      report.tooBig = (report.tooBig ?? 0) + 1;
    }
  }
  // Every clip's audio is in the cloud before its record.
  for (const r of now.values()) {
    if (r.kind !== 'clips' || link.sounds[r.id] || !r.record.blob) continue;
    const up = await uploadAudio(api, id, link.key, r.record.blob, r.record.mime, deps.sha256);
    link.sounds[r.id] = { sha256: up.sha256, sound: up.sound };
    if (up.sent) report.sounds++;
  }
  const plan = planPush(now, link.sent, shaOf);
  // A sound left on the device for its size is not a delete.
  plan.del = plan.del.filter((d) => !(d.kind === 'clips' && deps.lists().clips?.some((c) => c.id === d.id && c.personId === id)));
  const body = (r) => {
    if (r.kind !== 'clips') return r.record;
    const { blob, ...rest } = r.record;
    const s = link.sounds[r.id];
    return { ...rest, sound: s.sound, sha256: s.sha256, bytes: blob?.size };
  };
  const work = [...plan.put.map((r) => ({ put: r })), ...plan.del.map((d) => ({ del: d }))];
  let stale = 0;
  for (let i = 0; i < work.length; i += PER_PUSH) {
    const slice = work.slice(i, i + PER_PUSH);
    const put = slice.filter((w) => w.put).map((w) => ({ kind: w.put.kind, id: w.put.id, body: body(w.put) }));
    const del = slice.filter((w) => w.del).map((w) => w.del);
    const res = await api.push(id, link.key, put, del, link.rev ?? 0);
    const left = new Set((res.stale ?? []).map((s) => keyOf(s.kind, s.id)));
    stale += left.size;
    for (const w of slice) {
      const k = w.put ? keyOf(w.put.kind, w.put.id) : keyOf(w.del.kind, w.del.id);
      if (left.has(k)) continue;   // the next round pulls the other device's and merges
      if (w.put) {
        link.sent[k] = hashOf(w.put.record, shaOf(k));
        bases_.set(k, w.put.record);
      } else {
        delete link.sent[k];
        bases_.drop(k);
      }
    }
    // Nobody else pushed in between: this device is caught up to the new rev.
    if (res.was === link.rev) link.rev = res.rev;
    report.pushed += put.filter((r) => !left.has(keyOf(r.kind, r.id))).length;
    report.deleted += del.filter((r) => !left.has(keyOf(r.kind, r.id))).length;
    await bases_.save();
    await deps.saveLink(link);
  }
  return stale;
}

// Puts audio in the cloud for profile `id`, in pieces, unless it is there
// already. Returns {sound, sha256, sent} (sent: whether any piece went up).
export async function uploadAudio(api, id, key, blob, mime, sha256Of) {
  const sha256 = await sha256Of(blob);
  const started = await api.startSound(id, key, { sha256, bytes: blob.size, mime: mime || blob.type || 'audio/wav' });
  const parts = pieces(blob.size);
  for (const n of started.need) {
    const [a, b] = parts[n];
    await api.putPiece(started.id, n, key, blob.slice(a, b));
  }
  return { sound: started.id, sha256, sent: started.need.length > 0 };
}

// The person's look: the newer edit wins on both sides (the pull brought the
// cloud's when it was newer).
async function pushLook(link, deps, profile) {
  const me = (deps.lists().people ?? []).find((p) => p.id === link.id);
  if (me && profile && (me.edited ?? 0) > (profile.edited ?? 0)
    && (me.name !== profile.name || (me.avatar ?? '') !== (profile.avatar ?? '') || me.color !== profile.color)) {
    await deps.api.change(link.id, link.key, { name: me.name, avatar: me.avatar ?? '', color: me.color, edited: me.edited });
  }
}
