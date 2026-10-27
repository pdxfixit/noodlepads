// 🔗 Share of a sound that stays on this device (too long for the cloud, or
// empty) says so in one line and makes no code: a code with nothing in it
// would play and remix nothing. A sound that fits still shares. The real app
// with a stand-in IndexedDB, against the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { SCHEMA, DB_NAME, DB_VERSION } from '../web/store.js';
import { CLOUD_MAX_SOUND } from '../web/cloud-sync.js';

let page;
let cloud;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const ID = 'p-share-1';
const clip = (id, bytes, label) => ({ id, personId: ID, label, emoji: '🔊', mime: 'audio/wav', blob: new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), created: 2 });

before(async () => {
  console.error = () => {};
  const made = await (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ id: ID, name: 'Admiral Acorn', avatar: '', color: '#304A00', pin: '2468' }),
  }), env)).json();
  idb.seed(DB_NAME, DB_VERSION, SCHEMA, {
    people: [{ id: ID, name: 'Admiral Acorn', fun: true, avatar: '🦉', color: '#304A00', added: true, created: 1 }],
    cloud: [{ id: ID, key: made.key, rev: 0, sent: {}, sounds: {}, pin: true, remembered: true }],   // every profile has a PIN; this device remembers it
    clips: [clip('user-long', CLOUD_MAX_SOUND + 1, 'Long Song'), clip('user-hush', 0, 'Hush'), clip('user-burp', 8, 'Burp')],
    beats: [{ id: 'beat-mix', personId: ID, name: 'Mix Taco', bpm: 100, bars: 1, swing: 0, created: 3, saved: 3,
      rows: [{ clipId: 'user-burp', steps: [1, 0, 0, 0] }, { clipId: 'user-long', steps: [0, 1, 0, 0] }] }],
  });
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).startsWith('/api/')
    ? worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN } }), env)
    : pageFetch(url, init));
  await (await import('../web/app.js')).ready;
  cloud = await import('../web/cloud.js');
  await page.settle();
});

const shares = () => env.DB.rows('SELECT COUNT(*) AS n FROM shares')[0].n;

test('a sound too long for the cloud is not shared: one line says why, and no code is made', async () => {
  assert.equal(cloud.SHARE_TOO_LONG, 'That sound is too long to share (the most is 25 MB).');
  await assert.rejects(cloud.shareItem(ID, 'sound', 'user-long'), { message: cloud.SHARE_TOO_LONG });
  await assert.rejects(cloud.shareItem(ID, 'sound', ['user-long']), { message: cloud.SHARE_TOO_LONG }, 'from ✏️ Edit sounds too');
  assert.equal(shares(), 0);
});

test('an empty sound is not shared either', async () => {
  await assert.rejects(cloud.shareItem(ID, 'sound', 'user-hush'), { message: /nothing in it to share/ });
  assert.equal(shares(), 0);
});

test('a sound that fits still gets its code; with a long one beside it, the one that fits goes and the long one is named', async () => {
  const one = await cloud.shareItem(ID, 'sound', 'user-burp');
  assert.match(one.code, /^[A-Z2-9]{8}$/);
  assert.equal(one.left, '', 'nothing left out');
  const two = await cloud.shareItem(ID, 'sound', ['user-burp', 'user-long', 'user-hush']);
  assert.match(two.code, /^[A-Z2-9]{8}$/);
  assert.equal(two.left, 'Left out, too long for the cloud: Long Song. Left out, nothing in it: Hush.');
  assert.equal(shares(), 2);
});

test('a beat that plays a sound too long for the cloud is shared without it, and the sharer is told which', async () => {
  const { code, left } = await cloud.shareItem(ID, 'beat', 'beat-mix');
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.equal(left, 'Left out, too long for the cloud: Long Song.');
});

// The public preview: what the share's recording is made from (cloud.js asks
// renderShare), and what that recording plays (share-render.js).
test('the public preview never holds a sound the share left out', async () => {
  const asked = [];
  const wav = (n) => new Blob([new Uint8Array([82, 73, 70, 70, n, n, n, n])], { type: 'audio/wav' });
  cloud.initCloud({ renderShare: async (kind, ids, extra) => { asked.push({ kind, ids, leave: [...(extra?.leave ?? [])] }); return wav(asked.length); } });
  const sounds = await cloud.shareItem(ID, 'sound', ['user-burp', 'user-long']);
  const beat = await cloud.shareItem(ID, 'beat', 'beat-mix');
  assert.deepEqual(asked, [
    { kind: 'sound', ids: ['user-burp'], leave: ['user-long'] },
    { kind: 'beat', ids: 'beat-mix', leave: ['user-long'] },
  ], 'only the kept sounds are asked for, and the beat is told what to leave out');
  for (const [{ code }, n] of [[sounds, 1], [beat, 2]]) {
    const { preview } = env.DB.rows('SELECT preview FROM shares WHERE code = ?', code)[0];
    const audio = await worker.fetch(new Request(`https://noodlepads.com/api/sounds/${preview}`), env);
    assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [...new Uint8Array(await wav(n).arrayBuffer())], 'the preview stored is that recording');
  }
  // share-render.js: a beat told to leave a sound out never plays its row.
  const { renderAudio } = await import('../web/share-render.js');
  const { FakeOfflineAudioContext } = await import('./helpers.mjs');
  const played = [];
  const seq = {
    beatPlan: (b) => ({ seconds: 1, pattern: b, hits: b.rows.map((r, row) => ({ row, time: 0 })) }),
    prepareBeats: async () => {},
    soundHit: (ctx, dest, list, pattern, row) => { played.push(pattern.rows[row].clipId); return true; },
  };
  const mix = { id: 'beat-mix', rows: [{ clipId: 'user-burp', steps: [1] }, { clipId: 'user-long', steps: [1] }] };
  const had = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  try {
    await renderAudio('beat', 'beat-mix', { seq, beatById: () => mix, leave: new Set(['user-long']) });
    assert.ok(played.length && played.every((c) => c === 'user-burp'), `played ${played}`);
    played.length = 0;
    await renderAudio('beat', 'beat-mix', { seq, beatById: () => mix });
    assert.ok(played.includes('user-long'), 'with nothing left out, every row plays');
  } finally {
    globalThis.OfflineAudioContext = had;
  }
});

test('✏️ Edit sounds → 🔗 Share shows the left-out line under the code', async () => {
  const ui = await import('../web/cloud-ui.js');
  const shared = ui.shareSounds(ID, ['user-burp', 'user-long']);
  await page.settle();
  assert.equal(page.$('#pin-dialog').open, true, '🔗 Share asks the PIN, even on a device that remembers them');
  for (const k of '2468') page.$('#pin-keys').querySelector(`[data-key="${k}"]`).dispatch('click');
  await shared;
  assert.equal(page.$('#share-note').textContent, 'Left out, too long for the cloud: Long Song.');
  assert.equal(page.$('#share-made').hidden, false);
  page.$('#share-dialog').close();
});
