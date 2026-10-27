// ☁️ Open from the cloud while someone comes down (Ben, 2026-10-26): the
// sheet locks, says how far it has got, and ends on ✓ (▶ Play as them, ☁️
// Open someone else) or on a stop (🔄 Try again, ✕ Don't bring them). The
// real app on the stand-in page with a stand-in IndexedDB, against the real
// Worker and a fake D1. The bar's movement, the spinner and how it all looks
// need a browser: `just look cloud-open`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { uploadAudio } from '../web/cloud-sync.js';
import { funName } from '../web/names.js';

let page;
let $;
let state;
let cloud;
let people;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
// How the sounds' downloads go: 'ok', 'down' (the network fails) or 'stall'
// (nothing comes until the call is stopped).
let sounds = 'ok';

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();
  page = installPage();
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      if (String(url).startsWith('/api/sounds/') && (!init.method || init.method === 'GET')) {
        if (sounds === 'down') throw new TypeError('Failed to fetch');
        if (sounds === 'stall') {
          return new Promise((_, fail) => init.signal?.addEventListener('abort', () => fail(new DOMException('Aborted', 'AbortError'))));
        }
      }
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
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
// Every profile in the cloud has a PIN, so every pick asks it.
const PIN = '2468';
const typePin = async (digits = PIN) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); await page.settle(); };
const notNow = async () => { if ($('#remember-dialog').open) await tap($('#remember-no')); };
const sha = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Another device's profile with one recorded sound, one beat, a preset edit
// and two settings changed (beside one at its default, the level's old
// twin, and a tip seen, none of which count).
async function elsewhere(id, name) {
  const { key } = await cloud.api.create({ id, name, avatar: '🐙', color: '#0C5E4B', pin: PIN });
  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'audio/wav' });
  const up = await uploadAudio(cloud.api, id, key, blob, 'audio/wav', sha);
  await cloud.api.push(id, key, [
    { kind: 'clips', id: `user-${id}`, body: { id: `user-${id}`, personId: id, label: 'Burp', emoji: '😂', voice: 'normal', mime: 'audio/wav', created: 5, sound: up.sound, sha256: up.sha256, bytes: blob.size } },
    { kind: 'beats', id: `beat-${id}`, body: { id: `beat-${id}`, personId: id, name: 'Wobbly Taco', bpm: 100, bars: 1, swing: 0, rows: [{ clipId: `user-${id}`, steps: [1, 0, 0, 0] }], created: 6, saved: 6 } },
    { kind: 'overrides', id: `${id}-kick`, body: { id: `${id}-kick`, label: 'Boom' } },
    { kind: 'prefs', id, body: { personId: id, values: { timeSignature: '3/4', level: 'advanced', advancedBeats: true, padSize: 'auto', seen: 'tip-beats' } } },
  ], []);
}

const pick = (id) => $('#cloud-list-items').querySelector(`[data-open="${id}"]`);
const closeButton = () => $('#cloud-list').querySelector('[data-close]');
const shown = (sel) => !$(sel).hidden;

test('a stop locks the sheet on 🔄 Try again and ✕ Don\'t bring them; trying again finishes, and ▶ Play as them shows them on Pads', async () => {
  await elsewhere('p-far', 'Sir Squid');
  $('#people-open').dispatch('click');
  await tap($('#cloud-browse'));
  sounds = 'down';
  await tap(pick('p-far'));
  assert.equal($('#pin-dialog').open, true, 'every profile has a PIN');
  await typePin();
  assert.ok(shown('#cloud-open') && !shown('#cloud-list-items'), 'the sheet turns to them');
  assert.equal($('#cloud-open-name').textContent, 'Sir Squid');
  assert.equal($('#cloud-open').dataset.step, 'stopped');
  assert.match($('#cloud-open-line').textContent, /^⚠️ The cloud isn't reachable/);
  assert.ok(shown('#cloud-open-stopped') && !shown('#cloud-open-done'));
  assert.equal(closeButton().hidden, true, 'no ✕: Try again or Don\'t bring them');
  closeButton().dispatch('click');
  $('#cloud-list').dispatch('click');   // the backdrop
  assert.equal($('#cloud-list').open, true, 'still open');
  assert.ok(!people({ includeHidden: true }).some((p) => p.id === 'p-far'), 'nothing of theirs is stored yet');

  sounds = 'ok';
  await tap($('#cloud-open-again'));
  assert.equal($('#remember-dialog').open, true, 'then 🔑 Remember them here? is offered');
  await notNow();
  assert.equal($('#cloud-open').dataset.step, 'done');
  assert.equal($('#cloud-open-line').textContent, '✓ On this device now');
  const nbsp = (t) => t.replace(/\u00a0/g, ' ');
  assert.equal(nbsp($('#cloud-open-size').textContent), '🔊 1 · 🥁 1 · ✏️ 1 · ⚙️ 2', 'everything that came, as 👥 People counts it, and their settings');
  assert.equal($('#cloud-open-size').getAttribute('aria-label'), '1 sound, 1 beat, 1 preset edit, 2 settings');
  assert.equal($('#cloud-open-bar').getAttribute('aria-valuenow'), '100');
  assert.equal(closeButton().hidden, false, 'the ✕ is back');
  assert.equal($('#cloud-open-play').getAttribute('aria-label'), 'Play as Sir Squid');

  await tap($('#cloud-open-play'));
  assert.equal($('#cloud-list').open, false);
  assert.equal($('#people-dialog').open, false);
  assert.equal(state.personId, 'p-far');
  assert.equal(state.screen, 'pads');
  assert.ok(state.userClips.some((c) => c.personId === 'p-far'), 'their sound came');
});

test("✕ Don't bring them forgets the link, so they never arrive by themselves, and they are back in the list", async () => {
  await elsewhere('p-wren', funName(['Sir Squid']));
  await tap($('#cloud-browse'));
  sounds = 'down';
  await tap(pick('p-wren'));
  await typePin();
  assert.equal($('#cloud-open').dataset.step, 'stopped');
  assert.ok(cloud.inCloud('p-wren'), 'opening made the link');
  sounds = 'ok';
  await tap($('#cloud-open-leave'));
  assert.equal(cloud.inCloud('p-wren'), false, 'the link is gone');
  assert.ok(shown('#cloud-list-items') && !shown('#cloud-open'), 'back to the list');
  assert.ok(pick('p-wren'), 'they can be picked again');
  await cloud.syncAll();
  assert.ok(!people({ includeHidden: true }).some((p) => p.id === 'p-wren'), 'a later sync leaves them in the cloud');
  $('#cloud-list').close();
});

test('nothing arriving for a while stops the open (a stalled download never ends by itself); sounds already here are kept for the next try', async () => {
  await elsewhere('p-toby', funName(['Sir Squid']));
  await cloud.openProfile('p-toby', PIN);
  sounds = 'stall';
  const heard = [];
  const stopped = await cloud.bringDown('p-toby', (p) => heard.push(p), { stallMs: 50 });
  assert.deepEqual([stopped.ok, stopped.stored], [false, false]);
  assert.match(stopped.text, /isn't reachable/);
  assert.equal(heard.at(-1).phase, 'sounds', 'it stopped waiting on the sound');
  sounds = 'ok';
  const done = await cloud.bringDown('p-toby', () => {});
  assert.deepEqual([done.ok, done.stored], [true, true]);
  assert.ok(state.userClips.some((c) => c.personId === 'p-toby'));
});
