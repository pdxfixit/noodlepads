// 👋 The welcome's ☁️ Open from the cloud (web/welcome.js; Ben, 2026-10-24:
// a fresh start offers a new player or the cloud). The real app on the
// stand-in page as a new device (an empty stand-in IndexedDB), first steps
// on, against the real Worker and a fake D1, so the real sync brings them in: the list opens over the welcome, closing it with nobody opened
// comes back to Who's playing?, and opening someone (then ▶ Play as them)
// ends the welcome with them on show and the device's empty first person gone. How it looks needs
// a browser: `just look welcome`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';

let page;
let $;
let state;
let cloud;
let people;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };

before(async () => {
  console.error = () => {};   // clips fail to load without audio; that is expected here
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage({ firstSteps: true });   // the real boards.json: no people, so the app makes one
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
  ({ people } = await import('../web/board.js'));
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const tap = async (el) => { el.dispatch('click'); await page.settle(); };

test("closing the cloud list with nobody opened comes back to Who's playing?", async () => {
  assert.equal($('#welcome').open, true);
  assert.equal($('#wl-cloud').hidden, false);
  await tap($('#wl-cloud'));
  assert.equal($('#cloud-list').open, true, "👥 People's own list, over the welcome");
  assert.equal($('#welcome').open, true, 'the welcome waits under it');
  assert.equal($('#cloud-list-note').textContent, 'Nobody is in the cloud yet.');
  $('#cloud-list').close();
  await page.settle();
  assert.equal($('#welcome').open, true, 'nothing came, so a new player can still pick');
  assert.equal($('#wl-who').hidden, false);
});

test('opening someone from it ends the welcome: they show, and the empty first person is gone', async () => {
  const first = state.personId;
  await cloud.api.create({ id: 'p-far', name: 'Sir Squid', avatar: '🐙', color: '#0C5E4B' });   // another device's
  await tap($('#wl-cloud'));
  const open = $('#cloud-list-items').querySelector('[data-open="p-far"]');
  assert.ok(open, 'the profile is listed');
  await tap(open);
  assert.equal($('#cloud-open-line').textContent, '✓ On this device now');
  assert.ok(cloud.inCloud('p-far'));
  await tap($('#cloud-open-play'));
  assert.equal($('#cloud-list').open, false, 'Play as them closes the list');
  assert.equal($('#welcome').open, false, 'the welcome ends');
  assert.equal(state.personId, 'p-far', 'the one opened is on show');
  assert.deepEqual(people().map((p) => p.id), ['p-far'], 'the empty first person made for this device is dropped');
  assert.notEqual(first, 'p-far');
});
