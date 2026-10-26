// `just test`'s second reporter names the files a cut run left a test
// unreported in, so tools/node_tests.sh can rerun them alone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unended } from './unended-reporter.mjs';

async function files(events) {
  async function* source() { yield* events; }
  const out = [];
  for await (const line of unended(source())) out.push(line);
  return out.join('');
}

const ev = (type, file, name, nesting = 0) => ({ type, data: { file, name, nesting } });

test('a test that starts and never ends names its file, once', async () => {
  assert.equal(await files([
    ev('test:start', '/r/tests/a.test.mjs', 'plays'),
    ev('test:pass', '/r/tests/a.test.mjs', 'plays'),
    ev('test:start', '/r/tests/b.test.mjs', 'records'),
    ev('test:start', '/r/tests/b.test.mjs', 'stops'),
    ev('test:start', '/r/tests/c.test.mjs', 'loops'),
    ev('test:fail', '/r/tests/c.test.mjs', 'loops'),
  ]), '/r/tests/b.test.mjs\n');
});

test('a full run names nothing: passes, fails, skips and a file that fails as a whole', async () => {
  assert.equal(await files([
    ev('test:start', '/r/tests/a.test.mjs', 'same name'),
    ev('test:start', '/r/tests/a.test.mjs', 'same name'),
    ev('test:pass', '/r/tests/a.test.mjs', 'same name'),
    ev('test:pass', '/r/tests/a.test.mjs', 'same name'),
    ev('test:fail', '/r/tests/broken.test.mjs', '/r/tests/broken.test.mjs'),
    { type: 'test:diagnostic', data: { message: 'tests 2' } },
    { type: 'test:stdout', data: { file: '/r/tests/a.test.mjs', message: 'hi' } },
  ]), '');
});

test('a test with the same name in two files is two tests', async () => {
  assert.equal(await files([
    ev('test:start', '/r/tests/a.test.mjs', 'starts'),
    ev('test:start', '/r/tests/b.test.mjs', 'starts'),
    ev('test:pass', '/r/tests/b.test.mjs', 'starts'),
  ]), '/r/tests/a.test.mjs\n');
});
