// ⬇️ Save as audio file (Ben, 2026-10-26; docs/design/save-audio.md): a beat
// or a song as a WAV. Pure parts first: how many passes fill 15 s, how much of
// the ring-out is kept, the WAV's header and length, the file's name, and the
// choice between the share sheet and a download. Then the button on the page:
// at Regular and Advanced on Beats and Song, nowhere in 🧸 Kids.
// Not tested here: the real share sheet on a phone, and the sound of the file.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { newBeatWithRow } from './new-beat.mjs';
import { setSetting } from '../web/settings.js';
import {
  encodeWav, audioPasses, audioFileFrames, audioView, audioFileName, AUDIO_MIN_SECONDS, AUDIO_RING_SECONDS,
} from '../web/wav.js';
import { deliveryOf, saveAudio, createAudioSaver } from '../web/download.js';
import { FakeOfflineAudioContext } from './helpers.mjs';

const RATE = 1000;   // a tiny sample rate keeps the buffers small

// An AudioBuffer-shaped render: `seconds` long, two channels, silent but for
// `sounds`, [from, to) in seconds at level 0.5.
function render(seconds, sounds = []) {
  const length = Math.round(seconds * RATE);
  const data = [new Float32Array(length), new Float32Array(length)];
  for (const [from, to] of sounds) for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++) data[0][i] = data[1][i] = 0.5;
  return { numberOfChannels: 2, sampleRate: RATE, length, getChannelData: (c) => data[c] };
}

async function wavOf(buffer) {
  const bytes = new DataView(await encodeWav(buffer).arrayBuffer());
  const text = (at, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => bytes.getUint8(at + i)));
  return {
    riff: text(0, 4), wave: text(8, 4), fmt: text(12, 4), data: text(36, 4),
    size: bytes.byteLength, riffSize: bytes.getUint32(4, true), channels: bytes.getUint16(22, true),
    rate: bytes.getUint32(24, true), bits: bytes.getUint16(34, true), dataSize: bytes.getUint32(40, true),
  };
}

test('a beat plays round in whole passes until the file is at least 15 s', () => {
  assert.equal(AUDIO_MIN_SECONDS, 15);
  assert.equal(audioPasses(2), 8, 'one bar at 120 BPM is 2 s: 8 passes make 16 s');
  assert.equal(audioPasses(2.4), 7, '1 bar at 100 BPM: 7 passes, 16.8 s');
  assert.equal(audioPasses(7.5), 2, 'two passes make exactly 15 s');
  assert.equal(audioPasses(15), 1);
  assert.equal(audioPasses(9.6), 2, '4 bars at 100 BPM: 19.2 s');
  assert.equal(audioPasses(16), 1, 'a long beat is one pass');
  assert.equal(audioPasses(0), 1);
  assert.equal(audioPasses(NaN), 1);
  for (const pass of [0.5, 1.7, 2.4, 3.2, 5, 9.6, 14.9]) assert.ok(audioPasses(pass) * pass >= 15, `${pass} s`);
});

test("a beat's file: the WAV header and length are the passes plus the ring-out", async () => {
  const pass = 2;
  const passes = audioPasses(pass);
  const music = pass * passes * RATE;   // 16 s
  // A hit rings 0.6 s past the end of the last pass.
  const buffer = render(pass * passes + AUDIO_RING_SECONDS, [[0, 0.1], [16 - 0.1, 16.6]]);
  const frames = audioFileFrames(buffer, music, AUDIO_RING_SECONDS * RATE);
  assert.equal(frames, 16600 + 50, 'to the last sound, and a 50 ms breath');
  const wav = await wavOf(audioView(buffer, frames));
  assert.deepEqual([wav.riff, wav.wave, wav.fmt, wav.data], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.equal(wav.channels, 2);
  assert.equal(wav.rate, RATE);
  assert.equal(wav.bits, 16);
  assert.equal(wav.dataSize, frames * 2 * 2);
  assert.equal(wav.size, 44 + wav.dataSize);
  assert.equal(wav.riffSize, wav.size - 8);
  assert.ok(wav.size > 0 && frames / RATE >= 16 && frames / RATE <= 18);
});

test('the ring-out is cut at 2 s, and a silent tail keeps none', () => {
  const music = 16 * RATE;
  const ring = AUDIO_RING_SECONDS * RATE;
  const long = render(18, [[10, 18]]);   // a sound that would ring for ever
  assert.equal(audioFileFrames(long, music, ring), 18 * RATE, 'at most 2 s past the end');
  const dry = render(18, [[0, 1], [15.5, 15.9]]);
  assert.equal(audioFileFrames(dry, music, ring), music, 'nothing rings: the file ends with the music');
  const faint = render(18);
  faint.getChannelData(0)[music + 100] = 0.0005;   // under -60 dB
  assert.equal(audioFileFrames(faint, music, ring), music, 'a whisper is not a ring');
});

test("a song's file is the song once through, then the ring-out", async () => {
  const song = 47.3;   // seconds, as planSong counts it
  const music = Math.ceil(song * RATE);
  const buffer = render(song + AUDIO_RING_SECONDS, [[0, 3], [song - 0.2, song + 1.1]]);
  const frames = audioFileFrames(buffer, music, AUDIO_RING_SECONDS * RATE);
  assert.equal(frames, Math.round((song + 1.1) * RATE) + 50);
  const wav = await wavOf(audioView(buffer, frames));
  assert.equal(wav.dataSize, frames * 4);
  assert.equal(wav.size, 44 + frames * 4);
  assert.equal(wav.rate, RATE);
});

test('the file is named as on screen, without anything a file name cannot hold', () => {
  assert.equal(audioFileName('Biscuit (House version)'), 'Biscuit (House version).wav');
  assert.equal(audioFileName('Wobbly Thunder'), 'Wobbly Thunder.wav');
  assert.equal(audioFileName('🌀 Wonky: a/b\\c*d?"e<f>g|h'), 'Wonky abcdefgh.wav');
  assert.equal(audioFileName("Pip's  beat_1-2"), "Pip's beat_1-2.wav");
  assert.equal(audioFileName('Ünï Çødé'), 'Ünï Çødé.wav');
  assert.equal(audioFileName('A very very long beat name indeed'), 'A very very long beat na.wav', '24 characters');
  assert.equal(audioFileName('🎼🎼'), 'Noodle Pads.wav', 'nothing left: a plain name');
  assert.equal(audioFileName(undefined), 'Noodle Pads.wav');
});

// ── Share sheet or download ──

const file = {};
const touch = { matches: false };
const mouse = { matches: true };
const media = (m) => (q) => (q === '(pointer: fine)' ? m : { matches: false });
const sharer = (over = {}) => ({ canShare: () => true, share: async () => {}, ...over });

test('a touch device whose browser can share the file shares it; everything else downloads', () => {
  assert.equal(deliveryOf(file, sharer(), media(touch)), 'share');
  assert.equal(deliveryOf(file, sharer(), media(mouse)), 'download', 'a computer downloads');
  assert.equal(deliveryOf(file, sharer({ canShare: () => false }), media(touch)), 'download', 'the browser cannot share a file');
  assert.equal(deliveryOf(file, { share: async () => {} }, media(touch)), 'download', 'no canShare: it cannot say');
  assert.equal(deliveryOf(file, { canShare: () => true }, media(touch)), 'download', 'no share');
  assert.equal(deliveryOf(file, undefined, media(touch)), 'download', 'no navigator');
});

// downloadBlob needs a page: a stand-in link that counts its clicks.
function withDownloads(fn) {
  return async () => {
    const saved = [];
    const had = { document: globalThis.document, URL_create: URL.createObjectURL };
    globalThis.document = { createElement: () => ({ click() { saved.push(this.download); } }) };
    URL.createObjectURL = () => 'blob:test';
    try { await fn(saved); } finally {
      globalThis.document = had.document;
      URL.createObjectURL = had.URL_create;
    }
  };
}

test('saveAudio opens the share sheet with the file where it can, else downloads it', withDownloads(async (saved) => {
  const calls = [];
  const nav = sharer({ share: async (data) => { calls.push(data); } });
  const blob = new Blob(['x'], { type: 'audio/wav' });
  assert.equal(await saveAudio(blob, 'Biscuit.wav', { navigator: nav, matchMedia: media(touch) }), 'shared');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].files[0].name, 'Biscuit.wav');
  assert.equal(calls[0].files[0].type, 'audio/wav');
  assert.equal(calls[0].title, 'Biscuit');
  assert.deepEqual(saved, [], 'no download');
  assert.equal(await saveAudio(blob, 'Biscuit.wav', { navigator: nav, matchMedia: media(mouse) }), 'downloaded');
  assert.deepEqual(saved, ['Biscuit.wav']);
  assert.equal(calls.length, 1, 'a computer never opens the sheet');
}));

test('closing the sheet is quiet, a stale tap asks for another, any other trouble downloads', withDownloads(async (saved) => {
  const blob = new Blob(['x']);
  const fails = (name) => sharer({ share: async () => { throw Object.assign(new Error(name), { name }); } });
  assert.equal(await saveAudio(blob, 'A.wav', { navigator: fails('AbortError'), matchMedia: media(touch) }), 'cancelled');
  assert.equal(await saveAudio(blob, 'A.wav', { navigator: fails('NotAllowedError'), matchMedia: media(touch) }), 'again');
  assert.deepEqual(saved, [], 'neither saves a thing');
  assert.equal(await saveAudio(blob, 'A.wav', { navigator: fails('DataError'), matchMedia: media(touch) }), 'downloaded');
  assert.deepEqual(saved, ['A.wav']);
  assert.equal(await saveAudio(blob, 'B.wav', { navigator: fails('NotAllowedError'), matchMedia: media(touch), download: true }), 'downloaded');
  assert.deepEqual(saved, ['A.wav', 'B.wav'], 'download: true skips the sheet');
}));

// The button: a stand-in with the bits the saver uses.
function fakeButton(text) {
  const attrs = { 'aria-label': 'Save as audio file' };
  const b = {
    textContent: text, disabled: false, handler: null,
    getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; },
    addEventListener: (type, fn) => { b.handler = fn; },
    tap: () => b.handler(),
  };
  return b;
}

test('a refused sheet turns the button into 📤 Send; the next tap opens it at once', withDownloads(async (saved) => {
  const button = fakeButton('⬇️ Audio file');
  const lines = [];
  const events = [];
  let refuse = true;
  const nav = sharer({ share: async () => { if (refuse) throw Object.assign(new Error('late'), { name: 'NotAllowedError' }); } });
  const made = { blob: new Blob(['x']), name: 'Biscuit.wav', seconds: 16.4 };
  let renders = 0;
  const saver = createAudioSaver({
    button, say: (t) => lines.push(t), done: (how) => events.push(how),
    make: async () => { renders++; return made; },
    env: { navigator: nav, matchMedia: media(touch) },
  });
  await button.tap();
  assert.equal(button.textContent, '📤 Send');
  assert.equal(button.getAttribute('aria-label'), 'Send Biscuit.wav');
  assert.match(lines.at(-1), /Biscuit\.wav” is ready/);
  assert.deepEqual(events, []);
  refuse = false;
  await button.tap();
  assert.equal(renders, 1, 'the file was made once');
  assert.equal(button.textContent, '⬇️ Audio file', 'the button is itself again');
  assert.equal(button.getAttribute('aria-label'), 'Save as audio file');
  assert.equal(lines.at(-1), '📤 Shared “Biscuit.wav” (16.4 s).');
  assert.deepEqual(events, ['share']);
  assert.deepEqual(saved, []);
  // A file left waiting is forgotten with reset.
  refuse = true;
  await button.tap();
  assert.equal(button.textContent, '📤 Send');
  saver.reset();
  assert.equal(button.textContent, '⬇️ Audio file');
}));

test('the button downloads on a computer and says where to find the file', withDownloads(async (saved) => {
  const button = fakeButton('⬇️ Audio file');
  const lines = [];
  const events = [];
  createAudioSaver({
    button, say: (t) => lines.push(t), done: (how) => events.push(how),
    make: async () => ({ blob: new Blob(['x']), name: 'Wobbly Thunder.wav', seconds: 15.5 }),
    env: { navigator: sharer(), matchMedia: media(mouse) },
  });
  await button.tap();
  assert.deepEqual(saved, ['Wobbly Thunder.wav']);
  assert.equal(lines[0], 'Making the file…');
  assert.equal(lines.at(-1), '⬇️ Saved “Wobbly Thunder.wav” (15.5 s). Find it in your downloads.');
  assert.deepEqual(events, ['download']);
  assert.equal(button.disabled, false);
}));

test('nothing to hear: the button says so and saves nothing', withDownloads(async (saved) => {
  const button = fakeButton('⬇️ Audio file');
  const lines = [];
  createAudioSaver({ button, say: (t) => lines.push(t), make: async () => null, env: { matchMedia: media(mouse) } });
  await button.tap();
  assert.deepEqual(saved, []);
  assert.equal(button.disabled, false, 'it can be tapped again');
}));

// ── On the page ──

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

test('⬇️ Audio file sits beside 🔊 As a sound on Beats and Song, in one row with 📥 Load', async () => {
  const row = $('#lib-sound').parentElement;
  assert.ok(row.classList.contains('lib-sound-row'));
  const ids = row.children.map((c) => c.id || c.querySelector?.('input')?.id);
  assert.deepEqual(ids, ['lib-sound', 'lib-audio', 'lib-file'], 'three buttons, one row');
  assert.equal($('#lib-audio').textContent, '⬇️ Audio file');
  assert.equal($('#lib-audio').getAttribute('aria-label'), 'Save as audio file');
  const deck = $('#song-sound').parentElement;
  assert.deepEqual(deck.children.map((c) => c.id), ['song-sound', 'song-audio'], 'Song: the pair side by side');
  assert.ok(!$('#kids').querySelector('#lib-audio') && !$('#kids').querySelector('#song-audio'), '🧸 Kids has no such button');
  assert.ok(!$('#kids').querySelector('#lib-sound') && !$('#kids').querySelector('#song-sound'));
});

test('the same button at Regular and at Advanced, enabled once a beat is open', async () => {
  newBeatWithRow(page);
  for (const advanced of [false, true]) {
    await setSetting('advancedBeats', advanced);
    document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
    assert.equal($('#lib-audio').disabled, false, `advanced ${advanced}`);
    assert.equal($('#lib-sound').disabled, false);
    $('#library').close();
  }
  await setSetting('advancedBeats', false);
});

test('a beat with nothing to hear says so, and a card saves its beat file with 📄', async () => {
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const had = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  try {
    $('#lib-audio').dispatch('click');
    await page.settle();
  } finally { globalThis.OfflineAudioContext = had; }
  assert.match($('#lib-note').textContent, /^Turn on some pills first, then save it as an audio file\.$/);
  assert.equal($('#lib-audio').disabled, false, 'it can be tapped again');
  assert.ok($('#lib-list').querySelector('[data-export]').textContent === '📄', 'the card’s beat-file button is 📄, so ⬇️ always means the audio file');
  assert.match($('#lib-list').querySelector('[data-export]').getAttribute('aria-label'), /^Save .* as a beat file$/);
  $('#library').close();
});
