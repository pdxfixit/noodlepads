// Problem reports (log-clean.js): what may leave the device. The allowlist
// must cover every kind of entry the app logs, and a name typed anywhere must
// never come out the other side.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  RULES, VOICE_IDS, STEP_KINDS, SIGNATURE_IDS, SETTING_VALUES, TEXT_MAX, ENTRIES_MAX, BLANK, NAME,
  cleanEntry, cleanEntries, cleanPayload, redact, soundKind,
} from '../web/log-clean.js';
import { VOICES } from '../web/voices.js';
import { KINDS } from '../web/steps.js';
import { SETTINGS } from '../web/settings.js';
import { SIGNATURES } from '../web/sequencer.js';

const webDir = new URL('../web/', import.meta.url);

// Every logEvent('kind', {...}) call in web/, with the top-level field names
// of its object (shorthand and spread-in fields included).
function logCalls() {
  const calls = [];
  for (const f of readdirSync(webDir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, webDir), 'utf8');
    for (const m of src.matchAll(/logEvent\('([a-zA-Z]+)'\s*(,\s*\{)?/g)) {
      const keys = [];
      if (m[2]) {
        let depth = 0;
        let i = m.index + m[0].length - 1;
        const start = i;
        for (; i < src.length; i++) {
          if (src[i] === '{') depth++;
          if (src[i] === '}' && --depth === 0) break;
        }
        const body = src.slice(start, i + 1);
        for (const k of body.matchAll(/[{,]\s*([A-Za-z]+)\s*(?=[:,}])/g)) keys.push(k[1]);
      }
      calls.push({ file: f, kind: m[1], keys });
    }
  }
  return calls;
}

test('every kind of entry the app logs has a rule, and so does every field it logs', () => {
  const calls = logCalls();
  assert.ok(calls.length >= 20, 'found the logEvent calls');
  const missing = [];
  for (const { file, kind, keys } of calls) {
    if (!RULES[kind]) { missing.push(`${file}: kind ${kind}`); continue; }
    for (const k of keys) if (!RULES[kind][k]) missing.push(`${file}: ${kind}.${k}`);
  }
  assert.deepEqual(missing, [], 'add these to RULES in web/log-clean.js');
});

test("the report's fixed lists match the app's", () => {
  assert.deepEqual(VOICE_IDS, VOICES.map((v) => v.id));
  assert.deepEqual(STEP_KINDS, KINDS.map((k) => k.id));
  assert.deepEqual(SIGNATURE_IDS, Object.keys(SIGNATURES));
  // Every setting with a list of values; a free-form one (`seen`) is never logged (`quiet`).
  const listed = Object.entries(SETTINGS).filter(([, spec]) => spec.values);
  for (const [k, spec] of Object.entries(SETTINGS)) if (!spec.values) assert.equal(spec.quiet, true, k);
  assert.deepEqual(Object.keys(SETTING_VALUES), listed.map(([k]) => k));
  for (const [k, spec] of listed) assert.deepEqual(SETTING_VALUES[k], spec.values, k);
});

test('an unknown kind is dropped and counted; an unknown field is dropped', () => {
  assert.equal(cleanEntry({ t: 1, kind: 'secret', data: { name: 'Juno' } }), null);
  const { entries, dropped } = cleanEntries([
    { t: 1, kind: 'secret', data: {} },
    { t: 2, kind: 'storage', data: { opened: true, who: 'Juno' } },
  ]);
  assert.equal(dropped, 1);
  assert.deepEqual(entries, [{ t: 2, kind: 'storage', data: { opened: true } }]);
});

test('numbers and booleans pass; a string passes only from its fixed list', () => {
  const play = cleanEntry({ t: 5.4, kind: 'beat', data: { action: 'play', bpm: 120, advanced: true, mode: 'Juno mode', signature: '4/4', bars: '2' } });
  assert.deepEqual(play, { t: 5, kind: 'beat', data: { action: 'play', bpm: 120, advanced: true, mode: BLANK, signature: '4/4' } });
  const set = cleanEntry({ kind: 'setting', data: { key: 'timeSignature', value: '6/8', was: 'Toby' } });
  assert.deepEqual(set.data, { key: 'timeSignature', value: '6/8', was: BLANK });
  assert.equal(cleanEntry({ kind: 'render', data: { voice: 'chipmunk>echo' } }).data.voice, 'chipmunk>echo');
  assert.equal(cleanEntry({ kind: 'render', data: { voice: 'chipmunk>Juno' } }).data.voice, BLANK);
});

test('a beat row sends the kit id or the sound kind, never its label', () => {
  const kitIds = new Set(['kick', 'snare']);
  const e = cleanEntry({ kind: 'beat', data: { action: 'play', rows: [
    { sound: 'Big Kick', kind: 'kick', voice: null, pills: 8, rate: 1, ring: false, muted: false },
    { sound: 'Toby burp', kind: 'recorded', voice: 'chipmunk', pills: 4, rate: 2, ring: true, muted: false },
    { sound: 'Mystery', kind: 'toby', voice: 'Toby', pills: 1 },
    { sound: 'Old', pills: 1 },
  ] } }, { kitIds });
  assert.deepEqual(e.data.rows, [
    { sound: 'kick', voice: null, pills: 8, rate: 1, ring: false, muted: false },
    { sound: 'recorded', voice: 'chipmunk', pills: 4, rate: 2, ring: true, muted: false },
    { sound: 'kit', voice: BLANK, pills: 1 },
    { sound: 'kit', pills: 1 },
  ]);
});

test('soundKind: the kit id for a kit sound, else what kind of sound it is', () => {
  assert.equal(soundKind({ id: 'juno-kick', kit: true, kitId: 'kick', label: 'Juno kick' }), 'kick');
  assert.equal(soundKind({ id: 'juno-laser', source: 'bundled', label: 'Laser' }), 'bundled');
  assert.equal(soundKind({ id: 'user-1', source: 'user', synth: { kind: 'zap' } }), 'made');
  assert.equal(soundKind({ id: 'user-2', source: 'user', label: 'Burp' }), 'recorded');
  assert.equal(soundKind(undefined), null);
});

test('a person is sent as true and counts, never an id', () => {
  assert.deepEqual(cleanEntry({ kind: 'person', data: { deleted: 'toby', bundled: true, sounds: 12 } }).data,
    { deleted: true, bundled: true, sounds: 12 });
  assert.deepEqual(cleanEntry({ kind: 'person', data: { added: 'p-lq3x-ab12' } }).data, { added: true });
});

test('an error names only the site\'s own file, else "external"', () => {
  const known = { origin: 'https://noodlepads.com' };
  const at = (source) => cleanEntry({ kind: 'error', data: { message: 'x', source, line: 3 } }, known).data.source;
  assert.equal(at('https://noodlepads.com/sequencer.js'), 'sequencer.js');
  assert.equal(at('sequencer.js'), 'sequencer.js');
  assert.equal(at('chrome-extension://abc/Juno-diary.js'), 'external');
  assert.equal(at('https://evil.example/app.js'), 'external');
});

// The names a family types: people, sounds, beats, songs, takes.
const NAMES = ['Pip', 'juno', 'Toby Tuesday', 'Big Burp!', 'Dinosaur Dance', 'Song for Mom', 'Take Zebra', 'Ölaf'];

test('a name typed anywhere never appears in a report', () => {
  const known = { names: NAMES, kitIds: new Set(['kick']) };
  const raw = [
    { t: 1, kind: 'notice', data: { text: '“Big Burp!” didn\'t load, so it can\'t play.' } },
    { t: 2, kind: 'error', data: { message: 'Juno and pip broke Dinosaur Dance (song for mom), ölaf too', source: 'app.js', line: 1 } },
    { t: 3, kind: 'backup', data: { loaded: false, error: 'Take Zebra: "anything quoted" is gone' } },
    { t: 4, kind: 'person', data: { deleted: 'juno', bundled: true } },
    { t: 5, kind: 'beat', data: { action: 'play', rows: [{ sound: 'Toby Tuesday', kind: 'recorded' }] } },
    { t: 6, kind: 'setting', data: { key: 'Pip', value: 'Pip', was: 'Pip' } },
    { t: 7, kind: 'cloud', data: { sync: false, error: 'Toby Tuesday' } },
    { t: 8, kind: 'error', data: { storage: 'juno' } },
  ];
  const out = JSON.stringify(cleanPayload({ format: 1, device: 'K7Q4-M2XD', app: 'dev', entries: raw }, known));
  for (const n of NAMES) assert.ok(!out.toLowerCase().includes(n.toLowerCase()), `${n} leaked: ${out}`);
  assert.ok(out.includes(`“${NAME}” didn't load`), 'the notice keeps its shape');
});

test('redaction matches whole words only, any case, longest name first', () => {
  assert.equal(redact('Junowell met JUNO', ['Juno']), `Junowell met ${NAME}`);
  assert.equal(redact('Pip Pads! by Pip', ['Pip', 'Pip Pads!']), `${NAME} by ${NAME}`);
  assert.equal(redact('a b', ['a']), 'a b', 'one-letter names are left');
  assert.equal(redact('line\none', []), 'line one');
});

test('free text is cut to 200 characters, and a report to the newest 400 entries', () => {
  assert.equal(redact('x'.repeat(5000)).length, TEXT_MAX);
  const many = Array.from({ length: ENTRIES_MAX + 30 }, (_, i) => ({ t: i, kind: 'storage', data: { opened: true } }));
  const { entries, dropped } = cleanEntries(many);
  assert.equal(entries.length, ENTRIES_MAX);
  assert.equal(entries[0].t, 30);
  assert.equal(dropped, 30);
});

test('cleanPayload refuses what is not a report and checks every field', () => {
  assert.equal(cleanPayload(null), null);
  assert.equal(cleanPayload({ format: 2, device: 'K7Q4-M2XD' }), null);
  assert.equal(cleanPayload({ format: 1, device: 'Juno' }), null);
  const out = cleanPayload({
    format: 1, app: '<script>', device: 'K7Q4-M2XD', session: 'Juno', sent: 'yesterday',
    env: { browser: 'Chrome', os: 'Juno', type: 'Toby', screen: [800, 1280, 3], dpr: 1.5, tz: 'America/Los_Angeles', audio: { sampleRate: 48000, baseLatencyMs: 10.7, state: 'Juno' } },
    settings: { advancedBeats: true, timeSignature: 'Toby', name: 'Juno' },
    counts: { people: 3, sounds: 41, secret: 1 },
    dropped: 2, entries: [], extra: 'Juno',
  });
  assert.deepEqual(out, {
    format: 1, app: 'unknown', device: 'K7Q4-M2XD', session: null, sent: null,
    env: { browser: 'Chrome', os: null, type: null, screen: [800, 1280], dpr: 1.5, tz: 'America/Los_Angeles', audio: { sampleRate: 48000, baseLatencyMs: 10.7, state: null } },
    settings: { advancedBeats: true },
    counts: { people: 3, sounds: 41 },
    dropped: 2, entries: [],
  });
});

test('a report names the browser, OS and device type, never the User-Agent string', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36';
  // An app from before 2026-10-16 still sends the raw string: only its families are kept.
  const old = cleanPayload({ format: 1, device: 'K7Q4-M2XD', env: { ua }, entries: [] });
  assert.deepEqual([old.env.browser, old.env.os, old.env.type], ['Samsung', 'Android', 'tablet']);
  assert.equal(Object.hasOwn(old.env, 'ua'), false);
  assert.doesNotMatch(JSON.stringify(old), /Mozilla|SM-X200|AppleWebKit/);
  // The app sends the families itself; one off the list is dropped.
  const now = cleanPayload({ format: 1, device: 'K7Q4-M2XD', env: { browser: 'Firefox', os: 'Linux', type: 'desktop', ua }, entries: [] });
  assert.deepEqual([now.env.browser, now.env.os, now.env.type], ['Firefox', 'Linux', 'desktop']);
  assert.doesNotMatch(JSON.stringify(now), /Mozilla|SM-X200/);
  const none = cleanPayload({ format: 1, device: 'K7Q4-M2XD', env: {}, entries: [] });
  assert.deepEqual([none.env.browser, none.env.os, none.env.type], [null, null, null]);
});
