// Golden backups: one saved by each format of the app, kept as files in
// tests/fixtures/ (made by make-golden-backups.mjs, then never changed). Every
// version of the app must load each one with nothing dropped, and what loads
// must match the stored summary beside it. A backup is kept by whoever made
// it, so this is the test that stops a later change from quietly breaking
// the old ones (ADR 0011; AGENTS.md "Stored formats are kept by users").
//
// A change that moves a summary on purpose (a beat stamped with its time
// signature, ADR 0035) is a reviewed edit of the expected file:
// `GOLDEN_WRITE=1 node --test --test-force-exit tests/golden-backups.test.mjs`
// rewrites them, and the diff is what to read. The .zip files themselves are
// never regenerated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { readBackup, makeBackup } from '../web/backup.js';
import { unzip } from '../web/zip.js';

const dir = new URL('./fixtures/', import.meta.url);
const goldens = readdirSync(dir).filter((f) => /^backup-1\.\d+\.zip$/.test(f)).sort();

// What the app knows of itself that a backup is checked against: a fixed
// stand-in, so a change to boards.json can't move these tests.
const bundled = () => ({
  peopleIds: new Set(),
  clipIds: new Set(),
  kitIds: new Set(['airhorn', 'laser']),
  colorOk: (name) => ['red', 'blue', 'yellow'].includes(name),
});

const fileOf = (name) => new Blob([readFileSync(new URL(name, dir))]);

// Everything that loaded, as plain JSON: audio becomes its type, size and a sum of its bytes.
async function summary(out) {
  const sum = (bytes) => bytes.reduce((n, b) => (n * 31 + b) % 1000000007, 7);
  const plain = { ...out, clips: [] };
  for (const c of out.clips) {
    const { blob, ...rest } = c;
    plain.clips.push({ ...rest, audio: { type: blob.type, bytes: blob.size, sum: sum(new Uint8Array(await blob.arrayBuffer())) } });
  }
  return JSON.parse(JSON.stringify(plain));
}

test('the golden backups are there: every format so far', () => {
  assert.ok(goldens.includes('backup-1.0.zip'), goldens.join());
  assert.ok(goldens.includes('backup-1.1.zip'), goldens.join());
});

for (const name of goldens) {
  const expectedFile = new URL(name.replace(/\.zip$/, '.expected.json'), dir);

  test(`${name} loads with nothing dropped, as stored`, async () => {
    const out = await readBackup(fileOf(name), bundled());
    assert.equal(out.skipped, 0, 'nothing was dropped');
    assert.deepEqual(out.left, {}, 'nothing was left out');
    const got = await summary(out);
    if (process.env.GOLDEN_WRITE) writeFileSync(expectedFile, `${JSON.stringify(got, null, 1)}\n`);
    assert.deepEqual(got, JSON.parse(readFileSync(expectedFile, 'utf8')));
  });

  test(`${name} has every record it holds in what loads`, async () => {
    const entries = await unzip(fileOf(name));
    const doc = JSON.parse(new TextDecoder().decode(entries.get('backup.json')));
    const out = await readBackup(fileOf(name), bundled());
    for (const store of ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'settings', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices', 'touchLayouts']) {
      assert.equal(out[store].length, (doc[store] ?? []).length, store);
    }
    // Not one field of any record is lost or changed on the way in (the loaded
    // record may gain more: a time signature stamped on a beat, ADR 0035).
    const kept = (want, got, path) => {
      if (want && typeof want === 'object') {
        for (const k of Object.keys(want)) {
          if (k === 'file' && path.startsWith('clips[')) continue;   // the audio file becomes the sound's blob
          assert.ok(got && k in got, `${path}.${k} was lost`);
          kept(want[k], got[k], `${path}.${k}`);
        }
      } else assert.equal(got, want, `${path} changed`);
    };
    for (const store of Object.keys(doc)) {
      if (Array.isArray(doc[store])) doc[store].forEach((r, i) => kept(r, out[store][i], `${store}[${i}]`));
    }
    // Every sound's audio file comes through whole.
    for (const c of doc.clips) {
      const got = out.clips.find((x) => x.id === c.id);
      assert.deepEqual(new Uint8Array(await got.blob.arrayBuffer()), entries.get(c.file), c.id);
    }
  });

  test(`${name} loaded, saved again and loaded again is the same`, async () => {
    const first = await readBackup(fileOf(name), bundled());
    const second = await readBackup(await makeBackup(first, '1.0.0'), bundled());
    const { exported, version, ...a } = await summary(first);
    const { exported: e2, version: v2, ...b } = await summary(second);
    assert.deepEqual(b, a);
  });
}
