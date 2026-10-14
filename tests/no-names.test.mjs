// No kid's name anywhere in the repo (Ben, 2026-10-11): not in code, tests,
// tools, file names or docs. This reads every tracked text file and every
// path. The names are known here only as SHA-256 hashes, so this file does
// not name anyone either. No exceptions: since 1.0 the repo and its folder
// are `noodlepads`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
const AS_NAME = '9baf3a40312f39849f46dad1040f2f039f1cffa1238c41e9db675315cfad39b6';

// Every place in `text` a name is written, as "word" strings.
export function namesIn(text) {
  const found = [];
  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    const word = m[0];
    const lower = word.toLowerCase();
    const hash = sha(lower);
    if (ANY_CASE.has(hash)) { found.push(word); continue; }
    if (hash !== AS_NAME) continue;
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

test('namesIn finds a name however it is written, and leaves everyday words alone', () => {
  // Built from parts so this file holds no name either.
  const n = ['Cr', 'aig'].join('');
  const m = ['M', 'ax'].join('');
  assert.deepEqual(namesIn(`hello ${n} and ${n.toUpperCase()}`), [n, n.toUpperCase()]);
  assert.deepEqual(namesIn(`${m} plays`), [m]);
  assert.deepEqual(namesIn(`id: '${m.toLowerCase()}', '${m.toLowerCase()}-kick', #${m.toLowerCase()}`).length, 3);
  assert.deepEqual(namesIn('Math.max(1, 2); max-width: 3px; maxSeconds; MAX_RECORDS; slider.max'), []);
  assert.deepEqual(namesIn(`~/src/${n.toLowerCase()}-soundboard`), [n.toLowerCase()], 'the old folder name is caught too');
  assert.deepEqual(namesIn(`${n.toLowerCase()}-kick`), [n.toLowerCase()]);
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
