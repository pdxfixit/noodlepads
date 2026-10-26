// A take taken out on the take card (↩️ Undo, 1f91ecb) is gone, and the
// banner's own ↩️ Undo is its only way back. On a person change that banner
// must not stay on the next kid's screen, nor take the first kid's take with
// it: the take goes back, quietly, as the first kid's, with no card and no
// banner for the next kid (council, storage-sync and privacy-safety,
// 2026-10-26). Deleting the kid brings nothing back
// (keys-person-deleted.test.mjs).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { DB_NAME } from '../web/store.js';
import { hasUndo } from './banner.mjs';

let page;
let $;
let state;
const idb = fakeIndexedDB();

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
});

test('a take taken out, then another person: the take is back as the first kid\'s, with no card and no banner for the next kid', async () => {
  $('#live-tab').dispatch('click');
  const first = state.personId;
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  await page.settle();
  const id = state.takes.at(-1).id;
  $('#dj-done-undo').dispatch('click');
  await page.settle();
  assert.match($('#banner-text').textContent, /^Took out/);
  assert.equal(state.takes.some((t) => t.id === id), false, 'taken out');
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.notEqual(state.personId, first);
  const back = state.takes.find((t) => t.id === id);
  assert.ok(back, 'the take is back');
  assert.equal(back.personId, first, 'as the first kid\'s');
  assert.ok(idb.rows(DB_NAME, 'takes').some((t) => t.id === id && t.personId === first), 'and stored');
  assert.equal($('#dj-done').hidden, true, 'no take card for the next kid');
  assert.equal(hasUndo(), false, 'no banner for the next kid');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
});

test('the banner\'s own ↩️ Undo, then another person: the take is back once, and nothing more happens', async () => {
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  await page.settle();
  const id = state.takes.at(-1).id;
  $('#dj-done-undo').dispatch('click');
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(state.takes.filter((t) => t.id === id).length, 1, 'back');
  page.key('ArrowRight', { code: 'ArrowRight' });
  await page.settle();
  assert.equal(state.takes.filter((t) => t.id === id).length, 1, 'still once');
  page.key('ArrowLeft', { code: 'ArrowLeft' });
  await page.settle();
});
