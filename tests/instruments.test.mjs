// Instruments (ADR 0030): who plays Notes, Chords and Bass. Each
// instrument's notes are presets of their own, played from one or two
// recordings moved to the note; the person's pick says which a group shows.
// Sound can't be heard here, so the notes are checked by ear's stand-in:
// pitch.js's findNote, on the real files moved as the app moves them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INSTRUMENTS, FAMILIES, PLAYED, instrumentsFor, instrumentIds, presetInstrument, showsFor, voice, voicingOf,
  instrumentKitId, kitIdsOf, instrumentProblem, MAX_SHIFT,
} from '../web/instruments.js';
import { findNote } from '../web/pitch.js';
import { clipsForPerson, kitFor, validateManifest } from '../web/model.js';
import { SETTINGS, cleanPrefs, getSetting, setSetting } from '../web/settings.js';
import { state } from '../web/state.js';
import { FakeAudioBuffer } from './helpers.mjs';
import { testManifest } from './test-board.mjs';
import { stubBanner } from './banner.mjs';

stubBanner();

const BOARDS = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
const OWN = BOARDS.kit.filter((k) => !k.inst);
const byId = new Map(BOARDS.kit.map((k) => [k.id, k]));

// A kit WAV (mono, 16-bit) as something shaped like an AudioBuffer.
function wav(file) {
  const b = readFileSync(new URL(`../web/${file}`, import.meta.url));
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  let pos = 12, rate = 0, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const n = dv.getUint32(pos + 4, true);
    if (id === 'fmt ') { assert.equal(dv.getUint16(pos + 10, true), 1, `${file} is mono`); rate = dv.getUint32(pos + 12, true); }
    if (id === 'data') data = [pos + 8, n];
    pos += 8 + n + (n & 1);
  }
  const x = new Float32Array(data[1] / 2);
  for (let i = 0; i < x.length; i++) x[i] = dv.getInt16(data[0] + 2 * i, true) / 32768;
  return { sampleRate: rate, length: x.length, numberOfChannels: 1, getChannelData: () => x, duration: x.length / rate };
}
const asBuffer = (x, rate) => ({ sampleRate: rate, length: x.length, numberOfChannels: 1, getChannelData: () => x, duration: x.length / rate });
const played = (k) => { const w = wav(k.file); const v = voicingOf(k); return v ? asBuffer(voice(w.getChannelData(0), v), w.sampleRate) : w; };

test('families and instruments: every instrument in a family, each group playable, the defaults first', () => {
  const families = new Set(FAMILIES.map((f) => f.id));
  assert.deepEqual([...families], ['keys', 'mallets', 'strings', 'wind']);
  for (const i of INSTRUMENTS) assert.ok(families.has(i.family), i.id);
  assert.equal(new Set(INSTRUMENTS.map((i) => i.id)).size, INSTRUMENTS.length);
  for (const [group, p] of Object.entries(PLAYED)) {
    assert.equal(instrumentsFor(group)[0].id, p.default, `${group}: today's sound comes first`);
    assert.ok(instrumentsFor(group).length >= 3, group);
  }
  // The ones Ben's review names.
  for (const id of ['piano', 'marimba', 'steel', 'kalimba', 'chip', 'guitar', 'strings', 'brass', 'flute', 'organ']) assert.ok(instrumentIds('notes').includes(id), id);
  for (const id of ['piano', 'guitar', 'strings']) assert.ok(instrumentIds('chords').includes(id), id);
});

test('every instrument plays every preset of each group it plays, as a preset of its own with the same picture', () => {
  const insts = BOARDS.kit.filter((k) => k.inst);
  assert.deepEqual(insts.map((k) => k.id).sort(), kitIdsOf(OWN.map((k) => k.id)).sort(), 'kitIdsOf (the Worker\'s list) names them all');
  for (const i of INSTRUMENTS.filter((x) => !Object.values(PLAYED).some((p) => p.default === x.id))) {
    for (const group of i.groups) {
      for (const own of OWN.filter((k) => k.group === group)) {
        const k = byId.get(instrumentKitId(i.id, own.id));
        assert.ok(k, `${i.id} plays ${own.id}`);
        assert.equal(k.inst, i.id);
        assert.equal(k.plays, own.id);
        for (const field of ['label', 'emoji', 'color', 'group']) assert.equal(k[field], own[field], `${k.id} ${field}`);
        assert.equal(!!k.advanced, !!own.advanced, `${k.id}: a sharp is Advanced on every instrument`);
      }
    }
  }
  assert.equal(validateManifest(BOARDS), null);
});

test('each recording is the note its name says, by pitch.js', () => {
  for (const file of new Set(BOARDS.kit.filter((k) => k.inst).map((k) => k.file))) {
    const midi = Number(/-(\d+)\.wav$/.exec(file)[1]);
    assert.equal(findNote(wav(file))?.midi, midi, file);
  }
});

test('every instrument\'s note sounds the note its own preset does', () => {
  for (const k of BOARDS.kit.filter((x) => x.inst && x.group !== 'chords')) {
    const want = findNote(wav(byId.get(k.plays).file))?.midi;
    assert.ok(Number.isInteger(want), k.plays);
    assert.equal(findNote(played(k))?.midi, want, `${k.id} plays ${k.plays}'s note`);
  }
});

test('every instrument\'s chord is its name\'s notes, and no recording moves more than an octave', () => {
  const ROOT = { C: 0, 'C♯': 1, D: 2, 'E♭': 3, E: 4, F: 5, 'F♯': 6, G: 7, 'A♭': 8, A: 9, 'B♭': 10, B: 11 };
  for (const k of BOARDS.kit.filter((x) => x.inst)) {
    const moves = voicingOf(k) ?? [0];
    assert.ok(moves.every((s) => Math.abs(s) <= MAX_SHIFT), k.id);
    if (k.group !== 'chords') continue;
    const [, root, kind] = /^([A-G][♯♭]?)(m|7)? chord$/.exec(k.label);
    const steps = kind === 'm' ? [0, 3, 7] : kind === '7' ? [0, 4, 7, 10] : [0, 4, 7];
    const want = new Set(steps.map((s) => (ROOT[root] + s) % 12));
    const midi = Number(/-(\d+)\.wav$/.exec(k.file)[1]);
    assert.deepEqual(new Set(moves.map((s) => (((midi + s) % 12) + 12) % 12)), want, k.id);
  }
});

test('voice: a note moved up an octave is half as long and an octave up; a chord keeps the recording\'s peak', () => {
  const rate = 22050;
  const x = new Float32Array(rate);   // a second of A3, 220 Hz
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / rate);
  assert.equal(findNote(asBuffer(x, rate)).midi, 57);
  const up = voice(x, [12]);
  assert.ok(Math.abs(up.length - rate / 2) <= 1, `${up.length}`);
  assert.equal(findNote(asBuffer(up, rate)).midi, 69);
  assert.equal(findNote(asBuffer(voice(x, [-5]), rate)).midi, 52);
  const chord = voice(x, [0, 4, 7]);
  assert.equal(chord.length, x.length - 1, 'as long as its lowest note');
  const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(Math.abs(peak(chord) - 0.5) < 1e-6);
  assert.ok(Math.abs(peak(up) - 0.5) < 1e-6);
  assert.deepEqual(voicingOf({ shift: 0 }), null, 'no move: played as it is');
  assert.deepEqual(voicingOf({ chord: [-3, 0, 4] }), [-3, 0, 4]);
});

test('who plays a preset, and which presets a pick shows', () => {
  assert.equal(presetInstrument({ group: 'notes' }), 'pluck');
  assert.equal(presetInstrument({ group: 'bass', inst: '808' }), '808');
  assert.equal(presetInstrument({ group: 'drums' }), null);
  const piano = { group: 'notes', inst: 'piano' };
  assert.equal(showsFor({ group: 'notes' }, {}), true, 'nothing picked: today\'s sound');
  assert.equal(showsFor(piano, {}), false);
  assert.equal(showsFor(piano, { notes: 'piano' }), true);
  assert.equal(showsFor({ group: 'notes' }, { notes: 'piano' }), false);
  assert.equal(showsFor({ group: 'notes' }, { notes: 'tuba' }), true, 'a pick this copy doesn\'t know: today\'s sound');
  assert.equal(showsFor({ group: 'drums' }, { notes: 'piano' }), true);
});

test('a person\'s pads show the picked instrument\'s notes; a lookup (no picks) finds every instrument\'s', () => {
  const pip = { id: 'pip', clips: kitFor('pip', BOARDS.kit) };
  const args = { overrides: new Map(), userClips: [], advanced: false };
  const shown = (picks) => clipsForPerson(pip, { ...args, picks }).filter((c) => ['notes', 'chords', 'bass'].includes(c.group));
  assert.deepEqual(shown({}).map((c) => c.kitId), OWN.filter((k) => ['notes', 'chords', 'bass'].includes(k.group) && !k.advanced).map((k) => k.id));
  const piano = shown({ notes: 'piano', bass: '808' });
  assert.deepEqual(piano.filter((c) => c.group === 'notes').map((c) => c.kitId), ['piano-c', 'piano-d', 'piano-e', 'piano-f', 'piano-g', 'piano-a', 'piano-b', 'piano-c-high']);
  assert.ok(piano.filter((c) => c.group === 'chords').every((c) => !c.inst), 'Chords still plays its own');
  assert.ok(piano.filter((c) => c.group === 'bass').every((c) => c.inst === '808'));
  assert.equal(clipsForPerson(pip, { ...args, advanced: true }).length, BOARDS.kit.length, 'every instrument, for a beat row or key that uses one');
});

test('validateManifest: an instrument it doesn\'t know, one in a group it doesn\'t play, a bad shift or chord, a "plays" that isn\'t there', () => {
  const m = testManifest();
  const with_ = (extra) => ({ ...m, kitGroups: [{ id: 'notes', name: 'Notes' }], kit: [{ id: 'note-c', file: 'clips/c.wav', group: 'notes' }, { id: 'tuba-c', file: 'clips/t.wav', group: 'notes', ...extra }] });
  assert.equal(validateManifest(with_({ inst: 'piano', plays: 'note-c', shift: 2 })), null);
  assert.match(validateManifest(with_({ inst: 'tuba' })), /unknown instrument "tuba"/);
  assert.match(validateManifest(with_({ inst: '808' })), /doesn't play notes/);
  assert.match(validateManifest(with_({ inst: 'piano', shift: 13 })), /"shift"/);
  assert.match(validateManifest(with_({ inst: 'piano', shift: 1.5 })), /"shift"/);
  assert.match(validateManifest(with_({ inst: 'piano', chord: [] })), /"chord"/);
  assert.match(validateManifest(with_({ inst: 'piano', chord: [0, 4, 'x'] })), /"chord"/);
  assert.match(validateManifest(with_({ inst: 'piano', plays: 'note-z' })), /plays "note-z"/);
  assert.equal(instrumentProblem({ id: 'kick', group: 'drums' }), null);
});

// Ben, 2026-10-17: the instrument picked is remembered per person and syncs
// with them. It is a person setting, so prefs carry it to the cloud and in
// backups (cleanPrefs is what both keep).
test('the instrument picked is each person\'s own setting, kept by cleanPrefs; one this copy doesn\'t know reads as today\'s sound', async () => {
  for (const [group, p] of Object.entries(PLAYED)) {
    assert.equal(SETTINGS[p.setting].scope, 'person', p.setting);
    assert.equal(SETTINGS[p.setting].default, p.default);
    assert.deepEqual(SETTINGS[p.setting].values, instrumentIds(group));
  }
  assert.deepEqual(cleanPrefs({ personId: 'p-a', values: { instNotes: 'piano', instBass: 'tuba', instChords: 'guitar' } }),
    { personId: 'p-a', values: { instNotes: 'piano', instChords: 'guitar' } });
  state.settings = new Map();
  state.personId = 'p-a';
  state.prefs = new Map([['p-b', { personId: 'p-b', values: { instNotes: 'marimba' } }]]);
  assert.equal(getSetting('instNotes'), 'pluck');
  await setSetting('instNotes', 'piano');
  assert.deepEqual(state.prefs.get('p-a').values, { instNotes: 'piano' });
  state.personId = 'p-b';
  assert.equal(getSetting('instNotes'), 'marimba', 'another person has their own');
  await assert.rejects(setSetting('instChords', 'flute'), /isn't a value/, 'Flute plays no chords');
});

test('two presets of one recording decode it once, and each gets its own moved copy', async () => {
  const { audio } = await import('../web/audio.js');
  globalThis.AudioBuffer ??= FakeAudioBuffer;
  const rec = new FakeAudioBuffer({ length: 1000, numberOfChannels: 1, sampleRate: 22050 });
  for (let i = 0; i < 1000; i++) rec.getChannelData(0)[i] = Math.sin(i / 5);
  const keep = Float32Array.from(rec.getChannelData(0));
  let fetched = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetched++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  const realDecode = audio.decode;
  audio.decode = async () => rec;
  try {
    const up = await audio.decoded({ source: 'bundled', file: 'clips/kit/test-60.wav', shift: 12 });
    const chord = await audio.decoded({ source: 'bundled', file: 'clips/kit/test-60.wav', chord: [0, 4, 7] });
    assert.equal(fetched, 1);
    assert.ok(Math.abs(up.length - 500) <= 1);
    assert.equal(chord.length, 999);
    assert.deepEqual(rec.getChannelData(0), keep, 'the recording itself is never changed');
  } finally {
    globalThis.fetch = realFetch;
    audio.decode = realDecode;
    audio.recordings.clear();
  }
});
