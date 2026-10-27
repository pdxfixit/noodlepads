// The cloud needs a PIN (docs/design/cloud-needs-pin.md): turning ☁️ on asks the
// grown-up sum, then a new PIN typed twice, and only then makes the profile,
// in one request with the PIN; ✕ anywhere sends nothing. A person already in
// the cloud (409) joins with the PIN they have, never the one just picked; a
// row with no PIN in the way is said; a tab that died mid-create reopens with
// a link that asks for the PIN just picked. 🔑 Remember them here? follows,
// Not now first and focused. The real app with a stand-in IndexedDB, against
// the real Worker and a fake D1.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { fakeIndexedDB } from './fake-idb.mjs';
import { testManifest } from './test-board.mjs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { funName } from '../web/names.js';
import { WRONG_NOTE } from '../web/grown-up.js';
import { pinKeys } from './helpers.mjs';

let page;
let $;
let state;
let cloud;
let ui;
let persist;
let setPersonEdit;
const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
const idb = fakeIndexedDB();
const sent = [];   // every request the app made to the cloud: [method, path, body]
const call = async (path, body) => (await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body),
}), env)).json();
const inD1 = (id) => env.DB.rows('SELECT COUNT(*) AS n FROM profiles WHERE id = ?', id)[0].n === 1;
const creates = () => sent.filter(([m, p]) => m === 'POST' && p === '/api/profiles');

before(async () => {
  console.error = () => {};
  globalThis.indexedDB = idb;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const pageFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('/api/')) return pageFetch(url, init);
    sent.push([init.method ?? 'GET', String(url), typeof init.body === 'string' ? init.body : '']);
    return worker.fetch(new Request(`https://noodlepads.com${url}`, { ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half' }), env);
  };
  await (await import('../web/app.js')).ready;
  ({ state, setPersonEdit, persist } = await import('../web/state.js'));
  cloud = await import('../web/cloud.js');
  ui = await import('../web/cloud-ui.js');
  await page.settle();
});

const settle = () => page.settle();
const typePin = (digits) => pinKeys($, digits);
const names = () => [...state.peopleEdits.values()].map((p) => p.name).filter(Boolean);
const sumAnswer = () => Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent);
const answer = async (n) => {
  for (const d of String(n)) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
  await settle();
};

// A person on this device who made a beat (stored as the app stores it), not in the cloud.
async function newPerson(id, name = funName(names())) {
  await setPersonEdit(id, { id, name, fun: true, avatar: '🦊', color: '#1F3FA8', added: true, created: 5 });
  const beat = { id: `beat-${id}`, personId: id, name: 'Wobbly Taco', bpm: 100, bars: 1, rows: [{ clipId: `${id}-kick`, steps: [1, 0, 0, 0] }], created: 1, saved: 1 };
  state.savedBeats = [...state.savedBeats, beat];
  await persist('beats', structuredClone(beat));
  (await import('../web/people.js')).renderPeopleEditor();
}
const sheetOf = async (id) => {
  if (!$('#people-dialog').open) $('#people-open').dispatch('click');
  $('#people-edit').children.find((r) => r.dataset.person === id).querySelector('[data-profile]').dispatch('click');
  await settle();
  if ($('#pin-dialog').open) { typePin('2468'); await settle(); }
};
const closeSheets = () => { $('#profile-dialog').close(); $('#people-dialog').close(); };
const switchOff = () => $('#profile-cloud').getAttribute('aria-checked') === 'false';

test('the switch asks the sum first, with who it is for; a wrong sum says so and asks another, and sends nothing', async () => {
  await newPerson('p-sum');
  await sheetOf('p-sum');
  const before = sent.length;
  $('#profile-cloud').dispatch('click');
  await settle();
  assert.equal($('#kids-sum').open, true);
  assert.equal($('#pin-dialog').open, false, 'no PIN pad before the sum');
  assert.equal($('#kids-sum-why').textContent, `☁️ To put 🦊 ${state.peopleEdits.get('p-sum').name} in the cloud`);
  const first = sumAnswer();
  await answer(first + 1);
  assert.equal($('#kids-sum').open, true, 'a wrong answer asks another');
  assert.equal($('#kids-sum-note').textContent, WRONG_NOTE);
  assert.equal($('#pin-dialog').open, false);
  assert.deepEqual(sent.slice(before).filter(([m, p]) => m === 'POST' && p === '/api/profiles'), [], 'nothing sent');
  assert.equal(switchOff(), true);
  await answer(sumAnswer());
  assert.equal($('#kids-sum').open, false);
  assert.equal($('#pin-dialog').open, true, 'the right one opens the PIN pad');
  $('#pin-dialog').close();
  await settle();
  closeSheets();
});

test('the first pad says who picks the PIN and what becomes public; a right sum and a PIN twice make one create, carrying the PIN, after a pending link was saved', async () => {
  const id = 'p-up';
  await newPerson(id);
  await sheetOf(id);
  // The pending link is saved before the create goes out: this device would reopen with it.
  let pendingAtCreate = null;
  const pageFetch = globalThis.fetch;
  const { DB_NAME } = await import('../web/store.js');
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === '/api/profiles' && init.method === 'POST') pendingAtCreate = idb.rows(DB_NAME, 'cloud').find((l) => l.id === id) ?? null;
    return pageFetch(url, init);
  };
  const before = creates().length;
  try {
    $('#profile-cloud').dispatch('click');
    await settle();
    await answer(sumAnswer());
    assert.equal($('#pin-title').textContent, '☁️ Pick their PIN');
    assert.equal($('#pin-hint').textContent, 'A grown-up picks this PIN. Four numbers, asked each time they are opened, on every device.');
    assert.equal($('#pin-public').hidden, false);
    assert.equal($('#pin-public').textContent, 'Their sounds, beats and recorded voices are stored on noodlepads.com. Anyone can see their fun name and picture, and play a sound of theirs if they have its link.');
    typePin('2468');
    await settle();
    assert.equal($('#pin-title').textContent, 'Once more');
    assert.equal(creates().length, before, 'nothing is made before the second pad');
    typePin('2468');
    await settle();
  } finally {
    globalThis.fetch = pageFetch;
  }
  const made = creates().slice(before);
  assert.equal(made.length, 1, 'one create');
  assert.equal(JSON.parse(made[0][2]).pin, '2468');
  assert.equal(JSON.parse(made[0][2]).id, id);
  assert.ok(pendingAtCreate && pendingAtCreate.key === null && pendingAtCreate.pin === true && pendingAtCreate.check?.hash, `the pending link was saved first: ${JSON.stringify(pendingAtCreate)}`);
  assert.ok(inD1(id));
  assert.equal(cloud.inCloud(id), true);
  assert.equal(cloud.linkOf(id).pin, true);
  assert.equal(cloud.linkOf(id).key, null, 'the key is not kept unless they say Remember');
  assert.ok(cloud.keyOf(id), 'but held for this visit, and it synced');
  assert.ok(env.DB.rows('SELECT COUNT(*) AS n FROM records WHERE profile_id = ?', id)[0].n > 0, 'synced at once');
  assert.equal($('#profile-pin-state').textContent, '✅ In the cloud, PIN set');
  // Then 🔑 Remember them here?: Not now first and focused; ✕ is Not now.
  assert.equal($('#remember-dialog').open, true);
  assert.ok(globalThis.document.activeElement === $('#remember-no'), 'Not now has the focus');
  const html = (await import('node:fs')).readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="remember-no"') < html.indexOf('id="remember-yes"'), 'Not now comes first');
  assert.match(html, /id="remember-no" data-close autofocus>Not now</);
  assert.match($('#remember-sub').textContent, /^Anyone using this device can open them\./);
  $('#remember-dialog').close();
  await settle();
  assert.equal(cloud.inCloud(id), true, '✕ leaves them in the cloud');
  assert.equal(cloud.isRemembered(id), false, 'not remembered');
  assert.equal(cloud.linkOf(id).noOffer, true, 'and not asked again here');
  closeSheets();
});

test('a start with only the pending link opens with the PIN just picked: if the profile was made, that PIN opens it', async () => {
  const id = 'p-pending';
  await newPerson(id);
  const name = state.peopleEdits.get(id).name;
  await call('profiles', { id, name, avatar: '🦊', color: '#1F3FA8', pin: '6153' });   // the create went through
  // What goUp had saved before the tab died: no key, a PIN, its check.
  const check = { salt: '00'.repeat(16), hash: '00'.repeat(32) };
  state.cloud.set(id, { id, key: null, rev: 0, sent: {}, sounds: {}, pin: true, check });
  assert.equal(cloud.needsPin(id), true);
  const asked = ui.askToOpen(id);
  await settle();
  assert.equal($('#pin-dialog').open, true);
  typePin('6153');
  await settle();
  assert.equal(await asked, true);
  assert.ok(cloud.keyOf(id));
  if ($('#remember-dialog').open) $('#remember-dialog').close();
  await settle();
  assert.equal(cloud.inCloud(id), true);
});

test('a pending link whose create never went through: the open gets 404 on a link that never synced, and drops quietly', async () => {
  const id = 'p-never';
  await newPerson(id);
  state.cloud.set(id, { id, key: null, rev: 0, sent: {}, sounds: {}, pin: true, check: { salt: '00'.repeat(16), hash: '00'.repeat(32) } });
  const asked = ui.askToOpen(id);
  await settle();
  typePin('2468');
  await settle();
  assert.equal(await asked, false);
  assert.equal(cloud.inCloud(id), false, 'the link is dropped');
  assert.equal(cloud.statusOf(id), null, 'quietly: no trouble to see to');
  assert.equal(state.peopleEdits.get(id).offline, undefined);
  assert.ok(state.savedBeats.some((b) => b.personId === id), 'everything is still here');
  assert.equal(inD1(id), false);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal($('#announce').textContent, 'Not in the cloud yet. A grown-up can put them there.', 'said for a screen reader, with nothing to see to');
});

test('already in the cloud (409): the PIN just picked is never tried; a pad asks the PIN they have, and it joins them up', async () => {
  const id = 'p-joins';
  await newPerson(id);
  const name = state.peopleEdits.get(id).name;
  await call('profiles', { id, name, avatar: '🦊', color: '#1F3FA8', pin: '7788' });   // restored from a backup here, or still there from another device
  await sheetOf(id);
  const before = sent.length;
  $('#profile-cloud').dispatch('click');
  await settle();
  await answer(sumAnswer());
  typePin('7391');
  await settle();
  typePin('7391');
  await settle();
  const after = sent.slice(before);
  assert.equal(after.filter(([m, p]) => m === 'POST' && p === '/api/profiles').length, 1);
  assert.deepEqual(after.filter(([, p]) => p.endsWith('/open')), [], 'the PIN just picked was never tried against it');
  assert.equal(cloud.inCloud(id), false, 'the pending link was dropped');
  assert.equal($('#pin-dialog').open, true, 'a pad of its own');
  assert.equal($('#pin-hint').textContent, 'Already in the cloud with a PIN. Type that one to join up.');
  assert.equal($('#pin-public').hidden, true);
  typePin('9024');
  await settle();
  assert.match($('#pin-note').textContent, /4 tries left/);
  typePin('7788');
  await settle();
  assert.equal(cloud.inCloud(id), true, 'joined');
  assert.equal(cloud.linkOf(id).pin, true);
  assert.equal(cloud.isRemembered(id), false);
  assert.ok(cloud.keyOf(id));
  assert.equal(await cloud.api.open(id, '7788').then(() => true), true, 'their PIN is still theirs: nothing was changed');
  closeSheets();
});

test('✕ at the join pad leaves them on this device, nothing joined, nothing sent but the refused create', async () => {
  const id = 'p-joinx';
  await newPerson(id);
  const name = state.peopleEdits.get(id).name;
  await call('profiles', { id, name, avatar: '🦊', color: '#1F3FA8', pin: '7788' });
  await sheetOf(id);
  $('#profile-cloud').dispatch('click');
  await settle();
  await answer(sumAnswer());
  typePin('7391');
  await settle();
  typePin('7391');
  await settle();
  assert.equal($('#pin-hint').textContent, 'Already in the cloud with a PIN. Type that one to join up.');
  $('#pin-dialog').close();
  await settle();
  assert.equal(cloud.inCloud(id), false);
  assert.equal(switchOff(), true);
  closeSheets();
});

test('a row with no PIN in the way (made by hand): 409, then 404 on the join pad: the switch stays off, and it says why', async () => {
  const id = 'p-inway';
  await newPerson(id);
  env.DB.db.prepare("INSERT INTO profiles (id, name, color, edited, created) VALUES (?, 'Lady Lemon', '#1F3FA8', 0, ?)").run(id, Date.now());
  await sheetOf(id);
  $('#profile-cloud').dispatch('click');
  await settle();
  await answer(sumAnswer());
  typePin('7391');
  await settle();
  typePin('7391');
  await settle();
  assert.equal($('#pin-dialog').open, true, 'the join pad');
  typePin('8246');
  await settle();
  assert.equal($('#pin-dialog').open, false);
  assert.equal(cloud.inCloud(id), false);
  assert.equal(switchOff(), true);
  assert.equal($('#profile-cloud-text').textContent, 'Something in the cloud is in the way. Nothing was sent.');
  closeSheets();
});

test('no cloud (the dev server) or no network: the switch says so before any sum, and nothing is kept', async () => {
  const id = 'p-nonet';
  await newPerson(id);
  await sheetOf(id);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('/api/')) throw new TypeError('Failed to fetch');
    return realFetch(url, init);
  };
  cloud.resetCloudCheck();
  try {
    $('#profile-cloud').dispatch('click');
    await settle();
  } finally {
    globalThis.fetch = realFetch;
    cloud.resetCloudCheck();
  }
  assert.equal($('#kids-sum').open, false);
  assert.match($('#profile-cloud-text').textContent, /isn't reachable from here/);
  assert.equal(switchOff(), true);
  assert.equal(cloud.inCloud(id), false);
  closeSheets();
});

test('🔗 Share never puts anyone in the cloud: someone only on this device is told, and nothing is sent', async () => {
  const id = 'p-shareless';
  await newPerson(id);
  const before = sent.length;
  await assert.rejects(cloud.shareItem(id, 'beat', `beat-${id}`), { message: 'Put them in the cloud first to share.' });
  assert.deepEqual(sent.slice(before).filter(([m, p]) => m !== 'GET' || p.includes('/profiles')), [], 'no create, no sync');
  assert.equal(cloud.inCloud(id), false);
  // Their profile shows no 🔗 Share until they are in the cloud.
  await sheetOf(id);
  assert.equal($('#cloud-share').hidden, true);
  assert.equal($('#cloud-sync').hidden, true);
  closeSheets();
});

test('the app\'s own cloud words: the old 400 needs pin from a Worker that wants one is said plainly', async () => {
  const { CloudError, cloudTrouble } = await import('../web/cloud-api.js');
  assert.equal(cloudTrouble(new CloudError(400, { error: 'needs pin' })), 'A grown-up puts someone in the cloud, with a PIN, in their profile.');
});
