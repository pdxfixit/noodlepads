// The update bar in the real app on the stand-in page: a copy loaded as
// aaa1111 finds bbb2222 live, shows "🆕 An update for Noodle Pads is ready.",
// waits while a sheet is open, and Reload reloads.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let live = 'aaa1111';
let reloads = 0;
const realNow = Date.now;
let ahead = 0;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url === 'version.json') return { ok: true, status: 200, json: async () => ({ version: live, date: '2026-10-11 13:45 PDT' }) };
    return pageFetch(url, opts);
  };
  globalThis.location.reload = () => { reloads++; };
  Date.now = () => realNow() + ahead;
  document.visibilityState = 'visible';
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const showAgain = async () => {
  ahead += 61_000;
  page.docEvent('visibilitychange');
  await page.settle();
};

test('the same version live: no bar', async () => {
  await showAgain();
  assert.equal(page.$('#update-bar').hidden, true);
});

test('a newer version live: the bar shows, waits while a sheet is open, and Reload reloads', async () => {
  live = 'bbb2222';
  const sheet = page.$('#sheet');
  sheet.setAttribute('open', '');
  await showAgain();
  assert.equal(page.$('#update-bar').hidden, true, 'an open sheet may hold unsaved edits');
  sheet.removeAttribute('open');
  await showAgain();
  const bar = page.$('#update-bar');
  assert.equal(bar.hidden, false);
  // The fake page drops the nested span's words; update.test.mjs checks the full wording in the source.
  assert.match(page.$('.update-text').textContent, /An update.*is ready/);
  page.$('#update-reload').click();
  assert.equal(reloads, 1);
});

test('✕ puts it away until the next check', async () => {
  page.$('#update-close').click();
  assert.equal(page.$('#update-bar').hidden, true);
  await showAgain();
  assert.equal(page.$('#update-bar').hidden, false, 'coming back checks again and offers it');
});
