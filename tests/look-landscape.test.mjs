// `just look --landscape` and the tap-size check's reach (tools/look.mjs;
// council round 1, the Kids UX seat, 2026-10-27). No test runs Chrome, so this
// asks look.mjs for its plan (`--plan PATH` writes the windows and the
// controls selector and stops). `just look kids-pads kids-beats kids-record
// kids-keys kids-sum --landscape` is the real check, in headless Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const LOOK = join(root, 'tools/look.mjs');

function plan(...args) {
  const dir = mkdtempSync(join(tmpdir(), 'look-plan-'));
  try {
    execFileSync(process.execPath, [LOOK, ...args, '--plan', join(dir, 'plan.json')], { stdio: 'pipe' });
    return JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('--landscape looks at phones held sideways: wider than tall, each at its own height', () => {
  const { sizes } = plan('--landscape');
  const at = (w) => sizes.find((s) => s.width === w);
  assert.equal(at(667).height, 375, 'an iPhone SE or 8');
  assert.equal(at(740).height, 360, 'a common Android');
  assert.equal(at(844).height, 390, 'an iPhone 14');
  for (const s of sizes) {
    assert.ok(s.width > s.height, `${s.width}×${s.height} is landscape`);
    assert.equal(s.mobile, true, 'a phone: touch, no desktop scrollbars');
  }
});

test('without --landscape the windows are the five widths at 800 px, and only under 768 is a phone', () => {
  const { sizes } = plan();
  assert.deepEqual(sizes.map((s) => [s.width, s.height, s.mobile]), [[320, 800, true], [375, 800, true], [700, 800, true], [900, 800, false], [1100, 800, false]]);
  assert.deepEqual(plan('--height', '680').sizes.map((s) => s.height), Array(5).fill(680), '--height is the window\'s height at every width');
});

test('--widths takes a window as WxH, with or without --landscape', () => {
  const { sizes } = plan('--landscape', '--widths', '667x375,812x375');
  assert.deepEqual(sizes.map((s) => [s.width, s.height]), [[667, 375], [812, 375]]);
  assert.deepEqual(plan('--widths', '375,700x500').sizes.map((s) => [s.width, s.height]), [[375, 800], [700, 500]]);
});

test('the tap-size check measures links, text fields and anything tabbable, as well as buttons', () => {
  const { controls } = plan();
  for (const want of ['button', 'summary', 'select', 'textarea', 'a[href]', '[tabindex]:not([tabindex="-1"])', 'input[type="range"]', 'input[type="text"]', 'input:not([type])', 'input[type="number"]']) {
    assert.ok(controls.split(', ').includes(want), `${want} is measured`);
  }
  const src = readFileSync(LOOK, 'utf8');
  assert.match(src, /el\.matches\('a\[href\]'\) && getComputedStyle\(el\)\.display === 'inline'/, 'a link in a line of text is exempt (WCAG 2.5.8)');
  assert.match(src, /cut off by the window/, 'in 🧸 Kids, a control the window cuts off fails the view');
});
