import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logEvent, getLog, clearLog, MAX_ENTRIES } from '../web/log.js';

test('events are kept in order with a kind, a time and their data', () => {
  clearLog();
  logEvent('beat', { bpm: 100 });
  logEvent('error', { message: 'x' });
  const log = getLog();
  assert.deepEqual(log.map((e) => e.kind), ['beat', 'error']);
  assert.deepEqual(log[0].data, { bpm: 100 });
  assert.ok(log[1].t >= log[0].t);
});

test('only the newest entries are kept', () => {
  clearLog();
  for (let i = 0; i < MAX_ENTRIES + 25; i++) logEvent('n', { i });
  const log = getLog();
  assert.equal(log.length, MAX_ENTRIES);
  assert.equal(log[0].data.i, 25);
});

test('huge values are cut down, so one bad value cannot fill the log', () => {
  clearLog();
  logEvent('warn', { text: 'x'.repeat(5000), list: Array(500).fill(1) });
  const { data } = getLog()[0];
  assert.ok(data.text.length <= 301);
  assert.equal(data.list.length, 50);
});

test('getLog returns a copy', () => {
  clearLog();
  logEvent('a');
  getLog().pop();
  assert.equal(getLog().length, 1);
});
