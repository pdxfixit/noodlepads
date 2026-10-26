// No kid's name anywhere in the repo (Ben, 2026-10-11): not in code, tests,
// tools, file names or docs. This reads every tracked text file and every
// path. The names are known here only as SHA-256 hashes, so this file does
// not name anyone either. No exceptions: since 1.0 the repo and its folder
// are `noodlepads`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');

// Names, any case: two first names, and the old address's domain word.
const ANY_CASE = new Set([
  'c157a0b0d40f9d9506c72fae584069d1692b816da16cd76c648d5761c588057a',
  'b9138194ffe9e7c8bb6d79d1ed56259553d18d9cb60b66e3ba5aa2e5b078055a',
  '6889d19fc64db4f488a2d343344d01cee39bebeb3d5d9963aae03f44e51347ea',
]);
// A name that is also an everyday word in code (a maximum): caught when
// written as a name (capitalized) or as an id ('…', "…", #…, …-kick).
const AS_NAME = new Set(['9baf3a40312f39849f46dad1040f2f039f1cffa1238c41e9db675315cfad39b6']);

// The same hashes kept outside the repo (Ben, 2026-10-26): the GitHub secret
// NOODLE_NAME_HASHES in CI, ~/.config/noodlepads/names.json on Ben's Mac, as
// {"anyCase": ["…"], "asName": "…"} (or a list). Once CI has shown they match
// the ones above, the ones above go, and a checkout without them skips.
export function outsideHashes(env = process.env, file = join(homedir(), '.config/noodlepads/names.json')) {
  const raw = env.NOODLE_NAME_HASHES || (existsSync(file) ? readFileSync(file, 'utf8') : '');
  if (!raw.trim()) return null;
  const j = JSON.parse(raw);
  return { anyCase: new Set(j.anyCase), asName: new Set([j.asName].flat()) };
}

// Every place in `text` a name is written, as "word" strings. The hash sets
// are parameters so the self-test below runs on made-up names: a test that
// spelled out a real name, even built from parts, would show it in a public
// file.
export function namesIn(text, { anyCase = ANY_CASE, asName = AS_NAME } = {}) {
  const found = [];
  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    const word = m[0];
    const lower = word.toLowerCase();
    const hash = sha(lower);
    if (anyCase.has(hash)) { found.push(word); continue; }
    if (!asName.has(hash)) continue;
    const before = text[m.index - 1] ?? '';
    const next = text.slice(m.index + word.length, m.index + word.length + 8);
    const capitalized = word === lower[0].toUpperCase() + lower.slice(1);
    // An id: '…', "…", '…-kick', `…-${kit}`, #…; not `…` alone (a variable
    // in a comment) and not a CSS property.
    const asId = !/^-(width|height|content)/.test(next) && (before === '#'
      || (/['"]/.test(before) && /^['"-]/.test(next)) || (before === '`' && next.startsWith('-')));
    if (capitalized || asId) found.push(word);
  }
  return found;
}

test('the hashes kept outside the repo are the same ones, wherever CI has them', () => {
  const outside = outsideHashes();
  // A push to this repo always has the secret; a fork's pull request never does.
  if (process.env.GITHUB_EVENT_NAME === 'push') assert.ok(outside, 'NOODLE_NAME_HASHES is set for this workflow');
  if (!outside) return;
  assert.deepEqual([...outside.anyCase].sort(), [...ANY_CASE].sort(), 'the same names, any case');
  assert.deepEqual([...outside.asName].sort(), [...AS_NAME].sort(), 'the same name that is also a word');
});

test('outsideHashes reads the secret first, then the Mac file, and takes asName as one or a list', () => {
  assert.equal(outsideHashes({}, '/nonexistent/names.json'), null);
  const one = outsideHashes({ NOODLE_NAME_HASHES: JSON.stringify({ anyCase: ['a', 'b'], asName: 'c' }) }, '/nonexistent');
  assert.deepEqual([[...one.anyCase], [...one.asName]], [['a', 'b'], ['c']]);
  const list = outsideHashes({ NOODLE_NAME_HASHES: JSON.stringify({ anyCase: [], asName: ['c', 'd'] }) }, '/nonexistent');
  assert.deepEqual([...list.asName], ['c', 'd']);
});

test('namesIn finds a name however it is written, and leaves everyday words alone', () => {
  // Made-up names with their own hashes: Pip and Juno as names in any case,
  // Wren as a name that is also a word in code (as the real one is).
  const madeUp = { anyCase: new Set([sha('pip'), sha('juno')]), asName: new Set([sha('wren')]) };
  const names = (text) => namesIn(text, madeUp);
  assert.deepEqual(names('hello Pip and PIP, juno too'), ['Pip', 'PIP', 'juno']);
  assert.deepEqual(names('Wren plays'), ['Wren']);
  assert.deepEqual(names("id: 'wren', 'wren-kick', #wren").length, 3);
  assert.deepEqual(names('Math.wren(1, 2); wren-width: 3px; wrenSeconds; WREN_RECORDS; slider.wren'), []);
  assert.deepEqual(names('~/src/pip-soundboard'), ['pip'], 'an old folder name is caught too');
  assert.deepEqual(names('pip-kick'), ['pip']);
  assert.deepEqual(names('Toby and Pippa'), [], 'only whole words with those hashes');
  assert.deepEqual(namesIn('Pip, Juno, Toby and Wren'), [], 'the real hashes are not the made-up names');
});

test('no tracked file, and no file name, holds a kid\'s name', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  for (const f of files) {
    if (namesIn(f).length) hits.push(`${f}: in its name`);
    if (/\.(wav|png|jpg|ico|zip)$/i.test(f)) continue;
    let text;
    try { text = readFileSync(`${root}/${f}`, 'utf8'); } catch { continue; }   // deleted in the working tree
    if (text.includes('\0')) continue;
    text.split('\n').forEach((line, i) => { if (namesIn(line).length) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});
