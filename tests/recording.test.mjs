// Recording in the sound sheet, with a stand-in microphone: the 3-2-1 count
// before it listens, calling it off during the count, and the tip after a
// recording that was too quiet or too loud. Nothing is heard; the decoded
// recording is whatever the test hands audio.decode.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } from './helpers.mjs';

let page, $, audio, sheet;
const recorders = [];
const asked = [];   // what each recording asked the microphone for
let decoded = null;   // what the next recording decodes to

before(async () => {
  console.error = () => {};
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  const track = { stop() {} };
  globalThis.navigator.mediaDevices = { getUserMedia: async (constraints) => { asked.push(constraints); return { getTracks: () => [track] }; } };
  class FakeRecorder {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this); }
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['x']) }); this.onstop(); }
  }
  window.MediaRecorder = FakeRecorder;
  globalThis.MediaRecorder = FakeRecorder;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  sheet = await import('../web/sheet.js');
  sheet.COUNT_IN.ms = 5;
  const ctx = audio.context();
  ctx.createMediaStreamSource = () => ({ connect() {}, disconnect() {} });
  ctx.createAnalyser = () => ({ connect() {}, fftSize: 0, getFloatTimeDomainData() {} });
  audio.decode = async () => decoded;
  audio.start = () => {};
  audio.stop = () => {};
});

function openNew() {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#sheet').open, true);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for the 3-2-1 count to end and the stand-in recorder to listen. A
// fixed 60 ms wait lost that race on a busy machine: the count's timers came
// late, so Stop landed during the count and called the recording off ("Tap
// Record…" where the test wanted the quiet-recording tip).
async function until(done, what) {
  const by = Date.now() + 10_000;
  while (!done()) {
    assert.ok(Date.now() < by, `still waiting after 10 s: ${what}`);
    await wait(2);
  }
}
const untilListening = () => until(() => recorders.at(-1)?.state === 'recording', 'the count to end and the recorder to listen');

test('Record counts 3, 2, 1 before it listens', async () => {
  openNew();
  recorders.length = 0;
  $('#rec-btn').dispatch('click');
  await wait(1);
  assert.equal($('#rec-label').textContent, '3');
  assert.match($('#rec-status').textContent, /Get ready… 3/);
  assert.equal(recorders[0].state, 'inactive', 'not listening during the count');
  await untilListening();
  assert.equal($('#rec-label').textContent, 'Stop');
  assert.deepEqual(asked.at(-1), { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }, 'raw: no echo cancelling, noise suppression or auto-gain (Ben, 2026-10-26)');
  $('#sheet').close();
});

test('tapping Record during the count calls it off, keeping nothing', async () => {
  openNew();
  recorders.length = 0;
  $('#rec-btn').dispatch('click');
  await wait(1);
  $('#rec-btn').dispatch('click');
  await wait(60);
  assert.equal(recorders[0].state, 'inactive', 'it never started');
  assert.equal($('#rec-label').textContent, 'Record');
  assert.equal($('#rec-btn').getAttribute('aria-pressed'), 'false');
  assert.match($('#rec-status').textContent, /Tap Record/);
  $('#sheet').close();
});

async function recordAndStop(samples) {
  openNew();
  decoded = fakeBuffer([samples], 8000);
  $('#rec-btn').dispatch('click');
  await untilListening();
  $('#rec-btn').dispatch('click');
  // The blob read and decode are not timers, so settle() alone could return
  // while the note still says it is saving.
  await until(() => !/Saving the recording/.test($('#rec-status').textContent), 'the recording to be read');
  await page.settle();
  return $('#rec-status').textContent;
}

test('a very quiet recording says to move closer; a clipped one to move back; a good one says nothing extra', async () => {
  const wave = (level) => Array.from({ length: 4000 }, (_, i) => Math.sin(i / 5) * level);
  assert.match(await recordAndStop(wave(0.04)), /very quiet\. Move closer next time/);
  $('#sheet').close();
  assert.match(await recordAndStop(wave(1)), /so loud it crackled\. Move back next time/);
  $('#sheet').close();
  const fine = await recordAndStop(wave(0.6));
  assert.match(fine, /Now try a voice!/);
  assert.doesNotMatch(fine, /quiet|loud/);
  $('#sheet').close();
});
