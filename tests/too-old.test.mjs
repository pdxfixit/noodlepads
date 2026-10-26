// The browser floor (web/too-old.js): a browser older than about Chrome 117,
// Firefox 115 or Safari 16.4 shows a plain notice and the app does not start.
// No test here has an old browser, so the check runs on stand-ins of one,
// with each feature taken away in turn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installPage } from './fake-dom.mjs';

const code = readFileSync(new URL('../web/too-old.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

// What a browser at the floor answers. CSS.supports takes (property, value).
const NEW_CSS = new Set([
  'grid-template-columns: subgrid',
  'color: color-mix(in srgb, red, blue)',
  'container-type: inline-size',
  'height: 100dvh',
]);

// A stand-in window and page; `without` names what this browser lacks.
function browser({ without = [], noCSS = false } = {}) {
  const css = noCSS ? undefined : { supports: (p, v) => NEW_CSS.has(`${p}: ${v}`) && !without.includes(`${p}: ${v}`) };
  const proto = {};
  if (!without.includes('findLast')) proto.findLast = function findLast() {};
  if (!without.includes('at')) proto.at = function at() {};
  const htmlProto = without.includes('inert') ? {} : { inert: false };
  const win = { CSS: css, Array: { prototype: proto }, HTMLElement: { prototype: htmlProto } };
  if (!without.includes('structuredClone')) win.structuredClone = () => {};
  const attrs = {};
  const added = [];
  const doc = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    body: { appendChild: (el) => added.push(el) },
    createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
  };
  win.window = win;
  win.document = doc;
  vm.createContext(win);
  vm.runInContext(code, win);   // as the page runs it: checks, and shows the notice when too old
  return { attrs, added, missing: [...vm.runInContext('tooOldMissing(window)', win)] };   // copied out of the context's realm
}

test('a browser at the floor passes: no notice, and the app starts', () => {
  const b = browser();
  assert.deepEqual(b.missing, []);
  assert.deepEqual(b.added, []);
  assert.equal('data-too-old' in b.attrs, false);
});

test('each feature taken away alone shows the notice and marks the page', () => {
  const each = [
    ['grid-template-columns: subgrid', 'CSS subgrid'],
    ['color: color-mix(in srgb, red, blue)', 'CSS color-mix()'],
    ['container-type: inline-size', 'CSS container queries'],
    ['height: 100dvh', 'CSS dvh'],
    ['findLast', 'Array findLast'],
    ['at', 'Array at'],
    ['structuredClone', 'structuredClone'],
    ['inert', 'inert'],
  ];
  for (const [gone, name] of each) {
    const b = browser({ without: [gone] });
    assert.deepEqual(b.missing, [name], gone);
    assert.equal(b.attrs['data-too-old'], name, 'app.js reads this and does not start');
    assert.equal(b.added.length, 1, gone);
    const [p] = b.added;
    assert.equal(p.tag, 'p');
    assert.equal(p.className, 'notice too-old');
    assert.equal(p.attrs.role, 'alert');
    assert.match(p.textContent, /^This browser is too old for Noodle Pads\. Update it, or open noodlepads\.com in a newer Chrome, Firefox or Safari\.$/);
  }
});

test('a browser with no CSS.supports at all is too old, and nothing throws', () => {
  const b = browser({ noCSS: true });
  assert.deepEqual(b.missing, ['CSS subgrid', 'CSS color-mix()', 'CSS container queries', 'CSS dvh']);
  assert.equal(b.added.length, 1);
});

test('the check is old-browser JavaScript: no let, const, arrows, classes or template strings', () => {
  const body = code.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(body, /\b(let|const|class|async|await)\b|=>|`|\?\.|\?\?/);
});

test('index.html runs the check before app.js: deferred, as a file (the CSP allows no inline script)', () => {
  const check = html.indexOf('<script defer src="too-old.js"></script>');
  const app = html.indexOf('<script type="module" src="app.js"></script>');
  assert.ok(check > 0 && app > check, 'too-old.js comes first; deferred and module scripts run in page order');
});

test('app.js does not start on a page marked too old', async () => {
  console.error = () => {};
  const page = installPage();
  document.documentElement.setAttribute('data-too-old', 'CSS subgrid');
  await (await import('../web/app.js')).ready;
  await page.settle();
  assert.equal(page.$('#pads').children.length, 0, 'nothing is drawn');
  assert.equal(page.$('#people').children.length, 0);
});
