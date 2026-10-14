// The app's modules cannot be run without a browser, so these tests check
// the seams that break when code moves between files: every import names
// something the other file really exports, every module loads without
// touching the page, and every element the code looks up exists in index.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const webDir = new URL('../web/', import.meta.url);
const files = readdirSync(webDir).filter((f) => f.endsWith('.js')).sort();
const source = (f) => readFileSync(new URL(f, webDir), 'utf8');

// [{names: ['a', 'b'], from: './x.js'}] for each `import {a, b as c} from './x.js'`.
function importsOf(text) {
  const out = [];
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    out.push({ names, from: m[2] });
  }
  return out;
}

// app.js starts the page when loaded, so it is only read, not run.
const loadable = files.filter((f) => f !== 'app.js');

test('every module except app.js loads outside a browser', async () => {
  for (const f of loadable) await import(new URL(f, webDir));
});

test('every import names a file that exists and something it exports', async () => {
  for (const f of files) {
    for (const { names, from } of importsOf(source(f))) {
      assert.ok(from.startsWith('./') && files.includes(from.slice(2)), `${f} imports ${from}, which is not a module here`);
      const exported = await import(new URL(from, webDir));
      for (const n of names) assert.ok(n in exported, `${f} imports { ${n} } from ${from}, which does not export it`);
    }
  }
});

test('no module imports itself, and the import graph has no cycles', () => {
  const graph = new Map(files.map((f) => [f, importsOf(source(f)).map((i) => i.from.slice(2))]));
  const visiting = new Set();
  const done = new Set();
  const visit = (f, trail) => {
    assert.ok(!visiting.has(f), `import cycle: ${[...trail, f].join(' -> ')}`);
    if (done.has(f)) return;
    visiting.add(f);
    for (const next of graph.get(f)) visit(next, [...trail, f]);
    visiting.delete(f);
    done.add(f);
  };
  for (const f of files) visit(f, []);
});

test('only app.js and index.html decide what loads: no module pulls in a third-party origin', () => {
  for (const f of files) assert.doesNotMatch(source(f), /(?:from|import)\s*\(?\s*['"]https?:/, f);
});

test('every #id the code looks up exists in index.html', () => {
  const html = readFileSync(new URL('index.html', webDir), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [];
  for (const f of files) {
    const text = source(f);
    for (const m of text.matchAll(/(?:\$|querySelector)\(\s*['"`]#([a-z0-9-]+)['"`]/g)) {
      if (!ids.has(m[1])) missing.push(`${f}: #${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('index.html loads app.js as a module and nothing else as script', () => {
  const html = readFileSync(new URL('index.html', webDir), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="app.js">']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline event handlers');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline style attributes');
});
