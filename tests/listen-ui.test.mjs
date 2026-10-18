// 🎧 From a song's screens (web/listen-ui.js) in the real app on the
// stand-in page, with a made-up capture and listener through the module's
// test hook (listenEnv): the card in 💃 Grooves (never for 🧸 Kids), what
// to listen to on a computer and on a phone, the live screen drawn from
// snapshots (only the cells that change), What I heard with the beats and
// song it made, opening them, throwing them away, nothing heard, and the
// listen_start and listen_end events. Sound, the browser's sharing and the
// layout need a browser: `just look listen-live` and the other listen-* views.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;
let L;
const events = [];
let frames = [];

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  L = await import('../web/listen-ui.js');
  // Every usage event, as track() hands it on.
  (await import('../web/telemetry.js')).useTelemetry({ track: (e, d) => { events.push([e, d]); return true; } });
  Object.assign(L.listenEnv, {
    frame: (fn) => { frames.push(fn); return frames.length; },
    cancelFrame: () => {},
    printOf: async () => null,
    sources: () => ['tab', 'screen', 'mic', 'file'],
  });
});
beforeEach(() => { events.length = 0; frames = []; if ($('#listen').open) $('#listen').close(); });

const wait = () => new Promise((r) => setTimeout(r, 30));
// One animation frame: what was asked for runs (and asks for the next).
const tick = () => { const due = frames; frames = []; for (const fn of due) fn(); };
const ended = () => events.filter(([e]) => e === 'noodlepads.listen_end').map(([, d]) => d);
const mine = () => state.savedBeats.filter((b) => b.personId === state.personId && / · [A-Z]$/.test(b.name));
const view = () => $('#listen').querySelectorAll('[data-view]').find((v) => !v.hidden)?.dataset.view;

// A capture that hands its callbacks to the test.
function fakeCapture() {
  const cap = { kind: null, stopped: false };
  L.listenEnv.startCapture = async (kind, opts) => {
    Object.assign(cap, { kind, ...opts });
    return { stop() { cap.stopped = true; opts.onEnd('stopped'); }, label: '', sampleRate: 48000 };
  };
  return cap;
}
// A listener whose snapshot is whatever the test sets.
function fakeListener(result) {
  const lis = { fed: 0, snap: null, result, rate: null };
  L.listenEnv.createListener = ({ sampleRate }) => {
    lis.rate = sampleRate;
    return { feed() { lis.fed++; }, snapshot: () => lis.snap, finish: () => lis.result };
  };
  return lis;
}
const cells = (p, upto = 99) => [...p].map((c, i) => (i > upto ? -1 : c === 'x' ? 2 : c === 'o' ? 1 : 0));
const K = ['x.......x.......', 'x.....x.o.x.....', 'x.......x.......'];
const snap = ({ bar, partId, step = 15, parts, tempoChange = null }) => ({
  status: 'listening', seconds: 84, bpm: partId === 'C' ? 120 : 92, signature: '4/4', swing: 0, parts, tempoChange,
  current: { partId, bar, step, recent: {
    kick: K.map((p, i) => cells(p, i === 2 ? step : 99)),
    snare: K.map((_, i) => cells('....x.......x...', i === 2 ? step : 99)),
    hat: K.map((_, i) => cells('x.x.x.x.x.x.x.x.', i === 2 ? step : 99)),
  } },
});
const PARTS = [{ id: 'A', bpm: 92, signature: '4/4', swing: 0, bars: 1 }, { id: 'B', bpm: 92, signature: '4/4', swing: 0, bars: 1 }, { id: 'C', bpm: 120, signature: '4/4', swing: 0, bars: 1 }];
const B16 = (s) => [...s].map((c) => c === 'x');
const part = (p, kick) => ({ ...p, steps: { kick: B16(kick), snare: B16('....x.......x...'), hat: B16('................') }, prints: { kick: null, snare: null, hat: null } });
const RESULT = {
  seconds: 84,
  parts: [part(PARTS[0], 'x.......x.......'), part(PARTS[1], 'x.x.....x.......'), part(PARTS[2], 'x...x...x...x...')],
  order: [{ partId: 'A', startBar: 1, bars: 8 }, { partId: 'B', startBar: 9, bars: 4 }, { partId: 'A', startBar: 13, bars: 8 }, { partId: 'C', startBar: 22, bars: 8 }],
  tempos: [{ bar: 22, bpm: 120 }],
};
const SILENT = { seconds: 9, parts: [], order: [], tempos: [] };

async function openSources() {
  $('#beats-toggle').dispatch('click');
  $('#seq-grooves').dispatch('click');
  $('#listen-open').dispatch('click');
  assert.equal($('#listen').open, true);
  assert.equal($('#grooves').open, false, 'Grooves closes behind it');
}
// Listens to a tab, with the listener's first snapshot drawn.
async function listening(result = RESULT) {
  const cap = fakeCapture();
  const lis = fakeListener(result);
  await openSources();
  $('#listen-sources').querySelector('[data-source="tab"]').dispatch('click');
  await wait();
  return { cap, lis };
}
const feed = (cap, lis, s) => { lis.snap = s; cap.onFrames(new Float32Array(2048), 48000); tick(); };

test('🎧 From a song is a card at the top of 💃 Grooves, with Listen', () => {
  $('#beats-toggle').dispatch('click');
  $('#seq-grooves').dispatch('click');
  const card = $('#listen-card');
  assert.equal(card.hidden, false);
  assert.equal(card.parent, $('#grooves').querySelector('.chooser-body'));
  assert.equal($('#grooves').querySelector('.chooser-body').children[1], card, 'right under the title');
  assert.equal($('#listen-open').textContent, '🎧 Listen');
  assert.match($('#listen-card-about').textContent, /another tab/);
  assert.equal($('#groove-or').textContent, 'Or start from one of these:');
  $('#grooves').close();
});

test('🧸 Kids never sees the card (its level hides it whenever Grooves opens); Regular and Advanced do', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  assert.equal($('#listen-card').hidden, true);
  assert.equal($('#groove-or').hidden, true);
  L.showCard();   // as Grooves opening draws it
  assert.equal($('#listen-card').hidden, true);
  await setSetting('level', 'advanced');
  assert.equal($('#listen-card').hidden, false);
  await setSetting('level', 'regular');
  assert.equal($('#listen-card').hidden, false);
  await page.settle();
});

test('1 · What to listen to: the ways this device has, as large choices, a file through the file picker', async () => {
  await openSources();
  assert.equal(view(), 'sources');
  assert.equal($('#listen-title').textContent, '🎧 From a song');
  const choices = $('#listen-sources').querySelectorAll('[data-source]');
  assert.deepEqual(choices.map((c) => c.dataset.source), ['tab', 'screen', 'mic', 'file']);
  assert.equal(choices[3].tagName, 'LABEL', 'the file choice is the file picker\'s label');
  assert.equal(choices[3].querySelector('input').type, 'file');
  assert.match(choices[3].querySelector('input').accept, /audio\/\*/);
  assert.match($('#listen-how').textContent, /leave Also share tab audio ticked/);
  assert.equal($('#listen').querySelector('.listen-private').textContent, 'The song stays on this device and is never saved. Only the beat is kept.');
  $('#listen').close();
  // A phone: the microphone and a file, and why there is no tab.
  L.listenEnv.sources = () => ['mic', 'file'];
  await openSources();
  assert.deepEqual($('#listen-sources').querySelectorAll('[data-source]').map((c) => c.dataset.source), ['mic', 'file']);
  assert.match($('#listen-how').textContent, /another tab needs Chrome or Edge on a computer/);
  $('#listen').close();
  L.listenEnv.sources = () => ['tab', 'screen', 'mic', 'file'];
  assert.deepEqual(ended(), [], 'nothing started, so nothing ends');
});

test('2 · Listening: the parts so far, the tempo, each instrument\'s last 3 bars labelled, the step just heard ringed', async () => {
  const { cap, lis } = await listening();
  assert.equal(view(), 'listening');
  assert.equal($('#listen').classList.contains('listening'), true, 'the dark sheet');
  assert.equal($('#listen-title').textContent, '🎧 Listening to a tab');
  assert.deepEqual(events.filter(([e]) => e === 'noodlepads.listen_start'), [['noodlepads.listen_start', { source: 'tab' }]]);
  assert.equal(cap.kind, 'tab');
  assert.equal($('#listen-wait').hidden, false, 'Listening… before any bar');
  feed(cap, lis, snap({ bar: 6, partId: 'A', parts: PARTS.slice(0, 1) }));
  assert.equal(lis.rate, 48000, 'the listener hears at the capture\'s rate');
  feed(cap, lis, snap({ bar: 10, partId: 'B', parts: PARTS.slice(0, 2) }));
  feed(cap, lis, snap({ bar: 14, partId: 'A', parts: PARTS.slice(0, 2) }));
  feed(cap, lis, snap({ bar: 24, partId: 'C', step: 9, parts: PARTS, tempoChange: { atBar: 22, from: 92, to: 120 } }));
  assert.equal($('#listen-wait').hidden, true);
  assert.deepEqual($('#listen-chips').children.map((c) => c.textContent), ['A · 92 BPM', 'B · 92 BPM', 'A again', 'C · 120 BPM · listening…']);
  assert.ok($('#listen-chips').children[3].classList.contains('now'));
  assert.equal($('#listen-feel').textContent, '120 BPM · 4/4 · Straight');
  assert.equal($('#listen-time').textContent, '1:24');
  assert.equal($('#listen-change').hidden, false);
  assert.equal($('#listen-change').dataset.text, 'Sped up at bar 22. 92 → 120 BPM, so part C started there.');
  const kick = $('#listen-rows').querySelector('[data-row="kick"]');
  const lines = kick.querySelectorAll('.listen-line');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.querySelector('.ll-long').textContent), ['C · bar 22', 'C · bar 23', 'C · bar 24']);
  assert.deepEqual(lines.map((l) => l.querySelector('.ll-short').textContent), ['22', '23', '24'], 'a phone shows the bar alone');
  assert.ok(lines[0].classList.contains('oldest'));
  const now = lines[2].querySelectorAll('.cell');
  assert.equal(now.length, 16);
  assert.equal(lines[2].querySelectorAll('.listen-beat').length, 4, 'grouped by beat');
  assert.deepEqual(now.map((c) => c.className), [
    'cell v2', 'cell v0', 'cell v0', 'cell v0', 'cell v0', 'cell v0', 'cell v0', 'cell v0',
    'cell v2', 'cell v0 now', 'cell vn', 'cell vn', 'cell vn', 'cell vn', 'cell vn', 'cell vn']);
  assert.ok(lines[1].querySelectorAll('.cell')[8].className === 'cell v1', 'a one-off is dim');
  $('#listen').close();
});

test('a new step redraws only the cells that changed; nothing redraws without new frames', async () => {
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 24, partId: 'C', step: 9, parts: PARTS }));
  let writes = 0;
  for (const c of $('#listen-rows').querySelectorAll('.cell')) {
    const list = c.classList;
    Object.defineProperty(c, 'className', { configurable: true, get: () => list.value, set: (v) => { writes++; list.set = new Set(String(v).split(' ')); } });
  }
  feed(cap, lis, snap({ bar: 24, partId: 'C', step: 10, parts: PARTS }));
  assert.equal(writes, 6, 'per row the ring leaves step 9 and step 10 is played: 2 cells × 3 rows of 144');
  writes = 0;
  tick();
  tick();
  assert.equal(writes, 0, 'frames with nothing new touch nothing');
  $('#listen').close();
});

test('the bar count stepping back at a tempo change holds the bars shown until the new part starts', async () => {
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 22, partId: 'B', parts: PARTS }));
  const label = () => $('#listen-rows').querySelector('[data-row="kick"] .listen-line[data-line="2"] .ll-long').textContent;
  assert.equal(label(), 'B · bar 22');
  feed(cap, lis, snap({ bar: 21, partId: 'B', parts: PARTS }));
  assert.equal(label(), 'B · bar 22', 'held');
  feed(cap, lis, { ...snap({ bar: 21, partId: null, parts: PARTS }), status: 'finding-tempo', current: { partId: null, bar: 21, step: 0, recent: { kick: [], snare: [], hat: [] } } });
  assert.equal(label(), 'B · bar 22', 'held while the new tempo is found');
  assert.equal($('#listen-wait').hidden, true);
  feed(cap, lis, snap({ bar: 23, partId: 'C', parts: PARTS }));
  assert.equal(label(), 'C · bar 23');
  $('#listen').close();
});

test('■ Stop: What I heard, each part a beat in 🗂️ My beats and a 🎼 Song; 🎼 Open it as a song opens it', async () => {
  const before = mine().length;
  const songsBefore = state.songbook.length;
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 24, partId: 'C', parts: PARTS }));
  $('#listen-stop').dispatch('click');
  assert.equal(cap.stopped, true);
  await page.settle();
  assert.equal(view(), 'result');
  assert.equal($('#listen-title').textContent, '🎧 What I heard');
  const made = mine().slice(before);
  assert.equal(made.length, 3);
  const base = made[0].name.replace(/ · A$/, '');
  assert.deepEqual(made.map((b) => b.name).sort(), [`${base} · A`, `${base} · B`, `${base} · C`]);
  const song = state.songbook.at(-1);
  assert.equal(state.songbook.length, songsBefore + 1);
  assert.equal(song.name, base);
  assert.equal(song.tempo, 92);
  assert.deepEqual(song.tempos, [{ bar: 22, bpm: 120 }]);
  assert.equal(song.lanes[0].blocks.length, 4);
  const cards = $('#listen-cards').children;
  assert.deepEqual(cards.map((c) => c.querySelector('.listen-part-name').textContent), [`${base} · A`, `${base} · B`, `${base} · C`]);
  assert.equal(cards[0].querySelector('.listen-part-detail').textContent, '92 BPM · 1 bar · heard twice');
  assert.equal(cards[0].querySelector('[data-hear]').getAttribute('aria-label'), 'Play part A');
  assert.match($('#listen-sounds').textContent, /^Sounds picked to match: 🦶 Kick, 🥁 Snare\./);
  assert.equal($('#listen-as-song').hidden, false);
  assert.equal($('#listen-as-beat').textContent, '🥁 Open part A');
  assert.deepEqual(ended(), [], 'not ended until it is opened, thrown away or closed');
  $('#listen-as-song').dispatch('click');
  assert.equal($('#listen').open, false);
  assert.ok(document.body.classList.contains('screen-song'), '🎼 Song shows');
  assert.equal(state.songs.get(state.personId)?.id, song.id, 'with the song open');
  assert.deepEqual(ended(), [{ source: 'tab', seconds: 84, parts: 3, tempo_changes: 1, outcome: 'song' }]);
});

test('🥁 Open part A opens Beats with that beat; one part makes no song', async () => {
  const one = { ...RESULT, parts: [RESULT.parts[0]], order: [{ partId: 'A', startBar: 1, bars: 8 }], tempos: [] };
  const songsBefore = state.songbook.length;
  const { cap, lis } = await listening(one);
  feed(cap, lis, snap({ bar: 8, partId: 'A', parts: PARTS.slice(0, 1) }));
  $('#listen-stop').dispatch('click');
  await page.settle();
  assert.equal(state.songbook.length, songsBefore, 'no song');
  assert.equal($('#listen-as-song').hidden, true);
  assert.ok($('#listen-as-beat').classList.contains('primary'));
  const beat = mine().at(-1);
  $('#listen-as-beat').dispatch('click');
  assert.ok(document.body.classList.contains('screen-beats'));
  assert.equal(state.patterns.get(state.personId)?.id, beat.id, 'that beat is open');
  assert.equal(ended().at(-1).outcome, 'beat');
});

test('🗑️ Throw away asks first, then deletes the beats and the song it made', async () => {
  const before = mine().length;
  const songsBefore = state.songbook.length;
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 24, partId: 'C', parts: PARTS }));
  $('#listen-stop').dispatch('click');
  await page.settle();
  assert.equal(mine().length, before + 3);
  $('#listen-throw').dispatch('click');
  assert.ok($('#listen-throw').classList.contains('armed'), 'the first tap turns it red');
  assert.equal($('#listen-throw').textContent, '🗑️ Throw away?');
  assert.equal(mine().length, before + 3, 'and keeps everything');
  $('#listen-throw').dispatch('click');
  await page.settle();
  assert.equal($('#listen').open, false);
  assert.equal(mine().length, before);
  assert.equal(state.songbook.length, songsBefore);
  assert.equal(ended().at(-1).outcome, 'thrown');
  assert.equal(ended().length, 1);
});

test('closing What I heard keeps what it made', async () => {
  const before = mine().length;
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 24, partId: 'C', parts: PARTS }));
  $('#listen-stop').dispatch('click');
  await page.settle();
  $('#listen').close();
  assert.equal(mine().length, before + 3);
  assert.equal(ended().at(-1).outcome, 'song', 'it kept a song');
});

test('no beat heard: "I couldn\'t hear a beat in that", nothing saved, Try again goes back to the choices', async () => {
  const before = state.savedBeats.length;
  const { cap, lis } = await listening(SILENT);
  lis.snap = { status: 'finding-tempo', seconds: 9, bpm: null, signature: null, swing: 0, parts: [], current: { partId: null, bar: 1, step: 0, recent: { kick: [], snare: [], hat: [] } }, tempoChange: null };
  cap.onFrames(new Float32Array(2048), 48000);
  tick();
  assert.equal($('#listen-feel').textContent, 'Finding the tempo…');
  $('#listen-stop').dispatch('click');
  await page.settle();
  assert.equal(view(), 'nothing');
  assert.equal($('#listen').querySelector('[data-view="nothing"] .listen-sentence b').textContent, 'I couldn’t hear a beat in that.');
  assert.equal(state.savedBeats.length, before);
  $('#listen-again').dispatch('click');
  assert.equal(view(), 'sources');
  assert.deepEqual(ended(), [{ source: 'tab', seconds: 9, parts: 0, tempo_changes: 0, outcome: 'cancelled' }]);
  $('#listen').close();
  assert.equal(ended().length, 1, 'once');
});

test('closing while it listens stops the capture and cancels; the browser saying no shows why', async () => {
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 6, partId: 'A', parts: PARTS.slice(0, 1) }));
  $('#listen').close();
  assert.equal(cap.stopped, true);
  assert.equal(ended().at(-1).outcome, 'cancelled');
  events.length = 0;
  L.listenEnv.startCapture = async () => { throw new Error('Nothing was shared. Try again: pick the tab playing the song.'); };
  await openSources();
  $('#listen-sources').querySelector('[data-source="tab"]').dispatch('click');
  await wait();
  assert.equal(view(), 'sources');
  assert.equal($('#listen-error').hidden, false);
  assert.match($('#listen-error').textContent, /Nothing was shared/);
  $('#listen').close();
  assert.deepEqual(events, [], 'nothing started, nothing ended');
});

test('a song file: under 20 MB, read through the listener, finished at its end', async () => {
  await openSources();
  const input = $('#listen-file');
  input.files = [{ size: 21 * 1048576, name: 'x.mp3' }];
  input.dispatch('change');
  assert.equal(view(), 'sources');
  assert.match($('#listen-error').textContent, /21\.0 MB\. Choose one under 20 MB/);
  assert.deepEqual(events, [], 'too big: never started');
  const lis = fakeListener(RESULT);
  let signal = null;
  L.listenEnv.readFile = async (file, { onFrames, onProgress, signal: s }) => {
    signal = s;
    lis.snap = snap({ bar: 4, partId: 'A', parts: PARTS.slice(0, 1) });
    onFrames(new Float32Array(2048), 44100);
    onProgress(0.5);
    tick();
    assert.equal($('#listen-time').textContent, '1:24 · 50%');
    return { seconds: 84, sampleRate: 44100, cut: false };
  };
  const again = $('#listen-file');
  again.files = [{ size: 5 * 1048576, name: 'song.mp3' }];
  again.value = 'C:\\fakepath\\song.mp3';
  again.dispatch('change');
  assert.equal(again.value, '', 'the picker lets go of the song at once');
  await page.settle();
  assert.equal(lis.rate, 44100);
  assert.ok(signal, 'it can be stopped early');
  assert.equal(view(), 'result');
  assert.deepEqual(events.filter(([e]) => e === 'noodlepads.listen_start').map(([, d]) => d), [{ source: 'file' }]);
  $('#listen-throw').dispatch('click');
  $('#listen-throw').dispatch('click');
  assert.equal(ended().at(-1).source, 'file');
});

test('once it has heard something, a tap beside the sheet or Esc keeps it listening; ✕ still ends it', async () => {
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 6, partId: 'A', parts: PARTS.slice(0, 1) }));
  const sheet = $('#listen');
  sheet.dispatch('pointerdown');
  sheet.dispatch('click');
  assert.equal(sheet.open, true, 'a tap on the backdrop keeps it');
  assert.equal(cap.stopped, false);
  assert.equal(sheet.dispatch('cancel').defaultPrevented, true, 'Esc keeps it');
  assert.deepEqual(ended(), []);
  sheet.querySelector('[data-close]').dispatch('click');
  assert.equal(sheet.open, false, '✕ closes it');
  assert.equal(cap.stopped, true);
  assert.equal(ended().at(-1).outcome, 'cancelled');
  // Before anything was heard, the backdrop closes it as usual.
  const second = await listening();
  assert.equal(second.lis.fed, 0);
  sheet.dispatch('pointerdown');
  sheet.dispatch('click');
  assert.equal(sheet.open, false);
});

test('▶ on one part while another plays: the new one shows ■, the old one ▶', async () => {
  const { cap, lis } = await listening();
  feed(cap, lis, snap({ bar: 24, partId: 'C', parts: PARTS }));
  $('#listen-stop').dispatch('click');
  await page.settle();
  const keys = () => $('#listen-cards').querySelectorAll('[data-hear]');
  keys()[0].dispatch('click');
  await page.settle();
  assert.deepEqual(keys().map((b) => b.textContent), ['■', '▶', '▶']);
  keys()[1].dispatch('click');
  await page.settle();
  assert.deepEqual(keys().map((b) => b.textContent), ['▶', '■', '▶'], 'part B plays, and says so');
  assert.deepEqual(keys().map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  keys()[1].dispatch('click');
  await page.settle();
  assert.deepEqual(keys().map((b) => b.textContent), ['▶', '▶', '▶'], 'the same ▶ again stops it');
  $('#listen').close();
});
