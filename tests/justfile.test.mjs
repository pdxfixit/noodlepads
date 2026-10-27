// The justfile is the toolbox a cold session finds with `just --list`, and
// the docs are where it learns when to use each tool. So every recipe says
// what it does in that list (a lone `#` line above it, or `[doc(...)]` when
// its comment runs longer: just shows only a comment's last line), and every
// recipe and tool is named in the docs an agent reads. Before 2026-10-12,
// `ship` showed no description and five others showed a stray middle line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = ['AGENTS.md', 'README.md', 'docs/how-to.md', 'docs/deploy-cloudflare.md', 'docs/layout.md']
  .map((f) => readFileSync(join(root, f), 'utf8')).join('\n');

// The recipes as just reads them. `just test` runs this, so just is there;
// a bare `node --test` without it skips.
function recipes() {
  try {
    return JSON.parse(execFileSync('just', ['--dump', '--dump-format', 'json'], { cwd: root, encoding: 'utf8' })).recipes;
  } catch { return null; }
}

test('every recipe says what it does in just --list', (t) => {
  const all = recipes();
  if (!all) return t.skip('just is not installed');
  const bare = Object.entries(all).filter(([, r]) => !r.private && !(r.doc ?? '').trim()).map(([name]) => name);
  assert.deepEqual(bare, []);
  // A description cut from the middle of a longer comment starts in lower
  // case or with "(" (the old stamp, deploy-clean and deploy-moved did).
  const cut = Object.entries(all).filter(([, r]) => !r.private && /^[a-z(]/.test(r.doc ?? '')).map(([name]) => name);
  assert.deepEqual(cut, []);
});

test('every recipe is named in the docs', (t) => {
  const all = recipes();
  if (!all) return t.skip('just is not installed');
  const unnamed = Object.entries(all).filter(([name, r]) => !r.private && !docs.includes(`just ${name}`)
    && !docs.includes(`just --yes ${name}`) && !docs.includes(`\`${name}\``)).map(([name]) => name);
  assert.deepEqual(unnamed, []);
});

// Every `just <recipe>` the docs tell a reader to run, in backticks or on a
// line of a code block. Until 2026-10-26 the deploy doc's steps named
// `just deploy-migrated`, removed on 2026-10-16, and its rollback ended in a
// deploy agents never run: a reader in a crisis follows the docs as written.
export function recipesNamed(text) {
  const named = new Set();
  text.split(/^\s*```.*$/m).forEach((part, i) => {
    for (const m of part.matchAll(/`just (?:--yes )?([a-z][a-z0-9-]*)/g)) named.add(m[1]);
    if (i % 2) for (const m of part.matchAll(/^\s*just (?:--yes )?([a-z][a-z0-9-]*)/gm)) named.add(m[1]);
  });
  return named;
}

// The docs a reader acts on today. ADRs, design docs and the changelog are
// history: they may name a recipe as it was.
function liveDocs() {
  const md = (dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.md')).map((f) => join(dir, f));
  return ['AGENTS.md', 'README.md', 'TODO.md', ...md('docs'), ...md('docs/architecture')];
}

// Recipes of other repos the docs name, with where they run.
const ELSEWHERE = new Set([
  'pull',            // pdxfixit/telemetry: `just pull noodlepads` in ~/src/telemetry
  'events-vendor',   // pdxfixit/flarepress: vendors worker/events-worker.js and web/events-client.js
]);

test('recipesNamed finds `just x` in backticks and on code-block lines, not in prose', () => {
  const text = 'Run `just look --wide`, or `just --yes deploy`; just like that.\n```\njust deploy-check   # first\n  just serve 8781\n```\njust outside a block';
  assert.deepEqual([...recipesNamed(text)].sort(), ['deploy', 'deploy-check', 'look', 'serve']);
});

test('every recipe the docs name exists', (t) => {
  const all = recipes();
  if (!all) return t.skip('just is not installed');
  const known = new Set([...Object.keys(all), ...Object.keys(JSON.parse(execFileSync('just', ['--dump', '--dump-format', 'json'],
    { cwd: root, encoding: 'utf8' })).aliases ?? {}), ...ELSEWHERE]);
  const gone = [];
  for (const f of liveDocs()) {
    for (const name of recipesNamed(readFileSync(join(root, f), 'utf8'))) if (!known.has(name)) gone.push(`${f}: just ${name}`);
  }
  assert.deepEqual(gone, [], 'the docs name a recipe the justfile does not have');
});

test('every tool is named in the docs', () => {
  const tools = readdirSync(join(root, 'tools')).filter((f) => !f.startsWith('test_') && /\.(py|mjs|sh|json)$/.test(f));
  assert.deepEqual(tools.filter((f) => !docs.includes(f)), []);
});

test('a deploy runs the shared flarepress check, stamp and verify on site/', () => {
  // Until 2026-10-13 stamp marked -dirty for web/ only while deploy-verify used
  // git describe --dirty (the whole tree): an edited TODO.md made it wait for
  // a version that was never stamped, then fail. Both now come from flarepress's
  // tools/site.sh, and verify reads the stamp back.
  const just = readFileSync(join(root, 'justfile'), 'utf8');
  const body = (name) => just.split(`\n${name}`)[1].split('\n\n')[0];
  assert.match(body('deploy-check:'), /site\.sh" "\{\{site\}\}" check --from/);
  assert.match(body('stamp:'), /site\.sh" "\{\{site\}\}" stamp/);
  assert.match(body('deploy-verify *flags:'), /site\.sh" "\{\{site\}\}" verify/);
  assert.match(body('deploy:'), /just deploy-check/);
  assert.doesNotMatch(just, /describe[^\n]*--dirty/);
});

// Ben's fallback `just deploy` on the Mac (the reliability seat, 2026-10-26):
// once the Worker holds CHECKS_KEY, live checks sent without it are refused,
// so the deploy would go red after the upload. It reads cloud.json's
// "checksKey" (tools/cloud_config.py --checks-key) before anything, stops
// when there is none, and puts it into the Worker before the upload.
test("the Mac's deploy needs the checks' key before anything, and puts it in before the upload", () => {
  const just = readFileSync(join(root, 'justfile'), 'utf8');
  const body = just.split('\ndeploy:')[1].split('\n\n')[0];
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines.slice(0, 3), ['#!/usr/bin/env bash', 'set -euo pipefail', '{{checks}}'], 'first, before the tests');
  assert.match(just, /^checks := 'line=\$\(python3 tools\/cloud_config\.py --checks-key\) \|\| exit 1; eval "\$line"'$/m, 'none: it stops');
  const put = body.indexOf('secret put CHECKS_KEY');
  assert.ok(put > 0 && put < body.indexOf('wrangler.sh" "{{site}}" deploy'), 'the secret before the upload');
  assert.match(body, /printf '%s' "\$CHECKS_KEY" \| "\{\{flarepress\}\}\/tools\/wrangler\.sh" "\{\{site\}\}" secret put CHECKS_KEY/, 'from stdin');
  for (const name of ['deploy-checks:', 'cloud-smoke *args:', 'cloud-e2e *args:']) {
    assert.match(just.split(`\n${name}`)[1].split('\n\n')[0], /\{\{checks-if-any\}\}/, `${name} reads the Mac's key when there is one`);
  }
});

test('a deploy refuses uncommitted edits in everything it uploads', () => {
  // site/wrangler.toml ships web/ (the site), worker/ (the /api Worker) and
  // itself; the shared check reads the paths from site/site.conf.
  const committed = readFileSync(join(root, 'site/site.conf'), 'utf8').match(/^committed=(.*)$/m)?.[1].split(/\s+/) ?? [];
  for (const dir of ['web', 'worker', 'site']) assert.ok(committed.includes(dir), `site.conf commits ${dir}/`);
});

test('site/wrangler.toml holds no ids: the public repo names them for the deploy to fill', () => {
  // GitHub fills ${D1_DATABASE_ID} from a secret, Ben's Mac from ~/.config/noodlepads/cloud.json.
  const toml = readFileSync(join(root, 'site/wrangler.toml'), 'utf8');
  assert.match(toml, /^database_id = "\$\{D1_DATABASE_ID\}"$/m);
  assert.doesNotMatch(toml, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/);
  assert.match(toml, /^main = "\.\.\/worker\/index\.js"$/m);
  assert.match(toml, /^directory = "\.\.\/web"$/m);
});

test('GitHub deploys only after the tests', () => {
  const wf = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  const at = (s) => { const i = wf.indexOf(s); assert.ok(i >= 0, `deploy.yml runs ${s}`); return i; };
  assert.ok(at('run: just test') < at('uses: pdxfixit/flarepress@'));
  // The release checks too: test.yml runs them beside the deploy, not before it,
  // so a web/ change without `just version` went live before test.yml went red.
  assert.ok(at('run: tools/version_bumped.sh') < at('uses: pdxfixit/flarepress@'));
  assert.ok(at('run: python3 tools/bump_version.py --check') < at('uses: pdxfixit/flarepress@'));
  assert.doesNotMatch(wf, /deploy-migrated/);
  assert.ok(at('uses: pdxfixit/flarepress@') < at('run: just deploy-checks'));
  // flarepress's rolling v1 tag, the action and the checkout alike (Ben, 2026-10-15).
  assert.match(wf, /uses: pdxfixit\/flarepress@v1\b/);
  assert.match(wf, /ref: v1\b/);
  assert.match(wf, /branches: \[main\]/);
});

// The deploy applies the migrations D1 lacks before it uploads (Ben,
// 2026-10-26), so a new Worker never meets an older database; only the
// migrate and upload steps get the token that can write D1.
test('GitHub applies missing migrations before the upload, and only those steps hold the token', () => {
  const wf = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  const at = (s) => { const i = wf.indexOf(s); assert.ok(i >= 0, `deploy.yml runs ${s}`); return i; };
  assert.ok(at('run: just test') < at('run: just cloud-migrate --yes'));
  assert.ok(at('run: just cloud-migrate --yes') < at('uses: pdxfixit/flarepress@'));
  const job = wf.slice(at('jobs:'), at('steps:'));
  assert.doesNotMatch(job, /CLOUDFLARE_API_TOKEN/, 'not in the whole job: the tests and the live checks run without it');
  assert.equal(wf.match(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/g)?.length, 3, "the migrate step, the checks' secret and the upload");
});

// The deploy checks prove who they are (Ben, 2026-10-26): the deploy puts the
// GitHub secret CHECKS_KEY into the Worker with wrangler before the upload
// (skipped, saying so, while it is empty), and the live checks send it.
test("GitHub puts the checks' secret into the Worker before the upload, and the live checks send it", () => {
  const wf = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  const at = (s) => { const i = wf.indexOf(s); assert.ok(i >= 0, `deploy.yml has ${s}`); return i; };
  const put = at('secret put CHECKS_KEY');
  assert.ok(at('run: just cloud-migrate --yes') < put && put < at('uses: pdxfixit/flarepress@'));
  const step = wf.slice(wf.lastIndexOf('- name:', put), put + 40);
  assert.match(step, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(step, /CHECKS_KEY: \$\{\{ secrets\.CHECKS_KEY \}\}/);
  assert.match(step, /if \[ -z "\$CHECKS_KEY" \]; then\n\s+echo "::notice[^\n]*CHECKS_KEY[^\n]*"\n\s+exit 0/, 'empty: says so and goes on');
  // Trimmed before anything reads it, as look-cloud.mjs checksHeaders trims what it sends.
  const run = step.slice(step.indexOf('set -euo pipefail'));
  assert.ok(run.indexOf('CHECKS_KEY="${CHECKS_KEY#"${CHECKS_KEY%%[![:space:]]*}"}"') > 0, 'leading space trimmed');
  assert.ok(run.indexOf('CHECKS_KEY="${CHECKS_KEY%"${CHECKS_KEY##*[![:space:]]}"}"') < run.indexOf('if [ -z "$CHECKS_KEY" ]'), 'trailing too, first');
  assert.match(step, /printf '%s' "\$CHECKS_KEY" \| "\$FLAREPRESS\/tools\/wrangler\.sh" "\$GITHUB_WORKSPACE\/site" secret put CHECKS_KEY/, 'the value from stdin, never on the command line');
  // A failed put stops the deploy before the upload, so the live checks never meet a Worker without the secret.
  const failed = wf.slice(put, wf.indexOf('- uses:', put));
  assert.match(step, /set -euo pipefail/);
  assert.match(failed, /::error[^\n]*\n\s+exit 1/);
  const checks = wf.slice(wf.lastIndexOf('- name:', at('run: just deploy-checks')), at('run: just deploy-checks'));
  assert.match(checks, /CHECKS_KEY: \$\{\{ secrets\.CHECKS_KEY \}\}/);
  assert.doesNotMatch(checks, /CLOUDFLARE_API_TOKEN/);
});
