import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADJECTIVES, BEAT_NOUNS, SOUND_NOUNS, TAKE_NOUNS, PERSON_NAMES, MAX_LABEL, MAX_PERSON,
  beatName, soundName, takeName, personName, FUN_TITLES, FUN_NOUNS, FUN_ADJECTIVES, FUN_ANIMALS, TITLE_NAMES, ANIMAL_NAMES, FUN_NAMES, FUN_AVOID, funName, isFunName, SPECIAL_NAMES, nameChoices,
} from '../web/names.js';

test('the word lists are big enough, and have no repeats', () => {
  assert.ok(ADJECTIVES.length >= 40 && BEAT_NOUNS.length >= 40 && SOUND_NOUNS.length >= 40 && PERSON_NAMES.length >= 20);
  for (const list of [ADJECTIVES, BEAT_NOUNS, SOUND_NOUNS, PERSON_NAMES]) {
    assert.equal(new Set(list.map((w) => w.toLowerCase())).size, list.length);
  }
});

test('every combination fits its field', () => {
  const longest = (l) => Math.max(...l.map((w) => w.length));
  assert.ok(longest(ADJECTIVES) + 1 + longest(BEAT_NOUNS) <= MAX_LABEL);
  assert.ok(longest(ADJECTIVES) + 1 + longest(SOUND_NOUNS) <= MAX_LABEL);
  assert.ok(longest(PERSON_NAMES) <= MAX_PERSON);
});

test('names are made of the lists and fit, over many random draws', () => {
  for (let i = 0; i < 300; i++) {
    const b = beatName();
    const [adj, ...rest] = b.split(' ');
    assert.ok(ADJECTIVES.includes(adj) && BEAT_NOUNS.includes(rest.join(' ')), b);
    assert.ok(b.length <= MAX_LABEL && soundName().length <= MAX_LABEL && personName().length <= MAX_PERSON);
  }
});

test('a name already in use is not picked again, whatever the dice say', () => {
  const first = beatName([], () => 0);
  for (const roll of [0, 0.5, 0.999]) {
    assert.notEqual(beatName([first], () => roll), first);
  }
  const sound = soundName([], () => 0);
  assert.notEqual(soundName([sound.toUpperCase()], () => 0), sound, 'case does not matter');
});

test('when every name is used, a number is added instead of repeating', () => {
  const all = [];
  let n;
  do { n = personName(all, () => 0); all.push(n); } while (!/ \d+$/.test(n));
  assert.equal(all.length, PERSON_NAMES.length + 1);
  const next = personName(all, () => 0);
  assert.ok(!all.includes(next) && next.length <= MAX_PERSON);
});

test('a run of names for one library never repeats', () => {
  const taken = [];
  for (let i = 0; i < 200; i++) taken.push(beatName(taken));
  assert.equal(new Set(taken).size, 200);
});

test('take names: a big list, every combination fits, and none repeats in a run', () => {
  assert.ok(TAKE_NOUNS.length >= 40);
  assert.equal(new Set(TAKE_NOUNS).size, TAKE_NOUNS.length);
  const longest = (l) => Math.max(...l.map((w) => w.length));
  assert.ok(longest(ADJECTIVES) + 1 + longest(TAKE_NOUNS) <= MAX_LABEL);
  const taken = [];
  for (let i = 0; i < 50; i++) taken.push(takeName(taken));
  assert.equal(new Set(taken).size, 50);
});

test('a beat saved as a sound is a remix: "<beat> (<emoji> <word> Remix)", fitting the label', async () => {
  const { remixName, REMIX_WORDS } = await import('../web/names.js');
  const short = remixName('Bop', [], () => 0);
  assert.match(short, /^Bop \(\S+ \w+ Remix\)$/);
  assert.ok(REMIX_WORDS.some((w) => short.includes(` ${w} Remix`)));
  // Too long with the whole name: the beat's last word stays.
  const long = remixName('Wobbly Thunder Machine', [], () => 0);
  assert.match(long, /^Machine \(/);
  assert.ok(long.length <= MAX_LABEL);
  // A name already on the board is not used again.
  assert.notEqual(remixName('Bop', [short], () => 0), short);
  for (let i = 0; i < 200; i++) assert.ok(remixName('Supercalifragilistic', []).length <= MAX_LABEL);
  assert.match(remixName('Supercalifragilisticexpi', [], () => 0), /^\S+ \w+ Remix$/, 'nothing of the beat fits: the remix alone');
});

test('song names: no repeated nouns, every combination fits, and none repeats in a run', async () => {
  const { SONG_NOUNS, songName } = await import('../web/names.js');
  assert.ok(SONG_NOUNS.length >= 20);
  assert.equal(new Set(SONG_NOUNS).size, SONG_NOUNS.length);
  assert.ok(Math.max(...ADJECTIVES.map((w) => w.length)) + 1 + Math.max(...SONG_NOUNS.map((w) => w.length)) <= MAX_LABEL);
  const taken = [];
  for (let i = 0; i < 50; i++) taken.push(songName(taken));
  assert.equal(new Set(taken).size, 50);
});

// ── Fun names for people (no typed names; the Worker accepts only these) ──

test('fun names, two styles (Ben): "Captain Cranberries" and "Friendly Sloth", at most 20 characters, hundreds of each', () => {
  assert.ok(TITLE_NAMES.length >= 150, `${TITLE_NAMES.length} title names`);
  assert.ok(ANIMAL_NAMES.length >= 1000, `${ANIMAL_NAMES.length} animal names`);
  assert.deepEqual(FUN_NAMES, [...TITLE_NAMES, ...ANIMAL_NAMES]);
  assert.equal(new Set(FUN_NAMES).size, FUN_NAMES.length);
  assert.ok(FUN_NAMES.includes('Captain Cranberries') && FUN_NAMES.includes('Friendly Sloth'), "Ben's examples");
  for (const name of TITLE_NAMES) {
    const [title, noun] = name.split(' ');
    assert.ok(FUN_TITLES.includes(title) && FUN_NOUNS.includes(noun), name);
    assert.equal(title[0], noun[0], `${name} is alliterative`);
  }
  for (const name of ANIMAL_NAMES) {
    const [adjective, animal] = name.split(' ');
    assert.ok(FUN_ADJECTIVES.includes(adjective) && FUN_ANIMALS.includes(animal), name);
  }
  for (const name of FUN_NAMES) assert.ok(name.length <= MAX_PERSON && !FUN_AVOID.has(name), name);
  assert.ok(FUN_TITLES.every((t) => TITLE_NAMES.some((n) => n.startsWith(`${t} `))), 'every title is used');
  const styles = new Set();
  for (let i = 0; i < 40; i++) styles.add(TITLE_NAMES.includes(funName([])) ? 'title' : 'animal');
  assert.equal(styles.size, 2, 'both styles come up');
});

test('funName never repeats a taken name (any case), and numbers one only when all are taken', () => {
  const taken = FUN_NAMES.slice(1).map((n) => n.toUpperCase());
  assert.equal(funName(taken, () => 0.5), FUN_NAMES[0]);
  const all = funName(FUN_NAMES, () => 0);
  assert.match(all, / 2$/);
  assert.ok(all.length <= MAX_PERSON);
  assert.ok(isFunName(all));
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(funName([]));
  assert.ok(seen.size > 10, 'random');
});

test('isFunName: only what funName makes', () => {
  assert.ok(isFunName('Admiral Avocado'));
  assert.ok(isFunName('Admiral Avocado 12'));
  for (const typed of ['Sam', 'admiral avocado', 'Admiral Avocado ', 'Admiral Banana', 'Admiral Avocado 1', 'Admiral Avocado 100', 'Doctor Doodle', '', null, 7]) {
    assert.equal(isFunName(typed), false, String(typed));
  }
});

// Ben, 2026-10-11: a person can be "Salacious Crumb", picked from 🎲's list.
test('special names: accepted like fun names, never made at random, and short enough', () => {
  assert.ok(SPECIAL_NAMES.includes('Salacious Crumb'));
  for (const name of SPECIAL_NAMES) {
    assert.ok(name.length <= MAX_PERSON, name);
    assert.ok(isFunName(name), name);
    assert.ok(isFunName(`${name} 2`), `${name} 2`);
    assert.ok(!FUN_NAMES.includes(name), `${name} is not in the generator's list`);
  }
  assert.equal(isFunName('salacious crumb'), false, 'exactly as written');
  for (let i = 0; i < 2000; i++) assert.ok(!SPECIAL_NAMES.includes(funName([])));
  assert.ok(!SPECIAL_NAMES.includes(funName(FUN_NAMES, () => 0).replace(/ \d+$/, '')), 'not even when every name is taken');
});

test('nameChoices: a dozen fresh fun names nobody has, then the special names nobody has', () => {
  const list = nameChoices(['Friendly Sloth']);
  assert.equal(list.length, 12 + SPECIAL_NAMES.length);
  assert.equal(new Set(list).size, list.length);
  assert.ok(!list.includes('Friendly Sloth'));
  assert.deepEqual(list.slice(12), SPECIAL_NAMES);
  assert.ok(list.every(isFunName));
  assert.ok(!nameChoices(['salacious crumb']).includes('Salacious Crumb'), 'a special name someone has (any case) is not offered');
});

// Ben, 2026-10-11 (Q18): 🎛️ Remix names the copy "<title> remix", and it
// always fits a label.
test('a remix of something shared is "<title> remix", cut to fit', async () => {
  const { sharedRemixName, MAX_LABEL } = await import('../web/names.js');
  assert.equal(sharedRemixName('Wobbly Taco'), 'Wobbly Taco remix');
  assert.equal(sharedRemixName('Wobbly Marshmallow'), 'Wobbly Marshmallow remix');
  assert.ok(sharedRemixName('Supercalifragilisticexpi').length <= MAX_LABEL);
  assert.equal(sharedRemixName(''), 'Shared remix');
});
