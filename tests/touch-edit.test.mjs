// ✏️ Edit layout (ADR 0029): the 👆 touch layout's own view. Bands with ⠿
// (drag, or ↑ ↓), S M L and ✕ (two taps, ↩️ Undo); + Add a group; + more;
// a tile swapped or taken out; layouts loaded (⭐ My layout kept), saved,
// renamed and deleted; at most 8 bands.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

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

test('✏️ in the corner says Edit layout with 👆 and opens its own view of the bands', () => {
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit keys');
  $('#dj-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.equal($('#dj-change').textContent, '✏️ Edit layout');
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

test('S M L sets a band\'s tiles; ✕ asks first, then removes, and ↩️ Undo brings it back', () => {
  q('[data-size="s"][data-band="1"]').dispatch('click');
  assert.equal(touch().bands[1].size, 's', 'saved with the person\'s keys (decks.touch)');
  assert.equal(q('[data-size="s"][data-band="1"]').getAttribute('aria-pressed'), 'true');
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
  assert.equal(q('[data-pick-group="animals"]').getAttribute('aria-pressed'), 'true', 'its own group first');
  assert.equal(q('.te-picker [data-pick-sound="pip-moo"]'), null, 'what is in the band already is not offered');
  q('.te-picker [data-pick-sound="pip-meow"]').dispatch('click');
  assert.ok(touch().bands[4].sounds.includes('pip-meow'));
  assert.ok(q('.te-picker'), 'still open, to add another');
  q('[data-add-all]').dispatch('click');
  assert.equal(touch().bands[4].sounds.length, 8, 'every animal');
  assert.equal(q('.te-picker'), null);
});

test('a tile tapped: swap its sound for one from any group, or take it out', () => {
  q('[data-band="2"][data-tile="0"]').dispatch('click');   // Drums: Kick
  assert.match(q('.te-picker .ke-hint').textContent, /^Swap 🦶 Kick for:/);
  q('[data-pick-group="silly"]').dispatch('click');
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
