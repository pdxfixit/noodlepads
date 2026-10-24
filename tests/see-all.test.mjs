// 🗂️ See all (Ben, 2026-10-24): a person's profile sheet's count line opens
// a sheet of everything they have on this device. A chip per kind, 0
// included; the list shows only kinds they have; a tap plays a row in place
// and a second tap stops it; key sets and layouts have no ▶. The real app.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let state;
let audio;
const started = [];
const stopped = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ audio } = await import('../web/audio.js'));
  audio.wake = () => {};
  audio.ctx = { sampleRate: 48000, currentTime: 0 };
  audio.load = async (clip) => ({ buffer: { duration: 1 }, duration: 1, clip });
  audio.start = (id, loaded) => { started.push([id, loaded.clip?.id]); audio.playing.set(id, {}); };
  audio.stop = (id) => { stopped.push(id); audio.playing.delete(id); };
  // Juno's own: four sounds, a key layout, and an edit of a preset.
  for (let i = 1; i <= 4; i++) state.userClips.push({ id: `user-j${i}`, personId: 'juno', label: `Juno sound ${i}`, emoji: '🐸', created: i, voice: 'normal', blob: new Blob(['x'], { type: 'audio/webm' }), mime: 'audio/webm' });
  state.layouts.push({ id: 'layout-j', personId: 'juno', name: 'Zoo keys', keys: { KeyA: 'user-j1' }, created: 1 });
  state.overrides.set('juno-kick', { id: 'juno-kick', emoji: '🦶' });
  await page.settle();
});

const openProfile = (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
};
const chip = (kind) => $('#things-chips').children.find((c) => c.dataset.show === kind);
const rows = () => $('#things-list').querySelectorAll('.sa-row');

test('the count line is a button that opens See all for that person', async () => {
  openProfile('juno');
  const line = $('#profile-counts');
  assert.equal(line.tagName.toLowerCase(), 'button');
  assert.equal($('#profile-counts-text').textContent.replace(/\u00a0/g, ' '), '🔊 4 · ✏️ 1 · ⌨️ 1', 'no "on this device": the cloud has the same');
  assert.equal(line.getAttribute('aria-label'), 'See all: everything Juno has: 4 sounds, 1 preset edit, 1 key layout');
  line.dispatch('click');
  await page.settle();
  assert.ok($('#things-dialog').open);
  assert.equal($('#things-title').textContent, 'Everything Juno has');
});

test('a chip for every kind, 0 included; All shows only the kinds they have, three rows each', () => {
  const chips = $('#things-chips').children;
  assert.equal(chips.length, 10, 'All, then the nine kinds');
  assert.equal(chip('all').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('all').textContent, 'All 6');
  assert.equal(chip('beats').textContent.replace(/ /g, ' '), '🥁 0');
  assert.equal(chip('beats').getAttribute('aria-label'), 'Beats, 0 beats');
  const heads = $('#things-list').querySelectorAll('.sa-head').map((h) => h.children[0].textContent);
  assert.deepEqual(heads, ['🔊 Sounds', '✏️ Preset edits', '⌨️ Key layouts'], 'no heading for a kind with none');
  const names = rows().map((r) => r.querySelector('.sa-name')?.textContent ?? r.textContent);
  assert.deepEqual(names, ['Juno sound 4', 'Juno sound 3', 'Juno sound 2', '＋ 1 more', 'Kick', 'Zoo keys'], 'newest first');
});

test('＋ N more and a chip show that kind in full; a chip with 0 says none yet', async () => {
  rows().find((r) => r.textContent === '＋ 1 more').dispatch('click');
  assert.equal(chip('sounds').getAttribute('aria-pressed'), 'true');
  assert.equal(rows().length, 4);
  chip('beats').dispatch('click');
  assert.equal(rows().length, 0);
  assert.equal($('#things-list').querySelector('.sa-empty').textContent, 'No beats yet.');
  chip('all').dispatch('click');
});

test('a tap plays a sound in place and a second tap stops it; a layout has no ▶', async () => {
  const row = (name) => rows().find((r) => r.querySelector('.sa-name')?.textContent === name);
  assert.equal(row('Zoo keys').tagName.toLowerCase(), 'div', 'a key layout has no sound of its own');
  assert.equal(row('Zoo keys').querySelector('.sa-go'), null);
  row('Juno sound 4').dispatch('click');
  await page.settle();
  assert.deepEqual(started.at(-1), ['see-all', 'user-j4'], 'its own slot, not a pad\'s');
  assert.equal(row('Juno sound 4').getAttribute('aria-pressed'), 'true');
  assert.equal(row('Juno sound 4').querySelector('.sa-go').textContent, '■');
  row('Juno sound 4').dispatch('click');
  assert.ok(stopped.includes('see-all'));
  assert.equal(row('Juno sound 4').querySelector('.sa-go').textContent, '▶\uFE0E', 'a plain ▶, never the wider emoji ▶️');
  assert.equal(row('Juno sound 4').getAttribute('aria-pressed'), 'false');
  row('Kick').dispatch('click');
  await page.settle();
  assert.deepEqual(started.at(-1), ['see-all', 'juno-kick'], 'a preset edit plays as its pad does');
});

test('closing See all stops what it plays and goes back to the profile', async () => {
  stopped.length = 0;
  rows().find((r) => r.querySelector('.sa-name')?.textContent === 'Juno sound 3').dispatch('click');
  await page.settle();
  $('#things-dialog').querySelector('[data-close]').dispatch('click');
  await page.settle();
  assert.ok(!$('#things-dialog').open);
  assert.ok(stopped.includes('see-all'));
  assert.ok($('#profile-dialog').open, 'the profile is still open under it');
});

test('someone switched off the cloud: the count line says it is this device only', async () => {
  $('#profile-dialog').close();
  state.peopleEdits.set('toby', { id: 'toby', offline: true });
  openProfile('toby');
  assert.match($('#profile-counts-text').textContent, /^📴 This device only: /);
  assert.match($('#profile-counts').getAttribute('aria-label'), /^See all: everything Toby has, on this device only: /);
  state.peopleEdits.delete('toby');
});

test('⬇️ Export a backup saves one file of just this person, named after them', async () => {
  const { unzip } = await import('../web/zip.js');
  if (!$('#things-dialog').open) { openProfile('juno'); $('#profile-counts').dispatch('click'); }
  let blob;
  let name;
  const realUrl = URL.createObjectURL;
  const realMake = document.createElement;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  document.createElement = (tag) => {
    const made = realMake.call(document, tag);
    if (tag === 'a') made.click = () => { name = made.download; };
    return made;
  };
  try {
    $('#things-backup').dispatch('click');
    await page.settle();
  } finally {
    URL.createObjectURL = realUrl;
    document.createElement = realMake;
  }
  assert.match(name, /^noodlepads-juno-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = await unzip(blob);
  const doc = JSON.parse(new TextDecoder().decode(files.get('backup.json')));
  assert.deepEqual(doc.clips.map((c) => c.id).sort(), ['user-j1', 'user-j2', 'user-j3', 'user-j4'], 'Juno\'s sounds and no one else\'s');
  assert.deepEqual(doc.layouts.map((l) => l.id), ['layout-j']);
  assert.deepEqual(doc.overrides.map((o) => o.id), ['juno-kick']);
  assert.deepEqual(doc.settings, [], 'the device\'s settings stay here');
  assert.equal($('#things-backup').getAttribute('aria-label'), 'Export a backup of Juno');
});
