// ✏️ Edit layout (ADR 0029): the 👆 touch layout's own view. Bands with ⠿
// (drag, or ↑ ↓), S M L and ✕ (two taps, ↩️ Undo); + Add a group; + more;
// a tile swapped or taken out; layouts loaded (⭐ My layout kept), saved,
// renamed and deleted; at most 8 bands. + more and a swap pick the group
// with one ▾ picker and offer only sounds not on the board yet; sizing a
// band down fills its line.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { readFileSync } from 'node:fs';
import { testManifest } from './test-board.mjs';

const BOARDS = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
// How many sounds a kit group has on a fresh board (Advanced off, no instrument picked).
const inGroup = (g) => BOARDS.kit.filter((k) => k.group === g && !k.advanced && !k.inst).length;

const remembered = new Map();
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => { remembered.set(k, String(v)); },
  removeItem: (k) => { remembered.delete(k); },
};

let page;
let $;
let state;

before(async () => {
  console.error = () => {};
  page = installPage({ storage, manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = () => {};
});

const touch = () => state.decks.get('pip')?.touch;
const groupsOf = (t) => t.bands.map((b) => b.group);
const names = () => $('#te-bands').querySelectorAll('.te-band-name').map((n) => n.textContent);
const chips = () => $('#te-layouts').querySelectorAll('.ke-layout').map((b) => b.textContent);
const q = (sel) => $('#touch-edit').querySelector(sel);

test('✏️ Layout in the corner opens, with 👆 Pads, its own view of the bands', () => {
  $('#live-tab').dispatch('click');
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Layout');
  $('#dj-change').dispatch('click');
  assert.equal($('#touch-edit').open, true);
  assert.equal($('#keys-edit').open, false, 'not the keys\' editor');
  assert.deepEqual(names(), ['🎤 My sounds', '🎶 Chords', '🥁 Drums', '🎸 Bass']);
  assert.deepEqual(chips(), ['🎸 Band', '🥁 Drum kit', '🎹 Chords and bass', '🐾 Zoo band', '⭐ Save this layout'], 'ready-made ones, then Save; no ⭐ My layout yet');
  assert.equal(q('[data-size="m"][data-band="1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(q('[data-handle="0"]').getAttribute('aria-label'), 'Move 🎤 My sounds: drag it, or press ↑ or ↓');
  assert.ok($('#te-add').querySelector('[data-add-group="mine"]'), '+ Add a group offers 🎤 My sounds');
  assert.ok($('#te-add').querySelector('[data-add-group="animals"]'));
});

test('S M L sets a band\'s pads; ✕ asks first, then removes, and ↩️ Undo brings it back', () => {
  const chords = ['pip-chord-c', 'pip-chord-am', 'pip-chord-f', 'pip-chord-g'];   // the band's starters
  q('[data-size="s"][data-band="1"]').dispatch('click');
  assert.equal(touch().bands[1].size, 's', 'saved with the person\'s keys (decks.touch)');
  assert.equal(q('[data-size="s"][data-band="1"]').getAttribute('aria-pressed'), 'true');
  assert.equal(touch().bands[1].sounds.length, 5, 'four chords, and a fifth fills the line of five');
  assert.deepEqual(touch().bands[1].sounds.slice(0, 4), chords);
  assert.match($('#te-note').textContent, /^🎶 Chords: small pads\. 1 more sound fills the line\.$/);
  q('[data-size="m"][data-band="1"]').dispatch('click');
  assert.equal(touch().bands[1].sounds.length, 5, 'bigger tiles keep every sound, wrapping');
  q('[data-remove="2"]').dispatch('click');
  assert.equal(q('[data-remove="2"]').textContent, '✕?', 'the first tap only asks, in red');
  assert.ok(q('[data-remove="2"]').classList.contains('armed'));
  assert.equal(touch().bands.length, 4);
  q('[data-remove="2"]').dispatch('click');
  assert.deepEqual(groupsOf(touch()), ['mine', 'chords', 'bass']);
  assert.match($('#te-note').textContent, /^Removed 🥁 Drums\. ↩️ Undo brings it back\.$/);
  $('#te-undo').dispatch('click');
  assert.deepEqual(groupsOf(touch()), ['mine', 'chords', 'drums', 'bass']);
});

test('+ Add a group puts it at the bottom with its starting sounds; + more adds the rest, one or all', () => {
  $('#te-add').querySelector('[data-add-group="animals"]').dispatch('click');
  const last = touch().bands.at(-1);
  assert.deepEqual([last.group, last.size, last.sounds], ['animals', 'm', ['pip-moo', 'pip-quack', 'pip-tweet', 'pip-roar']]);
  q('[data-more="4"]').dispatch('click');
  assert.ok(q('.te-picker'), 'the picker opens under the band');
  assert.match(q('.te-picker .ke-hint').textContent, /^Add to 🐵 Animals:/);
  assert.equal(q('.te-picker [data-pick-group]'), null, 'no wall of groups: one picker');
  assert.equal(q('[data-group-pick]').getAttribute('aria-label'), 'Sounds from 🐵 Animals: 4 to add. Tap to pick another group', 'its own group, with what is left');
  assert.equal(q('[data-group-pick]').getAttribute('aria-expanded'), 'false');
  assert.equal(q('.te-picker [data-pick-sound="pip-moo"]'), null, 'what is in the band already is not offered');
  q('.te-picker [data-pick-sound="pip-meow"]').dispatch('click');
  assert.ok(touch().bands[4].sounds.includes('pip-meow'));
  assert.ok(q('.te-picker'), 'still open, to add another');
  assert.equal(q('[data-add-all]').textContent, '+ Add all 3');
  q('[data-add-all]').dispatch('click');
  assert.equal(touch().bands[4].sounds.length, 8, 'every animal');
  assert.equal(q('.te-picker'), null);
});

test('a tile tapped: swap its sound for one from any group, or take it out', () => {
  q('[data-band="2"][data-tile="0"]').dispatch('click');   // Drums: Kick
  assert.match(q('.te-picker .ke-hint').textContent, /^Swap 🦶 Kick for:/);
  assert.equal(q('.te-picker [data-pick-sound="pip-kick"]').getAttribute('aria-pressed'), 'true', 'its own sound, picked');
  assert.equal(q('.te-picker [data-pick-sound="pip-snare"]'), null, 'a sound on the board already is not offered');
  assert.ok(q('.te-picker [data-pick-sound="pip-open-hat"]'));
  q('[data-group-pick]').dispatch('click');
  assert.equal(q('[data-group-pick]').getAttribute('aria-expanded'), 'true');
  assert.equal(q('.te-picker [data-pick-sound]'), null, 'the list of groups shows in place of the sounds');
  const choices = q('.te-group-list').querySelectorAll('[data-pick-group]');
  assert.equal(choices[0].dataset.pickGroup, 'drums', 'the band\'s own group first');
  assert.equal(choices[0].getAttribute('aria-pressed'), 'true');
  q('[data-pick-group="silly"]').dispatch('click');
  assert.equal(q('.te-group-list'), null, 'a pick closes the list');
  assert.match(q('[data-group-pick]').getAttribute('aria-label'), /^Sounds from 🤪 Silly: \d+ to pick\./);
  q('.te-picker [data-pick-sound="pip-honk"]').dispatch('click');
  assert.equal(touch().bands[2].sounds[0], 'pip-honk');
  assert.equal(q('.te-picker'), null, 'a swap closes the picker');
  q('[data-band="2"][data-tile="0"]').dispatch('click');
  q('[data-take-out]').dispatch('click');
  assert.deepEqual(touch().bands[2].sounds, ['pip-snare', 'pip-hihat', 'pip-clap']);
});

test('⠿ moves a band: ↑ ↓ on it, or a drag (a mouse at once; a finger holds first)', async () => {
  q('[data-handle="4"]').dispatch('keydown', { key: 'ArrowUp' });
  assert.deepEqual(groupsOf(touch()), ['mine', 'chords', 'drums', 'animals', 'bass']);
  const drag = async (from, to, pointerType = 'mouse') => {
    document.elementFromPoint = () => q(`.te-band[data-band="${to}"]`);
    const h = q(`[data-handle="${from}"]`);
    h.dispatch('pointerdown', { pointerId: 9, pointerType, clientX: 0, clientY: 0, button: 0 });
    if (pointerType === 'touch') await new Promise((r) => setTimeout(r, 320));
    $('#touch-edit').dispatch('pointermove', { pointerId: 9, pointerType, clientX: 0, clientY: pointerType === 'touch' ? 4 : 40 });
    $('#touch-edit').dispatch('pointerup', { pointerId: 9, pointerType, clientX: 0, clientY: 40 });
    h.dispatch('click');   // the click a browser sends after the drag is not a tap
    await new Promise((r) => setTimeout(r, 0));
  };
  await drag(0, 4);
  assert.deepEqual(groupsOf(touch()), ['chords', 'drums', 'animals', 'bass', 'mine']);
  await drag(4, 0, 'touch');
  assert.deepEqual(groupsOf(touch()), ['mine', 'chords', 'drums', 'animals', 'bass']);
});

test('a ready-made layout keeps the hand-made one as ⭐ My layout; ⭐ Save this layout names one; rename; delete asks first', () => {
  const mine = JSON.stringify(touch());
  $('#te-layouts').querySelector('[data-layout="ready-drum-kit"]').dispatch('click');
  assert.deepEqual(groupsOf(touch()), ['drums', 'drums', 'drums']);
  assert.match($('#te-note').textContent, /kept in ⭐ My layout/);
  assert.equal(chips()[0], '⭐ My layout');
  assert.equal($('#te-layouts').querySelector('[data-layout="ready-drum-kit"]').getAttribute('aria-pressed'), 'true');
  $('#te-layouts').querySelector('[data-layout="mine"]').dispatch('click');
  assert.equal(JSON.stringify(touch()), mine, 'My layout brings it back');

  $('#te-save').dispatch('click');
  assert.equal($('#te-save-line').hidden, false);
  assert.equal($('#te-save-name').value, '', 'never pre-filled');
  $('#te-save-name').value = '  Jam pads ';
  $('#te-save-ok').dispatch('click');
  assert.deepEqual(state.touchLayouts.map((l) => [l.name, l.personId, l.bands.length]), [['Jam pads', 'pip', 5]]);
  assert.match(state.touchLayouts[0].id, /^touch-/);
  assert.deepEqual(chips().slice(0, 2), ['⭐ My layout', '⭐ Jam pads'], 'own ones first');
  assert.equal($('#te-own-line').hidden, false);
  $('#te-rename').value = 'Party';
  $('#te-rename').dispatch('change');
  assert.equal(state.touchLayouts[0].name, 'Party');
  $('#te-delete').dispatch('click');
  assert.equal(state.touchLayouts.length, 1, 'the first tap only asks');
  assert.equal($('#te-delete').textContent, 'Delete ⭐ Party?');
  $('#te-delete').dispatch('click');
  assert.equal(state.touchLayouts.length, 0);
  assert.equal(JSON.stringify(touch()), mine, 'the layout stays as it is');
});

test('a layout holds 8 groups at most; ✅ Done shows the new layout on 🎤 Live', () => {
  for (let i = 0; i < 5; i++) $('#te-add').querySelector('[data-add-group="game"]').dispatch('click');
  assert.equal(touch().bands.length, 8);
  assert.equal($('#te-add').querySelector('[data-add-group="game"]').disabled, true);
  assert.match($('#te-add-hint').textContent, /8 groups at most/);
  q('[data-close]').dispatch('click');
  assert.equal($('#touch-edit').open, false);
  assert.equal($('#dj-touch').querySelectorAll('.touch-band').length, 8);
  assert.equal($('#dj-touch').querySelectorAll('.touch-head')[3].textContent, '🐵 Animals');
});

test('+ more offers only what is not on the board: a group\'s count, the empty line, Esc closes the groups; a new band starts after the old one', () => {
  $('#dj-change').dispatch('click');
  $('#te-layouts').querySelector('[data-layout="ready-band"]').dispatch('click');
  assert.deepEqual(groupsOf(touch()), ['chords', 'drums', 'bass']);
  $('#te-add').querySelector('[data-add-group="drums"]').dispatch('click');
  const [, drums, , more] = touch().bands;
  assert.equal(more.sounds.length, 4);
  assert.deepEqual(more.sounds.filter((id) => drums.sounds.includes(id)), [], 'a second band of Drums starts with other drums');

  q('[data-more="3"]').dispatch('click');
  assert.equal(q('[data-group-pick]').getAttribute('aria-label'), `Sounds from 🥁 Drums: ${inGroup('drums') - 8} to add. Tap to pick another group`);
  for (const id of [...drums.sounds, ...more.sounds]) assert.equal(q(`.te-picker [data-pick-sound="${id}"]`), null, id);
  q('[data-group-pick]').dispatch('click');
  assert.equal(q('[data-pick-group="chords"]').getAttribute('aria-label'), `🎶 Chords: ${inGroup('chords') - 4} to add`);
  q('.te-group-list').dispatch('keydown', { key: 'Escape' });
  assert.equal(q('.te-group-list'), null, 'Esc closes the groups');
  assert.equal($('#touch-edit').open, true, 'and not Edit layout');
  q('[data-group-pick]').dispatch('click');
  q('[data-pick-group="chords"]').dispatch('click');
  assert.equal(q('.te-picker [data-pick-sound="pip-chord-c"]'), null, 'in the Chords band');
  q('[data-add-all]').dispatch('click');
  assert.equal(touch().bands[3].sounds.length, 4 + inGroup('chords') - 4);

  q('[data-more="0"]').dispatch('click');
  assert.equal(q('.te-picker [data-pick-sound]'), null);
  const empty = q('.te-picker').querySelectorAll('.ke-hint').find((p) => /on the board/.test(p.textContent));
  assert.equal(empty.textContent, 'Every sound in 🎶 Chords is on the board already. Pick another group.');
  assert.equal(empty.hidden, false);
  assert.equal(q('[data-add-all]'), null, 'nothing to add all of');
  q('[data-pick-close]').dispatch('click');

  // Drums at L (2 across) holds 4: M (4 across) is a full line; S (5) takes one more drum not on the board.
  q('[data-size="m"][data-band="1"]').dispatch('click');
  assert.equal(touch().bands[1].sounds.length, 4);
  q('[data-size="s"][data-band="1"]').dispatch('click');
  const five = touch().bands[1].sounds;
  assert.equal(five.length, 5);
  assert.ok(!touch().bands.slice(2).some((b) => b.sounds.includes(five[4])), 'never one already on the board');
  q('[data-size="l"][data-band="1"]').dispatch('click');
  assert.deepEqual(touch().bands[1].sounds, five, 'bigger keeps them all');
  $('#te-undo').dispatch('click');
  $('#te-undo').dispatch('click');
  assert.deepEqual([touch().bands[1].size, touch().bands[1].sounds.length], ['m', 4], '↩️ Undo takes back the filled line');
  q('[data-close]').dispatch('click');
});
