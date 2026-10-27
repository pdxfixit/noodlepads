// No product, brand or label name in the app's words (docs/decisions.md,
// Product; Ben, 2026-10-26): "808" is Boom, "Motown" is Detroit soul.
// Ids a saved beat, setting or backup points at may keep such a name
// (`snare-808`, the instrument `808`, the groove `motown`); only what a
// person reads is checked here: the kit's labels and groups, the grooves'
// names and lines, the instruments' names, and every word in ❓ Help.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROOVES, GROOVE_GROUPS } from '../web/grooves.js';
import { INSTRUMENTS, FAMILIES } from '../web/instruments.js';
import { HELP } from '../web/help.js';

// Drum machines, synths and keyboards by maker or model, labels, music
// services and apps. A word on its own, any case.
const NAMES = [
  '808', '909', '606', '303', 'TR-\\d+', 'TB-\\d+', 'MPC', 'SP-?404', 'LinnDrum', 'Linn',
  'Roland', 'Moog', 'Korg', 'Yamaha', 'Casio', 'Akai', 'Fender', 'Gibson',
  'Rhodes', 'Wurlitzer', 'Hammond', 'Mellotron', 'Clavinet', 'Auto-?Tune',
  'Motown', 'Stax', 'Def Jam',
  'Spotify', 'YouTube', 'SoundCloud', 'Bandcamp', 'TikTok', 'Instagram',
  'GarageBand', 'Ableton', 'FL Studio', 'Logic Pro',
  'Nintendo', 'Game ?Boy', 'Atari', 'Sega', 'PlayStation', 'Xbox',
];
const NAMED = new RegExp(`(?<![\\w-])(?:${NAMES.join('|')})(?![\\w-])`, 'i');

// Every string under the given keys anywhere inside `value` (every string
// at all when `keys` is null).
function wordsOf(value, keys, out = []) {
  if (Array.isArray(value)) for (const v of value) wordsOf(v, keys, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v !== 'string') wordsOf(v, keys, out);
      else if (keys === null || keys.includes(k)) out.push(v);
    }
  } else if (typeof value === 'string' && keys === null) out.push(value);
  return out;
}

const board = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
const SHOWN = {
  'boards.json': wordsOf(board, ['label', 'name', 'title', 'about', 'app']),
  'grooves.js': wordsOf([GROOVES, GROOVE_GROUPS], ['name', 'about']),
  'instruments.js': wordsOf([INSTRUMENTS, FAMILIES], ['name']),
  'help.js': wordsOf(HELP, null),
};

test('no product, brand or label name in any label a person reads', () => {
  for (const [file, words] of Object.entries(SHOWN)) {
    assert.ok(words.length > 10, `${file}: its labels were found`);
    const named = words.filter((w) => NAMED.test(w));
    assert.deepEqual(named, [], `${file} names a product`);
  }
});

test('the check catches the names it is for', () => {
  for (const w of ['808 snare', 'sliding 808 bass', 'Motown', 'a TR-909 beat', 'on YouTube', 'spotify'])
    assert.ok(NAMED.test(w), w);
  for (const w of ['Boom', 'Detroit soul', 'Bass C', '1-up', 'snare-808 x', 'Chip'])
    assert.ok(!NAMED.test(w), w);
});

test('the renamed ones keep their ids, so saved beats and picks still find them', () => {
  assert.equal(INSTRUMENTS.find((i) => i.id === '808')?.name, 'Boom');
  assert.equal(GROOVES.find((g) => g.id === 'motown')?.name, 'Detroit soul');
  const kit = Object.fromEntries(board.kit.map((c) => [c.id, c.label]));
  assert.equal(kit['snare-808'], 'Electro snare');
  assert.equal(kit.glide, 'Boom glide');
});
