// Three-way merge of one synced record (docs/design/cloud-profiles.md § 6):
// the base (the record as it was at this device's last sync), this device's
// copy and the cloud's. Pure functions of plain data; cloud-sync.js runs them.
//
//   unchanged here (local = base)       take the cloud's
//   unchanged there (cloud = base)      keep this device's
//   changed on both                     field by field: a field changed on
//                                       one side takes that side; changed on
//                                       both, the kind's rule (KIND_RULES), else
//                                       the newer edit wins for a setting
//   no safe merge                       keep both (the backup merge), for
//                                       kinds that can hold two (KEEP_BOTH)
//   deleted on one side, unchanged on the other   deleted
//   deleted on one side, edited on the other      the edit stays
//
// Each record a kid changes carries `changed`, the time of its last edit on
// the device that made it (state.js persist). It is not content: two records
// that differ only there are the same record. "Newer" compares it (or, for a
// record from before it, `saved` or `edited`). A tie goes to the cloud's.
//
// Some rules here were picked while Ben was away: provisional, Q52.

import { legacySlots } from './playlist.js';
import { unionSeen } from './firsts.js';
import { SYNCED } from './reid.js';

export const STAMP = 'changed';
const SONG_KINDS = new Set(['songs', 'songbook']);
const DAY_MS = 24 * 60 * 60 * 1000;

// The stores whose records get a `changed` stamp when a kid edits them: every
// kind that syncs (cloud-sync.js CLOUD_KINDS). People keep their own `edited`.
export const STAMPED = new Set(SYNCED);

// Kinds that can keep two copies when a clash can't be merged safely: each
// has its own ids, so the cloud's copy goes under a new id (merge.js). The
// rest (one per person, kit edits, own voices) can't, so the newer edit wins
// there instead.
export const KEEP_BOTH = new Set(['clips', 'beats', 'takes', 'songbook', 'layouts', 'touchLayouts']);

// A stamp as stored, or undefined: a time, and never far in the future (a
// backup or the cloud can't make one record win every clash forever).
export function cleanStamp(v, now = Date.now()) {
  return Number.isFinite(v) && v > 0 && v <= now + DAY_MS ? v : undefined;
}

// Marks `record` (of `store`) as edited now, in place, so the copy the app
// holds and the stored one agree. Returns it.
export function stampEdit(store, record, now = Date.now()) {
  if (STAMPED.has(store) && record && typeof record === 'object' && !Array.isArray(record)) record[STAMP] = now;
  return record;
}

// When a record was last edited, for "the newer edit wins".
const time = (v) => (Number.isFinite(v) && v > 0 ? v : undefined);
export const stampOf = (r) => cleanStamp(r?.[STAMP]) ?? time(r?.saved) ?? time(r?.edited) ?? 0;

// ── content ──

// Not content: the audio and where it is kept, and the stamp. A cloud sound
// id's audio never changes; a clip's can (a made sound's sliders moved), and
// cloud-sync.js audioDecides compares the audio itself by its SHA.
const NOT_CONTENT = new Set(['blob', 'sound', 'sha256', 'bytes', STAMP]);

// A record as text with its keys in order, so two records compare by content
// (and cloud-sync.js hashOf hashes it).
export function canon(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(typeof Blob !== 'undefined' && v instanceof Blob)) {
      return Object.fromEntries(Object.keys(v).filter((k) => !NOT_CONTENT.has(k) && v[k] !== undefined).sort().map((k) => [k, walk(v[k])]));
    }
    return v;
  };
  return JSON.stringify(walk(value));
}
export const sameContent = (a, b) => canon(a) === canon(b);
const eq = sameContent;

// ── the field rules ──

// No safe merge: the caller keeps both, or (ctx.force) the newer side wins.
const UNSAFE = Symbol('unsafe');
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// The newer edit's value, counted as a clash.
function newer(l, r, ctx) {
  ctx.clashes++;
  return ctx.localNewer ? l : r;
}
const unsafe = (l, r, ctx) => (ctx.force ? newer(l, r, ctx) : UNSAFE);

// One value, three ways. `rule(b, l, r, ctx)` decides when both changed it.
function mergeValue(b, l, r, ctx, rule) {
  if (eq(l, r)) return l;
  if (eq(l, b)) return r;
  if (eq(r, b)) return l;
  if (rule) return rule(b, l, r, ctx);
  // A list with no rule of its own can't be merged safely; anything else is a
  // setting, and the newer edit wins.
  if (Array.isArray(b) || Array.isArray(l) || Array.isArray(r)) return unsafe(l, r, ctx);
  return newer(l, r, ctx);
}

// Every field, three ways. `b` may be missing (no common base). A field with
// no rule in `rules` uses `fallback`, when given.
function mergeFields(b, l, r, ctx, rules = {}, fallback = undefined) {
  const out = {};
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(l ?? {}), ...Object.keys(r ?? {})]);
  for (const k of keys) {
    if (NOT_CONTENT.has(k)) continue;
    const v = mergeValue(b?.[k], l?.[k], r?.[k], ctx, Object.hasOwn(rules, k) ? rules[k] : fallback);
    if (v === UNSAFE) return UNSAFE;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// A map of settings or keys (prefs.values, a deck's keys): key by key, the
// newer edit winning a key both changed.
function mergeMap(b, l, r, ctx) {
  if (!isObject(l) || !isObject(r)) return newer(l, r, ctx);
  return mergeFields(isObject(b) ? b : {}, l, r, ctx, {}, (bb, ll, rr, c) => newer(ll, rr, c));
}

// A person's settings: as any map, except what they have seen of their first
// steps (firsts.js), which keeps everything either side saw.
function mergePrefValues(b, l, r, ctx) {
  if (!isObject(l) || !isObject(r)) return newer(l, r, ctx);
  return mergeFields(isObject(b) ? b : {}, l, r, ctx, { seen: (bb, ll, rr) => unionSeen(ll, rr) }, (bb, ll, rr, c) => newer(ll, rr, c));
}

const most = (b, l, r) => Math.max(Number(l) || 0, Number(r) || 0);

// Lists of pills (a row's steps, its loud hits, its notes): pill by pill. With
// no base for a pill (a bar added on one side, or a row both sides added),
// `clash` decides: a pill on either side stays on.
const union = (b, l, r) => !!l || !!r;
function pillByPill(clash, fill) {
  return (b, l, r, ctx) => {
    if (!Array.isArray(l) || !Array.isArray(r)) return newer(l, r, ctx);
    const base = Array.isArray(b) ? b : [];
    const out = [];
    for (let i = 0, n = Math.max(base.length, l.length, r.length); i < n; i++) {
      out.push(mergeValue(base[i], l[i], r[i], ctx, (bb, ll, rr, c) => clash(bb, ll, rr, c)));
    }
    while (out.length && out.at(-1) === undefined) out.pop();
    return out.map((v) => (v === undefined ? fill : v));
  };
}
const newerPill = (b, l, r, ctx) => newer(l, r, ctx);

// A tune row's notes (🎹, ADR 0023): note by note, a note being its start
// and pitch; a note both sides changed (its length) takes the newer edit.
// Two notes of one pitch that now overlap are cut apart when read (notes.js).
const noteKey = (n) => (Number.isFinite(n?.s) && Number.isInteger(n?.p) ? `${n.s}:${n.p}` : null);
function mergeTune(b, l, r, ctx) {
  if (!Array.isArray(l) || !Array.isArray(r)) return newer(l, r, ctx);
  return mergeKeyed(Array.isArray(b) ? b : [], l, r, ctx, noteKey, (bb, ll, rr, c) => mergeValue(bb, ll, rr, c, (x, y, z, cc) => newer(y, z, cc)));
}

// One row of a beat.
const ROW_RULES = { steps: pillByPill(union, false), accents: pillByPill(union, false), notes: pillByPill(newerPill, null), tune: mergeTune };
const mergeRow = (b, l, r, ctx) => mergeFields(isObject(b) ? b : {}, l, r, ctx, ROW_RULES);

// A list of items each with its own key, no key twice (a pad order's ids, its
// groups, rows that each play a different sound): items added on either side
// come in; one deleted on a side goes, unless the other side changed it; one
// both have merges with `mergeItem`. The order is the side that reordered,
// or the newer edit's when both did; the other side's new items sit after
// the item they followed there.
function mergeKeyed(b, l, r, ctx, keyOf, mergeItem) {
  const index = (list) => {
    const m = new Map();
    for (const x of list) {
      const k = keyOf(x);
      if (k === undefined || k === null || m.has(k)) return null;
      m.set(k, x);
    }
    return m;
  };
  const base = Array.isArray(b) ? b : [];
  const [B, L, R] = [index(base), index(l), index(r)];
  if (!B || !L || !R) return unsafe(l, r, ctx);
  const keep = new Map();
  for (const k of new Set([...L.keys(), ...R.keys()])) {
    if (L.has(k) && R.has(k)) {
      const item = mergeItem(B.get(k), L.get(k), R.get(k), ctx);
      if (item === UNSAFE) return UNSAFE;
      keep.set(k, item);
    } else {
      const item = L.has(k) ? L.get(k) : R.get(k);
      // Gone on the other side: it goes too, unless this side changed it.
      if (!B.has(k) || !eq(item, B.get(k))) keep.set(k, item);
    }
  }
  const order = (list) => list.map(keyOf);
  const inBase = (keys, other) => keys.filter((k) => other.has(k));
  const reordered = (keys) => inBase(keys, B).join('\u0000') !== inBase(order(base), new Set(keys)).join('\u0000');
  const [lMoved, rMoved] = [reordered(order(l)), reordered(order(r))];
  const lFirst = lMoved === rMoved ? ctx.localNewer : lMoved;
  const [first, second] = lFirst ? [order(l), order(r)] : [order(r), order(l)];
  const out = first.filter((k) => keep.has(k));
  const placed = new Set(out);
  second.forEach((k, i) => {
    if (!keep.has(k) || placed.has(k)) return;
    // Last on its side (nothing placed after it): last here too. Else just
    // after the item it followed there, or at the start.
    let at = out.length;
    if (second.slice(i + 1).some((x) => placed.has(x))) {
      at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const p = out.indexOf(second[j]);
        if (p >= 0) { at = p + 1; break; }
      }
    }
    out.splice(at, 0, k);
    placed.add(k);
  });
  return out.map((k) => keep.get(k));
}

// A beat's rows: row by row when all three have the same sounds in the same
// places; else by sound, when no sound has two rows; else no safe merge.
function mergeRows(b, l, r, ctx) {
  if (!Array.isArray(l) || !Array.isArray(r)) return newer(l, r, ctx);
  const base = Array.isArray(b) ? b : [];
  const sounds = (rows) => rows.map((x) => x?.clipId).join('\u0000');
  if (base.length === l.length && l.length === r.length && sounds(base) === sounds(l) && sounds(l) === sounds(r)) {
    const out = [];
    for (let i = 0; i < l.length; i++) {
      const row = mergeValue(base[i], l[i], r[i], ctx, mergeRow);
      if (row === UNSAFE) return UNSAFE;
      out.push(row);
    }
    return out;
  }
  return mergeKeyed(base, l, r, ctx, (row) => (typeof row?.clipId === 'string' ? row.clipId : null), mergeRow);
}

// A song's slots: slot by slot when all three play the same beats in the same
// order (only how many times changed); else no safe merge.
function mergeSlots(b, l, r, ctx) {
  if (!Array.isArray(l) || !Array.isArray(r)) return newer(l, r, ctx);
  const base = Array.isArray(b) ? b : [];
  const beats = (slots) => slots.map((x) => x?.beatId).join('\u0000');
  if (base.length !== l.length || l.length !== r.length || beats(base) !== beats(l) || beats(l) !== beats(r)) return unsafe(l, r, ctx);
  const out = [];
  for (let i = 0; i < l.length; i++) {
    const slot = mergeValue(base[i], l[i], r[i], ctx, (bb, ll, rr, c) => mergeFields(bb, ll, rr, c));
    if (slot === UNSAFE) return UNSAFE;
    out.push(slot);
  }
  return out;
}

// A song's lanes (ADR 0024): lane by lane, by place. A lane's name, picture,
// mute and volume are settings (the newer edit wins one both changed); its
// blocks merge by the bar each starts at, so a block added on each side
// both stay, and one removed on a side goes unless the other changed it.
// Two blocks that now run into each other are cut apart when played
// (playlist.js: the later block wins).
const barKey = (x) => (Number.isInteger(x?.bar) ? x.bar : null);
const mergeBlocks = (b, l, r, ctx) => (!Array.isArray(l) || !Array.isArray(r) ? newer(l, r, ctx)
  : mergeKeyed(Array.isArray(b) ? b : [], l, r, ctx, barKey, (bb, ll, rr, c) => mergeFields(bb ?? {}, ll, rr, c)));
const mergeLane = (b, l, r, ctx) => (isObject(l) && isObject(r) ? mergeFields(isObject(b) ? b : {}, l, r, ctx, { blocks: mergeBlocks }) : newer(l, r, ctx));
function mergeLanes(b, l, r, ctx) {
  if (!Array.isArray(l) || !Array.isArray(r)) return newer(l, r, ctx);
  const base = Array.isArray(b) ? b : [];
  const out = [];
  for (let i = 0, n = Math.max(l.length, r.length); i < n; i++) {
    const lane = mergeValue(base[i], l[i], r[i], ctx, mergeLane);
    if (lane === UNSAFE) return UNSAFE;
    if (lane !== undefined) out.push(lane);
  }
  return out;
}

// A song's tempo marks (ADR 0031): mark by mark, by the bar each is at, so a
// mark added on each side both stay, and one both changed takes the newer
// BPM. None at all is no field (cleanTempos reads the result in bar order).
function mergeTempos(b, l, r, ctx) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const out = mergeKeyed(list(b), list(l), list(r), ctx, barKey, (bb, ll, rr, c) => mergeFields(bb ?? {}, ll, rr, c));
  if (out === UNSAFE) return UNSAFE;
  return out.length ? [...out].sort((x, y) => x.bar - y.bar) : undefined;
}

const mergeIds = (b, l, r, ctx) => mergeKeyed(b, l, r, ctx, (x) => (typeof x === 'string' ? x : null), (bb, ll) => ll);
const mergeGroups = (b, l, r, ctx) => mergeKeyed(b, l, r, ctx, (g) => g?.id ?? null, (bb, ll, rr, c) => mergeFields(bb ?? {}, ll, rr, c));

// Fields with a rule of their own, per kind. Every other field is a setting
// (the newer edit wins) or a list with no safe merge.
export const KIND_RULES = {
  beats: { rows: mergeRows },
  patterns: { rows: mergeRows },
  songbook: { slots: mergeSlots, lanes: mergeLanes, tempos: mergeTempos },
  songs: { slots: mergeSlots, lanes: mergeLanes, tempos: mergeTempos },
  orders: { ids: mergeIds, groups: mergeGroups },
  decks: { keys: mergeMap, mine: mergeMap },
  layouts: { keys: mergeMap },
  prefs: { values: mergePrefValues },
  voices: { used: most, knobs: mergeMap },
};

// Merges a record changed on both sides. `base` may be null (both sides made
// it, or this device has no base for it yet). Returns {record, clashes} (how
// many values the newer edit decided), or {keepBoth: true} when there is no
// safe merge and the kind can hold two.
export function merge3(kind, base, local, remote) {
  const ctx = { localNewer: stampOf(local) > stampOf(remote), force: !KEEP_BOTH.has(kind), clashes: 0 };
  // A song with lanes (ADR 0024) also writes `slots` for older copies, made
  // from its lanes: those merge, and the slots are made again from the result.
  const derived = SONG_KINDS.has(kind) && Array.isArray(local?.lanes) && Array.isArray(remote?.lanes);
  const strip = (r) => (derived && r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'slots')) : r);
  const fields = mergeFields(strip(base) ?? {}, strip(local), strip(remote), ctx, KIND_RULES[kind] ?? {});
  if (fields === UNSAFE) return { keepBoth: true };
  if (derived && Array.isArray(fields.lanes)) fields.slots = legacySlots(fields.lanes);
  // The audio is this device's here; cloud-sync.js audioDecides says when
  // the cloud's goes with the merge instead. The stamp is the newer of the two.
  if (local?.blob !== undefined) fields.blob = local.blob;
  const stamp = Math.max(cleanStamp(local?.[STAMP]) ?? 0, cleanStamp(remote?.[STAMP]) ?? 0);
  if (stamp) fields[STAMP] = stamp;
  return { record: fields, clashes: ctx.clashes };
}

// What one sync does with one record. `local` and `remote` are null when that
// side has none (never had it, or deleted it); `base` is null when there is
// no common base. Returns {action}:
//   same      both sides already agree (or both are gone)
//   take      store the cloud's
//   keep      keep this device's (the push sends it, or its delete)
//   delete    delete it here
//   merged    store `record`, then push it
//   keepBoth  the backup merge: this device's under the id, the cloud's under a new id
export function resolve(kind, base, local, remote) {
  if (!local && !remote) return { action: 'same' };
  if (local && remote && eq(local, remote)) return { action: 'same' };
  if (!base) {
    if (!local) return { action: 'take' };
    if (!remote) return { action: 'keep' };
    if (KEEP_BOTH.has(kind)) return { action: 'keepBoth' };
    return { action: 'merged', ...merge3(kind, null, local, remote) };
  }
  if (!local) return remote && !eq(remote, base) ? { action: 'take' } : { action: 'keep' };
  if (!remote) return eq(local, base) ? { action: 'delete' } : { action: 'keep' };
  if (eq(local, base)) return { action: 'take' };
  if (eq(remote, base)) return { action: 'keep' };
  const m = merge3(kind, base, local, remote);
  return m.keepBoth ? { action: 'keepBoth' } : { action: 'merged', ...m };
}
