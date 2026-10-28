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
  ...readdirSync(join(root, 'docs/design')).filter((f) => f.endsWith('.md')).map((f) => `docs/design/${f}`),
  ...readdirSync(join(root, 'docs/architecture')).filter((f) => f.endsWith('.md')).map((f) => `docs/architecture/${f}`)];

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

// A link like (docs/how-to.md#ship) or (#ship) must land on a real heading:
// the file can exist and the section still be renamed away. GitHub's anchors:
// lowercase, punctuation dropped, spaces to hyphens.
export const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
export const anchorsOf = (md) => new Set([...md.replace(/^```[\s\S]*?^```/gm, '').matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));

test('the anchor check reads headings the way GitHub does', () => {
  assert.equal(slug('Deploy, live checks and rollback'), 'deploy-live-checks-and-rollback');
  assert.equal(slug('Ship'), 'ship');
  assert.ok(anchorsOf('# A title\n\n```\n# not a heading\n```\n## Second part\n').has('second-part'));
  assert.ok(!anchorsOf('# A title\n\n```\n# not a heading\n```\n').has('not-a-heading'));
});

test('every #heading link in the docs points at a heading that exists', () => {
  const bad = [];
  for (const doc of docs) {
    const prose = readFileSync(join(root, doc), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const [, target] of prose.matchAll(/\]\(([^)\s]*#[^)\s]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const [file, anchor] = target.split('#');
      const abs = file ? join(root, dirname(doc), file) : join(root, doc);
      if (!abs.endsWith('.md') || !existsSync(abs)) continue;   // a missing file is the link test's finding
      if (!anchorsOf(readFileSync(abs, 'utf8')).has(anchor)) bad.push(`${doc} → ${target}`);
    }
  }
  assert.deepEqual(bad, []);
});

// AGENTS.md and how-to point at files in backticks too (`tests/lines.test.mjs`):
// a cold start opens them. Until 2026-10-26 AGENTS.md cited a test file that
// never existed.
test('every file AGENTS.md and how-to.md name in backticks exists', () => {
  // Made by the deploy, or flarepress's own (run from its checkout).
  const elsewhere = new Set(['web/version.json', 'tools/land.sh', 'tools/resolve_todo.py', 'tools/resolve_questions.py',
    'tools/resolve_words.py', 'tools/harvest.py', 'tools/site.sh', 'tools/wrangler.sh']);
  const missing = [];
  for (const doc of ['AGENTS.md', 'docs/how-to.md']) {
    const text = readFileSync(join(root, doc), 'utf8');
    for (const [, path] of text.matchAll(/`((?:tests|tools|web|worker|site|docs|skills|\.github)\/[\w./-]+\.\w+)`/g)) {
      if (!elsewhere.has(path) && !existsSync(join(root, path))) missing.push(`${doc} → ${path}`);
    }
  }
  assert.deepEqual(missing, []);
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
