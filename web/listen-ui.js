// 🎧 From a song's screens (docs/design/beat-from-a-song.md, "The screens";
// the mockups Ben said yes to, 2026-10-18). A blue card at the top of 💃
// Grooves opens one sheet with four views:
//   sources    1 · What to listen to: the ways this device can listen
//              (listen-input.js sources()), as large choices
//   listening  2 · Listening, live: ● the time, ■ Stop, the parts so far,
//              the tempo, signature and swing, and each instrument's last
//              3 bars rolling (2 on a phone), drawn from the listener's
//              snapshot() at most once an animation frame, changing only the
//              cells that changed
//   result     3 · What I heard: a sentence, a card per part with ▶, the
//              sounds picked, 🎼 Open it as a song, 🥁 Open part A, 🗑️ Throw away
//   nothing    "I couldn't hear a beat in that", with Try again
// At ■ Stop each part becomes a beat in 🗂️ My beats, and two or more also
// a 🎼 Song, through the app's own saving (so they sync, back up and show
// everywhere); 🗑️ Throw away deletes them again. The pure parts are
// listen-make.js. Regular and Advanced only: 🧸 Kids never sees the card.
//
// The song itself is never kept or sent: frames go from the capture
// (listen-input.js) into the listener (listen.js) and are dropped.
//
// The test hook: `listenEnv` holds what this module uses from outside
// (the inputs, the listener, the animation frame, the kit's prints). The
// tests and `just look` swap in fakes, since neither has a song to hear.
// Nothing in the app changes it.

import { sources, startCapture, readFile, fileTooBig, MAX_SONG_FILE_BYTES } from './listen-input.js';
import { createListener, fingerprint } from './listen.js';
import {
  ROWS, ROW_LOOK, ROW_SOUNDS, ALL_ROW_SOUNDS, clock, rollView, beatGroups, lineLabel, heardParts, partChips,
  tempoLine, feelLine, pickSounds, heardABeat, makeBeats, makeSong, heardSentence, partDetail, resultCounts,
} from './listen-make.js';
import { openDialog, setupDialog } from './dialogs.js';
import { getSetting, onSetting } from './settings.js';
import { logEvent } from './log.js';
import { track } from './telemetry.js';
import { newId } from './util.js';

export const listenEnv = {
  sources: () => sources(),
  startCapture: (kind, opts) => startCapture(kind, opts),
  readFile: (file, opts) => readFile(file, opts),
  createListener: (opts) => createListener(opts),
  frame: (fn) => globalThis.requestAnimationFrame(fn),
  cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
  printOf: null,    // (kitId) => Promise<print | null>, in place of decoding the kit's clips
};

// The ways to listen, as the first view offers them.
export const SOURCE_LOOK = {
  tab: { emoji: '🗂️', name: 'Another tab', about: 'A music site, or any site, playing in Chrome or Edge. The clearest sound.', title: 'Listening to a tab' },
  screen: { emoji: '🖥️', name: 'Everything on this computer', about: 'For a music app outside the browser. Other sounds get in too.', title: 'Listening to this computer' },
  mic: { emoji: '🎤', name: 'The microphone', about: 'Play the song out loud nearby. Works everywhere, phones too.', title: 'Listening' },
  file: { emoji: '📁', name: 'A song file', about: `An MP3 or other audio or video file on this device, under ${MAX_SONG_FILE_BYTES / 1048576} MB.`, title: 'Listening to a file' },
};
const WAITING = {
  tab: 'Pick the tab playing the song in the browser’s box, and leave Also share tab audio ticked. Then press play there.',
  screen: 'Pick Entire screen in the browser’s box, and tick Also share system audio. Then play the song.',
  mic: 'Say yes when the browser asks to use the microphone, then play the song out loud nearby.',
  file: 'Reading the file…',
};
// What to try after hearing no beat, for the way it listened: a phone has
// no other tab, so it never hears about one.
const NOTHING_TIP = {
  tab: 'Try a song with drums, played a little louder. Check Also share tab audio was ticked in the browser’s box.',
  screen: 'Try a song with drums, played a little louder. Check Also share system audio was ticked in the browser’s box.',
  mic: 'Try a song with drums, played a little louder and closer to the microphone.',
  file: 'Try a song with drums.',
};
const ARM_MS = 3000;   // how long 🗑️ Throw away? waits for its second tap

const LINES = 3;       // bars shown per instrument (2 on a phone: styles.css)

let deps = null;
const el = {};
// One go at listening, from a source picked to the sheet closing:
// { kind, capture, abort, listener, heard, view, finished, result, made, ended, cancelled }
let session = null;
let frameId = 0;
let dirty = false;
let armTimer = 0;
const prints = new Map();   // audio.key(clip) → Promise<print | null>, for the visit

const $ = (sel) => document.querySelector(sel);
const make = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};
// Writes text only when it changed, so a frame touches nothing that stayed.
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const setHidden = (node, hidden) => { if (node.hidden !== hidden) node.hidden = hidden; };

// ── The card in 💃 Grooves ──

// Hidden for 🧸 Kids, even with a grown-up let into the regular app.
export function showCard() {
  if (!el.card) return;
  const kids = getSetting('level') === 'kids';
  el.card.hidden = kids;
  el.or.hidden = kids;
  el.cardAbout.textContent = listenEnv.sources().includes('tab')
    ? 'Play a song in another tab, or near the mic. Its beat appears here as it plays.'
    : 'Play a song out loud nearby, or pick a song file. Its beat appears here as it plays.';
}

// ── Views ──

function showView(name, title) {
  for (const v of el.dialog.querySelectorAll('[data-view]')) setHidden(v, v.dataset.view !== name);
  el.dialog.classList.toggle('listening', name === 'listening');
  el.title.textContent = title;
}

// 1 · What to listen to.
function showSources(error = '') {
  const kinds = listenEnv.sources();
  el.sources.replaceChildren(...kinds.map((kind) => {
    const look = SOURCE_LOOK[kind];
    // A file goes through the browser's own file picker: the choice is its label.
    const choice = make(kind === 'file' ? 'label' : 'button', 'listen-source');
    if (kind !== 'file') choice.type = 'button';
    choice.dataset.source = kind;
    const pic = make('span', 'listen-source-pic', look.emoji);
    pic.setAttribute('aria-hidden', 'true');
    const text = make('span', 'listen-source-text');
    text.append(make('span', 'listen-source-name', look.name), make('span', 'listen-source-about', look.about));
    choice.append(pic, text);
    if (kind === 'file') {
      const input = make('input');
      input.type = 'file';
      input.accept = 'audio/*,video/*';
      input.id = 'listen-file';
      choice.append(input);
    }
    return choice;
  }));
  el.how.textContent = kinds.includes('tab')
    ? 'Next, your browser asks which tab. Pick the one playing the song and leave Also share tab audio ticked. Then press play there.'
    : 'Listening to a music site in another tab needs Chrome or Edge on a computer. Here, play it out loud and use the microphone.';
  el.error.textContent = error;
  el.error.hidden = !error;
  showView('sources', '🎧 From a song');
}

export function openListen(from) {
  if (el.dialog.open) return;
  session = null;
  showSources();
  openDialog(el.dialog, from ? { returnTo: () => from } : undefined);
}

// ── Listening ──

function startSession(kind) {
  deps.stopAll?.();   // the app's own sound would be heard too
  session = { kind, capture: null, abort: null, listener: null, heard: [], view: null, finished: false, result: null, made: null, ended: false, cancelled: false, progress: null };
  buildRows();
  setText(el.time, '0:00');
  el.chips.replaceChildren();
  el.chipsKey = '';
  el.partsLabel.hidden = true;
  el.change.hidden = true;
  el.change.replaceChildren();
  delete el.change.dataset.text;
  setText(el.feel, '');
  setText(el.wait, WAITING[kind]);
  el.wait.hidden = false;
  el.lines.forEach((l) => { l.hidden = true; });
  showView('listening', `🎧 ${SOURCE_LOOK[kind].title}`);
  el.stop.focus?.();
  return session;
}

// Frames from the capture or the file, into the listener.
function framesFor(s) {
  return (frames, sampleRate) => {
    if (s !== session || s.finished) return;
    s.listener ??= listenEnv.createListener({ sampleRate });
    s.listener.feed(frames);
    dirty = true;
  };
}

function began(s) {
  track('noodlepads.listen_start', { source: s.kind });
  logEvent('listen', { action: 'start', source: s.kind });
  if (s.kind !== 'file') setText(el.wait, 'Listening… the beat shows here in a few seconds.');
  loop();
}

async function listenTo(kind) {
  const s = startSession(kind);
  try {
    const capture = await listenEnv.startCapture(kind, {
      context: deps.audio?.wake?.(),
      onFrames: framesFor(s),
      onEnd: () => { if (s === session) finish(); },
    });
    if (s !== session || s.cancelled) { capture.stop(); return; }
    s.capture = capture;
    began(s);
  } catch (err) {
    if (s !== session) return;
    session = null;
    showSources(err?.message || "Listening couldn't start. Try again.");
  }
}

async function listenToFile(file) {
  if (file.size > MAX_SONG_FILE_BYTES) { showSources(fileTooBig(file.size)); return; }
  const s = startSession('file');
  s.abort = new AbortController();
  began(s);
  try {
    await listenEnv.readFile(file, {
      onFrames: framesFor(s),
      onProgress: (p) => { s.progress = p; dirty = true; },
      signal: s.abort.signal,
    });
    if (s === session && !s.cancelled) finish();
  } catch (err) {
    if (s !== session) return;
    stopLoop();
    session = null;
    end(s, 'cancelled');
    showSources(err?.message || "That file couldn't be read. Try another.");
  }
}

// The live screen, at most once an animation frame, when frames came.
function loop() {
  frameId = listenEnv.frame(() => {
    if (!session || session.finished) return;
    if (dirty && session.listener) { dirty = false; draw(session.listener.snapshot()); }
    loop();
  });
}
function stopLoop() {
  if (frameId) listenEnv.cancelFrame(frameId);
  frameId = 0;
}

// One instrument row per kind, each with LINES bar lines (built again
// when the bar's length changes).
function buildRows() {
  el.rows.replaceChildren();
  el.lines = [];
  el.cells = {};
  el.built = 0;
  for (const row of ROWS) {
    const box = make('div', 'listen-row');
    box.dataset.row = row;
    const head = make('div', 'listen-row-head');
    const pic = make('span', 'listen-row-pic', ROW_LOOK[row].emoji);
    pic.setAttribute('aria-hidden', 'true');
    // The closest sound comes from the hits' fingerprints, which the
    // listener hands over only at the end (finish()).
    head.append(pic, make('span', 'listen-row-name', ROW_LOOK[row].name), make('span', 'listen-row-sound', 'its sound is picked at ■ Stop'));
    const lines = make('div', 'listen-lines');
    box.append(head, lines);
    el.rows.append(box);
    el.cells[row] = [];
    for (let i = 0; i < LINES; i++) {
      const line = make('div', 'listen-line');
      line.dataset.line = String(i);
      line.hidden = true;
      lines.append(line);
      el.lines.push(line);
      el.cells[row].push({ line, bar: null, cells: [], was: [] });
    }
  }
}

// The cells of every line, for bars `count` pills long, grouped by beat.
function buildCells(count, signature) {
  const groups = beatGroups(signature, count);
  for (const row of ROWS) {
    for (const slot of el.cells[row]) {
      const label = make('span', 'listen-line-label');
      const long = make('span', 'll-long');
      const short = make('span', 'll-short');
      label.append(long, short);
      const bar = make('span', 'listen-bar');
      slot.cells = [];
      slot.was = [];
      for (const g of groups) {
        const beat = make('span', 'listen-beat');
        // A beat's width follows its steps, so 7/8's group of six is as
        // wide as six steps, not squeezed into the width of four.
        beat.style.setProperty('--n', String(g));
        for (let k = 0; k < g; k++) {
          const c = make('span', 'cell');
          slot.cells.push(c);
          slot.was.push('');
          beat.append(c);
        }
        bar.append(beat);
      }
      slot.label = { long, short };
      slot.line.replaceChildren(label, bar);
    }
  }
  el.built = count;
  el.builtSig = signature;
}

// Puts a snapshot on the screen.
function draw(snap) {
  const s = session;
  const pct = s.kind === 'file' && s.progress !== null ? ` · ${Math.round(s.progress * 100)}%` : '';
  setText(el.time, `${clock(snap.seconds)}${pct}`);
  s.heard = heardParts(s.heard, snap);
  const chips = partChips(s.heard, snap);
  const key = chips.map((c) => `${c.label}${c.now ? '*' : ''}`).join('|');
  if (key !== el.chipsKey) {
    el.chipsKey = key;
    el.chips.replaceChildren(...chips.map((c) => make('span', `listen-chip${c.now ? ' now' : ''}`, c.label)));
  }
  setHidden(el.partsLabel, !chips.length);
  setText(el.feel, feelLine(snap));
  s.view = rollView(s.view, snap);
  setHidden(el.wait, !!s.view);
  if (s.view) paint(s.view);
  const change = tempoLine(snap, s.heard);
  setHidden(el.change, !change);
  if (change && el.change.dataset.text !== change.lead + change.rest) {
    el.change.dataset.text = change.lead + change.rest;
    el.change.replaceChildren(make('b', '', `${change.faster ? '⏩' : '⏪'} ${change.lead}`), change.rest);
  }
}

// The rolling bars: the newest at the bottom, cells changed only where they differ.
function paint(view) {
  const n = view.lines.length;
  const count = view.lines[0].cells.kick.length;
  if (count !== el.built || view.signature !== el.builtSig) buildCells(count, view.signature);
  for (const row of ROWS) {
    el.cells[row].forEach((slot, i) => {
      const j = i - (LINES - n);   // the lines fill from the bottom
      const line = view.lines[j];
      setHidden(slot.line, !line);
      slot.line.classList.toggle('oldest', n === LINES && i === 0);
      if (!line) return;
      const label = lineLabel(view.partId, line.bar);
      setText(slot.label.long, label);
      setText(slot.label.short, String(line.bar));
      const cells = line.cells[row];
      for (let k = 0; k < slot.cells.length; k++) {
        const v = cells[k] ?? -1;
        const now = j === n - 1 && k === view.step;
        const cls = `cell v${v < 0 ? 'n' : v}${now ? ' now' : ''}`;
        if (slot.was[k] !== cls) { slot.was[k] = cls; slot.cells[k].className = cls; }
      }
    });
  }
}

// ■ Stop, sharing stopped in the browser, or the file's end.
function stop() {
  const s = session;
  if (!s || s.finished) return;
  if (!s.capture && !s.abort) {   // still waiting for the browser: back to the choices
    s.cancelled = true;
    session = null;
    showSources();
    return;
  }
  if (s.capture) s.capture.stop();   // its onEnd finishes
  else { s.abort.abort(); finish(); }
}

async function finish() {
  const s = session;
  if (!s || s.finished) return;
  s.finished = true;
  stopLoop();
  const result = s.listener ? s.listener.finish() : { seconds: 0, parts: [], order: [], tempos: [] };
  s.result = result;
  logEvent('listen', { action: 'stop', source: s.kind, ...counts(result) });
  if (!heardABeat(result)) {
    el.nothingTip.textContent = NOTHING_TIP[s.kind];
    showView('nothing', '🎧 From a song');
    el.again.focus?.();
    return;
  }
  showView('result', '🎧 What I heard');
  el.sentence.replaceChildren(make('span', '', 'Picking the closest sounds…'));
  el.cards.replaceChildren();
  el.actions.hidden = true;
  el.soundsLine.textContent = '';
  const made = await makeAll(result);
  if (s !== session || !el.dialog.open) { if (made) throwAway(made); return; }
  s.made = made;
  logEvent('listen', { action: 'made', source: s.kind, beats: made.beats.length, song: !!made.song });
  showResult(s);
}
const counts = (result) => { const c = resultCounts(result); return { seconds: c.seconds, parts: c.parts, tempos: c.tempo_changes }; };

// ── Making the beats and the song ──

// Kept by how the sound plays now (audio.key), so a kit sound re-voiced in
// this visit gets a new print.
function printFor(kit) {
  const id = `${deps.personId()}-${kit}`;
  if (listenEnv.printOf) return Promise.resolve(listenEnv.printOf(kit)).catch(() => null);
  const clip = deps.clipById(id);
  if (!clip) return Promise.resolve(null);
  const key = deps.audio.key(clip);
  if (!prints.has(key)) {
    prints.set(key, Promise.resolve(deps.audio.load(clip))
      .then(({ buffer }) => fingerprint(buffer.getChannelData(0), buffer.sampleRate))
      .catch(() => null));
  }
  return prints.get(key);
}

async function makeAll(result) {
  const personId = deps.personId();
  const known = new Map(await Promise.all(ALL_ROW_SOUNDS.map(async (kit) => [kit, await printFor(kit)])));
  const sounds = Object.fromEntries(result.parts.map((p) => [p.id, pickSounds(p, (kit) => known.get(kit) ?? null)]));
  const { base, beats } = makeBeats(result, {
    personId, sounds, newId,
    taken: deps.library.list(personId).map((b) => b.name),
    hasClip: (id) => !!deps.clipById(id),
  });
  if (!beats.length) return null;
  const song = makeSong(result, beats, { personId, name: base, songNames: deps.songs.list(personId).map((x) => x.name), newId });
  for (const { beat } of beats) deps.library.put(beat);
  if (song) deps.songs.put(song);
  deps.refresh?.();
  return { beats, song };
}

function throwAway(made) {
  for (const { beat } of made.beats) deps.library.remove(beat.id);
  if (made.song) deps.songs.remove(made.song.id);
  deps.refresh?.();
}

// ── 3 · What I heard ──

function showResult(s) {
  const { result, made } = s;
  const sentence = heardSentence(result);
  const cut = sentence.indexOf('. ') + 1;
  el.sentence.replaceChildren(make('b', '', cut > 0 ? sentence.slice(0, cut) : sentence), cut > 0 ? sentence.slice(cut) : '');
  el.cards.replaceChildren(...made.beats.map(({ partId, beat }) => {
    const part = result.parts.find((p) => p.id === partId);
    const li = make('li', 'listen-card-part');
    li.dataset.part = partId;
    const letter = make('span', 'listen-letter', partId);
    letter.setAttribute('aria-hidden', 'true');
    const text = make('span', 'listen-part-text');
    text.append(make('span', 'listen-part-name', beat.name), make('span', 'listen-part-detail', partDetail(result, part)));
    const hear = make('button', 'listen-hear', '▶');
    hear.type = 'button';
    hear.dataset.hear = beat.id;
    hear.setAttribute('aria-label', `Play part ${partId}`);
    hear.setAttribute('aria-pressed', 'false');
    li.append(letter, text, hear);
    return li;
  }));
  // The sounds picked, each once, in row order.
  const picked = [];
  for (const row of ROWS) {
    for (const { beat } of made.beats) {
      for (const r of beat.rows) {
        const clip = deps.clipById(r.clipId);
        const kit = r.clipId.slice(deps.personId().length + 1);
        if (!ROW_SOUNDS[row].includes(kit) || picked.some((p) => p.id === r.clipId)) continue;
        picked.push({ id: r.clipId, text: `${clip?.emoji ?? ROW_LOOK[row].emoji} ${clip?.label ?? kit}` });
      }
    }
  }
  el.soundsLine.textContent = `Sounds picked to match: ${picked.map((p) => p.text).join(', ')}. Each part is a beat in 🗂️ My beats; change anything there.`;
  el.asSong.hidden = !made.song;
  el.asBeat.textContent = `🥁 Open part ${made.beats[0].partId}`;
  el.asBeat.classList.toggle('primary', !made.song);
  disarm();
  el.actions.hidden = false;
  (made.song ? el.asSong : el.asBeat).focus?.();
}

function showHearing(id) {
  for (const b of el.cards.querySelectorAll('[data-hear]')) {
    const on = b.dataset.hear === id;
    b.textContent = on ? '■' : '▶';
    b.setAttribute('aria-pressed', String(on));
  }
}
function hear(button) {
  const beat = session?.made?.beats.find((b) => b.beat.id === button.dataset.hear)?.beat;
  if (!beat) return;
  const id = `listen-${beat.id}`;
  const on = button.getAttribute('aria-pressed') === 'true';
  // hearBeat stops what plays at once (calling its onEnd), before it awaits
  // the sounds: the keys show what plays after that, or part B's ■ would be
  // undone by part A's end.
  deps.seq.hearBeat(id, beat, { seconds: 12, onEnd: () => showHearing(null) });
  showHearing(on ? null : beat.id);
}

function disarm() {
  clearTimeout(armTimer);
  el.throw.classList.remove('armed');
  el.throw.textContent = '🗑️ Throw away';
}

// Sends listen_end once, with how it ended.
function end(s, outcome) {
  if (!s || s.ended) return;
  s.ended = true;
  const c = s.result ? resultCounts(s.result) : { seconds: Math.round(s.listener?.snapshot().seconds ?? 0), parts: 0, tempo_changes: 0 };
  track('noodlepads.listen_end', { source: s.kind, ...c, outcome });
  logEvent('listen', { action: outcome, source: s.kind });
}

function openMade(what) {
  const s = session;
  if (!s?.made) return;
  end(s, what);
  el.dialog.close();
  if (what === 'song') {
    deps.showScreen('song');
    deps.song.openSaved(s.made.song.id);
  } else {
    deps.showScreen('beats');
    deps.seq.openSaved(s.made.beats[0].beat.id);
  }
}

// The sheet closing: listening stops, and nothing made is cancelled. What
// was made and not opened or thrown away is kept, in 🗂️ My beats (and 🗂️
// My songs): its outcome is what it kept.
function closed() {
  const s = session;
  session = null;
  stopLoop();
  disarm();
  deps.seq?.stopHearing?.();
  if (!s) return;
  if (!s.finished) {
    s.cancelled = true;
    s.finished = true;
    s.capture?.stop();
    s.abort?.abort();
  }
  if (s.made) end(s, s.made.song ? 'song' : 'beat');
  else if (s.listener || s.capture || s.abort) end(s, 'cancelled');
}

// deps: {
//   audio         the app's (wake, for the capture's context; load and key, for the kit's prints)
//   seq, song     the beat maker and 🎼 Song (hearBeat, stopHearing, openSaved)
//   personId()    who is showing
//   clipById(id)  any sound
//   library       the beats' list, put and remove, as the beat maker saves them
//   songs         the songs' list, put and remove, as 🎼 Song saves them
//   showScreen(n) 'beats' or 'song'
//   stopAll()     every sound stops before listening
//   refresh()     the screens that list beats and songs draw again
// }
export function initListen(d) {
  deps = d;
  Object.assign(el, {
    card: $('#listen-card'),
    cardAbout: $('#listen-card-about'),
    or: $('#groove-or'),
    open: $('#listen-open'),
    dialog: $('#listen'),
    title: $('#listen-title'),
    sources: $('#listen-sources'),
    how: $('#listen-how'),
    error: $('#listen-error'),
    time: $('#listen-time'),
    stop: $('#listen-stop'),
    chips: $('#listen-chips'),
    partsLabel: $('#listen-parts-label'),
    feel: $('#listen-feel'),
    wait: $('#listen-wait'),
    rows: $('#listen-rows'),
    change: $('#listen-change'),
    sentence: $('#listen-sentence'),
    cards: $('#listen-cards'),
    soundsLine: $('#listen-sounds'),
    actions: $('#listen-actions'),
    asSong: $('#listen-as-song'),
    asBeat: $('#listen-as-beat'),
    throw: $('#listen-throw'),
    again: $('#listen-again'),
    nothingTip: $('#listen-nothing-tip'),
    lines: [],
  });
  // Once it has heard something, only ✕ (or ■ Stop) ends listening: a stray
  // tap beside the sheet, as on coming back from the song's tab, or Esc,
  // would throw away everything heard so far.
  let byX = false;
  el.dialog.querySelector('[data-close]').addEventListener('click', () => { byX = true; });
  setupDialog(el.dialog, {
    beforeClose: () => {
      const x = byX;
      byX = false;
      return x || !session?.listener || session.finished;
    },
  });
  el.dialog.addEventListener('close', closed);
  showCard();
  onSetting('level', showCard);
  el.open.addEventListener('click', () => {
    $('#grooves')?.close();
    openListen(el.open);
  });
  el.sources.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-source]');
    if (b) listenTo(b.dataset.source);
  });
  el.sources.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    // The picker lets go of the file at once: nothing of the song stays in
    // the page once it has been read (and the same file can be picked again).
    e.target.value = '';
    if (file) listenToFile(file);
  });
  el.stop.addEventListener('click', stop);
  el.cards.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hear]');
    if (b) hear(b);
  });
  el.asSong.addEventListener('click', () => openMade('song'));
  el.asBeat.addEventListener('click', () => openMade('beat'));
  // 🗑️ Throw away asks first: the first tap turns it red, the second deletes what was made.
  el.throw.addEventListener('click', () => {
    const s = session;
    if (!s?.made) return;
    if (!el.throw.classList.contains('armed')) {
      el.throw.classList.add('armed');
      el.throw.textContent = '🗑️ Throw away?';
      clearTimeout(armTimer);
      armTimer = setTimeout(disarm, ARM_MS);
      return;
    }
    disarm();
    throwAway(s.made);
    end(s, 'thrown');
    s.made = null;
    el.dialog.close();
    deps.announce?.('Thrown away. Nothing was kept.');
  });
  el.again.addEventListener('click', () => {
    const s = session;
    end(s, 'cancelled');
    session = null;
    showSources();
  });
}
