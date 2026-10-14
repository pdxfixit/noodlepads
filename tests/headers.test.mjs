// web/_headers is the security boundary of the live site, so its policy is
// pinned: what it must keep, and that it allows no more than the page loads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../web/_headers', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const value = (name) => headers.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'mi'))?.[1];
const csp = Object.fromEntries(value('Content-Security-Policy').split(';').map((d) => {
  const [name, ...sources] = d.trim().split(/\s+/);
  return [name, sources];
}));

test('the microphone stays allowed for this site only', () => {
  assert.match(value('Permissions-Policy'), /microphone=\(self\)/);
  assert.match(value('Permissions-Policy'), /camera=\(\)/);
});

test('the other hardening headers are still there', () => {
  assert.equal(value('X-Content-Type-Options'), 'nosniff');
  assert.equal(value('Referrer-Policy'), 'same-origin');
  assert.equal(value('Cache-Control'), 'no-cache');
});

test('the policy is closed by default and never allows inline code or eval', () => {
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);
  assert.deepEqual(csp['form-action'], ["'none'"]);
  assert.doesNotMatch(value('Content-Security-Policy'), /unsafe-|\*/);
});

test('the only outside origins are Google Fonts, exactly as index.html uses them', () => {
  assert.deepEqual(csp['style-src'], ["'self'", 'https://fonts.googleapis.com']);
  assert.deepEqual(csp['font-src'], ['https://fonts.gstatic.com']);
  const origins = new Set([...html.matchAll(/(?:href|src)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
  assert.deepEqual([...origins].filter((o) => o !== 'https://fonts.googleapis.com' && o !== 'https://fonts.gstatic.com'), []);
});

test('the tab icon (data:) and downloads (blob:) are allowed images and nothing else is', () => {
  assert.deepEqual(csp['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(csp['connect-src'], ["'self'"]);
});
