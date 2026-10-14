// The app must start whatever this device remembers from earlier visits.
// app.test.mjs starts with nothing remembered; this starts with every
// remembered choice set, the way a kid's tablet looks after a week. On
// 2026-10-11 a remembered DJ mode ("Into the beat") stopped the app starting.
// Since ADR 0017 (four tabs) a device last on DJ's Beat Builder ('dj' and
// 'dj-mode' 'beat', from an older copy) opens on Beats with ⌨️ Keys on.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

const remembered = new Map(Object.entries({
  person: 'juno',
  screen: 'dj',
  beats: '1',
  'beats-mode': 'song',
  'dj-mode': 'beat',
  'beat-keys': '1',
  'dj-click': '1',
  'dj-layer': '1',
  'dj-size': 'l',
  'beat-click': '1',
  'dj-layout': 'dvorak',
  'dj-labels': '{"KeyQ":"\'"}',
  'kit-open': '["drums","notes"]',
  'groups-closed': '["g-farm","","not-a-group"]',
  'chooser-closed': '["person:toby"]',
  'log-device': 'K7Q4-M2XD',
  'settings-open': '["set-keys","set-reports","!set-privacy","gone"]',
  uses: '{"juno":{"pad":3,"nope":1},"toby":"junk"}',
  'kids-tab': 'beats',
  'kids-size': '9',
  'dj-overlap': '1',   // a key nothing reads: 🎤 Live's 🔔 Overlap is for the visit (Ben, 2026-10-12)
}));
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => { remembered.set(k, String(v)); },
  removeItem: (k) => { remembered.delete(k); },
};

let page;
before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage({ storage, manifest: testManifest() });
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('with every remembered choice set, the app starts on the remembered screen', () => {
  const $ = page.$;
  assert.ok($('#board-title').textContent.endsWith('Noodle Pads'));
  assert.equal($('#beats-toggle').getAttribute('aria-pressed'), 'true', 'DJ\'s Beat Builder, remembered, is 🥁 Beats now');
  assert.equal($('#dj').hidden, false, 'with ⌨️ Keys on');
  assert.equal($('#seq').hidden, true);
  assert.equal($('#seq-keys').getAttribute('aria-pressed'), 'true');
  assert.equal(remembered.get('screen'), 'beats', 'remembered as Beats from now on');
  assert.equal(remembered.get('beat-keys'), '1');
  assert.equal($('#dj-keys').querySelectorAll('.dj-key').length, 40);
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'Scratch beat', 'the scratch beat is open (ADR 0020)');
  assert.equal($('#dj-grid').hidden, false, 'its grid, ready to play into');
  assert.equal($('#dj-grid').children.length, 0, 'an empty scratch has no rows');
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal($('#dj-grid').children.length, 0, 'a new beat has no rows (Ben, 2026-10-11)');
  assert.equal($('#dj-no-rows').hidden, false, 'a line says to play the keys');
  assert.equal($('#dj-keys').querySelector('[data-code="KeyS"]').getAttribute('aria-label'), 'O: Snare', 'Dvorak labels');
  $('#pads-tab').dispatch('click');
  assert.ok($('#pads').children.length > 0, 'and the pads are there');
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-overlap').getAttribute('aria-pressed'), 'false', '🔔 Overlap starts off on every visit');
  $('#pads-tab').dispatch('click');
  const open = $('#settings-dialog').querySelectorAll('.set-fold').filter((f) => !f.querySelector('.set-body').hidden).map((f) => f.id);
  assert.deepEqual(open, ['set-keys', 'set-reports'], 'the Settings sections left open');
});

test('feature-use counts left from before stay, junk goes, and the screens shown are counted (uses.js)', async () => {
  const { state } = await import('../web/state.js');
  const uses = JSON.parse(remembered.get('uses'));
  assert.equal(uses.toby, undefined, 'junk dropped');
  const mine = uses[state.personId];
  assert.ok(mine.beats >= 1 && mine.pads >= 1, JSON.stringify(uses));
  assert.equal(mine.nope, undefined);
  assert.equal(state.personId, 'juno');
  assert.equal(mine.pad, 3, 'the remembered count stays');
});

test('🧸 Kids opens on the remembered tab; a junk pad size reads as the middle one', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await new Promise((r) => setTimeout(r, 20));
  const $ = page.$;
  assert.equal(document.body.classList.contains('kids'), true);
  assert.equal($('[data-kids-view="beats"]').hidden, false, 'kids-tab: beats');
  assert.equal($('#kids-beat').querySelectorAll('.kids-square').length, 32);
  $('[data-kids-tab="pads"]').dispatch('click');
  assert.equal($('#kids-pages').style.props['--kids-cols'], '3', 'kids-size 9 is junk: 3 across');
  assert.equal(remembered.get('kids-tab'), 'pads');
  await setSetting('level', 'regular');
});
