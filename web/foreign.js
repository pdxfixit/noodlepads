// What a newer copy of the app wrote that this copy does not understand,
// kept for the cloud.
//
// A pulled record goes through the same checks as a backup (backup.js
// cleanBackup), which drop every field and value this copy does not know.
// That is right for what the device stores, but the cloud's copy still has
// them: an older app that edited such a record pushed it back without them,
// and the newer app lost its fields for good (council round 1, storage and
// sync). The sync keeps, for each record the checks changed, the record as
// the cloud has it (`raw`) beside the same record as this device stored it
// (`cleaned`); a push then puts back, into the record this device sends,
// whatever this device did not itself change (cloud-sync.js pushAll).
// Nothing here ever drops a thing this device wrote.

import { sameContent, STAMP } from './merge3.js';

// Never taken from the cloud's copy: the audio and where it is kept (the push
// names the sound itself) and the edit stamp (this device's edit is newer).
const OWN = new Set(['blob', 'sound', 'sha256', 'bytes', STAMP]);

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(typeof Blob !== 'undefined' && v instanceof Blob);
const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// Items that name themselves (a beat's rows by sound), so a row moved or
// removed here is matched by its sound, not by its place. null when the
// items are not all named, or a name repeats.
function named(list) {
  const seen = new Map();
  for (const item of list) {
    const k = isObject(item) && typeof item.clipId === 'string' ? item.clipId : null;
    if (k === null || seen.has(k)) return null;
    seen.set(k, item);
  }
  return seen;
}

// `local`, the record this device is about to send, with what the cloud had
// that this device's copy of it did not: a field or value `cleaned` lacks
// (or has otherwise) while `raw` has it comes back, wherever `local` still
// holds what `cleaned` held there, that is, wherever this device made no
// change of its own. Where it did, `local` stays. Never changes `local`.
export function restoreForeign(local, cleaned, raw) {
  if (raw === undefined) return local;
  if (isObject(local) && isObject(cleaned) && isObject(raw)) {
    const out = { ...local };
    for (const k of new Set([...Object.keys(cleaned), ...Object.keys(raw)])) {
      if (OWN.has(k) || !Object.hasOwn(raw, k)) continue;
      if (!Object.hasOwn(cleaned, k)) {
        // A field the checks dropped: back, unless this device has put its own there.
        if (!Object.hasOwn(local, k)) out[k] = copy(raw[k]);
      } else if (Object.hasOwn(local, k)) {
        out[k] = restoreForeign(local[k], cleaned[k], raw[k]);
      }   // gone from this device's copy: this device removed it, and stays removed
    }
    return out;
  }
  if (Array.isArray(local) && Array.isArray(cleaned) && Array.isArray(raw)) {
    if (sameContent(local, cleaned)) return copy(raw);   // untouched here: the cloud's whole list (rows the checks cut come back too)
    const [byLocal, byCleaned, byRaw] = [named(local), named(cleaned), named(raw)];
    if (byLocal && byCleaned && byRaw) {
      return local.map((item) => (byCleaned.has(item.clipId) && byRaw.has(item.clipId)
        ? restoreForeign(item, byCleaned.get(item.clipId), byRaw.get(item.clipId)) : item));
    }
    return local.map((item, i) => (i < cleaned.length && i < raw.length ? restoreForeign(item, cleaned[i], raw[i]) : item));
  }
  return sameContent(local, cleaned) ? copy(raw) : local;
}

// What to remember about one pulled record: `{cleaned, raw}` when the cloud's
// copy has something this device's checks dropped or changed, else null.
// `cleaned` and `raw` are kept without the audio, as the base is.
export function foreignOf(cleaned, raw) {
  if (!isObject(cleaned) || !isObject(raw)) return null;
  const { blob: _audio, ...mine } = cleaned;
  const back = restoreForeign(mine, mine, raw);
  return sameContent(back, mine) ? null : { cleaned: copy(mine), raw: copy(raw) };
}
