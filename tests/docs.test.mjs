// The docs link to each other a lot (AGENTS.md, decisions, ADRs, TODO.md), and
// an agent's cold start follows those links. Every relative link must point
// at a file that exists, and every ADR must be listed in the ADR index.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'TODO.md',
  ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(join(root, 'docs/adr')).filter((f) => f.endsWith('.md')).map((f) => `docs/adr/${f}`),
  ...readdirSync(join(root, 'docs/design')).filter((f) => f.endsWith('.md')).map((f) => `docs/design/${f}`)];

// [text](target) links, skipping web addresses, mail and in-page anchors, and
// anything inside a fenced code block (the ADR template has placeholders).
function links(markdown) {
  const prose = markdown.replace(/```[\s\S]*?```/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
    .filter((t) => !/^(https?:|mailto:|#)/.test(t))
    .map((t) => t.split('#')[0]);
}

test('every relative link in the docs points at a file that exists', () => {
  const broken = docs.flatMap((doc) => links(readFileSync(join(root, doc), 'utf8'))
    .filter((target) => !existsSync(join(root, dirname(doc), target)))
    .map((target) => `${doc} → ${target}`));
  assert.deepEqual(broken, []);
});

test('every ADR is listed in the ADR index', () => {
  const index = readFileSync(join(root, 'docs/adr/README.md'), 'utf8');
  const adrs = readdirSync(join(root, 'docs/adr')).filter((f) => /^\d{4}-.*\.md$/.test(f));
  assert.ok(adrs.length > 0);
  assert.deepEqual(adrs.filter((f) => !index.includes(`(${f})`)), []);
});

test('CLAUDE.md only imports AGENTS.md, so the two never drift', () => {
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\n/);
});
