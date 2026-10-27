// DJ mode's pure rules: the keymap, the default sounds on the keys, and the
// forgiving snap from docs/design/dj-mode.md § 4 (its worked examples, row by row).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_ROWS, KEY_CODES, fallbackLabel, defaultDeck, snapHits } from '../web/rhythm.js';
import { countAt, keyboardOrder } from '../web/rhythm.js';

test('40 keys in four rows of ten, the number row on top, by physical position, with US labels to fall back on', () => {
  assert.equal(KEY_CODES.length, 40);
  assert.ok(KEY_ROWS.every((r) => r.length === 10));
  assert.equal(new Set(KEY_CODES).size, 40);
  assert.deepEqual(KEY_ROWS[0], ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
  assert.equal(KEY_ROWS[1][0], 'KeyQ', 'Q–P under it');
  assert.deepEqual(['Digit1', 'Digit0', 'KeyQ', 'KeyA', 'Semicolon', 'Comma', 'Slash', 'Enter', 'Numpad1'].map(fallbackLabel), ['1', '0', 'Q', 'A', ';', ',', '/', '', '']);
});

const kit = (ids, group = 'drums') => ids.map((kitId) => ({ id: `juno-${kitId}`, kitId, group }));
const KIT = [
  ...kit(['kick', 'snare', 'hihat', 'clap', 'open-hat', 'tom-low', 'tom-high', 'crash', 'rim', 'shaker', 'conga']),
  ...kit(['bass-c', 'bass-f', 'bass-g', 'bass-a'], 'bass'), ...kit(['chord-c', 'chord-am', 'chord-f', 'chord-g'], 'chords'),
  ...kit(['scratch', 'explosion', 'ding', 'tada'], 'effects'),
  ...kit(['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high'], 'notes'), ...kit(['lets-go', 'oh-yeah', 'drop-the-beat', 'nice', 'wow', 'yes', 'go', 'ready', 'level-up', 'boom-word'], 'voices'),
];

test('the default keys: own sounds then voices on top, drums on the home row, bass and chords below', () => {
  const deck = defaultDeck([{ id: 'u1' }, { id: 'u2' }], KIT);
  assert.deepEqual(KEY_ROWS[1].map((c) => deck[c]).slice(0, 4), ['u1', 'u2', 'juno-lets-go', 'juno-oh-yeah']);
  assert.equal(deck.KeyA, 'juno-kick');
  assert.equal(deck.KeyS, 'juno-snare');
  assert.equal(deck.KeyZ, 'juno-bass-c');
  assert.equal(deck.Slash, 'juno-explosion');
  assert.equal(Object.keys(deck).length, 40);
});

test('the default number row: a scale from C to high C, then two effects', () => {
  const deck = defaultDeck([{ id: 'u1' }], KIT);
  assert.deepEqual(KEY_ROWS[0].map((c) => deck[c]), ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high', 'ding', 'tada'].map((k) => `juno-${k}`));
  assert.equal(deck.KeyQ, 'u1', 'the kid\'s own sounds stay on the top letter row');
});

test('a hidden kit sound is replaced by the next unused one from its group', () => {
  const deck = defaultDeck([], KIT.map((k) => (k.kitId === 'snare' ? { ...k, hidden: true } : k)));
  assert.notEqual(deck.KeyS, 'juno-snare');
  assert.equal(KIT.find((k) => k.id === deck.KeyS).group, 'drums');
  assert.equal(new Set(Object.values(deck).filter(Boolean)).size, Object.values(deck).filter(Boolean).length, 'no sound twice');
});

test('an Advanced-only preset is never a default key, even standing in for a hidden one', () => {
  const sharp = { id: 'juno-bass-cs', kitId: 'bass-cs', group: 'bass', advanced: true };
  const kitWith = [...KIT.slice(0, 11), sharp, ...KIT.slice(11)].map((k) => (k.kitId === 'bass-c' ? { ...k, hidden: true } : k));
  const deck = defaultDeck([], kitWith);
  assert.ok(!Object.values(deck).includes('juno-bass-cs'));
  assert.equal(deck.KeyZ, 'juno-bass-f', 'the next natural stands in');
});

// 100 BPM, one bar of 4/4: a pill is 0.15 s, 16 pills, recording from t0 = 10.
const base = { t0: 10, from: 10, step: 0.15, total: 16 };
const snap = (hits, extra = {}) => snapHits({ ...base, ...extra, hits }).map(({ row, step }) => [row, step]);

test('the worked examples from the design, row by row', () => {
  assert.deepEqual(snap([{ t: 10.02, row: 0 }]), [[0, 0]], '1: nearest pill');
  assert.deepEqual(snap([{ t: 10.58, row: 0 }]), [[0, 4]], '2: nearest pill');
  assert.deepEqual(snap([{ t: 10.58, row: 0 }, { t: 10.62, row: 0 }]), [[0, 4]], '3: a quick double tap counts once');
  assert.deepEqual(snap([{ t: 9.8, row: 1 }]), [[1, 0]], '4: just before the "1" lands on the "1"');
  assert.deepEqual(snap([{ t: 9.6, row: 1 }]), [], '5: a count-in tap is not recorded');
  assert.deepEqual(snap([{ t: 10.075, row: 2 }]), [[2, 0]], '6: half way goes to the earlier pill');
  assert.deepEqual(snap([{ t: 10.55, row: 3 }, { t: 10.66, row: 3 }]), [[3, 4]], '7: one hit per pill per pass');
  assert.deepEqual(snapHits({ ...base, hits: [{ t: 12.37, row: 2 }] }).map(({ step, n }) => [step, n]), [[0, 16]], '8: just before the loop restarts → next pass\'s "1"');
  assert.deepEqual(snap([{ t: 10.3, row: 4 }], { rates: [1, 1, 1, 1, 2] }), [[4, 4]], '9: a 2× row snaps on its own pills');
});

test('more snapping: out of order, empty, a second pass, a fast roll, joining a playing beat', () => {
  assert.deepEqual(snap([]), []);
  assert.deepEqual(snap([{ t: 10.6, row: 0 }, { t: 10.0, row: 0 }]), [[0, 0], [0, 4]], 'sorted first');
  assert.deepEqual(snap([{ t: 12.4 + 0.6, row: 0 }]), [[0, 4]], 'second pass wraps');
  // At 180 BPM a pill is 0.0833 s: a real roll 0.0833 s apart still counts.
  const fast = snapHits({ t0: 0, from: 0, step: 60 / 180 / 4, total: 16, hits: [0, 1, 2].map((k) => ({ t: k * (60 / 180 / 4), row: 0 })) });
  assert.deepEqual(fast.map((h) => h.step), [0, 1, 2]);
  // Recording joined at bar 2 of a playing beat (from = t0 + 2.4 s).
  assert.deepEqual(snap([{ t: 12.3, row: 0 }], { from: 12.4 }), [[0, 0]], 'just before the join lands on its "1"');
});

test('layouts label the same 30 physical keys: Dvorak\'s home row is AOEUIDHTNS', async () => {
  const { LAYOUTS, layoutLabel } = await import('../web/rhythm.js');
  for (const rows of Object.values(LAYOUTS)) assert.deepEqual(rows.map((r) => [...r].length), [10, 10, 10, 10]);
  assert.equal(KEY_ROWS[2].map((c) => layoutLabel(c, 'dvorak')).join(''), 'AOEUIDHTNS');
  for (const l of ['qwerty', 'dvorak']) assert.equal(KEY_ROWS[0].map((c) => layoutLabel(c, l)).join(''), '1234567890', `${l}: the digits are the same`);
  assert.equal(layoutLabel('KeyQ', 'dvorak'), "'");
  assert.equal(layoutLabel('KeyS', 'qwerty'), 'S');
  assert.deepEqual(Object.keys(LAYOUTS), ['qwerty', 'dvorak'], 'AZERTY and Colemak were dropped (Ben, 2026-10-11)');
  assert.equal(layoutLabel('KeyQ', 'azerty'), null, 'a dropped layout labels nothing');
  assert.equal(layoutLabel('KeyA', 'auto'), null, 'Auto is gone too');
});

test('a take starts at its first hit, keeps events in order, and ends at Stop', async () => {
  const { takeFrom, clockText } = await import('../web/rhythm.js');
  assert.equal(takeFrom([], 10), null);
  assert.equal(takeFrom([{ at: 1, clipId: 'b', kind: 'beat' }], 10), null, 'a beat alone is not a take');
  const take = takeFrom([
    { at: 5.5, clipId: 'kick', kind: 'hit' },
    { at: 4.9, clipId: 'beat-hat', kind: 'beat' },      // before the first hit: left out
    { at: 5.0004, clipId: 'snare', kind: 'hit' },
    { at: 6, clipId: 'kick', kind: 'loop' },
    { at: 7, clipId: 'kick', kind: 'stop' },
  ], 8);
  assert.deepEqual(take.events, [
    { t: 0, clipId: 'snare', kind: 'hit' }, { t: 0.5, clipId: 'kick', kind: 'hit' },
    { t: 1, clipId: 'kick', kind: 'loop' }, { t: 2, clipId: 'kick', kind: 'stop' },
  ]);
  assert.equal(take.duration, 3, 'until Stop');
  assert.equal(takeFrom([{ at: 1, clipId: 'k', kind: 'hit' }], 100).duration, 2, 'a late Stop does not add a long silence');
  assert.deepEqual([clockText(14), clockText(65), clockText(0.4)], ['0:14', '1:05', '0:00']);
});

test('a take becomes single plays to render: loops repeat until stopped or the take ends', async () => {
  const { planTake } = await import('../web/rhythm.js');
  const take = { duration: 3, events: [
    { t: 0, clipId: 'kick', kind: 'hit' },
    { t: 0.5, clipId: 'hat', kind: 'loop' },
    { t: 1, clipId: 'gone', kind: 'hit' },        // a deleted sound: left out
    { t: 1.6, clipId: 'hat', kind: 'stop' },
    { t: 2, clipId: 'bass', kind: 'loop' },
    { t: 2.5, clipId: 'kick', kind: 'beat' },
  ] };
  const lengths = new Map([['kick', 0.3], ['hat', 0.5], ['bass', 0.4]]);
  assert.deepEqual(planTake(take, lengths), [
    { clipId: 'kick', at: 0 },
    { clipId: 'hat', at: 0.5 }, { clipId: 'hat', at: 1 }, { clipId: 'hat', at: 1.5 },
    { clipId: 'bass', at: 2 }, { clipId: 'bass', at: 2.4 },
    { clipId: 'kick', at: 2.5 },
    { clipId: 'bass', at: 2.8 },
  ]);
});

test('a picked layout matches by the letter typed, so a keyboard that remaps in its own firmware lines up', async () => {
  const { keyFor } = await import('../web/rhythm.js');
  // A Kinesis set to Dvorak in hardware, on a computer set to QWERTY: the key
  // in the home-row "S" place sends the code of QWERTY's O, and types "o".
  assert.equal(keyFor({ code: 'KeyO', key: 'o' }, 'dvorak'), 'KeyS', 'the tile labeled O');
  // The computer set to Dvorak: the place sends KeyS and types "o". Same tile.
  assert.equal(keyFor({ code: 'KeyS', key: 'o' }, 'dvorak'), 'KeyS');
  assert.equal(keyFor({ code: 'KeyQ', key: "'" }, 'dvorak'), 'KeyQ');
  assert.equal(keyFor({ code: 'KeyS', key: 'O' }, 'dvorak'), 'KeyS', 'Caps Lock or Shift: same key');
  // No layout: by place, whatever is typed.
  assert.equal(keyFor({ code: 'KeyS', key: 'o' }), 'KeyS');
  assert.equal(keyFor({ code: 'Enter', key: 'Enter' }, 'dvorak'), null);
  assert.equal(keyFor({ code: 'Digit1', key: '1' }, 'dvorak'), 'Digit1', 'the number row is one of the 40');
  assert.equal(keyFor({ code: 'Minus', key: '-' }, 'dvorak'), null, 'not one of the 40');
});

test('countAt: the count-in beat sounding now, in any time signature, then GO!', () => {
  const step = 0.15;   // a pill at 100 BPM; a beat of 4 pills is 0.6 s
  const from = 10;     // the beat starts at 10 s, after one bar of count-in
  assert.deepEqual(countAt(7.7, from, [4, 4, 4, 4], step), { n: 1, of: 4 }, 'just started');
  assert.deepEqual(countAt(8.9, from, [4, 4, 4, 4], step), { n: 3, of: 4 });
  assert.deepEqual(countAt(9.5, from, [4, 4, 4, 4], step), { n: 4, of: 4 });
  assert.equal(countAt(10.1, from, [4, 4, 4, 4], step), 'go');
  assert.equal(countAt(11, from, [4, 4, 4, 4], step), null, 'then it goes away');
  assert.deepEqual(countAt(8.9, from, [4, 4, 4], step), { n: 2, of: 3 }, '3/4 counts three');
  assert.deepEqual(countAt(9.5, from, [6, 6], step), { n: 2, of: 2 }, '6/8 counts two');
  assert.deepEqual(countAt(0, Infinity, [4, 4, 4, 4], step), { n: 1, of: 4 }, 'before the start is known');
});

test('keyboardOrder: rows by where their sound first sits on the keys, top row first; sounds on no key last, as stored', () => {
  const rows = [{ clipId: 'bass' }, { clipId: 'none1' }, { clipId: 'kick' }, { clipId: 'voice' }, { clipId: 'none2' }, { clipId: null }];
  const keys = { KeyQ: 'voice', KeyA: 'kick', KeyZ: 'bass', KeyX: 'kick' };
  assert.deepEqual(keyboardOrder(rows, keys), [3, 2, 0, 1, 4, 5]);
  assert.deepEqual(keyboardOrder(rows, {}), [0, 1, 2, 3, 4, 5], 'no keys: as stored');
  assert.deepEqual(keyboardOrder([], keys), []);
});

test('keyFor: the number keys by place, or by the digit typed with a layout picked; Shift+1 is still 1', async () => {
  const { keyFor } = await import('../web/rhythm.js');
  assert.equal(keyFor({ code: 'Digit1', key: '1' }), 'Digit1');
  assert.equal(keyFor({ code: 'Digit0', key: '0' }, 'qwerty'), 'Digit0');
  assert.equal(keyFor({ code: 'Digit5', key: '5' }, 'dvorak'), 'Digit5');
  assert.equal(keyFor({ code: 'Digit1', key: '!', shiftKey: true }, 'qwerty'), 'Digit1', 'Shift: "a pill earlier"');
  assert.equal(keyFor({ code: 'Digit1', key: '!', shiftKey: true }, 'dvorak'), 'Digit1');
  assert.equal(keyFor({ code: 'Numpad1', key: '1' }), null, 'the number pad is not the number row');
  assert.equal(keyFor({ code: 'Minus', key: '-' }, 'qwerty'), null);
});

test('cleanDeck keeps the number row; a deck from before it loads as it was', async () => {
  const { cleanDeck } = await import('../web/rhythm.js');
  const d = cleanDeck({ personId: 'p-1', keys: { Digit1: 'moo', Digit0: null, KeyA: 'kick', Numpad1: 'x' }, mine: { Digit3: 'quack', KeyS: 'snare' } });
  assert.deepEqual(d.keys, { Digit1: 'moo', Digit0: null, KeyA: 'kick' });
  assert.equal(d.mine.Digit3, 'quack');
  assert.equal(Object.keys(d.mine).length, 40);
  const old = cleanDeck({ personId: 'p-1', keys: { KeyA: 'kick' }, mine: { KeyS: 'snare' } });
  assert.deepEqual(old.keys, { KeyA: 'kick' }, 'no number keys stored: they play their defaults');
  assert.equal(old.mine.Digit1, null, 'an older ⭐ Keys has an empty number row');
});

test('cleanDeck keeps the 👆 touch layout and ⭐ Layout, cleaned; a broken one is dropped (ADR 0029)', async () => {
  const { cleanDeck } = await import('../web/rhythm.js');
  const d = cleanDeck({ personId: 'p-1', keys: {}, touch: { bands: [{ group: 'drums', size: 'l', sounds: ['kick'] }, { group: '<x>' }] }, touchMine: { bands: [] } });
  assert.deepEqual(d.touch, { bands: [{ group: 'drums', size: 'l', sounds: ['kick'] }] });
  assert.deepEqual(d.touchMine, { bands: [] });
  assert.equal('touch' in cleanDeck({ personId: 'p-1', keys: {}, touch: 'nope' }), false);
});

test('keyboardOrder: a sound on the number row comes before the letter rows', () => {
  const rows = [{ clipId: 'kick' }, { clipId: 'note' }];
  assert.deepEqual(keyboardOrder(rows, { KeyA: 'kick', Digit4: 'note' }), [1, 0]);
});

// Ben, 2026-10-16: Auto left the keyboard choices for the Q / D keycaps, so
// the browser's own layout (where it says) picks the one to start on, and a
// character that is not on the layout's picture plays its key by place.
test('detectLayout: Dvorak when the top-left letter prints an apostrophe; null with no layout map', async () => {
  const { detectLayout } = await import('../web/rhythm.js');
  assert.equal(detectLayout(new Map([['KeyQ', "'"], ['KeyS', 'o']])), 'dvorak');
  assert.equal(detectLayout(new Map([['KeyQ', 'q']])), 'qwerty');
  assert.equal(detectLayout(new Map([['KeyQ', 'a']])), 'qwerty', 'AZERTY: QWERTY, and the keys go by the letter typed');
  assert.equal(detectLayout(undefined), null, 'Safari, Firefox: nothing to ask');
});

test('keyFor: a character not on the picked layout plays its key by place', async () => {
  const { keyFor } = await import('../web/rhythm.js');
  assert.equal(keyFor({ code: 'KeyQ', key: 'й' }, 'qwerty'), 'KeyQ', 'a Cyrillic keyboard still plays');
  assert.equal(keyFor({ code: 'KeyQ', key: "'" }, 'qwerty'), 'KeyQ', 'QWERTY picked on a Dvorak computer: the apostrophe key still plays');
  assert.equal(keyFor({ code: 'Comma', key: '<', shiftKey: true }, 'qwerty'), 'Comma', 'Shift+, is still the comma key');
  assert.equal(keyFor({ code: 'KeyA', key: 'Dead' }, 'dvorak'), 'KeyA', 'a dead key, by place');
  assert.equal(keyFor({ code: 'Quote', key: "'" }, 'qwerty'), null, 'not one of the 40');
});
