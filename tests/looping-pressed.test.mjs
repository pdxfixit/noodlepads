// A looping pad, key or tile says so to a screen reader: aria-pressed="true"
// while its sound loops, and nothing when it does not (a tap only plays it).
// In ✏️ Edit sounds aria-pressed is the pad's "chosen" state, so a loop does
// not touch it there.
// Not tested here: what a screen reader says.

import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { renderPads } from '../web/pads.js';

let page;
let $;
let audio;
const looping = new Set();

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  audio.isLooping = (id) => looping.has(id);
});

afterEach(() => {
  looping.clear();
  if ($('#pads-tab').getAttribute('aria-pressed') !== 'true') $('#pads-tab').dispatch('click');
});

const pad = () => $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);

test('a pad is pressed while it loops, and says nothing before and after', () => {
  const id = pad().dataset.id;
  assert.equal(pad().getAttribute('aria-pressed'), null);
  looping.add(id);
  audio.on.looping(id, true);
  assert.equal(pad().getAttribute('aria-pressed'), 'true');
  assert.ok(pad().classList.contains('looping'));
  looping.delete(id);
  audio.on.looping(id, false);
  assert.equal(pad().getAttribute('aria-pressed'), null);
  assert.ok(!pad().classList.contains('looping'));
});

test('a pad drawn again while its sound loops is still pressed', () => {
  const id = pad().dataset.id;
  looping.add(id);
  renderPads();
  assert.equal(pad().getAttribute('aria-pressed'), 'true');
  assert.ok(pad().classList.contains('looping'));
});

test('in ✏️ Edit sounds a loop leaves the pad\'s chosen state alone', () => {
  const id = pad().dataset.id;
  $('#edit-toggle').dispatch('click');
  try {
    assert.equal(pad().getAttribute('aria-pressed'), 'false', 'not chosen');
    looping.add(id);
    audio.on.looping(id, true);
    assert.equal(pad().getAttribute('aria-pressed'), 'false');
    assert.ok(pad().classList.contains('looping'));
    looping.delete(id);
    audio.on.looping(id, false);
    assert.equal(pad().getAttribute('aria-pressed'), 'false');
  } finally {
    $('#edit-toggle').dispatch('click');
  }
});

test('a ⌨️ key of a looping sound is pressed too', () => {
  $('#live-tab').dispatch('click');
  const key = () => $('#dj-keys').querySelector('[data-code="KeyA"]');
  // Find which sound KeyA plays, by looping each pad's sound until the key lights.
  let found = null;
  for (const p of $('#pads').querySelectorAll('.pad').filter((q) => q.dataset.id)) {
    audio.on.looping(p.dataset.id, true);
    if (key().classList.contains('looping')) { found = p.dataset.id; break; }
    audio.on.looping(p.dataset.id, false);
  }
  assert.ok(found, 'a sound on KeyA');
  assert.equal(key().getAttribute('aria-pressed'), 'true');
  audio.on.looping(found, false);
  assert.equal(key().getAttribute('aria-pressed'), null);
});
