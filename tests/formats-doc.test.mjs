// docs/formats.md is the backup format written down for v2 (Android), which
// reads a backup with no JavaScript. It must stay true: it names the current
// format, every store a backup holds, and every field of every record the
// golden 1.2 backup carries (a field added to the code and not to the page
// fails here).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_FORMAT, makeBackup } from '../web/backup.js';
import { unzip } from '../web/zip.js';

const page = readFileSync(new URL('../docs/formats.md', import.meta.url), 'utf8');
const golden = JSON.parse(readFileSync(new URL('./fixtures/backup-1.2.expected.json', import.meta.url), 'utf8'));
// A word the page uses as itself (in code or in a record's shape), not inside another word.
const named = (word) => new RegExp(`(^|[^A-Za-z0-9])${word}([^A-Za-z0-9]|$)`).test(page);

test('formats.md says which format it describes', () => {
  assert.ok(page.startsWith(`# The backup format (${BACKUP_FORMAT})`), `its title names ${BACKUP_FORMAT}`);
  assert.ok(page.includes('"1.<minor>"'));
});

test('formats.md names every store a backup holds', async () => {
  const doc = JSON.parse(new TextDecoder().decode((await unzip(await makeBackup({ people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [] }))).get('backup.json')));
  for (const key of Object.keys(doc)) assert.ok(named(key), `${key} is not on the page`);
  for (const store of ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'settings', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices', 'touchLayouts']) {
    assert.ok(Object.hasOwn(doc, store), `makeBackup writes ${store}`);
    assert.ok(new RegExp(`\\b${store}\\b`).test(page), `${store} is on the page`);
  }
});

test('formats.md names every field of every record in the golden 1.2 backup', () => {
  // Fields that are the app's own bookkeeping, not part of what a reader needs.
  const skip = new Set(['changed', 'audio', 'slots']);
  const missing = new Set();
  const walk = (value, where) => {
    if (Array.isArray(value)) { for (const v of value) walk(v, where); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) {
      if (skip.has(key) || /^(Key|Digit|Semicolon|Comma|Period|Slash)/.test(key)) continue;
      if (!named(key)) missing.add(`${where}.${key}`);
      // Nested records the page spells out: a row's, a lane's, a block's, a note's, a band's.
      if (['rows', 'lanes', 'blocks', 'tune', 'bands', 'events', 'groups', 'tempos'].includes(key)) walk(inner, `${where}.${key}`);
    }
  };
  for (const store of ['people', 'clips', 'overrides', 'orders', 'patterns', 'beats', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices', 'touchLayouts']) walk(golden[store], store);
  assert.deepEqual([...missing], [], 'fields the page does not mention');
});

test('formats.md gives the caps the code has', async () => {
  const { MAX_SOUND_BYTES, MAX_HEARD_BYTES } = await import('../web/backup.js');
  assert.ok(page.includes(`${MAX_SOUND_BYTES / 1048576} MB`), 'one sound at most');
  assert.ok(page.includes(`${MAX_HEARD_BYTES / 1048576} MB`), 'the heard copies together');
});
