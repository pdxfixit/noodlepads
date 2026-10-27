// A person's profile sheet after the PIN pass (Ben, 2026-10-19): the 🔒 PIN
// part (only for someone in the cloud, docs/design/cloud-needs-pin.md) says at
// a glance that a PIN is on (its pill, and 🔒 PIN by the name), what a PIN
// button just did shows in that pill, then it fades back; Change PIN and
// Remove PIN (= leave the cloud) show on a later visit too, asking for the PIN
// first; ☁️ on (the sum, a new PIN twice) puts someone in the cloud; the corner
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
const SORE = 'p-sore-1';      // in the cloud, its PIN remembered here; its syncs fail
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  await call('profiles', { id: LATER, name: 'Baron Bagel', avatar: '', color: '#304A00', pin: '1357' });
  await call('profiles', { id: THIRD, name: 'Count Cupcake', avatar: '', color: '#B3141C', pin: '9090' });
  const sore = await call('profiles', { id: SORE, name: 'Giggly Pony', avatar: '', color: '#304A00', pin: '5050' });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [
      { id: OLD, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#2E5A12', added: true, created: 1 },
      { id: LATER, name: 'Baron Bagel', fun: true, avatar: '🥯', color: '#304A00', added: true, created: 2 },
      { id: THIRD, name: 'Count Cupcake', fun: true, avatar: '🍊', color: '#B3141C', added: true, created: 3 },
      { id: SORE, name: 'Giggly Pony', fun: true, avatar: '🍩', color: '#304A00', added: true, created: 4 },
    ],
    cloud: [
      { id: LATER, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: THIRD, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: SORE, key: sore.key, rev: 0, sent: {}, sounds: {}, pin: true, remembered: true },
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
// The grown-up sum, answered right (a stand-in for the grown-up).
const answerSum = async () => {
  const sum = Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent);
  for (const d of String(sum)) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
  await settle();
};
// ☁️ on in the open sheet: the sum, then `pin` twice. Leaves the Remember offer open.
const switchOn = async (pin) => {
  $('#profile-cloud').dispatch('click');
  await settle();
  assert.equal($('#kids-sum').open, true, 'the grown-up sum comes first');
  await answerSum();
  typePin(pin);
  await settle();
  assert.equal($('#pin-title').textContent, 'Once more');
  typePin(pin);
  await settle();
};
const notNow = async () => { if ($('#remember-dialog').open) { $('#remember-no').dispatch('click'); await settle(); } };
// Each PIN person's PIN as it is now: a profile opens past it (Ben,
// 2026-10-24), so sheetOf types it when asked.
const PINS = new Map([[LATER, '1357'], [THIRD, '9090']]);
const sheetOf = async (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  const line = $('#people-edit').children.find((r) => r.dataset.person === id);
  line.querySelector('[data-profile]').dispatch('click');
  await settle();
  if ($('#pin-dialog').open) { typePin(PINS.get(id)); await settle(); }
};
const closeSheets = () => { $('#profile-dialog').close(); $('#people-dialog').close(); };
const pill = () => $('#profile-pin-state').textContent;
const menuItem = (id) => $(`.person-list [data-person="${id}"]`);

test('a person stored with an old color takes the nearest new one as it is read', async () => {
  assert.equal(state.peopleEdits.get(OLD).color, '#304A00', 'Forest is Olive now');
  assert.ok(PERSON_COLORS.includes(state.peopleEdits.get(OLD).color));
  await sheetOf(OLD);
  const picked = $('#profile-colors').querySelectorAll('[aria-pressed="true"]');
  assert.equal(picked.length, 1, 'the picker shows it chosen');
  assert.equal(picked[0].dataset.color, '#304A00');
  assert.equal($('#profile-colors').querySelectorAll('[data-color]').length, 8);
  closeSheets();
});

// Ben, 2026-10-24: a line in 👥 People had ☁️⚠️, and nothing in the sheet
// said why. A PIN not typed yet on this visit is no trouble (every open asks
// for it): ☁️✓. Real trouble shows ⚠️ on the line and before what is wrong
// in the sheet, and the open list follows a sync as it happens.
const cloudBit = (id) => $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('.pe-cloud').textContent;

test('a PIN not typed on this visit is ☁️✓ 🔒, not ⚠️; trouble is ⚠️ on the line and in the sheet, and the open list follows', async () => {
  await cloud.syncNow(THIRD);
  assert.equal(cloud.statusOf(THIRD).state, 'waiting');
  $('#people-open').dispatch('click');
  assert.equal(cloudBit(THIRD), '☁️✓ 🔒');
  // Their profile opens only past their PIN (Ben, 2026-10-24); not typed here.
  $('#people-edit').children.find((r) => r.dataset.person === THIRD).querySelector('[data-profile]').dispatch('click');
  await settle();
  assert.match($('#pin-hint').textContent, /open their profile/);
  $('#pin-dialog').close();
  await settle();
  assert.equal($('#profile-dialog').open, false);

  // A sync that fails: the open list shows ⚠️ without being reopened.
  $('#people-open').dispatch('click');
  assert.equal(cloudBit(SORE), '☁️✓ 🔒');
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).startsWith(`/api/profiles/${SORE}/records`)
    ? new Response(JSON.stringify({ error: 'busy' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    : pageFetch(url, init));
  try {
    await cloud.syncNow(SORE);
  } finally { globalThis.fetch = pageFetch; }
  await settle();
  assert.equal(cloud.statusOf(SORE).state, 'trouble');
  assert.equal(cloudBit(SORE), '☁️⚠️ 🔒', 'the open list redrew');
  await sheetOf(SORE);
  assert.match($('#profile-cloud-text').textContent, /^⚠️ \S/, 'the sheet says what, after the same ⚠️');
  closeSheets();
});

test('☁️ on for someone brand new asks the sum, then a PIN twice, and puts them in the cloud; the pill says ✅ In the cloud, PIN set, then fades to 🔒 PIN on', async () => {
  await sheetOf(OLD);
  assert.equal(cloud.inCloud(OLD), false, 'nothing made: not in the cloud');
  assert.equal($('#profile-pin-part').hidden, true, 'no PIN part until they are in the cloud');
  await switchOn('2468');
  assert.ok(cloud.inCloud(OLD), 'in the cloud now');
  assert.equal(cloud.linkOf(OLD).pin, true);
  assert.equal(env.DB.rows('SELECT pin_hash IS NOT NULL AS pin FROM profiles WHERE id = ?', OLD)[0].pin, 1);
  assert.equal($('#remember-dialog').open, true, 'then 🔑 Remember them here? is offered');
  await notNow();
  assert.equal(pill(), '✅ In the cloud, PIN set', 'what just happened, where PIN on shows');
  assert.equal($('#profile-pin-part').hidden, false);
  assert.equal($('#cloud-pin'), null, 'no 🔒 Set a PIN any more');
  assert.equal($('#profile-pin-tools').hidden, false, 'Change PIN and Remove PIN');
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'true', 'the switch is on');
  assert.match(menuItem(OLD).textContent, /🔒$/, 'the corner menu says so too');
  // A timer can fire a little before Date.now() says it is due (GitHub,
  // 2026-10-25): the pill still fades. Here the clock is held back past due.
  const now = Date.now;
  Date.now = () => now() - ui.PIN_FLASH_MS - 5;
  try {
    await new Promise((r) => setTimeout(r, ui.PIN_FLASH_MS + 100));
  } finally {
    Date.now = now;
  }
  assert.equal(pill(), '🔒 PIN on');
  closeSheets();
});

test('Change PIN asks for the PIN now (a wrong one asks again), then the new one twice', async () => {
  await sheetOf(OLD);
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

test('on a later visit Change and Remove PIN still show; Remove PIN asks "Leave the cloud?", then the PIN, and takes them out of the cloud', async () => {
  assert.equal(cloud.keyOf(LATER), null, 'not opened on this visit: no key');
  await sheetOf(LATER);
  assert.equal(pill(), '🔒 PIN on');
  assert.equal($('#profile-pin-tools').hidden, false, 'no dead end');
  assert.match(menuItem(LATER).textContent, /🔒$/);
  const off = $('#cloud-pin-off');
  off.dispatch('click');
  assert.equal(off.textContent, 'Leave the cloud?');
  assert.ok(off.classList.contains('armed'));
  assert.equal($('#cloud-pin-off-note').hidden, false);
  assert.equal($('#cloud-pin-off-note').textContent, 'Tap again, then type the PIN: their cloud copy is deleted for every device, and links you shared stop working. This device keeps everything.');
  const parts = $('#profile-pin-part').children;
  assert.equal(parts.indexOf($('#cloud-pin-off-note')), parts.indexOf($('#profile-pin-tools')) + 1, 'the note sits right under the buttons');
  assert.equal($('#pin-dialog').open, false, 'one tap asks nothing yet');
  off.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true);
  typePin('1357');
  await settle();
  assert.equal(cloud.inCloud(LATER), false, 'out of the cloud');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', LATER)[0].n, 0, 'their cloud copy is deleted');
  assert.ok(state.peopleEdits.has(LATER), 'this device keeps them');
  assert.equal($('#profile-pin-part').hidden, true, 'the PIN part goes with the cloud');
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'false');
  assert.doesNotMatch(menuItem(LATER).textContent, /🔒/);
  assert.equal(off.textContent, 'Remove PIN', 'the button is itself again');
  closeSheets();
});

// A tester, 2026-10-19: a different second PIN "didn't do anything".
test('a second PIN that does not match says so on the pad and asks again; closing the pad changes nothing', async () => {
  await sheetOf(LATER);   // out of the cloud since the test before
  $('#profile-cloud').dispatch('click');
  await settle();
  await answerSum();
  typePin('1111');
  await settle();
  assert.equal($('#pin-title').textContent, 'Once more');
  typePin('2222');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the pad stays');
  assert.equal($('#pin-title').textContent, '☁️ Pick their PIN', 'from the start, with the public line');
  assert.equal($('#pin-public').hidden, false);
  assert.equal($('#pin-note').textContent, ui.PIN_MISMATCH);
  assert.equal(cloud.inCloud(LATER), false, 'nothing went to the cloud');
  typePin('3333');
  await settle();
  assert.equal($('#pin-note').textContent, '', 'the note goes once a new try starts');
  typePin('3333');
  await settle();
  await notNow();
  assert.equal(pill(), '✅ In the cloud, PIN set');

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

test('the PIN that opens the profile of someone not opened yet also opens them for 🔄 Sync now', async () => {
  assert.equal(cloud.keyOf(THIRD), null);
  await sheetOf(THIRD);   // asks for 9090
  assert.ok(cloud.keyOf(THIRD), 'a key for this visit');
  assert.equal(cloud.linkOf(THIRD).key, null, 'never stored');
  $('#cloud-sync').dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false, 'not asked again');
  closeSheets();
});

test('☁️ off: two taps and the PIN, with the same words as Remove PIN; a tap on anything else takes the first tap back', async () => {
  await sheetOf(THIRD);
  const sw = $('#profile-cloud');
  sw.dispatch('click');
  assert.match($('#profile-cloud-text').textContent, /^Leave the cloud\? Tap again, then type the PIN: their cloud copy is deleted for every device, and links you shared stop working\. This device keeps everything\./);
  assert.ok($('#profile-cloud-text').classList.contains('danger'));
  $('#cloud-sync').dispatch('click');
  await settle();
  assert.doesNotMatch($('#profile-cloud-text').textContent, /Leave the cloud/, 'taken back');
  // Remove PIN and the switch are one ask: arming one takes the other back.
  sw.dispatch('click');
  $('#cloud-pin-off').dispatch('click');
  assert.ok(!sw.classList.contains('armed') && $('#cloud-pin-off').classList.contains('armed'));
  sw.dispatch('click');
  assert.ok(sw.classList.contains('armed') && !$('#cloud-pin-off').classList.contains('armed'));
  sw.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'its PIN, to leave');
  $('#pin-dialog').close();
  await settle();
  assert.ok(cloud.inCloud(THIRD), '✕ on the pad sends nothing and leaves them in the cloud');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', THIRD)[0].n, 1);
  sw.dispatch('click');
  sw.dispatch('click');
  await settle();
  typePin('9090');
  await settle();
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', THIRD)[0].n, 0, 'the cloud copy is gone');
  assert.ok(state.peopleEdits.has(THIRD), 'this device keeps them');
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  assert.equal($('#profile-pin-part').hidden, true);
  closeSheets();
});

test('✕ at the sum, the first PIN pad or Once more sends nothing: they stay on this device, the switch off', async () => {
  const { setPersonEdit } = await import('../web/state.js');
  await setPersonEdit('p-fresh-1', { id: 'p-fresh-1', name: 'Duke Dumpling', fun: true, avatar: '🥟', color: '#5A2050', added: true, created: 9 });
  (await import('../web/people.js')).renderPeopleEditor();
  await sheetOf('p-fresh-1');
  const sw = $('#profile-cloud');
  const before = env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n;
  const nothingSent = (what) => {
    assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, before, `${what}: no profile made`);
    assert.equal(cloud.inCloud('p-fresh-1'), false, `${what}: no link`);
    assert.equal(sw.getAttribute('aria-checked'), 'false', `${what}: the switch is off`);
  };
  sw.dispatch('click');
  await settle();
  assert.match($('#kids-sum-why').textContent, /^☁️ To put 🥟 Duke Dumpling in the cloud$/);
  assert.equal($('#kids-sum-why').hidden, false);
  $('#kids-sum').close();
  await settle();
  assert.equal($('#pin-dialog').open, false);
  nothingSent('✕ at the sum');
  sw.dispatch('click');
  await settle();
  await answerSum();
  assert.equal($('#pin-title').textContent, '☁️ Pick their PIN');
  $('#pin-dialog').close();
  await settle();
  nothingSent('✕ at the first pad');
  sw.dispatch('click');
  await settle();
  await answerSum();
  typePin('1111');
  await settle();
  assert.equal($('#pin-title').textContent, 'Once more');
  assert.equal($('#pin-public').hidden, true, 'the public line is on the first pad only');
  $('#pin-dialog').close();
  await settle();
  nothingSent('✕ at Once more');
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
    await sheetOf(LATER);   // its PIN is 3333 since the mismatch test
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
