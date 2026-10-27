// The cloud's screens on the real app (stand-in page), against the real
// Worker and a fake D1: People lines that open a profile sheet with no name
// field, 🎲, the picture and the color, its PIN guard once per visit;
// nobody goes to the cloud by themselves (a grown-up's switch does it, with a
// PIN: tests/cloud-needs-pin.test.mjs has that flow, and `goUp` stands in for
// it here; a typed name never reaches the cloud); the PIN asked each time a
// person is opened, a PIN new to this device (🤷 I don't know the PIN); the
// switch off; 🔗 Share and Shared with me; and the app with no /api at all
// (the dev server, a static copy).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { readFileSync } from 'node:fs';
import { isFunName, funName } from '../web/names.js';
import { PIN_RESET_EMAIL } from '../web/contact.js';
import { FakeAudioBuffer, fakeBuffer } from './helpers.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';

let page;
let $;
let state;
let cloud;
let ui;
let setPersonEdit;
let renderPeople;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
let apiDown = false;
let added = null;   // the person the first test adds
const remembered = new Map();
const storage = {
  getItem: (k) => (remembered.has(k) ? remembered.get(k) : null),
  setItem: (k, v) => remembered.set(k, String(v)),
  removeItem: (k) => remembered.delete(k),
};

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest(), storage });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  // /api/ goes to the Worker, as on noodlepads.com; everything else as before.
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      if (apiDown) return new Response('<h1>404</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
    }
    return pageFetch(url, init);
  };
  await (await import('../web/app.js')).ready;   // drawn and wired
  ({ state, setPersonEdit } = await import('../web/state.js'));
  ({ renderPeople } = await import('../web/pads.js'));
  cloud = await import('../web/cloud.js');
  ui = await import('../web/cloud-ui.js');
  await page.settle();
});

const rows = () => $('#people-edit').children;
// The profile sheet of line `i` in 👥 People (opened if it isn't already).
const profile = (i) => {
  const line = rows()[i].querySelector('[data-profile]');
  if (!$('#profile-dialog').open || $('#profile-reroll').dataset.reroll !== line.dataset.profile) line.dispatch('click');
  return $('#profile-dialog');
};
const dice = (i) => profile(i).querySelector('[data-reroll]');
// Person `id`'s profile sheet, from 👥 People; and closing both again.
const sheetOf = (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  return profile(rows().findIndex((r) => r.dataset.person === id));
};
const closeSheets = () => { $('#profile-dialog').close(); $('#people-dialog').close(); };
// The page settled: no cloud request or PIN hash in flight (PBKDF2, 20,000
// rounds, off the main thread: slow when every core is busy). page.settle()
// counts both (tests/fake-dom.mjs, "Work in flight").
const settle = () => page.settle();
const typePin = (digits) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
// What the switch does after the sum and the pads: the person goes up with this PIN.
const UP_PIN = '2468';
const up = async (id) => { if (!cloud.inCloud(id)) await cloud.goUp(id, UP_PIN); };
const choose = (id) => $(`.person-list [data-person="${id}"]`).dispatch('click');
// Something made: a person who made something still stays on the device.
const makeBeat = (personId) => state.savedBeats.push({ id: `beat-${personId}`, personId, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${personId}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 });

test('People: no name field; each line has a picture and its made-up name; its profile has 🎲, the picture and ☁️ (off: only on this device)', async () => {
  $('#people-open').dispatch('click');
  $('#person-add').dispatch('click');
  await settle();
  assert.equal($('#people-dialog').querySelectorAll('input').length, 0);
  const row = rows()[4];
  added = row.dataset.person;
  assert.ok(isFunName(row.querySelector('.pe-name').textContent));
  assert.ok(row.querySelector('.pe-badge'));
  assert.equal(row.querySelector('.pe-cloud'), null, 'only on this device: no ☁️ on the line');
  assert.equal(rows()[0].querySelector('.pe-cloud'), null, "boards.json's own people can't go in the cloud");
  const sheet = profile(4);
  assert.equal(sheet.querySelectorAll('input').length, 0);
  assert.ok(sheet.querySelector('[data-avatar]') && sheet.querySelector('[data-reroll]'));
  assert.equal($('#profile-cloud').hidden, false);
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'false', 'not in the cloud yet');
  assert.match($('#profile-cloud-text').textContent, /^Only on this device\. A grown-up can put them in the cloud with a PIN/);
  assert.equal($('#profile-pin-part').hidden, true, 'a PIN now means the cloud: nothing to set on its own');
  assert.equal($('#cloud-pin'), null, 'no 🔒 Set a PIN');
  profile(0);
  assert.equal($('#profile-cloud').hidden, true);
  $('#profile-dialog').close();
});

test('one tap on 🎲 opens Pick a name; closing it keeps the name, and a pick is never one someone has', async () => {
  const id = added;
  const before = state.peopleEdits.get(id).name;
  dice(4).dispatch('click');
  await settle();
  assert.equal($('#names-dialog').open, true, 'a list to choose from, not a new name at once');
  assert.equal(state.peopleEdits.get(id).name, before);
  $('#names-dialog').close();
  await settle();
  assert.equal(state.peopleEdits.get(id).name, before, 'changing your mind changes nothing');
  dice(4).dispatch('click');
  $('#names-list').querySelector('[data-pick-name]').dispatch('click');
  await settle();
  const now = state.peopleEdits.get(id);
  assert.ok(isFunName(now.name) && now.fun === true && now.name !== before);
  assert.ok(!['Pip', 'Juno', 'Toby', 'Wren'].includes(now.name));
});

// Ben, 2026-10-11: a person renamed "Salacious Crumb", picked from a list.
test('holding 🎲 (right-click, Shift+Enter) opens Pick a name: a dozen fun names and the special ones; one tap uses it', async () => {
  const id = added;
  const reroll = () => dice(4);
  const before = state.peopleEdits.get(id).name;
  reroll().dispatch('contextmenu');
  assert.equal($('#names-dialog').open, true);
  const names = () => $('#names-list').querySelectorAll('[data-pick-name]').map((b) => b.dataset.pickName);
  assert.equal(names().length, 13, names().join(', '));
  assert.ok(names().includes('Salacious Crumb'));
  assert.ok(!names().includes(before), 'never the name they have');
  assert.equal(new Set(names()).size, 13);
  assert.ok(names().every(isFunName));
  $('#names-list').querySelectorAll('[data-pick-name]').find((b) => b.dataset.pickName === 'Salacious Crumb').dispatch('click');
  await settle();
  assert.equal($('#names-dialog').open, false);
  assert.deepEqual([state.peopleEdits.get(id).name, state.peopleEdits.get(id).fun], ['Salacious Crumb', true]);
  assert.equal(rows()[4].querySelector('.pe-name').textContent, 'Salacious Crumb');
  // Shift+Enter opens it too, and a special name someone has is not offered again.
  dice(3).dispatch('keydown', { key: 'Enter', shiftKey: true });
  assert.equal($('#names-dialog').open, true);
  assert.ok(!names().includes('Salacious Crumb'), 'one Salacious Crumb at a time');
  $('#names-dialog').close();
  // A long press: the list opens, and the tap that ends it is not a reroll.
  reroll().dispatch('pointerdown');
  await new Promise((r) => setTimeout(r, 560));
  assert.equal($('#names-dialog').open, true);
  reroll().dispatch('click');
  await settle();
  assert.equal(state.peopleEdits.get(id).name, 'Salacious Crumb');
  $('#names-dialog').close();
});

test('the picture picker sets the avatar, and the corner shows it', async () => {
  const id = added;
  profile(4).querySelector('[data-avatar]').dispatch('click');
  assert.equal($('#avatar-dialog').open, true);
  $('#avatar-grid').querySelector('[data-avatar="🦖"]').dispatch('click');
  await settle();
  assert.equal(state.peopleEdits.get(id).avatar, '🦖');
  assert.equal($('#avatar-dialog').open, false);
  assert.equal($('.person-menu-btn').children[0].textContent, '🦖', 'the new person is the one showing');
});

test('nobody goes to the cloud by themselves, even after making something', async () => {
  const id = added;
  await setPersonEdit(id, { name: 'Typed Name', fun: false });
  await cloud.syncAll();
  assert.equal(cloud.inCloud(id), false, 'nothing made yet');
  makeBeat(id);
  await Promise.all([cloud.syncAll(), cloud.syncAll()]);
  assert.equal(cloud.inCloud(id), false, 'made something: still only on this device');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles')[0].n, 0, 'nothing was sent');
  sheetOf(id);
  assert.match($('#profile-cloud-text').textContent, /^Only on this device/);
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'false');
  closeSheets();
});

// Ben, 2026-10-19: "an actual button on the left mirroring the add a person".
test('👥 People: ☁️ Open from the cloud is a real button on the left, ➕ Add a person on the right', () => {
  const [left, right] = $('#people-dialog').querySelector('.sheet-actions').children;
  assert.ok(left === $('#cloud-browse') && right === $('#person-add'));
  assert.equal(left.className, 'secondary', 'a button, not an underlined link');
  assert.equal(right.className, 'primary');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = (sel) => css.match(new RegExp(`\\n${sel.replace('.', '\\.')} \\{([^}]*)\\}`))[1];
  for (const prop of ['min-height', 'border-radius', 'font-weight', 'font-size']) {
    const of = (sel) => rule(sel).match(new RegExp(`${prop}: ([^;]+);`))?.[1];
    assert.equal(of('.secondary'), of('.primary'), `${prop} mirrors ➕ Add a person`);
  }
});

test('☁️ Open from the cloud: a PIN pad with no Remember on this device, and what to do about a forgotten PIN', async () => {
  await cloud.api.create({ id: 'p-far', name: 'Sir Squid', avatar: '🐙', color: '#0C5E4B', pin: '2468' });
  $('#cloud-browse').dispatch('click');
  await settle();
  const items = $('#cloud-list-items').children;
  assert.deepEqual(items.map((li) => li.querySelector('.cl-text').textContent), ['Sir Squid'], 'not the one already here');
  const open = items[0].querySelector('[data-open]');
  assert.match(open.getAttribute('aria-label'), /has a PIN/);
  open.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true);
  assert.equal($('#pin-remember'), null, 'no device remembers a PIN (Ben, 2026-10-19)');
  assert.equal($('#pin-unknown').hidden, true, 'nothing of theirs is here to delete');
  assert.equal($('#pin-forgot').hidden, false);
  assert.ok($('#pin-forgot').textContent.includes(PIN_RESET_EMAIL), 'the forgotten-PIN line shows the address from web/contact.js');
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again');
  assert.match($('#pin-note').textContent, /4 tries left/);
  typePin('2468');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.ok(cloud.inCloud('p-far'), 'on this device now');
  assert.equal(cloud.linkOf('p-far').key, null, 'the key is not stored');
  assert.ok(cloud.keyOf('p-far'), 'it is held for this visit');
  assert.equal($('#cloud-open-name').textContent, 'Sir Squid', 'the sheet turns to them');
  // This stand-in page has no IndexedDB, so nothing can be stored: the open
  // stops, locked on 🔄 Try again and ✕ Don't bring them (tests/cloud-open.test.mjs
  // has the whole flow). ☁️ Open someone else, hidden there, puts the list
  // back for the tests below, the link kept.
  assert.equal($('#cloud-open').dataset.step, 'stopped');
  $('#cloud-open-more').dispatch('click');
  await settle();
  $('#cloud-list').close();
});

test('a PIN is asked each time the person is opened, every time, unless 🔑 Remember is tapped (tests/pin-remember.test.mjs)', async () => {
  // Joined up as a person on this device (the first sync would do this).
  await setPersonEdit('p-far', { id: 'p-far', name: 'Sir Squid', avatar: '🐙', color: '#0C5E4B', added: true, fun: true, created: 2 });
  renderPeople();
  const before = state.personId;
  cloud.leftPerson('p-far');
  choose('p-far');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'its PIN is asked');
  assert.equal(state.personId, before, 'the board does not change until it is typed');
  typePin('0000');
  await settle();
  assert.equal(state.personId, before);
  typePin('2468');
  await settle();
  assert.equal(state.personId, 'p-far');
  for (let i = 0; i < 2; i++) {
    choose(before);
    choose('p-far');
    await settle();
    assert.equal($('#pin-dialog').open, true, 'asked again after switching away');
    typePin('2468');
    await settle();
    assert.equal(state.personId, 'p-far');
    assert.equal(cloud.linkOf('p-far').key, null, 'never kept on the device');
  }
  assert.equal($('#profile-dialog').querySelector('#cloud-forget'), null, 'no 🙈 Forget: nothing is remembered to forget');
});

// A person in the cloud with a PIN this device has not had typed on this visit,
// holding a key (as one opened earlier in the visit does).
async function personWithPin(id, pin) {
  const name = funName(names());
  await setPersonEdit(id, { id, name, fun: true, avatar: '🐙', color: '#1F3FA8', added: true, created: 3 });
  makeBeat(id);
  const { key } = await cloud.api.create({ id, name, avatar: '🐙', color: '#1F3FA8', pin });
  state.cloud.set(id, { id, key, rev: 0, sent: {}, sounds: {}, pin: true, remember: true });
  renderPeople();
  (await import('../web/people.js')).renderPeopleEditor();
}
const names = () => [...state.peopleEdits.values()].map((p) => p.name).filter(Boolean);
const lineOf = (id) => rows().findIndex((r) => r.dataset.person === id);
const swatch = (i) => $('#profile-colors').querySelectorAll('[data-color]')[i];

// Ben, 2026-10-12: "choose their own color in their profile, protected by pin…
// right now anyone can change a name or color"; 2026-10-24: everything that
// reads or changes a person is behind their PIN, so their profile opens only
// past it, once per visit.
test('a PIN guards the profile: asked before it opens, once per visit; a wrong one says so; closing it opens nothing', async () => {
  const id = 'p-guard';
  await personWithPin(id, '1357');
  assert.equal(cloud.pinGuards(id), true);
  $('#people-open').dispatch('click');
  rows()[lineOf(id)].querySelector('[data-profile]').dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'opening their profile asks for the PIN');
  assert.match($('#pin-hint').textContent, /open their profile/);
  $('#pin-dialog').close();
  await settle();
  assert.equal($('#profile-dialog').open, false, 'closing the PIN pad opens nothing');

  rows()[lineOf(id)].querySelector('[data-profile]').dispatch('click');
  await settle();
  typePin('0000');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again');
  assert.match($('#pin-note').textContent, /That PIN isn't right\. 4 tries left/);
  typePin('1357');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal($('#profile-dialog').open, true, 'the right PIN opens it');
  assert.match($('#profile-pin-hint').textContent, /before the name, picture or color changes/);
  assert.equal($('#profile-pin-state').textContent, '🔒 PIN on');
  assert.ok($('#profile-lock') === null, "the title is the name alone: the PIN part says there's a PIN (Ben, 2026-10-24)");
  assert.equal(cloud.pinGuards(id), false, 'typed once on this visit');
  assert.ok(cloud.keyOf(id), 'still open on this device');

  swatch(2).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false, 'a change is not asked again');
  assert.equal(state.peopleEdits.get(id).color, swatch(2).dataset.color);
  dice(lineOf(id)).dispatch('click');
  await settle();
  assert.equal($('#names-dialog').open, true, '🎲 opens at once');
  $('#names-dialog').close();
  profile(lineOf(id)).querySelector('[data-avatar]').dispatch('click');
  assert.equal($('#avatar-dialog').open, true, 'the picture opens at once');
  $('#avatar-dialog').close();
  $('#profile-dialog').close();
});

test('someone only on this device opens their profile and changes the color at once; five wrong PINs mean the 10-minute wait, said plainly', async () => {
  profile(lineOf(added));
  swatch(4).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal(state.peopleEdits.get(added).color, swatch(4).dataset.color);
  $('#profile-dialog').close();

  const id = 'p-lock';
  await personWithPin(id, '2580');
  rows()[lineOf(id)].querySelector('[data-profile]').dispatch('click');
  await settle();
  for (let i = 0; i < 5; i++) { typePin('1111'); await settle(); }
  assert.equal($('#pin-dialog').open, false, 'the pad gives way to the wait');
  assert.match($('#banner-text').textContent, /Too many wrong tries\. Wait 10 minutes/);
  assert.equal($('#profile-dialog').open, false);
  assert.equal(cloud.pinGuards(id), true, 'still guarded');
  $('#people-dialog').close();
});

test('the guard is a gate on this device\'s screens only: a sync that changes a guarded person shows at once', async () => {
  const id = 'p-lock';
  assert.equal(cloud.pinGuards(id), true);
  for (const file of ['state.js', 'cloud-sync.js', 'merge.js', 'merge3.js']) {
    assert.ok(!readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8').includes('pinGuards'), `${file} knows nothing of the guard`);
  }
  $('#people-open').dispatch('click');
  // What a pull does with another device's new name (the backup merge's setPersonEdit).
  await setPersonEdit(id, { name: 'Captain Cranberries' });
  renderPeople();
  (await import('../web/people.js')).refreshPeople();
  assert.equal(rows()[lineOf(id)].querySelector('.pe-name').textContent, 'Captain Cranberries');
  $('#people-dialog').close();
});

// Ben, 2026-10-19: "Let Cloud be a toggle"; 2026-10-26: leaving asks the PIN, and nothing is put back by itself.
test('a grown-up puts them up (a typed name is swapped for a fun one); ☁️ off asks twice, then the PIN, deletes the cloud copy, keeps everything here, and is never put back by itself', async () => {
  const id = added;
  await setPersonEdit(id, { name: 'Typed Name', fun: false });
  await cloud.goUp(id, UP_PIN);
  const [row] = env.DB.rows('SELECT * FROM profiles WHERE id = ?', id);
  assert.ok(isFunName(row.name), row.name);
  assert.equal(row.avatar, '🦖');
  assert.ok(row.pin_hash, 'with a PIN');
  assert.ok(!JSON.stringify(env.DB.rows('SELECT * FROM profiles')).includes('Typed Name'));
  assert.equal(state.peopleEdits.get(id).name, row.name, 'the device shows the same fun name');
  assert.equal(cloud.linkOf(id).pin, true);
  assert.equal(cloud.linkOf(id).key, null, "a PIN's key is not kept on the device");
  assert.ok(cloud.keyOf(id), 'but held for this visit');

  sheetOf(id);
  const sw = $('#profile-cloud');
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  assert.equal($('#profile-cloud-tools').hidden, false, '🔄 Sync now and 🔗 Share… under it');
  assert.equal($('#profile-pin-part').hidden, false, 'the PIN part shows in the cloud');
  assert.match($('#profile-pin-hint').textContent, /Removing it takes .* out of the cloud\./);
  sw.dispatch('click');
  assert.match($('#profile-cloud-text').textContent, /^Leave the cloud\? Tap again, then type the PIN: their cloud copy is deleted for every device, and links you shared stop working\. This device keeps everything\./);
  assert.ok(cloud.inCloud(id), 'one tap does nothing yet');
  assert.equal($('#pin-dialog').open, false);
  // Leaving brings their latest here first, and a sync needs storage, which this page has not got until now.
  const { db } = await import('../web/store.js');
  globalThis.indexedDB = fakeIndexedDB();
  await db.open();
  for (const r of state.peopleEdits.values()) await db.put('people', r);
  for (const l of state.cloud.values()) await db.put('cloud', l);
  for (const r of state.savedBeats) await db.put('beats', r);
  sw.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the second tap asks the PIN');
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a wrong PIN asks again');
  assert.match($('#pin-note').textContent, /3 tries left|4 tries left/);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 1, 'nothing deleted by a wrong PIN');
  typePin(UP_PIN);
  await settle();
  db.handle = null;
  delete globalThis.indexedDB;
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 0, `gone from the cloud: ${$('#profile-cloud-text').textContent}`);
  assert.ok(state.savedBeats.some((b) => b.personId === id), 'still here');
  assert.equal(state.peopleEdits.get(id).offline, undefined, 'no 📴 Offline is written any more');
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  assert.match($('#profile-cloud-text').textContent, /^Only on this device/);
  assert.equal($('#profile-pin-part').hidden, true);
  await cloud.syncAll();
  assert.equal(cloud.inCloud(id), false, 'not put back by itself');
  closeSheets();
});

test('🔗 Share gives a code; Shared with me opens it, offers 🎛️ Remix, and removes it with two taps', async () => {
  const id = added;
  await up(id);
  sheetOf(id);
  $('#cloud-share').dispatch('click');
  await settle();
  assert.equal($('#share-dialog').open, true);
  $('#share-what').querySelector('[data-kind="beat"]').dispatch('click');
  $('#share-items').querySelector(`[data-item="beat-${id}"]`).dispatch('click');
  await settle();
  typePin(UP_PIN);   // 🔗 Share always asks the PIN
  await settle();
  await settle();
  assert.equal($('#share-made').hidden, false, $('#share-note').textContent);
  const code = $('#share-code').textContent;
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  $('#share-dialog').close();
  closeSheets();

  $('#shared-browse').dispatch('click');
  assert.equal($('#shared-dialog').open, true);
  $('#shared-code').value = code.toLowerCase();
  $('#shared-open').dispatch('click');
  await settle();
  const item = () => $('#shared-items').children[0];
  assert.match(item().querySelector('.cl-text').textContent, /Wobbly Taco/);
  assert.match($('#shared-note').textContent, /in your list now/);
  // Remixing runs the backup merge, which needs storage this page has not got;
  // cloud-sync.test.mjs remixes a share end to end.
  assert.match(item().querySelector('[data-remix]').getAttribute('aria-label'), /^Remix Wobbly Taco onto /);
  item().querySelector('[data-remove]').dispatch('click');
  assert.equal($('#shared-items').children.length, 1, 'one tap asks');
  assert.match(item().querySelector('[data-remove]').textContent, /Remove\?/);
  item().querySelector('[data-remove]').dispatch('click');
  assert.equal($('#shared-items').children.length, 0, 'gone from this list');
  assert.equal((await cloud.api.shared(code)).title, 'Wobbly Taco', 'the share itself is still there');
  $('#shared-dialog').close();
});

// Ben, 2026-10-11 (Q18): "allow to be unshared. copies remain".
test('🚫 Unshare: the sharer\'s Shared already lists the code; two taps end it, and Shared with me says "No longer shared"', async () => {
  const id = added;
  const { code } = await cloud.shareItem(id, 'beat', `beat-${id}`);
  $('#shared-browse').dispatch('click');
  $('#shared-code').value = code;
  $('#shared-open').dispatch('click');
  await settle();
  $('#shared-dialog').close();

  sheetOf(id);
  $('#cloud-share').dispatch('click');
  await settle();
  const mine = () => $('#share-mine').children.find((li) => li.querySelector(`[data-unshare="${code}"]`));
  assert.ok(mine(), `listed under Shared already: ${$('#share-mine-note').textContent}`);
  mine().querySelector('[data-unshare]').dispatch('click');
  assert.match(mine().querySelector('[data-unshare]').textContent, /Unshare\?/, 'one tap asks');
  assert.equal((await cloud.api.shared(code)).title, 'Wobbly Taco', 'nothing happens on one tap');
  mine().querySelector('[data-unshare]').dispatch('click');
  await settle();
  assert.equal(mine(), undefined, 'gone from Shared already');
  assert.match($('#share-mine-note').textContent, /Unshared/);
  await assert.rejects(cloud.api.shared(code), (err) => err.status === 404, 'the code stops working for everyone');
  $('#share-dialog').close();
  closeSheets();

  $('#shared-browse').dispatch('click');
  await settle();
  const li = $('#shared-items').children.find((x) => x.dataset.code === code);
  assert.match(li.querySelector('.cl-code').textContent, /No longer shared/);
  assert.equal(li.querySelector('[data-play]'), null, 'nothing to play');
  assert.equal(li.querySelector('[data-remix]'), null, 'nothing to remix');
  li.querySelector('[data-remove]').dispatch('click');
  li.querySelector('[data-remove]').dispatch('click');
  assert.equal($('#shared-items').children.some((x) => x.dataset.code === code), false, 'it can be removed');
  $('#shared-dialog').close();
});

test('PIN pad keys are big enough, and ⌫ takes a digit back', async () => {
  const asked = ui.askPin({ title: 'Test' });
  const keys = $('#pin-keys').children;
  assert.deepEqual(keys.map((k) => k.dataset.key), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫']);
  typePin('12⌫345');
  assert.equal(await asked, '1345');
});

// Ben, 2026-10-16: 🔓 What's private left Settings; the shared privacy policy says it.
test('Settings has no 🔓 What\'s private; the PIN pad still says where a forgotten PIN goes', async () => {
  assert.equal($('#set-privacy'), null);
  assert.equal($('#privacy-list'), null);
  const { FORGOT_PIN } = await import('../web/cloud-ui.js');
  assert.ok(FORGOT_PIN.includes(PIN_RESET_EMAIL), 'the PIN pad names the address from web/contact.js');
});

// Found by `just cloud-e2e` (2026-10-11): the start-up sync and one right
// after a change both made the profile. Syncs make no profile at all now
// (docs/design/cloud-needs-pin.md): only goUp, from a grown-up's switch.
test('syncs at once make no profile for a person who made something, and say no trouble', async () => {
  const id = 'p-twice';
  await setPersonEdit(id, { name: 'Sir Squid', fun: true, avatar: '🐙', color: '#0C5E4B', added: true, created: 1 });
  makeBeat(id);
  await Promise.all([cloud.syncAll(), cloud.syncAll(), cloud.syncAll()]);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM profiles WHERE id = 'p-twice'")[0].n, 0);
  assert.equal(cloud.inCloud(id), false);
  assert.equal(cloud.statusOf(id), null);
});

// ▶ Play in 🔗 Shared with me plays through the app's player (audio.start):
// stopping everything (Esc, entering 🧸 Kids) stops it, and the grille lights.
test('▶ Play on a share plays as the app\'s sounds do: the grille wakes, and stopping everything stops it', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const sources = [];
  let started = 0;
  const real = { source: ctx.createBufferSource, shared: cloud.api.shared, sound: cloud.api.fetchSound, decode: audio.decode, started: audio.on.started };
  ctx.createBufferSource = () => {
    const ended = [];
    const s = {
      connect() {}, disconnect() {}, start() {}, playbackRate: { value: 1 }, stops: [],
      stop(t) { s.stops.push(t); },
      addEventListener(type, fn) { if (type === 'ended') ended.push(fn); },
      end() { s.onended?.(); for (const fn of ended) fn(); },   // what the browser does once it stops
    };
    sources.push(s);
    return s;
  };
  cloud.api.shared = async () => ({ kind: 'sound', title: 'Wobbly Taco', preview: 'sound-1' });
  cloud.api.fetchSound = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });
  globalThis.AudioBuffer ??= FakeAudioBuffer;
  // A quiet preview (peak 0.3): it plays levelled as a pad is, at peak 0.9.
  audio.decode = async () => fakeBuffer([Array.from({ length: 2000 }, (_, i) => 0.3 * Math.sin(i / 5))], 1000);
  // Counted, and passed on to the app's own hook: the grille's meter starts.
  const { meter } = await import('../web/meter.js');
  meter.raf = 0;
  audio.on.started = () => { started++; real.started(); };
  try {
    $('#shared-browse').dispatch('click');
    $('#shared-code').value = 'WXYZ-2345';
    $('#shared-open').dispatch('click');
    await settle();
    const play = () => $('#shared-items').children.find((x) => x.dataset.code === 'WXYZ2345').querySelector('[data-play]');
    play().dispatch('click');
    await settle();
    assert.equal(play().textContent, '■ Stop');
    assert.ok(audio.playing.has('share-preview'), 'it plays through audio.start');
    const heard = sources[0].buffer.getChannelData(0);
    assert.ok(Math.abs(Math.max(...heard.map(Math.abs)) - 0.9) < 1e-6, 'levelled to peak 0.9, as loud as a pad');
    assert.equal(started, 1, 'the grille is told a sound began, once');
    assert.ok(meter.raf, 'and the meter runs');
    audio.stopAll();
    assert.equal(audio.playing.has('share-preview'), false, 'stopping everything stops it');
    assert.equal(sources[0].stops.length, 2, 'its scheduled end, then the stop');
    sources[0].end();
    assert.equal(play().textContent, '▶ Play', 'the button follows');
    play().dispatch('click');
    await settle();
    play().dispatch('click');
    assert.equal(audio.playing.has('share-preview'), false, '■ Stop stops it');
    assert.equal(play().textContent, '▶ Play');
  } finally {
    Object.assign(ctx, { createBufferSource: real.source });
    Object.assign(cloud.api, { shared: real.shared, fetchSound: real.sound });
    audio.decode = real.decode;
    audio.on.started = real.started;
    audio.stop('share-preview');
    cloud.forgetShare('WXYZ2345');
    $('#shared-dialog').close();
  }
});

// Each share played keeps its decoded preview for the visit, so a second ▶
// is instant; only the last few are kept, so a long Shared with me list
// played through does not fill a phone's memory.
test('▶ Play keeps only the last few shares\' previews: an early one is fetched again', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const real = { source: ctx.createBufferSource, shared: cloud.api.shared, sound: cloud.api.fetchSound, decode: audio.decode };
  ctx.createBufferSource = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, playbackRate: { value: 1 }, addEventListener() {} });
  const fetched = [];
  cloud.api.shared = async (code) => ({ kind: 'sound', title: `Toot ${code.at(-1)}`, preview: `sound-${code}` });
  cloud.api.fetchSound = async (id) => { fetched.push(id); return { arrayBuffer: async () => new ArrayBuffer(8) }; };
  globalThis.AudioBuffer ??= FakeAudioBuffer;
  audio.decode = async () => fakeBuffer([Array.from({ length: 200 }, (_, i) => 0.3 * Math.sin(i / 5))], 1000);
  const codes = ['AAAA2222', 'AAAA2223', 'AAAA2224', 'AAAA2225', 'AAAA2226', 'AAAA2227'];
  const play = async (code) => {
    $('#shared-items').children.find((x) => x.dataset.code === code).querySelector('[data-play]').dispatch('click');
    await settle();
    audio.stop('share-preview');
  };
  try {
    $('#shared-browse').dispatch('click');
    for (const code of codes) {
      $('#shared-code').value = code;
      $('#shared-open').dispatch('click');
      await settle();
    }
    for (const code of codes) await play(code);
    assert.equal(fetched.length, codes.length);
    await play(codes.at(-1));
    assert.equal(fetched.length, codes.length, 'the last one played is kept');
    await play(codes[0]);
    assert.equal(fetched.length, codes.length + 1, 'the first one was let go, and is fetched again');
  } finally {
    Object.assign(ctx, { createBufferSource: real.source });
    Object.assign(cloud.api, { shared: real.shared, fetchSound: real.sound });
    audio.decode = real.decode;
    audio.stop('share-preview');
    for (const code of codes) cloud.forgetShare(code);
    $('#shared-dialog').close();
  }
});

test('with no /api (the dev server, a static copy) the app says so and carries on', async () => {
  apiDown = true;
  cloud.resetCloudCheck();
  await cloud.syncAll();
  $('#cloud-browse').dispatch('click');
  await settle();
  assert.match($('#cloud-list-note').textContent, /isn't reachable from here/);
  $('#cloud-list').close();
  $('#shared-browse').dispatch('click');
  $('#shared-code').value = 'ABCD-2345';
  $('#shared-open').dispatch('click');
  await settle();
  assert.match($('#shared-note').textContent, /isn't reachable from here/);
  $('#shared-dialog').close();
  assert.equal(await cloud.syncNow('p-none'), null, 'a sync without storage or cloud does nothing, and throws nothing');
  // In someone's profile: the switch says so where it was tapped (before any sum or PIN is asked), and nothing changes.
  await setPersonEdit('p-nocloud', { id: 'p-nocloud', name: 'Duke Dumpling', fun: true, avatar: '🥟', color: '#5A2050', added: true, created: 8 });
  renderPeople();
  sheetOf('p-nocloud');
  $('#profile-cloud').dispatch('click');
  await settle();
  assert.match($('#profile-cloud-text').textContent, /isn't reachable from here/);
  assert.equal($('#profile-cloud').getAttribute('aria-checked'), 'false');
  assert.equal($('#kids-sum').open, false, 'no sum is asked for a cloud that is not there');
  assert.equal($('#pin-dialog').open, false);
  closeSheets();
});
