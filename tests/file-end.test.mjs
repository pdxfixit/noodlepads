// A test file ends by itself when its tests are done (tests/file-end.mjs,
// tools/node_tests.sh), so no run needs --test-force-exit, which cut a
// parallel run's last reports (2026-10-19). Each check runs a tiny test file
// in a child Node, as the runner does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const fakeDom = pathToFileURL(join(here, 'fake-dom.mjs')).href;
const scratch = mkdtempSync(join(tmpdir(), 'noodle-file-end-'));

const scratchFile = (name, body) => {
  const file = join(scratch, name);
  writeFileSync(file, `import { test } from 'node:test';\n${body}\n`);
  return file;
};
// NODE_TEST_CONTEXT is how a runner marks its children; kept, an inner `node --test` would run nothing.
const run = (cmd, args, env = {}) => {
  const { NODE_TEST_CONTEXT, ...clean } = process.env;
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...clean, ...env } });
};

test('a file that starts the app\'s kind of timers ends by itself when its tests are done', () => {
  const file = scratchFile('timers.test.mjs', `
    import { installPage } from ${JSON.stringify(fakeDom)};
    test('page up, an interval and a minute-long timer left running', () => {
      installPage({});
      setInterval(() => {}, 1000);
      setTimeout(() => {}, 60_000);
    });`);
  const t0 = Date.now();
  const r = run(process.execPath, [file]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(Date.now() - t0 < 8_000, 'it did not wait for the minute-long timer');
});

test('a timer the page sets after the last test is stopped with a note, and the file ends', () => {
  // The real setTimeout, kept before the page replaces it, fires after the
  // tests are done and starts an interval the stand-in has no later cleanup for.
  const file = scratchFile('late.test.mjs', `
    import { installPage } from ${JSON.stringify(fakeDom)};
    const realSetTimeout = setTimeout;
    test('a continuation still to come', () => {
      installPage({});
      realSetTimeout(() => { setInterval(() => {}, 1000); }, 300);
    });`);
  const r = run('sh', ['tools/node_tests.sh', file], { NOODLE_EXIT_MS: '1000' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /late\.test\.mjs: stopped 1 page timer \(an interval of 1000 ms\), set after its last test/);
});

test('a real handle outside the stand-in still fails the file, even with the page up', () => {
  const file = scratchFile('real.test.mjs', `
    import { installPage } from ${JSON.stringify(fakeDom)};
    const realSetInterval = setInterval;
    test('page up, then a real interval nobody clears', () => {
      installPage({});
      realSetInterval(() => {}, 1000);
    });`);
  const r = run('sh', ['tools/node_tests.sh', file], { NOODLE_EXIT_MS: '400' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /real\.test\.mjs did not end 0\.4 s after its last test: still open: Timeout/);
});

test('a file that cannot end fails by name, through the runner `just test` uses', () => {
  const file = scratchFile('stuck.test.mjs', `test('leaves an interval nobody clears', () => { setInterval(() => {}, 1000); });`);
  const r = run('sh', ['tools/node_tests.sh', file], { NOODLE_EXIT_MS: '400' });
  assert.notEqual(r.status, 0, 'a file that never ends must fail the run');
  const out = r.stdout + r.stderr;
  assert.match(out, /stuck\.test\.mjs did not end 0\.4 s after its last test/);
  assert.match(out, /Timeout/, 'it names what holds the file');
});

test('the runner passes a file that ends, and does not use --test-force-exit', () => {
  const file = scratchFile('fine.test.mjs', `test('ends', () => {});`);
  const r = run('sh', ['tools/node_tests.sh', file]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['tools/stress.sh', 'justfile']) {
    assert.ok(/node --test[^\n]*file-end\.mjs/.test(readFileSync(join(root, f), 'utf8')), `${f} runs node --test with the file-end watchdog`);
  }
  for (const f of ['tools/node_tests.sh', 'tools/stress.sh', 'justfile']) {
    assert.ok(!readFileSync(join(root, f), 'utf8').split('\n').some((l) => /--test-force-exit/.test(l) && !/^\s*#/.test(l)),
      `${f} runs node without --test-force-exit`);
  }
});

test('a file that imports fake-dom.mjs inside a test also imports it at its top, where the end-of-file hook belongs', () => {
  const late = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).filter((f) => {
    const src = readFileSync(join(here, f), 'utf8');
    return /await import\('\.\/fake-dom\.mjs'\)/.test(src) && !/^import [^\n]*'\.\/fake-dom\.mjs'/m.test(src);
  });
  assert.deepEqual(late, [], 'after() inside a test is tied to that one test, so the timers would be cleared too early (or never)');
});

test.after(() => rmSync(scratch, { recursive: true, force: true }));
