// 🎼 Song, a screen of its own in the toolbar (ADR 0017): a playlist (ADR
// 0024). A song has its own tempo and up to 8 lanes; each lane holds blocks,
// a saved beat placed at a bar and repeated. Pick a beat in the strip of
// your beats, then tap a spot on a lane to drop it there; tap a block to
// select it, drag its end (or ➖ ➕) to repeat it, 🗑️ to take it out, ↩️ Undo
// for any of it. ▶ Play song plays every lane together at the song's tempo,
// from bar 1 or from a bar number tapped in the ruler. Tempo marks (ADR
// 0031) change the tempo from a bar on, for every lane: a BPM chip over
// their bar in the ruler, changed in the 🎼 Tempo sheet with Advanced on.
// 🔊 Save as a sound renders it to a new pad. The pure part (placing, repeats, time) is
// playlist.js.
//
// Songs work like beats: each person has a list of them, one is open, and
// the open song saves itself on every change. IndexedDB `songs` holds each
// person's open song and `songbook` every song (ADR 0007). With nothing else
// open, the person's scratch song is (ADR 0020, scratch.js): in `songbook`
// under a reserved id, never listed; 💾 Keep makes it a song in 🗂️ Songs. The
// song bar renames it, starts a 🆕 New one, or 🗂️ Songs opens another (⧉
// duplicate, 🗑️ delete).
//
// Playback uses the Web Audio clock through the beat engine (beat-engine.js
// play): the whole song is planned up front as a list of timed hits, and the
// engine's 25 ms tick books those due in the next 100 ms. Each lane plays
// through a gain of its own (its volume, or silent when muted), so a lane's
// speaker works while the song plays.

import { openDialog, setupDialog } from './dialogs.js';
import { tempoKey } from './tempo-key.js';
import { encodeWav, normalize, audioFileFrames, audioView, audioFileName, AUDIO_RING_SECONDS } from './wav.js';
import { COMMON_BPMS, tempoStops, stopFor, outputDelay } from './beat.js';
import { logEvent } from './log.js';
import { createAudioSaver } from './download.js';
import { showBanner } from './ui.js';
import { countPlay } from './play-count.js';
import { newId } from './util.js';
import { isScratchSong, songScratchOf, songScratchId, SCRATCH_NAME, hasHits, scratchLabel, isScratch as isScratchBeat } from './scratch.js';
import { speakerControls, makeSpeaker, drawSpeaker, cleanVolume } from './row-volume.js';
import { emojiMore, withCurrent } from './emoji-more.js';
import { getSetting, onSetting } from './settings.js';
import { follower } from './follow.js';
import {
  MAX_LANES, MAX_LANE_NAME, LANE_EMOJI, LANE_DEFAULTS, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO,
  cleanTempo, cleanLanes, defaultLane, slotsToLanes, legacySlots, blockSpan, blockAt, placeBlock, setTimes, maxTimes,
  timesForEnd, removeBlock, viewBars, playParts, playEvents, playingAt, MAX_SONG_BARS,
  cleanTempos, tempoAt, putTempo, removeTempo, songClock, MAX_TEMPO_MARKS,
  MAX_SONG_SECONDS, beatSteps, cleanSong, linkSong, uniqueSongName, planSong, soundSong,
} from './playlist.js';
import { cutName, MAX_NAME } from './names.js';

const TEMPO_STOPS = tempoStops(MIN_TEMPO, MAX_TEMPO);   // the slider's stops: Beats' pull toward common tempos
const ARM_MS = 3000;                     // how long a Remove? waits for its second tap
const UNDO_MS = 8000;                    // how long a tempo change taken out can be brought back
const MAX_UNDO = 40;                     // ↩️ Undo steps kept for the open song

const blockCount = (song) => song.lanes.reduce((n, l) => n + l.blocks.length, 0);

// deps: el (the screen's elements), audio, meter, engine (the one beat engine,
// beat-engine.js: Song's ▶ is a run of its `play` on the planned list), seq
// (the beat maker: its beatPlan, prepareBeats, endMix and stop), beats(personId)
// (saved beats a song can use), scratch(personId) (the person's scratch beat,
// shown first in the strip once it has hits) and keepScratch(personId) (keeps
// it in 🗂️ Beats as it goes on a lane: the kept beat's id, or null), load(personId) -> the stored open song or
// undefined, save(song) (as the open song), close(personId) (nothing open),
// songs: {list(personId), put(song), remove(id)} (every saved song),
// songName(taken) (a fun name), soundLabel(name) (a label for the new pad),
// addClip({label, blob}), beatColor(beat) (its chip's color), announce(text),
// editBeat(beatId, back) (✏️ on a block: opens the beat in 🥁 Beats; `back` is
// {lane, block, x, y}, handed to restoreSelection when the person comes back).
export function createSong(deps) {
  const { el, audio, meter, seq, engine } = deps;
  let song = null;
  let audioSaver = null;   // ⬇️ Save as audio file's button (made below)
  // On a phone the song's tempo folds into one key (tempo-key.js); its line holds ➖ the tempo ➕ (with Advanced, the way into 🎼 Tempo).
  let sliding = null;   // the tempo a slider drag is at, shown on the key until it lets go
  const songKey = el.tempoKey && el.tempoBox ? tempoKey(el.tempoKey, el.tempoBox, () => sliding ?? song?.tempo ?? 100) : null;

  let run = null;            // the engine's run of the song while it plays (beat-engine.js play)
  let raf = 0;
  let starting = false;
  let t0 = 0;
  let from = 0;              // where this play started, in seconds
  let planned = null;        // {plans, parts, events, seconds, barSeconds, clock} while playing
  let laneGains = [];
  let mixEnds = [];          // {lane, beatId, end}: when each lane is done with a beat, to let its mix go
  let shown = new Set();     // the blocks lit as playing
  let startBar = 0;          // ▶ Play song starts here (a bar number tapped in the ruler)

  let picked = null;         // the beat picked in the strip, to drop on a lane
  let sel = null;            // the selected block: {lane, block}
  let removeAsked = false;
  let editAsked = null;      // "lane:block" of the block whose ✏️ is asking Edit it or Edit a copy
  let armTimer = 0;
  let undoSteps = [];        // the song before each edit, for ↩️ Undo
  const cursor = new Map();  // lane -> the bar the keyboard is on

  let personId = null;
  const playing = () => !!run || starting;
  const beats = () => deps.beats(personId);
  const beatById = (id) => beats().find((b) => b.id === id);
  // The person's scratch beat when it has hits (Mission keeper, 2026-10-27):
  // it shows first in the strip, so a beat goofed on goes on a lane without
  // a trip to 💾 Keep. It is kept as the block goes in (tapSpot), so no
  // block ever holds the scratch's own id.
  const scratchBeat = () => {
    const s = deps.scratch?.(personId);
    return s && hasHits(s) ? s : null;
  };
  const pickable = () => { const s = scratchBeat(); return s ? [s, ...beats()] : beats(); };
  const pickableById = (id) => pickable().find((b) => b.id === id);
  const stepsOf = (id) => beatSteps(pickableById(id));
  const allSongs = () => deps.songs.list(personId);
  const songs = () => allSongs().filter((s) => !isScratchSong(s));   // the ones in 🗂️ Songs
  const clean = (raw) => cleanSong(raw, () => deps.songName(songs().map((x) => x.name)), beatById);
  // The scratch song to open: as stored, or empty (saved once it changes).
  function scratchSong() {
    const saved = songScratchOf(allSongs(), personId);
    if (saved) return { ...clean(saved), name: SCRATCH_NAME };
    return clean({ id: songScratchId(personId), personId, name: SCRATCH_NAME, tempo: DEFAULT_TEMPO, lanes: [] });
  }
  const onScratch = () => !!song && isScratchSong(song);
  // The open song's tempo marks (ADR 0031): none is no field at all, so a
  // song with none is stored as before them.
  const tempoMarks = () => song?.tempos ?? [];
  function setMarks(list) { if (list.length) song.tempos = list; else delete song.tempos; }
  // Only Advanced changes marks; everyone hears and sees them.
  const advanced = () => getSetting('advancedBeats') === true;
  // What the title shows: the name, or the scratch's label (or the name typed for it).
  const titleOf = () => (onScratch() ? wantedName ?? 'Scratch song' : song.name);
  // A name typed into the scratch song's title (Ben, 2026-10-16): it keeps
  // itself under it, at once if it has blocks, else the moment it gets one
  // (save). Another song, person or 🆕 New forgets it.
  let wantedName = null;

  // The person's open song, or their scratch song (ADR 0020). A stored
  // song in the list opens as the list has it; one with beats from before
  // the list joins it; an empty one that never joined was made by the app,
  // not the kid, so the scratch opens.
  function setPerson(id) {
    stop();
    personId = id;
    picked = null;
    wantedName = null;
    const stored = deps.load(personId);
    const cleaned = stored && clean(stored);
    const listed = cleaned?.id && songs().find((x) => x.id === cleaned.id);
    song = null;
    if (listed) song = clean(listed);
    else if (cleaned && blockCount(cleaned) && !isScratchSong(cleaned)) { song = linkSong(cleaned, songs()); save(); }
    else if (stored) deps.close(personId);
    song ??= scratchSong();
    forget();
    render();
  }

  // What belongs to one open song only: the selection, the Undo steps, where
  // it plays from.
  function forget() {
    if (el.tempoSheet.open) el.tempoSheet.close();
    sel = null;
    removeAsked = false;
    undoSteps = [];
    startBar = 0;
    cursor.clear();
  }

  // 🆕 New (Ben, 2026-10-12): a blank scratch song opens. A named song open
  // stays there as it is. A scratch with blocks is kept first (Ben,
  // 2026-10-24: 🗂️ See all lists it as theirs, so New must never lose it):
  // it joins 🗂️ Songs with a fun name, open or not, and a line says so.
  function newScratch() {
    const old = songScratchOf(allSongs(), personId);
    let kept = null;
    if (old && blockCount(clean(old))) {
      kept = deps.songName(songs().map((x) => x.name));
      const now = Date.now();
      deps.songs.put({ ...structuredClone(old), id: newId('song'), name: kept, created: now, saved: now });
      logEvent('song', { action: 'keep' });
    }
    if (old) deps.songs.remove(old.id);
    openSong(null);
    logEvent('song', { action: 'new' });
    if (kept) note(`Kept as “${kept}” in 🗂️ Songs. A blank scratch song.`);
    else deps.announce?.('A blank scratch song.');
  }

  // A short note about the song (a lane full, the sound made), in the banner.
  let noteBanner = null;
  function note(text) {
    if (!text) { noteBanner?.close(); noteBanner = null; return; }
    noteBanner = showBanner(text);
  }
  // Saves the open song: as the person's open song (the scratch open is
  // no record), and into the list. Older copies read its `slots`.
  function save() {
    if (!song) return;
    song.slots = legacySlots(song.lanes);
    if (onScratch()) deps.close(personId); else deps.save(structuredClone(song));
    const before = allSongs().find((x) => x.id === song.id);
    deps.songs.put({ ...structuredClone(song), created: before?.created ?? Date.now(), saved: Date.now() });
    // A named scratch keeps itself once it has a block: after the change
    // that gave it one has finished drawing.
    if (wantedName && onScratch() && blockCount(song)) queueMicrotask(() => { if (wantedName) keep(); });
  }

  // An edit to the song's tempo, tempo marks or lanes: kept for ↩️ Undo first.
  const snapshot = () => structuredClone({ tempo: song.tempo, tempos: tempoMarks(), lanes: song.lanes });
  function edit(change) {
    undoSteps.push(snapshot());
    if (undoSteps.length > MAX_UNDO) undoSteps.shift();
    change();
    save();
  }
  function undoStep() {
    const before = undoSteps.pop();
    if (!before) return;
    stop();
    disarm(false);
    song.tempo = before.tempo;
    setMarks(before.tempos ?? []);
    // A lane's mute and loudness are not undo steps: they stay as they are now.
    // (Lanes are only ever added at the end, so index i is the same lane.)
    const now = song.lanes;
    song.lanes = before.lanes.map((l, i) => (now[i] ? { ...l, muted: now[i].muted, volume: now[i].volume } : l));
    if (sel && !song.lanes[sel.lane]?.blocks[sel.block]) sel = null;
    save();
    render();
    deps.announce?.('Undone.');
  }

  // Switches to another song (opened or new), or to the scratch (null).
  function openSong(nextSong) {
    stop();
    disarm(false);
    wantedName = null;
    song = nextSong ?? scratchSong();
    forget();
    if (onScratch()) deps.close(personId); else save();
    render();
  }

  // 💾 Keep (ADR 0020): the scratch song becomes a song in 🗂️ Songs with
  // the name typed into its title, else a fun name, and opens; the scratch
  // starts empty again.
  function keep() {
    if (!onScratch() || !blockCount(song)) return;
    const old = songScratchOf(allSongs(), personId);
    const name = wantedName ? uniqueSongName(wantedName, songs(), null) : deps.songName(songs().map((x) => x.name));
    wantedName = null;
    song = { ...song, id: newId('song'), name };
    save();
    if (old) deps.songs.remove(old.id);
    logEvent('song', { action: 'keep' });
    render();
    deps.announce?.(`Kept as “${name}” in 🗂️ Songs. Your scratch song is empty again.`);
  }

  // ── Drawing ──

  const make = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const button = (className, text, label) => {
    const b = make('button', className, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  };
  const beatName = (id) => {
    const beat = pickableById(id);
    return !beat ? 'Deleted beat' : isScratchBeat(beat) ? scratchLabel(beat) : beat.name;
  };
  const timesWords = (n) => (n === 1 ? 'once' : `${n} times`);
  const laneLabel = (i) => `${song.lanes[i].emoji} ${song.lanes[i].name}`;

  function render() {
    if (!personId || !song) return;
    if (el.songs.open) renderSongs();
    // The scratch shows "Scratch song", in italics: not kept yet. 💾 Keep
    // stands where ✏️ is; a name typed into the title keeps it under that
    // name (nameScratch).
    const scratch = onScratch();
    const count = blockCount(song);
    el.name.classList.toggle('scratch', scratch);
    el.name.setAttribute('aria-label', scratch ? 'Scratch song, not kept yet: type a name to keep it in 🗂️ Songs' : 'Song name (tap to rename)');
    el.rename.hidden = scratch;
    el.keep.hidden = !scratch;
    el.keep.disabled = !count;
    if (document.activeElement !== el.name) el.name.value = titleOf();
    if (document.activeElement !== el.tempo) el.tempo.value = String(song.tempo);
    el.tempoDown.disabled = song.tempo <= MIN_TEMPO;
    el.tempoUp.disabled = song.tempo >= MAX_TEMPO;
    if (el.tempoSlider && document.activeElement !== el.tempoSlider) el.tempoSlider.value = stopFor(song.tempo, TEMPO_STOPS);
    el.tempoSlider?.setAttribute('aria-valuetext', `${song.tempo} BPM`);
    renderTempoOpen();
    if (el.tempoSheet.open) renderTempoSheet();
    if (picked && !pickableById(picked)) picked = null;
    renderStrip();
    const list = pickable();
    el.empty.hidden = count > 0 && !!list.length;
    el.empty.textContent = !list.length
      ? 'No beats yet. Make one in 🥁 Beats: it shows up here.'
      : picked ? `Now tap a spot on a lane to put “${beatName(picked)}” there.` : 'Pick a beat above, then tap a spot on a lane.';
    renderLanes();
    renderSelection();
    el.addLane.disabled = song.lanes.length >= MAX_LANES;
    el.stepUndo.hidden = !undoSteps.length;   // only when there is something to take back (🆕 New has its own Undo line)
    const any = song.lanes.some((l) => l.blocks.some((b) => beatById(b.beatId)));
    el.play.disabled = !any && !playing();
    el.sound.disabled = !any;
    el.audio.disabled = !any;
    audioSaver?.reset();   // a file made for the song as it was, waiting to be sent, is forgotten
  }

  // The strip of the person's beats, as the pattern chips look: a tap picks
  // one (pressed), a second tap puts it down.
  function renderStrip() {
    const list = pickable();
    el.strip.replaceChildren(...list.map((beat) => {
      const b = button('beat-chip song-chip');
      const name = beatName(beat.id);
      b.dataset.beat = beat.id;
      b.setAttribute('aria-pressed', String(picked === beat.id));
      b.setAttribute('aria-label', picked === beat.id ? `${name}, picked: tap a spot on a lane to put it there`
        : isScratchBeat(beat) ? `Pick ${name}: it is kept in 🗂️ Beats when it goes on a lane` : `Pick ${name}`);
      b.classList.toggle('scratch', isScratchBeat(beat));
      const color = deps.beatColor?.(beat);
      if (color) b.style.setProperty('--chip', color);
      b.append(make('span', 'chip-name', name));
      return b;
    }));
    el.strip.hidden = !list.length;
  }

  // The lanes: a ruler of bar numbers, then each lane's head (its picture
  // and name, its speaker) and its track of bars with the blocks on it.
  // Bars enough to fill the lanes' box on a wide screen, in lines of four.
  function fillBars() {
    const width = el.lanes.clientWidth;
    if (!(width > 0)) return 0;   // hidden, or not laid out yet
    const css = globalThis.getComputedStyle?.(el.lanes);
    if (typeof css?.getPropertyValue !== 'function') return 0;
    const barW = parseFloat(css.getPropertyValue('--bar-w'));
    const headW = parseFloat(css.getPropertyValue('--head-w'));
    if (!(barW > 0) || !(headW >= 0)) return 0;
    return Math.min(MAX_SONG_BARS, Math.floor((width - headW) / barW / 4) * 4);
  }

  function renderLanes() {
    const lastMark = tempoMarks().at(-1)?.bar ?? 0;
    const bars = Math.min(MAX_SONG_BARS, Math.max(viewBars(song.lanes, stepsOf), fillBars(), Math.ceil(lastMark / 4) * 4));
    el.lanes.style.setProperty('--bars', String(bars));
    el.lanes.style.setProperty('--lanes', String(song.lanes.length));
    el.lanes.classList.toggle('has-marks', tempoMarks().length > 0);
    const ruler = make('div', 'song-ruler');
    const corner = make('span', 'lane-corner', 'Bar');
    corner.setAttribute('aria-hidden', 'true');
    const marks = make('div', 'ruler-track');
    marks.setAttribute('role', 'group');
    marks.setAttribute('aria-label', 'Bars: tap one to play from there');
    for (let b = 0; b < bars; b++) {
      const m = button('ruler-bar', String(b + 1), b === startBar ? `Bar ${b + 1}, ▶ Play song starts here` : `Play from bar ${b + 1}`);
      m.dataset.startBar = b;
      m.setAttribute('aria-pressed', String(b === startBar));
      m.tabIndex = b === startBar ? 0 : -1;
      marks.append(m);
    }
    ruler.append(corner, marks);
    const rows = song.lanes.map((lane, li) => {
      const row = make('div', 'song-lane');
      row.dataset.lane = li;
      row.classList.toggle('muted', lane.muted || lane.volume === 0);
      const head = make('div', 'lane-head');
      const pick = button('lane-pick', undefined, `${lane.name} lane: rename it or pick its picture`);
      pick.dataset.lanePick = li;
      pick.append(make('span', 'lane-emoji', lane.emoji), make('span', 'lane-name', lane.name));
      head.append(pick, makeSpeaker(li, speakerState(li), 'lane-vol'));
      const track = make('div', 'lane-track');
      track.dataset.track = li;
      track.tabIndex = 0;
      track.setAttribute('role', 'group');
      track.setAttribute('aria-label', trackLabel(li));
      const at = cursor.get(li) ?? 0;
      for (let b = 0; b < bars; b++) {
        const cell = make('span', 'lane-cell');
        cell.dataset.bar = b;
        if (b % 4 === 0) cell.classList.add('line');
        if (b === at) cell.classList.add('cursor');
        track.append(cell);
      }
      lane.blocks.forEach((block, bi) => {
        const beat = beatById(block.beatId);
        const span = blockSpan(block, stepsOf);
        const chosen = sel?.lane === li && sel.block === bi;
        const b = button('song-block');
        b.dataset.block = `${li}:${bi}`;
        b.style.setProperty('--at', String(span.start));
        b.style.setProperty('--len', String(span.end - span.start));
        const color = beat && deps.beatColor?.(beat);
        if (color) b.style.setProperty('--chip', color);
        b.classList.toggle('gone', !beat);
        b.classList.toggle('chosen', chosen);
        b.classList.toggle('now', shown.has(`${li}:${bi}`));
        b.setAttribute('aria-pressed', String(chosen));
        b.setAttribute('aria-label', `${beatName(block.beatId)} on ${lane.name}, bar ${block.bar + 1}, plays ${timesWords(block.times)}${chosen ? ', selected' : ''}`);
        b.append(make('span', 'block-name', beatName(block.beatId)));
        if (block.times > 1) b.append(make('span', 'block-times', `×${block.times}`));
        track.append(b);
        if (chosen) {
          // Its end, to drag: further repeats it more, back repeats it less.
          const grip = make('span', 'block-grip', '⟷');
          grip.dataset.grip = `${li}:${bi}`;
          grip.style.setProperty('--at', String(span.end));
          grip.setAttribute('aria-hidden', 'true');
          grip.title = 'Drag to repeat it more or less';
          track.append(grip);
        }
      });
      row.append(head, track);
      return row;
    });
    const head = make('div', 'song-playhead');
    head.setAttribute('aria-hidden', 'true');
    head.hidden = !playing();
    const grid = make('div', 'song-grid');
    grid.append(...(tempoMarks().length ? [renderMarks()] : []), ruler, ...rows, head);
    const keep = document.activeElement;
    const focusKey = keep?.dataset?.track !== undefined ? `[data-track="${keep.dataset.track}"]`
      : keep?.dataset?.block ? `[data-block="${keep.dataset.block}"]`
        : keep?.dataset?.startBar !== undefined ? `[data-start-bar="${keep.dataset.startBar}"]`
          : keep?.dataset?.tempoBar !== undefined ? `[data-tempo-bar="${keep.dataset.tempoBar}"]`
          : keep?.dataset?.lanePick !== undefined ? `[data-lane-pick="${keep.dataset.lanePick}"]`
            : keep?.dataset?.speaker !== undefined && el.lanes.contains(keep) ? `[data-speaker="${keep.dataset.speaker}"]` : null;
    el.lanes.replaceChildren(grid);
    if (focusKey) el.lanes.querySelector(focusKey)?.focus({ preventScroll: true });
    speakers.refresh();
    showPlayhead();
  }

  // The tempo marks, over the ruler: a BPM chip above each one's bar. With
  // Advanced, a chip opens its mark to change or remove; else it only says.
  function renderMarks() {
    const row = make('div', 'song-marks');
    const corner = make('span', 'lane-corner', 'BPM');
    corner.setAttribute('aria-hidden', 'true');
    const track = make('div', 'marks-track');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Tempo changes');
    const edits = advanced();
    for (const m of tempoMarks()) {
      const words = `From bar ${m.bar}: ${m.bpm} BPM`;
      const chip = edits ? button('tempo-chip', undefined, `${words}. Tap to change it`) : make('span', 'tempo-chip');
      if (!edits) { chip.setAttribute('role', 'img'); chip.setAttribute('aria-label', words); chip.title = words; }
      chip.dataset.tempoBar = m.bar;
      chip.style.setProperty('--at', String(m.bar - 1));
      chip.append(make('span', 'tempo-chip-bpm', String(m.bpm)));
      track.append(chip);
    }
    row.append(corner, track);
    return row;
  }

  function trackLabel(li) {
    const lane = song.lanes[li];
    const bar = cursor.get(li) ?? 0;
    const i = blockAt(lane, bar, stepsOf);
    const what = i >= 0 ? `${beatName(lane.blocks[i].beatId)}, Enter selects it` : picked ? `empty, Enter puts ${beatName(picked)} here` : 'empty';
    return `${lane.name} lane, bar ${bar + 1}: ${what}. Left and right arrows move.`;
  }

  // The selected block's bar under the lanes: what it is, ➖ ➕ its repeats,
  // 🗑️ (asks first), ✕ to let it go.
  function renderSelection() {
    const block = sel && song.lanes[sel.lane]?.blocks[sel.block];
    if (!block) sel = null;
    el.sel.hidden = !block;
    if (!block) return;
    const lane = song.lanes[sel.lane];
    el.selText.textContent = `${lane.emoji} ${beatName(block.beatId)} · plays ${timesWords(block.times)}`;
    el.less.disabled = block.times <= 1;
    el.more.disabled = block.times >= maxTimes(lane, sel.block, stepsOf);
    // ✏️ opens this block's beat in 🥁 Beats; a beat the song uses more than once asks first.
    const uses = usesOf(block.beatId);
    el.edit.disabled = !pickableById(block.beatId);
    el.edit.setAttribute('aria-label', `Edit ${beatName(block.beatId)} in 🥁 Beats`);
    const asking = editAsked === `${sel.lane}:${sel.block}` && uses > 1;
    if (!asking) editAsked = null;
    el.editAsk.hidden = !asking;
    el.edit.setAttribute('aria-expanded', String(asking));
    el.editAskText.textContent = `Used ${uses}× in this song`;
    el.remove.textContent = removeAsked ? 'Remove?' : '🗑️';
    el.remove.classList.toggle('armed', removeAsked);
    el.remove.setAttribute('aria-label', removeAsked ? `Tap again to take ${beatName(block.beatId)} off ${lane.name}` : `Take ${beatName(block.beatId)} off ${lane.name}`);
  }

  // The playhead, over every lane, and the blocks playing lit.
  // Where the song is, in seconds, as heard: the audio clock less the
  // output's delay, so the line and lit blocks keep with the sound (as Beats' playhead).
  function heardAt() {
    const ctx = audio.context();
    return ctx.currentTime - outputDelay(ctx) - t0 + from;
  }
  function showPlayhead() {
    const line = el.lanes.querySelector('.song-playhead');
    if (!line) return;
    const on = playing() && !!planned;
    line.hidden = !on;
    if (!on) return;
    const t = heardAt();
    line.style.setProperty('--at', String(planned.clock.barAt(Math.max(0, t))));
  }

  // ── Editing ──

  function disarm(draw = true) {
    clearTimeout(armTimer);
    if (removeAsked) { removeAsked = false; if (draw) renderSelection(); }
  }
  function select(li, bi) {
    disarm(false);
    sel = li === null ? null : { lane: li, block: bi };
    if (sel) cursor.set(li, song.lanes[li].blocks[bi].bar);
    render();
  }

  // A tap on bar `bar` of lane `li` (or Enter there): the block there is
  // selected; else the picked beat goes there.
  function tapSpot(li, bar) {
    const lane = song.lanes[li];
    cursor.set(li, bar);
    const at = blockAt(lane, bar, stepsOf);
    if (at >= 0) { select(li, at); return; }
    if (!picked) {
      sel = null;
      disarm(false);
      note(pickable().length ? 'Pick a beat above first, then tap the spot.' : 'Make a beat in 🥁 Beats first.');
      render();
      return;
    }
    let placed = placeBlock(lane, bar, picked, stepsOf);
    if (placed.why) {
      note(placed.why === 'full' ? `${lane.name} is full. Try another lane.`
        : `No room there: “${beatName(picked)}” is longer than the gap. Try a spot further along.`);
      return;
    }
    stop();
    let kept = '';
    if (isScratchBeat(pickableById(picked))) {
      // The scratch goes into 🗂️ Beats as the block goes in; the block holds
      // the kept beat, which stays when the scratch is emptied or replaced.
      const keptId = deps.keepScratch?.(personId);
      if (!keptId || !beatById(keptId)) { note('Finish recording first, then put the scratch beat on a lane.'); render(); return; }
      picked = keptId;
      placed = placeBlock(lane, bar, picked, stepsOf);
      kept = ` Kept in 🗂️ Beats as “${beatName(picked)}”.`;
    }
    note('');
    countPlay('blocks');
    edit(() => {
      // The first beat in an empty song sets its tempo.
      if (!blockCount(song)) song.tempo = cleanTempo(beatById(picked)?.bpm);
      song.lanes[li] = placed.lane;
    });
    select(li, placed.index);
    deps.announce?.(`Put ${beatName(picked)} on ${lane.name} at bar ${bar + 1}.${kept}`);
  }

  function changeTimes(by) {
    if (!sel) return;
    const lane = song.lanes[sel.lane];
    const block = lane.blocks[sel.block];
    const nextLane = setTimes(lane, sel.block, block.times + by, stepsOf);
    if (nextLane === lane) return;
    stop();
    edit(() => { song.lanes[sel.lane] = nextLane; });
    render();
  }

  // How many blocks, on any lane, play this beat.
  const usesOf = (beatId) => song.lanes.reduce((n, l) => n + l.blocks.filter((b) => b.beatId === beatId).length, 0);

  // ✏️ on the selected block: its beat opens in 🥁 Beats at once when only this block
  // plays it; else a question first (Edit it changes every block, Edit a copy only this one).
  function editSelected() {
    if (!sel) return;
    const block = song.lanes[sel.lane].blocks[sel.block];
    if (!pickableById(block.beatId)) return;
    if (usesOf(block.beatId) <= 1) { openForEdit(block.beatId); return; }
    editAsked = editAsked ? null : `${sel.lane}:${sel.block}`;
    renderSelection();
  }
  function editCopy() {
    if (!sel) return;
    const block = song.lanes[sel.lane].blocks[sel.block];
    const copyId = seq.copySaved(block.beatId);
    if (!copyId) return;
    stop();
    edit(() => { block.beatId = copyId; });
    openForEdit(copyId);
  }
  // Hands the beat to the app, with where to come back to.
  function openForEdit(beatId) {
    editAsked = null;
    const back = { lane: sel.lane, block: sel.block, x: el.lanes.scrollLeft, y: window.scrollY };
    stop();
    deps.editBeat?.(beatId, back);
  }
  // Back from 🥁 Beats: the same block selected, the lanes and page scrolled as they were.
  function restoreSelection(back) {
    if (!back || !song) return;
    const lane = song.lanes[back.lane];
    if (lane?.blocks[back.block]) select(back.lane, back.block);
    el.lanes.scrollLeft = back.x ?? 0;
    window.scrollTo(0, back.y ?? 0);
  }

  function removeSelected() {
    if (!sel) return;
    if (!removeAsked) {
      removeAsked = true;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => disarm(), ARM_MS);
      renderSelection();
      return;
    }
    clearTimeout(armTimer);
    removeAsked = false;
    const { lane: li, block: bi } = sel;
    const name = beatName(song.lanes[li].blocks[bi].beatId);
    stop();
    edit(() => { song.lanes[li] = removeBlock(song.lanes[li], bi); });
    sel = null;
    render();
    el.lanes.querySelector(`[data-track="${li}"]`)?.focus();
    deps.announce?.(`Took ${name} off ${song.lanes[li].name}. ↩️ Undo brings it back.`);
  }

  el.strip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-beat]');
    if (!b) return;
    picked = picked === b.dataset.beat ? null : b.dataset.beat;
    note('');
    render();
    el.strip.querySelector(`[data-beat="${CSS.escape(b.dataset.beat)}"]`)?.focus();
  });

  let swallow = false;   // the click that ends a drag is not a tap
  const laneFollow = follower(el.lanes);   // follow.js
  el.lanes.addEventListener('click', (e) => {
    if (swallow) { swallow = false; return; }
    if (e.target.closest('[data-speaker]')) return;   // the speakers' own controls
    const chip = e.target.closest('button[data-tempo-bar]');
    if (chip) { openTempo(Number(chip.dataset.tempoBar)); return; }
    const start = e.target.closest('[data-start-bar]');
    if (start) {
      startBar = Number(start.dataset.startBar);
      const was = playing();
      stop();
      render();
      el.lanes.querySelector(`[data-start-bar="${startBar}"]`)?.focus();
      if (was) play();
      return;
    }
    const pick = e.target.closest('[data-lane-pick]');
    if (pick) { openLane(Number(pick.dataset.lanePick)); return; }
    if (e.target.closest('[data-grip]')) return;
    const block = e.target.closest('[data-block]');
    if (block) {
      const [li, bi] = block.dataset.block.split(':').map(Number);
      if (sel?.lane === li && sel.block === bi) return;
      select(li, bi);
      el.lanes.querySelector(`[data-block="${li}:${bi}"]`)?.focus();
      return;
    }
    const cell = e.target.closest('[data-bar]');
    const track = e.target.closest('[data-track]');
    if (cell && track) tapSpot(Number(track.dataset.track), Number(cell.dataset.bar));
  });

  // The keyboard: on a lane, ← → move along it and Enter (or Space) taps the
  // bar there; on a block, ➖ ➕ (- +) repeat it and Delete takes it off;
  // on the ruler, ← → move between bars.
  el.lanes.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('[data-speaker]')) return;
    const mark = e.target.closest?.('[data-start-bar]');
    if (mark && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const marks = el.lanes.querySelectorAll('[data-start-bar]');
      const i = Math.min(marks.length - 1, Math.max(0, Number(mark.dataset.startBar) + (e.key === 'ArrowRight' ? 1 : -1)));
      marks[i]?.focus();
      return;
    }
    const block = e.target.closest?.('[data-block]');
    if (block) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); changeTimes(1); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); changeTimes(-1); return; }
      if (e.key === 'Escape' && sel) { e.preventDefault(); const t = sel.lane; select(null); el.lanes.querySelector(`[data-track="${t}"]`)?.focus(); }
      return;
    }
    const track = e.target.closest?.('[data-track]');
    if (!track || e.target !== track) return;
    const li = Number(track.dataset.track);
    const bars = el.lanes.querySelectorAll(`[data-track="${li}"] [data-bar]`).length;
    const at = cursor.get(li) ?? 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? bars - 1 : Math.min(bars - 1, Math.max(0, at + (e.key === 'ArrowRight' ? 1 : -1)));
      cursor.set(li, to);
      for (const c of track.querySelectorAll('[data-bar]')) c.classList.toggle('cursor', Number(c.dataset.bar) === to);
      track.setAttribute('aria-label', trackLabel(li));
      track.querySelector(`[data-bar="${to}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tapSpot(li, at);
      const chosen = sel && sel.lane === li ? el.lanes.querySelector(`[data-block="${li}:${sel.block}"]`) : null;
      (chosen ?? el.lanes.querySelector(`[data-track="${li}"]`))?.focus();
    }
  });

  // Dragging the selected block's end: its repeats follow the finger, one
  // ↩️ Undo step for the whole drag.
  let drag = null;
  el.lanes.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest?.('[data-grip]');
    if (!grip || e.button !== 0) return;
    const [li, bi] = grip.dataset.grip.split(':').map(Number);
    const track = grip.closest('[data-track]');
    const width = track.getBoundingClientRect().width;
    const bars = track.querySelectorAll('[data-bar]').length;
    if (!(width > 0) || !bars) return;
    e.preventDefault();
    stop();
    const block = song.lanes[li].blocks[bi];
    drag = { li, bi, x: e.clientX, end: blockSpan(block, stepsOf).end, barW: width / bars, before: snapshot(), moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const lane = song.lanes[drag.li];
    const block = lane.blocks[drag.bi];
    if (!block) { drag = null; return; }
    const want = timesForEnd(block, drag.end + (e.clientX - drag.x) / drag.barW, stepsOf);
    const nextLane = setTimes(lane, drag.bi, want, stepsOf);
    if (nextLane === lane) return;
    drag.moved = true;
    song.lanes[drag.li] = nextLane;
    render();
  });
  const endDrag = () => {
    if (!drag) return;
    const { moved, before } = drag;
    drag = null;
    if (!moved) return;
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    undoSteps.push(before);
    if (undoSteps.length > MAX_UNDO) undoSteps.shift();
    save();
    render();
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // A lane's speaker: tap mutes, hold or drag sets its loudness (row-volume.js).
  function speakerState(li) {
    const lane = song?.lanes[Number(li)];
    return lane ? { level: lane.volume, muted: lane.muted, name: `${lane.name} lane` } : null;
  }
  function liveLevel(li) {
    const lane = song.lanes[li];
    const g = laneGains[li]?.gain;
    if (!g) return;
    const v = lane.muted ? 0 : cleanVolume(lane.volume);
    const ctx = audio.context();
    if (g.setTargetAtTime) g.setTargetAtTime(v, ctx.currentTime, 0.02); else g.value = v;
  }
  function redrawSpeaker(li) {
    const b = el.lanes.querySelector(`[data-speaker="${li}"]`);
    if (b) drawSpeaker(b, speakerState(li));
    b?.closest('.song-lane')?.classList.toggle('muted', song.lanes[li].muted || song.lanes[li].volume === 0);
  }
  const speakers = speakerControls(el.lanes, {
    state: (key) => speakerState(key),
    toggle: (key) => {
      const li = Number(key);
      song.lanes[li].muted = !song.lanes[li].muted;
      liveLevel(li);
      save();
      redrawSpeaker(li);
    },
    change: (key, level, done) => {
      const li = Number(key);
      song.lanes[li].volume = cleanVolume(level);
      if (level > 0) song.lanes[li].muted = false;
      liveLevel(li);
      if (done) save();
      redrawSpeaker(li);
    },
  });

  el.less.addEventListener('click', () => changeTimes(-1));
  el.more.addEventListener('click', () => changeTimes(1));
  el.remove.addEventListener('click', removeSelected);
  el.edit.addEventListener('click', editSelected);
  el.editIt.addEventListener('click', () => { const b = sel && song.lanes[sel.lane].blocks[sel.block]; if (b) openForEdit(b.beatId); });
  el.editCopy.addEventListener('click', editCopy);
  el.selClose.addEventListener('click', () => {
    const li = sel?.lane;
    select(null);
    if (li !== undefined) el.lanes.querySelector(`[data-track="${li}"]`)?.focus();
  });
  el.addLane.addEventListener('click', () => {
    if (song.lanes.length >= MAX_LANES) return;
    edit(() => { song.lanes.push(defaultLane(song.lanes.length)); });
    render();
    const li = song.lanes.length - 1;
    el.lanes.scrollTop = el.lanes.scrollHeight;   // the new lane in view on a phone, where the box scrolls down
    deps.announce?.(`Added a lane: ${laneLabel(li)}.`);
    if (el.addLane.disabled) el.stepUndo.focus();
  });
  el.stepUndo.addEventListener('click', () => {
    undoStep();
    if (el.stepUndo.hidden) el.addLane.focus();
  });

  // The song's tempo: typed (on the deck, or in 🎼 Tempo), ➖ ➕ to the next
  // common tempo, or the slider in a phone's tempo line, the same three ways
  // as Beats' (Ben, 2026-10-26: "exactly the same for how they manage BPM").
  // Both fields show the tempo kept, so a number out of range typed with
  // Enter (the field keeps focus) shows what it became.
  function setTempo(v) {
    const t = cleanTempo(v);
    el.tempo.value = String(t);
    el.tempoBase.value = String(t);
    if (t === song.tempo) return;
    stop();
    edit(() => { song.tempo = t; });
    render();
  }
  el.tempo.addEventListener('change', () => setTempo(Number(el.tempo.value)));
  el.tempo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.tempo.blur(); setTempo(Number(el.tempo.value)); } });
  el.tempoDown.addEventListener('click', () => setTempo(COMMON_BPMS.findLast((t) => t < song.tempo) ?? MIN_TEMPO));
  el.tempoUp.addEventListener('click', () => setTempo(COMMON_BPMS.find((t) => t > song.tempo) ?? MAX_TEMPO));
  // The slider, with Beats' stops: the key reads it while it moves; the song
  // takes it once it lets go, one ↩️ Undo step and one save for the drag.
  if (el.tempoSlider) {
    el.tempoSlider.min = 0;
    el.tempoSlider.max = TEMPO_STOPS.length - 1;
    el.tempoSlider.addEventListener('input', () => {
      sliding = TEMPO_STOPS[Number(el.tempoSlider.value)] ?? null;
      el.tempoSlider.setAttribute('aria-valuetext', `${sliding} BPM`);
      songKey?.show();
    });
    el.tempoSlider.addEventListener('change', () => {
      const to = sliding;
      sliding = null;
      if (to != null) setTempo(to);
      songKey?.show();
    });
  }

  // ── 🎼 Tempo (Advanced): the song's own tempo and its tempo marks ──
  //
  // With Advanced on, the tempo on the deck is a button that opens this
  // sheet: the tempo from bar 1 (typed), each mark (tap to change), and ＋
  // Tempo change, a bar (2 on) and a BPM. A chip in the ruler opens its mark
  // straight away. 🗑️ Remove asks first and offers ↩️ Undo; every change is
  // a step of the song's ↩️ Undo. Without Advanced the deck keeps its typed
  // tempo, and marks only show (renderMarks).
  let editing = null;         // the mark open: {bar} to change, {bar: null} for a new one; null shows the list
  let fromChip = false;       // opened from a chip: Done and Remove close the sheet
  let markRemoveAsked = false;
  let markArm = 0;

  // The deck's tempo: typed (Regular), or a button saying it (Advanced).
  function renderTempoOpen() {
    songKey?.show();
    const adv = advanced();
    el.tempoField.hidden = adv;
    el.tempoOpen.hidden = !adv;
    if (!adv) return;
    const n = tempoMarks().length;
    const changes = `${n} tempo ${n === 1 ? 'change' : 'changes'}`;
    el.tempoOpen.replaceChildren(make('span', 'tempo-open-bpm', `${song.tempo} BPM`), ...(n ? [make('span', 'tempo-open-marks', `${n} ${n === 1 ? 'change' : 'changes'}`)] : []));
    el.tempoOpen.setAttribute('aria-label', `Song tempo ${song.tempo} BPM${n ? `, ${changes}` : ''}: tap to change it or add a tempo change`);
  }

  function renderTempoSheet() {
    const list = !editing;
    el.tempoListView.hidden = !list;
    el.tempoEditView.hidden = list;
    el.tempoTitle.textContent = list ? '🎼 Tempo' : editing.bar ? `Tempo change at bar ${editing.bar}` : '＋ Tempo change';
    if (list) {
      if (document.activeElement !== el.tempoBase) el.tempoBase.value = String(song.tempo);
      el.tempoMarks.replaceChildren(...tempoMarks().map((m) => {
        const li = make('li');
        const b = button('tempo-mark', undefined, `From bar ${m.bar}: ${m.bpm} BPM. Tap to change it`);
        b.dataset.mark = m.bar;
        b.append(make('span', 'tempo-mark-bar', `From bar ${m.bar}`), make('span', 'tempo-mark-bpm', `${m.bpm} BPM`));
        li.append(b);
        return li;
      }));
      el.tempoMarks.hidden = !tempoMarks().length;
      el.tempoAdd.disabled = tempoMarks().length >= MAX_TEMPO_MARKS;
      return;
    }
    el.tempoRemove.hidden = !editing.bar;
    el.tempoRemove.textContent = markRemoveAsked ? 'Remove?' : '🗑️ Remove';
    el.tempoRemove.classList.toggle('armed', markRemoveAsked);
    el.tempoRemove.setAttribute('aria-label', markRemoveAsked ? `Tap again to take out the tempo change at bar ${editing.bar}` : `Take out the tempo change at bar ${editing.bar}`);
    el.tempoDone.textContent = editing.bar ? '✓ Done' : '＋ Add';
  }

  // Opens the sheet: on its list, or (from a chip) on the mark at `bar`.
  function openTempo(bar) {
    if (!advanced() || !song) return;
    fromChip = bar !== undefined;
    if (fromChip) editMark(bar); else { editing = null; disarmMark(); }
    renderTempoSheet();
    openDialog(el.tempoSheet, {
      focus: fromChip ? el.tempoBpm : el.tempoBase,
      returnTo: () => (fromChip && el.lanes.querySelector(`[data-tempo-bar="${bar}"]`)) || el.tempoOpen,
    });
  }

  // Where a new mark goes first: the bar ▶ Play song starts at (tapped in
  // the ruler), else four bars after the last mark; the next free bar from there.
  function freeBar() {
    const taken = new Set(tempoMarks().map((m) => m.bar));
    let bar = Math.min(MAX_SONG_BARS, Math.max(2, startBar > 0 ? startBar + 1 : (tempoMarks().at(-1)?.bar ?? 1) + 4));
    for (let i = 0; i < MAX_SONG_BARS && taken.has(bar); i++) bar = bar >= MAX_SONG_BARS ? 2 : bar + 1;
    return bar;
  }
  // The mark at `bar` (or a new one, null) in the sheet's fields.
  function editMark(bar) {
    const m = tempoMarks().find((x) => x.bar === bar);
    editing = { bar: m ? m.bar : null };
    const at = m ? m.bar : freeBar();
    el.tempoBar.value = String(at);
    el.tempoBpm.value = String(m ? m.bpm : tempoAt(song, at));
    el.tempoHint.textContent = '';
    disarmMark();
  }
  function disarmMark() {
    clearTimeout(markArm);
    markRemoveAsked = false;
  }
  // Back to the list, or shut when it came from a chip.
  function finishMark() {
    editing = null;
    disarmMark();
    if (fromChip) el.tempoSheet.close();
    render();
    if (el.tempoSheet.open) el.tempoAdd.focus();
  }

  function doneMark() {
    if (!editing) return;
    const bar = Number(el.tempoBar.value);
    const bpm = Math.round(Number(el.tempoBpm.value));
    if (!Number.isInteger(bar) || bar < 2 || bar > MAX_SONG_BARS) {
      el.tempoHint.textContent = `Pick a bar from 2 to ${MAX_SONG_BARS}. Bar 1 plays at the song’s own tempo.`;
      el.tempoBar.focus();
      return;
    }
    if (!(bpm >= MIN_TEMPO && bpm <= MAX_TEMPO)) {
      el.tempoHint.textContent = `Pick a tempo from ${MIN_TEMPO} to ${MAX_TEMPO} BPM.`;
      el.tempoBpm.focus();
      return;
    }
    const was = editing.bar;
    const next = putTempo(tempoMarks(), { bar, bpm }, was);
    if (JSON.stringify(next) !== JSON.stringify(tempoMarks())) {
      stop();
      edit(() => setMarks(next));
      logEvent('song', { action: 'tempo', marks: next.length });
      deps.announce?.(`From bar ${bar}, the song plays at ${bpm} BPM.`);
    }
    finishMark();
  }

  // 🗑️ Remove: the first tap asks, the second takes the mark out, with ↩️
  // Undo in the banner (the song's own Undo step, while nothing else changed).
  function removeMark() {
    if (!editing?.bar) return;
    if (!markRemoveAsked) {
      markRemoveAsked = true;
      clearTimeout(markArm);
      markArm = setTimeout(() => { markRemoveAsked = false; if (el.tempoSheet.open && editing) renderTempoSheet(); }, ARM_MS);
      renderTempoSheet();
      return;
    }
    const { bar } = editing;
    stop();
    edit(() => setMarks(removeTempo(tempoMarks(), bar)));
    logEvent('song', { action: 'tempo', marks: tempoMarks().length });
    const depth = undoSteps.length;
    finishMark();
    noteBanner = showBanner(`Took out the tempo change at bar ${bar}.`, {
      action: { label: '↩️ Undo', fn: () => { if (undoSteps.length === depth) undoStep(); } },
      ms: UNDO_MS,
      focusBack: () => (el.tempoSheet.open ? el.tempoAdd : el.tempoOpen),
    });
  }

  el.tempoOpen.addEventListener('click', () => openTempo());
  el.tempoBase.addEventListener('change', () => setTempo(Number(el.tempoBase.value)));
  el.tempoBase.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setTempo(Number(el.tempoBase.value)); } });
  el.tempoMarks.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mark]');
    if (!b) return;
    editMark(Number(b.dataset.mark));
    renderTempoSheet();
    el.tempoBpm.focus();
  });
  el.tempoAdd.addEventListener('click', () => {
    editMark(null);
    renderTempoSheet();
    el.tempoBar.focus();
  });
  el.tempoDone.addEventListener('click', doneMark);
  el.tempoRemove.addEventListener('click', removeMark);
  el.tempoBack.addEventListener('click', () => {
    editing = null;
    fromChip = false;
    disarmMark();
    renderTempoSheet();
    el.tempoAdd.focus();
  });
  for (const field of [el.tempoBar, el.tempoBpm]) {
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doneMark(); } });
  }
  el.tempoSheet.addEventListener('close', () => { editing = null; disarmMark(); });
  setupDialog(el.tempoSheet);
  // Advanced on or off: the deck's tempo and the chips change with it.
  onSetting('advancedBeats', () => {
    if (!advanced() && el.tempoSheet.open) el.tempoSheet.close();
    render();
  });

  // A name typed into the scratch song's title: kept under it now if it
  // has blocks; an empty scratch holds the name until its first block (save).
  function nameScratch(wanted) {
    if (wanted !== titleOf()) {
      wantedName = wanted;
      if (blockCount(song)) keep();
      else deps.announce?.(`Named “${wanted}”. It goes in 🗂️ Songs when you add a beat.`);
    }
    render();
    el.name.value = titleOf();   // still focused while it changes
  }
  el.name.addEventListener('change', () => {
    const wanted = cutName(el.name.value.trim());
    if (!song) return;
    if (onScratch()) {
      if (wanted) nameScratch(wanted);
      else el.name.value = titleOf();
      return;
    }
    if (wanted) { song.name = uniqueSongName(wanted, songs(), song.id); save(); }
    el.name.value = song.name;
  });
  el.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.name.blur(); } });
  // "Scratch song" is all chosen, so typing replaces it.
  el.name.addEventListener('focus', () => { if (onScratch() && !wantedName) el.name.select?.(); });
  el.rename.addEventListener('click', () => { el.name.focus(); el.name.select?.(); });
  el.newSong.addEventListener('click', newScratch);
  el.keep.addEventListener('click', keep);

  // ── A lane's name and picture ──

  let laneOpen = -1;
  function openLane(li) {
    laneOpen = li;
    const lane = song.lanes[li];
    el.laneTitle.textContent = `Lane ${li + 1}`;
    el.laneName.value = lane.name;
    laneAll.reset();
    renderLaneEmoji();
    openDialog(el.laneSheet, { focus: el.laneName, returnTo: () => el.lanes.querySelector(`[data-lane-pick="${li}"]`) });
  }
  function renderLaneEmoji() {
    const lane = song.lanes[laneOpen];
    if (!lane) return;
    el.laneGrid.replaceChildren(...withCurrent(LANE_EMOJI, lane.emoji).map((p) => {
      const b = button('', p, p);
      b.dataset.laneEmoji = p;
      b.setAttribute('aria-pressed', String(p === lane.emoji));
      return b;
    }), laneAll.button);
    laneAll.refresh();
  }
  function pickLaneEmoji(p) {
    const lane = song.lanes[laneOpen];
    if (!lane || lane.emoji === p) return;
    edit(() => { lane.emoji = p; });
    renderLaneEmoji();
    render();
  }
  const laneAll = emojiMore({
    grid: el.laneGrid,
    onPick: pickLaneEmoji,
    stateOf: (p) => ({ pressed: p === song?.lanes[laneOpen]?.emoji }),
  });
  el.laneGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lane-emoji]');
    if (b) pickLaneEmoji(b.dataset.laneEmoji);
  });
  el.laneName.addEventListener('change', () => {
    const lane = song.lanes[laneOpen];
    if (!lane) return;
    const wanted = cutName(el.laneName.value.trim(), MAX_LANE_NAME) || LANE_DEFAULTS[laneOpen % LANE_DEFAULTS.length].name;
    el.laneName.value = wanted;
    if (wanted === lane.name) return;
    edit(() => { lane.name = wanted; });
    render();
  });
  el.laneName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.laneName.dispatchEvent(new Event('change')); el.laneSheet.close(); } });
  setupDialog(el.laneSheet);

  // ── 🗂️ Songs: every saved song, to open, duplicate or delete ──

  let deleteAsked = null;
  el.open.addEventListener('click', () => {
    el.songsNote.textContent = '';
    deleteAsked = null;
    renderSongs();
    openDialog(el.songs, { returnTo: () => el.open });
  });
  function renderSongs() {
    const list = songs();
    el.songsEmpty.hidden = list.length > 0;
    el.songsList.replaceChildren(...list.map((item) => {
      const li = make('li', 'lib-beat');
      li.dataset.id = item.id;
      const isOpen = item.id === song?.id;
      li.classList.toggle('current', isOpen);
      const openBtn = button('lib-open song-open', undefined, isOpen ? `${item.name}, open now` : `Open ${item.name}`);
      openBtn.dataset.load = item.id;
      const text = make('span', 'lib-text');
      const shape = clean(item);
      const n = shape ? blockCount(shape) : 0;
      text.append(make('span', 'lib-name', item.name), make('span', 'lib-info', isOpen ? 'Open now' : n ? `${n} ${n === 1 ? 'block' : 'blocks'} · ${shape.tempo} BPM` : 'No beats yet'));
      openBtn.append(text);
      const dup = button('chip-dark', '⧉', `Duplicate ${item.name}`);
      dup.dataset.dup = item.id;
      const asking = deleteAsked === item.id;
      const del = button('chip-dark', asking ? 'Delete?' : '🗑️', asking ? `Tap again to delete ${item.name}` : `Delete ${item.name}`);
      del.dataset.delete = item.id;
      del.classList.toggle('armed', asking);
      li.append(openBtn, dup, del);
      return li;
    }));
  }
  el.songs.addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]');
    if (load) {
      const found = songs().find((x) => x.id === load.dataset.load);
      if (found && found.id !== song?.id) openSong(clean(found));
      el.songs.close();
      return;
    }
    const dup = e.target.closest('[data-dup]');
    if (dup) {
      const found = songs().find((x) => x.id === dup.dataset.dup);
      if (!found) return;
      const copy = { ...structuredClone(found), id: newId('song'), name: uniqueSongName(found.name, songs()), created: Date.now(), saved: Date.now() };
      deps.songs.put(copy);
      el.songsNote.textContent = `Made a copy: “${copy.name}”.`;
      renderSongs();
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      // Tap once to ask, again to delete.
      if (deleteAsked !== del.dataset.delete) { deleteAsked = del.dataset.delete; renderSongs(); return; }
      deleteAsked = null;
      const found = songs().find((x) => x.id === del.dataset.delete);
      deps.songs.remove(del.dataset.delete);
      el.songsNote.textContent = found ? `Deleted “${found.name}”.` : '';
      // Deleting the open song opens the scratch.
      if (found && found.id === song?.id) openSong(null);
      renderSongs();
      (el.songsList.querySelector('[data-load]') || el.songs.querySelector('[data-close]')).focus();
    }
  });
  setupDialog(el.songs);

  // ── Playing ──

  function laneGainsFor(ctx, dest, { live }) {
    return song.lanes.map((lane) => {
      const g = ctx.createGain();
      g.gain.value = lane.muted ? 0 : cleanVolume(lane.volume);
      g.connect(dest);
      if (live) g.live = true;
      return g;
    });
  }

  async function play() {
    if (playing() || !song) return;
    seq.stop();   // one thing plays at a time
    starting = true;
    const ctx = audio.wake();
    const plan0 = planSong(song, beatById, seq);
    from = Math.min(plan0.clock.barStart(startBar), plan0.seconds);
    const plan = from > 0 ? planSong(song, beatById, seq, { from }) : plan0;
    if (!plan.parts.length || from >= plan.seconds) { starting = false; return; }
    await seq.prepareBeats([...plan.plans.values()].map((p) => p.pattern));
    if (!starting) return;   // stopped while loading
    starting = false;
    planned = plan;
    shown = new Set();
    laneGains = laneGainsFor(ctx, audio.master, { live: true });
    mixEnds = [];
    for (const part of plan.parts) {
      const was = mixEnds.find((m) => m.lane === part.lane && m.beatId === part.beatId);
      if (was) was.end = Math.max(was.end, part.end);
      else mixEnds.push({ lane: part.lane, beatId: part.beatId, end: part.end });
    }
    t0 = ctx.currentTime + 0.1;
    // Each event with the beat it plays, the lane's gain it goes through, and
    // the key of the hits it may cut (the same row of the same beat on a lane).
    const events = plan.events.map((e) => ({ ...e, at: t0 + e.time, pattern: plan.plans.get(e.beatId).pattern, dest: laneGains[e.lane], key: `${e.lane}:${e.beatId}:${e.row}` }));
    logEvent('song', { action: 'play', lanes: song.lanes.length, blocks: blockCount(song), marks: tempoMarks().length, seconds: Math.round((plan.seconds - from) * 10) / 10 });
    run = engine.play({
      list: { events },
      // A muted lane sounds at no loudness, so lights and flashes keep to the lanes heard.
      onHit: (clipId, at, e) => {
        const lane = song.lanes[e.lane];
        if (!lane?.muted && cleanVolume(lane?.volume) > 0) deps.onHit?.(clipId, (at - audio.context().currentTime) * 1000);
      },
      afterTick,
      onStop: stop,   // taken over by another run: stop as ■ does
    });
    run.tick();
    raf = requestAnimationFrame(follow);
    laneFollow.start();
    el.play.setAttribute('aria-pressed', 'true');
    el.play.textContent = '■ Stop song';
    showPlayhead();
  }

  // After each tick of the engine's run.
  function afterTick() {
    const ctx = audio.context();
    // A lane's last block of a beat is over: that beat's mix there goes
    // (a 〰️ Warble or 🤖 Robot in it stops), not only at the song's end.
    const at = ctx.currentTime - t0 + from;
    mixEnds = mixEnds.filter((m) => {
      if (at <= m.end) return true;
      seq.endMix?.([laneGains[m.lane]], planned.plans.get(m.beatId)?.pattern);
      return false;
    });
    meter.run();
    if (heardAt() > planned.seconds + 0.2) stop();   // once its end is heard, so the line reaches it
  }

  // The playhead follows the clock; the lanes scroll to keep it in view, a
  // screen at a time, until the kid scrolls them (Ben, 2026-10-25, as Beats'
  // rows): then they stay put until the next ▶ Play song.
  function follow() {
    const t = heardAt();
    const now = playingAt(planned.parts, t);
    const key = [...now].join(',');
    if (key !== [...shown].join(',')) {
      shown = now;
      for (const b of el.lanes.querySelectorAll('[data-block]')) b.classList.toggle('now', shown.has(b.dataset.block));
    }
    showPlayhead();
    const line = el.lanes.querySelector('.song-playhead');
    const box = el.lanes;
    if (line && box.clientWidth) {
      const x = line.offsetLeft;
      const headW = el.lanes.querySelector('.lane-head')?.offsetWidth ?? 0;
      if (x > box.scrollLeft + box.clientWidth - 24 || x < box.scrollLeft + headW) laneFollow.to(Math.max(0, x - headW - 8));
    }
    raf = requestAnimationFrame(follow);
  }

  function stop() {
    starting = false;
    if (!run) return;
    cancelAnimationFrame(raf);
    raf = 0;
    run.stop();   // its timer, and its voices fade
    run = null;
    // Its mix graphs, and their 〰️ 🤖 oscillators, go too. The lane gains stay
    // connected until they have: a 🔁 Echo or ⛪ Hall tail rings out through them.
    const gains = laneGains;
    seq.endMix?.(gains);
    Promise.all([engine.rung((m) => gains.includes(m.dest)), new Promise((resolve) => setTimeout(resolve, 1000))])
      .then(() => { for (const g of gains) { try { g.disconnect?.(); } catch { /* gone */ } } });
    laneGains = [];
    mixEnds = [];
    shown = new Set();
    planned = null;
    for (const b of el.lanes.querySelectorAll('[data-block]')) b.classList.remove('now');
    showPlayhead();
    el.play.setAttribute('aria-pressed', 'false');
    el.play.textContent = '▶ Play song';
    logEvent('song', { action: 'stop' });
  }

  el.play.addEventListener('click', () => (playing() ? stop() : play()));
  // A wider or narrower window: the lanes fill it again (once the resizing stops).
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (song && el.lanes.isConnected && el.lanes.clientWidth) renderLanes(); }, 150);
  });

  // ── 🔊 Save as a sound: every lane mixed, to a new pad ──

  // The song through once, every unmuted lane mixed (and `ring` seconds more
  // past its end), or null when nothing in it makes a sound.
  async function renderSong(plan, ring = 0) {
    await seq.prepareBeats([...plan.plans.values()].map((p) => p.pattern));
    const rate = audio.context().sampleRate;
    const ctx = new OfflineAudioContext(2, Math.ceil((plan.seconds + ring) * rate), rate);
    const hits = soundSong(ctx, laneGainsFor(ctx, ctx.destination, { live: false }), plan, seq);
    return hits ? normalize(await ctx.startRendering()) : null;
  }

  const tooLong = (plan, what) => `This song is ${Math.round(plan.seconds)} seconds. Songs up to ${MAX_SONG_SECONDS / 60} minutes can be ${what}: take a block out, repeat one less, or speed up the tempo.`;

  async function saveAsSound() {
    if (!song) return;
    const plan = planSong(song, beatById, seq, { skipMuted: true });
    if (!plan.parts.length) return;
    if (plan.seconds > MAX_SONG_SECONDS) {
      note(tooLong(plan, 'a sound'));
      return;
    }
    el.sound.disabled = true;
    note('Making the sound…');
    try {
      const buffer = await renderSong(plan);
      if (!buffer) { note('This song has nothing to hear yet. Turn on some pills in its beats, or unmute a lane.'); return; }
      const label = deps.soundLabel(song.name);
      await deps.addClip({ label, blob: encodeWav(buffer) });
      note(`Added “${label}” to the pads (${buffer.duration.toFixed(1)} s).`);
      logEvent('song', { action: 'sound', seconds: Math.round(buffer.duration * 10) / 10 });
    } catch (err) {
      console.error('Making a sound from the song failed:', err);
      note(`That didn't work (${err.message || err.name}). Try again.`);
    } finally {
      el.sound.disabled = false;
    }
  }
  el.sound.addEventListener('click', saveAsSound);

  // ⬇️ Save as audio file: the song once through as a WAV, its last notes
  // ringing out up to 2 s, to the share sheet or a download. A scratch song
  // gets a fresh fun name, so five saves are not five "Scratch song.wav".
  async function makeAudioFile() {
    if (!song) return null;
    const plan = planSong(song, beatById, seq, { skipMuted: true });
    if (!plan.parts.length) return null;
    if (plan.seconds > MAX_SONG_SECONDS) { note(tooLong(plan, 'an audio file')); return null; }
    const buffer = await renderSong(plan, AUDIO_RING_SECONDS);
    if (!buffer) { note('This song has nothing to hear yet. Turn on some pills in its beats, or unmute a lane.'); return null; }
    const rate = buffer.sampleRate;
    const frames = audioFileFrames(buffer, Math.ceil(plan.seconds * rate), Math.ceil(AUDIO_RING_SECONDS * rate));
    const name = audioFileName(onScratch() ? deps.songName(songs().map((x) => x.name)) : song.name);
    return { blob: encodeWav(audioView(buffer, frames)), name, seconds: frames / rate };
  }
  audioSaver = createAudioSaver({
    button: el.audio,
    make: makeAudioFile,
    say: note,
    done: (how) => logEvent('song', { action: 'audio', how }),
  });

  // A song in 🗂️ Songs opened by id (🎧 From a song's 🎼 Open it as a
  // song); false when it is not there.
  function openSaved(id) {
    const saved = songs().find((x) => x.id === id);
    if (saved) openSong(clean(saved));
    return !!saved;
  }

  return { setPerson, render, play, stop, playing, song: () => song, openSaved, restoreSelection };
}
