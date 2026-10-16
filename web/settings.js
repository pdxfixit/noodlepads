// Settings: the app's choices, each declared here with its default and the
// values it may take, so a stored value from an older or newer copy of the
// app that this copy doesn't understand reads as the default instead of
// breaking.
//
// Most settings are the person's (`scope: 'person'`): each person on a device
// has their own, kept in IndexedDB `prefs` ({personId, values}), and they
// travel with the person to the cloud and in backups (Ben, 2026-10-11:
// "settings travel with the profile"). A person who never chose one reads
// this device's older choice (IndexedDB `settings`, {key, value}, from before
// settings were per person), else the default. The rest belong to the device
// (`scope: 'device'`) and stay in `settings`. Backups carry every setting
// declared here, a device's included.

import { state, persist } from './state.js';
import { recall } from './util.js';
import { logEvent } from './log.js';
import { LAYOUT_NAMES } from './rhythm.js';
import { PAD_STOPS, fromOldSize } from './pad-size.js';

// A person's level (ADR 0019): 🧸 Kids, Regular or Advanced.
export const LEVELS = ['kids', 'regular', 'advanced'];

// The level a person's stored settings say, or undefined when they say none.
// The level is kept as `level` with `advancedBeats` beside it (true only for
// Advanced), so an older copy of the app, which knows only `advancedBeats`,
// still shows Advanced as Advanced and Kids as Regular. An older copy that
// changes the switch drops `level` (it keeps only the keys it knows), so when
// the two disagree the switch was the last thing changed and wins.
export function levelOf(values) {
  if (!values || typeof values !== 'object') return undefined;
  const level = LEVELS.includes(values.level) ? values.level : undefined;
  if (values.advancedBeats === true) return 'advanced';
  if (values.advancedBeats === false) return level === 'advanced' || !level ? 'regular' : level;
  return level;
}

export const SETTINGS = {
  // The person's level (ADR 0019, Ben 2026-10-12): 🧸 Kids, Regular or
  // Advanced, chosen in Settings. Read through levelOf, so a person stored
  // by an older copy (only `advancedBeats`) reads as Advanced or Regular.
  level: { default: 'regular', values: LEVELS, scope: 'person', read: levelOf },
  // "Advanced" as it was first stored: true exactly when the level is
  // Advanced. Code that asks about Advanced still reads it, and setting it
  // sets the level. Off keeps the beat maker simple: 4/4, no per-row
  // controls. On shows Overlap, each row's speed (½×, 1×, 2×), Swing and the
  // time signature.
  advancedBeats: { default: false, values: [false, true], scope: 'person', read: (v) => { const l = levelOf(v); return l === undefined ? undefined : l === 'advanced'; } },
  // Beats per bar over the note that gets the beat. A pill is always a
  // sixteenth and BPM always counts quarter notes. Only used with advancedBeats.
  timeSignature: { default: '4/4', values: ['4/4', '3/4', '5/4', '6/8', '7/8'], scope: 'person' },
  // How big the sound pads are on the Pads screen (pads.js, pad-size.js):
  // where the slider sits between this screen's smallest and biggest pads,
  // 0 to 1, or 'auto' for the screen's own size. Older copies kept a percent
  // (50 to 220) or S M L; `upgrade` reads those as the nearest size, from
  // storage and from backups alike.
  padSize: { default: 'auto', values: PAD_STOPS, upgrade: fromOldSize, scope: 'person' },
  // The keyboard the DJ keys' letters follow (dj.js, rhythm.js). The device's
  // own keyboard, so it stays with the device (Ben, Q17); a person's from
  // when it travelled is ignored, and dropped when their settings are next
  // saved. Kept in localStorage `dj-layout` before it was a setting; that is
  // read once as the device's choice. AZERTY and Colemak were choices until
  // 2026-10-11; one stored or backed up reads as Auto.
  djLayout: { default: 'auto', values: Object.keys(LAYOUT_NAMES), upgrade: { azerty: 'auto', colemak: 'auto' }, scope: 'device', legacy: () => recall('dj-layout') },
  // 📮 Send problem reports (log-send.js). The device's, and backups carry it
  // like every setting (Ben, Q5: "Carry it"): restoring one on a new tablet
  // brings the family's choice along. The device code (log-send.js,
  // localStorage `log-device`) is never in a backup.
  sendLogs: { default: false, values: [false, true], scope: 'device' },
  // Usage events and counts (telemetry.js; Ben,
  // 2026-10-16: on by default, a switch turns it off, and off sends nothing,
  // ever). The device's, as the device is what sends. ⚙️ Settings → 📊 Play
  // data → 📊 Share play data (Ben, 2026-10-16: "use B and 'Share play
  // data' everywhere").
  sendUsage: { default: true, values: [false, true], scope: 'device' },
};

// A stored value as this copy reads it: allowed as it is, or upgraded from an
// older copy's value, else undefined.
export function allowedValue(key, value) {
  const spec = SETTINGS[key];
  if (!spec) return undefined;
  if (spec.values.includes(value)) return value;
  if (typeof spec.upgrade === 'function') {
    const now = spec.upgrade(value);
    return spec.values.includes(now) ? now : undefined;
  }
  return spec.upgrade && typeof value === 'string' && Object.hasOwn(spec.upgrade, value) ? spec.upgrade[value] : undefined;
}

export const isPersonal = (key) => SETTINGS[key]?.scope === 'person';
export const PERSONAL_KEYS = Object.keys(SETTINGS).filter(isPersonal);

// Whether backups save and load this setting: every one declared here.
// Anything else in `settings` (renamedPeople) is this device's alone.
export const inBackups = (key) => Object.hasOwn(SETTINGS, key);

// A person's settings as stored: only keys and values this copy knows.
export function cleanPrefs(raw) {
  const values = {};
  for (const key of PERSONAL_KEYS) {
    const value = raw?.values && Object.hasOwn(raw.values, key) ? allowedValue(key, raw.values[key]) : undefined;
    if (value !== undefined) values[key] = value;
  }
  return { personId: raw?.personId, values };
}

const listeners = new Map();  // key -> Set of functions called with the new value
const told = new Map();       // key -> the value listeners last heard

export function getSetting(key) {
  const spec = SETTINGS[key];
  if (!spec) throw new Error(`unknown setting "${key}"`);
  if (spec.scope === 'person') {
    const mine = state.prefs?.get(state.personId)?.values;
    const value = spec.read ? spec.read(mine) : mine && Object.hasOwn(mine, key) ? allowedValue(key, mine[key]) : undefined;
    if (value !== undefined) return value;
  }
  const here = spec.read ? spec.read(Object.fromEntries(state.settings ?? [])) : allowedValue(key, state.settings.get(key));
  return here ?? allowedValue(key, spec.legacy?.()) ?? spec.default;
}

// What setting `key` to `value` stores: the level and the Advanced switch
// always together (see levelOf); anything else alone.
export function storedPair(key, value, levelNow) {
  if (key === 'level') return { level: value, advancedBeats: value === 'advanced' };
  if (key === 'advancedBeats') {
    const level = value ? 'advanced' : levelNow === 'advanced' ? 'regular' : levelNow;
    return { level, advancedBeats: value };
  }
  return { [key]: value };
}

function tell(key, value) {
  told.set(key, value);
  for (const fn of listeners.get(key) || []) fn(value);
}

export async function setSetting(key, value) {
  const spec = SETTINGS[key];
  if (!spec) throw new Error(`unknown setting "${key}"`);
  if (!spec.values.includes(value)) throw new Error(`"${value}" isn't a value for ${key}`);
  logEvent('setting', { key, value, was: getSetting(key) });
  const pair = storedPair(key, value, getSetting('level'));
  if (spec.scope === 'person' && state.personId && state.prefs) {
    const was = state.prefs.get(state.personId);
    // Cleaned, so a setting that no longer travels leaves the record.
    const record = cleanPrefs({ personId: state.personId, values: { ...was?.values, ...pair } });
    state.prefs.set(state.personId, record);
    tell(key, value);
    followPerson();   // the level and Advanced change together
    await persist('prefs', record);
    return;
  }
  for (const [k, v] of Object.entries(pair)) state.settings.set(k, v);
  tell(key, value);
  followPerson();
  for (const [k, v] of Object.entries(pair)) await persist('settings', { key: k, value: v });
}

// Calls `fn(value)` whenever the setting changes; returns a function that stops it.
export function onSetting(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  if (!told.has(key)) told.set(key, getSetting(key));
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

// Tells every listener the current value of its setting, for when the whole
// store was replaced at once (a backup was loaded).
export function notifyAllSettings() {
  for (const [key, fns] of listeners) {
    const value = getSetting(key);
    told.set(key, value);
    for (const fn of fns) fn(value);
  }
}

// After the person showing changes, or their settings arrive from the cloud:
// tells listeners only of the settings whose value is now different.
export function followPerson() {
  for (const key of listeners.keys()) {
    const value = getSetting(key);
    if (told.get(key) !== value) tell(key, value);
  }
}
