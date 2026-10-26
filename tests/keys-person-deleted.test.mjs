// The person on show deleted (👥 People → their sheet → 🗑️ twice): the
// board starts over (app.js startOver), which clears who is on show before
// the next person shows, so the keys never heard of the change. A 🎤 Live
// take recording then ran on, its card stayed, and once stopped it was
// saved for nobody on this device (2026-10-26). Now the keys let go first;
// the deleted kid's take in progress goes with them, and a take of theirs
// taken out (its banner's ↩️ Undo still up) stays gone.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const GONE = 'p-gone-1';
const STAYS = 'p-stays-1';
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, { people: [person(STAYS, 'Baron Bagel', 1), person(GONE, 'Admiral Acorn', 2)] });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${GONE}` });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
});

test('deleting the person on show mid-take, with a take taken out: the take stops, its card and the banner go, and nothing comes back for nobody', async () => {
  assert.equal(state.personId, GONE);
  $('#live-tab').dispatch('click');
  // A take of theirs taken out on its card: its banner's ↩️ Undo is up.
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  await page.settle();
  $('#dj-done-undo').dispatch('click');
  assert.match($('#banner-text').textContent, /^Took out/);
  // And another one recording.
  $('#dj-record').dispatch('click');
  page.key('a', { code: 'KeyA' });
  assert.equal($('#dj-record').textContent, '■ Stop');
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === GONE).querySelector('[data-profile]').dispatch('click');
  $('#profile-delete').dispatch('click', { timeStamp: 1000 });
  $('#profile-delete').dispatch('click', { timeStamp: 5000 });
  // At the tap, before the delete's own awaits: the take stops now, so no
  // wait (a sync ending, a third tap for the cloud copy) can save it for nobody.
  assert.equal($('#dj-record').textContent, '● Record', 'stopped at the tap');
  await page.settle();
  assert.notEqual(state.personId, GONE);
  assert.equal($('#dj-record').textContent, '● Record', 'not recording for the next person');
  assert.equal($('#dj-done').hidden, true, 'no take card');
  assert.deepEqual(state.takes.filter((t) => t.personId === GONE), [], 'no take left for the deleted person, nor brought back');
  assert.deepEqual(idb.rows(DB_NAME, 'takes').filter((t) => t.personId === GONE), [], 'none stored');
  assert.ok(!/^Took out/.test($('#banner-text').textContent) || $('#banner').hidden, 'the banner went');
});
