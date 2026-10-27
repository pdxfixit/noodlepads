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

// Esc is Stop all on the page (app.js bindEvents), which stands down only
// for a key a control already used. So every other Esc handler in web/
// (one that closes a list, lets go of a pick, empties a search) says it used
// the key: preventDefault within a few lines of its 'Escape' test. Without
// it, closing a menu also stopped the beat (2026-10-26).
test("every 'Escape' handler in web/ calls preventDefault, so the page's Stop all stands down", async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../web/', import.meta.url);
  const missing = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'app.js')) {   // app.js is the Stop all itself
    const lines = readFileSync(new URL(f, dir), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const at = line.indexOf("'Escape'");
      if (at < 0) return;
      // The handler's own body: after a guard (`!== 'Escape') return;`) the
      // next lines; a body closed on the same line, that line; else its lines
      // up to the closing brace.
      const rest = line.slice(at);
      let body;
      if (line.includes("!== 'Escape'")) body = lines.slice(i + 1, i + 7);   // a guard, then up to five more guards
      else if (rest.split('{').length === rest.split('}').length && rest.includes('{')) body = [line];
      else {
        const end = lines.findIndex((l, k) => k > i && /^\s*}/.test(l));
        body = lines.slice(i, end < 0 ? i + 4 : Math.min(end, i + 4));
      }
      if (!body.join('\n').includes('preventDefault')) missing.push(`web/${f}:${i + 1}`);
    });
  }
  assert.deepEqual(missing, [], 'an Esc handler that does not call preventDefault');
});

// Esc is the whole Stop all: a playing song stops, and both ⏲️ click tracks
// go off, as ⏹️ and Space do (app.js stopEverything).
test('Esc stops a playing song and turns both click tracks off', async () => {
  const { dropBeat } = await import('./song-ui.mjs');
  const { newBeatWithRow } = await import('./new-beat.mjs');
  const on = (sel) => page.$(sel).getAttribute('aria-pressed') === 'true';
  page.$('#beats-toggle').dispatch('click');
  newBeatWithRow(page);   // a beat of its own for the song's strip
  if (!on('#seq-click')) page.$('#seq-click').dispatch('click');
  if (!on('#dj-click')) page.$('#dj-click').dispatch('click');
  assert.ok(on('#seq-click') && on('#dj-click'), 'both click tracks on');
  page.$('#song-tab').dispatch('click');
  dropBeat(page.$);
  page.$('#song-play').dispatch('click');
  await page.settle();
  assert.ok(on('#song-play'), 'the song plays');
  page.key('Escape');
  assert.ok(!on('#song-play'), 'Esc stopped the song');
  assert.ok(!on('#seq-click') && !on('#dj-click'), 'and turned both click tracks off');
});

// With sounds chosen in ✏️ Edit sounds, Esc only lets go of them (Stop all
// stands down). A beat can't play there: Pads stops it as it shows.
test('Esc with sounds chosen only lets go of them', async () => {
  page.$('#pads-tab').dispatch('click');
  page.$('#edit-toggle').dispatch('click');
  const pad = page.$('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  pad.dispatch('click');
  assert.equal(page.$('#pads-chosen').hidden, false, 'a sound is chosen');
  const before = stops;
  page.key('Escape');
  assert.equal(page.$('#pads-chosen').hidden, true, 'Esc let go of it');
  assert.equal(stops, before, 'and stopped nothing');
  page.$('#edit-toggle').dispatch('click');
});
