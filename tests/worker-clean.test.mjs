// The Worker checks every problem report with the app's own rules
// (web/log-clean.js), so a report the app builds is stored exactly as sent,
// and anything else is refused or cleaned the same way the app would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanUpload, errorCount, KIT_IDS } from '../worker/clean.js';
import { cleanPayload } from '../web/log-clean.js';

const boards = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));

test('the kit ids are the kit in boards.json', () => {
  assert.deepEqual([...KIT_IDS].sort(), boards.kit.map((k) => k.id).sort());
});

test('a report the app builds passes the Worker unchanged', () => {
  const kitIds = new Set(KIT_IDS);
  const raw = {
    format: 1, app: '14229ec 2026-10-11 11:43', device: 'K7Q4-M2XD', session: 's-9f3a', sent: '2026-10-11T19:42:07Z',
    env: { browser: 'Chrome', os: 'Android', type: 'phone', screen: [412, 915], dpr: 2.625, tz: 'America/Los_Angeles', audio: { sampleRate: 48000, baseLatencyMs: 10, state: 'running' } },
    settings: { advancedBeats: true, timeSignature: '4/4', sendLogs: true },
    counts: { people: 4, sounds: 30, recorded: 2, beats: 3, takes: 1, songs: 0 },
    dropped: 0,
    entries: [
      { t: 1200, kind: 'beat', data: { action: 'play', bpm: 120, bars: 1, advanced: false, mode: 'plain', signature: '4/4', rows: [{ sound: 'kick', kind: 'bundled' }] } },
      { t: 5000, kind: 'error', data: { message: 'Something broke near «name»' } },
    ],
  };
  const fromApp = cleanPayload(raw, { kitIds });
  assert.ok(fromApp, 'the app builds it');
  const { ok, upload } = cleanUpload(JSON.parse(JSON.stringify(fromApp)));
  assert.equal(ok, true);
  assert.deepEqual(upload, fromApp, 'stored exactly as the app sent it');
  assert.equal(errorCount(upload), 1);
});

test('an error in one of the live site\'s own files keeps its file name; any other site\'s is "external"', () => {
  const at = (source) => cleanUpload({ format: 1, device: 'K7Q4-M2XD', entries: [{ t: 1, kind: 'error', data: { message: 'x', source } }] })
    .upload.entries[0].data.source;
  assert.equal(at('https://noodlepads.com/sequencer.js'), 'sequencer.js');
  assert.equal(at('https://elsewhere.example/sequencer.js'), 'external');
});

test('anything that is not a report from the app is refused', () => {
  for (const body of [null, [], 'hello', { format: 2, device: 'K7Q4-M2XD', entries: [] }, { format: 1, device: 'pip', entries: [] }]) {
    assert.equal(cleanUpload(body).ok, false, JSON.stringify(body));
  }
});

test('a name sneaked into a field the app never sends is dropped, and free text is cut', () => {
  const { upload } = cleanUpload({ format: 1, device: 'K7Q4-M2XD', entries: [
    { t: 1, kind: 'beat', data: { action: 'play', label: 'Pip', rows: [{ sound: 'Pip Pads!' }] } },
    { t: 2, kind: 'error', data: { message: 'x'.repeat(500) } },
    { t: 3, kind: 'mystery', data: { anything: 'Toby' } },
  ] });
  const text = JSON.stringify(upload);
  assert.doesNotMatch(text, /Pip|Toby/);
  assert.ok(upload.entries.find((e) => e.kind === 'error').data.message.length <= 200);
  assert.equal(upload.entries.some((e) => e.kind === 'mystery'), false);
});
