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
  'play-side': 'live',   // 🎉 Play's screen last had (ADR 0033)
  'make-side': 'nope',   // not one of Make's: Beats
  'dj-click': '1',
  'dj-layer': '1',
  'dj-size': 'l',
  'dj-input': 'touch',   // ⌨️ / 👆: the touch layout (ADR 0029)
  'beat-click': '1',
  'dj-layout': 'dvorak',
  'kit-open': '["drums","notes"]',
  'groups-closed': '["g-farm","","not-a-group"]',
  'chooser-closed': '["person:toby"]',
  'log-device': 'K7Q4-M2XD',
  'settings-open': '["set-look","set-reports","!set-privacy","gone"]',
  uses: '{"juno":{"pad":3,"nope":1},"toby":"junk"}',
  visits: '[{"person":"juno","visit":{"at":1791000000000,"secs":40,"screens":["pads","nope"]}},"junk",{"person":"toby","visit":{"at":"x","secs":5}}]',
  'kids-tab': 'beats',
  'telemetry-player': 'not-a-random-id',   // replaced by a random one (telemetry.js playerId)
  'telemetry-queue': '[{"app":"noodlepads","session":"s-1","seq":0,"at":1791000000000,"event":"app.open","version":"abc","details":{}},"junk",{"event":"no.such"}]',
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
  assert.equal($('#dj-touch').hidden, false, '👆 remembered: the touch layout shows');
  assert.equal($('#dj-keys').hidden, true);
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
  assert.deepEqual(open, ['set-look'], 'the Settings sections left open (set-reports is gone)');
});

// ADR 0027: nothing counts or sends these any more, so a device that still
// holds them from an older copy is cleaned once at start.
test('feature-use counts and visits left by an older copy are removed (ADR 0027)', () => {
  assert.equal(remembered.has('uses'), false);
  assert.equal(remembered.has('visits'), false);
});

test('the usage queue this app kept before the shared client is dropped, and a player id that is not a random one is replaced (telemetry.js)', async () => {
  const { currentTelemetry } = await import('../web/telemetry.js');
  const t = currentTelemetry();
  assert.equal(remembered.has('telemetry-queue'), false);
  assert.match(t.player, /^[0-9a-f-]{36}$/);
  assert.equal(remembered.get('telemetry-player'), t.player);
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
  assert.equal($('#kids-pages').style.props['--kids-cols'], '3', 'the person\'s pad size (auto): 3 across a phone');
  assert.equal(remembered.get('kids-tab'), 'pads');
  await setSetting('level', 'regular');
});
