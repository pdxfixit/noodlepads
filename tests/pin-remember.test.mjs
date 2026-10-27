// 🔑 Remember on this device (Ben, 2026-10-26; no end of its own, 2026-10-27):
// once a PIN opens someone, the app offers to skip it on this device. Yes
// keeps a key that lasts; Not now stops the offer here; the profile's PIN part
// has Remember and Forget. It lasts until Forget, a PIN change, or the cloud
// drops the key after 180 days unused: the device keeps no clock of its own.
// The real app with a stand-in IndexedDB, against the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { KEY_IDLE_MS } from '../worker/cloud.js';
import { FakeD1 } from './fake-d1.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let $;
let state;
let cloud;
let renderPeople;
let openProfileSheet;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const DAY = 24 * 60 * 60 * 1000;
const KEPT = 'p-kept-2';        // remembered here (`remembered`)
const OLD = 'p-old-1';          // remembered before 2026-10-27: its 90-day `rememberUntil` passed yesterday
const IDLE = 'p-idle-1';        // remembered here; its key goes unused for 181 days
const ELSEWHERE = 'p-else-1';   // remembered here; another device changes the PIN
const OFFER = 'p-offer-1';      // a PIN, not remembered: says yes
const DECLINE = 'p-decline-1';  // a PIN, not remembered: says Not now
// Made-up test PINs.
const PIN = '2468';
const NEW_PIN = '8642';
const REMEMBERED = [KEPT, OLD, IDLE, ELSEWHERE];
const keyRows = (id) => env.DB.rows('SELECT session FROM keys WHERE profile_id = ?', id);
const send = async (method, path, body, key) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
}), env)).json();
const call = (path, body) => send('POST', path, body);
// Every key of `id` last used `days` ago.
const ageKeys = (id, days) => env.DB.db.prepare('UPDATE keys SET created = ?, used = ? WHERE profile_id = ?').run(Date.now() - days * DAY, Date.now() - days * DAY, id);

before(async () => {
  console.error = () => {};
  const names = {
    [KEPT]: 'Admiral Acorn', [OLD]: 'Captain Cranberries', [IDLE]: 'Duke Dumpling', [ELSEWHERE]: 'Lady Lentil',
    [OFFER]: 'Friendly Sloth', [DECLINE]: 'Sleepy Walrus',
  };
  const keys = {};
  for (const [id, name] of Object.entries(names)) {
    await call('profiles', { id, name, avatar: '', color: '#1F3FA8', pin: PIN });
    // The make's own key stays out of the count.
    await env.DB.exec(`DELETE FROM keys WHERE profile_id = '${id}'`);
    if (REMEMBERED.includes(id)) keys[id] = (await call(`profiles/${id}/open`, { pin: PIN, remember: true })).key;
  }
  const now = Date.now();
  const link = (id, more) => ({ id, key: keys[id] ?? null, rev: 0, sent: {}, sounds: {}, pin: true, ...more });
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: Object.entries(names).map(([id, name], i) => ({ id, name, fun: true, avatar: '🦉', color: '#1F3FA8', added: true, created: i + 1 })),
    cloud: [
      link(KEPT, { remembered: true }),
      link(OLD, { rememberUntil: now - DAY }),
      link(IDLE, { remembered: true }),
      link(ELSEWHERE, { remembered: true }),
      link(OFFER),
      link(DECLINE),
    ],
    // Something of KEPT's to share: a beat, and two sounds of their own.
    beats: [{ id: 'beat-kept', personId: KEPT, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${KEPT}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 }],
    clips: ['Burp', 'Boing'].map((label, i) => ({
      id: `user-kept-${i + 1}`, personId: KEPT, label, emoji: '🔊', color: 'red', mime: 'audio/webm', created: 1000 + i,
      blob: new Blob([new Uint8Array([1, 2, 3, i])], { type: 'audio/webm' }),
    })),
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
    }
    return pageFetch(url, init);
  };
  await (await import('../web/app.js')).ready;
  ({ state } = await import('../web/state.js'));
  ({ renderPeople } = await import('../web/pads.js'));
  ({ openProfileSheet } = await import('../web/people.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
  // Everyone here has a PIN, so the board started behind the pad: KEPT
  // needs none here, so it opened on them.
  for (const d of ['#pin-dialog', '#who-now']) if ($(d).open) $(d).close();
  await page.settle();
});

const settle = () => page.settle();
const typePin = (digits) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };
const choose = async (id) => { renderPeople(); $(`.person-list [data-person="${id}"]`).dispatch('click'); await settle(); };

test('a device that remembers someone opens them without the PIN, and keeps their key', async () => {
  assert.equal(cloud.REMEMBER_DAYS, undefined, 'no day of its own');
  assert.equal(cloud.isRemembered(KEPT), true);
  assert.equal(cloud.needsPin(KEPT), false);
  assert.equal(cloud.pinGuards(KEPT), false, 'nor does their profile ask');
  await choose(OFFER);
  if ($('#pin-dialog').open) $('#pin-dialog').close();
  await settle();
  await choose(KEPT);
  assert.equal($('#pin-dialog').open, false, 'no PIN pad');
  assert.equal(state.personId, KEPT);
  assert.ok(cloud.linkOf(KEPT).key, 'the key is stored on the device');
});

test('91 days on, a remembered key still syncs and still opens them without the PIN: only 180 days unused ends it', async () => {
  ageKeys(KEPT, 91);
  assert.ok(91 * DAY < KEY_IDLE_MS);
  assert.ok(await cloud.syncNow(KEPT), 'the cloud takes the key');
  assert.equal(cloud.isRemembered(KEPT), true);
  assert.equal(cloud.needsPin(KEPT), false);
  assert.equal(keyRows(KEPT).length, 1);
});

test('a link remembered before 2026-10-27, its 90 days up, still opens them without the PIN and keeps its key', async () => {
  const link = cloud.linkOf(OLD);
  assert.ok(link.rememberUntil < Date.now(), 'its old day has passed');
  assert.ok(link.key, 'the start kept its key');
  assert.equal(cloud.isRemembered(OLD), true);
  assert.equal(cloud.needsPin(OLD), false);
  assert.equal(cloud.pinGuards(OLD), false);
  assert.equal(keyRows(OLD).length, 1, 'its key is still in the cloud');
  await choose(OLD);
  assert.equal($('#pin-dialog').open, false, 'no PIN pad');
  assert.equal(state.personId, OLD);
});

test('the cloud drops a remembered key unused for 180 days: the PIN pad says this device forgot them', async () => {
  ageKeys(IDLE, 181);
  assert.equal(await cloud.syncNow(IDLE), null, 'the key is refused');
  assert.equal(keyRows(IDLE).length, 0, 'and deleted in the cloud');
  assert.equal(cloud.isRemembered(IDLE), false);
  assert.equal(cloud.linkOf(IDLE).key, null);
  assert.equal(cloud.needsPin(IDLE), true);
  assert.match(cloud.statusOf(IDLE).text, /This device forgot them/);
  await choose(IDLE);
  assert.equal($('#pin-dialog').open, true, 'the PIN is asked');
  assert.match($('#pin-hint').textContent, /^This device forgot them\. A grown-up can type the PIN\./);
  typePin(PIN);
  await settle();
  assert.equal(state.personId, IDLE, 'the same PIN opens them');
  assert.equal(cloud.linkOf(IDLE).keyDropped, undefined);
  assert.equal($('#remember-dialog').open, true, 'Remember is offered again');
  $('#remember-no').dispatch('click');
  await settle();
});

test('a PIN changed on another device ends the remembering here', async () => {
  const other = (await call(`profiles/${ELSEWHERE}/open`, { pin: PIN, remember: true })).key;
  assert.equal((await send('PATCH', `profiles/${ELSEWHERE}`, { pin: PIN, newPin: NEW_PIN }, other)).ok, true);
  assert.equal(await cloud.syncNow(ELSEWHERE), null, 'this device\'s key is refused');
  assert.equal(cloud.isRemembered(ELSEWHERE), false);
  assert.equal(cloud.needsPin(ELSEWHERE), true);
  assert.equal(cloud.pinGuards(ELSEWHERE), true);
  await choose(ELSEWHERE);
  assert.equal($('#pin-dialog').open, true);
  assert.match($('#pin-hint').textContent, /This device forgot them/);
  typePin(PIN);
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the old PIN no longer opens them');
  typePin(NEW_PIN);
  await settle();
  assert.equal(state.personId, ELSEWHERE);
  if ($('#remember-dialog').open) $('#remember-no').dispatch('click');
  await settle();
});

test('after a PIN opens someone, 🔑 Remember them here? is offered, Not now focused and as big; Remember keeps them with no end date', async () => {
  await choose(OFFER);
  assert.equal($('#pin-dialog').open, true);
  typePin(PIN);
  await settle();
  assert.equal(state.personId, OFFER, 'they show at once');
  const offered = $('#remember-dialog').open;
  const focused = globalThis.document.activeElement;
  const title = $('#remember-title').textContent;
  const sub = $('#remember-sub').textContent;
  $('#remember-yes').dispatch('click');
  await settle();
  // Checked once it is answered, so a wrong word fails here and leaves no dialog open for the tests after.
  assert.equal(offered, true, 'the offer opens over them');
  assert.ok(focused === $('#remember-no'), 'Not now has the focus');
  assert.equal($('#remember-no').className, 'chain-tool', 'the same size of button as Remember');
  assert.equal($('#remember-dialog').open, false);
  assert.match(title, /Remember Friendly Sloth here\?/);
  assert.equal(sub, 'This device opens them without the PIN until someone taps Forget this device. Sharing still asks it. Anyone using this device can open them.');
  assert.doesNotMatch(sub, /days|forever/);
  assert.equal(cloud.isRemembered(OFFER), true);
  assert.equal(cloud.linkOf(OFFER).remembered, true);
  assert.equal(cloud.linkOf(OFFER).rememberUntil, undefined, 'no day it ends');
  assert.ok(cloud.linkOf(OFFER).key, 'its key is stored');
  assert.deepEqual(keyRows(OFFER).map((r) => r.session), [0], 'one key, one that lasts: the visit\'s own was dropped');
  await choose(KEPT);
  await choose(OFFER);
  assert.equal($('#pin-dialog').open, false, 'switching back asks no PIN');
  assert.equal(state.personId, OFFER);
});

test('Not now closes the offer and it is not offered again on this device', async () => {
  await choose(DECLINE);
  typePin(PIN);
  await settle();
  assert.equal($('#remember-dialog').open, true);
  $('#remember-no').dispatch('click');
  await settle();
  assert.equal($('#remember-dialog').open, false);
  assert.equal(cloud.isRemembered(DECLINE), false);
  assert.equal(cloud.linkOf(DECLINE).noOffer, true);
  assert.equal(cloud.linkOf(DECLINE).key, null, 'the key is held for this visit only');
  await choose(KEPT);
  await choose(DECLINE);
  assert.equal($('#pin-dialog').open, true, 'the PIN is asked');
  typePin(PIN);
  await settle();
  assert.equal(state.personId, DECLINE);
  assert.equal($('#remember-dialog').open, false, 'and nothing is offered');
});

test('the profile\'s PIN part: Forget this device asks the PIN next time; 🔑 Remember on this device asks it, then remembers', async () => {
  await openProfileSheet(OFFER);
  await settle();
  const btn = $('#cloud-pin-remember');
  assert.equal(btn.hidden, false);
  assert.equal(btn.textContent, 'Forget this device');
  assert.equal($('#profile-pin-hint').textContent, 'This device opens Friendly Sloth without it until someone taps Forget this device. Sharing still asks it. Anyone using this device can open them. Lost this device? Change the PIN, and every device asks it again.');
  btn.dispatch('click');
  await settle();
  assert.equal(cloud.isRemembered(OFFER), false);
  assert.equal(cloud.linkOf(OFFER).key, null);
  assert.equal(keyRows(OFFER).length, 0, 'its key is deleted in the cloud');
  assert.equal($('#profile-pin-state').textContent, '🔒 Forgotten here');
  assert.equal(btn.textContent, '🔑 Remember on this device');
  assert.match($('#profile-pin-hint').textContent, /Asked every time Friendly Sloth is opened/);

  btn.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'Remember asks for the PIN');
  assert.match($('#pin-hint').textContent, /until someone taps Forget this device/);
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a wrong one asks again');
  assert.equal(cloud.isRemembered(OFFER), false);
  typePin(PIN);
  await settle();
  assert.equal(cloud.isRemembered(OFFER), true);
  assert.equal($('#profile-pin-state').textContent, '🔑 Remembered here');
  assert.equal(btn.textContent, 'Forget this device');
  assert.equal($('#remember-dialog').open, false, 'no offer on top: it is on');
  $('#profile-dialog').close();
  await settle();
});

test('changing the PIN here keeps the device remembering; removing it ends the remembering', async () => {
  await cloud.setPin(OFFER, PIN, '1357');
  assert.equal(cloud.isRemembered(OFFER), true);
  assert.ok(cloud.linkOf(OFFER).key, 'the new key is kept');
  assert.deepEqual(keyRows(OFFER).map((r) => r.session), [0]);
  await cloud.setPin(OFFER, '1357', null);
  assert.equal(cloud.linkOf(OFFER).remembered, undefined);
  assert.equal(cloud.needsPin(OFFER), false, 'no PIN at all now');
});

// 🔗 Share always asks the PIN (Ben, 2026-10-27): Remember covers opening,
// playing and syncing; a code anyone can play does not.
const sharesOf = (id) => env.DB.rows('SELECT code FROM shares WHERE profile_id = ?', id);

test('🔗 Share on a device that remembers them asks the PIN for each code; a wrong PIN or ✕ shares nothing', async () => {
  const ui = await import('../web/cloud-ui.js');
  assert.equal(cloud.isRemembered(KEPT), true);
  await openProfileSheet(KEPT);
  await settle();
  assert.equal($('#pin-dialog').open, false, 'the profile opens without it');
  $('#cloud-share').dispatch('click');
  await settle();
  assert.equal($('#share-dialog').open, true, 'the Share sheet opens without it');
  assert.equal($('#pin-dialog').open, false);
  $('#share-what').querySelector('[data-kind="beat"]').dispatch('click');
  const pick = () => $('#share-items').querySelector('[data-item="beat-kept"]').dispatch('click');

  pick();
  await settle();
  assert.equal($('#pin-dialog').open, true, 'making the code asks the PIN');
  assert.equal($('#pin-hint').textContent, ui.SHARE_PIN_HINT);
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a wrong one asks again');
  assert.match($('#pin-note').textContent, /PIN/);
  $('#pin-dialog').close();
  await settle();
  assert.equal($('#share-made').hidden, true, '✕ makes no code');
  assert.equal(sharesOf(KEPT).length, 0, 'nothing shared');

  pick();
  await settle();
  assert.equal($('#pin-dialog').open, true);
  typePin(PIN);
  await settle();
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal($('#share-made').hidden, false, $('#share-note').textContent);
  assert.equal(sharesOf(KEPT).length, 1, 'one code');
  assert.equal(cloud.isRemembered(KEPT), true, 'still remembered');

  pick();
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the next code asks again');
  $('#pin-dialog').close();
  await settle();
  assert.equal(sharesOf(KEPT).length, 1);
  $('#share-dialog').close();
  $('#profile-dialog').close();
  await settle();
});

test('✏️ Edit sounds\' bulk 🔗 Share asks the PIN once for its one code, on a device that remembers them; ✕ shares nothing', async () => {
  const ui = await import('../web/cloud-ui.js');
  const before = sharesOf(KEPT).length;
  const ids = ['user-kept-1', 'user-kept-2'];
  const cancelled = ui.shareSounds(KEPT, ids);
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the PIN first');
  assert.equal($('#share-dialog').open, false, 'before the Share sheet');
  $('#pin-dialog').close();
  await cancelled;
  await settle();
  assert.equal($('#share-dialog').open, false, '✕: no Share sheet');
  assert.equal(sharesOf(KEPT).length, before, 'and nothing shared');

  let asks = 0;
  const pad = $('#pin-dialog');
  const show = pad.showModal.bind(pad);
  pad.showModal = () => { asks++; show(); };
  const shared = ui.shareSounds(KEPT, ids);
  await settle();
  typePin(PIN);
  await shared;
  await settle();
  pad.showModal = show;
  assert.equal(asks, 1, 'one ask for the one code of two sounds');
  assert.equal($('#share-dialog').open, true, 'the Share sheet makes it');
  assert.equal($('#pin-dialog').open, false);
  assert.equal($('#share-made').hidden, false, $('#share-note').textContent);
  assert.equal(sharesOf(KEPT).length, before + 1, 'one code');
  $('#share-dialog').close();
  await settle();
});
