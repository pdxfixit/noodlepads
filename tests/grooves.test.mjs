// The groove library (web/grooves.js, Ben 2026-10-12): about 30 grooves,
// grouped by style, many with a bass line and chords, every one a shape the
// beat maker can play. Whether each sounds right needs ears: this checks
// what can go wrong in the data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROOVES, GROOVE_GROUPS, grooveBeat, grooveShape, mergeGroove, cleanRow, barSteps, BAR_CHOICES } from '../web/sequencer.js';

const kit = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kit;
const kitIds = new Set(kit.map((s) => s.id));
const advanced = new Set(kit.filter((s) => s.advanced).map((s) => s.id));
const lit = (steps) => steps.flatMap((on, i) => (on ? [i] : []));

test('about 50 grooves in seven style groups (Ben, 2026-10-17: regroup), and the first six keep their ids', () => {
  assert.ok(GROOVES.length >= 45, `${GROOVES.length} grooves`);
  assert.deepEqual(GROOVE_GROUPS.map((g) => g.name),
    ['Dance', 'Hip hop', 'Rock, pop & country', 'Soul & gospel', 'Latin & Caribbean', 'Drums of the world', 'Swing & odd times']);
  const ids = GROOVES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(GROOVES.map((g) => g.name)).size, ids.length, 'names are unique');
  for (const id of ['four', 'backbeat', 'boombap', 'halftime', 'dembow', 'disco']) assert.ok(ids.includes(id), `${id} still works`);
  for (const g of GROOVES) assert.ok(GROOVE_GROUPS.some((x) => x.id === g.group), `${g.id} is in a group`);
  for (const group of GROOVE_GROUPS) assert.ok(GROOVES.filter((g) => g.group === group.id).length >= 4, `${group.name} has grooves`);
});

test('hip hop has its own presets and playful grooves built from them (Ben, 2026-10-17)', () => {
  const groups = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kitGroups;
  assert.deepEqual(groups.slice(0, 2).map((g) => g.id), ['drums', 'hiphop'], 'Hip hop sits right after Drums');
  const presets = kit.filter((k) => k.group === 'hiphop').map((k) => k.id);
  for (const id of ['kick-dusty', 'snare-dusty', 'glide', 'hat-roll', 'woodblock', 'plink', 'bloop', 'vinyl', 'horn-stab', 'rewind']) {
    assert.ok(presets.includes(id), `${id} is a Hip hop preset`);
    assert.ok(!advanced.has(id), `${id} shows with Advanced off`);
  }
  const hiphop = GROOVES.filter((g) => g.group === 'hiphop');
  for (const id of ['bounce', 'wonky', 'hopscotch', 'lullaby', 'drill', 'dusty', 'snacktime']) assert.ok(hiphop.some((g) => g.id === id), `${id} is a hip hop groove`);
  const used = new Set(hiphop.flatMap((g) => g.rows.map(([id]) => id)));
  assert.ok(presets.filter((id) => used.has(id)).length >= 8, 'the grooves play most of the new presets');
});

test('every groove says where it comes from or what to listen for, in one short line', () => {
  for (const g of GROOVES) {
    assert.equal(typeof g.about, 'string', g.id);
    assert.ok(g.about.length >= 20 && g.about.length <= 90, `${g.id}: ${g.about.length} characters`);
    assert.doesNotMatch(g.about, /BPM|sixteenth|syncopat|downbeat/i, `${g.id}: no music words a kid doesn't know`);
  }
});

test('🪘 Hand drums are presets, and the new styles play them (Ben, 2026-10-17)', () => {
  const inGroup = kit.filter((k) => k.group === 'handdrums').map((k) => k.id);
  for (const id of ['taiko', 'djembe', 'djembe-slap', 'log-drum', 'dhol', 'dhol-high', 'bongo', 'cajon']) assert.ok(inGroup.includes(id), id);
  const uses = (id, sound) => GROOVES.find((g) => g.id === id).rows.some(([s]) => s === sound);
  assert.ok(uses('taiko', 'taiko'));
  assert.ok(uses('bhangra', 'dhol') && uses('bhangra', 'dhol-high'));
  assert.ok(uses('amapiano', 'log-drum'), 'amapiano needs its log drum');
  const group = (id) => GROOVES.find((g) => g.id === id).group;
  for (const [id, g] of [['jerseyclub', 'dance'], ['amapiano', 'dance'], ['kpop', 'rock'], ['country', 'rock'], ['rnb', 'soul'], ['gospel', 'soul'],
    ['motown', 'soul'], ['funk', 'soul'], ['secondline', 'soul'], ['reggae', 'latin'], ['ska', 'latin'], ['afrobeats', 'world'], ['bhangra', 'world'], ['taiko', 'world']]) {
    assert.equal(group(id), g, id);
  }
});

test('every groove is a shape the beat maker plays: whole bars of its time signature, 1, 2 or 4 of them', () => {
  for (const g of GROOVES) {
    const { bar, bars, signature } = grooveShape(g);
    assert.equal(bar, barSteps(signature));
    assert.ok(BAR_CHOICES.includes(bars), `${g.id}: ${bars} bars`);
    assert.ok(g.rows.length >= 2 && g.rows.length <= 16, `${g.id}: ${g.rows.length} rows (the most is 16)`);
    assert.ok(g.bpm >= 60 && g.bpm <= 180, `${g.id}: tempo in range`);
    for (const [id, hits] of g.rows) {
      assert.ok(kitIds.has(id), `${g.id}: ${id} is a kit sound`);
      assert.ok(!advanced.has(id), `${g.id}: ${id} shows with Advanced off`);
      const pills = hits.replace(/\s+/g, '');
      assert.match(pills, /^[.xX]+$/, `${g.id}: ${id}`);
      assert.equal(pills.length, bar * bars, `${g.id}: ${id} fills ${bars} bar(s) of ${signature}`);
      assert.ok(/[xX]/.test(pills), `${g.id}: ${id} plays`);
    }
    assert.equal(new Set(g.rows.map(([id]) => id)).size, g.rows.length, `${g.id}: one row per sound`);
  }
});

test('many grooves bring a bass line and chords; the odd times use their own time signatures', () => {
  const has = (g, prefix) => g.rows.some(([id]) => id.startsWith(prefix));
  const both = GROOVES.filter((g) => has(g, 'bass-') && has(g, 'chord-'));
  assert.ok(both.length >= GROOVES.length / 2, `${both.length} with bass and chords`);
  const sig = (id) => grooveShape(GROOVES.find((g) => g.id === id)).signature;
  assert.equal(sig('waltz'), '3/4');
  assert.equal(sig('sixeight'), '6/8');
  assert.equal(sig('five'), '5/4');
  assert.equal(sig('seven'), '7/8');
  assert.equal(sig('swing'), '6/8', 'swing is written as 12/8: triplets need groups of three');
});

test('grooveBeat carries the groove\'s bars, time signature and loud hits', () => {
  const pop = grooveBeat(GROOVES.find((g) => g.id === 'pop'), 'juno');
  assert.equal(pop.bars, 4);
  assert.deepEqual(lit(pop.rows.find((r) => r.clipId === 'juno-chord-g').steps), [16, 22, 28], 'G is the second bar');
  const waltz = grooveBeat(GROOVES.find((g) => g.id === 'waltz'), 'juno');
  assert.equal(waltz.signature, '3/4');
  assert.equal(waltz.bars, 2);
  assert.deepEqual(lit(waltz.rows.find((r) => r.clipId === 'juno-chord-g7').steps), [16, 20]);
  const samba = grooveBeat(GROOVES.find((g) => g.id === 'samba'), 'juno');
  const surdo = samba.rows.find((r) => r.clipId === 'juno-kick');
  assert.deepEqual(lit(surdo.accents), [4, 12, 20, 28], 'the surdo\'s second beat is loud');
  assert.equal(grooveBeat(GROOVES.find((g) => g.id === 'four'), 'juno').signature, '4/4');
});

test('➕ Add to this beat: a 2-bar groove fills a 4-bar beat bar by bar, round again', () => {
  const groove = [{ clipId: 'k', steps: [...Array(16)].map((_, i) => i === 0).concat([...Array(16)].map((_, i) => i === 4)) }];
  const { rows } = mergeGroove([cleanRow({ clipId: 'k', steps: [] })], groove, 16, 4, { bar: 16, bars: 2 });
  assert.deepEqual(lit(rows[0].steps), [0, 20, 32, 52]);
});
