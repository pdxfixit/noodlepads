// docs/architecture/ is how agents learn the wiring without searching the
// code, so it must stay true. These tests check it against the code: every
// module is placed in it, every `file.js name` it cites still exists, and the
// claims it marks ✅ (one AudioContext, the schedulers, the recorders, one
// composition root…) still hold. A failure here means: change the doc in the
// same commit as the code, then the expected list below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'docs/architecture');
const docs = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => ({ name: `docs/architecture/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
const all = docs.map((d) => d.text).join('\n');

const listJs = (sub) => readdirSync(join(root, sub)).filter((f) => /\.m?js$/.test(f));
const WEB = listJs('web');
const WORKER = listJs('worker');
const read = (path) => readFileSync(join(root, path), 'utf8');
const src = Object.fromEntries(WEB.map((f) => [f, read(`web/${f}`)]));
const webWith = (pattern) => WEB.filter((f) => pattern.test(src[f])).sort();
const web = (f) => import(new URL(`../web/${f}`, import.meta.url));
const worker = (f) => import(new URL(`../worker/${f}`, import.meta.url));

// Where a file name in the docs may live: a path as written, else by its bare name.
const SEARCH = ['web', 'worker', 'tools', 'tests'];
// Named in the docs, made outside the repo: the deploy writes version.json, sw.js keeps a copy under the other.
const NOT_IN_REPO = new Set(['version.json', '__precached-version.json', '__precached-clips.json']);
function filesNamed(name) {
  if (name.includes('/')) return existsSync(join(root, name)) ? [name] : [];
  return SEARCH.map((d) => `${d}/${name}`).filter((p) => existsSync(join(root, p)));
}

const FIX = 'Update docs/architecture/ in the same commit as the code (AGENTS.md, Conventions).';

// ── The doc names what exists ──

test('every module in web/ and worker/ is placed in docs/architecture/', () => {
  // A whole name: `touch.js` is not found inside `dj-touch.js`, nor web's `cloud.js` in `worker/cloud.js`.
  const named = (f) => new RegExp(`(?<![\\w/-])${f.replace(/[.]/g, '\\.')}\\b`).test(all);
  const missing = [...WEB.filter((f) => !named(f)), ...WORKER.map((f) => `worker/${f}`).filter((f) => !all.includes(f))];
  assert.deepEqual(missing, [], `Not named in docs/architecture/: say what each does and how it is wired. ${FIX}`);
});

test('every file docs/architecture/ names still exists', () => {
  const gone = docs.flatMap(({ name, text }) => [...text.matchAll(/`((?:[\w-]+\/)*[\w.-]+\.(?:m?js|py|sh|sql|json|css|html))\b/g)]
    .map((m) => m[1])
    .filter((f) => filesNamed(f).length === 0 && !NOT_IN_REPO.has(f))
    .map((f) => `${name} → ${f}`));
  assert.deepEqual([...new Set(gone)], [], FIX);
});

// `file.js name` (a function, constant or method) must still be in that file.
test('every `file.js name` cited in docs/architecture/ is still in that file', () => {
  const stale = docs.flatMap(({ name, text }) => [...text.matchAll(/`((?:[\w-]+\/)*[\w.-]+\.m?js) ([A-Za-z_$][\w$.]*)/g)]
    .filter(([, file, ident]) => {
      const files = filesNamed(file);
      if (!files.length) return false;   // the test above reports it
      const last = ident.split('.').pop();
      return !files.some((f) => new RegExp(`\\b${last.replace(/\$/g, '\\$')}\\b`).test(read(f)));
    })
    .map(([, file, ident]) => `${name} → ${file} ${ident}`));
  assert.deepEqual([...new Set(stale)], [], FIX);
});

// ── ✅ Which files do a job: exactly these ──

const ONLY = [
  // sound.md
  ['one realtime AudioContext (listen-input.js only when handed none)', /new (?:window\.)?(?:webkit)?AudioContext\b|new Ctx\(/, ['audio.js', 'listen-input.js']],
  ['offline renders', /new OfflineAudioContext\b/, ['sequencer.js', 'share-render.js', 'song.js', 'voices.js']],
  ['the microphone: one recorder, used by the sound sheet and 🧸 Kids', /new MediaRecorder\b/, ['mic.js']],
  ['two microphone users: the recorder and the 🎧 listener', /getUserMedia/, ['listen-input.js', 'mic.js']],
  ['one Worker: the stretch', /new Worker\(/, ['voices.js']],
  ['one AudioWorklet: 🎧 From a song', /\.addModule\(/, ['listen-input.js']],
  // beats-song.md
  ['the mix bus is built only by the beat engine', /import \{[^}]*\bbuildMix\b[^}]*\} from '\.\/mixer\.js'/, ['beat-engine.js']],
  ['what is due is worked out by the engine alone', /import \{[^}]*\bhitsDue\b[^}]*\} from '\.\/beat\.js'/, ['beat-engine.js']],
  ['the shared "play a saved beat" path', /soundHit\(/, ['beat-engine.js', 'playlist.js', 'share-render.js']],
  ['prepareBeats callers', /\.prepareBeats\(/, ['share-render.js', 'song.js']],
  ['the WAV encoder', /function encodeWav\b/, ['wav.js']],
  // keys-kids.md
  ['🔔 Let it ring: one rule, three players', /\bringOver\b/, ['audio.js', 'beat-engine.js', 'rhythm.js']],
  ['the beat maker\'s dialogs are made by the beat maker', /(?<!function )\b(createChooser|createGrooves|createLibrary)\(/, ['sequencer.js']],
  ['one beat engine, made by the composition root', /(?<!function )\bcreateBeatEngine\(/, ['app.js']],
  ['Live takes are made by the keys panel', /\bcreateTakes\(/, ['dj-takes.js', 'dj.js']],
  ['the ✏️ Layout editors are built by the keys panel', /createKeysEditor|createTouchEditor/, ['dj-keys.js', 'dj-touch.js', 'dj.js']],
  ['the grown-up sum', /askSum\(/, ['cloud-ui.js', 'feedback.js', 'grown-up.js', 'kids.js']],
  ['lift to play', /fingerTaps\(/, ['dj.js', 'finger.js', 'kids.js', 'pads.js']],
  // data.md
  ['IndexedDB is opened by the store and Older sounds only', /indexedDB\.open\(/, ['old-backup.js', 'store.js']],
  ['own sounds added to memory', /userClips\.push\(/, ['board.js', 'bulk.js']],
  // cloud.md
  ['the /api/ callers', /['"`]\/api/, ['cloud-api.js', 'events-client.js', 'feedback.js', 'log-send.js']],
  ['the events client is used by telemetry only', /events-client\.js'/, ['telemetry.js']],
  ['the one sendBeacon', /sendBeacon/, ['events-client.js']],
  ['the service worker is registered in one place', /serviceWorker/, ['offline.js']],
  // shell.md
  ['every dialog opens through openDialog', /\.showModal\(/, ['dialogs.js']],
  ['one composition root', /(?<!function )\b(createSequencer|createSong|createDJ|initKids|initCloud|initCloudUI|initWelcome|initWhoNow|initTips|initNudge|initHelp|initSettingsUI|initPads|initSheet|initPeople|initBackups|initListen|initUpdate|initMiniDeck)\(/, ['app.js']],
  ['one test hook for first steps', /noodleFirstSteps/, ['firsts.js']],
  ['the skin goes on the page in one place', /\bshowSkin\(/, ['app.js', 'skins.js']],
  ['the banner and the announcer belong to ui.js', /['"`]#(banner|announce)\b/, ['ui.js']],
  ['page-watching observers', /new MutationObserver/, ['app.js', 'lines.js', 'mini-deck.js', 'tooltips.js']],
  ['the full emoji list loads from one place', /(import\(|from )['"]\.\/emoji-all\.js/, ['emoji-more.js']],
];

for (const [what, pattern, files] of ONLY) {
  test(`✅ ${what}: ${files.join(', ')}`, () => assert.deepEqual(webWith(pattern), files, FIX));
}

test('✅ hits are booked by one scheduler on the audio clock: the beat engine\'s play (🥁 Beats, 🧸 Kids, 🎼 Song, 💃 Grooves\' sample); the beat maker keeps only the click\'s own timer', () => {
  // sheet.js reads the clock too, but its interval is a 150 ms play watch, not a scheduler.
  assert.deepEqual(webWith(/setInterval\(/).filter((f) => f !== 'sheet.js' && /\.currentTime\b/.test(src[f])), ['beat-engine.js', 'sequencer.js'], FIX);
  // sequencer.js: its one interval is the click while the beat is stopped; the beat is the engine's run.
  assert.equal(src['sequencer.js'].match(/setInterval\(/g).length, 1, FIX);
  assert.match(src['sequencer.js'], /aloneTimer = setInterval\(/, FIX);
  assert.match(src['sequencer.js'], /engine\.play\(/, FIX);
  assert.doesNotMatch(src['sequencer.js'], /\bmakeVoice\b|\btooLate\b|\bhitsDue\b/, FIX);
  // 🎼 Song's ▶ is a run of the engine on a planned list; it has no timer or voice code of its own.
  assert.match(src['song.js'], /engine\.play\(/, FIX);
  assert.doesNotMatch(src['song.js'], /\bmakeVoice\b|\btooLate\b|\bfadeStop\b|setInterval\(|\bsoundHit\b/, FIX);
  // Its row edits while the beat plays go through the run, which keeps the per-row lists in step.
  assert.doesNotMatch(src['sequencer.js'], /\brun\.(voices|clocks|shown)\.splice|\brun\.queue = /, FIX);
  for (const m of ['moveRow', 'removeRow', 'insertRow', 'retime', 'restart']) assert.match(src['sequencer.js'], new RegExp(`run\\.${m}\\(`), `${m}: ${FIX}`);
});

test('✅ one tick and lookahead: beat-engine.js declares them, the beat maker\'s click imports them, 🎼 Song has none of its own', () => {
  assert.match(src['beat-engine.js'], /^export const TICK_MS = 25;$/m, FIX);
  assert.match(src['beat-engine.js'], /^export const LOOKAHEAD = 0\.1;$/m, FIX);
  assert.match(src['sequencer.js'], /^import \{ TICK_MS, lookahead \} from '\.\/beat-engine\.js';$/m, FIX);
  assert.match(src['beat-engine.js'], /^export const lookahead = /m, FIX);
  for (const f of ['sequencer.js', 'song.js']) assert.doesNotMatch(src[f], /^(export )?const (TICK_MS|LOOKAHEAD|HIDDEN_LOOKAHEAD)\b/m, `${f}: ${FIX}`);
});

test('✅ the backup gate and the share preview load neither screen: song rules are in playlist.js (the S7 split)', () => {
  for (const f of ['backup.js', 'share-render.js']) assert.doesNotMatch(src[f], /from '\.\/(song|sequencer)\.js'/, `${f}: ${FIX}`);
  assert.deepEqual(webWith(/from '\.\/song\.js'/), ['app.js'], FIX);
});

test('✅ the keys never touch audio.js directly; they play through pads.js tapPad', () => {
  assert.deepEqual(['dj.js', 'dj-keys.js', 'dj-touch.js', 'dj-takes.js'].filter((f) => src[f].includes("from './audio.js'")), [], FIX);
});

test('✅ 🧸 Kids takes only pure rules from the beat rules, plays through the engine it is handed, and none of the regular screens', () => {
  const from = (m) => [...src['kids.js'].matchAll(new RegExp(`^import .* from '\\./${m}\\.js';$`, 'gm'))].map((x) => x[0]);
  assert.deepEqual(from('beat'), ["import { STEPS, MAX_SWING, outputDelay, stepsHeard } from './beat.js';"], FIX);
  assert.match(src['kids.js'], /deps\.engine\.play\(/, FIX);
  assert.doesNotMatch(src['kids.js'], /\bmakeVoice\b|setInterval\(/, FIX);
  assert.deepEqual(from('sequencer'), [], FIX);
  for (const m of ['dj', 'pads', 'sheet', 'song']) assert.deepEqual(from(m), [], FIX);
  assert.doesNotMatch(src['kids.js'], /createSequencer|soundHit|busFor|beatPlan/, FIX);
});

test('✅ beat.js and wav.js have no screen, DOM, storage or audio (the S5 split)', () => {
  const impure = /\b(document|window|localStorage|sessionStorage|indexedDB|AudioContext|OfflineAudioContext|navigator)\b|from '\.\/(audio|store|state|ui|dialogs|log|sequencer|song|kids|app)\.js'/;
  for (const f of ['beat.js', 'wav.js']) assert.doesNotMatch(src[f].replace(/\/\/.*$/gm, ''), impure, `${f}: ${FIX}`);
});

test('✅ only app.js imports the beat maker screen; its rules are in beat.js', () => {
  assert.deepEqual(webWith(/from '\.\/sequencer\.js'/), ['app.js'], FIX);
});

test('✅ the pure modules import nothing', () => {
  const pure = ['instruments.js', 'steps.js', 'cuts.js', 'loudness.js', 'stretch.js', 'synth.js', 'mix.js', 'pitch.js', 'listen-dsp.js', 'listen-worklet.js'];
  assert.deepEqual(pure.filter((f) => /^import /m.test(src[f])), [], FIX);
});

test('✅ the keys and Kids rules have no DOM, storage or audio', () => {
  const pure = ['rhythm.js', 'keyset.js', 'touch.js', 'touch-grid.js', 'kids-logic.js'];
  assert.deepEqual(pure.filter((f) => /\bdocument\.|\bwindow\.|localStorage|indexedDB|globalThis\.|AudioContext/.test(src[f])), [], FIX);
});

test('✅ only web/codes.js runs PBKDF2 (the PIN hash of the device and the Worker); only cloud-api.js sends X-Noodle-App and worker/metrics.js reads it', () => {
  const both = [...WEB.map((f) => `web/${f}`), ...WORKER.map((f) => `worker/${f}`)];
  assert.deepEqual(both.filter((f) => read(f).includes("'PBKDF2'")), ['web/codes.js'], FIX);
  assert.deepEqual(both.filter((f) => /ABCDEFGHJKLMNPQRSTUVWXYZ23456789/.test(read(f))), ['web/codes.js'], 'the share code alphabet is written once');
  assert.deepEqual(both.filter((f) => read(f).includes("'X-Noodle-App'")), ['web/cloud-api.js', 'worker/metrics.js'], FIX);
});

test('✅ what the Worker imports from web/', () => {
  const names = new Set(WORKER.flatMap((f) => [...read(`worker/${f}`).matchAll(/from '\.\.\/web\/([\w-]+)\.js'/g)].map((m) => m[1])));
  assert.deepEqual([...names].sort(), ['agent', 'codes', 'device-meta', 'emoji-check', 'log-clean', 'model', 'names', 'reid'], FIX);
});

test('✅ three Node tools: look.mjs and the two it loads', () => {
  assert.deepEqual(listJs('tools').sort(), ['chrome.mjs', 'look-cloud.mjs', 'look.mjs'], FIX);
});

// data.md, "The in-memory state": a field nobody reads is dead state, which
// misleads (state.beats and state.selected were written and never read).
test('✅ every field of state.js state is read somewhere in web/', async () => {
  const { state, STORE_TABLE } = await web('state.js');
  // A field of STORE_TABLE is read by `readStorage`, `storedLists` and `deletePerson` as `state[field]`: always read.
  const stored = new Set(STORE_TABLE.map((t) => t.field));
  // Only where `state` is this one (backup.js has a parameter of that name).
  // A heuristic, not a parser: comments are dropped first (a comment that
  // names `state.beats` reads nothing), then a read is `state.x` not
  // followed by `=`. A string holding `state.x` would still count.
  const code = (file) => src[file].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const users = WEB.filter((file) => /import\s*\{[^}]*\bstate\b[^}]*\}\s*from\s*'\.\/state\.js'/.test(src[file]) || file === 'state.js');
  const reads = (f) => users.some((file) => new RegExp(`\\bstate\\??\\.${f}\\b(?!\\s*=[^=])`).test(code(file)));
  assert.deepEqual(Object.keys(state).filter((f) => !stored.has(f) && !reads(f)), [], FIX);
});

// ── ✅ Lists kept in step by hand ──

test('✅ the stores: a person\'s, the backup\'s and the cloud\'s lists follow store.js', async () => {
  const { STORE_NAMES } = await web('store.js');
  const { PERSON_STORES } = await web('reid.js');
  const { cleanBackup } = await web('backup.js');
  assert.deepEqual([...PERSON_STORES].sort(), STORE_NAMES.filter((s) => !['cloud', 'bases', 'settings'].includes(s)).sort(), FIX);
  const out = cleanBackup({}, () => null, { peopleIds: new Set(), clipIds: new Set() });
  assert.deepEqual(Object.keys(out).filter((k) => Array.isArray(out[k])).sort(), STORE_NAMES.filter((s) => s !== 'cloud' && s !== 'bases').sort(), FIX);
});

test('✅ the record kinds that sync are one list, reid.js SYNCED, which the others are made from', async () => {
  const { SYNCED, PERSON_STORES } = await web('reid.js');
  const { CLOUD_KINDS } = await web('cloud-sync.js');
  const { STAMPED } = await web('merge3.js');
  const { KINDS } = await worker('cloud.js');
  assert.deepEqual(SYNCED, PERSON_STORES.filter((s) => s !== 'people'), FIX);
  assert.deepEqual([...STAMPED], SYNCED, FIX);
  assert.deepEqual(CLOUD_KINDS, SYNCED, FIX);
  assert.deepEqual(KINDS, SYNCED, FIX);
  // No other file writes the list out again.
  const copies = [...WEB.map((f) => `web/${f}`), ...WORKER.map((f) => `worker/${f}`)].filter((f) => /'clips', 'overrides', 'orders'/.test(read(f)));
  // (leftover.js reads an old database: its list is frozen on purpose.)
  assert.deepEqual(copies.sort(), ['web/leftover.js', 'web/reid.js'], FIX);
});

test('✅ merge.js STORES follow store.js, without the device\'s own links and bases', async () => {
  const { STORE_NAMES } = await web('store.js');
  const out = (await web('merge.js')).mergeLoaded;
  const { put } = await out({}, {});
  assert.deepEqual(Object.keys(put).sort(), STORE_NAMES.filter((s) => s !== 'cloud' && s !== 'bases').sort(), FIX);
});

test('✅ limits written on both sides of the cloud agree', async () => {
  const sync = await web('cloud-sync.js');
  const cloud = await worker('cloud.js');
  const feedback = await web('feedback.js');
  const events = await worker('events-worker.js');
  assert.equal(sync.CHUNK_BYTES, cloud.CHUNK_BYTES, FIX);
  assert.equal(sync.PER_PUSH, cloud.LIMITS.perPush, FIX);
  assert.equal(sync.RECORD_BYTES, cloud.LIMITS.recordBytes, FIX);
  assert.equal(sync.PUSH_BYTES, cloud.LIMITS.pushBytes, FIX);
  assert.equal(feedback.MAX_BYTES, events.MAX_FEEDBACK, FIX);
});

test('✅ 🎧 From a song: its one ROWS and its FRAME agree', async () => {
  assert.ok((await web('listen-make.js')).ROWS === (await web('listen-dsp.js')).ROWS, FIX);
  assert.equal((await web('listen-input.js')).FRAME, (await web('listen-worklet.js')).FRAME, FIX);
});

test('✅ every voice but Normal is a knob preset', async () => {
  const { VOICES } = await web('voices.js');
  const { PRESETS } = await web('voice-knobs.js');
  assert.equal(PRESETS.length, VOICES.length - 1, FIX);
});

test('✅ the sound sheet\'s parts import nothing from sheet.js (they reach it through sheet-state.js hooks), so there is no cycle', () => {
  for (const f of ['sheet-state.js', 'sheet-voices.js', 'sheet-make.js']) {
    assert.deepEqual(src[f].match(/from '\.\/sheet\.js'/g) ?? [], [], `${f}: ${FIX}`);
  }
});

test('✅ the semitone rate agrees between instruments and the beat maker', async () => {
  const { rateOf } = await web('instruments.js');
  const { noteRate } = await web('beat.js');
  for (const n of [-12, -5, 0, 3, 7, 12]) assert.equal(rateOf(n), noteRate(n), FIX);
});

test('✅ a semitone is turned into a rate in instruments.js only, and latency is summed in beat.js only', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../web/', import.meta.url);
  const semitone = /\*\* *\(.*\/ *12\)/;
  const latency = /outputLatency[^\n]*baseLatency|baseLatency[^\n]*outputLatency/;
  const rate = [], sum = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    for (const line of readFileSync(new URL(f, dir), 'utf8').split('\n')) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      if (semitone.test(line)) rate.push(f);
      if (latency.test(line)) sum.push(f);
    }
  }
  // pitch.js turns a note into Hz: a different sum. log-send.js only reports the base latency.
  assert.deepEqual([...new Set(rate)].sort(), ['instruments.js', 'pitch.js'], FIX);
  assert.deepEqual([...new Set(sum)].sort(), ['beat.js'], FIX);
});

test('✅ the live step kinds are exactly the kinds with a build()', async () => {
  const { KINDS } = await web('steps.js');
  assert.deepEqual(KINDS.filter((k) => k.live({})).map((k) => k.id), KINDS.filter((k) => typeof k.build === 'function').map((k) => k.id), FIX);
});

test('✅ every setting has a scope and exactly one of values or clean', async () => {
  const { SETTINGS } = await web('settings.js');
  const bad = Object.entries(SETTINGS).filter(([, s]) => !['person', 'device'].includes(s.scope) || Array.isArray(s.values) === (typeof s.clean === 'function'));
  assert.deepEqual(bad.map(([k]) => k), [], FIX);
});

