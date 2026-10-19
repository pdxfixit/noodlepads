// A person's profile sheet after the PIN pass (Ben, 2026-10-19): the 🔒 PIN
// part says at a glance whether a PIN is on (its pill, and 🔒 PIN by the
// name), what a PIN button just did shows in that pill, then it fades back;
// Change PIN and Remove PIN show on a later visit too, asking for the PIN
// first; 🔒 Set a PIN on someone brand new puts them in the cloud; the corner
// menu shows 🔒 by a name with a PIN. And a person stored with one of the
// old person colors takes the nearest new one as it is read. The real app with a
// stand-in IndexedDB, against the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { PERSON_COLORS } from '../web/model.js';

let page;
let $;
let state;
let cloud;
let ui;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const OLD = 'p-oldcolor-1';   // stored with Forest, a person color from before 2026-10-19
const LATER = 'p-later-1';    // in the cloud with a PIN, not opened yet on this visit
const THIRD = 'p-third-1';    // the same, for Sync now and the switch
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  await call('profiles', { id: LATER, name: 'Baron Bagel', avatar: '', color: '#304A00', pin: '1357' });
  await call('profiles', { id: THIRD, name: 'Count Cupcake', avatar: '', color: '#B3141C', pin: '9090' });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [
      { id: OLD, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#2E5A12', added: true, created: 1 },
      { id: LATER, name: 'Baron Bagel', fun: true, avatar: '🥯', color: '#304A00', added: true, created: 2 },
      { id: THIRD, name: 'Count Cupcake', fun: true, avatar: '🍊', color: '#B3141C', added: true, created: 3 },
    ],
    cloud: [
      { id: LATER, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: THIRD, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
    ],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).startsWith('/api/')
    ? worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env)
    : pageFetch(url, init));
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  ui = await import('../web/cloud-ui.js');
  await page.settle();
});

const settle = () => page.settle();
const typePin = (d) => { for (const k of d) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
const sheetOf = (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  const line = $('#people-edit').children.find((r) => r.dataset.person === id);
  line.querySelector('[data-profile]').dispatch('click');
};
const closeSheets = () => { $('#profile-dialog').close(); $('#people-dialog').close(); };
const pill = () => $('#profile-pin-state').textContent;
const menuItem = (id) => $(`.person-list [data-person="${id}"]`);

test('a person stored with an old color takes the nearest new one as it is read', async () => {
  assert.equal(state.peopleEdits.get(OLD).color, '#304A00', 'Forest is Olive now');
  assert.ok(PERSON_COLORS.includes(state.peopleEdits.get(OLD).color));
  sheetOf(OLD);
  const picked = $('#profile-colors').querySelectorAll('[aria-pressed="true"]');
  assert.equal(picked.length, 1, 'the picker shows it chosen');
  assert.equal(picked[0].dataset.color, '#304A00');
  assert.equal($('#profile-colors').querySelectorAll('[data-color]').length, 8);
  closeSheets();
});

test('🔒 Set a PIN on someone brand new puts them in the cloud; the pill says ✅ PIN set, then fades to 🔒 PIN on', async () => {
  sheetOf(OLD);
  assert.equal(cloud.inCloud(OLD), false, 'nothing made: not in the cloud');
  assert.equal(pill(), '🔓 No PIN');
  assert.equal($('#profile-lock').hidden, true);
  assert.equal($('#profile-pin-tools').hidden, true, 'no Change or Remove without a PIN');
  $('#cloud-pin').dispatch('click');
  await settle();
  typePin('2468');
  await settle();
  typePin('2468');
  await settle();
  assert.ok(cloud.inCloud(OLD), 'in the cloud now');
  assert.equal(cloud.linkOf(OLD).pin, true);
  assert.equal(env.DB.rows('SELECT pin_hash IS NOT NULL AS pin FROM profiles WHERE id = ?', OLD)[0].pin, 1);
  assert.equal(pill(), '✅ PIN set', 'what just happened, where PIN on shows');
  assert.equal($('#profile-lock').hidden, false, '🔒 PIN by the name');
  assert.equal($('#cloud-pin').hidden, true);
  assert.equal($('#profile-pin-tools').hidden, false, 'Change PIN and Remove PIN');
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'true', 'the switch is on');
  assert.match(menuItem(OLD).textContent, /🔒$/, 'the corner menu says so too');
  await new Promise((r) => setTimeout(r, ui.PIN_FLASH_MS + 100));
  assert.equal(pill(), '🔒 PIN on');
  closeSheets();
});

test('Change PIN asks for the PIN now (a wrong one asks again), then the new one twice', async () => {
  sheetOf(OLD);
  $('#cloud-pin-change').dispatch('click');
  await settle();
  assert.equal($('#pin-title').textContent, 'The PIN now');
  typePin('1111');
  await settle();
  assert.match($('#pin-note').textContent, /4 tries left/);
  typePin('2468');
  await settle();
  typePin('8642');
  await settle();
  typePin('8642');
  await settle();
  assert.equal(pill(), '✅ PIN changed');
  const opened = await call(`profiles/${OLD}/open`, { pin: '8642', remember: false });
  assert.ok(opened.key, 'the new PIN opens it');
  closeSheets();
});

test('on a later visit Change and Remove still show; Remove asks for the PIN, then the pill says 🔓 PIN removed', async () => {
  assert.equal(cloud.keyOf(LATER), null, 'not opened on this visit: no key');
  sheetOf(LATER);
  assert.equal(pill(), '🔒 PIN on');
  assert.equal($('#profile-pin-tools').hidden, false, 'no dead end');
  assert.match(menuItem(LATER).textContent, /🔒$/);
  $('#cloud-pin-off').dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true);
  typePin('1357');
  await settle();
  assert.equal(pill(), '🔓 PIN removed');
  assert.equal(cloud.linkOf(LATER).pin, false);
  assert.equal($('#profile-lock').hidden, true);
  assert.equal($('#cloud-pin').hidden, false, '🔒 Set a PIN again');
  assert.doesNotMatch(menuItem(LATER).textContent, /🔒/);
  assert.equal(env.DB.rows('SELECT pin_hash IS NULL AS none FROM profiles WHERE id = ?', LATER)[0].none, 1);
  closeSheets();
});

// A tester, 2026-10-19: a different second PIN "didn't do anything".
test('a second PIN that does not match says so on the pad and asks again; closing the pad changes nothing', async () => {
  sheetOf(LATER);   // no PIN since the test before
  $('#cloud-pin').dispatch('click');
  await settle();
  typePin('1111');
  await settle();
  assert.equal($('#pin-title').textContent, 'Once more');
  typePin('2222');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the pad stays');
  assert.equal($('#pin-title').textContent, 'A new PIN', 'from the start');
  assert.equal($('#pin-note').textContent, ui.PIN_MISMATCH);
  typePin('3333');
  await settle();
  assert.equal($('#pin-note').textContent, '', 'the note goes once a new try starts');
  typePin('3333');
  await settle();
  assert.equal(pill(), '✅ PIN set');

  $('#cloud-pin-change').dispatch('click');
  await settle();
  typePin('3333');
  await settle();
  typePin('4444');
  await settle();
  typePin('5555');
  await settle();
  assert.equal($('#pin-note').textContent, ui.PIN_MISMATCH, 'Change says it too');
  $('#pin-dialog').close();
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.ok((await call(`profiles/${LATER}/open`, { pin: '3333', remember: false })).key, 'closing kept the PIN it had');
  closeSheets();
});

test('🔄 Sync now on someone not opened yet on this visit asks for their PIN, then syncs', async () => {
  assert.equal(cloud.keyOf(THIRD), null);
  sheetOf(THIRD);
  assert.match($('#profile-cloud-text').textContent, /Syncs once they are opened with their PIN/);
  $('#cloud-sync').dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true);
  assert.match($('#pin-hint').textContent, /to sync them/);
  typePin('9090');
  await settle();
  assert.ok(cloud.keyOf(THIRD), 'a key for this visit');
  assert.equal(cloud.linkOf(THIRD).key, null, 'never stored');
  closeSheets();
});

test('☁️ off for someone with a PIN: two taps and the PIN; a tap on anything else takes the first tap back', async () => {
  sheetOf(THIRD);
  const sw = $('#profile-cloud');
  sw.dispatch('click');
  assert.match($('#profile-cloud-text').textContent, /Tap again to take them out of the cloud/);
  $('#cloud-sync').dispatch('click');
  await settle();
  assert.doesNotMatch($('#profile-cloud-text').textContent, /Tap again/, 'taken back');
  sw.dispatch('click');
  sw.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'its PIN, to delete the cloud copy');
  typePin('9090');
  await settle();
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', THIRD)[0].n, 0, 'the cloud copy is gone');
  assert.ok(state.peopleEdits.has(THIRD), 'this device keeps them');
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  assert.equal(pill(), '🔓 No PIN');
  closeSheets();
});

test('☁️ on for someone brand new puts them in the cloud now, with nothing made', async () => {
  const { setPersonEdit } = await import('../web/state.js');
  await setPersonEdit('p-fresh-1', { id: 'p-fresh-1', name: 'Duke Dumpling', fun: true, avatar: '🥟', color: '#5A2050', added: true, created: 9 });
  (await import('../web/people.js')).renderPeopleEditor();
  sheetOf('p-fresh-1');
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'false');
  $('#profile-cloud').dispatch('click');
  await settle();
  assert.ok(cloud.inCloud('p-fresh-1'));
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'true');
  assert.equal($('#profile-cloud-tools').hidden, false);
  closeSheets();
});


// A tester, 2026-10-19: a different second PIN still "cleared the screen with
// no notice". A browser fires a dialog's 'close' as a task of its own, after
// the pad has opened again for the next ask; the stand-in page fires it at
// once, which hid this. Here the pad closes the way a browser does.
test('the PIN pad closing a moment later never ends the next ask: a mismatch is said, in red, on the pad', async () => {
  const pad = $('#pin-dialog');
  const close = pad.close;
  pad.close = function () { this.open = false; setTimeout(() => this.dispatch('close')); };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  try {
    sheetOf(LATER);   // its PIN is 3333 since the mismatch test
    $('#cloud-pin-change').dispatch('click');
    await settle();
    typePin('3333');
    await settle(); await tick();
    assert.equal($('#pin-title').textContent, 'A new PIN');
    typePin('4444');
    await settle(); await tick();
    assert.equal(pad.open, true, 'Once more is still asking');
    assert.equal($('#pin-title').textContent, 'Once more');
    typePin('5555');
    await settle(); await tick();
    assert.equal(pad.open, true, 'a mismatch keeps the pad open');
    assert.equal($('#pin-note').textContent, ui.PIN_MISMATCH);
    assert.ok(pad.classList.contains('pin-wrong'), 'said in red, the dots shake');
    typePin('6666');
    await settle(); await tick();
    assert.ok(!pad.classList.contains('pin-wrong'), 'calm again on the next try');
    typePin('6666');
    await settle(); await tick();
    assert.equal(pill(), '✅ PIN changed');
    assert.ok((await call(`profiles/${LATER}/open`, { pin: '6666', remember: false })).key);
  } finally {
    pad.close = close;
  }
  closeSheets();
});
