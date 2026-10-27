// ✏️ Layout for ⌨️ Keys: dragging a sound onto a key, and a key onto
// another (swap), by a mouse at once and by a finger after a hold
// (finger.js holdToDrag, shared with the bands' editor in touch-edit.test.mjs).
// Not tested here: how the drag feels under a real finger.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { keysOn, keysOff } from './new-beat.mjs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let state;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = () => {};
  keysOn(page);
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  $('#dj-change-bar').dispatch('click');
  $('#ke-groups').querySelector('[data-group]').dispatch('click');   // a group's sounds to drag
});

after(() => { $('#keys-edit').close(); keysOff(page); });

const dlg = () => $('#keys-edit');
const keys = () => [...$('#ke-keys').querySelectorAll('[data-code]')];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (code) => $('#ke-keys').querySelector(`[data-code="${code}"]`);
const deckNow = () => JSON.stringify(state.decks.get('pip').keys);

// A drag from `from` over `over`, as the browser sends it.
async function drag(from, over, pointerType) {
  document.elementFromPoint = () => over;
  from.dispatch('pointerdown', { pointerId: 5, pointerType, clientX: 0, clientY: 0, button: 0 });
  if (pointerType === 'touch') await wait(320);
  dlg().dispatch('pointermove', { pointerId: 5, pointerType, clientX: 0, clientY: pointerType === 'touch' ? 4 : 40 });
  const ghost = dlg().querySelector('.ke-ghost');
  dlg().dispatch('pointerup', { pointerId: 5, pointerType, clientX: 0, clientY: 40 });
  from.dispatch('click');   // the click after a drag is not a tap
  await wait(0);
  return ghost;
}

test('a sound dragged onto a key goes on it: a mouse at once, a finger after holding still', async () => {
  const soundBtns = () => [...$('#ke-picks').querySelectorAll('[data-drag="sound"]')];   // drawn anew after each drop
  assert.ok(soundBtns().length > 2 && keys().length > 2);
  const target = keyOf('KeyA');
  const start = deckNow();
  const ghost = await drag(soundBtns()[0], target, 'mouse');
  assert.ok(ghost, 'a ghost followed the pointer');
  const one = deckNow();
  assert.notEqual(one, start, 'the sound went on the keys');
  assert.equal(dlg().querySelector('.ke-ghost'), null, 'the ghost went away');
  assert.equal(dlg().classList.contains('ke-dragging'), false);
  assert.equal(JSON.parse(one).KeyA, 'pip-name');
  await drag(soundBtns()[2], keyOf('KeyD'), 'touch');
  assert.equal(JSON.parse(deckNow()).KeyD, 'pip-zapper', 'a held finger puts the next sound on too');
});

test('a key dragged onto another swaps them', async () => {
  const before2 = deckNow();
  const [a, b] = ['KeyA', 'KeyD'];
  await drag(keyOf(a), keyOf(b), 'mouse');
  const now = JSON.parse(deckNow());
  const was = JSON.parse(before2);
  assert.deepEqual([now[a], now[b]], [was[b], was[a]]);
});

test('a finger that swipes first is a scroll and moves nothing; a cancel drops nothing', async () => {
  const sounds = [...$('#ke-picks').querySelectorAll('[data-drag="sound"]')];
  const target = keyOf('KeyS');
  const was = deckNow();
  document.elementFromPoint = () => target;
  sounds[2].dispatch('pointerdown', { pointerId: 6, pointerType: 'touch', clientX: 0, clientY: 0, button: 0 });
  dlg().dispatch('pointermove', { pointerId: 6, pointerType: 'touch', clientX: 0, clientY: 30 });
  await wait(320);
  dlg().dispatch('pointerup', { pointerId: 6, pointerType: 'touch', clientX: 0, clientY: 30 });
  assert.equal(dlg().querySelector('.ke-ghost'), null, 'no drag began');
  assert.equal(deckNow(), was);
  sounds[2].dispatch('pointerdown', { pointerId: 7, pointerType: 'mouse', clientX: 0, clientY: 0, button: 0 });
  dlg().dispatch('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 0, clientY: 40 });
  assert.ok(dlg().querySelector('.ke-ghost'));
  dlg().dispatch('pointercancel', { pointerId: 7 });
  await wait(0);
  assert.equal(deckNow(), was, 'a cancel drops nothing');
  assert.equal(dlg().classList.contains('ke-dragging'), false);
});
