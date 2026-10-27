// model.js newClip and board.js addClip: how an own sound's record is made
// and added. The record must come out key for key what the five places that
// make one built by hand (app.js addMadeSound, Kids' recording, the sound
// sheet, ➕ Mix, ✂️ Chop), and survive the backup gate unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newClip } from '../web/model.js';
import { addClip } from '../web/board.js';
import { state } from '../web/state.js';
import { cleanBackup } from '../web/backup.js';

console.error = () => {};
const blob = new Blob(['x'], { type: 'audio/wav' });
const base = { personId: 'p-pip-1', label: 'Boom', emoji: '🎛️', color: 'blue', blob };

test('newClip: the defaults are one id, the plain voice, the blob\'s type and the time', () => {
  const before = Date.now();
  const clip = newClip(base);
  assert.match(clip.id, /^user-/);
  assert.equal(clip.voice, 'normal');
  assert.equal(clip.mime, 'audio/wav');
  assert.ok(clip.created >= before && clip.created <= Date.now());
  assert.deepEqual(Object.keys(clip).sort(), ['blob', 'color', 'created', 'emoji', 'id', 'label', 'mime', 'personId', 'voice']);
  assert.notEqual(newClip(base).id, clip.id, 'a new id each time');
});

test('newClip: what the caller gives wins, and extras are kept', () => {
  const clip = newClip({ ...base, voice: 'robot', amount: 0.5, mime: 'audio/webm', created: 7, exact: true, from: { id: 'user-a', how: 'mix' } });
  assert.equal(clip.voice, 'robot');
  assert.equal(clip.mime, 'audio/webm');
  assert.equal(clip.created, 7);
  assert.equal(clip.exact, true);
  assert.deepEqual(clip.from, { id: 'user-a', how: 'mix' });
  assert.equal(clip.amount, 0.5);
});

test('a made sound keeps every field through the backup gate', () => {
  const clip = newClip({ ...base, exact: true });
  const out = cleanBackup({ format: '1.0', clips: [{ ...clip, blob: undefined, file: 'x.wav' }] }, () => blob, { peopleIds: new Set(['p-pip-1']), clipIds: new Set() });
  const kept = out.clips[0];
  for (const key of ['id', 'personId', 'label', 'emoji', 'color', 'voice', 'mime', 'created', 'exact']) assert.deepEqual(kept[key], clip[key], key);
});

test('addClip puts the clip on the board and stores it', async () => {
  state.userClips = [];
  const clip = newClip(base);
  const saved = await addClip(clip);
  assert.ok(state.userClips.includes(clip));
  assert.equal(typeof saved, 'boolean');
  state.userClips = [];
});
