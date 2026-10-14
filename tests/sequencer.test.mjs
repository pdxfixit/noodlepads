import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPattern, encodeWav, STEPS, mergeGroove, cleanRow, balancedColumns, SIGNATURES, beatToFile, beatFromFile, BEAT_FILE, rowSlot } from '../web/sequencer.js';
import { fakeBuffer } from './helpers.mjs';

test('cleanPattern: defaults for nothing at all', () => {
  assert.deepEqual(cleanPattern(undefined, 'pip'), { personId: 'pip', name: '', bpm: 100, bars: 1, swing: 0, rows: [] });
  assert.deepEqual(cleanPattern(null, 'pip'), { personId: 'pip', name: '', bpm: 100, bars: 1, swing: 0, rows: [] });
  assert.deepEqual(cleanPattern('junk', 'pip').rows, []);
});

test('cleanPattern: a beat keeps its own time signature; junk and none leave it out', () => {
  assert.equal(cleanPattern({ signature: '6/8' }, 'x').signature, '6/8');
  assert.equal('signature' in cleanPattern({ signature: '13/16' }, 'x'), false);
  assert.equal('signature' in cleanPattern({ signature: 'toString' }, 'x'), false);
  assert.equal('signature' in cleanPattern({}, 'x'), false, 'a beat from before plays as the old Settings choice did');
});

test('cleanPattern: tempo is clamped to 60-180 and junk falls back to 100', () => {
  assert.equal(cleanPattern({ bpm: 10 }, 'x').bpm, 60);
  assert.equal(cleanPattern({ bpm: 500 }, 'x').bpm, 180);
  assert.equal(cleanPattern({ bpm: '140' }, 'x').bpm, 140);
  assert.equal(cleanPattern({ bpm: 'fast' }, 'x').bpm, 100);
  assert.equal(cleanPattern({ bpm: NaN }, 'x').bpm, 100);
  assert.equal(cleanPattern({ bpm: Infinity }, 'x').bpm, 180);
  assert.equal(cleanPattern({ bpm: 0 }, 'x').bpm, 100);
});

test('cleanPattern: every row has exactly 16 boolean steps', () => {
  const p = cleanPattern({ rows: [{ clipId: 'a', steps: [1, 0, true, 'x', null] }, { clipId: 'b' }] }, 'x');
  assert.equal(STEPS, 16);
  assert.deepEqual(p.rows[0].steps.slice(0, 6), [true, false, true, true, false, false]);
  for (const r of p.rows) {
    assert.equal(r.steps.length, 16);
    assert.ok(r.steps.every((s) => typeof s === 'boolean'));
  }
  assert.ok(p.rows[1].steps.every((s) => s === false));
});

test('cleanPattern: no more than 16 rows, and a row with a bad sound id keeps its steps', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ clipId: i === 0 ? 42 : 'c' + i, steps: [true] }));
  const p = cleanPattern({ rows }, 'x');
  assert.equal(p.rows.length, 16);
  assert.equal(p.rows[0].clipId, null);
  assert.equal(p.rows[0].steps[0], true);
});

test('cleanPattern: rows that are not objects become empty rows, a long sound id is cut', () => {
  const p = cleanPattern({ rows: [null, 5, 'x', { clipId: 'z'.repeat(200) }] }, 'x');
  assert.equal(p.rows.length, 4);
  assert.equal(p.rows[0].clipId, null);
  assert.equal(p.rows[3].clipId.length, 64);
  assert.equal(cleanPattern({ rows: 'nope' }, 'x').rows.length, 0);
});

test('cleanPattern: names are cut to 24 characters and only strings are kept', () => {
  assert.equal(cleanPattern({ name: 'a'.repeat(40) }, 'x').name.length, 24);
  assert.equal(cleanPattern({ name: 5 }, 'x').name, '');
});

test('cleanPattern: the person is the caller\'s, not the file\'s', () => {
  assert.equal(cleanPattern({ personId: 'someone-else' }, 'pip').personId, 'pip');
});

test('cleanPattern does not change what it is given', () => {
  const raw = { bpm: 999, rows: [{ clipId: 'a', steps: [true] }] };
  const copy = structuredClone(raw);
  cleanPattern(raw, 'x');
  assert.deepEqual(raw, copy);
});

// ── encodeWav ──

const read = async (blob) => new DataView(await blob.arrayBuffer());
const tag = (v, at) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

test('encodeWav writes a 16-bit PCM header that matches the audio', async () => {
  const blob = encodeWav(fakeBuffer([[0, 0.5, -0.5, 1], [0, 0.25, -0.25, -1]], 44100));
  assert.equal(blob.type, 'audio/wav');
  const v = await read(blob);
  assert.equal(blob.size, 44 + 4 * 2 * 2);
  assert.equal(tag(v, 0), 'RIFF');
  assert.equal(v.getUint32(4, true), blob.size - 8);
  assert.equal(tag(v, 8), 'WAVE');
  assert.equal(tag(v, 12), 'fmt ');
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1);          // PCM
  assert.equal(v.getUint16(22, true), 2);          // channels
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 44100 * 2 * 2);  // byte rate
  assert.equal(v.getUint16(32, true), 4);          // block align
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(tag(v, 36), 'data');
  assert.equal(v.getUint32(40, true), 4 * 2 * 2);
});

test('encodeWav interleaves channels and scales samples to 16 bits', async () => {
  const v = await read(encodeWav(fakeBuffer([[0, 0.5, -0.5, 1], [0, 0.25, -0.25, -1]])));
  const at = (frame, ch) => v.getInt16(44 + (frame * 2 + ch) * 2, true);
  assert.equal(at(0, 0), 0);
  assert.equal(at(1, 0), Math.trunc(0.5 * 0x7fff));
  assert.equal(at(1, 1), Math.trunc(0.25 * 0x7fff));
  assert.equal(at(2, 0), -0x4000);
  assert.equal(at(3, 0), 0x7fff);
  assert.equal(at(3, 1), -0x8000);
});

test('encodeWav clamps samples outside -1..1 instead of wrapping', async () => {
  const v = await read(encodeWav(fakeBuffer([[2.5, -7]])));
  assert.equal(v.getInt16(44, true), 0x7fff);
  assert.equal(v.getInt16(46, true), -0x8000);
});

test('encodeWav handles mono and an empty buffer', async () => {
  const mono = await read(encodeWav(fakeBuffer([[0.1, 0.2, 0.3]])));
  assert.equal(mono.getUint16(22, true), 1);
  assert.equal(mono.getUint32(40, true), 6);
  const empty = encodeWav(fakeBuffer([[]]));
  assert.equal(empty.size, 44);
});

test('mergeGroove: adds hits to the same sound\'s row, new sounds get rows, nothing turns off, every bar filled', () => {
  const on = (...i) => Array.from({ length: 16 }, (_, k) => i.includes(k));
  const rows = [cleanRow({ clipId: 'kick', steps: on(0, 2) }), cleanRow({ clipId: 'snare', steps: on(4), melody: true })];
  const { rows: out, added } = mergeGroove(rows, [{ clipId: 'kick', steps: on(0, 8) }, { clipId: 'snare', steps: on(12) }], 16, 2);
  const lit = (r) => r.steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(lit(out[0]), [0, 2, 8, 16, 24], 'kept 2; added 8 and both of bar 2');
  assert.equal(out.length, 3, 'a melody row is left alone: the snare gets a row of its own');
  assert.deepEqual(lit(out[2]), [12, 28]);
  assert.equal(added, 5);
  assert.deepEqual(lit(rows[0]), [0, 2], 'the rows passed in are not changed');
});

test('mergeGroove: a 3/4 bar takes the start of the groove; a full beat gets no more rows', () => {
  const on = (...i) => Array.from({ length: 16 }, (_, k) => i.includes(k));
  assert.deepEqual(mergeGroove([], [{ clipId: 'k', steps: on(0, 12) }], 12, 1).rows[0].steps.slice(0, 13).map(Number), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const full = Array.from({ length: 16 }, (_, i) => cleanRow({ clipId: `r${i}` }));
  assert.equal(mergeGroove(full, [{ clipId: 'new', steps: on(0) }], 16, 1).rows.length, 16);
});

test('balancedColumns: a bar wraps evenly in every time signature, and its groups line up', () => {
  const lines = (sig, width) => {
    const cols = balancedColumns(SIGNATURES[sig], width);
    const per = cols.length;
    const n = SIGNATURES[sig].length;
    return Array.from({ length: Math.ceil(n / per) }, (_, l) => Math.min(per, n - l * per));
  };
  assert.deepEqual(lines('4/4', 2000), [4], 'room for all: one line');
  assert.deepEqual(lines('4/4', 500), [2, 2], 'never 3 + 1');
  assert.deepEqual(lines('4/4', 200), [1, 1, 1, 1]);
  assert.deepEqual(lines('5/4', 600), [3, 2]);
  assert.deepEqual(lines('3/4', 400), [2, 1]);
  assert.deepEqual(lines('6/8', 300), [1, 1]);
  assert.deepEqual(lines('7/8', 400), [2, 1]);
  assert.deepEqual(balancedColumns([4, 4, 6], 400), [6, 4], 'a column is as wide as its widest group: 6 pills, then 4');
  assert.deepEqual(balancedColumns([4, 4, 6], 2000), [4, 4, 6]);
  assert.deepEqual(balancedColumns([4, 4, 4, 4], 0), [4, 4, 4, 4], 'no width yet: one line');
});

test('beat file: kit sounds travel by their kit id; recorded sounds stay behind and are counted', () => {
  const on = (...i) => Array.from({ length: 16 }, (_, k) => i.includes(k));
  const beat = cleanPattern({ id: 'beat-abc', name: 'Disco', bpm: 120, bars: 2, swing: 33, signature: '3/4', rows: [
    { clipId: 'pip-kick', steps: on(0, 4), accents: on(0) },
    { clipId: 'user-123', steps: on(2) },
    { clipId: null, steps: on(8) },
    { clipId: 'p-mv3-x9-snare', steps: on(4), muted: true },
  ] }, 'pip');
  const { file, dropped } = beatToFile(beat, ['kick', 'snare', 'hihat']);
  assert.equal(dropped, 1, 'the recorded sound');
  assert.equal(file.format, BEAT_FILE);
  assert.equal(BEAT_FILE, 'noodlepads-beat');
  assert.equal(beatFromFile(JSON.stringify({ ...file, format: 'noodle-pads-beat' }), 'juno', ['kick']).name, 'Disco', 'a file saved before the 1.0 rename opens');
  assert.equal(file.version, 1);
  assert.equal('id' in file, false, 'no id: a loaded beat gets its own');
  assert.deepEqual(file.rows.map((r) => r.sound), ['kick', null, 'snare'], 'a person id with dashes still finds the kit sound');
  assert.equal(file.signature, '3/4');
  const back = beatFromFile(JSON.stringify(file), 'juno', ['kick', 'snare', 'hihat']);
  assert.deepEqual(back.rows.map((r) => r.clipId), ['juno-kick', null, 'juno-snare'], 'onto this person\'s own kit');
  assert.deepEqual(back.rows[0].steps.slice(0, 5), [true, false, false, false, true]);
  assert.equal(back.rows[0].accents[0], true);
  assert.equal(back.rows[2].muted, true);
  assert.equal(back.bpm, 120);
  assert.equal(back.bars, 2);
  assert.equal(back.swing, 33);
  assert.equal(back.name, 'Disco');
});

test('beat file: anything else is refused with a plain reason; unknown kit sounds are dropped', () => {
  const kit = ['kick'];
  assert.throws(() => beatFromFile('not json', 'pip', kit), /isn’t a beat file/);
  assert.throws(() => beatFromFile(JSON.stringify({ format: 'something-else', version: 1, rows: [] }), 'pip', kit), /isn’t a beat file/);
  assert.throws(() => beatFromFile('x'.repeat(70 * 1024), 'pip', kit), /too big/);
  const odd = beatFromFile(JSON.stringify({ format: BEAT_FILE, version: 1, id: 'beat-taken', bpm: 9999, rows: [{ sound: 'laser-of-doom', steps: [true] }, { sound: 'kick', steps: [true], evil: '<script>' }] }), 'pip', kit);
  assert.deepEqual(odd.rows.map((r) => r.clipId), ['pip-kick']);
  assert.equal('evil' in odd.rows[0], false);
  assert.equal(odd.bpm, 180, 'clamped');
});

test('rowSlot: a new sound gets a new row while there is room; a full beat reuses an empty row in place', () => {
  const row = (on) => cleanRow({ clipId: 'x', steps: on ? [true] : [] });
  assert.equal(rowSlot([row(true), row(false)], 16), 2, 'room: a new row at the end');
  const full = [row(true), row(false), row(true), row(false)];
  assert.equal(rowSlot(full, 4), 1, 'full: the first row with no hits');
  assert.equal(rowSlot(full, 4, new Set([1])), 3, 'but not one being recorded into right now');
  assert.equal(rowSlot([row(true), row(true)], 2), -1, 'every row has hits: no room');
});
