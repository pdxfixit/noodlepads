// 🎼 Song, a screen of its own in the toolbar (ADR 0017): a playlist (ADR
// 0024). A song has its own tempo and up to 8 lanes; each lane holds blocks,
// a saved beat placed at a bar and repeated. Pick a beat in the strip of
// your beats, then tap a spot on a lane to drop it there; tap a block to
// select it, drag its end (or ➖ ➕) to repeat it, 🗑️ to take it out, ↩️ Undo
// for any of it. ▶ Play song plays every lane together at the song's tempo,
// from bar 1 or from a bar number tapped in the ruler. 🔊 Save as a sound
// renders it to a new pad. The pure part (placing, repeats, time) is
// playlist.js.
//
// Songs work like beats: each person has a list of them, one is open, and
// the open song saves itself on every change. IndexedDB `songs` holds each
// person's open song and `songbook` every song (ADR 0007). With nothing else
// open, the person's scratch song is (ADR 0020, scratch.js): in `songbook`
// under a reserved id, never listed; 💾 Keep makes it a song in 🗂️ My songs. The
// song bar renames it, starts a 🆕 New one, or 🗂️ My songs opens another (⧉
// duplicate, 🗑️ delete).
//
// Playback uses the Web Audio clock with the same lookahead as the beat
// maker: the whole song is planned up front as a list of timed hits, and a
// 25 ms tick schedules those due in the next 100 ms. Each lane plays through
// a gain of its own (its volume, or silent when muted), so a lane's speaker
// works while the song plays.

import { openDialog, setupDialog } from './dialogs.js';
import { encodeWav, normalize, barSteps, SIGNATURES } from './sequencer.js';
import { fadeStop } from './audio.js';
import { logEvent } from './log.js';
import { countUse } from './uses.js';
import { newId } from './util.js';
import { isScratchSong, songScratchOf, songScratchId, SCRATCH_NAME } from './scratch.js';
import { speakerControls, makeSpeaker, drawSpeaker, cleanVolume } from './row-volume.js';
import { emojiMore, withCurrent } from './emoji-more.js';
import {
  MAX_LANES, MAX_LANE_NAME, LANE_EMOJI, LANE_DEFAULTS, DEFAULT_TEMPO, MIN_TEMPO, MAX_TEMPO,
  cleanTempo, cleanLanes, defaultLane, slotsToLanes, legacySlots, blockSpan, blockAt, placeBlock, setTimes, maxTimes,
  timesForEnd, removeBlock, viewBars, playParts, playEvents, playingAt, MAX_SONG_BARS,
} from './playlist.js';

export const MAX_SONG_SECONDS = 180;     // the longest song that can be saved as a sound
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
const ARM_MS = 3000;                     // how long a Remove? waits for its second tap
const UNDO_MS = 8000;                    // how long 🆕 New's emptied scratch can be brought back
const MAX_UNDO = 40;                     // ↩️ Undo steps kept for the open song
const TEMPO_STEP = 5;                    // ➖ ➕ beside the song's tempo
export const SONG_ID = /^song-[a-z0-9-]{1,48}$/;

// Pills in one pass of a saved beat: its bar (its own time signature, 4/4
// when it has none) times its bars. Null when the beat is gone.
export function beatSteps(beat) {
  if (!beat) return null;
  const sig = Object.hasOwn(SIGNATURES, beat.signature) ? beat.signature : '4/4';
  return barSteps(sig) * ([1, 2, 4].includes(beat.bars) ? beat.bars : 1);
}

// A song as stored (or read from a backup), made safe to use: {id?,
// personId, name, tempo, lanes, slots}. Null when it belongs to nobody. A
// song from before the playlist has only slots: they become blocks on lane
// 1, one after another, and the song's tempo is its first beat's.
// `beatOf(beatId)` finds a saved beat, for those lengths and that tempo.
// `slots` is written for older copies of the app (playlist.js legacySlots).
// A song from before the list (one per person) has no id; linkSong gives it one.
export function cleanSong(raw, nameFor = () => 'Song', beatOf = () => null) {
  if (typeof raw?.personId !== 'string' || !raw.personId) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : nameFor();
  let lanes;
  let tempo;
  if (Array.isArray(raw.lanes)) {
    lanes = cleanLanes(raw.lanes);
    tempo = cleanTempo(raw.tempo);
  } else {
    lanes = slotsToLanes(raw.slots, (id) => beatSteps(beatOf(id)));
    const first = lanes[0].blocks[0];
    tempo = cleanTempo(Number(beatOf(first?.beatId)?.bpm) || DEFAULT_TEMPO);
  }
  const song = { personId: raw.personId.slice(0, 64), name, tempo, lanes, slots: legacySlots(lanes) };
  return SONG_ID.test(raw.id) ? { id: raw.id, ...song } : song;
}

// The open song with an id: its own, else the saved song of the same name
// (a song kept before songs were a list, already in the list), else a new id.
export function linkSong(song, list, makeId = () => newId('song')) {
  if (song.id) return song;
  const same = list.find((s) => s.name.toLowerCase() === song.name.toLowerCase());
  return { id: same?.id ?? makeId(), ...song };
}

// A name no other song in `list` has (except the song `exceptId`): "Ditty 2".
export function uniqueSongName(name, list, exceptId) {
  const taken = new Set(list.filter((s) => s.id !== exceptId).map((s) => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const candidate = name.slice(0, 24 - tail.length) + tail;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const blockCount = (song) => song.lanes.reduce((n, l) => n + l.blocks.length, 0);

// The song planned to play: each beat it uses planned once at the song's
// tempo (`seq.beatPlan`), its parts, and its hits from `from` seconds on.
// `beatOf(beatId)` finds a saved beat. Used to play, to save as a sound,
// and for a share's preview (share-render.js).
export function planSong(song, beatOf, seq, { from = 0, skipMuted = false } = {}) {
  const plans = new Map();
  for (const lane of song.lanes) {
    for (const b of lane.blocks) {
      const beat = beatOf(b.beatId);
      if (beat && !plans.has(beat.id)) plans.set(beat.id, seq.beatPlan({ ...beat, bpm: song.tempo }));
    }
  }
  const { parts, seconds, barSeconds } = playParts(song.lanes, (id) => (plans.has(id) ? beatSteps(beatOf(id)) : null), song.tempo);
  const skipLanes = new Set(skipMuted ? song.lanes.flatMap((l, i) => (l.muted || cleanVolume(l.volume) === 0 ? [i] : [])) : []);
  return { plans, parts, seconds, barSeconds, events: playEvents(parts, plans, { from, skipLanes }) };
}

// Sounds every event of a planned song into `dest` from `t0`, each lane
// through `laneGains[lane]`. Returns how many hits sounded.
export function soundSong(ctx, laneGains, planned, seq, t0 = 0) {
  const lists = new Map();
  let hits = 0;
  for (const e of planned.events) {
    const key = `${e.lane}:${e.beatId}:${e.row}`;
    if (!lists.has(key)) lists.set(key, []);
    if (seq.soundHit(ctx, laneGains[e.lane], lists.get(key), planned.plans.get(e.beatId).pattern, e.row, t0 + e.time, e.loud, e.note, e.len)) hits++;
  }
  return hits;
}

// deps: el (the screen's elements), audio, meter, seq (the beat maker: its
// beatPlan, prepareBeats, soundHit, stop and colorOf), beats(personId)
// (saved beats a song can use), load(personId) -> the stored open song or
// undefined, save(song) (as the open song), close(personId) (nothing open),
// songs: {list(personId), put(song), remove(id)} (every saved song),
// songName(taken) (a fun name), soundLabel(name) (a label for the new pad),
// addClip({label, blob}), beatColor(beat) (its chip's color), announce(text).
export function createSong(deps) {
  const { el, audio, meter, seq } = deps;
  let song = null;

  let timer = 0;
  let raf = 0;
  let starting = false;
  let t0 = 0;
  let from = 0;              // where this play started, in seconds
  let planned = null;        // {plans, parts, events, seconds, barSeconds} while playing
  let next = 0;
  let voices = new Map();    // `${lane}:${beatId}:${row}` -> its sounding voices
  let laneGains = [];
  let shown = new Set();     // the blocks lit as playing
  let startBar = 0;          // ▶ Play song starts here (a bar number tapped in the ruler)

  let picked = null;         // the beat picked in the strip, to drop on a lane
  let sel = null;            // the selected block: {lane, block}
  let removeAsked = false;
  let armTimer = 0;
  let undoSteps = [];        // the song before each edit, for ↩️ Undo
  const cursor = new Map();  // lane -> the bar the keyboard is on

  let personId = null;
  const playing = () => timer !== 0 || starting;
  const beats = () => deps.beats(personId);
  const beatById = (id) => beats().find((b) => b.id === id);
  const stepsOf = (id) => beatSteps(beatById(id));
  const allSongs = () => deps.songs.list(personId);
  const songs = () => allSongs().filter((s) => !isScratchSong(s));   // the ones in 🗂️ My songs
  const clean = (raw) => cleanSong(raw, () => deps.songName(songs().map((x) => x.name)), beatById);
  // The scratch song to open: as stored, or empty (saved once it changes).
  function scratchSong() {
    const saved = songScratchOf(allSongs(), personId);
    if (saved) return { ...clean(saved), name: SCRATCH_NAME };
    return clean({ id: songScratchId(personId), personId, name: SCRATCH_NAME, tempo: DEFAULT_TEMPO, lanes: [] });
  }
  const onScratch = () => !!song && isScratchSong(song);

  // The person's open song, or their scratch song (ADR 0020). A stored
  // song in the list opens as the list has it; one with beats from before
  // the list joins it; an empty one that never joined was made by the app,
  // not the kid, so the scratch opens.
  function setPerson(id) {
    stop();
    offerUndo(null);
    personId = id;
    picked = null;
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
    sel = null;
    removeAsked = false;
    undoSteps = [];
    startBar = 0;
    cursor.clear();
  }

  // 🆕 New (Ben, 2026-10-12): a blank scratch song opens. Nothing joins 🗂️ My
  // songs; only 💾 Keep adds one. A named song open stays there as it is.
  // A scratch with blocks that it empties is said in a line with Undo, which
  // brings it back, and the song open before.
  function newScratch() {
    const old = songScratchOf(allSongs(), personId);
    const was = { song: song ? structuredClone(song) : null, scratch: old ? structuredClone(old) : null };
    if (old) deps.songs.remove(old.id);
    openSong(null);
    const cleared = !!old && blockCount(clean(old)) > 0;
    logEvent('song', { action: 'new', replaced: cleared });
    if (cleared) offerUndo(was);
    else deps.announce?.('A blank scratch song.');
  }

  // The Undo line under the lanes: for a few seconds after 🆕 New emptied
  // the scratch. Another song opening, or another person, forgets it.
  let undo = null;
  let undoTimer = 0;
  function offerUndo(nextUndo) {
    clearTimeout(undoTimer);
    undo = nextUndo;
    if (!el.undo) return;
    if (nextUndo) {
      el.undoText.textContent = '🆕 Your scratch song is blank now.';
      undoTimer = setTimeout(() => offerUndo(null), UNDO_MS);
    } else if (document.activeElement === el.undoButton) el.addLane.focus();
    el.undo.hidden = !nextUndo;
  }
  function undoNew() {
    const was = undo;
    offerUndo(null);
    if (!was) return;
    if (was.scratch) deps.songs.put(was.scratch);
    const back = was.song && !isScratchSong(was.song) && songs().find((x) => x.id === was.song.id);
    openSong(back ? clean(back) : null);
  }

  // Saves the open song: as the person's open song (the scratch open is
  // no record), and into the list. Older copies read its `slots`.
  function save() {
    if (!song) return;
    offerUndo(null);   // a change to the song: Undo of 🆕 New would undo it too
    song.slots = legacySlots(song.lanes);
    if (onScratch()) deps.close(personId); else deps.save(structuredClone(song));
    const before = allSongs().find((x) => x.id === song.id);
    deps.songs.put({ ...structuredClone(song), created: before?.created ?? Date.now(), saved: Date.now() });
  }

  // An edit to the song's tempo or lanes: kept for ↩️ Undo first.
  function edit(change) {
    undoSteps.push(structuredClone({ tempo: song.tempo, lanes: song.lanes }));
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
    song.lanes = before.lanes;
    if (sel && !song.lanes[sel.lane]?.blocks[sel.block]) sel = null;
    save();
    render();
    deps.announce?.('Undone.');
  }

  // Switches to another song (opened or new), or to the scratch (null).
  function openSong(nextSong) {
    stop();
    disarm(false);
    offerUndo(null);
    song = nextSong ?? scratchSong();
    forget();
    if (onScratch()) deps.close(personId); else save();
    render();
  }

  // 💾 Keep (ADR 0020): the scratch song becomes a song in 🗂️ My songs with a
  // fun name, and opens; the scratch starts empty again.
  function keep() {
    if (!onScratch() || !blockCount(song)) return;
    const old = songScratchOf(allSongs(), personId);
    const name = deps.songName(songs().map((x) => x.name));
    song = { ...song, id: newId('song'), name };
    save();
    if (old) deps.songs.remove(old.id);
    logEvent('song', { action: 'keep' });
    render();
    deps.announce?.(`Kept as “${name}” in 🗂️ My songs. Your scratch song is empty again.`);
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
  const beatName = (id) => beatById(id)?.name ?? 'Deleted beat';
  const timesWords = (n) => (n === 1 ? 'once' : `${n} times`);
  const laneLabel = (i) => `${song.lanes[i].emoji} ${song.lanes[i].name}`;

  function render() {
    if (!personId || !song) return;
    if (el.songs.open) renderSongs();
    // The scratch shows "Scratch song", not a name to edit; 💾 Keep stands
    // where ✏️ is.
    const scratch = onScratch();
    const count = blockCount(song);
    el.name.readOnly = scratch;
    el.name.classList.toggle('scratch', scratch);
    el.name.setAttribute('aria-label', scratch ? 'Scratch song, not kept yet: 💾 Keep puts it in 🗂️ My songs' : 'Song name (tap to rename)');
    el.rename.hidden = scratch;
    el.keep.hidden = !scratch;
    el.keep.disabled = !count;
    if (document.activeElement !== el.name) el.name.value = scratch ? 'Scratch song' : song.name;
    if (document.activeElement !== el.tempo) el.tempo.value = String(song.tempo);
    el.tempoDown.disabled = song.tempo <= MIN_TEMPO;
    el.tempoUp.disabled = song.tempo >= MAX_TEMPO;
    if (picked && !beatById(picked)) picked = null;
    renderStrip();
    const list = beats();
    el.empty.hidden = count > 0 && !!list.length;
    el.empty.textContent = !list.length
      ? 'No beats yet. Make one in 🥁 Beats and 💾 Keep it: it shows up here.'
      : picked ? `Now tap a spot on a lane to put “${beatName(picked)}” there.` : 'Pick a beat above, then tap a spot on a lane.';
    renderLanes();
    renderSelection();
    el.addLane.disabled = song.lanes.length >= MAX_LANES;
    el.stepUndo.hidden = !undoSteps.length;   // only when there is something to take back (🆕 New has its own Undo line)
    const any = song.lanes.some((l) => l.blocks.some((b) => beatById(b.beatId)));
    el.play.disabled = !any && !playing();
    el.sound.disabled = !any;
  }

  // The strip of the person's beats, as the pattern chips look: a tap picks
  // one (pressed), a second tap puts it down.
  function renderStrip() {
    el.strip.replaceChildren(...beats().map((beat) => {
      const b = button('beat-chip song-chip');
      b.dataset.beat = beat.id;
      b.setAttribute('aria-pressed', String(picked === beat.id));
      b.setAttribute('aria-label', picked === beat.id ? `${beat.name}, picked: tap a spot on a lane to put it there` : `Pick ${beat.name}`);
      const color = deps.beatColor?.(beat);
      if (color) b.style.setProperty('--chip', color);
      b.append(make('span', 'chip-name', beat.name));
      return b;
    }));
    el.strip.hidden = !beats().length;
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
    const bars = Math.max(viewBars(song.lanes, stepsOf), fillBars());
    el.lanes.style.setProperty('--bars', String(bars));
    el.lanes.style.setProperty('--lanes', String(song.lanes.length));
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
    grid.append(ruler, ...rows, head);
    const keep = document.activeElement;
    const focusKey = keep?.dataset?.track !== undefined ? `[data-track="${keep.dataset.track}"]`
      : keep?.dataset?.block ? `[data-block="${keep.dataset.block}"]`
        : keep?.dataset?.startBar !== undefined ? `[data-start-bar="${keep.dataset.startBar}"]`
          : keep?.dataset?.lanePick !== undefined ? `[data-lane-pick="${keep.dataset.lanePick}"]`
            : keep?.dataset?.speaker !== undefined && el.lanes.contains(keep) ? `[data-speaker="${keep.dataset.speaker}"]` : null;
    el.lanes.replaceChildren(grid);
    if (focusKey) el.lanes.querySelector(focusKey)?.focus({ preventScroll: true });
    speakers.refresh();
    showPlayhead();
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
    el.remove.textContent = removeAsked ? 'Remove?' : '🗑️';
    el.remove.classList.toggle('armed', removeAsked);
    el.remove.setAttribute('aria-label', removeAsked ? `Tap again to take ${beatName(block.beatId)} off ${lane.name}` : `Take ${beatName(block.beatId)} off ${lane.name}`);
  }

  // The playhead, over every lane, and the blocks playing lit.
  function showPlayhead() {
    const line = el.lanes.querySelector('.song-playhead');
    if (!line) return;
    const on = playing() && !!planned;
    line.hidden = !on;
    if (!on) return;
    const t = audio.context().currentTime - t0 + from;
    line.style.setProperty('--at', String(Math.max(0, t) / planned.barSeconds));
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
      el.note.textContent = beats().length ? 'Pick a beat above first, then tap the spot.' : 'Make a beat in 🥁 Beats and 💾 Keep it first.';
      render();
      return;
    }
    const placed = placeBlock(lane, bar, picked, stepsOf);
    if (placed.why) {
      el.note.textContent = placed.why === 'full' ? `${lane.name} is full. Try another lane.`
        : `No room there: “${beatName(picked)}” is longer than the gap. Try a spot further along.`;
      return;
    }
    stop();
    el.note.textContent = '';
    countUse('song-block', personId);
    edit(() => {
      // The first beat in an empty song sets its tempo.
      if (!blockCount(song)) song.tempo = cleanTempo(beatById(picked)?.bpm);
      song.lanes[li] = placed.lane;
    });
    select(li, placed.index);
    deps.announce?.(`Put ${beatName(picked)} on ${lane.name} at bar ${bar + 1}.`);
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
    el.note.textContent = '';
    render();
    el.strip.querySelector(`[data-beat="${CSS.escape(b.dataset.beat)}"]`)?.focus();
  });

  let swallow = false;   // the click that ends a drag is not a tap
  el.lanes.addEventListener('click', (e) => {
    if (swallow) { swallow = false; return; }
    if (e.target.closest('[data-speaker]')) return;   // the speakers' own controls
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
    drag = { li, bi, x: e.clientX, end: blockSpan(block, stepsOf).end, barW: width / bars, before: structuredClone({ tempo: song.tempo, lanes: song.lanes }), moved: false };
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

  // The song's tempo: typed, or ➖ ➕ by 5.
  function setTempo(v) {
    const t = cleanTempo(v);
    if (t === song.tempo) { el.tempo.value = String(t); return; }
    stop();
    edit(() => { song.tempo = t; });
    render();
  }
  el.tempo.addEventListener('change', () => setTempo(Number(el.tempo.value)));
  el.tempo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.tempo.blur(); setTempo(Number(el.tempo.value)); } });
  el.tempoDown.addEventListener('click', () => setTempo(song.tempo - TEMPO_STEP));
  el.tempoUp.addEventListener('click', () => setTempo(song.tempo + TEMPO_STEP));

  el.name.addEventListener('change', () => {
    const wanted = el.name.value.trim().slice(0, 24);
    if (!song || onScratch()) return;
    if (wanted) { song.name = uniqueSongName(wanted, songs(), song.id); save(); }
    el.name.value = song.name;
  });
  el.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.name.blur(); } });
  el.rename.addEventListener('click', () => { el.name.focus(); el.name.select?.(); });
  el.newSong.addEventListener('click', newScratch);
  el.undoButton?.addEventListener('click', undoNew);
  el.undoClose?.addEventListener('click', () => offerUndo(null));
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
    const wanted = el.laneName.value.trim().slice(0, MAX_LANE_NAME) || LANE_DEFAULTS[laneOpen % LANE_DEFAULTS.length].name;
    el.laneName.value = wanted;
    if (wanted === lane.name) return;
    edit(() => { lane.name = wanted; });
    render();
  });
  el.laneName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.laneName.dispatchEvent(new Event('change')); el.laneSheet.close(); } });
  setupDialog(el.laneSheet);

  // ── 🗂️ My songs: every saved song, to open, duplicate or delete ──

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
    from = Math.min(startBar * plan0.barSeconds, plan0.seconds);
    const plan = from > 0 ? planSong(song, beatById, seq, { from }) : plan0;
    if (!plan.parts.length || from >= plan.seconds) { starting = false; return; }
    await seq.prepareBeats([...plan.plans.values()].map((p) => p.pattern));
    if (!starting) return;   // stopped while loading
    starting = false;
    planned = plan;
    next = 0;
    voices = new Map();
    shown = new Set();
    laneGains = laneGainsFor(ctx, audio.master, { live: true });
    t0 = ctx.currentTime + 0.1;
    logEvent('song', { action: 'play', lanes: song.lanes.length, blocks: blockCount(song), seconds: Math.round((plan.seconds - from) * 10) / 10 });
    timer = setInterval(tick, TICK_MS);
    tick();
    raf = requestAnimationFrame(follow);
    el.play.setAttribute('aria-pressed', 'true');
    el.play.textContent = '■ Stop song';
    showPlayhead();
  }

  function tick() {
    const ctx = audio.context();
    const events = planned.events;
    while (next < events.length && t0 + events[next].time < ctx.currentTime + LOOKAHEAD) {
      const e = events[next++];
      const key = `${e.lane}:${e.beatId}:${e.row}`;
      if (!voices.has(key)) voices.set(key, []);
      const pattern = planned.plans.get(e.beatId).pattern;
      if (seq.soundHit(ctx, laneGains[e.lane], voices.get(key), pattern, e.row, t0 + e.time, e.loud, e.note, e.len)) {
        const lane = song.lanes[e.lane];
        if (!lane?.muted && cleanVolume(lane?.volume) > 0) deps.onHit?.(pattern.rows[e.row].clipId, (t0 + e.time - ctx.currentTime) * 1000);
      }
    }
    meter.run();
    if (ctx.currentTime > t0 + (planned.seconds - from) + 0.2) stop();
  }

  // The playhead follows the clock; the lanes scroll to keep it in view.
  function follow() {
    const t = audio.context().currentTime - t0 + from;
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
      if (x > box.scrollLeft + box.clientWidth - 24 || x < box.scrollLeft + headW) box.scrollLeft = Math.max(0, x - headW - 8);
    }
    raf = requestAnimationFrame(follow);
  }

  function stop() {
    starting = false;
    if (!timer) return;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    timer = 0;
    raf = 0;
    const now = audio.context().currentTime;
    for (const list of voices.values()) for (const v of list) fadeStop(v, now);
    voices = new Map();
    for (const g of laneGains) setTimeout(() => { try { g.disconnect?.(); } catch { /* gone */ } }, 1000);
    laneGains = [];
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

  async function saveAsSound() {
    if (!song) return;
    const plan = planSong(song, beatById, seq, { skipMuted: true });
    if (!plan.parts.length) return;
    if (plan.seconds > MAX_SONG_SECONDS) {
      el.note.textContent = `This song is ${Math.round(plan.seconds)} seconds. Songs up to ${MAX_SONG_SECONDS / 60} minutes can be a sound: take a block out, repeat one less, or speed up the tempo.`;
      return;
    }
    el.sound.disabled = true;
    el.note.textContent = 'Making the sound…';
    try {
      await seq.prepareBeats([...plan.plans.values()].map((p) => p.pattern));
      const rate = audio.context().sampleRate;
      const ctx = new OfflineAudioContext(2, Math.ceil(plan.seconds * rate), rate);
      const hits = soundSong(ctx, laneGainsFor(ctx, ctx.destination, { live: false }), plan, seq);
      if (!hits) { el.note.textContent = 'This song has nothing to hear yet. Turn on some pills in its beats, or unmute a lane.'; return; }
      const buffer = normalize(await ctx.startRendering());
      const label = deps.soundLabel(song.name);
      await deps.addClip({ label, blob: encodeWav(buffer) });
      el.note.textContent = `Added “${label}” to the pads (${buffer.duration.toFixed(1)} s).`;
      logEvent('song', { action: 'sound', seconds: Math.round(buffer.duration * 10) / 10 });
    } catch (err) {
      console.error('Making a sound from the song failed:', err);
      el.note.textContent = `That didn't work (${err.message || err.name}). Try again.`;
    } finally {
      el.sound.disabled = false;
    }
  }
  el.sound.addEventListener('click', saveAsSound);

  return { setPerson, render, play, stop, playing, song: () => song };
}
