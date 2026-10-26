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
