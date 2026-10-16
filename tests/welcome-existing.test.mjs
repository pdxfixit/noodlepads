// 👋 The welcome never asks anyone who was here before (ADR 0028): a board
// whose people already exist (here, an older boards.json's) starts with no
// welcome, even with first steps on. web/welcome.js says why it cannot: only
// the two places that make a person from nothing mark one as new.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest(), firstSteps: true });
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('people who exist are never welcomed', () => {
  assert.ok(state.personId, 'someone shows');
  assert.equal(page.$('#welcome').open, false);
});

test('without first steps (the stand-in page and just look, by default), a new device opens on the app as before', async () => {
  const { offerWelcome, markNew } = await import('../web/welcome.js');
  globalThis.noodleFirstSteps = false;
  markNew(state.personId);
  assert.equal(offerWelcome(state.personId), false);
  assert.equal(page.$('#welcome').open, false);
  globalThis.noodleFirstSteps = true;
});
