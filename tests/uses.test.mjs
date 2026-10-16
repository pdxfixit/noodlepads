// Feature-use counts on the device (web/uses.js, ADR 0016): what is counted,
// for whom, what waits in localStorage `uses`, what a send takes off, and
// what the device says about itself on every cloud call.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  USES, WIDTHS, MAX_COUNT, DIALOG_USES, countUse, pendingUses, sentUses, useOfLog, useOfDialog, watchUses, widthBucket, appMeta, clearUses,
} from '../web/uses.js';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../web/settings.js';
import { cleanUses, readMeta } from '../worker/metrics.js';
import { logEvent, onLog } from '../web/log.js';
import { createCloudApi } from '../web/cloud-api.js';
import { setUsage } from '../web/usage.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
beforeEach(() => store.clear());

test('each use counts for its person, and only the features on the list', () => {
  countUse('pad', 'p-a');
  countUse('pad', 'p-a');
  countUse('beats', 'p-a');
  countUse('pad', 'p-b');
  countUse('typed-a-name', 'p-a');
  countUse('pad', null);
  assert.deepEqual(pendingUses('p-a'), { pad: 2, beats: 1 });
  assert.deepEqual(pendingUses('p-b'), { pad: 1 });
  assert.equal(pendingUses('p-c'), null);
});

test('a send takes off only what it sent: uses counted meanwhile wait', () => {
  for (let i = 0; i < 3; i++) countUse('pad', 'p-a');
  const sending = pendingUses('p-a');
  countUse('pad', 'p-a');
  countUse('dj', 'p-a');
  sentUses('p-a', sending);
  assert.deepEqual(pendingUses('p-a'), { pad: 1, dj: 1 });
  sentUses('p-a', { pad: 1, dj: 1 });
  assert.equal(pendingUses('p-a'), null);
  assert.deepEqual(JSON.parse(store.get('uses')), {}, 'nobody left waiting');
});

test('junk in localStorage is dropped, never sent', () => {
  store.set('uses', '{"p-a": {"pad": 2, "nope": 9, "dj": -1, "beats": 1.5}, "p-b": "x"}');
  assert.deepEqual(pendingUses('p-a'), { pad: 2 });
  assert.equal(pendingUses('p-b'), null);
  store.set('uses', 'not json');
  countUse('pad', 'p-a');
  assert.deepEqual(pendingUses('p-a'), { pad: 1 });
});

test('a count stops at MAX_COUNT, and the Worker takes exactly what the app sends', () => {
  store.set('uses', JSON.stringify({ 'p-a': { pad: MAX_COUNT } }));
  countUse('pad', 'p-a');
  assert.deepEqual(pendingUses('p-a'), { pad: MAX_COUNT });
  for (const f of USES) countUse(f, 'p-b');
  const all = pendingUses('p-b');
  assert.deepEqual(cleanUses({ uses: all }), all, 'every feature passes the Worker');
  assert.equal(cleanUses({ uses: { ...all, other: 1 } }), null);
  assert.equal(cleanUses({ uses: { pad: MAX_COUNT + 1 } }), null);
  assert.equal(cleanUses({ uses: { pad: 0 } }), null);
  assert.equal(cleanUses({ uses: { pad: '3' } }), null);
  assert.equal(cleanUses({ uses: {} }), null);
  assert.equal(cleanUses({ uses: [1] }), null);
});

test('the log shows what was used: plays, records, 💾 Keep, shares, backups', () => {
  const cases = [
    [{ kind: 'beat', data: { action: 'play' } }, 'beat-play'],
    [{ kind: 'beat', data: { action: 'stop' } }, null],
    [{ kind: 'dj', data: { rec: 'start' } }, 'beat-record'],
    [{ kind: 'dj', data: { rec: 'grow' } }, 'beat-grow'],
    [{ kind: 'dj', data: { rec: 'stop' } }, null],
    [{ kind: 'song', data: { action: 'play' } }, 'song-play'],
    [{ kind: 'beat', data: { action: 'keep', groove: false } }, 'beat-keep'],
    [{ kind: 'song', data: { action: 'keep' } }, 'song-keep'],
    [{ kind: 'song', data: { action: 'stop' } }, null],
    [{ kind: 'chop', data: { made: 3 } }, 'chop'],
    [{ kind: 'chop', data: { found: 3 } }, null],
    [{ kind: 'backup', data: { saved: true } }, 'backup'],
    [{ kind: 'backup', data: { saved: false } }, null],
    [{ kind: 'cloud', data: { shared: 'beat' } }, 'share'],
    [{ kind: 'cloud', data: { remixed: 'sound' } }, 'remix'],
    [{ kind: 'cloud', data: { opened: 'share', kind: 'song' } }, 'share-open'],
    [{ kind: 'cloud', data: { opened: true } }, 'cloud-open'],
    [{ kind: 'cloud', data: { put: true } }, 'cloud-put'],
    [{ kind: 'cloud', data: { offline: true } }, 'offline'],
    [{ kind: 'cloud', data: { offline: false } }, null],
    [{ kind: 'cloud', data: { pin: 'set' } }, 'pin-set'],
    [{ kind: 'cloud', data: { pin: 'removed' } }, null],
    [{ kind: 'cloud', data: { unshared: true } }, 'unshare'],
    [{ kind: 'cloud', data: { sync: true, pulled: 3 } }, null],
    [{ kind: 'beat', data: { action: 'new' } }, 'beat-new'],
    [{ kind: 'beat', data: { action: 'groove' } }, 'groove-load'],
    [{ kind: 'beat', data: { action: 'sample' } }, 'groove-sample'],
    [{ kind: 'beat', data: { action: 'switch' } }, null],
    [{ kind: 'song', data: { action: 'new' } }, 'song-new'],
    [{ kind: 'song', data: { action: 'sound' } }, 'song-sound'],
    [{ kind: 'backup', data: { loaded: true } }, 'backup-load'],
    [{ kind: 'backup', data: { loaded: false } }, null],
    [{ kind: 'render', data: { voice: 'robot' } }, 'voice'],
    [{ kind: 'setting', data: { key: 'padSize', value: 'auto' } }, 'setting'],
    [{ kind: 'setting', data: { key: 'level', value: 'kids' } }, 'level-kids'],
    [{ kind: 'setting', data: { key: 'level', value: 'regular' } }, 'level-regular'],
    [{ kind: 'setting', data: { key: 'level', value: 'advanced' } }, 'level-advanced'],
    [{ kind: 'person', data: { added: 'p-a' } }, 'person-add'],
    [{ kind: 'person', data: { deleted: 'p-a' } }, 'person-delete'],
    [{ kind: 'person', data: { newIds: 2 } }, null],
    [{ kind: 'kids', data: { voice: 'robot' } }, 'kids-voice'],
    [{ kind: 'kids', data: { recorded: 2.5, voice: 'robot' } }, null],
    [{ kind: 'error', data: { message: 'x' } }, null],
  ];
  for (const [entry, want] of cases) assert.equal(useOfLog(entry), want, JSON.stringify(entry));
  for (const [, want] of cases) if (want) assert.ok(USES.includes(want), want);
});

test('watchUses counts what is logged, for whoever is the current person', () => {
  let who = 'p-a';
  const stop = watchUses(onLog, () => who);
  logEvent('beat', { action: 'play' });
  who = 'p-b';
  logEvent('cloud', { shared: 'sound' });
  logEvent('beat', { action: 'stop' });
  stop();
  logEvent('beat', { action: 'play' });
  assert.deepEqual(pendingUses('p-a'), { 'beat-play': 1 });
  assert.deepEqual(pendingUses('p-b'), { share: 1 });
});

test('the device says its version, a width bucket and touch, and the Worker reads only valid parts', () => {
  assert.equal(widthBucket(375), 360);
  assert.equal(widthBucket(320), 0);
  assert.equal(widthBucket(1366), 1280);
  assert.equal(widthBucket(5000), 2560);
  assert.equal(widthBucket('x'), 0);
  for (const b of WIDTHS) assert.equal(widthBucket(b), b);
  assert.equal(appMeta('7b5fc5e', 414, true), 'v=7b5fc5e&w=400&t=1');
  assert.equal(appMeta('a b<c>&w=9', 800, false), 'v=abcw9&w=768&t=0', 'nothing but safe characters');
  const read = (h) => readMeta(new Request('https://noodlepads.com/api/cloud', { headers: h === null ? {} : { 'X-Noodle-App': h } }));
  assert.deepEqual(read(appMeta('7b5fc5e-dirty', 414, true)), { app: '7b5fc5e-dirty', width: 400, touch: true });
  assert.deepEqual(read('v=<script>&w=401&t=yes'), { app: null, width: null, touch: false });
  assert.deepEqual(read(null), { app: null, width: null, touch: false });
});

test('every cloud call carries the header, and a broken meta never stops one', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(init.headers['X-Noodle-App']);
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  };
  await createCloudApi({ fetch, meta: () => appMeta('abc', 1024, false) }).hello();
  await createCloudApi({ fetch, meta: () => { throw new Error('no screen'); } }).hello();
  await createCloudApi({ fetch }).list();
  assert.deepEqual(seen, ['v=abc&w=1024&t=0', undefined, undefined]);
});

// Ben, 2026-10-16: the usage switch off sends nothing, ever.
test('with the usage switch off nothing is counted or waiting, clearUses empties the store, and cloud calls carry no header', async () => {
  countUse('pad', 'p-a');
  setUsage(false);
  try {
    countUse('pad', 'p-a');
    assert.equal(pendingUses('p-a'), null, 'nothing waits to be sent');
    assert.equal(appMeta('abc', 1024, false), null);
    const seen = [];
    const fetch = async (url, init) => { seen.push(Object.hasOwn(init.headers, 'X-Noodle-App')); return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }); };
    await createCloudApi({ fetch, meta: () => appMeta('abc', 1024, false) }).hello();
    assert.deepEqual(seen, [false], 'no header at all');
  } finally {
    setUsage(true);
  }
  assert.deepEqual(pendingUses('p-a'), { pad: 1 }, 'the count made while off never happened');
  clearUses();
  assert.equal(pendingUses('p-a'), null);
});

test('every dialog the app has counts as it opens, under a name on the list', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/<dialog[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  // Counted where they open, or by what they do (uses.js DIALOG_USES); the
  // sound sheet's "Throw away your changes?" is a question, not a feature, so it is not counted.
  const elsewhere = new Set(['kids-sum', 'grooves', 'mixer', 'roll', 'sheet-warn']);
  for (const id of ids) {
    if (elsewhere.has(id)) assert.equal(useOfDialog({ id }), null, id);
    else assert.ok(USES.includes(useOfDialog({ id })), `#${id} counts`);
  }
  for (const id of Object.keys(DIALOG_USES)) assert.ok(ids.includes(id), `#${id} is still in index.html`);
  assert.equal(useOfDialog(null), null);
  assert.equal(new Set(USES).size, USES.length, 'no name twice');
});

test('each level has its own count', () => {
  for (const l of LEVELS) assert.ok(USES.includes(`level-${l}`), l);
});
