// 🔑 Remember on this device (Ben, 2026-10-26): once a PIN opens someone,
// the app offers to skip it on this device for REMEMBER_DAYS. Yes keeps a
// key that lasts; Not now stops the offer here; the profile's PIN part has
// Remember and Forget; a remembering whose day has come is forgotten when
// the app starts. The real app with a stand-in IndexedDB, against the real
// Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
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
const KEPT = 'p-kept-2';      // remembered here, 10 days left
const LAPSED = 'p-lapsed-1';  // remembered here, its day came yesterday
const OFFER = 'p-offer-1';    // a PIN, not remembered: says yes
const DECLINE = 'p-decline-1'; // a PIN, not remembered: says Not now
const PIN = '2468';
const keyRows = (id) => env.DB.rows('SELECT session FROM keys WHERE profile_id = ?', id);
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();

before(async () => {
  console.error = () => {};
  const names = { [KEPT]: 'Admiral Acorn', [LAPSED]: 'Captain Cranberries', [OFFER]: 'Friendly Sloth', [DECLINE]: 'Sleepy Walrus' };
  const keys = {};
  for (const [id, name] of Object.entries(names)) {
    await call('profiles', { id, name, avatar: '', color: '#1F3FA8', pin: PIN });
    // The make's own key stays out of the count.
    await env.DB.exec(`DELETE FROM keys WHERE profile_id = '${id}'`);
    if (id === KEPT || id === LAPSED) keys[id] = (await call(`profiles/${id}/open`, { pin: PIN, remember: true })).key;
  }
  const now = Date.now();
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: Object.entries(names).map(([id, name], i) => ({ id, name, fun: true, avatar: '🦉', color: '#1F3FA8', added: true, created: i + 1 })),
    cloud: [
      { id: KEPT, key: keys[KEPT], rev: 0, sent: {}, sounds: {}, pin: true, rememberUntil: now + 10 * DAY },
      { id: LAPSED, key: keys[LAPSED], rev: 0, sent: {}, sounds: {}, pin: true, rememberUntil: now - DAY },
      { id: OFFER, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
      { id: DECLINE, key: null, rev: 0, sent: {}, sounds: {}, pin: true },
    ],
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
  assert.ok(cloud.rememberedUntil(KEPT) > Date.now() + 9 * DAY);
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

test('a remembering whose day has come is forgotten when the app starts: the PIN is asked again, and its key is deleted in the cloud', async () => {
  const link = cloud.linkOf(LAPSED);
  assert.equal(link.rememberUntil, undefined);
  assert.equal(link.key, null);
  assert.equal(cloud.needsPin(LAPSED), true);
  assert.equal(keyRows(LAPSED).length, 0, 'the key that lasted is gone from the cloud');
});

test('after a PIN opens someone, 🔑 Remember them here? is offered; Remember keeps them for 30 days', async () => {
  assert.equal(cloud.REMEMBER_DAYS, 30);
  await choose(OFFER);
  assert.equal($('#pin-dialog').open, true);
  typePin(PIN);
  await settle();
  assert.equal(state.personId, OFFER, 'they show at once');
  assert.equal($('#remember-dialog').open, true, 'the offer opens over them');
  assert.match($('#remember-title').textContent, /Remember Friendly Sloth here\?/);
  assert.match($('#remember-sub').textContent, /30 days\. Anyone using it can open them/);
  $('#remember-yes').dispatch('click');
  await settle();
  assert.equal($('#remember-dialog').open, false);
  const until = cloud.rememberedUntil(OFFER);
  assert.ok(Math.abs(until - (Date.now() + 30 * DAY)) < 60_000, '30 days from now');
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
  assert.equal(cloud.rememberedUntil(DECLINE), 0);
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
  assert.match($('#profile-pin-hint').textContent, /This device skips it until/);
  btn.dispatch('click');
  await settle();
  assert.equal(cloud.rememberedUntil(OFFER), 0);
  assert.equal(cloud.linkOf(OFFER).key, null);
  assert.equal(keyRows(OFFER).length, 0, 'its key is deleted in the cloud');
  assert.equal($('#profile-pin-state').textContent, '🔒 Forgotten here');
  assert.equal(btn.textContent, '🔑 Remember on this device');
  assert.match($('#profile-pin-hint').textContent, /Asked every time Friendly Sloth is opened/);

  btn.dispatch('click');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'Remember asks for the PIN');
  typePin('1111');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'a wrong one asks again');
  assert.equal(cloud.rememberedUntil(OFFER), 0);
  typePin(PIN);
  await settle();
  assert.ok(cloud.rememberedUntil(OFFER) > Date.now() + 29 * DAY);
  assert.equal($('#profile-pin-state').textContent, '🔑 Remembered here');
  assert.equal(btn.textContent, 'Forget this device');
  assert.equal($('#remember-dialog').open, false, 'no offer on top: it is on');
  $('#profile-dialog').close();
  await settle();
});

test('changing the PIN here keeps the device remembering; removing it ends the remembering', async () => {
  await cloud.setPin(OFFER, PIN, '1357');
  assert.ok(cloud.rememberedUntil(OFFER) > Date.now());
  assert.ok(cloud.linkOf(OFFER).key, 'the new key is kept');
  assert.deepEqual(keyRows(OFFER).map((r) => r.session), [0]);
  await cloud.setPin(OFFER, '1357', null);
  assert.equal(cloud.linkOf(OFFER).rememberUntil, undefined);
  assert.equal(cloud.needsPin(OFFER), false, 'no PIN at all now');
});
