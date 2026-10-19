// DJ's last line: the key colors at the left, then ⏲️ Click track, 🔔 Overlap,
// then ✏️ Edit keys in the corner (Ben, 2026-10-12). The grid places them, and
// keyboard and screen-reader order follow the page, so the page keeps them
// in that order too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const start = html.indexOf('<div class="dj-tail">');
const tail = html.slice(start, html.indexOf('</section>', start));   // to the end of the keys' section

test('Edit keys comes last under the DJ keys, after Click track and Overlap', () => {
  const at = (id) => tail.indexOf(`id="${id}"`);
  assert.ok(at('dj-legend') >= 0 && at('dj-click') >= 0 && at('dj-change') >= 0);
  assert.ok(at('dj-legend') < at('dj-click'), 'the colors, then Click track');
  assert.ok(at('dj-click-tempo') < at('dj-overlap'), 'Click track and its tempo, then Overlap');
  assert.ok(at('dj-overlap') < at('dj-change'), 'Overlap, then ✏️ Layout');
  assert.equal(tail.slice(at('dj-change')).match(/<button/g), null, 'nothing after ✏️ Layout');
});
