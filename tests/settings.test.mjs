import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../web/state.js';
import { SETTINGS, getSetting, setSetting, onSetting, cleanPrefs } from '../web/settings.js';

// Storage is closed in these tests, so a save fails and shows a notice; this
// is the one element that needs.
const notice = { textContent: '', hidden: true };
globalThis.document ??= { querySelector: () => notice };

test('an unset setting reads as its default', () => {
  state.settings = new Map();
  assert.equal(getSetting('timeSignature'), '4/4');
});

test('a stored value this copy of the app does not know reads as the default', () => {
  state.settings = new Map([['timeSignature', '13/16']]);
  assert.equal(getSetting('timeSignature'), '4/4');
});

test('setting a value updates it in memory, tells listeners, and stops telling them on request', async () => {
  state.settings = new Map();
  const heard = [];
  const stop = onSetting('timeSignature', (v) => heard.push(v));
  await setSetting('timeSignature', '6/8');  // storage is not open here: persist reports and carries on
  assert.equal(getSetting('timeSignature'), '6/8');
  stop();
  await setSetting('timeSignature', '3/4');
  assert.deepEqual(heard, ['6/8']);
});

test('unknown settings and values are refused loudly', async () => {
  assert.throws(() => getSetting('nope'), /unknown setting/);
  await assert.rejects(setSetting('timeSignature', '9/9'), /isn't a value/);
  for (const spec of Object.values(SETTINGS)) assert.ok(spec.values.includes(spec.default));
});

test('the beat maker starts simple: advanced beats off, 4/4', () => {
  state.settings = new Map();
  assert.equal(getSetting('advancedBeats'), false);
  assert.equal(getSetting('timeSignature'), '4/4');
  state.settings = new Map([['advancedBeats', 'yes'], ['timeSignature', '13/16']]);
  assert.equal(getSetting('advancedBeats'), false);
  assert.equal(getSetting('timeSignature'), '4/4');
});

// Ben, 2026-10-11: AZERTY and Colemak left the DJ keyboard choices. One
// stored on the device or in a person's settings (from a backup or the
// cloud) reads as Auto, never as an error or a lost record.
test('a stored AZERTY or Colemak DJ keyboard reads as Auto', async () => {
  assert.deepEqual(SETTINGS.djLayout.values, ['auto', 'qwerty', 'dvorak']);
  for (const old of ['azerty', 'colemak']) {
    state.settings = new Map([['djLayout', old]]);
    assert.equal(getSetting('djLayout'), 'auto', old);
  }
  await assert.rejects(setSetting('djLayout', 'azerty'), /isn't a value/);
  state.settings = new Map();
});

// Ben, 2026-10-11: the pad size became a smooth slider, then its ends became
// the screen's own smallest and biggest pads (pad-size.js). Older copies kept
// a percent (50 to 220) or S M L: those read as the nearest place on the
// slider, Medium as 'auto', and anything else as 'auto'.
test('the pad size is auto or 0 to 1; an old percent or S M L reads as the nearest size', async () => {
  state.settings = new Map();
  assert.equal(getSetting('padSize'), 'auto', 'the screen\'s own size');
  assert.equal(SETTINGS.padSize.values[1], 0);
  assert.equal(SETTINGS.padSize.values.at(-1), 1);
  for (const [old, now] of [['s', 0], ['m', 'auto'], ['l', 0.59], [50, 0], [100, 'auto'], [220, 1], [0.5, 0.5], [0, 0], [1, 1]]) {
    state.settings = new Map([['padSize', old]]);
    assert.equal(getSetting('padSize'), now, String(old));
  }
  for (const bad of [49, 225, 101, 0.505, 2, -0.1, 'xl', 'constructor', null]) {
    state.settings = new Map([['padSize', bad]]);
    assert.equal(getSetting('padSize'), 'auto', String(bad));
  }
  await assert.rejects(setSetting('padSize', 'l'), /isn't a value/);
  await assert.rejects(setSetting('padSize', 130), /isn't a value/);
  state.settings = new Map();
});

// Ben, 2026-10-11 (Q17): the DJ keyboard is the device's own keyboard, so it
// stays with the device. A person's DJ keyboard from before (in prefs, a
// backup or the cloud) is ignored, and dropped the next time their settings
// are saved; the rest of their record stays.
test('the DJ keyboard stays with the device; a person\'s old one is ignored and dropped', async () => {
  state.personId = 'p';
  state.settings = new Map([['djLayout', 'qwerty']]);
  state.prefs = new Map([['p', { personId: 'p', values: { djLayout: 'dvorak', padSize: 0.5 } }]]);
  assert.equal(getSetting('djLayout'), 'qwerty', 'the device\'s choice, not the person\'s old one');
  assert.deepEqual(cleanPrefs({ personId: 'p', values: { djLayout: 'dvorak', padSize: 0.5 } }),
    { personId: 'p', values: { padSize: 0.5 } });
  await setSetting('djLayout', 'dvorak');
  assert.equal(state.settings.get('djLayout'), 'dvorak');
  await setSetting('padSize', 0);
  const { changed, ...saved } = state.prefs.get('p');
  assert.deepEqual(saved, { personId: 'p', values: { padSize: 0 } }, 'the old DJ keyboard is dropped on save');
  assert.ok(Number.isFinite(changed), 'and stamped with when it changed (merge3.js)');
  state.personId = null;
  state.prefs = new Map();
  state.settings = new Map();
});
