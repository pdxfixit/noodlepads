// The tab-audio check page (web/check-tab-audio.html): when it says
// "Hearing sound ✓", and that the page keeps to the CSP and reads. Sharing a
// real tab cannot run here; Ben opens the live page in Chrome for that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME } from '../web/listen-input.js';
import { hear, HEARD_FRAMES, browserSaid } from '../web/check-tab-audio.js';
import { contrastRatio } from '../web/contrast.js';

test('heard after a third of a second of sound, never on silence', () => {
  let s = { frames: 0, loud: 0, heard: false };
  for (let i = 0; i < 100; i++) s = hear(s, new Float32Array(FRAME));
  assert.equal(s.heard, false);
  const loud = new Float32Array(FRAME).fill(0.2);
  for (let i = 0; i < HEARD_FRAMES - 1; i++) s = hear(s, loud);
  assert.equal(s.heard, false);
  s = hear(s, loud);
  assert.equal(s.heard, true);
  s = hear(s, new Float32Array(FRAME));
  assert.equal(s.heard, true, 'stays heard');
});

test("the browser's words show only when the browser said something", () => {
  const err = (name, message) => new Error('a sentence', { cause: Object.assign(new Error(message), { name }) });
  assert.equal(browserSaid(err('NotAllowedError', 'Permission denied')), 'What the browser said (NotAllowedError: Permission denied)');
  assert.equal(browserSaid(err('AbortError', '')), 'What the browser said (AbortError)');
  assert.equal(browserSaid(err('NoAudio', 'NoAudio')), '', 'no sound came: the browser said nothing');
  assert.equal(browserSaid(err('Unsupported', 'Unsupported')), '');
  assert.equal(browserSaid(new Error('plain')), '');
});

test('its own script and styles only, every id it uses is there, its colors read', () => {
  const html = readFileSync(new URL('../web/check-tab-audio.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../web/check-tab-audio.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../web/check-tab-audio.css', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]), ['<script type="module" src="check-tab-audio.js">']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline event handlers (the CSP)');
  assert.doesNotMatch(html, /\sstyle\s*=|<style/i, 'no inline style (the CSP)');
  assert.match(html, /<button[^>]*id="share"[^>]*>🗂️ Share a tab's sound<\/button>/);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, id] of js.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.has(id), `#${id} is in check-tab-audio.html`);
  const color = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
  const pairs = [
    ['#FFFFFF', color('board')], [color('soft'), color('board')], ['#FFFFFF', color('board-deep')], [color('soft'), color('board-deep')],
    [color('ink'), color('led')], [color('ink'), color('heard')], ['#FFFFFF', color('record')],
  ];
  for (const [fg, bg] of pairs) assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}: ${contrastRatio(fg, bg).toFixed(2)}`);
});
