// Space is Stop all almost everywhere (Ben, 2026-10-12): every sound, the
// beat and the song stop; not while typing or on a focused button, and
// Shift+Space is left to a pill's loud hit.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let stops = 0;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  const { audio } = await import('../web/audio.js');
  const real = audio.stopAll.bind(audio);
  audio.stopAll = (...a) => { stops++; return real(...a); };
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('Space on the page stops everything, and keeps the page from scrolling', () => {
  const before = stops;
  const e = page.key(' ');
  assert.equal(stops, before + 1);
  assert.equal(e.defaultPrevented, true);
});

test('Space on a focused button, in a text box, held down, or with Shift does not', () => {
  const before = stops;
  const button = page.$('#stop-all');
  assert.ok(button, 'a real button to focus');
  page.key(' ', { target: button });
  page.key(' ', { target: document.querySelector('input') });
  page.key(' ', { repeat: true });
  page.key(' ', { shiftKey: true });
  assert.equal(stops, before);
});

// Help: on a focused button Space presses it, so Esc is the stop that works there.
test('Esc on a focused button stops everything, where Space would press the button', () => {
  const before = stops;
  const button = page.$('#stop-all');
  assert.ok(button, 'a real button to focus');
  page.key('Escape', { target: button });
  assert.equal(stops, before + 1);
});

// ✏️ Edit sounds with sounds picked: Esc lets go of them first, and stops
// nothing (app.js clearChosen before stopEverything).
test('Esc with sounds picked in ✏️ Edit sounds lets go of them, and stops nothing', () => {
  const $ = page.$;
  $('#edit-toggle').dispatch('click');
  const kick = $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id?.endsWith('-kick'));
  kick.dispatch('click');
  assert.equal($('#pads-chosen').hidden, false, 'one picked');
  const before = stops;
  page.key('Escape');
  assert.equal($('#pads-chosen').hidden, true, 'let go');
  assert.equal(stops, before, 'nothing stopped');
  page.key('Escape');
  assert.equal(stops, before + 1, 'the next Esc stops everything');
  $('#edit-toggle').dispatch('click');
});
