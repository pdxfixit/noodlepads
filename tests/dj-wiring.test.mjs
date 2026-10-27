// The keys panel's wiring carries nothing dead: every element app.js hands
// createDJ is read by the panel or its editors, and every method the panel
// returns is called by app.js. A dead name looks like a control that works
// (2026-10-26: `el.tryingStop` was passed and never read, while ↩️ Beat
// was wired through `el.trying`'s button; it is wired through it now).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');
const app = read('app.js');
const panel = ['dj.js', 'dj-keys.js', 'dj-touch.js', 'dj-takes.js'].map(read).join('\n');

test('every element app.js hands the keys panel is read there', () => {
  const start = app.indexOf('dj = createDJ({');
  const els = app.slice(start, app.indexOf('\n    deps: {', start));
  const names = [...els.matchAll(/\b(\w+): [$[{]/g)].map((m) => m[1]).filter((n) => n !== 'el');
  assert.ok(names.length > 50, 'the el map was found');
  // Only names whose value starts with `$(`, `[` or `{` (an element, a list
  // of them, an editor's own map) are found; any other value is not checked.
  // Read as `el.name` (or `el.part.name`, an editor's own `el`), or taken
  // out of `el` by a destructure; a bare `.name` elsewhere does not count.
  const unread = names.filter((n) => !new RegExp(`\\bel(\\.\\w+)*\\??\\.${n}\\b|\\{[^}]*\\b${n}\\b[^}]*\\} = el\\b`).test(panel));
  assert.deepEqual(unread, []);
});

test('every method the keys panel returns is called by app.js', () => {
  const found = read('dj.js').match(/^  return \{ ([^}]+) \};\n\}\s*$/m);
  assert.ok(found, 'createDJ\'s return line was found');
  const names = found[1].split(',').map((s) => s.trim());
  assert.ok(names.length > 10);
  assert.deepEqual(names.filter((n) => !new RegExp(`\\bdj\\??\\.${n}\\b`).test(app)), []);
});
