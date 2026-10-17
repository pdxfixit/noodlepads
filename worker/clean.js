// The Worker's check of every problem report: the app's own rules
// (web/log-clean.js cleanPayload), run again here, so what is stored is
// exactly what the app would send. One set of rules for both ends; a
// payload the app builds passes unchanged (tests/worker-clean.test.mjs).

import { cleanPayload } from '../web/log-clean.js';
import { kitIdsOf } from '../web/instruments.js';

// Kit sound ids from web/boards.json. Public already, so they pass as they
// are; any other sound arrives as a kind (bundled, made, recorded). A test
// keeps this list equal to boards.json.
export const KIT_IDS = [
  'kick', 'snare', 'hihat', 'open-hat', 'clap', 'tom-high', 'tom-low', 'crash', 'cowbell', 'shaker',
  'rim', 'snap', 'tambourine', 'ride', 'boom', 'snare-808', 'clave', 'conga', 'tom-fill', 'rimshot',
  'drumroll', 'note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high',
  'chord-c', 'chord-am', 'chord-f', 'chord-g', 'chord-dm', 'chord-em', 'chord-g7', 'bass-c',
  'bass-d', 'bass-e', 'bass-f', 'bass-g', 'bass-a', 'coin', 'power-up', 'jump', 'zap', 'pew',
  'blip', 'one-up', 'game-over', 'teleport', 'explosion', 'siren', 'whoosh', 'pop', 'alarm', 'ding',
  'buzzer', 'heartbeat', 'countdown', 'scratch', 'airhorn', 'tada', 'moo', 'quack', 'tweet', 'roar',
  'meow', 'woof', 'ribbit', 'buzz', 'laser', 'warp', 'phaser', 'robot', 'ufo', 'beam', 'red-alert',
  'computer', 'lets-go', 'oh-yeah', 'bruh', 'no-way', 'nice', 'gg', 'level-up', 'drop-the-beat',
  'oof', 'wow', 'ready', 'go', 'boom-word', 'yes', 'cackle', 'evil-laugh', 'raspberry', 'honk',
  'boing', 'slide-whistle', 'sad-trombone', 'burp', 'toot', 'splat', 'zip', 'kazoo', 'bonk',
  'squeak',
  // The sharps and flats (Advanced-only presets).
  'note-cs', 'note-ds', 'note-fs', 'note-gs', 'note-as', 'chord-csm', 'chord-cm', 'chord-d',
  'chord-eb', 'chord-e', 'chord-fsm', 'chord-gm', 'chord-a', 'chord-bb', 'chord-bm', 'bass-cs',
  'bass-ds', 'bass-fs', 'bass-gs', 'bass-as',
  // The 🧢 Hip hop presets.
  'kick-dusty', 'snare-dusty', 'glide', 'hat-roll', 'woodblock', 'plink', 'bloop', 'vinyl', 'horn-stab',
  'rewind',
  // The 🪘 Hand drums presets.
  'taiko', 'djembe', 'djembe-slap', 'log-drum', 'dhol', 'dhol-high', 'bongo', 'cajon',
];
// Every instrument's own copy of Notes, Chords and Bass (ADR 0030): `piano-e`
// for note-e, `piano-am-chord` for chord-am, `808-c` for bass-c.
KIT_IDS.push(...kitIdsOf(KIT_IDS));

const KNOWN = { kitIds: new Set(KIT_IDS), origin: 'https://noodlepads.com' };

// { ok: true, upload } for a report from the app, else { ok: false, why }.
export function cleanUpload(body) {
  if (!Array.isArray(body?.entries)) return { ok: false, why: 'no entries' };
  const upload = cleanPayload(body, KNOWN);
  if (!upload) return { ok: false, why: body?.format !== 1 ? 'unknown format' : 'no device code' };
  return { ok: true, upload };
}

export const errorCount = (upload) => upload.entries.filter((e) => e.kind === 'error').length;
