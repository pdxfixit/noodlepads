// docs/architecture/ is how agents learn the wiring without searching the
// code, so it must stay true. These tests check it against the code: every
// module is placed in it, every `file.js name` it cites still exists, and the
// claims it marks ✅ (one AudioContext, the schedulers, the recorders…) still
// hold. A failure here means: change the doc in the same commit as the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'docs/architecture');
const docs = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => ({ name: `docs/architecture/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
const all = docs.map((d) => d.text).join('\n');

const listJs = (sub) => readdirSync(join(root, sub)).filter((f) => /\.(m?js)$/.test(f));
const WEB = listJs('web');
const WORKER = listJs('worker');
const read = (path) => readFileSync(join(root, path), 'utf8');
const webWith = (pattern) => WEB.filter((f) => pattern.test(read(`web/${f}`))).sort();

// Where a file name in the docs may live: a path as written, else by its bare name.
const SEARCH = ['web', 'worker', 'tools', 'tests'];
function filesNamed(name) {
  if (name.includes('/')) return existsSync(join(root, name)) ? [name] : [];
  return SEARCH.map((d) => `${d}/${name}`).filter((p) => existsSync(join(root, p)));
}

const FIX = 'Update docs/architecture/ in the same commit as the code (AGENTS.md, Conventions).';

test('every module in web/ and worker/ is placed in docs/architecture/', { todo: 'the area files are being written' }, () => {
  // A whole name: `touch.js` is not found inside `dj-touch.js`, nor web's `cloud.js` in `worker/cloud.js`.
  const named = (f) => new RegExp(`(?<![\\w/-])${f.replace(/[.]/g, '\\.')}\\b`).test(all);
  const missing = [...WEB.filter((f) => !named(f)), ...WORKER.map((f) => `worker/${f}`).filter((f) => !all.includes(f))];
  assert.deepEqual(missing, [], `Not named in docs/architecture/: say what each does and how it is wired. ${FIX}`);
});

test('every file docs/architecture/ names still exists', () => {
  const gone = docs.flatMap(({ name, text }) => [...text.matchAll(/`((?:[\w-]+\/)*[\w.-]+\.(?:m?js|py|sh|sql|json|css|html))\b/g)]
    .map((m) => m[1])
    .filter((f) => filesNamed(f).length === 0 && !/^\.\/|^NNN/.test(f))
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

// The ✅ claims in docs/architecture/sound.md and README.md.
test('✅ one realtime AudioContext: only audio.js makes one (listen-input.js only when handed none)', () => {
  assert.deepEqual(webWith(/new (?:window\.)?(?:webkit)?AudioContext\b|new Ctx\(/), ['audio.js', 'listen-input.js'], FIX);
});

test('✅ offline renders: the four modules docs/architecture/ lists', () => {
  assert.deepEqual(webWith(/new OfflineAudioContext\b/), ['sequencer.js', 'share-render.js', 'song.js', 'voices.js'], FIX);
});

test('✅ the microphone: two recorders, the sound sheet and 🧸 Kids', () => {
  assert.deepEqual(webWith(/new MediaRecorder\b/), ['kids.js', 'sheet.js'], FIX);
});

test('✅ schedulers on the audio clock: the beat maker, 🎼 Song and 🧸 Kids', () => {
  assert.deepEqual(webWith(/setInterval\(/).filter((f) => /\.currentTime\b/.test(read(`web/${f}`))), ['kids.js', 'sequencer.js', 'song.js'], FIX);
});
