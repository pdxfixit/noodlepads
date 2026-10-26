// A Kids-level person on a device that remembers 🎤 Live with its ⏲️ Click
// track on: the app starts on the kid's screens, and the click must not
// tick behind them (app.js start shows Live, then Kids; council,
// 2026-10-26). Counted as oscillators booked on the stand-in clock.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';

let page;
let ctx;
let ticks = 0;
const idb = fakeIndexedDB();
const KID = 'p-kid-1';
const remembered = new Map([['screen', 'live'], ['dj-click', '1'], ['person', KID]]);
const storage = {
  getItem: (k) => remembered.get(k) ?? null,
  setItem: (k, v) => { remembered.set(k, String(v)); },
  removeItem: (k) => { remembered.delete(k); },
  key: (i) => [...remembered.keys()][i] ?? null,
  get length() { return remembered.size; },
};

before(async () => {
  console.error = () => {};
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: KID, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#304A00', added: true, created: 1 }],
    prefs: [{ personId: KID, values: { level: 'kids' } }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: { ...testManifest(), people: [] }, hash: `#${KID}`, storage });
  await (await import('../web/app.js')).ready;
  await page.settle();
  const { audio } = await import('../web/audio.js');
  ctx = audio.context();
  const make = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => { ticks++; return make(); };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('started on the kid\'s screens with Live\'s ⏲️ remembered on: no click ticks', async () => {
  assert.equal(document.body.classList.contains('kids'), true, 'Kids shows');
  ticks = 0;
  for (let i = 0; i < 10; i++) { ctx.currentTime += 0.1; await wait(30); }
  assert.equal(ticks, 0);
});
