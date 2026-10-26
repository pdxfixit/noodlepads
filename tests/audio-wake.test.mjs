// The phone stops the sound (a call, a locked screen, another app; iOS
// says 'interrupted'): coming back to the page asks for it again at once,
// and so does every tap, not only the first, so the first tap back plays.
// The real app on the stand-in page; sound itself needs a phone.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let audio;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
});

test('the page shown again, and any tap after the first, resume a context the phone stopped', () => {
  page.winEvent('pointerdown');   // the first tap makes the context
  const ctx = audio.ctx;
  assert.ok(ctx);
  let resumes = 0;
  ctx.resume = () => { resumes++; return Promise.resolve(); };

  ctx.state = 'interrupted';   // a phone call
  page.winEvent('pointerdown');
  assert.equal(resumes, 1, 'a later tap resumes it too');

  ctx.state = 'suspended';     // the screen was locked
  document.visibilityState = 'hidden';
  page.docEvent('visibilitychange');
  assert.equal(resumes, 1, 'not while the page is hidden');
  document.visibilityState = 'visible';
  page.docEvent('visibilitychange');
  assert.equal(resumes, 2, 'shown again: resumed before any tap');
  page.winEvent('pageshow');
  assert.equal(resumes, 3, 'back from the browser\'s page cache');

  ctx.state = 'running';
  page.winEvent('pointerdown');
  page.docEvent('visibilitychange');
  assert.equal(resumes, 3, 'a running context is left alone');
  delete document.visibilityState;
});
