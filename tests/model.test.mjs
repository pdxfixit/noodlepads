import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PERSON_COLORS, mergePeople, colorName, padColor, orderClips, clipsForPerson,
  overrideFor, withHidden, personEditRecord, nextPersonColor, validateManifest, personColor,
} from '../web/model.js';
import { PICTURES, pictureTakenBy, overrideWithEmoji } from '../web/model.js';
import { isFunName, FUN_NAMES } from '../web/names.js';
import { groupKit, openKitGroups, isKitClip, kitFor, boardTitle, ownSoundsTitle, soloPerson, adoptPeople, personIdsIn, kitIdOf, isDefaultPerson, SOLO_NAME, SOLO_COLOR } from '../web/model.js';
import { whiteReadsOn } from '../web/contrast.js';
import { testManifest } from './test-board.mjs';

const boards = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
const palette = boards.palette;
const people = [
  { id: 'pip', name: 'Pip', color: '#1F3FA8', clips: [
    { id: 'c1', label: 'One', emoji: '1️⃣', color: 'red', file: 'clips/1.wav' },
    { id: 'c2', label: 'Two', emoji: '2️⃣', color: 'blue', file: 'clips/2.wav', voice: 'slow', amount: 4 },
    { id: 'c3', label: 'Three', color: 'sunflower', file: 'clips/3.wav' },
  ] },
  { id: 'juno', name: 'Juno', color: '#0C5E4B', clips: [] },
];
const edits = (...records) => new Map(records.map((r) => [r.id, r]));

// ── people ──

test('mergePeople: boards.json people come first, untouched when there are no edits', () => {
  const out = mergePeople(people, edits());
  assert.deepEqual(out.map((p) => [p.id, p.name, p.color, p.hidden, p.added]), [
    ['pip', 'Pip', '#1F3FA8', false, false],
    ['juno', 'Juno', '#0C5E4B', false, false],
  ]);
  assert.equal(out[0].clips.length, 3);
});

test('mergePeople: renames, recolors and hides apply to boards.json people', () => {
  const out = mergePeople(people, edits({ id: 'pip', name: 'Pipsqueak', color: '#9E1640' }, { id: 'juno', hidden: true }));
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].name, out[0].color], ['Pipsqueak', '#9E1640']);
  const all = mergePeople(people, edits({ id: 'juno', hidden: true }), { includeHidden: true });
  assert.deepEqual(all.map((p) => [p.id, p.hidden]), [['pip', false], ['juno', true]]);
});

test('mergePeople: a name edit with only some fields keeps the rest from the file', () => {
  const [pip] = mergePeople(people, edits({ id: 'pip', name: 'C' }));
  assert.deepEqual([pip.name, pip.color], ['C', '#1F3FA8']);
});

test('mergePeople: added people follow, oldest first, with no bundled clips', () => {
  const out = mergePeople(people, edits(
    { id: 'p-b', name: 'Bea', color: '#333040', added: true, created: 20 },
    { id: 'p-a', name: 'Abe', color: '#6B2F6B', added: true, created: 10, hidden: true },
  ), { includeHidden: true });
  assert.deepEqual(out.map((p) => p.id), ['pip', 'juno', 'p-a', 'p-b']);
  assert.deepEqual(out[2].clips, []);
  assert.equal(out[2].added, true);
  assert.equal(out[2].hidden, true);
  assert.equal(mergePeople(people, edits({ id: 'p-a', name: 'Abe', color: '#6B2F6B', added: true, created: 10, hidden: true })).length, 2);
});

test('mergePeople does not modify its inputs', () => {
  const copy = structuredClone(people);
  mergePeople(people, edits({ id: 'pip', name: 'X', hidden: true }));
  assert.deepEqual(people, copy);
});

test('personEditRecord: a bundled person keeps only what differs, and nothing differing deletes the record', () => {
  const base = people[0];
  assert.deepEqual(personEditRecord(base, { id: 'pip' }, { name: 'Pipsqueak' }), { id: 'pip', name: 'Pipsqueak' });
  assert.deepEqual(personEditRecord(base, { id: 'pip', name: 'Pipsqueak' }, { color: '#9E1640' }), { id: 'pip', name: 'Pipsqueak', color: '#9E1640' });
  assert.deepEqual(personEditRecord(base, { id: 'pip', name: 'Pipsqueak' }, { name: 'Pip' }), null);  // back to the file's
  assert.deepEqual(personEditRecord(base, { id: 'pip', color: '#9E1640' }, { color: '#1F3FA8' }), null);
  assert.deepEqual(personEditRecord(base, { id: 'pip' }, { name: '' }), null);  // a blank name is not a name
  assert.deepEqual(personEditRecord(base, { id: 'pip' }, { hidden: true }), { id: 'pip', hidden: true });
  assert.deepEqual(personEditRecord(base, { id: 'pip', hidden: true }, { hidden: false }), null);
});

test('personEditRecord: an added person stores everything and is never deleted by this; a new name or color is stamped', () => {
  const current = { id: 'p-a', name: 'Abe', color: '#333040', added: true, created: 5 };
  assert.deepEqual(personEditRecord(undefined, current, { name: 'Abe Jr' }, 77), { ...current, name: 'Abe Jr', edited: 77 });
  assert.equal(personEditRecord(undefined, current, { color: '#0C5E4B' }, 78).edited, 78);
  const shown = personEditRecord(undefined, current, { hidden: false }, 79);
  assert.equal(shown.hidden, false);
  assert.equal(shown.edited, undefined, 'bringing someone back is not an edit');
});

test('isDefaultPerson: only the automatic first person (or an older copy\'s Me), never renamed or recolored, with nothing of theirs', () => {
  const me = soloPerson('p-me-1', 5);
  assert.equal(isDefaultPerson(me, new Set()), true);
  assert.equal(isDefaultPerson(me, new Set(['p-me-1'])), false, 'something of theirs is stored');
  assert.equal(isDefaultPerson({ ...me, edited: 9 }, new Set()), false, 'renamed (even back to Me) or recolored');
  assert.equal(isDefaultPerson({ ...me, name: 'Ada', solo: undefined }, new Set()), false, "not the app's own");
  assert.equal(isDefaultPerson({ ...me, hidden: true }, new Set()), false);
  assert.equal(isDefaultPerson({ ...me, added: undefined }, new Set()), false);
  assert.equal(isDefaultPerson({ id: 'p-old', name: SOLO_NAME, color: SOLO_COLOR, added: true, created: 1 }, new Set()), true, "an older copy's Me");
  assert.equal(isDefaultPerson({ id: 'p-x', name: 'Friendly Sloth', added: true, created: 1 }, new Set()), false, 'a person someone added');
  assert.notEqual(soloPerson('p-x').id, soloPerson('p-y').id, 'each device makes its own id (app.js passes newId)');
});

test('nextPersonColor: the first unused color, ignoring case, else the first', () => {
  assert.equal(nextPersonColor([]), PERSON_COLORS[0]);
  assert.equal(nextPersonColor([PERSON_COLORS[0].toLowerCase(), PERSON_COLORS[1].toLowerCase()]), PERSON_COLORS[2]);
  assert.equal(nextPersonColor(PERSON_COLORS), PERSON_COLORS[0]);
});

test('every selectable person color carries white text', () => {
  for (const c of PERSON_COLORS) assert.ok(whiteReadsOn(c), c);
});

// ── colors ──

test('colorName: current names pass, old names migrate, anything else is unchanged', () => {
  assert.equal(colorName(palette, 'red'), 'red');
  assert.equal(colorName(palette, 'tomato'), 'red');
  assert.equal(colorName(palette, 'sunflower'), 'yellow');
  assert.equal(colorName(palette, 'mint'), 'teal');
  assert.equal(colorName(palette, 'sky'), 'blue');
  assert.equal(colorName(palette, 'grape'), 'blue');
  assert.equal(colorName(palette, 'bubblegum'), 'pink');
  assert.equal(colorName(palette, 'lime'), 'lime');
  assert.equal(colorName(palette, 'tangerine'), 'orange');
  assert.equal(colorName(palette, '#123456'), '#123456');
  assert.equal(colorName(palette, undefined), undefined);
});

test('colorName: an old name whose replacement left the palette is unchanged', () => {
  assert.equal(colorName({ blue: '#4C8DFF' }, 'tomato'), 'tomato');
});

test('colorName does not read inherited properties as palette names', () => {
  assert.equal(colorName(palette, 'constructor'), 'constructor');
  assert.equal(colorName(palette, '__proto__'), '__proto__');
});

test('padColor: palette name, old name, valid CSS color, else the first palette color', () => {
  const supports = (c) => /^#[0-9a-f]{3,6}$/i.test(c) || c === 'rebeccapurple';
  assert.equal(padColor(palette, 'blue', supports), palette.blue);
  assert.equal(padColor(palette, 'tomato', supports), palette.red);
  assert.equal(padColor(palette, 'rebeccapurple', supports), 'rebeccapurple');
  assert.equal(padColor(palette, '#abc', supports), '#abc');
  assert.equal(padColor(palette, 'url(https://evil.example/x)', supports), palette.red);
  assert.equal(padColor(palette, 'nonsense', supports), palette.red);
  assert.equal(padColor(palette, undefined, supports), palette.red);
  assert.equal(padColor(palette, '', supports), palette.red);
  assert.equal(padColor(palette, '#abc'), palette.red);  // no supports(): nothing outside the palette passes
});

// ── clip order ──

const ids = (clips) => clips.map((c) => c.id);
const clips = (...names) => names.map((id) => ({ id }));

test('orderClips: no saved order keeps the default order', () => {
  assert.deepEqual(ids(orderClips(clips('a', 'b', 'c'))), ['a', 'b', 'c']);
  assert.deepEqual(ids(orderClips(clips('a', 'b', 'c'), [])), ['a', 'b', 'c']);
});

test('orderClips: a saved order places the clips it names', () => {
  assert.deepEqual(ids(orderClips(clips('a', 'b', 'c'), ['c', 'a', 'b'])), ['c', 'a', 'b']);
});

test('orderClips: clips the order does not name go after, in default order', () => {
  assert.deepEqual(ids(orderClips(clips('a', 'b', 'c', 'd'), ['c', 'a'])), ['c', 'a', 'b', 'd']);
});

test('orderClips: ids in the order that no longer exist are ignored', () => {
  assert.deepEqual(ids(orderClips(clips('a', 'b'), ['gone', 'b', 'also-gone', 'a'])), ['b', 'a']);
});

test('orderClips: does not change the list it is given', () => {
  const input = clips('a', 'b', 'c');
  orderClips(input, ['c']);
  assert.deepEqual(ids(input), ['a', 'b', 'c']);
});

test('clipsForPerson: bundled clips with overrides applied, then user clips oldest first', () => {
  const [pip] = mergePeople(people, edits());
  const out = clipsForPerson(pip, {
    overrides: new Map([['c1', { id: 'c1', label: 'Uno', voice: 'robot' }]]),
    userClips: [
      { id: 'u2', personId: 'pip', label: 'Newer', created: 200 },
      { id: 'u1', personId: 'pip', label: 'Older', created: 100 },
      { id: 'other', personId: 'juno', label: 'Not Pip', created: 1 },
    ],
  });
  assert.deepEqual(ids(out), ['c1', 'c2', 'c3', 'u1', 'u2']);
  assert.equal(out[0].label, 'Uno');
  assert.equal(out[0].voice, 'robot');
  assert.equal(out[0].file, 'clips/1.wav');
  assert.deepEqual(out.map((c) => c.source), ['bundled', 'bundled', 'bundled', 'user', 'user']);
  assert.ok(out.every((c) => c.personId === 'pip'));
});

test('clipsForPerson: saved order, new sounds at the end, hidden left out unless asked for', () => {
  const [pip] = mergePeople(people, edits());
  const args = {
    overrides: new Map([['c2', { id: 'c2', hidden: true }]]),
    userClips: [{ id: 'u1', personId: 'pip', created: 1 }],
    order: ['u1', 'c3'],
  };
  assert.deepEqual(ids(clipsForPerson(pip, args)), ['u1', 'c3', 'c1']);
  assert.deepEqual(ids(clipsForPerson(pip, { ...args, includeHidden: true })), ['u1', 'c3', 'c1', 'c2']);
});

test('clipsForPerson: a person added in the app has only their own sounds', () => {
  const [, , nana] = mergePeople(people, edits({ id: 'p-n', name: 'Nana', color: '#333040', added: true, created: 1 }));
  const out = clipsForPerson(nana, { overrides: new Map(), userClips: [{ id: 'u1', personId: 'p-n', created: 1 }, { id: 'u2', personId: 'pip', created: 1 }] });
  assert.deepEqual(ids(out), ['u1']);
});

// The kit as one board's copy: C, C♯ (Advanced only), D, then a drum.
const SHARP_KIT = [
  { id: 'note-c', file: 'c.wav', group: 'notes' }, { id: 'note-cs', file: 'cs.wav', group: 'notes', advanced: true },
  { id: 'note-d', file: 'd.wav', group: 'notes' }, { id: 'kick', file: 'k.wav', group: 'drums' },
];

test('clipsForPerson: Advanced-only presets show only when asked for', () => {
  const [pip] = mergePeople(people, edits(), { kit: SHARP_KIT });
  const args = { overrides: new Map(), userClips: [] };
  assert.deepEqual(ids(clipsForPerson(pip, { ...args, advanced: false })), ['c1', 'c2', 'c3', 'pip-note-c', 'pip-note-d', 'pip-kick']);
  assert.deepEqual(ids(clipsForPerson(pip, { ...args, advanced: true })), ['c1', 'c2', 'c3', 'pip-note-c', 'pip-note-cs', 'pip-note-d', 'pip-kick']);
  assert.deepEqual(ids(clipsForPerson(pip, args)), ids(clipsForPerson(pip, { ...args, advanced: true })), 'all of them unless told otherwise');
});

test('clipsForPerson: a preset new to a saved order goes after the one before it in boards.json, in its group', () => {
  const [pip] = mergePeople(people, edits(), { kit: SHARP_KIT });
  const args = { overrides: new Map(), userClips: [], order: ['pip-note-d', 'pip-note-c', 'c1'] };
  // Saved before C♯ existed, with D dragged ahead of C: C♯ follows C.
  assert.deepEqual(ids(clipsForPerson(pip, args)), ['pip-note-d', 'pip-note-c', 'pip-note-cs', 'c1', 'c2', 'c3', 'pip-kick']);
  // With C not in the order (its group was closed), C♯ goes last with the rest, in boards.json order.
  assert.deepEqual(ids(clipsForPerson(pip, { ...args, order: ['c3'] })), ['c3', 'c1', 'c2', 'pip-note-c', 'pip-note-cs', 'pip-note-d', 'pip-kick']);
});

test('the sharps and flats: Advanced only, named both ways, in keyboard order in Notes and Bass', () => {
  const own = boards.kit.filter((k) => !k.inst);   // each group's own sound; every instrument has the same (instruments.test.mjs)
  const extra = own.filter((k) => k.advanced);
  assert.equal(extra.length, 20);
  for (const k of extra) {
    assert.match(k.id, /^[a-z0-9-]+$/, 'ids are ASCII');
    assert.ok(['notes', 'chords', 'bass'].includes(k.group), k.id);
  }
  // Every sharp names its flat too, so kids learn both names.
  for (const k of extra.filter((x) => x.group !== 'chords')) assert.match(k.label, /^(Bass )?[A-G]♯ · [A-G]♭$/, k.id);
  const bass = own.filter((k) => k.group === 'bass').map((k) => k.label.replace('Bass ', '').split(' ')[0]);
  assert.deepEqual(bass, ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯']);
  // Enough chords to play songs in G, D, F and B♭ (and A).
  const chords = new Set(own.filter((k) => k.group === 'chords').map((k) => k.label.replace(' chord', '')));
  for (const key of [['G', 'C', 'D', 'Em', 'Am', 'Bm'], ['D', 'G', 'A', 'Bm', 'F♯m', 'Em'], ['F', 'B♭', 'C', 'Dm', 'Gm', 'Am'], ['B♭', 'E♭', 'F', 'Gm', 'Cm', 'Dm'], ['A', 'D', 'E', 'F♯m', 'Bm', 'C♯m']]) {
    for (const c of key) assert.ok(chords.has(c), `${c} (key of ${key[0]})`);
  }
  // Everything Advanced off shows is as it was before them.
  assert.equal(own.filter((k) => !k.advanced && ['notes', 'chords', 'bass'].includes(k.group)).length, 21);
});

test('validateManifest: "advanced" is true or false', () => {
  const m = testManifest();
  m.kit[0].advanced = true;
  assert.equal(validateManifest(m), null);
  m.kit[0].advanced = 'yes';
  assert.match(validateManifest(m), /"advanced" that isn't true or false/);
});

// ── override diffing ──

const base = people[0].clips[1];  // Two: blue, voice slow, amount 4
const same = { label: 'Two', emoji: '2️⃣', color: 'blue', voice: 'slow', amount: 4 };

test('overrideFor: nothing changed stores nothing but the id', () => {
  assert.deepEqual(overrideFor(base, undefined, same, palette), { id: 'c2' });
});

test('overrideFor: only changed fields are stored', () => {
  assert.deepEqual(overrideFor(base, undefined, { ...same, label: 'Deux', color: 'red' }, palette), { id: 'c2', label: 'Deux', color: 'red' });
  assert.deepEqual(overrideFor(base, undefined, { ...same, emoji: '🐸' }, palette), { id: 'c2', emoji: '🐸' });
});

test('overrideFor: Tweaks are stored on a bundled sound, only what moved; all normal stores none', () => {
  assert.deepEqual(overrideFor(base, undefined, { ...same, tweaks: { pitch: -5, speed: 0, echo: 0, volume: 0, warble: 0, backwards: false } }, palette), { id: 'c2', tweaks: { pitch: -5 } });
  assert.deepEqual(overrideFor(base, { id: 'c2', tweaks: { pitch: -5 } }, { ...same, tweaks: { pitch: 0 } }, palette), { id: 'c2' }, '↩️ No tweaks');
});

test('overrideFor: a trim is stored on a bundled sound, and no trim (or a junk one) stores none', () => {
  assert.deepEqual(overrideFor(base, undefined, { ...same, trim: { start: 0.1, end: 0.9 } }, palette), { id: 'c2', trim: { start: 0.1, end: 0.9 } });
  assert.deepEqual(overrideFor(base, { id: 'c2', trim: { start: 0.1, end: 0.9 } }, { ...same, trim: null }, palette), { id: 'c2' }, 'Undo back to the automatic trim');
  assert.deepEqual(overrideFor(base, undefined, { ...same, trim: { start: 1, end: 0 } }, palette), { id: 'c2' });
});

test('overrideFor: the wave editor\'s edits and fade are stored on a bundled sound; none (or junk) stores none', () => {
  const edits = [{ kind: 'reverse', start: 0.1, end: 0.4 }];
  assert.deepEqual(overrideFor(base, undefined, { ...same, edits, fade: { in: 0.2, out: 0 } }, palette), { id: 'c2', edits, fade: { in: 0.2, out: 0 } });
  assert.deepEqual(overrideFor(base, { id: 'c2', edits }, { ...same, edits: null, fade: null }, palette), { id: 'c2' }, 'Undo back to none');
  assert.deepEqual(overrideFor(base, undefined, { ...same, edits: [{ kind: 'zap' }], fade: { in: 0, out: 0 } }, palette), { id: 'c2' });
});

test('overrideFor: a blank label means the file\'s label', () => {
  assert.deepEqual(overrideFor(base, undefined, { ...same, label: '' }, palette), { id: 'c2' });
});

test('overrideFor: a voice change stores the voice, and its amount when that differs', () => {
  assert.deepEqual(overrideFor(base, undefined, { ...same, voice: 'chipmunk', amount: 2 }, palette), { id: 'c2', voice: 'chipmunk', amount: 2 });
  // Back to Normal, which has no amount.
  assert.deepEqual(overrideFor(base, undefined, { ...same, voice: 'normal', amount: null }, palette), { id: 'c2', voice: 'normal' });
});

test('overrideFor: an amount equal to the one that plays anyway is not stored', () => {
  const plain = { id: 'p', label: 'P', file: 'x' };           // no voice in the file
  assert.deepEqual(overrideFor(plain, undefined, { label: 'P', emoji: undefined, color: undefined, voice: 'slow', amount: 6 }, palette), { id: 'p', voice: 'slow' });  // 6 is Slow's default
  assert.deepEqual(overrideFor(plain, undefined, { label: 'P', emoji: undefined, color: undefined, voice: 'slow', amount: 8 }, palette), { id: 'p', voice: 'slow', amount: 8 });
  assert.deepEqual(overrideFor(base, undefined, { ...same, amount: 4.0 }, palette), { id: 'c2' });
});

test('overrideFor: a file color that is an old name counts as its current name', () => {
  const old = { id: 'o', label: 'O', color: 'tomato', file: 'x' };
  assert.deepEqual(overrideFor(old, undefined, { label: 'O', emoji: undefined, color: 'red', voice: 'normal' }, palette), { id: 'o' });
});

test('overrideFor: a chain of voices is stored as fx, its first voice as voice; a chain of one is not', () => {
  const fx = [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'stadium' }];
  assert.deepEqual(overrideFor(base, undefined, { ...same, voice: 'chipmunk', amount: 2, fx }, palette), { id: 'c2', voice: 'chipmunk', amount: 2, fx });
  assert.deepEqual(overrideFor(base, undefined, { ...same, fx: [fx[0]] }, palette), { id: 'c2' });
});

test('overrideFor keeps an existing hidden flag', () => {
  assert.deepEqual(overrideFor(base, { id: 'c2', hidden: true, label: 'stale' }, same, palette), { id: 'c2', hidden: true });
});

test('withHidden sets or clears the flag, keeping the other edits', () => {
  assert.deepEqual(withHidden(undefined, 'c1', true), { id: 'c1', hidden: true });
  assert.deepEqual(withHidden({ id: 'c1', label: 'X', hidden: true }, 'c1', false), { id: 'c1', label: 'X' });
});

// ── boards.json ──

test('the real boards.json is valid', () => {
  assert.equal(validateManifest(boards), null);
});

test('validateManifest names what is wrong', () => {
  const ok = () => testManifest();   // with people, so their checks run too
  const bad = (edit) => { const m = ok(); edit(m); return validateManifest(m); };
  assert.match(validateManifest(null), /no "people"/);
  assert.equal(validateManifest({ ...testManifest(), people: [] }), null, 'no people is fine: a new device adds Me');
  assert.match(validateManifest({ ...testManifest(), people: 'all' }), /no "people"/);
  assert.match(bad((m) => { delete m.palette; }), /no "palette"/);
  assert.match(bad((m) => { m.palette.red = 'javascript:alert(1)'; }), /palette color "red"/);
  assert.match(bad((m) => { delete m.people[0].name; }), /missing "id", "name" or "color"/);
  assert.match(bad((m) => { m.people[0].color = '#FFFFFF'; }), /dark enough for white text/);
  assert.match(bad((m) => { m.people[0].color = 'blue'; }), /dark enough for white text/);
  assert.match(bad((m) => { delete m.people[0].clips; }), /no "clips"/);
  assert.match(bad((m) => { delete m.people[0].clips[0].file; }), /missing "id" or "file"/);
  assert.match(bad((m) => { m.people[1].clips[0].id = m.people[0].clips[0].id; }), /used twice/);
  assert.match(bad((m) => { m.people[0].clips[0].voice = 'nope'; }), /unknown voice/);
  assert.match(bad((m) => { m.people[0].clips[0].amount = -1; }), /positive number/);
  assert.match(bad((m) => { m.kit = 'drums'; }), /"kit" isn't a list/);
  assert.match(bad((m) => { delete m.kit[0].file; }), /kit sound is missing/);
  assert.match(bad((m) => { m.kit[1].id = m.kit[0].id; }), /kit sound id "kick" is used twice/);
  assert.match(bad((m) => { m.kit[0].file = '../x.wav'; }), /outside this site/);
  assert.match(bad((m) => { m.kit[0].level = 3; }), /"level" that isn't a number of dB from -24 to 0/);   // only ever turned down
  assert.match(bad((m) => { m.kit[0].level = 'loud'; }), /"level"/);
  assert.equal(bad((m) => { m.kit[0].level = -6; }), null);
  // A person's own clip may not take the name of their copy of a kit sound.
  assert.match(bad((m) => { m.people[0].clips[0].id = `${m.people[0].id}-kick`; }), /used twice/);
  assert.equal(bad((m) => { delete m.kit; }), null);   // a boards.json without a kit is fine
  assert.match(bad((m) => { m.kit[0].group = 'nope'; }), /in no listed group/);
  assert.match(bad((m) => { m.kitGroups.push({ id: 'drums', name: 'Again' }); }), /listed twice/);
  assert.match(bad((m) => { delete m.kitGroups[0].name; }), /kit group is missing/);
});

test('validateManifest only lets clip files point inside the site', () => {
  const withFile = (file) => { const m = testManifest(); m.people[0].clips[0].file = file; return validateManifest(m); };
  assert.equal(withFile('clips/a.wav'), null);
  assert.equal(withFile('clips/dots..in/name.wav'), null);
  for (const file of ['https://evil.example/a.wav', '//evil.example/a.wav', '/clips/a.wav', '../a.wav', 'clips/../../a.wav', 'data:audio/wav;base64,AAAA', 'javascript:alert(1)', 'C:\\a.wav']) {
    assert.match(withFile(file), /outside this site/, file);
  }
});

test('isKitClip: a board\'s copy of the shared kit, nothing else', () => {
  assert.equal(isKitClip({ source: 'bundled', kit: true }), true);
  assert.equal(isKitClip({ source: 'bundled', file: 'clips/kit/kick.wav' }), false);   // the flag decides, not the folder
  assert.equal(isKitClip({ source: 'user', kit: true }), false);
  assert.equal(isKitClip(undefined), false);
});

test('kitFor gives each person their own copy of the kit, named after them', () => {
  const kit = [{ id: 'kick', label: 'Kick', file: 'clips/kit/kick.wav' }];
  assert.deepEqual(kitFor('juno', kit), [{ id: 'juno-kick', label: 'Kick', file: 'clips/kit/kick.wav', kitId: 'kick', kit: true }]);
  assert.deepEqual(kitFor('juno'), []);
});

test('mergePeople: every board, added people too, gets its own sounds then the kit', () => {
  const kit = [{ id: 'kick', file: 'clips/kit/kick.wav' }];
  const added = new Map([['p-1', { id: 'p-1', name: 'Zed', color: '#333040', added: true, created: 1 }]]);
  const out = mergePeople(people, added, { kit });
  assert.deepEqual(out[0].clips.map((c) => c.id).slice(-1), [`${out[0].id}-kick`]);
  assert.equal(out[0].clips.length, people[0].clips.length + 1);
  assert.deepEqual(out.at(-1).clips.map((c) => c.id), ['p-1-kick']);
});

// ── one board to start ──

test('the headline is the app for everyone: Noodle Pads (the person shows in the corner)', () => {
  const pip = { id: 'pip', name: 'Pip' };
  assert.equal(boardTitle([pip], pip), 'Noodle Pads');
  assert.equal(boardTitle([], undefined), 'Noodle Pads');
});

test('the own-sounds heading says "My sounds" when alone or still called Me', () => {
  const me = { id: 'p-1', name: 'Me' };
  const pip = { id: 'pip', name: 'Pip' };
  assert.equal(ownSoundsTitle([me], me), 'My sounds');
  assert.equal(ownSoundsTitle([pip, me], me), 'My sounds');
  assert.equal(ownSoundsTitle([pip, me], pip), 'Pip’s sounds');
});

test('soloPerson: one added board with a fun name and a picture, never "Me", which gets the kit', () => {
  const me = soloPerson('p-1', 5, () => 0);
  assert.deepEqual(me, { id: 'p-1', name: me.name, fun: true, avatar: PICTURES[0], color: SOLO_COLOR, added: true, created: 5, solo: true });
  assert.ok(isFunName(me.name) && me.name !== SOLO_NAME, me.name);
  assert.ok(PERSON_COLORS.includes(me.color) && personColor(me.color) === me.color, 'one of today\'s person colors, never an old one');
  const merged = mergePeople([], new Map([[me.id, me]]), { kit: [{ id: 'kick', file: 'k.wav' }] });
  assert.deepEqual(merged.map((p) => [p.name, p.clips.length]), [[me.name, 1]]);
});

test('the real boards.json lists no people, so a new device starts with Me alone', () => {
  assert.deepEqual(boards.people, []);
  assert.equal(validateManifest(boards), null);
});

// ── people from an older boards.json (adoptPeople) ──

const KIT_IDS = ['kick', 'snare'];
// A device as an older copy of the app left it: boards.json named "old-a",
// "old-b", "old-c" and "old-d", and the device stored only what it changed.
const oldDevice = () => ({
  people: [
    { id: 'old-a', name: 'Rocket' },                      // renamed on this device
    { id: 'old-b', color: '#0B5C7A' },                    // recolored only
    { id: 'old-c', hidden: true },                        // deleted, nothing of theirs left
    { id: 'old-d', hidden: true },                        // deleted, but a kit edit of theirs is still stored
    { id: 'p-me-1', name: 'Me', color: '#1F3FA8', added: true, created: 50 },
  ],
  clips: [{ id: 'user-1', personId: 'old-b' }, { id: 'user-2', personId: 'old-e' }],
  overrides: [{ id: 'old-d-kick', label: 'Thump' }, { id: 'old-a-airhorn', label: 'Gone' }],
  orders: [{ personId: 'old-a', ids: [] }],
  beats: [{ id: 'beat-1', personId: 'p-me-1' }],
});

test('adoptPeople: everyone with stored data becomes an added person, keeping their id', () => {
  const { add, drop } = adoptPeople(oldDevice(), { kitIds: KIT_IDS, takenNames: ['Me'], takenColors: ['#1F3FA8'] });
  assert.deepEqual(add.map((p) => [p.id, p.added, !!p.hidden]), [
    ['old-a', true, false],     // renamed on this device
    ['old-b', true, false],     // no name stored
    ['old-d', true, true],      // deleted, kept deleted (Bring back), as a kit edit is theirs
    ['old-e', true, false],     // only a recorded sound names them
  ]);
  // Ben, 2026-10-11 (Q21): the device's own name stays; anyone else gets a
  // fun name and a picture like every new person, never "Player 1".
  assert.equal(add[0].name, 'Rocket');
  assert.equal(add[0].fun, undefined, 'a name the device gave is not a made-up one');
  for (const p of add.slice(1)) {
    assert.ok(isFunName(p.name), p.name);
    assert.equal(p.fun, true, '🎲 can reroll it');
  }
  for (const p of add) assert.ok(PICTURES.includes(p.avatar), p.avatar);
  assert.equal(new Set(add.map((p) => p.name)).size, 4, 'no name doubled');
  assert.equal(new Set(add.map((p) => p.avatar)).size, 4, 'no picture doubled');
  assert.deepEqual(drop, ['old-c'], 'a bare deleted record is dropped');
  assert.equal(add.find((p) => p.id === 'old-b').color, '#0B5C7A', 'their own color stays');
  for (const p of add) assert.ok(whiteReadsOn(p.color), p.color);
  assert.equal(new Set([...add.map((p) => p.color), '#1F3FA8']).size, 5, 'new colors avoid ones in use');
  assert.deepEqual(add.map((p) => p.created), [1, 2, 3, 4], 'they sort before people added later');
});

test('adoptPeople: names in use are skipped; known and added people are left alone; nothing old, nothing to do', () => {
  // Every fun name but one taken: the one left is the one given.
  const free = 'Friendly Sloth';
  const { add } = adoptPeople({ people: [{ id: 'old-a' }] }, { takenNames: FUN_NAMES.filter((n) => n !== free), takenPictures: PICTURES.slice(1) });
  assert.equal(add[0].name, free);
  assert.equal(add[0].avatar, PICTURES[0], 'a picture nobody has');
  const renamedSame = adoptPeople({ people: [{ id: 'old-a', name: 'Me' }] }, { takenNames: ['Me'] }).add;
  assert.ok(isFunName(renamedSame[0].name), 'a stored name already in use is not doubled');
  assert.deepEqual(adoptPeople(oldDevice(), { known: new Set(['old-a', 'old-b', 'old-d', 'old-e', 'old-c']), kitIds: KIT_IDS }), { add: [], drop: [] });
  assert.deepEqual(adoptPeople({ people: [{ id: 'p-1', name: 'Ada', added: true }], clips: [{ personId: 'p-1' }] }), { add: [], drop: [] });
  assert.deepEqual(adoptPeople({}), { add: [], drop: [] });
  assert.deepEqual(adoptPeople({ clips: [{ personId: '../x' }, { personId: 'Big Bad' }, { personId: 7 }] }), { add: [], drop: [] }, 'only real person ids');
});

test('adopted people show on the board with their sounds and their copy of the kit', () => {
  const doc = oldDevice();
  const { add } = adoptPeople(doc, { kitIds: KIT_IDS, takenNames: ['Me'] });
  const stored = new Map([...doc.people.filter((p) => p.added), ...add].map((p) => [p.id, p]));
  const shown = mergePeople([], stored, { kit: KIT_IDS.map((id) => ({ id, file: `${id}.wav` })) });
  assert.deepEqual(shown.map((p) => p.id), ['old-a', 'old-b', 'old-e', 'p-me-1']);
  const b = shown.find((p) => p.id === 'old-b');
  assert.deepEqual(b.clips.map((c) => c.id), ['old-b-kick', 'old-b-snare']);
  const mine = clipsForPerson(b, { overrides: new Map(), userClips: doc.clips, order: [] });
  assert.ok(mine.some((c) => c.id === 'user-1'), 'their recorded sound is on their board');
});

test('personIdsIn: people first, then owners in a fixed order, and kit edits by their person', () => {
  assert.deepEqual(personIdsIn({
    people: [{ id: 'b' }], songs: [{ personId: 'c' }], clips: [{ personId: 'a' }, { personId: 'b' }],
    overrides: [{ id: 'd-kick' }, { id: 'stray' }],
  }, ['kick']), ['b', 'a', 'c', 'd']);
});

test('personIdsIn: a kit id that ends another names the right person, whatever the kit order', () => {
  // `go` listed before `lets-go`: an edit of p-x's Let's go is p-x's, never a person "p-x-lets".
  for (const kit of [['go', 'lets-go'], ['lets-go', 'go']]) {
    assert.deepEqual(personIdsIn({ overrides: [{ id: 'p-x-lets-go' }, { id: 'p-y-go' }] }, kit), ['p-x', 'p-y'], kit.join(' '));
    assert.equal(kitIdOf('p-x-lets-go', kit), 'lets-go');
    assert.equal(kitIdOf('p-y-go', kit), 'go');
  }
  assert.equal(kitIdOf('lets-go', ['go', 'lets-go']), 'go', 'an old plain person "lets" editing Go: no person is left by "lets-go"');
  assert.equal(kitIdOf('p-x-snare', ['go']), null);
});

// ── kit groups ──

test('groupKit: sounds in their groups, in the groups\' order, empty groups left out', () => {
  const groups = [{ id: 'drums', name: 'Drums' }, { id: 'notes', name: 'Notes' }, { id: 'game', name: 'Game' }];
  const clips = [{ id: 'a', group: 'game' }, { id: 'b', group: 'drums' }, { id: 'c', group: 'drums' }];
  assert.deepEqual(groupKit(clips, groups).map((g) => [g.id, g.clips.map((c) => c.id)]), [['drums', ['b', 'c']], ['game', ['a']]]);
});

test('groupKit: a sound in no listed group still shows, under More', () => {
  const out = groupKit([{ id: 'x', group: 'nope' }, { id: 'y' }], [{ id: 'drums', name: 'Drums' }]);
  assert.deepEqual(out.map((g) => [g.id, g.clips.length]), [['more', 2]]);
});

test('openKitGroups: what was stored, else just the first group', () => {
  const groups = [{ id: 'drums' }, { id: 'notes' }];
  assert.deepEqual([...openKitGroups(null, groups)], ['drums']);
  assert.deepEqual([...openKitGroups('["notes","game"]', groups)], ['notes', 'game']);
  assert.deepEqual([...openKitGroups('[]', groups)], []);              // everything closed is a choice, kept
  assert.deepEqual([...openKitGroups('not json', groups)], ['drums']);
  assert.deepEqual([...openKitGroups('{"a":1}', groups)], ['drums']);
});

test('the real kit: every sound is in a listed group, and each group has sounds', () => {
  const groups = boards.kitGroups;
  assert.ok(groups.length >= 8);
  const grouped = groupKit(boards.kit, groups);
  assert.equal(grouped.length, groups.length);
  assert.ok(!grouped.some((g) => g.id === 'more'));
  assert.equal(grouped.reduce((n, g) => n + g.clips.length, 0), boards.kit.length);
});

test('the presets (Ben, 2026-10-11): the old starters, a full octave of notes, Animals and Sci-fi, each clip small', () => {
  const ids = new Set(boards.kit.map((k) => k.id));
  for (const id of ['airhorn', 'laser', 'boing', 'rimshot', 'drumroll', 'tada', 'slide-whistle', 'sad-trombone']) assert.ok(ids.has(id), id);
  const inGroup = (g) => boards.kit.filter((k) => k.group === g && !k.inst).map((k) => k.id);   // the group's own sound
  // A full octave, with its sharps and flats (Advanced only) in keyboard order.
  assert.deepEqual(inGroup('notes'), ['note-c', 'note-cs', 'note-d', 'note-ds', 'note-e', 'note-f', 'note-fs', 'note-g', 'note-gs', 'note-a', 'note-as', 'note-b', 'note-c-high']);
  assert.deepEqual(inGroup('notes').filter((id) => !boards.kit.find((k) => k.id === id).advanced),
    ['note-c', 'note-d', 'note-e', 'note-f', 'note-g', 'note-a', 'note-b', 'note-c-high']);
  for (const g of ['animals', 'sci-fi']) assert.ok(inGroup(g).length >= 6 && inGroup(g).length <= 8, g);
  // What a board loads with Advanced off stays under 5 MB; the Advanced-only
  // presets (loaded only once shown or used) may add up to 1 MB more (Ben,
  // 2026-10-17: 6 MB in all, for real instruments). Each file counts once:
  // an instrument's notes and chords all play one or two recordings (ADR 0030).
  const files = new Map();   // file -> shown with Advanced off
  for (const k of boards.kit) files.set(k.file, files.get(k.file) || !k.advanced);
  let bytes = 0, simple = 0;
  for (const [file, shown] of files) {
    const size = readFileSync(new URL(`../web/${file}`, import.meta.url)).length;
    assert.ok(size < 160 * 1024, `${file} is ${size} bytes`);
    bytes += size;
    if (shown) simple += size;
  }
  assert.ok(simple < 5 * 1024 * 1024, `the presets shown with Advanced off are ${simple} bytes in all`);
  assert.ok(bytes < 6 * 1024 * 1024, `the presets are ${bytes} bytes in all`);
});

// The one exception (Ben, 2026-10-17): an instrument's note keeps its fruit,
// a chord its weather, a bass note its animal, so "a C is a C, whoever
// plays it". The instrument shows as a badge (pads.js).
test('every kit sound has its own emoji, so a sound is told apart by its picture alone, except an instrument\'s, which has its note\'s', async () => {
  const boards = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
  const seen = new Map();
  for (const k of boards.kit.filter((x) => !x.inst)) {
    assert.ok(!seen.has(k.emoji), `${k.label} and ${seen.get(k.emoji)} share ${k.emoji}`);
    seen.set(k.emoji, k.label);
  }
  const byId = new Map(boards.kit.map((k) => [k.id, k]));
  for (const k of boards.kit.filter((x) => x.inst)) assert.equal(k.emoji, byId.get(k.plays)?.emoji, `${k.id} wears the picture of ${k.plays}`);
});

// Lookups find a person's copy of a preset by its ending, `-<kit id>`, the
// first match in boards.json order (app.js, backup.js, sequencer.js,
// starters.js): `p-x-piano-chord-c` would also end in `-chord-c`. So an
// instrument's id never ends in another kit id, and where an older one does
// (`lets-go`, `go`) the longer comes first, so it is found first.
test('no instrument\'s kit id ends in another kit id, and an older one that does comes first', () => {
  const ids = boards.kit.map((k) => k.id);
  for (const [i, id] of ids.entries()) {
    for (const [j, other] of ids.entries()) {
      if (id === other || !id.endsWith(`-${other}`)) continue;
      assert.ok(!boards.kit[i].inst, `${id} ends in -${other}`);
      assert.ok(i < j, `${id} ends in -${other}, so it must come before it`);
    }
  }
});

test('pictures: each once; a picture another sound has is found; an override changes only the emoji', async () => {
  assert.equal(new Set(PICTURES).size, PICTURES.length);
  assert.ok(PICTURES.includes('🦶') && PICTURES.includes('🥁'), 'the kit\'s own are there');
  const clips = [{ id: 'a', emoji: '🥁', label: 'Snare' }, { id: 'b', emoji: '🦶', label: 'Kick' }, { id: 'c', emoji: '🎸', hidden: true }];
  assert.equal(pictureTakenBy(clips, '🥁', 'b').label, 'Snare');
  assert.equal(pictureTakenBy(clips, '🦶', 'b'), undefined, 'its own picture is not taken');
  assert.equal(pictureTakenBy(clips, '🎸', 'b'), undefined, 'a hidden sound does not count');
  const existing = { id: 'pip-kick', label: 'Boot', voice: 'robot', trim: { start: 0, end: 1 } };
  assert.deepEqual(overrideWithEmoji({ id: 'pip-kick', emoji: '🦶' }, existing, '🐘'), { ...existing, emoji: '🐘' }, 'the rest of the override is kept');
  assert.deepEqual(overrideWithEmoji({ id: 'pip-kick', emoji: '🦶' }, { ...existing, emoji: '🐘' }, '🦶'), existing, 'back to the file\'s own: no emoji stored');
});
