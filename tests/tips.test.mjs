// One-time tips (ADR 0028, web/tips.js): a short line in the banner the
// first time a thing matters, once per person, at most one per screen visit,
// never on 🧸 Kids; ❓ Help's 💡 Show tips again brings them back. The real
// app on the stand-in page with first steps on. How a tip looks over each
// screen: `just look tip-beats`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { getSetting, setSetting } from '../web/settings.js';
import { TIPS } from '../web/firsts.js';
import { fakeIndexedDB } from './fake-idb.mjs';

let page;
let $;
before(async () => {
  console.error = () => {};
  globalThis.indexedDB = fakeIndexedDB();   // storage works, so no notice about it takes the banner
  page = installPage({ firstSteps: true });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  $('#wl-skip').dispatch('click');   // the welcome for this new device's person
  await page.settle();
});

const banner = () => ($('#banner').hidden ? null : $('#banner-text').textContent);
const seen = () => getSetting('seen').split(',').filter(Boolean);
const pads = () => $('#pads').querySelectorAll('.pad').filter((p) => p.dataset.id);
const tab = async (sel) => { $(sel).dispatch('click'); await page.settle(); };
const closeBanner = () => { if (!$('#banner').hidden) $('#banner-close').dispatch('click'); };

test('🔊 Pads: after three pad taps, "Hold a pad to make it loop", once', async () => {
  pads()[0].dispatch('click');
  pads()[1].dispatch('click');
  assert.equal(banner(), null, 'not after two');
  pads()[2].dispatch('click');
  await page.settle();
  assert.equal(banner(), TIPS['tip-pads']);
  assert.deepEqual(seen(), ['tip-pads'], "kept as this person's");
  closeBanner();
  await tab('#beats-toggle');
  closeBanner();
  await tab('#pads-tab');
  for (let i = 0; i < 5; i++) pads()[i].dispatch('click');
  await page.settle();
  assert.equal(banner(), null, 'never again');
});

test('🥁 Beats with no hits, 🎼 Song and 🎤 Live: one tip on the first visit each', async () => {
  assert.ok(seen().includes('tip-beats'), 'Beats said its tip on the first visit (above)');
  await tab('#song-tab');
  assert.equal(banner(), TIPS['tip-song']);
  await tab('#live-tab');
  assert.equal(banner(), TIPS['tip-live'], 'a tip replaces a tip');
  closeBanner();
  await tab('#song-tab');
  assert.equal(banner(), null, 'once each');
});

test('the sound sheet: one line about voices the first time it opens', async () => {
  await tab('#pads-tab');
  $('.pad-add').dispatch('click');
  await page.settle();
  assert.equal($('#sheet').open, true);
  assert.equal(banner(), TIPS['tip-sheet']);
  $('#sheet').close();
  await page.settle();
});

test('never over a notice or an Undo, and never on 🧸 Kids', async () => {
  await setSetting('seen', '');
  closeBanner();
  const { showBanner } = await import('../web/ui.js');
  showBanner('↩️ Something was deleted.', { action: { label: '↩️ Undo', fn: () => {} } });
  await tab('#song-tab');
  assert.equal(banner(), '↩️ Something was deleted.');
  assert.ok(!seen().includes('tip-song'), 'it waits for another visit');
  closeBanner();
  await setSetting('level', 'kids');
  await page.settle();
  const { tipsScreen } = await import('../web/tips.js');
  tipsScreen('live');
  assert.equal(banner(), null);
  await setSetting('level', 'regular');
  await page.settle();
});

test('❓ Help → 💡 Show tips again clears the tips, and they come back one at a time', async () => {
  await setSetting('seen', 'kids-pad,tip-live,tip-pads,tip-song');
  await tab('#pads-tab');
  $('#help-open').dispatch('click');
  $('#help-tips').dispatch('click');
  await page.settle();
  assert.deepEqual(seen(), ['kids-pad'], 'the tips go; the 🧸 hand stays seen');
  assert.match(banner(), /tips will show again/);
  assert.match($('#help-tips').getAttribute('aria-label'), /^💡 Show tips again/);
  $('#help').close();
  closeBanner();
  await tab('#live-tab');
  assert.equal(banner(), TIPS['tip-live']);
});
