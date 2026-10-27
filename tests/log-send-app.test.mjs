// 📮 Problem reports in the real app on the stand-in page, pretending to be
// the live site: hiding the page sends the cleaned log, and nothing a family
// named goes with it.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let setSetting;
let logEvent;
let namesOnDevice;
const posts = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  globalThis.location.hostname = 'noodlepads.com';
  globalThis.location.origin = 'https://noodlepads.com';
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (url === '/api/log') { posts.push({ opts, body: JSON.parse(opts.body) }); return { ok: true, status: 204 }; }
    return pageFetch(url, opts);
  };
  await (await import('../web/app.js')).ready;   // drawn and wired
  ({ setSetting } = await import('../web/settings.js'));
  ({ logEvent } = await import('../web/log.js'));
  ({ namesOnDevice } = await import('../web/log-send.js'));
  await page.settle();
});

const hide = () => {
  document.visibilityState = 'hidden';
  page.docEvent('visibilitychange');
  return page.settle();
};

test('reports are on by default; switched off, hiding the page sends nothing', async () => {
  const { getSetting } = await import('../web/settings.js');
  assert.strictEqual(getSetting('sendLogs'), true, 'Ben, 2026-10-26: on for every device');
  await setSetting('sendLogs', false);
  await hide();
  assert.equal(posts.length, 0);
});

test('📊 Share play data off stops reports too, whether 📮 is on or never chosen', async () => {
  const { state } = await import('../web/state.js');
  const before = posts.length;
  await setSetting('sendUsage', false);
  try {
    for (const choice of [true, 'default']) {
      if (choice === 'default') state.settings.delete('sendLogs'); else await setSetting('sendLogs', true);
      logEvent('notice', { text: 'something happened' });
      await hide();
      assert.equal(posts.length, before, `📮 ${choice}: nothing sent with 📊 off`);
    }
  } finally {
    await setSetting('sendUsage', true);
    await setSetting('sendLogs', false);   // so the next test's switch-on is a change
  }
});

test('with reports on, hiding the page sends what happened since, with no names in it', async () => {
  await setSetting('sendLogs', true);
  const names = namesOnDevice();
  assert.ok(names.includes('Pip') && names.includes('pip'), 'bundled people, by name and id');
  assert.ok(names.includes('Airhorn'), 'their sounds');
  logEvent('notice', { text: '“Airhorn” didn\'t load, and Pip is sad.' });
  logEvent('person', { deleted: 'pip', bundled: true, sounds: 4 });
  await hide();
  assert.equal(posts.length, 1);
  const { opts, body } = posts[0];
  assert.equal(opts.keepalive, true);
  assert.match(body.device, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(body.settings.sendLogs, true);
  // The browser, OS and device type only: the User-Agent string never leaves.
  assert.equal(Object.hasOwn(body.env, 'ua'), false);
  for (const k of ['browser', 'os', 'type']) assert.equal(typeof body.env[k], 'string', k);
  if (globalThis.navigator?.userAgent) assert.ok(!opts.body.includes(globalThis.navigator.userAgent));
  assert.ok(body.counts.people >= 1);
  // Only what came after the switch (the stand-in page can't save, so a notice says so first).
  assert.ok(!body.entries.some((e) => e.kind === 'setting'));
  const [notice, person] = body.entries.slice(-2);
  assert.equal(notice.data.text, '“«name»” didn\'t load, and «name» is sad.');
  assert.deepEqual(person.data, { deleted: true, bundled: true, sounds: 4 });
  for (const n of ['Airhorn', 'Pip', 'pip']) assert.ok(!opts.body.includes(n), n);
});

test('a kid\'s own voice names (⭐ Save voice) are blanked from reports too', async () => {
  const { state } = await import('../web/state.js');
  state.myVoices = [{ id: 'voice-x', personId: 'p-x', name: 'Squeaky Wren', emoji: '🦄', knobs: { pitch: 3 }, created: 1, used: 1 }];
  assert.ok(namesOnDevice().includes('Squeaky Wren'));
  state.myVoices = [];
});
