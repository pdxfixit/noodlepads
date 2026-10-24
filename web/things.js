// 🗂️ See all: everything one person has on this device, by kind (Ben,
// 2026-10-24), opened from the count line on their profile sheet
// (people.js). A chip per kind picks what shows, every kind with its count,
// 0 included; the list shows only kinds they have, newest first (model.js
// personThings). A tap on a row plays it right there: a sound or ✏️ preset
// edit as its pad plays it, a beat twice round, a song or 🎬 take as heard,
// a ⭐ voice on one of their sounds. Key sets and layouts have no sound of
// their own, so they are listed with no ▶. A second tap stops it, and so does
// closing the sheet. The sheet only shows and plays: deleting stays where it is.

import { audio } from './audio.js';
import { applyChain, chainOf } from './voices.js';
import { KIND_EMOJI, PERSON_KINDS, personThings, withBulkChanges } from './model.js';
import { openDialog, setupDialog } from './dialogs.js';

const PLAY_ID = 'see-all';   // its own slot in audio.playing, apart from the pads and the sound sheet
const PLAYS = new Set(['sounds', 'edits', 'beats', 'songs', 'takes', 'voices']);
export const SHOWN_IN_ALL = 3;   // rows per kind under All; ＋ N more picks that kind

// deps (app.js): lists() (the stores as lists), anyone(id) (a person),
// preset(kitId) (a preset's {label, emoji}), clipById(id, personId), sampleClips(personId)
// (the sounds a ⭐ voice may play on, in order), render(kind, id, personId, rate) (a beat,
// song or take as an AudioBuffer, share-render.js renderAudio).
let deps = null;
const el = {};
let who = null;        // the person shown
let showing = 'all';   // the chip picked: 'all' or a kind
let playing = null;    // `${kind}:${id}` of the row playing, or loading
let loading = false;
let endTimer = 0;
let ask = 0;           // each tap's number: a render that finishes after a newer tap plays nothing

const KIND_WORDS = new Map(PERSON_KINDS.map(([k, one, many, title]) => [k, { one, many, title }]));
const things = () => personThings(deps.lists(), who, { preset: deps.preset });

export function openThings(personId, { opener } = {}) {
  const p = deps?.anyone(personId);
  if (!p) return;
  who = personId;
  showing = 'all';
  draw();
  openDialog(el.dialog, { opener, focus: el.chips.querySelector('[aria-pressed="true"]') });
}

function draw() {
  const p = deps.anyone(who);
  if (!p) { if (el.dialog.open) el.dialog.close(); return; }
  el.dialog.style.setProperty('--c', p.color);
  el.title.textContent = `Everything ${p.name} has`;
  const all = things();
  const total = Object.values(all).reduce((n, list) => n + list.length, 0);
  const chip = (kind, text, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sa-chip';
    b.dataset.show = kind;
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(showing === kind));
    return b;
  };
  el.chips.replaceChildren(
    chip('all', `All ${total}`, `All, ${total}`),
    ...PERSON_KINDS.map(([k, one, many, title]) => chip(k, `${KIND_EMOJI[k]} ${all[k].length}`, `${title}, ${all[k].length} ${all[k].length === 1 ? one : many}`)),
  );
  const parts = [];
  if (showing === 'all') {
    for (const [k] of PERSON_KINDS) if (all[k].length) parts.push(...section(k, all[k], SHOWN_IN_ALL));
    if (!parts.length) parts.push(empty('Nothing here yet. Sounds, beats and songs they make show up here.'));
  } else {
    parts.push(...section(showing, all[showing], Infinity));
    if (!all[showing].length) parts.push(empty(`No ${KIND_WORDS.get(showing).many} yet.`));
  }
  el.list.replaceChildren(...parts);
}

function empty(text) {
  const p = document.createElement('p');
  p.className = 'field-hint sa-empty';
  p.textContent = text;
  return p;
}

// A kind's heading and its rows, the first `max` of them, then ＋ N more.
function section(kind, items, max) {
  const head = document.createElement('h3');
  head.className = 'cl-head sa-head';
  const words = document.createElement('span');
  words.textContent = `${KIND_EMOJI[kind]} ${KIND_WORDS.get(kind).title}`;
  const n = document.createElement('span');
  n.className = 'sa-n';
  n.textContent = String(items.length);
  head.append(words, n);
  const ul = document.createElement('ul');
  ul.className = 'sa-list';
  for (const item of items.slice(0, max)) ul.append(row(item));
  if (items.length > max) {
    const li = document.createElement('li');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'sa-row sa-more';
    more.dataset.show = kind;
    more.textContent = `＋ ${items.length - max} more`;
    more.setAttribute('aria-label', `${items.length - max} more ${KIND_WORDS.get(kind).many}`);
    li.append(more);
    ul.append(li);
  }
  return [head, ul];
}

function row(item) {
  const li = document.createElement('li');
  const plays = PLAYS.has(item.kind);
  const box = document.createElement(plays ? 'button' : 'div');
  box.className = 'sa-row';
  const key = `${item.kind}:${item.id}`;
  const pic = document.createElement('span');
  pic.className = 'sa-pic';
  pic.textContent = item.emoji;
  pic.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'sa-text';
  const name = document.createElement('span');
  name.className = 'sa-name';
  name.textContent = item.name;
  text.append(name);
  if (item.detail) {
    const detail = document.createElement('span');
    detail.className = 'sa-detail';
    detail.textContent = item.detail;
    text.append(detail);
  }
  box.append(pic, text);
  if (plays) {
    box.type = 'button';
    box.dataset.play = key;
    const on = playing === key;
    const go = document.createElement('span');
    go.className = 'sa-go';
    go.setAttribute('aria-hidden', 'true');
    go.textContent = on ? (loading ? '…' : '■') : '▶\uFE0E';
    box.append(go);
    box.classList.toggle('playing', on);
    box.setAttribute('aria-pressed', String(on));
    box.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${item.name}${item.detail ? `, ${item.detail}` : ''}`);
  }
  li.append(box);
  return li;
}

function stop() {
  ask++;
  clearTimeout(endTimer);
  if (playing && audio.ctx) audio.stop(PLAY_ID);
  playing = null;
  loading = false;
}

// The row's sound as {buffer, duration}, or null when there is nothing to hear.
async function soundOf(kind, id) {
  if (kind === 'sounds' || kind === 'edits') {
    const clip = deps.clipById(id, who);
    return clip ? audio.load(clip) : null;
  }
  if (kind === 'voices') {
    // On their newest own sound, else (none, or it won't load) a preset of theirs.
    const v = (deps.lists().voices ?? []).find((x) => x?.id === id && x.personId === who);
    if (!v) return null;
    for (const sample of deps.sampleClips(who)) {
      try {
        const after = withBulkChanges(sample, { knobs: v.knobs });
        return await applyChain(await audio.original(sample), chainOf(after), after.tweaks, sample.level);
      } catch { /* the next one */ }
    }
    return null;
  }
  const buffer = await deps.render(kind.replace(/s$/, ''), id, who, audio.ctx.sampleRate);
  return buffer ? { buffer, duration: buffer.duration } : null;
}

async function play(key) {
  if (playing === key) { stop(); draw(); return; }
  stop();
  const mine = ask;
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  playing = key;
  loading = true;
  el.note.textContent = '';
  draw();
  let loaded = null;
  try {
    audio.wake();
    loaded = await soundOf(kind, id);
  } catch (err) {
    console.error('See all: that did not play:', err);
  }
  if (mine !== ask) return;   // another tap, or the sheet closed, while it rendered
  loading = false;
  if (!loaded) { playing = null; el.note.textContent = 'That one has nothing to hear here.'; draw(); return; }
  audio.start(PLAY_ID, loaded);
  draw();
  endTimer = setTimeout(() => { if (mine === ask) { playing = null; draw(); } }, Math.ceil(loaded.duration * 1000) + 100);
}

export function initThings(hooks) {
  deps = hooks;
  Object.assign(el, {
    dialog: document.querySelector('#things-dialog'),
    title: document.querySelector('#things-title'),
    chips: document.querySelector('#things-chips'),
    list: document.querySelector('#things-list'),
    note: document.querySelector('#things-note'),
  });
  if (!el.dialog) return;
  setupDialog(el.dialog);
  el.dialog.addEventListener('close', () => { stop(); who = null; el.note.textContent = ''; });
  el.dialog.addEventListener('click', (e) => {
    const pick = e.target.closest?.('[data-show]');
    if (pick) {
      showing = pick.dataset.show;
      draw();
      el.chips.querySelector(`[data-show="${showing}"]`)?.focus();
      return;
    }
    const b = e.target.closest?.('[data-play]');
    if (b) play(b.dataset.play);
  });
}
