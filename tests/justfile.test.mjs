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
