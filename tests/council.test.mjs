// The council's roster lives in two places: the table in docs/council.md,
// which agents and Ben read, and one agent file per seat in .claude/agents/,
// which Claude Code runs. A seat added, merged or renamed in one and not the
// other would silently drop out of every round (ADR 0034).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, '.claude/agents');
const files = readdirSync(dir).filter((f) => /^council-.*\.md$/.test(f));
const doc = readFileSync(join(root, 'docs/council.md'), 'utf8');
const rows = [...doc.matchAll(/^\| [^|]+ \| `(council-[a-z0-9-]+)` \| [^|]+ \| (opus|sonnet|haiku) \|$/gm)]
  .map((m) => ({ seat: m[1], model: m[2] }));

const front = (f) => {
  const m = readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${f} opens with frontmatter`);
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
};

test('every seat in the roster has its agent file, and every agent file is in the roster', () => {
  assert.ok(rows.length > 0, 'the roster table parses');
  assert.deepEqual(rows.map((r) => `${r.seat}.md`).sort(), [...files].sort());
});

test('the roster says how many seats there are', () => {
  assert.match(doc, new RegExp(`is ${rows.length} review agents`));
});

test('each agent file names itself, says what it is for, and runs on the roster\'s model', () => {
  for (const { seat, model } of rows) {
    const fm = front(`${seat}.md`);
    assert.equal(fm.name, seat);
    assert.match(fm.description, /^"Council seat: /);
    assert.equal(fm.model, model, seat);
  }
});

test('each seat answers in the shape docs/council.md asks for, with a biggest risk', () => {
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const line of ['Verdict: ✅ pass | ✏️ changes | ⛔ block', 'Biggest risk:', 'Beyond this change:', 'Questions for Ben:']) {
      assert.ok(text.includes(line), `${f}: ${line}`);
    }
    assert.ok(text.includes('never edit a file, commit, push'), `${f} is read-only`);
  }
});

// Ben, 2026-11-18: "any change, even as small as we are doing, should go
// through the full council". Every kind of change in the table gets every seat.
test('every kind of change convenes all of the seats, however small', () => {
  const table = doc.slice(doc.indexOf('## When it convenes'), doc.indexOf('## How a round runs'));
  const kinds = [...table.matchAll(/^\| (?!Change \||---)([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
  assert.ok(kinds.length >= 3, 'the table parses');
  for (const [, change, seats] of kinds) assert.equal(seats.trim(), 'All of them', change.trim());
  assert.match(table, /Every change gets the full council: all \d+ seats, however small/);
});

// Council (devex, 2026-11-18): the rule lives in four places; they must not drift apart.
test('AGENTS.md, the how-to and the council how-to all say every change gets all the seats', () => {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  assert.match(read('AGENTS.md'), /The full council reviews every change, however small/);
  assert.match(read('docs/agents/council-use.md'), /Convene all 22 seats on every change, however small/);
  assert.match(read('docs/how-to.md'), /Convene the full council:\*\* all 22 seats, on every change however small/);
  assert.doesNotMatch(doc, /Council: none/, 'no trailer that names no seat');
});
