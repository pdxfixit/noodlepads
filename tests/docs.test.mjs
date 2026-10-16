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
  // README's screenshots are HTML <img src="…">, so those count as links too.
  return [...prose.matchAll(/\]\(([^)\s]+)\)|<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1] ?? m[2])
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

// Two agents in two worktrees can each take the next number; landing both
// gives two ADRs one number (0028, 2026-10-16). The later one renumbers.
test('every ADR has a number of its own', () => {
  const nums = readdirSync(join(root, 'docs/adr')).filter((f) => /^\d{4}-.*\.md$/.test(f)).map((f) => f.slice(0, 4));
  assert.deepEqual(nums.filter((n, i) => nums.indexOf(n) !== i), [], 'renumber the ADR that landed later, and every "ADR NNNN" that names it');
});

test('CLAUDE.md only imports AGENTS.md, so the two never drift', () => {
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md\n/);
});

// The problem-report design's summary must match worker/reports.js and the
// payload log-clean.js builds: it once said "30 days in KV" long after reports
// moved to D1 for 14 days, and named the raw User-Agent.
test('the automatic-logs design summary matches the code: D1, its keep time and limits, no User-Agent', async () => {
  const { TTL_MS, PER_DEVICE_MINUTE, PER_DAY } = await import('../worker/reports.js');
  const doc = readFileSync(join(root, 'docs/design/automatic-logs.md'), 'utf8');
  const row = (name) => doc.match(new RegExp(`^\\| ${name} \\| (.+) \\|$`, 'm'))?.[1] ?? '';
  const days = TTL_MS / 86400000;
  assert.match(row('Where'), /D1/);
  assert.match(row('How long'), new RegExp(`^${days} days in D1`));
  assert.doesNotMatch(row('How long') + row('How it is read'), /forever in the local|logs\.sqlite3/, 'the Mac reads the runner\'s mirror (2026-10-16)');
  assert.match(row('Abuse limits'), new RegExp(`${PER_DEVICE_MINUTE} uploads a minute per device code`));
  assert.match(row('Abuse limits'), new RegExp(`${PER_DAY.toLocaleString('en-US')} a day`));
  assert.doesNotMatch(doc, /30 days in KV|KV for 30 days|stores it in Workers KV/);
  assert.doesNotMatch(doc, /\| `env\.ua` \|/, 'the payload table names no User-Agent field');
  for (const f of ['env.browser', 'env.os', 'env.type']) assert.match(doc, new RegExp(`\\| \`${f.replace('.', '\\.')}\` \\|`));
});
