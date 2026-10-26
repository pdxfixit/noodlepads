// Cloud sync end to end: two (or three) fake devices, each with its own
// stores, sync one profile through the real Worker and a fake D1. The sync
// code (web/cloud-sync.js), the API client (web/cloud-api.js), the backup
// checks (cleanBackup) and the merge (mergeLoaded) are all the app's own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { createCloudApi, CloudError, cloudTrouble } from '../web/cloud-api.js';
import {
  syncProfile, recordsOf, planPush, decideRecord, hashOf, pieces, shareBundle, shareDoc, hasMade, syncNote, pushSlices, CHUNK_BYTES, CLOUD_MAX_SOUND, keyOf,
  progressShare, soundBytes, newProgress,
} from '../web/cloud-sync.js';
import { LIMITS } from '../worker/cloud.js';
import { cleanBackup } from '../web/backup.js';
import { mergeLoaded } from '../web/merge.js';
import { newId } from '../web/util.js';
import { appMeta } from '../web/device-meta.js';
import { cleanPrefs } from '../web/settings.js';

const KIT = ['kick', 'snare'];
const KEYS = { clips: 'id', overrides: 'id', orders: 'personId', patterns: 'personId', beats: 'id', people: 'id',
  settings: 'key', decks: 'personId', takes: 'id', songs: 'personId', songbook: 'id', prefs: 'personId', layouts: 'id', voices: 'id', touchLayouts: 'id' };

function server() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  const fetch = (url, init = {}) => worker.fetch(new Request(`https://noodlepads.com${url}`, {
    ...init, headers: { ...init.headers, Origin: ORIGIN }, duplex: 'half',
  }), env);
  // The device's header, as with the usage switch on (the Worker keeps no metrics without it).
  return { env, api: createCloudApi({ fetch, meta: () => appMeta('test', 400, true) }) };
}

class Device {
  constructor() {
    this.stores = Object.fromEntries(Object.keys(KEYS).map((k) => [k, []]));
    this.bases = new Map();   // "person|kind:id" -> the last-synced copy (IndexedDB `bases`)
  }
  // What a sync reads, as cloud.js storedLists gives it: a person's settings through cleanPrefs.
  lists() { return { ...this.stores, prefs: this.stores.prefs.map(cleanPrefs) }; }
  async put(store, r) {
    const k = KEYS[store];
    this.stores[store] = [...this.stores[store].filter((x) => x[k] !== r[k]), r];
  }
  async remove(store, key) {
    const k = KEYS[store];
    this.stores[store] = this.stores[store].filter((x) => x[k] !== key);
  }
  bundled() {
    const added = this.stores.people.filter((p) => p.added);
    return {
      peopleIds: new Set(), clipIds: new Set(), kitIds: new Set(KIT),
      addedPeopleIds: new Set(added.map((p) => p.id)), takenNames: added.map((p) => p.name), takenColors: added.map((p) => p.color),
    };
  }
  deps(api) {
    return {
      api,
      lists: () => this.lists(),
      kitIds: KIT,
      sha256: async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join(''),
      clean: (doc, audioOf) => cleanBackup(doc, audioOf, this.bundled()),
      merge: async (cleaned) => {
        const m = await mergeLoaded(this.stores, cleaned, { kitIds: KIT });
        for (const [store, records] of Object.entries(m.put)) for (const r of records) await this.put(store, r);
        for (const id of m.dropPeople) await this.remove('people', id);
      },
      put: (store, r) => this.put(store, r),
      remove: (store, key) => this.remove(store, key),
      saveLink: async (link) => { this.link = structuredClone({ ...link }); },
      bases: {
        load: async (personId) => new Map([...this.bases].filter(([k]) => k.startsWith(`${personId}|`)).map(([k, v]) => [k.slice(personId.length + 1), v])),
        save: async (personId, changes) => {
          for (const [k, v] of changes) if (v === null) this.bases.delete(`${personId}|${k}`); else this.bases.set(`${personId}|${k}`, structuredClone(v));
        },
      },
    };
  }
}

// What a sync did, without the merge counts.
const moved = ({ pulled, pushed, deleted, sounds }) => ({ pulled, pushed, deleted, sounds });

const blob = (...bytes) => new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
const bytesOf = async (b) => [...new Uint8Array(await b.arrayBuffer())];

// Device A with one person in the cloud: a recorded sound, a beat using it and
// the kit's kick, a kit edit, a pad order.
async function startA(api) {
  const a = new Device();
  const person = { id: 'p-a', name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', added: true, fun: true, created: 1, edited: 10 };
  a.stores.people.push(person);
  a.stores.clips.push({ id: 'user-1', personId: 'p-a', label: 'Burp', emoji: '😂', voice: 'normal', mime: 'audio/wav', blob: blob(1, 2, 3), created: 5 });
  a.stores.beats.push({ id: 'beat-1', personId: 'p-a', name: 'Wobbly Taco', bpm: 100, bars: 1, swing: 0,
    rows: [{ clipId: 'user-1', steps: [1, 0, 0, 0] }, { clipId: 'p-a-kick', steps: [0, 1, 0, 0] }], created: 6, saved: 6 });
  a.stores.overrides.push({ id: 'p-a-kick', label: 'Boom' });
  a.stores.orders.push({ personId: 'p-a', ids: ['user-1'] });
  const { key, rev } = await api.create({ id: 'p-a', name: person.name, avatar: person.avatar, color: person.color, edited: 10 });
  return { a, link: { id: 'p-a', key, rev } };
}

async function openOn(api, id, pin) {
  const d = new Device();
  d.stores.people.push({ id: 'p-me', name: 'Me', color: '#1F3FA8', added: true, created: 1 });   // a new device's own "Me"
  const opened = await api.open(id, pin);
  return { d, link: { id, key: opened.key, rev: 0 } };
}

test('a profile put in the cloud on one device opens whole on another', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  const first = await syncProfile(link, a.deps(api));
  assert.deepEqual(moved(first), { pulled: 0, pushed: 4, deleted: 0, sounds: 1 });
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM records')[0].n, 4);

  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  const person = b.stores.people.find((p) => p.id === 'p-a');
  assert.deepEqual([person.name, person.avatar, person.fun], ['Admiral Acorn', '🦖', true]);
  assert.ok(!b.stores.people.some((p) => p.id === 'p-me'), 'the empty "Me" made way');
  assert.equal(b.stores.clips.length, 1);
  assert.equal(b.stores.clips[0].label, 'Burp');
  assert.deepEqual(await bytesOf(b.stores.clips[0].blob), [1, 2, 3]);
  assert.deepEqual(b.stores.beats[0].rows.map((r) => r.clipId), ['user-1', 'p-a-kick']);
  assert.equal(b.stores.overrides[0].label, 'Boom');
  assert.deepEqual(b.stores.orders[0].ids, ['user-1']);

  const again = await syncProfile(bl, b.deps(api));
  assert.deepEqual(moved(again), { pulled: 0, pushed: 0, deleted: 0, sounds: 0 }, 'nothing echoes back');
  assert.deepEqual(moved(await syncProfile(link, a.deps(api))), { pulled: 0, pushed: 0, deleted: 0, sounds: 0 });
});

test('an edit on one device replaces the unchanged copy on the other: no doubles', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  await a.put('beats', { ...a.stores.beats[0], name: 'Turbo Taco', bpm: 140 });
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.beats.map((x) => [x.name, x.bpm]), [['Turbo Taco', 140]]);
});

test('the same beat changed on both devices in ways that can\'t merge keeps both, on both, and settles', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  // Two rows of one sound, rearranged differently on each device: no safe merge.
  const twice = (bpm, rows) => ({ ...a.stores.beats[0], bpm, rows });
  const kick = (steps, melody = false) => ({ clipId: 'p-a-kick', steps, melody });
  await a.put('beats', twice(100, [kick([1, 0, 0, 0]), kick([0, 0, 1, 0], true)]));
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  await a.put('beats', twice(120, [kick([0, 0, 1, 0], true), kick([1, 0, 0, 0]), { clipId: 'user-1', steps: [1, 1, 0, 0] }]));
  await b.put('beats', twice(90, [kick([1, 0, 0, 0], true), kick([0, 1, 0, 0])]));
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  await syncProfile(link, a.deps(api));
  const bpms = (d) => d.stores.beats.map((x) => x.bpm).sort((x, y) => x - y);
  assert.deepEqual(bpms(b), [90, 120]);
  assert.deepEqual(bpms(a), [90, 120]);
  for (let i = 0; i < 2; i++) { await syncProfile(bl, b.deps(api)); await syncProfile(link, a.deps(api)); }
  assert.deepEqual(bpms(a), [90, 120], 'no copies pile up');
  assert.deepEqual(bpms(b), [90, 120]);
});

test('a delete on one device reaches the other, and the cloud lets the audio go', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  await b.remove('clips', 'user-1');
  const r = await syncProfile(bl, b.deps(api));
  assert.equal(r.deleted, 1);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM sounds')[0].n, 0);
  await syncProfile(link, a.deps(api));
  assert.deepEqual(a.stores.clips, []);
});

test('a sound changed here and deleted there stays, and goes back to the cloud', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  await b.remove('clips', 'user-1');
  await syncProfile(bl, b.deps(api));
  await a.put('clips', { ...a.stores.clips[0], label: 'Big Burp' });
  await syncProfile(link, a.deps(api));
  assert.deepEqual(a.stores.clips.map((c) => c.label), ['Big Burp'], 'nothing a kid just changed is lost');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.clips.map((c) => c.label), ['Big Burp']);
});

test('a new look (🎲 or an avatar) goes both ways by the newer edit', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  await a.put('people', { ...a.stores.people[0], name: 'Agent Alpaca', avatar: '🐙', edited: 20 });
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  const p = b.stores.people.find((x) => x.id === 'p-a');
  assert.deepEqual([p.name, p.avatar], ['Agent Alpaca', '🐙']);
});

// A made sound on two devices: one moves its sliders (new audio, new recipe),
// the other renames it.
async function madeSoundOnTwo() {
  const BOOM = { tone: 'smooth', from: 160, to: 38, length: 0.8, shape: 'drop', pulses: 1 };   // synth.js's Boom
  const t = await twoDevicesWith((a) => a.put('clips', { ...a.stores.clips[0], synth: BOOM, changed: Date.now() - 9000 }));
  return { ...t, BOOM };
}
async function twoDevicesWith(before) {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await before(a);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  return { api, env, a, b, syncA: () => syncProfile(link, a.deps(api)), syncB: () => syncProfile(bl, b.deps(api)) };
}
const clipOf = async (d) => {
  const mine = d.stores.clips.filter((c) => c.personId === 'p-a');
  return Promise.all(mine.map(async (c) => ({ label: c.label, from: c.synth?.from, audio: await bytesOf(c.blob) })));
};

test('sliders moved on one device, the same sound renamed on the other: every device gets the new audio, recipe and name', async () => {
  for (const order of ['sliders first', 'name first']) {
    const { api, env, a, b, syncA, syncB, BOOM } = await madeSoundOnTwo();
    await a.put('clips', { ...a.stores.clips[0], blob: blob(9, 8, 7, 6), synth: { ...BOOM, from: 400 }, changed: Date.now() - 2000 });
    await b.put('clips', { ...b.stores.clips[0], label: 'Big Boom', changed: Date.now() - 1000 });
    const [first, second] = order === 'sliders first' ? [syncA, syncB] : [syncB, syncA];
    await first(); await second(); await first();
    const want = [{ label: 'Big Boom', from: 400, audio: [9, 8, 7, 6] }];
    assert.deepEqual(await clipOf(a), want, `${order}: A`);
    assert.deepEqual(await clipOf(b), want, `${order}: B`);
    const { d: c, link: cl } = await openOn(api, 'p-a');
    await syncProfile(cl, c.deps(api));
    assert.deepEqual(await clipOf(c), want, `${order}: a device opened later`);
    assert.deepEqual(env.DB.rows('SELECT bytes FROM sounds').map((r) => r.bytes), [4], `${order}: only the new audio is kept`);
  }
});

test('sliders moved differently on two devices: both sounds are kept, each with its own audio', async () => {
  for (const order of ['A first', 'B first']) {
    const { a, b, syncA, syncB, BOOM } = await madeSoundOnTwo();
    await a.put('clips', { ...a.stores.clips[0], blob: blob(9, 8, 7, 6), synth: { ...BOOM, from: 400 }, changed: Date.now() - 2000 });
    await b.put('clips', { ...b.stores.clips[0], blob: blob(5, 5, 5), synth: { ...BOOM, from: 900 }, changed: Date.now() - 1000 });
    const [first, second] = order === 'A first' ? [syncA, syncB] : [syncB, syncA];
    const r = (await first(), await second());
    assert.equal(r.kept, 1, order);
    await first();
    const sorted = async (d) => (await clipOf(d)).map((c) => `${c.from}:${c.audio.join('')}`).sort();
    assert.deepEqual(await sorted(a), ['400:9876', '900:555'], `${order}: A`);
    assert.deepEqual(await sorted(b), ['400:9876', '900:555'], `${order}: B`);
  }
});

test('a sound over 1.9 MB goes up and comes down in pieces, byte for byte', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  const big = new Uint8Array(CHUNK_BYTES + 5).map((_, i) => (i * 7) % 256);
  a.stores.clips.push({ id: 'user-2', personId: 'p-a', label: 'Long', mime: 'audio/wav', blob: new Blob([big], { type: 'audio/wav' }), created: 7 });
  await syncProfile(link, a.deps(api));
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM sound_chunks")[0].n, 3, 'two pieces, and one for the small sound');
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  const got = b.stores.clips.find((c) => c.id === 'user-2');
  assert.deepEqual(new Uint8Array(await got.blob.arrayBuffer()), big);
});

test('a sound too long for the cloud stays on the device, and the rest still syncs', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  a.stores.clips.push({ id: 'user-9', personId: 'p-a', label: 'Long song', mime: 'audio/wav', blob: new Blob([new Uint8Array(CLOUD_MAX_SOUND + 1)], { type: 'audio/wav' }), created: 9 });
  const r = await syncProfile(link, a.deps(api));
  assert.equal(r.tooBig, 1);
  assert.equal(r.pushed, 4, 'everything else went');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM records WHERE id = 'user-9'")[0].n, 0);
  assert.ok(a.stores.clips.some((c) => c.id === 'user-9'), 'still here');
  assert.equal((await syncProfile(link, a.deps(api))).deleted, 0, 'and never sent as a delete');
});

// A made sound whose sliders moved keeps its id and gets new audio
// (sheet.js saveSheet), stamped by state.js persist. The audio is the same
// size here, as a re-render of the same length is.
test('a made sound changed after it synced sends its new audio: the other device and a new one play the new sound', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(await bytesOf(b.stores.clips[0].blob), [1, 2, 3]);

  await a.put('clips', { ...a.stores.clips[0], blob: blob(9, 8, 7), changed: Date.now() });
  const r = await syncProfile(link, a.deps(api));
  assert.deepEqual([r.sounds, r.pushed], [1, 1], 'the new audio went up, then its record');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(await bytesOf(b.stores.clips[0].blob), [9, 8, 7]);
  const { d: c, link: cl } = await openOn(api, 'p-a');
  await syncProfile(cl, c.deps(api));
  assert.deepEqual(await bytesOf(c.stores.clips[0].blob), [9, 8, 7], 'a device opening it now gets the new audio');
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM sounds')[0].n, 1, 'the old audio is let go');

  // Changed on B now, longer: it goes back the other way.
  await b.put('clips', { ...b.stores.clips[0], blob: blob(4, 4, 4, 4), changed: Date.now() + 1 });
  assert.equal((await syncProfile(bl, b.deps(api))).sounds, 1);
  await syncProfile(link, a.deps(api));
  assert.deepEqual(await bytesOf(a.stores.clips[0].blob), [4, 4, 4, 4]);

  // A new name only: the audio is hashed again once, and nothing goes up twice.
  await a.put('clips', { ...a.stores.clips[0], label: 'Big Burp', changed: Date.now() + 2 });
  assert.deepEqual(moved(await syncProfile(link, a.deps(api))), { pulled: 0, pushed: 1, deleted: 0, sounds: 0 });
  assert.deepEqual(moved(await syncProfile(link, a.deps(api))), { pulled: 0, pushed: 0, deleted: 0, sounds: 0 });
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(moved(await syncProfile(bl, b.deps(api))), { pulled: 0, pushed: 0, deleted: 0, sounds: 0 }, 'settled');
});

test('new audio on one device and a new name on the other: one sound with both; new audio on both keeps both sounds', async () => {
  for (const order of ['audio first', 'name first']) {
    const { a, b, syncA, syncB } = await twoDevices();
    await a.put('clips', { ...a.stores.clips[0], blob: blob(9, 8, 7), changed: Date.now() });
    await b.put('clips', { ...b.stores.clips[0], label: 'Big Burp', changed: Date.now() + 1 });
    const [first, second] = order === 'audio first' ? [syncA, syncB] : [syncB, syncA];
    await first(); await second(); await first();
    for (const d of [a, b]) {
      assert.deepEqual(d.stores.clips.map((c) => c.label), ['Big Burp'], order);
      assert.deepEqual(await bytesOf(d.stores.clips[0].blob), [9, 8, 7], `${order}: the new audio stays`);
    }
  }
  const { a, b, syncA, syncB } = await twoDevices();
  await a.put('clips', { ...a.stores.clips[0], blob: blob(9, 8, 7), changed: Date.now() });
  await b.put('clips', { ...b.stores.clips[0], blob: blob(5, 5, 5), changed: Date.now() + 1 });
  await syncA(); await syncB(); await syncA();
  for (const d of [a, b]) {
    const got = await Promise.all(d.stores.clips.map((c) => bytesOf(c.blob)));
    assert.deepEqual(got.map(String).sort(), ['5,5,5', '9,8,7'], 'both new sounds are kept');
  }
});

test('a full profile keeps a new sound home and says so; its beats and edits still go, and the sound follows once there is room', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  // Someone's other sounds fill the profile (worker/cloud.js LIMITS.profileBytes).
  env.DB.db.prepare("INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-filler', 'p-a', 'audio/wav', ?, 1, 'x', 1, 0)").run(LIMITS.profileBytes - 5);
  a.stores.clips.push({ id: 'user-2', personId: 'p-a', label: 'Roar', mime: 'audio/wav', blob: blob(1, 2, 3, 4, 5, 6, 7, 8), created: 7 });
  await a.put('beats', { ...a.stores.beats[0], name: 'Turbo Taco' });
  const r = await syncProfile(link, a.deps(api));
  assert.equal(r.full, 1, 'the sound with no room is counted');
  assert.equal(r.pushed, 1, 'the beat went');
  assert.equal(syncNote(r), 'In the cloud ✓ (one sound the cloud has no room for stays on this device)');
  assert.ok(a.stores.clips.some((c) => c.id === 'user-2'), 'still here');
  assert.equal((await syncProfile(link, a.deps(api))).deleted, 0, 'and never sent as a delete');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual([b.stores.beats[0].name, b.stores.clips.map((c) => c.id)], ['Turbo Taco', ['user-1']]);

  env.DB.db.prepare("DELETE FROM sounds WHERE id = 's-filler'").run();
  const later = await syncProfile(link, a.deps(api));
  assert.deepEqual([later.full, later.sounds, later.pushed], [undefined, 1, 1]);
  assert.equal(syncNote(later), 'In the cloud ✓');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(await bytesOf(b.stores.clips.find((c) => c.id === 'user-2').blob), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(syncNote({ tooBig: 1, full: 2 }), 'In the cloud ✓ (one sound too long for the cloud, and 2 sounds the cloud has no room for stay on this device)');
});

test('pushes fit what the cloud takes: split by bytes as well as count, and a record too big for the cloud stays home', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  // Long takes of about 400 KB each: twelve are more than one push's 4 MB.
  for (let i = 0; i < 12; i++) a.stores.takes.push({ id: `take-${i}`, personId: 'p-a', name: `Take ${i}`, notes: 'x'.repeat(400_000) });
  a.stores.takes.push({ id: 'take-huge', personId: 'p-a', name: 'Huge', notes: 'x'.repeat(600_000) });
  const pushes = [];
  const counting = { ...api, push: (...args) => { pushes.push(args[2].length + args[3].length); return api.push(...args); } };
  const r = await syncProfile(link, { ...a.deps(api), api: counting });
  assert.equal(r.heavy, 1, 'the one over 512 KB is counted');
  assert.equal(r.pushed, 16, 'the four records and the twelve takes all went');
  assert.ok(pushes.length >= 2, 'in more than one push');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM records WHERE kind = 'takes'")[0].n, 12);
  assert.equal(syncNote(r), 'In the cloud ✓ (one thing too big for the cloud stays on this device)');
  assert.ok(a.stores.takes.some((t) => t.id === 'take-huge'), 'still here');
  const again = await syncProfile(link, a.deps(api));
  assert.deepEqual([again.pushed, again.deleted, again.heavy], [0, 0, 1], 'nothing sent again, never a delete, and still said');

  // By count, by bytes, and one item over the limit alone.
  assert.deepEqual(pushSlices([1, 1, 1, 1, 1], 100, 2), [[0, 2], [2, 4], [4, 5]]);
  assert.deepEqual(pushSlices([40, 40, 40, 10], 100, 200), [[0, 2], [2, 4]]);
  assert.deepEqual(pushSlices([10, 500, 10], 100, 200), [[0, 1], [1, 2], [2, 3]]);
  assert.deepEqual(pushSlices([]), []);
});

test('an empty sound (no audio at all, say from a backup) stays on the device, and the rest still syncs', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  a.stores.clips.push({ id: 'user-8', personId: 'p-a', label: 'Hush', mime: 'audio/wav', blob: new Blob([], { type: 'audio/wav' }), created: 8 });
  const r = await syncProfile(link, a.deps(api));
  assert.equal(r.pushed, 4, 'everything else went');
  assert.equal(r.tooBig, undefined, 'not called too long');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM records WHERE id = 'user-8'")[0].n, 0);
  assert.ok(a.stores.clips.some((c) => c.id === 'user-8'), 'still here');
  assert.equal((await syncProfile(link, a.deps(api))).deleted, 0, 'and never sent as a delete');
});

test("a person's settings travel with their profile", async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  a.stores.prefs.push({ personId: 'p-a', values: { advancedBeats: true, padSize: 0.66 } });
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.prefs, [{ personId: 'p-a', values: { advancedBeats: true, padSize: 0.66 } }]);
  await b.put('prefs', { personId: 'p-a', values: { advancedBeats: true, padSize: 0.13 } });
  await syncProfile(bl, b.deps(api));
  await syncProfile(link, a.deps(api));
  assert.equal(a.stores.prefs[0].values.padSize, 0.13, 'a change on one device shows on the other');
});

test('a share code: anyone with it gets the snapshot, and a copy lands as their own; the original never changes', async () => {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const made = shareBundle('beat', 'beat-1', a.lists(), 'p-a', KIT);
  assert.equal(made.title, 'Wobbly Taco');
  assert.deepEqual(made.bundle.beats[0].rows.map((r) => r.clipId), ['user-1', 'kit:kick']);
  assert.ok(!('blob' in made.bundle.clips[0]));
  const bundle = { ...made.bundle, clips: made.bundle.clips.map((x) => ({ ...x, sound: link.sounds[x.id].sound })) };
  const { code } = await api.share('p-a', link.key, { kind: made.kind, title: made.title, bundle });

  const c = new Device();
  c.stores.people.push({ id: 'p-c', name: 'Sir Squid', color: '#0C5E4B', added: true, fun: true, created: 1, edited: 1 });
  const share = await api.shared(code);
  assert.equal(share.title, 'Wobbly Taco');
  const { doc, soundOf } = shareDoc(share.bundle, 'p-c', KIT, newId, { kind: share.kind, title: share.title });
  const audio = new Map();
  for (const [clipId, sound] of soundOf) audio.set(clipId, await api.fetchSound(sound, 'audio/wav'));
  const cleaned = cleanBackup({ ...doc, people: [] }, (x) => audio.get(x.id) ?? null, c.bundled());
  await c.deps(api).merge(cleaned);
  assert.equal(c.stores.clips.length, 1);
  assert.equal(c.stores.clips[0].personId, 'p-c');
  assert.notEqual(c.stores.clips[0].id, 'user-1', 'fresh ids');
  assert.equal(c.stores.beats[0].name, 'Wobbly Taco remix', 'a remix: the shared beat is named so (Q18)');
  assert.deepEqual(c.stores.beats[0].rows.map((r) => r.clipId), [c.stores.clips[0].id, 'p-c-kick']);
  assert.deepEqual(await bytesOf(c.stores.clips[0].blob), [1, 2, 3]);

  await a.put('beats', { ...a.stores.beats[0], bpm: 150 });
  await syncProfile(link, a.deps(api));
  assert.equal((await api.shared(code)).bundle.beats[0].bpm, 100, 'a snapshot: later edits do not change it');
  assert.equal(env.DB.rows("SELECT COUNT(*) AS n FROM records WHERE profile_id = 'p-c'")[0].n, 0, 'reading a share writes nothing');
});

test('only someone who has made something goes to the cloud by themselves', () => {
  const lists = { clips: [], beats: [], prefs: [{ personId: 'p-me', values: { padSize: 0.66 } }], orders: [{ personId: 'p-me', ids: [] }] };
  assert.equal(hasMade(lists, 'p-me', KIT), false, 'settings and a pad order are not something made');
  assert.equal(hasMade({ ...lists, overrides: [{ id: 'p-me-kick', label: 'Boom' }] }, 'p-me', KIT), true, 'a kit edit is');
  assert.equal(hasMade({ ...lists, beats: [{ id: 'beat-1', personId: 'p-me' }] }, 'p-me', KIT), true);
});

test('pure rules: plan, sort, pieces', () => {
  const local = new Map([[keyOf('beats', 'b1'), { kind: 'beats', id: 'b1', record: { id: 'b1', bpm: 1 } }]]);
  assert.deepEqual(planPush(local, {}).put.map((r) => r.id), ['b1']);
  const sent = { [keyOf('beats', 'b1')]: hashOf({ id: 'b1', bpm: 1 }), [keyOf('beats', 'gone')]: 'x' };
  assert.deepEqual(planPush(local, sent), { put: [], del: [{ kind: 'beats', id: 'gone' }] });
  const hash = (r) => hashOf(r);
  const decide = (o) => decideRecord('beats', { hash, ...o }).action;
  const b1 = { id: 'b1', bpm: 1 };
  assert.equal(decide({ local: b1, remote: { id: 'b1', bpm: 2 }, sent: hashOf(b1) }), 'take', 'a link from before bases: unchanged here by its hash');
  assert.equal(decide({ local: { id: 'b1', bpm: 3 }, remote: b1, sent: hashOf(b1) }), 'keep', 'unchanged there by its hash');
  assert.equal(decide({ local: { id: 'b1', bpm: 3 }, remote: { id: 'b1', bpm: 2 }, sent: hashOf(b1) }), 'keepBoth', 'changed on both with no base: both kept');
  assert.equal(decide({ remote: { id: 'new' } }), 'fresh');
  assert.equal(decide({ remote: { id: 'gone' }, sent: hashOf({ id: 'gone' }) }), 'keep', 'gone here since: left to the push');
  assert.equal(decide({ remote: { id: 'gone', bpm: 9 }, sent: hashOf({ id: 'gone' }) }), 'take', 'gone here, edited there: the edit comes back');
  assert.equal(decide({ base: { id: 'b1', bpm: 7 }, local: { id: 'b1', bpm: 3 }, remote: { id: 'b1', bpm: 2 }, sent: hashOf(b1) }), 'keepBoth',
    'a base that does not match `sent` (a sync cut off halfway) is not trusted');
  assert.equal(hashOf({ a: 1, b: undefined, blob: 'x', sound: 's' }), hashOf({ a: 1 }), 'where the audio is kept is not content');
  assert.notEqual(hashOf({ a: 1 }, 'aa'), hashOf({ a: 1 }, 'bb'), 'the audio is');
  assert.deepEqual(pieces(0), [[0, 0]]);
  assert.deepEqual(pieces(5, 2), [[0, 2], [2, 4], [4, 5]]);
  assert.deepEqual(pieces(CHUNK_BYTES).length, 1);
  assert.equal(recordsOf({ overrides: [{ id: 'p-a-kick' }, { id: 'p-b-kick' }, { id: 'p-a-nope' }] }, 'p-a', KIT).size, 1);
});

test('no cloud here (the dev server, a static copy) or no network: a CloudError with status 0, said plainly', async () => {
  const none = createCloudApi({ fetch: async () => new Response('<h1>Not found</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } }) });
  const err = await none.hello().catch((e) => e);
  assert.ok(err instanceof CloudError);
  assert.equal(err.status, 0);
  assert.match(cloudTrouble(err), /isn't reachable from here/);
  const offline = createCloudApi({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal((await offline.list().catch((e) => e)).status, 0);
  const resting = createCloudApi({ fetch: async () => new Response('{"error":"cloud","over":true}', { status: 503, headers: { 'Content-Type': 'application/json' } }) });
  const r = await resting.list().catch((e) => e);
  assert.equal(r.over, true);
  assert.match(cloudTrouble(r), /resting until tomorrow/);
});

// A minute's rate limit (429 slow) is not a daily cap (429 busy): it never says "tomorrow".
// The edge's per-IP rate-limit rule answers 429 in a page of its own, with
// no JSON reason: a minute's wait, never "busy today".
test('a 429 that names no reason reads as slow: the edge rule\'s page, or JSON with no error', async () => {
  for (const res of [
    new Response('<html>Too many requests</html>', { status: 429, headers: { 'Content-Type': 'text/html' } }),
    new Response('', { status: 429 }),
    new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const api = createCloudApi({ fetch: async () => res });
    const err = await api.pull('p-mv4cyiqj-b8bt', 'k', 0).catch((e) => e);
    assert.ok(err instanceof CloudError);
    assert.deepEqual([err.status, err.error], [429, 'slow']);
    assert.equal(cloudTrouble(err), 'The cloud is busy right now. Try again in a minute.');
  }
  const busy = await createCloudApi({ fetch: async () => new Response('{"error":"busy"}', { status: 429, headers: { 'Content-Type': 'application/json' } }) })
    .pull('p-mv4cyiqj-b8bt', 'k', 0).catch((e) => e);
  assert.equal(busy.error, 'busy', "the Worker's own reason is kept");
  // A sound's download over its limit (worker/cloud.js getSound) is a minute's wait too.
  const download = await createCloudApi({ fetch: async () => new Response('{"error":"slow"}', { status: 429, headers: { 'Content-Type': 'application/json' } }) })
    .fetchSound('s-aaaaaaaaaaaaaaaaaaaaaaaaaa', 'audio/wav').catch((e) => e);
  assert.deepEqual([download.status, download.error], [429, 'slow']);
});

test('a rate limit says busy right now, a daily cap says busy today', () => {
  assert.equal(cloudTrouble(new CloudError(429, { error: 'slow' })), 'The cloud is busy right now. Try again in a minute.');
  assert.equal(cloudTrouble(new CloudError(429, { error: 'busy' })), 'The cloud is busy today. Try again tomorrow.');
  // One profile's own daily allowance (worker/cloud.js withinProfileDaily) says it is this profile's.
  assert.match(cloudTrouble(new CloudError(429, { error: 'busy', mine: true })), /^This profile has done a lot in the cloud today\. It catches up tomorrow/);
  assert.match(cloudTrouble(new CloudError(429, { error: 'wait', wait: 600 })), /Too many wrong tries\. Wait 10 minutes/);
});

test('a full cloud says what is full: the profile\'s sounds, its records, or everyone\'s', () => {
  const full = (error) => cloudTrouble(new CloudError(507, { error }));
  assert.match(full('profile full'), /full for this profile\. Delete some sounds/);
  assert.match(full('records full'), /full for this profile\. Delete some takes, beats, songs or shares/);
  assert.match(full('cloud full'), /full for everyone right now\. Everything still works on this device/);
  assert.match(full('shares full'), /shared as much as it can/);
});

test('a wrong PIN says how many tries are left; opening with the right one works', async () => {
  const { api } = server();
  await api.create({ id: 'p-k', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '2468' });
  const wrong = await api.open('p-k', '1111').catch((e) => e);
  assert.equal(cloudTrouble(wrong), "That PIN isn't right. 4 tries left before a 10-minute wait.");
  assert.ok((await api.open('p-k', '2468')).key);
});

// ── people whose id was a plain name (reid.js, state.js reIdStoredPeople) ──

test('the app\'s cloud client refuses a plain person id before anything is sent', async () => {
  const sent = [];
  const api = createCloudApi({ fetch: async (url, init) => { sent.push([url, init?.body]); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
  const calls = [
    () => api.create({ id: 'zed', name: 'Admiral Acorn', color: '#1F3FA8' }), () => api.open('zed'), () => api.forget('zed', 'k'),
    () => api.change('zed', 'k', {}), () => api.remove('zed', 'k'), () => api.pull('zed', 'k', 0), () => api.push('zed', 'k', [], []),
    () => api.startSound('zed', 'k', {}), () => api.share('zed', 'k', {}),
    () => api.myShares('zed', 'k'), () => api.unshare('zed', 'k', 'ABCD2345'),
  ];
  for (const call of calls) await assert.rejects(call(), (err) => err instanceof CloudError && err.status === 400 && err.error === 'id');
  assert.deepEqual(sent, []);
  assert.equal(api.rename, undefined, 'no rename route (Ben, Q27)');
});

test('a share bundle never says whose it was: no personId on its sounds, beats or songs', () => {
  const lists = {
    clips: [{ id: 'user-1', personId: 'p-a', label: 'Burp', blob: blob(1) }],
    beats: [{ id: 'beat-1', personId: 'p-a', name: 'Boom', rows: [{ clipId: 'user-1', steps: [1] }, { clipId: 'p-a-kick', steps: [1] }] }],
    songbook: [{ id: 'song-1', personId: 'p-a', name: 'Tune', slots: [{ beatId: 'beat-1', times: 1 }] }],
  };
  const { bundle } = shareBundle('song', 'song-1', lists, 'p-a', KIT);
  assert.doesNotMatch(JSON.stringify(bundle), /personId|p-a/);
  assert.deepEqual(bundle.beats[0].rows.map((r) => r.clipId), ['user-1', 'kit:kick']);
});

// ADR 0024: a shared song carries its lanes, and every beat on them; a remix
// renames the beats in its lanes and slots alike.
test('a shared playlist song brings the beats on its lanes; a remix points its blocks at the new beats', () => {
  const lists = {
    clips: [],
    beats: [
      { id: 'beat-1', personId: 'p-a', name: 'Boom', rows: [{ clipId: 'p-a-kick', steps: [1] }] },
      { id: 'beat-2', personId: 'p-a', name: 'Clap', rows: [{ clipId: 'p-a-kick', steps: [0, 1] }] },
    ],
    songbook: [{ id: 'song-1', personId: 'p-a', name: 'Tune', tempo: 120,
      lanes: [{ name: 'Drums', emoji: '🥁', muted: false, volume: 1, blocks: [{ beatId: 'beat-1', bar: 0, times: 2 }, { beatId: 'beat-gone', bar: 4, times: 1 }] },
        { name: 'Bass', emoji: '🎸', muted: true, volume: 0.5, blocks: [{ beatId: 'beat-2', bar: 1, times: 1 }] }],
      slots: [{ beatId: 'beat-1', times: 2 }, { beatId: 'beat-2', times: 1 }, { beatId: 'beat-gone', times: 1 }] }],
  };
  const share = shareBundle('song', 'song-1', lists, 'p-a', KIT);
  assert.deepEqual(share.bundle.beats.map((b) => b.id), ['beat-1', 'beat-2']);
  const [song] = share.bundle.songs;
  assert.equal(song.tempo, 120);
  assert.deepEqual(song.lanes.map((l) => l.blocks.map((b) => b.beatId)), [['beat-1'], ['beat-2']], 'a block of a beat not shared is left out');
  assert.deepEqual(song.slots.map((x) => x.beatId), ['beat-1', 'beat-2']);
  let n = 0;
  const { doc } = shareDoc(share.bundle, 'p-c', KIT, (kind) => `${kind}-new-${++n}`, { kind: 'song', title: 'Tune' });
  const ids = doc.beats.map((b) => b.id);
  assert.deepEqual(doc.songbook[0].lanes.map((l) => l.blocks.map((b) => b.beatId)), [[ids[0]], [ids[1]]]);
  assert.deepEqual(doc.songbook[0].slots.map((x) => x.beatId), ids);
  assert.equal(doc.songbook[0].lanes[1].muted, true, 'a lane keeps its mute and volume');
});

test('saved DJ key layouts sync with their person, and the app and the Worker agree on every kind', async () => {
  const { CLOUD_KINDS, pulledDoc } = await import('../web/cloud-sync.js');
  const { KINDS } = await import('../worker/cloud.js');
  assert.deepEqual(KINDS, CLOUD_KINDS);
  const { api } = server();
  const { a, link } = await startA(api);
  a.stores.layouts = [{ id: 'layout-1', personId: 'p-a', name: 'Space jam', created: 7, keys: { KeyQ: 'user-1' } }];
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  b.stores.layouts = [];
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.layouts.map((l) => [l.id, l.name, l.keys.KeyQ]), [['layout-1', 'Space jam', 'user-1']]);
  // A kind from a newer copy of the app is left in the cloud, not a crash.
  assert.deepEqual(pulledDoc('p-a', null, [{ kind: 'gadgets', id: 'g-1', body: { id: 'g-1' } }]).gadgets, undefined);
});

test('👆 touch layouts sync with their person, and count as something made (ADR 0029)', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  const saved = { id: 'touch-1', personId: 'p-a', name: 'Jam pads', created: 7, bands: [{ group: 'mine', size: 'l', sounds: ['user-1'] }] };
  a.stores.touchLayouts = [saved];
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.touchLayouts, [saved]);
  assert.equal(hasMade({ touchLayouts: [saved] }, 'p-a'), true, 'a saved touch layout takes its person to the cloud');
});

test("a kid's own voices sync with their person: made, used, renamed and deleted on one device, the same on the other", async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  const squeaky = { id: 'voice-1', personId: 'p-a', name: 'Squeaky', emoji: '🦄', knobs: { pitch: 7, echo: 2 }, created: 7, used: 7 };
  a.stores.voices = [squeaky];
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.voices, [squeaky], 'arrives as it was kept');

  // Used on B, renamed on A: the rename comes through, one voice.
  await b.put('voices', { ...squeaky, used: 50 });
  await syncProfile(bl, b.deps(api));
  await a.put('voices', { ...a.stores.voices[0], used: 50, name: 'Squeakier' });
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.voices.map((v) => v.name), ['Squeakier']);

  // A voice made from nothing (no knobs) never arrives; a delete does.
  await a.remove('voices', 'voice-1');
  await syncProfile(link, a.deps(api));
  await syncProfile(bl, b.deps(api));
  assert.deepEqual(b.stores.voices, []);
});

test("a person whose only own thing is a voice has made something, so they go to the cloud", async () => {
  const lists = { people: [{ id: 'p-x' }], voices: [{ id: 'voice-1', personId: 'p-x', name: 'Mine', emoji: '', knobs: { pitch: 2 } }] };
  assert.equal(hasMade(lists, 'p-x'), true);
  assert.equal(hasMade({ ...lists, voices: [] }, 'p-x'), false);
});

// ── three-way merging (merge3.js), through the real Worker ──

const pillsOf = (beat) => beat.rows.map((r) => r.steps.map((on) => (on ? 'x' : '.')).join('').slice(0, 4));
const beatOf = (d) => d.stores.beats.filter((b) => b.personId === 'p-a');
// Every record of the person, by content, so two devices can be compared.
const contentOf = (d) => [...recordsOf(d.lists(), 'p-a', KIT).values()]
  .map((r) => `${r.kind}:${r.id}:${hashOf(r.record)}`).sort();

async function twoDevices() {
  const { api, env } = server();
  const { a, link } = await startA(api);
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  await syncProfile(bl, b.deps(api));
  return { api, env, a, link, b, bl, syncA: () => syncProfile(link, a.deps(api)), syncB: () => syncProfile(bl, b.deps(api)) };
}

test('the same beat changed on both devices merges field by field: one beat, every change', async () => {
  for (const order of ['A first', 'B first']) {
    const { a, b, syncA, syncB } = await twoDevices();
    const [ba, bb] = [beatOf(a)[0], beatOf(b)[0]];
    await a.put('beats', { ...ba, name: 'Turbo Taco', rows: [{ ...ba.rows[0], steps: [1, 0, 1, 0] }, ba.rows[1]] });
    await b.put('beats', { ...bb, bpm: 140, rows: [bb.rows[0], { ...bb.rows[1], steps: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }] });
    const [first, second] = order === 'A first' ? [syncA, syncB] : [syncB, syncA];
    const merged = (await first(), await second());
    assert.equal(merged.merged, 1, order);
    await first();
    for (const d of [a, b]) {
      assert.equal(beatOf(d).length, 1, `${order}: no copy`);
      const x = beatOf(d)[0];
      assert.deepEqual([x.name, x.bpm, pillsOf(x)], ['Turbo Taco', 140, ['x.x.', '.x..']], order);
      assert.equal(!!x.rows[1].steps[15], true, 'a pill in the last place too');
    }
    assert.deepEqual(contentOf(a), contentOf(b), `${order}: the devices end equal`);
  }
});

test('a tempo changed on both devices: the newer edit wins, whichever syncs first', async () => {
  for (const order of ['A first', 'B first']) {
    const { a, b, syncA, syncB } = await twoDevices();
    await a.put('beats', { ...beatOf(a)[0], bpm: 120, changed: Date.now() - 5000 });
    await b.put('beats', { ...beatOf(b)[0], bpm: 90, changed: Date.now() - 1000 });
    const [first, second] = order === 'A first' ? [syncA, syncB] : [syncB, syncA];
    await first(); await second(); await first();
    assert.deepEqual([beatOf(a).map((x) => x.bpm), beatOf(b).map((x) => x.bpm)], [[90], [90]], order);
    assert.deepEqual(contentOf(a), contentOf(b));
  }
});

test('a setting changed on both devices: the newer edit wins, whichever syncs first', async () => {
  for (const order of ['A first', 'B first']) {
    const { a, b, syncA, syncB } = await twoDevices();
    await a.put('prefs', { personId: 'p-a', values: { padSize: 0.9 }, changed: Date.now() - 5000 });
    await b.put('prefs', { personId: 'p-a', values: { padSize: 0.13 }, changed: Date.now() - 1000 });
    const [first, second] = order === 'A first' ? [syncA, syncB] : [syncB, syncA];
    await first(); await second(); await first();
    assert.deepEqual([a.stores.prefs[0].values.padSize, b.stores.prefs[0].values.padSize], [0.13, 0.13], order);
  }
});

test('deleted on one device, edited on the other: the edit stays everywhere, in either order', async () => {
  for (const order of ['delete first', 'edit first']) {
    const { a, b, syncA, syncB } = await twoDevices();
    await b.remove('beats', 'beat-1');
    await a.put('beats', { ...beatOf(a)[0], name: 'Still here' });
    const [first, second] = order === 'delete first' ? [syncB, syncA] : [syncA, syncB];
    await first(); await second(); await first();
    assert.deepEqual([beatOf(a).map((x) => x.name), beatOf(b).map((x) => x.name)], [['Still here'], ['Still here']], order);
  }
  // Deleted on one, untouched on the other: gone from both.
  const { a, b, syncA, syncB } = await twoDevices();
  await a.remove('beats', 'beat-1');
  await syncA(); await syncB();
  assert.deepEqual([beatOf(a), beatOf(b)], [[], []]);
});

test('two devices pushing the same beat at the same moment: the cloud keeps the first, the second merges, nothing is lost', async () => {
  const { api, a, link, b, bl } = await twoDevices();
  await a.put('beats', { ...beatOf(a)[0], name: 'From A' });
  await b.put('beats', { ...beatOf(b)[0], bpm: 77 });
  // B pulls, then A syncs whole before B's push lands.
  let raced = false;
  const racing = { ...api, push: async (...args) => {
    if (!raced) { raced = true; await syncProfile(link, a.deps(api)); }
    return api.push(...args);
  } };
  const r = await syncProfile(bl, { ...b.deps(api), api: racing });
  assert.equal(r.merged, 1, 'the stale push came back, and merged');
  await syncProfile(link, a.deps(api));
  for (const d of [a, b]) assert.deepEqual(beatOf(d).map((x) => [x.name, x.bpm]), [['From A', 77]]);
});

// The pull reads this device's records, then waits for a new sound's audio.
// A kid editing the beat in that wait (sheet.js and others change records in
// place) must not have the cloud's copy written over the edit.
test('an edit made while a sync waits is never written over: it merges with the cloud\'s next round', async () => {
  for (const how of ['replaced', 'changed in place']) {
    const { api, a, b, syncA, syncB, bl } = await twoDevices();
    await a.put('beats', { ...beatOf(a)[0], name: 'Turbo Taco' });
    a.stores.clips.push({ id: 'user-2', personId: 'p-a', label: 'Roar', mime: 'audio/wav', blob: blob(4, 5, 6), created: 7 });
    await syncA();
    let edited = false;
    const editing = { ...api, fetchSound: async (...args) => {
      const got = await api.fetchSound(...args);
      if (!edited) {
        edited = true;
        const mine = beatOf(b)[0];
        if (how === 'replaced') await b.put('beats', { ...mine, bpm: 77, changed: Date.now() });
        else Object.assign(mine, { bpm: 77, changed: Date.now() });
      }
      return got;
    } };
    await syncProfile(bl, { ...b.deps(api), api: editing });
    assert.ok(edited, how);
    await syncA();
    for (const d of [a, b]) assert.deepEqual(beatOf(d).map((x) => [x.name, x.bpm]), [['Turbo Taco', 77]], `${how}: both edits, on both`);
    assert.deepEqual(moved(await syncB()), { pulled: 0, pushed: 0, deleted: 0, sounds: 0 }, `${how}: settled`);
  }
});

test('idempotent: the same pull applied twice changes nothing and sends nothing', async () => {
  const { a, b, bl, syncA, syncB } = await twoDevices();
  await a.put('beats', { ...beatOf(a)[0], name: 'Here' });
  await b.put('beats', { ...beatOf(b)[0], bpm: 130 });
  await syncA();
  const rev = bl.rev;
  await syncB();
  const before = contentOf(b);
  bl.rev = rev;   // pull the same records again
  const again = await syncB();
  assert.deepEqual(contentOf(b), before);
  assert.deepEqual([again.pushed, again.merged, again.kept], [0, 0, 0]);
  assert.equal(beatOf(b).length, 1);
});

test('three devices, each changing a different part of one beat and the settings, converge on every change', async () => {
  const { api, a, b, syncA, syncB } = await twoDevices();
  const { d: c, link: cl } = await openOn(api, 'p-a');
  const syncC = () => syncProfile(cl, c.deps(api));
  await syncC();
  for (const d of [a, b, c]) d.stores.prefs = [{ personId: 'p-a', values: { padSize: 0.5, advancedBeats: false } }];
  await syncA(); await syncB(); await syncC();
  const edit = async (d, change, prefs) => {
    await d.put('beats', change(beatOf(d)[0]));
    await d.put('prefs', { personId: 'p-a', values: { ...d.stores.prefs[0].values, ...prefs } });
  };
  await edit(a, (x) => ({ ...x, name: 'Triple' }), { padSize: 0.9 });
  await edit(b, (x) => ({ ...x, swing: 3, rows: [{ ...x.rows[0], muted: true }, x.rows[1]] }), { advancedBeats: true });
  await edit(c, (x) => ({ ...x, rows: [x.rows[0], { ...x.rows[1], steps: [1, 1, 0, 0] }, { clipId: 'p-a-snare', steps: [0, 0, 0, 1] }] }), {});
  for (let i = 0; i < 2; i++) { await syncC(); await syncA(); await syncB(); }
  for (const d of [a, b, c]) {
    const x = beatOf(d)[0];
    assert.equal(beatOf(d).length, 1);
    assert.deepEqual([x.name, x.swing, x.rows[0].muted, pillsOf(x)], ['Triple', 3, true, ['x...', 'xx..', '...x']]);
    assert.deepEqual(d.stores.prefs[0].values, { padSize: 0.9, advancedBeats: true });
  }
  assert.deepEqual(contentOf(a), contentOf(b));
  assert.deepEqual(contentOf(b), contentOf(c));
});

test('a device synced before bases were kept still merges safely: unchanged sides by their hash, a clash keeps both', async () => {
  const { a, b, syncA, syncB } = await twoDevices();
  b.bases.clear();   // an older copy of the app kept none
  await a.put('beats', { ...beatOf(a)[0], name: 'Newer' });
  await syncA();
  await syncB();
  assert.deepEqual(beatOf(b).map((x) => x.name), ['Newer'], 'unchanged on B: takes the cloud\'s');
  b.bases.clear();
  await a.put('beats', { ...beatOf(a)[0], bpm: 111 });
  await b.put('beats', { ...beatOf(b)[0], bpm: 99 });
  await syncA(); await syncB(); await syncA();
  assert.deepEqual(beatOf(a).map((x) => x.bpm).sort(), [111, 99], 'no base, both changed: both kept, as before');
  assert.deepEqual(contentOf(a), contentOf(b));
});

// ☁️ Open from the cloud's bar (Ben, 2026-10-26: a real one, never 0 then 100).
test('opening on another device tells how far it has got: the whole measure before the first byte, bytes that only grow, then stored and done', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  // Three pieces in the cloud: here each arrives whole (a phone's network
  // brings far smaller ones), so the bar must stop between them.
  const size = 2 * CHUNK_BYTES + 5;
  const big = new Uint8Array(size).map((_, i) => (i * 7) % 256);
  a.stores.clips.push({ id: 'user-2', personId: 'p-a', label: 'Long', mime: 'audio/wav', blob: new Blob([big], { type: 'audio/wav' }), created: 7 });
  await syncProfile(link, a.deps(api));

  const { d: b, link: bl } = await openOn(api, 'p-a');
  const heard = [];
  await syncProfile(bl, { ...b.deps(api), onProgress: (p) => heard.push(p) });
  assert.equal(heard[0].phase, 'finding');
  assert.equal(progressShare(heard[0]), 0, 'nothing to measure yet: the spinner');
  const first = heard.findIndex((p) => p.phase === 'sounds');
  assert.ok(first > 0);
  assert.deepEqual([heard[first].sounds, heard[first].total, heard[first].got], [2, 3 + size, 0], 'every sound and byte known before any arrives');
  const sounds = heard.filter((p) => p.phase === 'sounds');
  assert.ok(sounds.length > 5, `the bar moves inside a sound, not once per sound (${sounds.length} steps)`);
  for (let i = 1; i < sounds.length; i++) {
    assert.ok(sounds[i].got >= sounds[i - 1].got, 'bytes only grow');
    assert.ok(progressShare(sounds[i]) >= progressShare(sounds[i - 1]), 'the bar never goes back');
  }
  assert.equal(sounds.at(-1).got, 3 + size);
  assert.equal(sounds.at(-1).done, 2);
  assert.ok(sounds.some((p) => progressShare(p) > 0.3 && progressShare(p) < 0.9), 'part way, not 0 then 100');
  const stored = heard.findIndex((p) => p.stored);
  assert.ok(stored > first && heard[stored].phase === 'storing', 'stored once every sound has come');
  assert.equal(heard.at(-1).phase, 'done');
  assert.equal(b.stores.clips.length, 2);

  // A bar that throws never stops the sync.
  const { d: c, link: cl } = await openOn(api, 'p-a');
  await syncProfile(cl, { ...c.deps(api), onProgress: () => { throw new Error('a broken bar'); } });
  assert.equal(c.stores.clips.length, 2);
});

test('a person with no sounds to fetch never has a bar to fill: the spinner, then done', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  a.stores.clips = [];
  a.stores.beats[0].rows = [{ clipId: 'p-a-kick', steps: [1, 0, 0, 0] }];
  a.stores.orders = [];
  await syncProfile(link, a.deps(api));
  const { d: b, link: bl } = await openOn(api, 'p-a');
  const heard = [];
  await syncProfile(bl, { ...b.deps(api), onProgress: (p) => heard.push(p) });
  assert.ok(!heard.some((p) => p.phase === 'sounds'));
  assert.deepEqual(heard.map((p) => p.phase).filter((x, i, all) => x !== all[i - 1]), ['finding', 'storing', 'done']);
});

test('an open cut short keeps the sounds it fetched: the next try fetches only the rest', async () => {
  const { api } = server();
  const { a, link } = await startA(api);
  a.stores.clips.push({ id: 'user-2', personId: 'p-a', label: 'Toot', mime: 'audio/wav', blob: blob(4, 5, 6, 7), created: 7 });
  await syncProfile(link, a.deps(api));

  const { d: b, link: bl } = await openOn(api, 'p-a');
  const fetched = new Map();
  let calls = 0;
  const dropsSecond = { ...api, fetchSound: (...args) => (++calls === 2 ? Promise.reject(new CloudError(0, { error: 'offline' })) : api.fetchSound(...args)) };
  await assert.rejects(syncProfile(structuredClone(bl), { ...b.deps(dropsSecond), fetched }), (err) => err.status === 0);
  assert.equal(fetched.size, 1, 'the first sound is kept');
  assert.equal(b.stores.clips.length, 0, 'nothing is stored until every sound has come');

  calls = 0;
  const counting = { ...api, fetchSound: (...args) => { calls++; return api.fetchSound(...args); } };
  const heard = [];
  await syncProfile(bl, { ...b.deps(counting), fetched, onProgress: (p) => heard.push(p) });
  assert.equal(calls, 1, 'only the one missing');
  assert.equal(b.stores.clips.length, 2);
  assert.equal(heard.filter((p) => p.phase === 'sounds').at(-1).got, 7, 'the kept one counts as come');
});

test("the bar's measure: a record's size counts only when it is a whole number the cloud could hold; the share stays 0 to 1", () => {
  assert.equal(soundBytes({ bytes: 1000 }), 1000);
  for (const bytes of [undefined, 0, -5, 1.5, '1000', CLOUD_MAX_SOUND + 1, Infinity, NaN]) assert.equal(soundBytes({ bytes }), null, String(bytes));
  const p = newProgress();
  assert.equal(progressShare(p), 0);
  assert.equal(progressShare({ ...p, phase: 'sounds', sounds: 2, total: 100, got: 50 }), 0.5);
  assert.equal(progressShare({ ...p, phase: 'sounds', sounds: 2, total: 100, got: 500 }), 1, 'a record that said too little: never over');
  assert.equal(progressShare({ ...p, phase: 'sounds', sounds: 4, total: null, done: 1, now: { bytes: 10, got: 5 } }), 1.5 / 4, 'by sounds when a size is missing');
  assert.equal(progressShare({ ...p, phase: 'sounds', sounds: 4, total: null, done: 1, now: { bytes: null, got: 5 } }), 1 / 4);
  assert.equal(progressShare({ ...p, phase: 'storing', sounds: 2 }), 1);
});

test('a sound read as it arrives: its bytes told piece by piece, a stop is a CloudError "stalled", and too many bytes are refused', async () => {
  // A body that, with `hang`, sends nothing more until the call is stopped,
  // then fails as a browser's does.
  const body = (chunks, { hang = false, signal } = {}) => new ReadableStream({
    async pull(c) {
      if (chunks.length) { c.enqueue(new Uint8Array(chunks.shift())); return; }
      if (hang) {
        await new Promise((_, fail) => {
          const stopped = () => fail(new DOMException('Aborted', 'AbortError'));
          if (signal.aborted) stopped(); else signal.addEventListener('abort', stopped);
        });
      }
      c.close();
    },
  });
  const respond = (stream) => new Response(stream, { headers: { 'Content-Type': 'audio/wav' } });
  let next;
  const fetch = async (url, init = {}) => next(init);
  const api = createCloudApi({ fetch });

  next = () => respond(body([[1, 2], [3, 4, 5]]));
  const told = [];
  const got = await api.fetchSound('s-x', 'audio/wav', { onBytes: (n) => told.push(n), max: 10 });
  assert.deepEqual(told, [2, 3]);
  assert.deepEqual(await bytesOf(got), [1, 2, 3, 4, 5]);
  assert.equal(got.type, 'audio/wav');

  next = () => respond(body([[1, 2, 3], [4, 5, 6]]));
  await assert.rejects(api.fetchSound('s-x', 'audio/wav', { max: 4 }), (err) => err instanceof CloudError && err.status === 0 && err.error === 'sound size');

  const stop = new AbortController();
  next = (init) => respond(body([[1, 2]], { hang: true, signal: init.signal }));
  const stalled = api.fetchSound('s-x', 'audio/wav', { signal: stop.signal, onBytes: () => stop.abort() });
  await assert.rejects(stalled, (err) => err instanceof CloudError && err.status === 0 && err.error === 'stalled');

  // A response with no stream to read (an older browser): the whole thing at once.
  next = () => ({ ok: true, headers: new Headers({ 'Content-Type': 'audio/wav' }), blob: async () => new Blob([new Uint8Array([9, 9])], { type: 'audio/wav' }) });
  const once = [];
  assert.deepEqual(await bytesOf(await api.fetchSound('s-x', 'audio/wav', { onBytes: (n) => once.push(n) })), [9, 9]);
  assert.deepEqual(once, [2]);

  // A pull stopped mid-answer is "stalled" too, not an empty page.
  const halt = new AbortController();
  halt.abort();
  const pulls = createCloudApi({ fetch: async () => new Response('{"records":[]}', { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(pulls.pull('p-abcdefghij', 'k', 0, halt.signal), (err) => err.status === 0 && err.error === 'stalled');
});
