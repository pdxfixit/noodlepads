// 👆 Playing the touch layout (ADR 0029) on 🎤 Live and Beats with ⌨️ Keys:
// the ⌨️ / 👆 switch, remembered on the device; the bands, top to bottom; a
// tile plays like a key (on the finger's lift, held to loop) into takes and
// the beat's rows, which follow the bands' order.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff } from './new-beat.mjs';

const remembered = new Map();
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => { remembered.set(k, String(v)); },
  removeItem: (k) => { remembered.delete(k); },
};

let page;
let $;
let state;
const calls = [];
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ storage, manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = (clip) => { calls.push(['play', clip.id]); };
  audio.loop = (clip) => { calls.push(['loop', clip.id]); looping.add(clip.id); };
  audio.isLooping = (id) => looping.has(id);
  audio.stop = (id) => { calls.push(['stop', id]); looping.delete(id); };
});

const touch = (props) => ({ button: 0, pointerType: 'touch', clientX: 100, clientY: 100, ...props });
const heads = () => $('#dj-touch').querySelectorAll('.touch-head').map((h) => h.textContent);
const tile = (id) => $('#dj-touch').querySelector(`[data-clip="${id}"]`);
const pressed = () => $('#ke-input').querySelectorAll('[data-input]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.input);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('⌨️ / 👆: the keys on a wide screen until the kid picks; 👆 shows the bands, remembered on the device', () => {
  $('#live-tab').dispatch('click');
  assert.deepEqual(pressed(), ['keys']);
  assert.equal($('#dj-touch').hidden, true);
  assert.equal($('#dj-keys').hidden, false);
  $('#ke-input').querySelector('[data-input="touch"]').dispatch('click');
  assert.deepEqual(pressed(), ['touch']);
  assert.equal(remembered.get('dj-input'), 'touch');
  assert.match($('#screen-hint').textContent, /^Tap a pad to play it/, 'the footer\'s how-to says pads');
  assert.equal($('#dj-keys').hidden, true);
  assert.equal($('#dj-tabs').hidden, true);
  assert.equal($('#dj-touch').hidden, false);
  // The default: Pip's own sounds, then 🎸 Band (Chords, Drums, Bass).
  const who = $('#dj-touch').querySelectorAll('.touch-head-inst');
  assert.deepEqual(who.map((w) => w.textContent), ['(Synth)', '(Synth)'], 'Chords and Bass show who plays them; Sounds and Drums do not');
  assert.equal($('#dj-touch').querySelectorAll('.touch-head')[1].getAttribute('aria-label'), 'Chords: played by Synth', 'the words are in the label');
  assert.deepEqual(heads(), ['🎤 Sounds', '🎶 Chords', '🥁 Drums', '🎸 Bass']);
  assert.deepEqual($('#dj-touch').querySelectorAll('.touch-band').map((b) => b.dataset.size), ['m', 'm', 'l', 's']);
  assert.equal(tile('pip-kick').getAttribute('aria-label'), 'Kick');
  assert.ok(tile('pip-kick').style.props['--c'], 'colored by its family');
  assert.deepEqual($('#dj-legend').querySelectorAll('li').map((l) => l.textContent), ['mine', 'tunes', 'drums'], 'the legend names the tiles\' families');
});

test('a tile plays on the finger\'s lift (a scroll stays silent), loops when held, and a mouse plays at once', async () => {
  calls.length = 0;
  tile('pip-snare').dispatch('pointerdown', touch({ pointerId: 51 }));
  assert.deepEqual(calls, [], 'nothing on touch-down');
  page.winEvent('pointerup', touch({ pointerId: 51 }));
  assert.deepEqual(calls, [['play', 'pip-snare']]);
  calls.length = 0;
  tile('pip-snare').dispatch('pointerdown', touch({ pointerId: 52 }));
  page.winEvent('pointermove', touch({ pointerId: 52, clientY: 160 }));
  page.winEvent('pointerup', touch({ pointerId: 52, clientY: 160 }));
  assert.deepEqual(calls, [], 'a scroll that starts on a tile plays nothing');
  tile('pip-hihat').dispatch('pointerdown', touch({ pointerId: 53 }));
  await wait(400);
  assert.deepEqual(calls, [['play', 'pip-hihat'], ['loop', 'pip-hihat']], 'held still: it plays and loops');
  page.winEvent('pointerup', touch({ pointerId: 53 }));
  calls.length = 0;
  tile('pip-hihat').dispatch('pointerdown', touch({ pointerId: 54 }));
  page.winEvent('pointerup', touch({ pointerId: 54 }));
  assert.deepEqual(calls, [['stop', 'pip-hihat']], 'a tap on a looping tile stops it');
  calls.length = 0;
  tile('pip-clap').dispatch('pointerdown', { button: 0, pointerType: 'mouse', pointerId: 55 });
  tile('pip-clap').dispatch('pointerup', { button: 0, pointerType: 'mouse', pointerId: 55 });
  assert.deepEqual(calls, [['play', 'pip-clap']]);
  calls.length = 0;
  tile('pip-clap').dispatch('click', { detail: 0 });
  assert.deepEqual(calls, [['play', 'pip-clap']], 'Enter or Space on a focused tile plays it');
});

test('a take on 🎤 Live records the tiles played, by sound, so it plays back', async () => {
  const before = state.takes.length;
  $('#dj-record').dispatch('click');
  tile('pip-kick').dispatch('pointerdown', touch({ pointerId: 56 }));
  page.winEvent('pointerup', touch({ pointerId: 56 }));
  tile('pip-chord-c').dispatch('pointerdown', touch({ pointerId: 57 }));
  page.winEvent('pointerup', touch({ pointerId: 57 }));
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal(state.takes.length, before + 1);
  assert.deepEqual(state.takes.at(-1).events.map((e) => [e.clipId, e.kind]), [['pip-kick', 'hit'], ['pip-chord-c', 'hit']]);
  $('#dj-done-close').dispatch('click');
});

test('a saved touch layout plays instead of the default; a sound that is gone is left out, and an empty layout says how to fill it', () => {
  state.decks.set('pip', { personId: 'pip', keys: {}, touch: { bands: [{ group: 'animals', size: 'l', sounds: ['pip-moo', 'gone-1'] }] } });
  $('#pads-tab').dispatch('click');
  $('#live-tab').dispatch('click');
  assert.deepEqual(heads(), ['🐵 Animals']);
  assert.deepEqual($('#dj-touch').querySelectorAll('[data-clip]').map((t) => t.dataset.clip), ['pip-moo']);
  state.decks.set('pip', { personId: 'pip', keys: {}, touch: { bands: [] } });
  $('#pads-tab').dispatch('click');
  $('#live-tab').dispatch('click');
  assert.match($('#dj-touch').querySelector('.touch-empty').textContent, /✏️ Layout adds a group/);
  state.decks.delete('pip');
});

test('Beats with ⌨️ Keys and 👆: a tile played makes its row, and the rows follow the bands\' order', async () => {
  keysOn(page);
  assert.equal($('#dj-touch').hidden, false, 'the same switch, the same layout, on Beats');
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  for (const [id, n] of [['pip-kick', 61], ['pip-chord-c', 62]]) {
    tile(id).dispatch('pointerdown', touch({ pointerId: n }));
    page.winEvent('pointerup', touch({ pointerId: n }));
  }
  const rows = () => $('#dj-grid').querySelectorAll('.dj-grid-row').map((r) => r.querySelector('[data-picture]')?.dataset.picture);
  assert.deepEqual(rows(), ['pip-chord-c', 'pip-kick'], 'Chords is above Drums in the layout, so its row is too');
  $('#ke-input').querySelector('[data-input="keys"]').dispatch('click');
  assert.deepEqual(rows(), ['pip-kick', 'pip-chord-c'], 'with ⌨️ the rows follow the keys again');
  assert.equal(remembered.get('dj-input'), 'keys');
  keysOff(page);
});
