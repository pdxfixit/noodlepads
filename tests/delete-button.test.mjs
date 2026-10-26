// A profile's Delete (Ben, 2026-10-26: "an actual button that is separated
// and visually distinct", with the right safeguards): a full-width red button
// in a box of its own, after the sheet's other parts. A double tap is one
// slip, so the tap that deletes must come a moment after the one that asked;
// and the only person here says why they can't be deleted.

import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
const idb = fakeIndexedDB();
const person = (id, name, created) => ({ id, name, fun: true, avatar: '🦉', color: '#304A00', added: true, created });

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [person('p-pip-1', 'Pip', 1), person('p-juno-1', 'Juno', 2)],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: '#p-pip-1' });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  await page.settle();
});

const openProfile = async (id) => {
  $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
  await page.settle();
};

test('Delete is a full-width red button in a box of its own, after the profile\'s other parts', async () => {
  await openProfile('p-juno-1');
  const del = $('#profile-delete');
  assert.equal(del.textContent, '🗑️ Delete');
  assert.ok(del.classList.contains('secondary') && del.classList.contains('pf-danger') && del.classList.contains('pf-wide'), 'a button, not a link');
  assert.ok(!del.classList.contains('quiet'), 'no underlined text link');
  const zone = del.closest('.pf-zone');
  assert.ok(zone, 'in the red box');
  assert.equal(zone.closest('#profile-parts'), null, 'apart from the parts above, so it stays for the third tap');
  assert.ok(zone.querySelector('#profile-delete-hint'), 'what it takes is said inside the box');
  assert.equal(del.getAttribute('aria-describedby'), 'profile-delete-hint', 'and read with the button, greyed or not');
});

test('Delete takes itself back after 4 s, so it never waits red for a stray tap', () => {
  const del = $('#profile-delete');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    del.dispatch('click', { timeStamp: 100 });
    assert.ok(del.classList.contains('armed'));
    mock.timers.tick(3900);
    assert.ok(del.classList.contains('armed'), 'still asking just before');
    mock.timers.tick(200);
    assert.ok(!del.classList.contains('armed'), 'taken back');
    assert.equal(del.textContent, '🗑️ Delete');
  } finally {
    mock.timers.reset();
  }
});

test('a double tap on Delete only asks; a tap after a moment deletes', async () => {
  const del = $('#profile-delete');
  del.dispatch('click', { timeStamp: 1000 });
  assert.equal(del.textContent, 'Tap again to delete');
  del.dispatch('click', { timeStamp: 1150 });
  await page.settle();
  assert.equal(state.peopleEdits.has('p-juno-1'), true, 'the double tap\'s second half deleted nothing');
  assert.ok(del.classList.contains('armed'), 'still asking');
  await new Promise((r) => setTimeout(r, 80));   // announce() fills the live region a moment later
  assert.match($('#announce').textContent, /Tap once more to delete/, 'and says so');
  del.dispatch('click', { timeStamp: 1900 });
  await page.settle();
  assert.equal(state.peopleEdits.has('p-juno-1'), false, 'deleted');
  assert.equal($('#profile-dialog').open, false);
});

test('the only person here can\'t be deleted, and the box says why', async () => {
  await openProfile('p-pip-1');
  assert.equal($('#profile-delete').disabled, true);
  assert.equal($('#profile-delete-hint').textContent, "Pip is the only one here, so they can't be deleted. Close this and ➕ Add a person first.");
  $('#profile-dialog').close();
});
