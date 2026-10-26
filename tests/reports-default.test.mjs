// 📮 Problem reports are on by default (Ben, 2026-10-26): a device whose
// stored choice is off keeps it off. Only setSetting stores a value, so a
// device that never chose reads the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../web/state.js';
import { getSetting, SETTINGS } from '../web/settings.js';

test('problem reports are on for a device that never chose, and stay off where someone switched them off', () => {
  const before = state.settings;
  try {
    assert.equal(SETTINGS.sendLogs.default, true);
    state.settings = new Map();
    assert.strictEqual(getSetting('sendLogs'), true, 'never chose: on');
    state.settings = new Map([['sendLogs', false]]);
    assert.strictEqual(getSetting('sendLogs'), false, 'switched off before: still off');
    state.settings = new Map([['sendLogs', true]]);
    assert.strictEqual(getSetting('sendLogs'), true);
  } finally {
    state.settings = before;
  }
});
