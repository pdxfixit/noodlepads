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
  page.key(' ', { target: page.$('#stop-all') ?? document.querySelector('button') });
  page.key(' ', { target: document.querySelector('input') });
  page.key(' ', { repeat: true });
  page.key(' ', { shiftKey: true });
  assert.equal(stops, before);
});
