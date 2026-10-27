// 🎤 Live's takes: record whatever is played, the take card, playing a take
// back, making one into a sound, and the Takes list. dj.js (the keys panel)
// makes one with createTakes and sends every hit to record(); the take
// replays on the audio clock (deps.bookPlay), lighting the keys on timers.
// The take rules (takeFrom, planTake) are in rhythm.js.

import { takeFrom, planTake, clockText, MAX_TAKE_SECONDS } from './rhythm.js';
import { encodeWav } from './wav.js';
import { newId } from './util.js';
import { takeName, soundName, cutName } from './names.js';
import { openDialog, setupDialog } from './dialogs.js';
import { showBanner } from './ui.js';
import { logEvent } from './log.js';
import { renderTake } from './share-render.js';

const ARM_MS = 3000;           // how long "Make another?" waits for its second tap

// `deck`, `light` and `lightTiles` are the keys panel's (a take lights its keys
// as it plays back), `showRec` redraws ● Record's line, `lineMs` is how long a
// line with Undo stays.
export function createTakes({ el, deps, deck, light, lightTiles, showRec, lineMs: LINE_MS }) {
  let rec = null;        // {started: bool, events: [{at, clipId, kind, ring?}]} while recording
  let recTimer = 0;
  let lastTake = null;   // the take just made, for the take card (#dj-done)
  let replay = [];       // timers of a take being played back
  const booked = new Set();   // the plays it booked on the audio clock (deps.bookPlay's voices), until each ends
  let replaying = null;  // the id of the take playing back, or null
  let replayRun = null;  // that playback, so one stopped while loading never starts
  // How far ahead of now a take's first hit is booked: time to book the rest.
  const REPLAY_LEAD = 0.05;

  function record(clipId, kind, at = deps.now(), ring = false) {
    if (!rec || !clipId) return;
    if (!rec.started) {
      if (kind === 'beat') return;   // a take starts at the kid's first hit
      rec.started = true;
      rec.from = at;
    }
    rec.events.push({ at, clipId, kind, ...(ring ? { ring } : {}) });
    showRec();
  }
  function startRec() {
    stopReplay();
    rec = { started: false, events: [] };
    lastTake = null;
    el.done.hidden = true;
    logEvent('take', { rec: 'start' });
    recTimer = setInterval(() => {
      if (rec?.started && deps.now() - rec.from >= MAX_TAKE_SECONDS) stopRec();
      else showRec();
    }, 250);
    showRec();
  }
  function stopRec() {
    if (!rec) return;
    clearInterval(recTimer);
    const made = takeFrom(rec.events, deps.now());
    rec = null;
    showRec();
    logEvent('take', { rec: 'stop', made: !!made, seconds: made?.duration ?? 0 });
    if (!made) return;
    const pid = deps.personId();
    lastTake = {
      id: newId('take'),
      personId: pid,
      name: takeName(deps.takes(pid).map((t) => t.name)),
      created: Date.now(),
      ...made,
    };
    deps.saveTake(lastTake);
    showTake(lastTake);
    deps.announce?.(`Saved ${lastTake.name}, ${Math.round(lastTake.duration)} seconds.`);
  }
  // The take card (#dj-done) for the take just made, or brought back by Undo.
  function showTake(take) {
    lastTake = take;
    // The take's name is a field, so it can be renamed right here.
    el.takeLine.hidden = false;
    el.takeName.value = take.name;
    fitTakeName();
    el.takeLength.textContent = `(${clockText(take.duration)})`;
    el.donePlay.hidden = false;
    el.doneSound.hidden = false;
    el.doneRename.hidden = false;
    el.done.hidden = false;
    showPlaying();
  }

  // The take's name field is as wide as its name, so its length "(0:03)"
  // sits right after it rather than out in the middle of the bar.
  function fitTakeName() { el.takeName.size = Math.max(4, [...el.takeName.value].length + 1); }

  // ▶ Play on a take turns into ■ Stop while it plays (Ben, 2026-10-11); a
  // second tap, or the take ending, puts it back.
  // Every sound is loaded first, then the take as it was heard
  // (rhythm.js planTake, as 🔊 Make a sound renders it: each hit, a loop's
  // passes up to its stop, a hit cut where the next one cut it) is booked on
  // the audio clock at once, t0 + its time. Each play is a voice of its own,
  // outside audio.playing, so a pad tapped meanwhile and the take never
  // take each other's place. Only the keys' lighting and the end run on
  // timers, which may come a little late.
  async function playTake(take) {
    if (replaying === take.id) { stopReplay(); return; }
    stopReplay();
    const run = {};
    replaying = take.id;
    replayRun = run;
    showPlaying();
    const clips = new Map();
    let gone = 0;
    for (const e of take.events) {
      const clip = deps.clipById(e.clipId);
      if (clip) clips.set(clip.id, clip); else gone++;
    }
    if (gone) deps.announce?.(`${gone} ${gone === 1 ? 'sound in this take is' : 'sounds in this take are'} gone.`);
    const loaded = new Map();
    await Promise.all([...clips.values()].map((clip) => Promise.resolve(deps.loadSound(clip))
      .then((got) => { if (got) loaded.set(clip.id, got); }).catch(() => null)));
    if (replayRun !== run) return;   // stopped, or another take started, while loading
    const t0 = deps.now() + REPLAY_LEAD;
    for (const { clipId, at, end } of planTake(take, new Map([...loaded].map(([id, l]) => [id, l.duration])))) {
      const voice = deps.bookPlay(loaded.get(clipId), t0 + at, end == null ? null : t0 + end);
      booked.add(voice);
      // Sounded and done: nothing left of it to cut.
      if (voice?.src) voice.src.onended = () => booked.delete(voice);
    }
    const later = (at, fn) => replay.push(setTimeout(fn, Math.max(0, (at - deps.now()) * 1000)));
    for (const e of take.events) {
      const clip = clips.get(e.clipId);
      if (!clip || e.kind === 'beat') continue;
      later(t0 + e.t, () => {
        for (const [code, id] of Object.entries(deck())) if (id === clip.id) light(code, { ripple: e.kind === 'hit' });
        lightTiles(clip.id);
      });
    }
    // Done when the take is: a moment after its last event, for the last sound to ring.
    later(t0 + take.duration + 0.5, () => { replay = []; booked.clear(); replaying = null; replayRun = null; showPlaying(); });
  }
  // Stops a take being played back: its timers, and every play it booked
  // (one still to come never sounds).
  function stopReplay() {
    replay.forEach(clearTimeout);
    replay = [];
    for (const voice of booked) deps.cutVoice(voice);
    booked.clear();
    replaying = null;
    replayRun = null;
    showPlaying();
  }
  // The done bar's and the Takes list's Play keys say ■ Stop for the take that is playing.
  function showPlaying() {
    const on = !!lastTake?.id && replaying === lastTake.id;
    el.donePlay.textContent = on ? '■ Stop' : '▶ Play';
    el.donePlay.setAttribute('aria-pressed', String(on));
    for (const b of el.takesList.querySelectorAll('[data-play]')) {
      b.textContent = replaying === b.dataset.play ? '■ Stop' : '▶ Play';
      b.setAttribute('aria-pressed', String(replaying === b.dataset.play));
    }
  }

  // Renders a take into a new pad (as Save as a sound does for a beat): every
  // play mixed offline, loops repeated, scaled just under full scale. Named
  // after the take, or a made-up name if that is already on the board.
  async function makeSound(take, button) {
    if (button) { button.disabled = true; button.textContent = 'Making…'; }
    try {
      // Each play as it was heard: a hit the next one cut off stops there,
      // with the same short fade (planTake `end`; 🔔 Let it ring lets it ring).
      const out = await renderTake(take, { clipById: deps.clipById, loadSound: deps.loadSound, rate: deps.sampleRate(), channels: 2 });
      if (!out) { deps.announce?.('None of the sounds in this take are here any more.'); return null; }
      const names = deps.soundNames();
      const label = names.includes(take.name) ? soundName(names) : take.name;
      const clip = await deps.addSound({ label, blob: encodeWav(out) });
      deps.announce?.(`Added ${label} to the pads.`);
      return clip;
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.idle || '🔊 Make a sound'; }
    }
  }

  // Takes already made into a sound this visit: Make a sound again asks
  // first ("Make another?"), since a second press makes a second pad.
  const madeSounds = new Set();
  let soundAsked = null;
  let soundTimer = 0;
  function disarmSound(button) {
    soundAsked = null;
    clearTimeout(soundTimer);
    button.classList.remove('armed');
    button.textContent = button.dataset.idle;
    button.removeAttribute('aria-label');
    if (button.dataset.label) button.setAttribute('aria-label', button.dataset.label);
  }
  // `nameBox` holds the take's name: a note fades in over it once it's made.
  async function askThenMake(take, button, nameBox) {
    if (madeSounds.has(take.id) && soundAsked !== take.id) {
      soundAsked = take.id;
      button.classList.add('armed');
      button.textContent = 'Make another?';
      button.setAttribute('aria-label', `${take.name} is already a sound. Tap again to make another.`);
      clearTimeout(soundTimer);
      soundTimer = setTimeout(() => disarmSound(button), ARM_MS);
      return;
    }
    disarmSound(button);
    const clip = await makeSound(take, button);
    if (!clip) return;
    madeSounds.add(take.id);
    savedNote(nameBox, clip.label === take.name ? '✅ Sound saved' : `✅ Saved as “${clip.label}”`);
  }
  function savedNote(box, text) {
    if (!box) return;
    box.querySelector('.saved-note')?.remove();
    const note = document.createElement('span');
    note.className = 'saved-note';
    note.setAttribute('aria-hidden', 'true');   // makeSound announces it
    note.textContent = text;
    box.append(note);
    setTimeout(() => note.remove(), 2600);
  }

  // The Takes dialog: every take this person made, to play, rename or delete.
  let deleteAsked = null;
  function renderTakes() {
    const takes = deps.takes(deps.personId()).slice().sort((a, b) => b.created - a.created);
    el.takesEmpty.hidden = takes.length > 0;
    el.takesList.replaceChildren(...takes.map((t) => {
      const li = document.createElement('li');
      li.className = 'lib-beat take';
      const name = document.createElement('input');
      name.className = 'take-name';
      name.value = t.name;
      name.maxLength = 24;
      name.dataset.rename = t.id;
      name.setAttribute('aria-label', 'Take name');
      const info = document.createElement('span');
      info.className = 'lib-info';
      const hits = t.events.filter((e) => e.kind === 'hit').length;
      info.textContent = `${clockText(t.duration)} · ${hits} ${hits === 1 ? 'hit' : 'hits'}`;
      const text = document.createElement('span');
      text.className = 'lib-text';
      text.append(name, info);
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'chip-dark';
      play.dataset.play = t.id;
      play.textContent = '▶ Play';
      const sound = document.createElement('button');
      sound.type = 'button';
      sound.className = 'chip-dark';
      sound.dataset.sound = t.id;
      sound.dataset.idle = '🔊';
      sound.dataset.label = `Make ${t.name} a sound on the pads`;
      sound.textContent = '🔊';
      sound.setAttribute('aria-label', sound.dataset.label);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-dark';
      del.dataset.delete = t.id;
      del.textContent = deleteAsked === t.id ? 'Delete?' : '🗑️';
      del.classList.toggle('armed', deleteAsked === t.id);
      del.setAttribute('aria-label', deleteAsked === t.id ? `Tap again to delete ${t.name}` : `Delete ${t.name}`);
      li.append(text, play, sound, del);
      return li;
    }));
    showPlaying();   // the take playing back keeps its ■ Stop
  }

  el.donePlay.addEventListener('click', () => lastTake && playTake(lastTake));
  // ✕ puts the take card away (the take stays as it is).
  el.doneClose.addEventListener('click', () => { lastTake = null; el.done.hidden = true; });
  el.takeName.addEventListener('change', () => {
    const name = cutName(el.takeName.value.trim());
    if (lastTake?.id && name) { lastTake = { ...lastTake, name }; deps.saveTake(lastTake); }
    el.takeName.value = lastTake?.name ?? '';
    fitTakeName();
  });
  // ✏️ Rename: straight into the name, selected, ready to type over.
  el.doneRename.addEventListener('click', () => { el.takeName.focus(); el.takeName.select?.(); });
  el.takeName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.takeName.blur(); } });
  el.takeName.addEventListener('input', fitTakeName);
  el.doneSound.dataset.idle = el.doneSound.textContent;
  el.doneSound.addEventListener('click', () => lastTake?.id && askThenMake(lastTake, el.doneSound, el.takeLine));
  // The take card's ↩️ Undo takes the take out at once, and the banner's
  // ↩️ Undo puts it back, as a deleted sound comes back on Pads: a take is
  // work a slip should not lose. Back, it gets its card again unless another
  // take (or a recording) has the card by then.
  el.doneUndo.addEventListener('click', () => {
    if (!lastTake) return;
    const take = lastTake;
    if (replaying === take.id) stopReplay();
    deps.deleteTake(take.id);
    lastTake = null;
    el.done.hidden = true;
    takenOut = take;
    takeLine = showBanner(`Took out “${take.name}”.`, {
      action: { label: '↩️ Undo', fn: () => { takenOut = null; bringBack(take); } },
      ms: LINE_MS,
      focusBack: () => el.record,
      onClose: () => { takeLine = null; takenOut = null; },   // its time is up (or another notice took its place)
    });
    deps.announce?.(`Took out ${take.name}. Undo is available.`);
  });
  let takeLine = null;   // the banner with ↩️ Undo for a take taken out
  let takenOut = null;   // that take, while its banner can still bring it back
  function bringBack(take) {
    if (deps.takes(take.personId).some((t) => t.id === take.id)) return;
    deps.saveTake(take);
    if (!lastTake && !rec && take.personId === deps.personId()) showTake(take);
    if (el.takes.open) renderTakes();
    deps.announce?.(`${take.name} is back.`);
  }
  el.takesOpen.addEventListener('click', () => {
    deleteAsked = null;
    renderTakes();
    openDialog(el.takes);
  });
  el.takesList.addEventListener('click', (e) => {
    const find = (id) => deps.takes(deps.personId()).find((t) => t.id === id);
    const play = e.target.closest('[data-play]');
    if (play) { const t = find(play.dataset.play); if (t) playTake(t); return; }
    const sound = e.target.closest('[data-sound]');
    if (sound) { const t = find(sound.dataset.sound); if (t) askThenMake(t, sound, sound.closest('.take')?.querySelector('.lib-text')); return; }
    const del = e.target.closest('[data-delete]');
    if (!del) return;
    if (deleteAsked !== del.dataset.delete) { deleteAsked = del.dataset.delete; renderTakes(); return; }
    deleteAsked = null;
    deps.deleteTake(del.dataset.delete);
    renderTakes();
  });
  el.takesList.addEventListener('change', (e) => {
    const input = e.target.closest('[data-rename]');
    const t = input && deps.takes(deps.personId()).find((x) => x.id === input.dataset.rename);
    if (!t) return;
    const name = cutName(input.value.trim());
    if (name) deps.saveTake({ ...t, name });
    else input.value = t.name;
  });
  setupDialog(el.takes);

  // dj.js reads the recording (the line under the keys, Esc, ● Record) and
  // ends, drops or clears what a take left behind.
  return {
    record, startRec, stopRec, stopReplay,
    rec: () => rec,
    replaying: () => replaying,
    // A person deleted mid-take: the recording is dropped, not kept.
    discardRec() { if (rec) { clearInterval(recTimer); rec = null; showRec(); } },
    // The take card goes away (the take stays as it is).
    clearCard() { lastTake = null; el.done.hidden = true; },
    // A take taken out whose ↩️ Undo is still up: that banner is its only way
    // back, so it goes back quietly as this person's (no card, no word for
    // the next one) before the banner goes. A deleted person's stays gone.
    settleTakenOut(keep) {
      if (takenOut && keep && !deps.takes(takenOut.personId).some((t) => t.id === takenOut.id)) deps.saveTake(takenOut);
      takenOut = null;
      if (takeLine?.open) takeLine.close();
    },
  };
}
