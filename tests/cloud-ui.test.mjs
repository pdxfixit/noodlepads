// The cloud's screens on the real app (stand-in page), against the real
// Worker and a fake D1: People lines that open a profile sheet with no name
// field, 🎲, the picture and the color, its PIN guard once per visit;
// everyone who made something goes to the cloud by themselves (a typed name
// never reaches it); the PIN asked when a person is opened, with Remember on
// this device and Forget on this device; 📴 Offline; 🔗 Share and Shared with
// me; and the app with no /api at all (the dev server, a static copy).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { readFileSync } from 'node:fs';
import { isFunName, funName } from '../web/names.js';
import { PRIVACY, PRIVACY_TITLE } from '../web/privacy.js';

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
// The page settled: no cloud request or PIN hash in flight (PBKDF2, 20,000
// rounds, off the main thread: slow when every core is busy). page.settle()
// counts both (tests/fake-dom.mjs, "Work in flight").
const settle = () => page.settle();
const typePin = (digits) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
const choose = (id) => $(`.person-list [data-person="${id}"]`).dispatch('click');
// Something made, so the person goes to the cloud by themselves.
const makeBeat = (personId) => state.savedBeats.push({ id: `beat-${personId}`, personId, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${personId}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 });

test('People: no name field; each line has a picture, its made-up name and (for people added here) ☁️; its profile has 🎲, the picture and ☁️', async () => {
  $('#people-open').dispatch('click');
  $('#person-add').dispatch('click');
  await settle();
  assert.equal($('#people-dialog').querySelectorAll('input').length, 0);
  const row = rows()[4];
  added = row.dataset.person;
  assert.ok(isFunName(row.querySelector('.pe-name').textContent));
  assert.ok(row.querySelector('.pe-badge'));
  assert.equal(row.querySelector('.pe-cloud').textContent, '☁️', 'not in the cloud yet');
  assert.equal(rows()[0].querySelector('.pe-cloud'), null, "boards.json's own people can't go in the cloud");
  const sheet = profile(4);
  assert.equal(sheet.querySelectorAll('input').length, 0);
  assert.ok(sheet.querySelector('[data-avatar]') && sheet.querySelector('[data-reroll]'));
  assert.equal($('#profile-cloud').hidden, false);
  assert.match($('#profile-pin-hint').textContent, /once they are in the cloud/);
  assert.equal($('#cloud-pin').hidden, true, 'no PIN before the cloud');
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

test('everyone goes to the cloud by themselves once they make something; a typed name is swapped for a fun one first', async () => {
  const id = added;
  await setPersonEdit(id, { name: 'Typed Name', fun: false });
  await cloud.syncAll();
  assert.equal(cloud.inCloud(id), false, 'nothing made yet: an empty person never fills the public list');
  ui.openCloudSheet(id);
  assert.match($('#cloud-status').textContent, /once they make something/);
  $('#cloud-dialog').close();
  makeBeat(id);
  await cloud.syncAll();
  const [row] = env.DB.rows('SELECT * FROM profiles');
  assert.equal(row.id, id);
  assert.ok(isFunName(row.name), row.name);
  assert.equal(row.avatar, '🦖');
  assert.ok(!JSON.stringify(env.DB.rows('SELECT * FROM profiles')).includes('Typed Name'));
  assert.equal(state.peopleEdits.get(id).name, row.name, 'the device shows the same fun name');
  assert.ok(cloud.inCloud(id));
});

test('☁️ Open from the cloud: a PIN pad with Remember on this device, and what to do about a forgotten PIN', async () => {
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
  assert.equal($('#pin-remember-line').hidden, false);
  assert.equal($('#pin-remember').checked, false, 'not remembered unless chosen');
  assert.equal($('#pin-forgot').hidden, false);
  assert.match($('#pin-forgot').textContent, /pin\.reset@noodlepads\.com/);
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again');
  assert.match($('#pin-note').textContent, /4 tries left/);
  typePin('2468');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.ok(cloud.inCloud('p-far'), 'on this device now');
  assert.equal(cloud.linkOf('p-far').key, null, 'not remembered: the key is not stored');
  assert.ok(cloud.keyOf('p-far'), 'it is held for this visit');
  $('#cloud-list').close();
});

test('a PIN not remembered is asked each time the person is opened; Remember on this device stops that', async () => {
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
  choose(before);
  choose('p-far');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again after switching away');
  $('#pin-remember').checked = true;
  typePin('2468');
  await settle();
  assert.equal(state.personId, 'p-far');
  assert.ok(cloud.linkOf('p-far').key, 'remembered: the key is kept');
  choose(before);
  choose('p-far');
  await settle();
  assert.equal($('#pin-dialog').open, false, 'not asked any more');
  assert.equal(state.personId, 'p-far');
});

test('Forget on this device (in the profile sheet) drops the key (in the cloud too), and the PIN is asked again', async () => {
  const key = cloud.keyOf('p-far');
  $('#people-open').dispatch('click');
  profile(rows().findIndex((r) => r.dataset.person === 'p-far'));
  assert.equal(rows().find((r) => r.dataset.person === 'p-far').querySelector('.pe-cloud').textContent, '☁️✓ 🔒', 'the line says it has a PIN');
  assert.equal($('#cloud-forget').hidden, false);
  $('#cloud-forget').dispatch('click');
  assert.match($('#cloud-forget').textContent, /Tap again/);
  $('#cloud-forget').dispatch('click');
  await settle();
  assert.equal(cloud.keyOf('p-far'), null);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM keys WHERE profile_id = ?', 'p-far')[0].n, 1,
    "each open here replaced the key before it, and the last is forgotten: only the key of the device that made it is left");
  assert.equal((await cloud.api.pull('p-far', key, 0).catch((e) => e)).status, 401, 'the forgotten key no longer opens it');
  assert.ok(cloud.needsPin('p-far'));
  $('#profile-dialog').close();
  $('#people-dialog').close();
});

// A person in the cloud with a PIN this device has not had typed on this visit:
// it remembers them (the key is kept), and the PIN was set on another device.
async function personWithPin(id, pin) {
  await setPersonEdit(id, { id, name: funName(names()), fun: true, avatar: '🐙', color: '#1F3FA8', added: true, created: 3 });
  makeBeat(id);
  await cloud.syncAll();
  const { key } = await cloud.api.change(id, cloud.keyOf(id), { newPin: pin });
  state.cloud.set(id, { ...cloud.linkOf(id), key, pin: true, remember: true });
  renderPeople();
  (await import('../web/people.js')).renderPeopleEditor();
}
const names = () => [...state.peopleEdits.values()].map((p) => p.name).filter(Boolean);
const lineOf = (id) => rows().findIndex((r) => r.dataset.person === id);
const swatch = (i) => $('#profile-colors').querySelectorAll('[data-color]')[i];

// Ben, 2026-10-12: "choose their own color in their profile, protected by pin…
// right now anyone can change a name or color".
test('a PIN guards the name, picture and color: asked once per visit, a wrong one says so, closing it changes nothing', async () => {
  const id = 'p-guard';
  await personWithPin(id, '1357');
  assert.equal(cloud.pinGuards(id), true);
  $('#people-open').dispatch('click');
  profile(lineOf(id));
  assert.match($('#profile-pin-hint').textContent, /before their name, picture or color changes/);
  const color = state.peopleEdits.get(id).color;

  swatch(2).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a color change asks for the PIN');
  assert.match($('#pin-hint').textContent, /change their name, picture or color/);
  $('#pin-dialog').close();
  await settle();
  assert.equal(state.peopleEdits.get(id).color, color, 'closing the PIN pad changes nothing');

  dice(lineOf(id)).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, '🎲 asks too');
  assert.equal($('#names-dialog').open, false);
  typePin('0000');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'asked again');
  assert.match($('#pin-note').textContent, /That PIN isn't right\. 4 tries left/);
  typePin('1357');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal($('#names-dialog').open, true, 'the right PIN goes on to Pick a name');
  $('#names-dialog').close();
  assert.equal(cloud.pinGuards(id), false, 'typed once on this visit');
  assert.ok(cloud.linkOf(id).key, 'still remembered on this device');

  swatch(2).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false, 'not asked again');
  assert.equal(state.peopleEdits.get(id).color, swatch(2).dataset.color);
  profile(lineOf(id)).querySelector('[data-avatar]').dispatch('click');
  assert.equal($('#avatar-dialog').open, true, 'the picture opens at once now');
  $('#avatar-dialog').close();
  $('#profile-dialog').close();
});

test('without a PIN anyone changes the color at once; five wrong PINs mean the 10-minute wait, said plainly', async () => {
  assert.equal(cloud.pinGuards(added), false, 'no PIN, no guard');
  profile(lineOf(added));
  swatch(4).dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal(state.peopleEdits.get(added).color, swatch(4).dataset.color);
  $('#profile-dialog').close();

  const id = 'p-lock';
  await personWithPin(id, '2580');
  profile(lineOf(id)).querySelector('[data-avatar]').dispatch('click');
  await settle();
  for (let i = 0; i < 5; i++) { typePin('1111'); await settle(); }
  assert.equal($('#pin-dialog').open, false, 'the pad gives way to the wait');
  assert.match($('#profile-note').textContent, /Too many wrong tries\. Wait 10 minutes/);
  assert.equal($('#avatar-dialog').open, false);
  assert.equal(cloud.pinGuards(id), true, 'still guarded');
  $('#profile-dialog').close();
  $('#people-dialog').close();
});

test('the guard is a gate in the profile sheet only: a sync that changes a guarded person shows at once', async () => {
  const id = 'p-lock';
  assert.equal(cloud.pinGuards(id), true);
  for (const file of ['state.js', 'cloud-sync.js', 'merge.js', 'merge3.js']) {
    assert.ok(!readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8').includes('pinGuards'), `${file} knows nothing of the guard`);
  }
  $('#people-open').dispatch('click');
  profile(lineOf(id));
  // What a pull does with another device's new name and color (the backup merge's setPersonEdit).
  await setPersonEdit(id, { name: 'Captain Cranberries', color: '#9E1640' });
  renderPeople();
  (await import('../web/people.js')).refreshPeople();
  assert.equal($('#profile-name').textContent, 'Captain Cranberries');
  assert.equal(swatch(2).getAttribute('aria-pressed'), 'true');
  assert.equal(rows()[lineOf(id)].querySelector('.pe-name').textContent, 'Captain Cranberries');
  $('#profile-dialog').close();
  $('#people-dialog').close();
});

test('📴 Offline asks twice, deletes the cloud copy, keeps everything here, and is never put back by itself', async () => {
  const id = added;
  ui.openCloudSheet(id);
  assert.equal($('#cloud-in').hidden, false);
  $('#cloud-offline').dispatch('click');
  assert.match($('#cloud-offline').textContent, /Tap again: delete the cloud copy/);
  assert.ok(cloud.inCloud(id), 'one tap does nothing yet');
  $('#cloud-offline').dispatch('click');
  await settle();
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n, 0, `gone from the cloud: ${$('#cloud-status').textContent}`);
  assert.ok(state.savedBeats.some((b) => b.personId === id), 'still here');
  assert.equal(state.peopleEdits.get(id).offline, true);
  await cloud.syncAll();
  assert.equal(cloud.inCloud(id), false, 'not put back by itself');
  assert.equal($('#cloud-online').hidden, false);
  $('#cloud-online').dispatch('click');
  await settle();
  await settle();
  assert.ok(cloud.inCloud(id), 'Put back in the cloud');
  $('#cloud-dialog').close();
});

test('🔗 Share gives a code; Shared with me opens it, offers 🎛️ Remix, and removes it with two taps', async () => {
  const id = added;
  ui.openCloudSheet(id);
  $('#cloud-share').dispatch('click');
  assert.equal($('#share-dialog').open, true);
  $('#share-what').querySelector('[data-kind="beat"]').dispatch('click');
  $('#share-items').querySelector(`[data-item="beat-${id}"]`).dispatch('click');
  await settle();
  await settle();
  assert.equal($('#share-made').hidden, false, $('#share-note').textContent);
  const code = $('#share-code').textContent;
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  $('#share-dialog').close();
  $('#cloud-dialog').close();

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

  ui.openCloudSheet(id);
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
  $('#cloud-dialog').close();

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

test('Settings shows what is private, word for word, and where a forgotten PIN goes', () => {
  $('#settings-open').dispatch('click');
  assert.equal($('#privacy-title').textContent, PRIVACY_TITLE);
  assert.deepEqual($('#privacy-list').children.map((li) => li.textContent), PRIVACY);
  assert.match($('#cloud-forgot').textContent, /pin\.reset@noodlepads\.com/);
  $('#settings-dialog').close();
});

// Found by `just cloud-e2e` (2026-10-11): the start-up sync and one right
// after a change both made the profile, and the loser said "resting".
test('two syncs at once make a new person\'s profile once, and neither says trouble', async () => {
  const id = 'p-twice';
  await setPersonEdit(id, { name: 'Sir Squid', fun: true, avatar: '🐙', color: '#0C5E4B', added: true, created: 1 });
  makeBeat(id);
  await Promise.all([cloud.syncAll(), cloud.syncAll(), cloud.syncAll()]);
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM profiles WHERE id = 'p-twice'")[0].n, 1);
  // (This stand-in page has no IndexedDB, so the record sync after it waits.)
  assert.notEqual(cloud.statusOf(id)?.state, 'trouble', JSON.stringify(cloud.statusOf(id)));
  assert.ok(cloud.keyOf(id), 'linked, with its key');
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
});
