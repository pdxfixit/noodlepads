// A person's level (ADR 0019): 🧸 Kids · Regular · Advanced, in place of the
// one Advanced switch. Stored as `level` with `advancedBeats` beside it, so
// a person from an older copy (only `advancedBeats`) reads right here, and an
// older copy reads this copy's people right too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../web/state.js';
import { getSetting, setSetting, onSetting, cleanPrefs, levelOf, storedPair, LEVELS } from '../web/settings.js';

const notice = { textContent: '', hidden: true };
globalThis.document ??= { querySelector: () => notice };

const as = (values) => {
  state.settings = new Map();
  state.personId = 'p-a';
  state.prefs = new Map([['p-a', { personId: 'p-a', values }]]);
};

test('three levels, Regular by default', () => {
  assert.deepEqual(LEVELS, ['kids', 'regular', 'advanced']);
  as({});
  assert.equal(getSetting('level'), 'regular');
  assert.equal(getSetting('advancedBeats'), false);
});

test('a person stored by an older copy: Advanced on reads as Advanced, off as Regular', () => {
  as({ advancedBeats: true });
  assert.equal(getSetting('level'), 'advanced');
  assert.equal(getSetting('advancedBeats'), true);
  as({ advancedBeats: false, padSize: 0.5 });
  assert.equal(getSetting('level'), 'regular');
  as({ advancedBeats: 'yes' });
  assert.equal(getSetting('level'), 'regular', 'junk reads as the default');
});

test('levelOf: the level, unless an older copy changed the switch since', () => {
  assert.equal(levelOf(undefined), undefined);
  assert.equal(levelOf({}), undefined);
  assert.equal(levelOf({ level: 'kids', advancedBeats: false }), 'kids');
  assert.equal(levelOf({ level: 'advanced', advancedBeats: true }), 'advanced');
  assert.equal(levelOf({ level: 'kids' }), 'kids');
  assert.equal(levelOf({ level: 'wizard' }), undefined);
  // An older copy turned Advanced on for a Kids person, or off for an Advanced one.
  assert.equal(levelOf({ level: 'kids', advancedBeats: true }), 'advanced');
  assert.equal(levelOf({ level: 'advanced', advancedBeats: false }), 'regular');
});

test('setting the level stores the switch beside it, and setting the switch sets the level', () => {
  assert.deepEqual(storedPair('level', 'kids', 'regular'), { level: 'kids', advancedBeats: false });
  assert.deepEqual(storedPair('level', 'advanced', 'kids'), { level: 'advanced', advancedBeats: true });
  assert.deepEqual(storedPair('advancedBeats', true, 'kids'), { level: 'advanced', advancedBeats: true });
  assert.deepEqual(storedPair('advancedBeats', false, 'advanced'), { level: 'regular', advancedBeats: false });
  assert.deepEqual(storedPair('advancedBeats', false, 'kids'), { level: 'kids', advancedBeats: false });
  assert.deepEqual(storedPair('padSize', 0.5, 'kids'), { padSize: 0.5 });
});

test('changing the level saves both keys and tells both kinds of listener', async () => {
  as({ advancedBeats: false });
  const heard = [];
  const stopA = onSetting('level', (v) => heard.push(['level', v]));
  const stopB = onSetting('advancedBeats', (v) => heard.push(['advancedBeats', v]));
  await setSetting('level', 'advanced');
  assert.deepEqual(state.prefs.get('p-a').values, { level: 'advanced', advancedBeats: true });
  await setSetting('level', 'kids');
  assert.deepEqual(state.prefs.get('p-a').values, { level: 'kids', advancedBeats: false });
  await setSetting('advancedBeats', true);   // the sound sheet's ⚙️ Advanced
  assert.equal(getSetting('level'), 'advanced');
  stopA(); stopB();
  assert.deepEqual(heard, [
    ['level', 'advanced'], ['advancedBeats', true],
    ['level', 'kids'], ['advancedBeats', false],
    ['advancedBeats', true], ['level', 'advanced'],
  ]);
});

test('an older copy keeps only the keys it knows; Kids then reads as Regular there and here', () => {
  // This copy's record, cleaned by this copy: both keys stay.
  assert.deepEqual(cleanPrefs({ personId: 'p-a', values: { level: 'kids', advancedBeats: false, nope: 1 } }).values, { level: 'kids', advancedBeats: false });
  assert.deepEqual(cleanPrefs({ personId: 'p-a', values: { level: 'wizard' } }).values, {});
  // An older copy saved it again without `level`: what is left reads as Regular.
  as({ advancedBeats: false });
  assert.equal(getSetting('level'), 'regular');
});

test('without a person, the level is the device\'s, stored the same way', async () => {
  state.personId = null;
  state.prefs = new Map();
  state.settings = new Map([['advancedBeats', true]]);
  assert.equal(getSetting('level'), 'advanced');
  await setSetting('level', 'kids');
  assert.equal(state.settings.get('level'), 'kids');
  assert.equal(state.settings.get('advancedBeats'), false);
  assert.equal(getSetting('level'), 'kids');
});
