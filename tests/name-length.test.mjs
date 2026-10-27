// One name length (names.js MAX_NAME), counted one way (by characters): a
// name of 24 characters survives every cleaner and the backup gate, whole,
// and one of 25 is cut to 24 whole characters, never half an emoji.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_NAME, nameLength, cutName } from '../web/names.js';
import { groupName } from '../web/groups.js';
import { layoutName } from '../web/keyset.js';
import { touchName } from '../web/touch.js';
import { cleanMyVoice } from '../web/voice-knobs.js';
import { audioFileName } from '../web/wav.js';
import { cleanBackup } from '../web/backup.js';

const emoji24 = '🥁'.repeat(MAX_NAME);   // 24 characters, 48 UTF-16 units
const emoji25 = '🥁'.repeat(MAX_NAME + 1);
const family = '👨‍👩‍👧';                       // one character on screen, several code points
const blob = new Blob(['x'], { type: 'audio/wav' });

test('the one name length is 24', () => {
  assert.equal(MAX_NAME, 24);
  assert.equal(nameLength(emoji24), 24);
  assert.equal(emoji24.length, 48, 'counted by UTF-16 units it would be 48');
});

test('every cleaner keeps 24 characters whole and cuts 25 to 24 whole characters', () => {
  const cleaners = {
    group: groupName,
    layout: layoutName,
    touch: touchName,
    voice: (v) => cleanMyVoice({ id: 'voice-a', personId: 'p-x-1', name: v, knobs: { pitch: 7 } })?.name,
    cut: cutName,
  };
  for (const [what, clean] of Object.entries(cleaners)) {
    assert.equal(clean(emoji24), emoji24, `${what}: 24 emoji stay`);
    assert.equal(clean(emoji25), emoji24, `${what}: 25 emoji are cut to 24, whole`);
    // The family is five code points: it fits in the last five places, or goes whole.
    const room = MAX_NAME - nameLength(family);
    assert.equal(clean('a'.repeat(room) + family), 'a'.repeat(room) + family, `${what}: the family at the last places stays whole`);
    assert.equal(clean('a'.repeat(room + 1) + family), 'a'.repeat(room + 1), `${what}: one that does not fit goes whole`);
  }
});

test('a 24-emoji name survives the backup gate, and a longer one is cut to 24', () => {
  const bundled = { peopleIds: new Set(['p-pip-1']), clipIds: new Set() };
  const gate = (label) => cleanBackup({ format: '1.0', clips: [{ id: 'user-a', personId: 'p-pip-1', label, emoji: '🥁', color: 'blue', voice: 'normal', mime: 'audio/wav', created: 1, file: 'a.wav' }] }, () => blob, bundled);
  assert.equal(gate(emoji24).clips[0].label, emoji24);
  assert.equal(gate(emoji25).clips[0].label, emoji24);
});

test('a saved audio file\'s name is cut by characters too', () => {
  assert.equal(audioFileName('𝒜'.repeat(30)), `${'𝒜'.repeat(MAX_NAME)}.wav`);
  assert.equal(audioFileName('Wobbly Marshmallow Drums Extra'), 'Wobbly Marshmallow Drums.wav');
});

test('every name field in the page holds MAX_NAME', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const fields = [...html.matchAll(/<input\b[^>]*\b(?:data-beat-name|id="(?:clip-label|keep-name|song-name|dj-take-name|ke-save-name|ke-rename|te-save-name|te-rename)")[^>]*>/g)].map((m) => m[0]);
  assert.ok(fields.length >= 10);
  for (const tag of fields) assert.match(tag, new RegExp(`maxlength="${MAX_NAME}"`), tag);
});

test('exact(): ids and colors that now fit by characters are still refused by the checks after it', () => {
  const astral = '🥁'.repeat(24);
  const bundled = { peopleIds: new Set(['p-pip-1']), clipIds: new Set(), colorOk: (c) => c === 'blue' };
  const out = cleanBackup({
    format: '1.0',
    people: [{ id: `p-${'🥁'.repeat(20)}`, added: true, name: 'X' }, { id: 'p-pip-1' }],
    clips: [{ id: 'user-a', personId: 'p-pip-1', label: 'A', emoji: '🥁', color: astral, voice: 'normal', mime: 'audio/wav', created: 1, file: 'a.wav' }],
  }, () => blob, bundled);
  assert.deepEqual(out.people.map((p) => p.id), ['p-pip-1'], 'a person id of astral characters is refused by PERSON_ID');
  assert.equal(out.clips[0].color, undefined, 'a color that is not on the palette is dropped');
  assert.equal(out.clips[0].label, 'A');
});
