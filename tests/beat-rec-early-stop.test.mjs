// ● Record into the beat (⌨️ Keys on Beats) starts the beat with a count-in,
// once its sounds have loaded. Stopped while they load (■ Stop, Esc, the
// page hidden), the recording ended, but the beat and its count-in started
// anyway once the sounds came, and the 40 ms status timer was never cleared
// (council, audio, 2026-10-26). Now the beat stays stopped.
// Not tested here: the count-in as heard.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOff, newBuilderBeatWithRow } from './new-beat.mjs';

let page;
let $;
let audio;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  audio.play = async () => {};
});

test('■ Stop while the beat\'s sounds load: the recording ends, and the beat never starts', async () => {
  await newBuilderBeatWithRow(page);
  await page.settle();
  const load = audio.load;
  let open;
  const gate = new Promise((r) => { open = r; });
  audio.load = async (clip) => { await gate; return load.call(audio, clip); };
  const intervals = [];
  const setI = globalThis.setInterval;
  const clearI = globalThis.clearInterval;
  globalThis.setInterval = (fn, ms) => { const id = setI(fn, ms); if (ms === 40) intervals.push(id); return id; };
  const live = new Set();
  globalThis.clearInterval = (id) => { live.delete(id); clearI(id); };
  try {
    $('#dj-record').dispatch('click');   // the sounds load…
    assert.equal($('#dj-record').textContent, '■ Stop');
    $('#dj-record').dispatch('click');   // …and it is stopped meanwhile
    assert.equal($('#dj-record').textContent, '● Record');
    open();
    await page.settle();
    for (const id of intervals) live.add(id);
    assert.equal($('#dj-play').getAttribute('aria-pressed') === 'true' || $('#dj-play').textContent.includes('Stop'), false, 'the beat did not start');
  } finally {
    audio.load = load;
    globalThis.setInterval = setI;
    globalThis.clearInterval = clearI;
  }
  assert.equal(intervals.length, 0, 'no 40 ms status timer was left running');
  keysOff(page);
});
