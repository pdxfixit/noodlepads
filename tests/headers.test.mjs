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

test('the microphone and screen sharing stay allowed for this site only', () => {
  assert.match(value('Permissions-Policy'), /microphone=\(self\)/);
  // 🎧 From a song listens to another tab, or the whole screen's sound.
  assert.match(value('Permissions-Policy'), /display-capture=\(self\)/);
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

test('no outside origin at all: the fonts are served from this site', () => {
  assert.deepEqual(csp['style-src'], ["'self'"]);
  assert.deepEqual(csp['font-src'], ["'self'"]);
  assert.doesNotMatch(headers, /googleapis|gstatic/);
  // What the page loads: <link href> and src. A plain <a href> (the privacy policy) loads nothing.
  const origins = new Set([...html.matchAll(/(?:<link\b[^>]*\bhref|\bsrc)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
  assert.deepEqual([...origins], []);
});

test('fonts.css names only font files that are in web/fonts/, and index.html loads it', () => {
  assert.match(html, /<link rel="stylesheet" href="fonts\/fonts\.css">/);
  const fonts = readFileSync(new URL('../web/fonts/fonts.css', import.meta.url), 'utf8');
  const urls = [...fonts.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 5, 'every subset of both fonts');
  for (const u of urls) {
    assert.match(u, /^[a-z0-9-]+\.woff2$/, `${u}: a file beside fonts.css`);
    const bytes = readFileSync(new URL(`../web/fonts/${u}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${u} is a WOFF2 file`);
  }
  for (const family of ['Anybody', 'Atkinson Hyperlegible Next']) assert.match(fonts, new RegExp(`font-family: '${family}'`));
  for (const license of ['OFL-anybody.txt', 'OFL-atkinson-next.txt']) {
    assert.match(readFileSync(new URL(`../web/fonts/${license}`, import.meta.url), 'utf8'), /SIL Open Font License, Version 1\.1/);
  }
});

test('the tab icon (data:) and downloads (blob:) are allowed images and nothing else is', () => {
  assert.deepEqual(csp['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(csp['connect-src'], ["'self'"]);
});
