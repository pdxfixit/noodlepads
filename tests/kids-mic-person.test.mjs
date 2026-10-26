// 🧸 Kids' mic and a change of person: the recording is the kid's who was
// recording.
// Not tested here: a real microphone (a stand-in records a few bytes).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let state;
const streams = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  const data = new Float32Array(4800);
  data[2400] = 0.8;
  audio.decode = async () => ({ length: data.length, numberOfChannels: 1, sampleRate: 48000, duration: 0.1, getChannelData: () => data });
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['sound']) }); this.onstop(); }
  };
  globalThis.MediaRecorder = window.MediaRecorder;
  navigator.mediaDevices = { getUserMedia: async () => { const s = { stopped: 0, getTracks() { return [{ stop: () => { s.stopped += 1; } }]; } }; streams.push(s); return s; } };
});

// A person change while the mic listens (a link, a sync): what it heard is
// the kid's who was recording, never the next person's, whose profile may
// sync it to the cloud (2026-10-26).
test('a person change while the mic listens: the new pad is the first kid\'s', async () => {
  $('#kids-open').dispatch('click');
  await page.settle();
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="record"]').dispatch('click');
  const first = state.personId;
  $('#kids-mic').dispatch('pointerdown', { pointerId: 2 });
  await page.settle();
  assert.ok($('#kids-mic').classList.contains('recording'));
  await new Promise((r) => setTimeout(r, 400));
  const other = ['pip', 'juno', 'toby', 'wren'].find((id) => id !== first);
  location.hash = `#${other}`;
  page.winEvent('hashchange');
  await page.settle();
  assert.equal(state.personId, other);
  const before = state.userClips.length;
  $('#kids-mic').dispatch('pointerup', { pointerId: 2 });
  await page.settle();
  const made = state.userClips.slice(before);
  assert.ok(made.every((c) => c.personId === first), JSON.stringify(made.map((c) => c.personId)));
});
