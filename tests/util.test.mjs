import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor, slug, count, localDate, newId, versionLabel, footStacks } from '../web/util.js';

test('extensionFor maps audio types and falls back to "audio"', () => {
  assert.equal(extensionFor('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionFor('audio/ogg'), 'ogg');
  assert.equal(extensionFor('audio/mp4'), 'm4a');
  assert.equal(extensionFor('audio/x-m4a'), 'm4a');
  assert.equal(extensionFor('audio/aac'), 'm4a');
  assert.equal(extensionFor('audio/mpeg'), 'mp3');
  assert.equal(extensionFor('audio/wav'), 'wav');
  assert.equal(extensionFor('audio/x-wav'), 'wav');
  assert.equal(extensionFor('application/octet-stream'), 'audio');
  assert.equal(extensionFor(), 'audio');
});

test('slug makes a file-name-safe piece', () => {
  assert.equal(slug('Ba dum tss!'), 'ba-dum-tss');
  assert.equal(slug('  --Hi--  '), 'hi');
  assert.equal(slug('🥁🥁'), 'sound');
  assert.equal(slug(''), 'sound');
  assert.equal(slug(undefined), 'sound');
  assert.equal(slug('../../etc/passwd'), 'etc-passwd');
});

test('count pluralizes', () => {
  assert.equal(count(0, 'sound'), '0 sounds');
  assert.equal(count(1, 'sound'), '1 sound');
  assert.equal(count(2, 'saved beat'), '2 saved beats');
});

test('localDate is the local calendar day, zero-padded', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDate(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('newId has the shape backups accept, for every prefix the app uses', () => {
  for (const [prefix, re] of [['user', /^user-[a-z0-9-]{1,48}$/], ['beat', /^beat-[a-z0-9-]{1,48}$/], ['p', /^p-[a-z0-9-]{1,48}$/]]) {
    for (let i = 0; i < 50; i++) assert.match(newId(prefix), re);
  }
  assert.equal(newId('user', 0, 0.5), 'user-0-i');
  assert.notEqual(newId('user'), newId('user'));
});

test('versionLabel: a stamped build says 1.0 and its commit; a dev copy, and junk', () => {
  assert.deepEqual(versionLabel({ version: 'fd576a9', date: '2026-10-11 13:45 PDT' }), { version: 'fd576a9', release: '1.0', text: '1.0 · fd576a9 · 2026-10-11 13:45 PDT', date: '2026-10-11 13:45 PDT' }, 'no "v", and the time zone shows');
  assert.deepEqual(versionLabel({ version: 'abc123' }), { version: 'abc123', release: '1.0', text: '1.0 · abc123', date: '' }, 'version stays the bare commit, for the update check');
  assert.equal(versionLabel({ version: 'dev' }).text, 'dev copy');
  assert.equal(versionLabel({}).text, 'dev copy');
  assert.equal(versionLabel(null).text, 'dev copy');
  assert.equal(versionLabel('x').text, 'dev copy');
  assert.equal(versionLabel({ version: 'x'.repeat(100) }).version.length, 40);
});

test('footStacks: the version stacks once the how-to needs a second line', () => {
  assert.equal(footStacks(20, 20), false, 'one line');
  assert.equal(footStacks(40, 20), true, 'two lines');
  assert.equal(footStacks(40, 0), false, 'no measure: leave it');
});
