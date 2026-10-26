// `just look`'s views (tools/look.mjs VIEWS). No test runs Chrome, so this
// checks the table itself: every view name is taken once (a second one
// replaces the first unseen: `beat` once replaced 🆕 New's view), and the
// names agents and the docs use still mean what they say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const LOOK = join(root, 'tools/look.mjs');

// The table as look.mjs builds it (`--views PATH` writes it and stops).
function views() {
  const dir = mkdtempSync(join(tmpdir(), 'look-views-'));
  try {
    execFileSync(process.execPath, [LOOK, '--views', join(dir, 'views.json')], { stdio: 'pipe' });
    return JSON.parse(readFileSync(join(dir, 'views.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The top-level keys of the object literal that starts at `src[at]` ('{'),
// in order, duplicates kept. JavaScript keeps only the last of two equal keys,
// silently, so they are read from the source: strings, templates (with their
// ${…}) and comments are skipped, and only keys at the literal's own depth count.
function literalKeys(src, at) {
  const keys = [];
  let depth = 0;
  let wantKey = false;
  const stack = [];   // what each open ${ … } returns to: 'tpl'
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      if (wantKey && depth === 1 && /^\s*:/.test(src.slice(j + 1, j + 40))) { keys.push(src.slice(i + 1, j)); wantKey = false; }
      i = j;
      continue;
    }
    if (c === '`' || (c === '}' && stack.at(-1) === 'tpl')) {
      if (c === '}') stack.pop();
      let j = i + 1;
      while (src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      if (src[j] === '$') { stack.push('tpl'); j++; }
      i = j;
      continue;
    }
    if ('{[('.includes(c)) { depth++; stack.push('code'); if (depth === 1) wantKey = true; continue; }
    if ('}])'.includes(c)) { depth--; stack.pop(); if (depth === 0) return keys; continue; }
    if (c === ',' && depth === 1) { wantKey = true; continue; }
    if (wantKey && depth === 1 && /[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (/^\s*:/.test(src.slice(i + m[0].length, i + m[0].length + 40))) keys.push(m[0]);
      wantKey = false;
      i += m[0].length - 1;
    }
  }
  throw new Error('the object literal never closes');
}

test('literalKeys finds a key used twice in an object literal, wherever it sits', () => {
  const src = "const T = { a: 1, 'b-c': { a: 2 }, d: `x ${ { a: 3 } } y`, // a: 4\n  e: [1, { a: 5 }],\n    a: 6 };";
  assert.deepEqual(literalKeys(src, src.indexOf('{')), ['a', 'b-c', 'd', 'e', 'a']);
});

test('every view in the table is named once (a second key would replace the first)', () => {
  const src = readFileSync(LOOK, 'utf8');
  const names = literalKeys(src, src.indexOf('{', src.indexOf('const VIEWS = {')));
  assert.ok(names.length > 50, `found only ${names.length} views in the table`);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(twice, [], `views named twice in look.mjs VIEWS: ${twice.join(', ')}`);
});

test('look.mjs builds its views without a clash, and the names in use mean what they say', () => {
  const v = views();   // throws when a view built after the table takes a name already used
  assert.deepEqual(v.beat, v.beats, '`just look beat` is the Beats screen, as `just look beats`');
  assert.equal(v.dj.screen, 'live', '`dj` is the old name of 🎤 Live');
  assert.match(v['beat-new'].js, /\[data-beat-new\]/, 'beat-new taps 🆕 New in the beat bar');
  for (const [name, view] of Object.entries(v)) {
    assert.ok(['pads', 'beats', 'song', 'live'].includes(view.screen), `${name}: no screen called ${view.screen}`);
  }
});
