// Random ids for every person (ADR 0002). An older boards.json gave its
// people plain ids, which were the kids' first names, and a device kept them.
// A person id travels: to the cloud (the profile's id), into the address
// (#<id>) and into the ids of their copy of the kit (`<person>-kick`). So
// every person whose id is not a random one from newId('p') gets one, and
// everything that names the old id follows. Pure functions of plain data,
// used by the device (state.js) and checked by the tests.

// What a person id may be once it leaves the device: "p-" and random letters
// (newId('p'): "p-mv4cyiqj-b8bt"). The Worker makes, lists and syncs only
// these; it renames nothing (Ben, Q27).
export const CLOUD_ID = /^p-[0-9a-z-]{1,60}$/;
export const isCloudId = (id) => typeof id === 'string' && CLOUD_ID.test(id);

// The stores that hold or name people, as a backup holds them (`cloud`, the
// device's links, is dropped for a renamed person, state.js; `settings`
// names no one).
export const PERSON_STORES = ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices', 'touchLayouts'];

// One id after the rename: the person's own id, or one made from it (their
// copy of the kit, `<from>-kick` -> `<to>-kick`). Anything else is unchanged.
export function remapId(id, from, to) {
  if (typeof id !== 'string') return id;
  if (id === from) return to;
  return id.startsWith(`${from}-`) ? to + id.slice(from.length) : id;
}

// The same rename on a record as JSON text: every string (a value or a key)
// that is the old id, or starts with it and a dash. Searching the text instead of known fields means a field added
// later is never missed.
export function remapText(text, from, to) {
  return text.split(`"${from}"`).join(`"${to}"`).split(`"${from}-`).join(`"${to}-`);
}

// A stored record with `from` renamed to `to`. The same object comes back
// when nothing in it names `from`, so the caller can tell what changed. A
// sound's audio (`blob`) is kept as it is.
export function remapRecord(record, from, to) {
  if (!record || typeof record !== 'object') return record;
  const { blob, ...rest } = record;
  const text = JSON.stringify(rest);
  const out = remapText(text, from, to);
  if (out === text) return record;
  const next = JSON.parse(out);
  return 'blob' in record ? { ...next, blob } : next;
}

// A backup-shaped document (stores as lists) with `from` renamed to `to`.
export function reIdDoc(doc, from, to) {
  const out = { ...doc };
  for (const name of PERSON_STORES) {
    if (Array.isArray(doc?.[name])) out[name] = doc[name].map((r) => remapRecord(r, from, to));
  }
  return out;
}
