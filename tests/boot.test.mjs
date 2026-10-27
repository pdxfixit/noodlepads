// Two versions meeting across a deploy (web/boot.js): a module that fails to
// load reloads the page once, decided from the live version.json and a
// sessionStorage flag, so it can never loop. No test here has a real deploy,
// so the script runs on stand-ins for the window, the network and the tab's
// storage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../web/boot.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

// The script's functions, run in a bare context (no window), as the tests call them.
const lib = vm.createContext({});
vm.runInContext(code, lib);
const decide = (...a) => vm.runInContext('bootDecide', lib)(...a);
const isFailure = (e) => vm.runInContext('bootIsLoadFailure', lib)(e);

test('a failed module with a newer live version, and no earlier reload, reloads', () => {
  assert.equal(decide(true, 'v1.0.2-bbb', null), 'reload');
  assert.equal(decide(true, 'v1.0.2-bbb', 'v1.0.1-aaa'), 'reload', 'a reload for an older version does not count');
});

test('it never reloads twice for one version, so it cannot loop', () => {
  assert.equal(decide(true, 'v1.0.2-bbb', 'v1.0.2-bbb'), 'stay');
});

test('it stays when nothing failed, or the live version is unknown', () => {
  assert.equal(decide(false, 'v1.0.2-bbb', null), 'stay');
  assert.equal(decide(true, null, null), 'stay');
  assert.equal(decide(true, '', null), 'stay');
  assert.equal(decide(true, 'dev', null), 'stay');
  assert.equal(decide(true, undefined, null), 'stay');
});

test('a module that will not load is told from an ordinary error', () => {
  assert.equal(isFailure({ target: { tagName: 'SCRIPT' } }), true, 'a script file that failed to fetch');
  assert.equal(isFailure({ message: "The requested module './audio.js' does not provide an export named 'rampTo'" }), true);
  assert.equal(isFailure({ reason: new TypeError('Failed to fetch dynamically imported module: https://noodlepads.com/emoji-all.js') }), true);
  assert.equal(isFailure({ message: 'error loading dynamically imported module' }), true, 'Firefox');
  assert.equal(isFailure({ message: "Importing binding name 'x' is not found." }), true, 'Safari');
  assert.equal(isFailure({ message: "Cannot read properties of null (reading 'x')" }), false, 'the app\'s own bug');
  assert.equal(isFailure({ target: { tagName: 'IMG' } }), false);
  assert.equal(isFailure({ reason: 'plain text' }), false);
  assert.equal(isFailure(null), false);
});

// A page: a window that keeps its listeners, a session storage, a network that
// answers version.json, and a count of reloads.
function page({ live = 'v1.0.2-bbb', flag = null, storage = true, offline = false, fetchFails = false, tooOld = false } = {}) {
  const heard = {};
  const kept = new Map(flag === null ? [] : [['noodlepads-boot-reload', flag]]);
  const fetched = [];
  const w = {
    addEventListener: (type, fn) => { heard[type] = fn; },
    sessionStorage: storage ? {
      getItem: (k) => (kept.has(k) ? kept.get(k) : null),
      setItem: (k, v) => { kept.set(k, v); },
    } : undefined,
    fetch: async (url, opts) => {
      fetched.push([url, opts?.cache]);
      if (fetchFails) throw new TypeError('Failed to fetch');
      return {
        ok: true,
        headers: { get: (h) => (offline && h === 'X-Noodle-Offline' ? '1' : null) },
        json: async () => ({ version: live }),
      };
    },
    location: { reload: () => { out.reloads++; } },
  };
  if (!storage) Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('blocked'); } });
  const doc = { documentElement: { hasAttribute: (k) => tooOld && k === 'data-too-old' } };
  w.window = w;
  w.document = doc;
  vm.createContext(w);
  vm.runInContext(code, w);
  const out = { heard, kept, fetched, reloads: 0 };
  // Fires the page's error; lets the promise chain run.
  out.fail = async (e) => {
    heard.error?.(e);
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return out;
}
const MODULE_ERROR = { message: "The requested module './x.js' does not provide an export named 'y'" };

test('a page that meets a module of another version reloads once and remembers it', async () => {
  const p = page();
  await p.fail(MODULE_ERROR);
  assert.equal(p.reloads, 1);
  assert.equal(p.kept.get('noodlepads-boot-reload'), 'v1.0.2-bbb');
  assert.deepEqual(p.fetched, [['version.json', 'no-store']], 'asks the network, not the cache');
});

test('the reloaded page, still broken, does not reload again', async () => {
  const p = page({ flag: 'v1.0.2-bbb' });
  await p.fail(MODULE_ERROR);
  assert.equal(p.reloads, 0);
});

test('one failure asks once, however many modules fail', async () => {
  const p = page();
  await p.fail(MODULE_ERROR);
  await p.fail(MODULE_ERROR);
  await p.fail({ target: { tagName: 'SCRIPT' } });
  assert.equal(p.reloads, 1);
  assert.equal(p.fetched.length, 1);
});

test('an ordinary error in the app reloads nothing and asks nothing', async () => {
  const p = page();
  await p.fail({ message: 'TypeError: x is not a function' });
  assert.equal(p.reloads, 0);
  assert.equal(p.fetched.length, 0);
});

test('offline (the worker answers with the kept version) or with no network, it stays', async () => {
  const a = page({ offline: true });
  await a.fail(MODULE_ERROR);
  assert.equal(a.reloads, 0);
  const b = page({ fetchFails: true });
  await b.fail(MODULE_ERROR);
  assert.equal(b.reloads, 0);
});

test('with no usable session storage it cannot remember, so it never reloads', async () => {
  const p = page({ storage: false });
  await p.fail(MODULE_ERROR);
  assert.equal(p.reloads, 0);
  assert.equal(p.fetched.length, 0);
});

test('a rejected dynamic import is a failure too', async () => {
  const p = page();
  p.heard.unhandledrejection({ reason: new TypeError('Failed to fetch dynamically imported module: x') });
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.reloads, 1);
});

test('a page marked too old gets no reload guard', () => {
  const p = page({ tooOld: true });
  assert.deepEqual(Object.keys(p.heard), []);
});

test('the script is old-browser JavaScript: no let, const, arrows, classes or template strings', () => {
  const body = code.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(body, /\b(let|const|class|async|await)\b|=>|`|\?\.|\?\?/);
});

test('index.html runs it deferred, after the browser floor check and before app.js', () => {
  const floor = html.indexOf('<script defer src="too-old.js"></script>');
  const boot = html.indexOf('<script defer src="boot.js"></script>');
  const app = html.indexOf('<script type="module" src="app.js"></script>');
  assert.ok(floor > 0 && boot > floor && app > boot);
});
