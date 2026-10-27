// The PIN pad after wrong tries (council, 2026-10-27: child psychologist, kids
// UX): it says how many tries are left, from the 2nd wrong one it says to ask a
// grown-up, and when the 10-minute wait starts it says a grown-up knows the
// PIN, when the pad opens again, and offers one button back. Real app, real
// Worker, fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

let page;
let $;
let cloud;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const store = new Map();
const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest(), storage });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/')) {
      return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env);
    }
    return pageFetch(url, init);
  };
  await (await import('../web/app.js')).ready;
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const typePin = (digits) => { for (const k of digits) $('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click'); };

test('wrong tries count down, then the wait screen names a grown-up, the time, and one way back', async () => {
  await cloud.api.create({ id: 'p-far', name: 'Sir Squid', avatar: '🐙', color: '#0C5E4B', pin: '2468' });
  $('#cloud-browse').dispatch('click');
  await page.settle();
  $('#cloud-list-items').children[0].querySelector('[data-open]').dispatch('click');
  await page.settle();

  typePin('1111');
  await page.settle();
  assert.equal($('#pin-dialog').open, true);
  assert.equal($('#pin-note').textContent, "That PIN isn't right. 4 tries left.", 'the 1st wrong try: just the count');
  typePin('1111');
  await page.settle();
  assert.equal($('#pin-note').textContent, "That PIN isn't right. 3 tries left. Ask a grown-up for the PIN.");
  typePin('1111');
  await page.settle();
  typePin('1111');
  await page.settle();
  assert.match($('#pin-note').textContent, /^That PIN isn't right\. 1 try left\. Ask a grown-up/, 'one try, singular');
  assert.equal($('#pin-back').hidden, true, 'no way back while there are tries');

  typePin('1111');
  await page.settle();
  assert.equal($('#pin-dialog').open, true, 'the wait is said on the pad, not by a banner after it closes');
  assert.ok($('#pin-dialog').classList.contains('pin-waiting'), 'no dots or keys');
  assert.match($('#pin-hint').textContent, /A grown-up knows the PIN/);
  assert.match($('#pin-note').textContent, /^The PIN pad opens again at \d{1,2}:\d{2}/);
  assert.equal($('#pin-back').hidden, false);
  assert.equal($('#pin-back').textContent, '⬅️ Back to Pads');
  typePin('2468');
  assert.equal($('#pin-dialog').open, true, 'digits do nothing on the wait screen');

  $('#pin-back').dispatch('click');
  await page.settle();
  assert.equal($('#pin-dialog').open, false, 'Back closes the pad');
  assert.ok(!cloud.inCloud('p-far'), 'and nothing was opened');
});

test('the next pad starts fresh: keys back, Back hidden', async () => {
  $('#cloud-browse').dispatch('click');
  await page.settle();
  $('#cloud-list-items').children[0].querySelector('[data-open]').dispatch('click');
  await page.settle();
  typePin('2468');
  await page.settle();
  // Still in the wait: the Worker says so again, on the pad.
  assert.ok($('#pin-dialog').classList.contains('pin-waiting'));
  $('#pin-back').dispatch('click');
  await page.settle();
  const { askPin } = await import('../web/cloud-ui.js');
  const asked = askPin({ title: 'PIN' });
  assert.ok(!$('#pin-dialog').classList.contains('pin-waiting'));
  assert.equal($('#pin-back').hidden, true);
  $('#pin-dialog').close();
  await asked;
});
