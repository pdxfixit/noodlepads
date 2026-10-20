import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor, slug, count, localDate, newId, versionLabel, updatedText, builtAt } from '../web/util.js';

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

// Ben, 2026-10-19: the sha links to GitHub; "1.0" alone said nothing, so no release number.
test('versionLabel: a stamped build says its commit (linked on GitHub) and date; a dev copy, and junk', () => {
  assert.deepEqual(versionLabel({ version: 'fd576a9', date: '2026-10-11 13:45 PDT' }), {
    version: 'fd576a9', commit: 'fd576a9', text: 'fd576a9 · 2026-10-11 13:45 PDT', date: '2026-10-11 13:45 PDT',
    url: 'https://github.com/pdxfixit/noodlepads/commit/fd576a9', updated: updatedText('2026-10-11 13:45 PDT'),
  }, 'no "v", no release number, and the time zone shows');
  assert.deepEqual(versionLabel({ version: 'abc1234' }), { version: 'abc1234', commit: 'abc1234', text: 'abc1234', date: '', url: 'https://github.com/pdxfixit/noodlepads/commit/abc1234', updated: '' }, 'version stays the bare commit, for the update check');
  assert.equal(versionLabel({ version: 'not-a-sha' }).url, '', 'only a commit links');
  // flarepress's stamp with site.conf release=: version is the whole label, commit the short commit.
  const released = versionLabel({ version: 'v1.0.215-4d5ef56', commit: '4d5ef56', date: '2026-10-19 04:27 UTC' });
  assert.equal(released.version, 'v1.0.215-4d5ef56', 'version stays the whole label, for the update check and telemetry');
  assert.equal(released.commit, '4d5ef56', 'About shows the commit, never the whole label');
  assert.equal(released.url, 'https://github.com/pdxfixit/noodlepads/commit/4d5ef56');
  assert.equal(versionLabel({ version: 'v1.0.215-4d5ef56-dirty', commit: '4d5ef56' }).url, 'https://github.com/pdxfixit/noodlepads/commit/4d5ef56');
  assert.equal(versionLabel({ version: 'v1.0.215-4d5ef56', commit: '<b>' }).url, '', 'a commit that is not one links nowhere');
  assert.equal(versionLabel({ version: 'dev' }).url, '');
  assert.equal(versionLabel({ version: 'dev' }).text, 'dev copy');
  assert.equal(versionLabel({}).text, 'dev copy');
  assert.equal(versionLabel(null).text, 'dev copy');
  assert.equal(versionLabel('x').text, 'dev copy');
  assert.equal(versionLabel({ version: 'x'.repeat(100) }).version.length, 40);
});

// Ben, 2026-10-19: the corner says "Updated Oct 19, 9:27 PM", in the device's time.
test('updatedText: when the build went live, in the device\'s words and time zone', () => {
  const us = { locale: 'en-US', timeZone: 'America/Los_Angeles' };
  assert.equal(updatedText('2026-10-19 04:27 UTC', us), 'Oct 18, 9:27 PM', 'the deploy stamps UTC');
  assert.equal(updatedText('2026-10-19 04:27 UTC', { locale: 'en-US', timeZone: 'UTC' }), 'Oct 19, 4:27 AM');
  assert.equal(updatedText('2026-10-11 13:45 PDT', us), 'Oct 11, 1:45 PM', "Ben's Mac stamps its own zone");
  assert.equal(updatedText('2026-10-11 13:45', { locale: 'en-US', timeZone: 'UTC' }), 'Oct 11, 1:45 PM', 'no zone: UTC');
  assert.equal(builtAt('2026-10-19 04:27 UTC').toISOString(), '2026-10-19T04:27:00.000Z');
  for (const junk of ['', 'soon', '2026-10-19 04:27 XYZ', undefined, 42]) assert.equal(updatedText(junk), '', String(junk));
  assert.equal(versionLabel({ version: 'abc1234', date: '2026-10-19 04:27 UTC' }).updated, updatedText('2026-10-19 04:27 UTC'));
});
