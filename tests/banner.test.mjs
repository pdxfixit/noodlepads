// The banner (ui.js showBanner), run against the real app on the stand-in
// page. Every one-line notice, and ↩️ Undo after a change, floats over the
// top of the screen, one at a time, and fades away; nothing in the page
// makes room for it (Ben, 2026-10-16: "notifications should not appear in
// the primary UI space; they should appear as a hovering, fadeaway thing
// over the top of the screen"). Undo on each screen is tested with its
// screen (app, bulk, new-scratch, row-volume).

import { readFileSync } from 'node:fs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';

let page;
let $;
let ui;
let getLog;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ui = await import('../web/ui.js');
  ({ getLog } = await import('../web/log.js'));
  $('#banner-close').dispatch('click');   // whatever the start said
});

test('one banner element, a polite status region; the old in-page notice and Undo lines are gone', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/id="banner"/g).length, 1);
  assert.equal($('#banner').getAttribute('role'), 'status');
  assert.equal($('#banner').getAttribute('aria-live'), 'polite');
  assert.equal($('#banner').getAttribute('popover'), 'manual', 'the top layer: over the sticky header and any dialog');
  assert.equal($('#banner-close').getAttribute('aria-label'), 'Dismiss');
  for (const id of ['notice', 'pads-undo', 'seq-undo', 'song-undo', 'song-note', 'settings-note', 'dj-done-text']) {
    assert.equal($(`#${id}`), null, id);
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), id);
  }
  // The take card after a take and the 🆕 update bar stay where they are.
  assert.ok($('#dj-done'));
  assert.ok($('#update-bar'));
});

test('a notice shows in the banner with ✕ only, is logged, and a second one takes its place', () => {
  ui.showNotice('First thing.');
  assert.equal($('#banner').hidden, false);
  assert.equal($('#banner-text').textContent, 'First thing.');
  assert.equal($('#banner-action').hidden, true, 'no action');
  ui.showNotice('Second thing.');
  assert.equal($('#banner-text').textContent, 'Second thing.', 'the newest replaces it');
  assert.equal(document.querySelectorAll('.banner').length, 1, 'one at a time');
  assert.ok(getLog().some((e) => e.kind === 'notice' && e.data.text === 'First thing.'));
  assert.ok(getLog().some((e) => e.kind === 'notice' && e.data.text === 'Second thing.'));
  $('#banner-close').dispatch('click');
  assert.equal($('#banner').hidden, true, '✕ puts it away');
  ui.showNotice('Third thing.');
  ui.showNotice('');
  assert.equal($('#banner').hidden, true, 'an empty notice puts the last one away');
});

test('an action rides in the banner: a tap runs it, then the banner goes, once', () => {
  let ran = 0;
  const why = [];
  const h = ui.showBanner('Removed a thing.', { action: { label: '↩️ Undo', fn: () => ran++ }, onClose: (w) => why.push(w) });
  assert.ok(hasUndo());
  assert.equal($('#banner-action').textContent, '↩️ Undo');
  assert.ok($('#banner').classList.contains('has-action'));
  assert.equal(h.open, true);
  $('#banner-action').dispatch('click');
  assert.equal(ran, 1);
  assert.equal($('#banner').hidden, true);
  assert.equal(h.open, false);
  assert.deepEqual(why, ['closed']);
  h.close();
  assert.deepEqual(why, ['closed'], 'onClose runs once');
});

test('a handle closes only its own banner, and a replaced one hears it was replaced', () => {
  const why = [];
  const first = ui.showBanner('One.', { action: { label: '↩️ Undo', fn() {} }, onClose: (w) => why.push(w) });
  const second = ui.showBanner('Two.');
  assert.deepEqual(why, ['replaced']);
  assert.equal($('#banner-action').hidden, true, 'the new one has no Undo');
  first.close();
  assert.equal($('#banner').hidden, false, 'the newer banner stays');
  assert.equal($('#banner-text').textContent, 'Two.');
  second.close();
  assert.equal($('#banner').hidden, true);
});

test('focus in a vanishing banner goes to focusBack, or back where it was', () => {
  const add = $('#seq-add');
  const h = ui.showBanner('Gone.', { action: { label: '↩️ Undo', fn() {} }, focusBack: () => add });
  h.focus();
  assert.equal(document.activeElement, $('#banner-action'));
  h.close();
  assert.equal(document.activeElement, add);
  const from = $('#edit-toggle');
  from.focus();
  const h2 = ui.showBanner('Also gone.', { action: { label: '↩️ Undo', fn() {} } });
  h2.focus();
  $('#banner-close').dispatch('click');
  assert.equal(document.activeElement, from, 'where focus was when it came');
});

test('a notice said again within a minute never pushes an Undo away', () => {
  ui.showNotice('Storage says no.');
  ui.showBanner('Removed a thing.', { action: { label: '↩️ Undo', fn() {} } });
  ui.showNotice('Storage says no.');
  assert.equal($('#banner-text').textContent, 'Removed a thing.');
  assert.ok(hasUndo());
  ui.showNotice('Something new.');
  assert.equal($('#banner-text').textContent, 'Something new.', 'new words still replace it');
  $('#banner-close').dispatch('click');
});

// Waits until `done()` holds, up to `limit` ms: a fixed wait loses on a busy
// machine (2026-10-18, a full CPU made a 60 ms margin miss).
const until = async (done, limit = 3000) => {
  for (const end = Date.now() + limit; !done() && Date.now() < end;) await new Promise((r) => setTimeout(r, 20));
};

test('the banner fades by itself, and a finger on it holds it', async () => {
  const { FADE_MS } = ui;
  ui.showBanner('Fading.', { ms: 30 });
  await until(() => $('#banner').hidden);
  assert.equal($('#banner').hidden, true, 'gone by itself');
  let closed = 0;
  ui.showBanner('Held.', { ms: 30, onClose: () => closed++ });
  $('#banner').dispatch('pointerenter');
  await new Promise((r) => setTimeout(r, 30 + FADE_MS + 60));
  assert.equal($('#banner').hidden, false, 'held');
  $('#banner').dispatch('pointerleave');
  await until(() => $('#banner').hidden);
  assert.equal($('#banner').hidden, true, 'the wait started again');
  assert.equal(closed, 1);
});
