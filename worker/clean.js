// The Worker's check of every problem report: the app's own rules
// (web/log-clean.js cleanPayload), run again here, so what is stored is
// exactly what the app would send. One set of rules for both ends; a
// payload the app builds passes unchanged (tests/worker-clean.test.mjs).

import { cleanPayload } from '../web/log-clean.js';
import boards from '../web/boards.json' with { type: 'json' };

// Kit sound ids, read from web/boards.json (every instrument's own copy of
// Notes, Chords and Bass, ADR 0030, is in it). Public already, so they pass as
// they are; any other sound arrives as a kind (bundled, made, recorded).
// Wrangler bundles the JSON into the Worker.
export const KIT_IDS = boards.kit.map((k) => k.id);

const KNOWN = { kitIds: new Set(KIT_IDS), origin: 'https://noodlepads.com' };

// { ok: true, upload } for a report from the app, else { ok: false, why }.
export function cleanUpload(body) {
  if (!Array.isArray(body?.entries)) return { ok: false, why: 'no entries' };
  const upload = cleanPayload(body, KNOWN);
  if (!upload) return { ok: false, why: body?.format !== 1 ? 'unknown format' : 'no device code' };
  return { ok: true, upload };
}

export const errorCount = (upload) => upload.entries.filter((e) => e.kind === 'error').length;
