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
const NOT_IN_REPO = new Set(['version.json', '__precached-version.json']);
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
  ['the microphone: two recorders', /new MediaRecorder\b/, ['kids.js', 'sheet.js']],
  ['three microphone users', /getUserMedia/, ['kids.js', 'listen-input.js', 'sheet.js']],
  ['one Worker: the stretch', /new Worker\(/, ['voices.js']],
  ['one AudioWorklet: 🎧 From a song', /\.addModule\(/, ['listen-input.js']],
  // beats-song.md
  ['the mix bus is built only by the beat maker', /import \{[^}]*\bbuildMix\b[^}]*\} from '\.\/mixer\.js'/, ['sequencer.js']],
  ['the shared "play a saved beat" path', /soundHit\(/, ['sequencer.js', 'share-render.js', 'song.js']],
  ['prepareBeats callers', /\.prepareBeats\(/, ['share-render.js', 'song.js']],
  ['the WAV encoder', /function encodeWav\b/, ['sequencer.js']],
  // keys-kids.md
  ['🔔 Let it ring: one rule, three players', /\bringOver\b/, ['audio.js', 'rhythm.js', 'sequencer.js']],
  ['the ✏️ Layout editors are built by the keys panel', /createKeysEditor|createTouchEditor/, ['dj-keys.js', 'dj-touch.js', 'dj.js']],
  ['the grown-up sum', /askSum\(/, ['feedback.js', 'grown-up.js', 'kids.js']],
  ['lift to play', /fingerTaps\(/, ['dj.js', 'finger.js', 'kids.js', 'pads.js']],
  // data.md
  ['IndexedDB is opened by the store and Older sounds only', /indexedDB\.open\(/, ['old-backup.js', 'store.js']],
  ['own sounds added to memory', /userClips\.push\(/, ['app.js', 'bulk.js', 'chop.js', 'sheet.js']],
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

test('✅ schedulers on the audio clock: the beat maker, 🎼 Song and 🧸 Kids', () => {
  assert.deepEqual(webWith(/setInterval\(/).filter((f) => /\.currentTime\b/.test(src[f])), ['kids.js', 'sequencer.js', 'song.js'], FIX);
});

test('✅ the beat maker and 🎼 Song share one tick and lookahead', () => {
  for (const f of ['sequencer.js', 'song.js']) {
    assert.match(src[f], /^const TICK_MS = 25;$/m, `${f}: ${FIX}`);
    assert.match(src[f], /^const LOOKAHEAD = 0\.1;$/m, `${f}: ${FIX}`);
  }
});

test('✅ the keys never touch audio.js directly; they play through pads.js tapPad', () => {
  assert.deepEqual(['dj.js', 'dj-keys.js', 'dj-touch.js'].filter((f) => src[f].includes("from './audio.js'")), [], FIX);
});

test('✅ 🧸 Kids takes only STEPS and noteRate from the beat maker, and none of the regular screens', () => {
  const from = (m) => [...src['kids.js'].matchAll(new RegExp(`^import .* from '\\./${m}\\.js';$`, 'gm'))].map((x) => x[0]);
  assert.deepEqual(from('sequencer'), ["import { STEPS, noteRate } from './sequencer.js';"], FIX);
  for (const m of ['dj', 'pads', 'sheet', 'song']) assert.deepEqual(from(m), [], FIX);
  assert.doesNotMatch(src['kids.js'], /createSequencer|soundHit|busFor|beatPlan/, FIX);
});

test('✅ the pure modules import nothing', () => {
  const pure = ['instruments.js', 'steps.js', 'cuts.js', 'loudness.js', 'stretch.js', 'synth.js', 'mix.js', 'pitch.js', 'listen-dsp.js', 'listen-worklet.js'];
  assert.deepEqual(pure.filter((f) => /^import /m.test(src[f])), [], FIX);
});

test('✅ the keys and Kids rules have no DOM, storage or audio', () => {
  const pure = ['rhythm.js', 'keyset.js', 'touch.js', 'touch-grid.js', 'kids-logic.js'];
  assert.deepEqual(pure.filter((f) => /\bdocument\.|\bwindow\.|localStorage|indexedDB|globalThis\.|AudioContext/.test(src[f])), [], FIX);
});

test('✅ only web/cloud.js and worker/pin.js run PBKDF2; only cloud-api.js sends X-Noodle-App and worker/metrics.js reads it', () => {
  const both = [...WEB.map((f) => `web/${f}`), ...WORKER.map((f) => `worker/${f}`)];
  assert.deepEqual(both.filter((f) => read(f).includes("'PBKDF2'")), ['web/cloud.js', 'worker/pin.js'], FIX);
  assert.deepEqual(both.filter((f) => read(f).includes("'X-Noodle-App'")), ['web/cloud-api.js', 'worker/metrics.js'], FIX);
});

test('✅ what the Worker imports from web/', () => {
  const names = new Set(WORKER.flatMap((f) => [...read(`worker/${f}`).matchAll(/from '\.\.\/web\/([\w-]+)\.js'/g)].map((m) => m[1])));
  assert.deepEqual([...names].sort(), ['agent', 'device-meta', 'emoji-check', 'instruments', 'log-clean', 'model', 'names', 'reid'], FIX);
});

test('✅ three Node tools: look.mjs and the two it loads', () => {
  assert.deepEqual(listJs('tools').sort(), ['chrome.mjs', 'look-cloud.mjs', 'look.mjs'], FIX);
});

// data.md, "The in-memory state": a field nobody reads is dead state, which
// misleads (state.beats and state.selected were written and never read).
test('✅ every field of state.js state is read somewhere in web/', async () => {
  const { state } = await web('state.js');
  // Only where `state` is this one (backup.js has a parameter of that name).
  const users = WEB.filter((file) => /import\s*\{[^}]*\bstate\b[^}]*\}\s*from\s*'\.\/state\.js'/.test(src[file]) || file === 'state.js');
  const reads = (f) => users.some((file) => new RegExp(`\\bstate\\??\\.${f}\\b(?!\\s*=[^=])`).test(src[file]));
  assert.deepEqual(Object.keys(state).filter((f) => !reads(f)), [], FIX);
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

test('✅ the record kinds that sync are one list, kept three times in one order', async () => {
  const { CLOUD_KINDS } = await web('cloud-sync.js');
  const { STAMPED } = await web('merge3.js');
  const { KINDS } = await worker('cloud.js');
  assert.deepEqual([...STAMPED], CLOUD_KINDS, FIX);
  assert.deepEqual(KINDS, CLOUD_KINDS, FIX);
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

test('✅ 🎧 From a song: its two ROWS and its FRAME agree', async () => {
  assert.deepEqual((await web('listen-make.js')).ROWS, (await web('listen-dsp.js')).ROWS, FIX);
  assert.equal((await web('listen-input.js')).FRAME, (await web('listen-worklet.js')).FRAME, FIX);
});

test('✅ every voice but Normal is a knob preset', async () => {
  const { VOICES } = await web('voices.js');
  const { PRESETS } = await web('voice-knobs.js');
  assert.equal(PRESETS.length, VOICES.length - 1, FIX);
});

test('✅ the semitone rate agrees between instruments and the beat maker', async () => {
  const { rateOf } = await web('instruments.js');
  const { noteRate } = await web('sequencer.js');
  for (const n of [-12, -5, 0, 3, 7, 12]) assert.equal(rateOf(n), noteRate(n), FIX);
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

