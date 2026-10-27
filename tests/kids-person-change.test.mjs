// 🧸 Kids and a change of person (a link, a sync): what the first kid was
// making ends as theirs before the next kid shows (council, 2026-10-26).
// The mic kept listening, so the next kid's voice landed in the first kid's
// pad, named and pictured from the next kid's sounds; a voice button then
// changed the first kid's sound unseen. A 🎹 tune recording landed its held
// key after the change, and its first note replaced the NEXT kid's tune.
// Not tested here: a real microphone (a stand-in records a few bytes).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

let page;
let $;
let state;
let ctx;
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
  audio.load = async () => {};
  ctx = audio.context();
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
  $('#kids-open').dispatch('click');
  await page.settle();
});

const others = (id) => ['pip', 'juno', 'toby', 'wren'].filter((p) => p !== id);
async function showPerson(id) {
  location.hash = `#${id}`;
  page.winEvent('hashchange');
  await page.settle();
  assert.equal(state.personId, id);
}

test('the mic listening when the person changes stops, and keeps the first kid\'s pad, named from their sounds; a voice tap then changes nothing of theirs', async () => {
  const first = state.personId;
  const next = others(first)[0];
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="record"]').dispatch('click');
  $('#kids-mic').dispatch('pointerdown', { pointerId: 1 });
  await page.settle();
  assert.ok($('#kids-mic').classList.contains('recording'));
  await new Promise((r) => setTimeout(r, 400));
  const before = state.userClips.length;
  await showPerson(next);
  assert.equal($('#kids-mic').classList.contains('recording'), false, 'the mic stopped with the change');
  assert.equal(streams.at(-1).stopped, 1, 'the microphone is let go');
  const made = state.userClips.slice(before);
  assert.equal(made.length, 1);
  assert.equal(made[0].personId, first);
  const { clipsFor } = await import('../web/board.js');
  const theirs = clipsFor(first, { includeHidden: true }).filter((c) => c.id !== made[0].id);
  assert.ok(!theirs.some((c) => c.emoji === made[0].emoji), `a picture the first kid has not got yet (${made[0].emoji})`);
  assert.ok(!theirs.some((c) => c.label === made[0].label), 'a name the first kid has not got yet');
  assert.equal($('#kids-last').hidden, true, 'no last sound on the next kid\'s Record');
  const was = JSON.stringify({ voice: made[0].voice, fx: made[0].fx });
  $('[data-kids-voice="robot"]').dispatch('click');
  await page.settle();
  assert.equal(JSON.stringify({ voice: made[0].voice, fx: made[0].fx }), was, 'a voice tap leaves the first kid\'s sound alone');
  $('[data-kids-voice="robot"]').dispatch('click');   // Normal again
  await showPerson(first);
});

test('a 🎹 tune recording when the person changes lands in the first kid\'s beat, never the next kid\'s', async () => {
  const first = state.personId;
  const next = others(first)[1];
  const scratchOf = (pid) => state.savedBeats.find((b) => b.id === `beat-kidsown-${pid}`);
  const tuneOf = (pid) => scratchOf(pid)?.rows.find((r) => r.melody)?.tune ?? null;
  const nextBefore = JSON.stringify(tuneOf(next));
  $('[data-kids-tab="keys"]').dispatch('click');
  ctx.currentTime = 50;
  $('#kids-rec').dispatch('click');
  await page.settle();
  // The beat's "1" after the 3, 2, 1: a key held from there.
  const bpm = scratchOf(first).bpm;
  ctx.currentTime = 50 + 3 * 60 / bpm;
  page.key('a', { code: 'KeyA' });
  ctx.currentTime += 0.5;
  await showPerson(next);
  assert.equal(JSON.stringify(tuneOf(next)), nextBefore, 'the next kid\'s tune is untouched');
  assert.equal(tuneOf(first)?.length, 1, 'the held key is a note in the first kid\'s tune');
  page.docEvent('keyup', { key: 'a', code: 'KeyA' });
  await showPerson(first);
  ctx.currentTime = 0;
});
