// Beat maker: a step sequencer. Each row plays one sound from any board; its
// 16 pills are one bar of 4/4, each pill a quarter of a beat (a sixteenth
// note). Each person has one open beat (ADR 0017), shown on Beats with or
// without ⌨️ Keys: a beat in the person's library, or their scratch beat
// (ADR 0020, scratch.js) when nothing else is open.
//
// With advanced beats on (Settings), each row can run at ½×, 1× or 2× the
// beat's tempo, so every row keeps its own clock.
//
// The beat maker's pure rules (a beat made safe, the hits it plans, swing,
// grooves, beat files) are in beat.js; the WAV encoder is in wav.js.
//
// Timing uses the Web Audio clock, not timers: the beat engine's run (this
// file gives it the beat and its hooks, see play) ticks every 25 ms and
// schedules every hit due in the next 100 ms at its exact time (the usual
// lookahead pattern; 2.5 s while the page is hidden, when the browser slows
// the timer), so a busy page can delay the tick without making the beat drag. The click is booked from that tick, by this file.
//
// When a row's sound is still playing at its next hit, it is cut off with a
// short fade (a hard cut clicks), unless the row's 🔔 Let it ring is on (`ring`,
// at every level), which lets hits overlap, up to MAX_RINGING at once.

import { openDialog, setupDialog } from './dialogs.js';
import { tempoKey } from './tempo-key.js';
import { newId, recall, remember, onePressOneClick } from './util.js';
import { fadeStop } from './audio.js';
import { getSetting, onSetting, unsignedSignature } from './settings.js';
import { logEvent } from './log.js';
import { showBanner } from './ui.js';
import { countPlay } from './play-count.js';
import { soundKind } from './log-clean.js';
import { downloadBlob, createAudioSaver } from './download.js';
import { instrumentById, presetInstrument, versionFor, ownIdOf } from './instruments.js';
import { isScratch, isHiddenBeat, scratchOf, scratchId, scratchLabel, grooveOf, hasHits, SCRATCH_NAME } from './scratch.js';
import { cleanVolume, rowLevel, setRowLevel, drawSpeaker, speakerControls, percent } from './row-volume.js';
import { rowParts, rowSpeaker, rowEmoji, twinRows } from './beat-row.js';
import { moreMenu } from './overflow.js';
import { follower, keepInView } from './follow.js';
import { fitLine } from './lines.js';
import { pillHolds } from './finger.js';
import { encodeWav, normalize, audioPasses, audioFileFrames, audioView, audioFileName, AUDIO_RING_SECONDS } from './wav.js';
import { BAR_CHOICES, BEAT_BAR_STEPS, COMMON_BPMS, DEFAULT_BPM, MAX_BEAT_FILE_BYTES, MAX_BPM, MAX_PINS, MAX_ROWS, MAX_SWING, MIN_BPM, RING_MS, ROW_RATES, SAMPLE_SECONDS, STEPS_PER_BEAT, SIGNATURES, audible, barSteps, beatFromFile, beatToFile, chipBeats, cleanPattern, cleanRow, grooveBeat, groovePlayers, grooveShape, holdPill, isPinned, mergeGroove, moveItem, multiplyRows, nextSound, outputDelay, pillTarget, planHits, retimeAt, rowSlot, stepSeconds, stepsHeard, stopFor, tapPill, tempoStops, typedBpm } from './beat.js';
import { GROOVES, GROOVE_GROUPS } from './grooves.js';
import { cleanFx, silencedBySolo, createMixer } from './mixer.js';
import { addNote } from './notes.js';
import { createRoll } from './roll.js';
import { createPillSelect } from './pill-select.js';
import { edgeScroller } from './edge-scroll.js';
import { hasPicker, pickerButton, pickerList, pickInstrument } from './inst-picker.js';
import { cutName, MAX_LABEL } from './names.js';
import { TICK_MS, lookahead } from './beat-engine.js';
import { merge3, sameContent } from './merge3.js';

const ARM_MS = 3000;                   // how long a Clear? or Remove? waits for its second tap
const UNDO_MS = 8000;                  // how long a removed row can be brought back

// deps: el (the sequencer's elements), audio and meter (from app.js), engine
// (the one beat engine, beat-engine.js, made by app.js),
// clips() (the current board's playable clips), groups() (every person's
// clips, [{id, name, color, clips}], current board first), clipById(id) (any
// board), colorOf(clip),
// makePad(clip) (a pad as on the board), makeAddPad(text) (the dashed empty slot),
// beatName(taken) (a fun name for a new saved beat, optional),
// keptName(groove, taken) (a kept groove's name, "Sleepy Squid (Ska version)"),
// opened(personId) -> the person's stored open beat ({id} at least) or
// undefined; setOpen(personId, pattern | null) stores it (null: the scratch),
// library: {list(personId), put(beat), remove(id)} for every saved beat,
// the scratch included (scratch.js tells them apart),
// addClip({label, blob}) to add a rendered beat to the board as a sound.
export function createSequencer(deps) {
  const { el, audio, meter } = deps;
  el.playhead = document.createElement('div');
  el.playhead.className = 'seq-playhead';
  el.playhead.setAttribute('aria-hidden', 'true');
  window.addEventListener('resize', () => drawPlayhead());
  let pattern = null;
  let advanced = getSetting('advancedBeats');
  let raf = 0;
  // The beat playing, or null: the engine's run (beat-engine.js play). It keeps
  // t0 (when the beat started, on the audio clock), clocks (per row {next,
  // step}: the row's next step and when it plays), queue (booked {row, step,
  // time}, for moving the playhead), shown (per row the step its playhead is
  // on, or -1) and voices (per row, those sounding: {src, gain, end}).
  let run = null;
  let litPills = [];     // per row: the pill marked .now for it (showSteps)
  let ringing = [];      // a beat's voices after a chip switched away from it, still ringing out
  let stats = null;      // this play's start and the limiter's worst, logged with the run's counts when it stops
  // The one beat engine (beat-engine.js, made by app.js and shared with 🎼 Song and 🧸 Kids): the sounds
  // loaded for scheduling (`ready`), one hit (`sound`), the mix graphs (`busFor`) and the "play a saved beat" path.
  const { engine } = deps;
  const { prepare, refresh, sound, busFor, letGo, prepareBeats, soundHit } = engine;
  const pills = [];          // pills[row][step]
  const cell = { row: 0, step: 0 };  // the one pill in the Tab order; arrow keys move it
  let speakers = null;       // the rows' speakers and their loudness popover (set once the rows listen)
  let rowMenus = null;       // the rows' menus, each opened by its emoji (overflow.js)
  let mixer = null;          // the 🎚️ Mixer sheet (mixer.js), set once the rows listen
  let locked = false;        // ⇆: the pills locked, nothing lights or unlights (pill-select.js)
  const pickers = [];        // the views' pickers, {pick, shown}: these rows', the keys' grid's
  let select = null;         // pills picked and dragged with a mouse (pill-select.js)

  const playing = () => run !== null;
  const baseStep = () => 60 / shape().bpm / STEPS_PER_BEAT;
  // With advanced beats off the beat maker is the simple one: 4/4, every row
  // on the beat, whatever the rows have stored for later. 🔔 Let it ring plays at
  // every level (Ben, 2026-10-12).
  const playMode = () => (advanced ? 'speed' : 'plain');
  // A beat plays in its own signature in either mode; only choosing one needs Advanced.
  const sigOf = () => (pattern ? pattern.signature || '4/4' : '4/4');
  const groups = () => SIGNATURES[sigOf()] || SIGNATURES['4/4'];
  const bar = () => groups().reduce((a, b) => a + b, 0);
  const rings = (row) => row.ring;
  const total = () => bar() * shape().bars;   // the whole beat, every bar
  const countOf = () => total();   // every row has the whole beat's pills
  const swingNow = () => (pattern ? pattern.swing || 0 : 0);   // every level plays a beat's swing (Ben, 2026-10-26)
  const STOPS = tempoStops();
  // Puts the slider and the number in step with the tempo (the open beat's, or the loose one).
  let beatKey = null;   // on a phone, the tempo folded into one key (tempo-key.js)
  function showTempo({ slider = true } = {}) {
    beatKey?.show();
    if (slider) el.bpm.value = stopFor(shape().bpm, STOPS);
    el.bpm.setAttribute('aria-valuetext', `${shape().bpm} BPM`);
    el.bpmOut.textContent = `${shape().bpm} BPM`;
    el.bpmOut.setAttribute('aria-label', `Tempo ${shape().bpm} BPM. Tap to type a tempo.`);
  }
  // { dragging }: a slider on its way (⌨️ Keys, 🎤 Live's click) retimes and
  // shows the tempo only; its `change` sets it once more, to save it and
  // bring looping pads in line, as Beats' own slider does (below).
  function setTempo(bpm, { dragging = false } = {}) {
    const was = shape().bpm;
    shape().bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    retime(was);
    showTempo();
    if (dragging) return;
    save();
    deps.onTempo?.();
  }

  // A tempo change while the beat plays (retimeAt): from the first moment
  // not yet booked, every row, the click and t0 move to the new tempo, so
  // they stay together and taps keep snapping to the right pill.
  function retime(oldBpm) {
    const bpm = shape().bpm;
    if (!playing() || !(oldBpm > 0) || oldBpm === bpm) return;
    const anchor = Math.min(clickNext, ...run.clocks.filter(Boolean).map((c) => c.next));
    const move = retimeAt(anchor, oldBpm, bpm);
    run.retime(move);
    clickNext = move(clickNext);
    for (const k of skips) if (k.at >= anchor) k.at = move(k.at);
    if (queued) queued.at = move(queued.at);   // still the next bar line, at the new tempo
  }

  // Where the beat is, for pads that loop in time: the audio-clock time of the
  // next bar's "1" (at least a moment away) and the length of a beat. Counted
  // from a row on the plain clock, so tempo changes made while playing are
  // included; null when the beat is stopped.
  function grid() {
    if (!playing()) return null;
    const now = audio.context().currentTime + 0.02;
    const base = baseStep();
    const barLen = bar();
    const i = pattern.rows.findIndex((r) => stepSeconds(pattern, r, playMode()) === base);
    const clock = run.clocks[i];
    let next;
    if (clock) {
      next = clock.next + ((barLen - (clock.step % barLen)) % barLen) * base;
    } else {
      next = run.t0 + Math.ceil(Math.max(0, now - run.t0) / (barLen * base)) * barLen * base;
    }
    while (next < now) next += barLen * base;
    return { next, beat: base * STEPS_PER_BEAT };
  }

  // A backup or older sounds being loaded changes settings before the people are
  // in place (`deps.ready`): the beat is drawn again once they are.
  const drawable = () => personId && deps.ready?.() !== false;
  onSetting('advancedBeats', (value) => { advanced = value; if (drawable()) render(); });

  // One open beat per person (ADR 0017, replacing ADR 0008's one per
  // screen for beats). `slot` is the view showing it: 'beats' (Beats),
  // 'dj' (Beats with ⌨️ Keys on: a groove opens stopped) or 'live' (🎤
  // Live, which has no open beat: its ⏲️ follows the loose tempo). `doc`
  // is the open beat as last read: {pattern, seen}, `seen` its library
  // record, read again when a view shows. With nothing else open the
  // person's scratch beat is (ADR 0020): it saves itself like any beat but
  // is never listed, and 💾 Keep makes it a beat of its own. A named beat
  // open is in IndexedDB `patterns`; the scratch open is no record there.
  let personId = null;
  let slot = 'beats';
  let doc = null;
  const LOOSE = { bpm: DEFAULT_BPM, bars: 1 };     // the click track's tempo while nothing is open (not saved)
  const shape = () => pattern ?? LOOSE;     // what the click and the clock follow
  if (el.tempoKey && el.tempoBox) beatKey = tempoKey(el.tempoKey, el.tempoBox, () => shape().bpm);

  // The same person again (a cloud sync or a loaded backup redraws whoever
  // is showing): a beat playing carries on, and the keys view's recording
  // into it with it, and the open beats are read again when it stops. A
  // sync used to stop the beat mid-recording (Ben, 2026-10-12).
  let readAgain = false;
  // A groove just loaded into the scratch (pickGroove, below), until the
  // beat changes: {groove, replaced, before, scratchBefore}, or null. The
  // keys view shows a line for it with ↩️ Beat (undoLoad).
  let loaded = null;
  // A name typed into the scratch's title (Ben, 2026-10-16): the scratch
  // keeps itself under it, at once if it has rows, else the moment it gets
  // one (save). Another beat, person or 🆕 New forgets it.
  let wantedName = null;
  function setPerson(id) {
    if (id === personId && playing()) { readAgain = true; return; }
    readAgain = false;
    stop();
    personId = id;
    loaded = null;
    wantedName = null;
    doc = fromStore();
    if (doc.link) { pattern = doc.pattern; save(); }
    pattern = slot === 'live' ? null : doc.pattern;
    render();
  }

  // Every beat of the person's, the scratch too; `library()` is the ones
  // listed in 🗂️ Beats and the chips.
  const allBeats = () => deps.library.list(personId);
  const library = () => allBeats().filter((b) => !isHiddenBeat(b));
  const freshName = () => (deps.beatName ? deps.beatName(library().map((b) => b.name)) : `Beat ${library().length + 1}`);
  // The scratch as stored, or null before its first change.
  const scratchSaved = () => scratchOf(allBeats(), personId);
  // The scratch to open: as stored, or empty (not saved until it changes).
  function scratchPattern() {
    const saved = scratchSaved();
    if (saved) return { ...cleanPattern(saved, personId), id: saved.id, name: saved.name || SCRATCH_NAME };
    return { ...cleanPattern({ rows: [] }, personId), id: scratchId(personId), signature: '4/4', name: SCRATCH_NAME };
  }
  const scratchDoc = () => ({ pattern: scratchPattern(), seen: scratchSaved() });
  const onScratch = () => !!pattern && isScratch(pattern);
  // What the title shows: the name, or the scratch's label (or the name typed for it).
  const titleOf = () => (onScratch() ? wantedName ?? scratchLabel(pattern) : pattern.name);

  // The stored open beat: the library's copy of the beat it names, or the
  // scratch. Beats stored the whole beat before ADR 0008: one with notes
  // that is not in the library joins it (`link`); an empty one that never
  // joined was made by the app, not the kid, so the scratch opens.
  function fromStore() {
    const stored = deps.opened(personId);
    if (!stored) return scratchDoc();
    const saved = stored.id && library().find((b) => b.id === stored.id);
    if (saved) return { pattern: cleanPattern(saved, personId), seen: saved };
    if (isHiddenBeat(stored) || !Array.isArray(stored.rows) || !stored.rows.some((r) => Array.isArray(r?.steps) && r.steps.some(Boolean))) {
      deps.setOpen(personId, null);
      return scratchDoc();
    }
    const p = cleanPattern(stored, personId);
    if (!p.id) {
      const same = p.name && library().find((b) => b.name === p.name);
      p.id = same?.id ?? newId('beat');
    }
    p.name ||= freshName();
    return { pattern: p, seen: null, link: true };
  }

  // Shows the open beat in a view ('beats', 'dj' or 'live'), read again
  // from the library if it changed there (a sync, a backup, a share's
  // remix, 🧸 Kids' squares in the scratch) or went (deleted: then the
  // scratch opens). Live has none.
  function show(which) {
    if (which !== slot) { stop(); offerUndo(null); speakers?.close(); rowMenus?.close(); slot = which; }
    if (doc && isScratch(doc.pattern)) {
      if (scratchSaved() !== doc.seen) { doc = scratchDoc(); loaded = null; }
    } else if (doc) {
      const saved = library().find((b) => b.id === doc.pattern.id);
      if (!saved) { doc = scratchDoc(); deps.setOpen(personId, null); }
      else if (saved !== doc.seen) doc = { pattern: cleanPattern(saved, personId), seen: saved };
    }
    pattern = slot === 'live' ? null : doc?.pattern ?? null;
    render();
  }

  // 🆕 New (Ben, 2026-10-12: "an entirely blank beat screen"): the beat
  // stops and the scratch opens, blank: no rows, the tempo and bars a new
  // beat has. A named beat open stays there as it is (it saved itself). A
  // scratch with hits is kept first (Ben, 2026-10-24: 🗂️ See all lists it
  // as theirs, so New must never lose it): it joins 🗂️ Beats under the
  // name 💾 Keep would give it, open or not, and a line says so. A scratch
  // with no hits just empties.
  function newScratch() {
    stop();   // first: a recording ending saves its hits into the beat it was in
    offerUndo(null);
    const old = scratchSaved();
    const kept = hasHits(old) ? keepAside(old) : null;
    if (old) deps.library.remove(old.id);
    openBeat(null, { resume: false });
    logEvent('beat', { action: 'new' });
    if (kept) showBanner(`Kept as “${kept}” in 🗂️ Beats. A blank scratch beat.`);
    else deps.announce?.('A blank scratch beat.');
  }
  // The stored scratch, put in 🗂️ Beats as a beat of its own, named
  // after its groove or with a fun name. Its name.
  function keepAside(scratch) {
    const groove = grooveOf(scratch);
    const name = groove && deps.keptName ? deps.keptName(groove.name, library().map((b) => b.name)) : freshName();
    const now = Date.now();
    deps.library.put({ ...cleanPattern(scratch, personId), id: newId('beat'), name, created: now, saved: now });
    logEvent('beat', { action: 'keep', groove: !!groove });
    return name;
  }

  // Saves the open beat into the library and keeps it as the open one (the
  // scratch is open when `patterns` has no record). Any change ends a
  // groove's "just loaded" line: the kid has started on it.
  // Keep it synchronous: the library and `doc` are updated before it returns.
  // A run taken over by another (beat-engine.js stopCurrent) is stopped
  // through stop(), whose read-back (`readAgain`) reads the library at once;
  // a save that finished later would be read before it landed.
  function save() {
    if (!pattern) return;
    loaded = null;
    const before = allBeats().find((b) => b.id === pattern.id);
    let record = { ...structuredClone(pattern), created: before?.created ?? Date.now(), saved: Date.now() };
    if (isPinned(before)) record.pinned = before.pinned;   // a 📌 stays as the beat changes
    // A sync stored a change to this beat behind the screen (it plays, so the
    // beat is read again only when it stops): this save must not undo it.
    const behind = !!before && !!doc?.seen && doc.seen.id === before.id && !sameContent(before, doc.seen);
    if (behind) record = mergedWithStored(record, before);
    deps.library.put(record);
    // After a merge the screen still holds the beat as it was read, so the
    // next save merges again, from the same base, rather than undoing it.
    doc = { pattern, seen: behind ? doc.seen : record };
    deps.setOpen(personId, isScratch(pattern) ? null : pattern);
    // A named scratch keeps itself once it has a row: after the change that
    // gave it one has finished drawing.
    if (wantedName && isScratch(pattern) && pattern.rows.length) queueMicrotask(() => { if (wantedName) keep(); });
  }

  // The beat to save when the library's copy (`stored`) changed behind the
  // screen: the screen's changes and the stored ones together (merge3.js,
  // as the cloud sync merges). Where they cannot be told apart, the stored
  // copy is kept as a beat of its own and the screen's goes under the id.
  function mergedWithStored(mine, stored) {
    const m = merge3('beats', doc.seen, mine, stored);
    if (m.record) return { ...m.record, id: mine.id, personId: mine.personId, created: mine.created, saved: mine.saved };
    const name = uniqueName(`${cutName(stored.name || SCRATCH_NAME, MAX_LABEL - 9)} (synced)`, null);
    deps.library.put({ ...structuredClone(stored), id: newId('beat'), name, created: stored.created ?? Date.now(), saved: Date.now() });
    logEvent('beat', { action: 'keep', groove: false });
    showBanner(`Another device changed this beat too. Its version is kept as “${name}” in 🗂️ Beats.`);
    return mine;
  }

  // 💾 Keep (ADR 0020): the scratch becomes a beat of its own in 🗂️ Beats,
  // which is the open beat now, and the scratch starts empty again. It takes
  // a name typed into its title; else one from a groove is named after it
  // ("Sleepy Squid (Ska version)", names.js keptName), and a plain one gets
  // a fun name. A beat playing carries on.
  function keep() {
    if (!onScratch() || !pattern.rows.length || chipsLocked) return;
    const taken = library().map((b) => b.name);
    const groove = grooveOf(pattern);
    const name = wantedName ? uniqueName(wantedName, null)
      : groove && deps.keptName ? deps.keptName(groove.name, taken) : freshName();
    wantedName = null;
    const old = scratchSaved();
    offerUndo(null);
    pattern = { ...pattern, id: newId('beat'), name };
    save();
    if (old) deps.library.remove(old.id);
    logEvent('beat', { action: 'keep', groove: !!groove });
    render();
    deps.onBeatChange?.();
    deps.announce?.(`Kept as “${name}” in 🗂️ Beats. Your scratch beat is empty again.`);
  }

  // ── The beat bar (Beats and DJ): the open beat's name, 🆕 New, 🗂️ Beats ──
  // The scratch shows "Scratch beat" (or "Ska (scratch)"), in italics: not
  // kept yet. 💾 Keep stands where ✏️ is and names it as it keeps it; a
  // name typed into the title keeps it under that name (nameScratch).
  let refitBars = [];   // each beat bar's refit (fitLine), set up once the bars are wired
  function showBeatBars() {
    const scratch = onScratch();
    for (const bar of el.beatBars ?? []) {
      const name = bar.querySelector('[data-beat-name]');
      name.hidden = !pattern;
      name.classList.toggle('scratch', scratch);
      name.setAttribute('aria-label', scratch ? 'Scratch beat, not kept yet: type a name to keep it in 🗂️ Beats' : 'Beat name (tap to rename)');
      bar.querySelector('[data-beat-rename]').hidden = !pattern || scratch;
      const keepButton = bar.querySelector('[data-beat-keep]');
      if (keepButton) {
        keepButton.hidden = !scratch;
        keepButton.disabled = !pattern?.rows.length || chipsLocked;
      }
      if (pattern && document.activeElement !== name) name.value = titleOf();
    }
    for (const refit of refitBars) refit();   // 💾 Keep (worded) or ✏️, a name or none: what fits changes
    showChips();
  }

  // ── Pattern chips (Ben, 2026-10-12, after a music studio's pattern picker) ──
  // Under the beat bar, ⌨️ Keys off and on: 8 numbered spots, pinned beats
  // first, then the most recently used, in one order that a tap never
  // changes (chipBeats). The open one is pressed. A tap opens that beat (ADR
  // 0017). While the beat plays, the switch waits for the next bar line
  // (`queued`), so the music never stops; the chip says it is waiting.
  let queued = null;        // {id, at}: the beat opening at the next bar line, while playing
  let chipsLocked = false;  // The keys view recording: the chips wait
  function showChips() {
    const beats = personId ? chipBeats(library()) : [];
    // Only the open beat to show: nothing to switch to.
    const none = !beats.length || (beats.length === 1 && beats[0].id === pattern?.id);
    for (const line of el.chipLines ?? []) {
      line.hidden = none;
      line.replaceChildren(...(none ? [] : beats.map((b, n) => chipFor(b, n + 1))));
    }
  }
  // A chip: its spot's number (studios number their patterns), a 📌 when
  // pinned, and the beat's name.
  function chipFor(beat, n) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'beat-chip';
    chip.dataset.chip = beat.id;
    const open = beat.id === pattern?.id;
    const next = beat.id === queued?.id;
    const name = beat.name || 'Beat';
    chip.setAttribute('aria-pressed', String(open));
    chip.classList.toggle('queued', next);
    chip.disabled = chipsLocked;
    // Its first sound's color, as a stripe: beats tell apart at a glance.
    const clip = deps.clipById(beat.rows?.[0]?.clipId);
    if (clip) chip.style.setProperty('--chip', deps.colorOf(clip));
    const num = document.createElement('span');
    num.className = 'chip-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = String(n);
    const text = document.createElement('span');
    text.className = 'chip-name';
    text.textContent = next ? `⏳ ${name}` : name;
    chip.append(num);
    if (isPinned(beat)) {
      const mark = document.createElement('span');
      mark.className = 'chip-pin';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '📌';
      chip.append(mark);
    }
    chip.append(text);
    chip.classList.toggle('pinned', isPinned(beat));
    chip.title = name;
    const pin = isPinned(beat) ? ', pinned' : '';
    chip.setAttribute('aria-label', `${n}: ${open ? `${name}, open now` : next ? `${name}: starts at the next bar` : `Open ${name}`}${pin}`);
    return chip;
  }
  // A chip tapped: that beat opens, at once when stopped, at the next bar
  // line while playing. The open beat's chip takes back a waiting switch.
  function pickChip(id) {
    if (chipsLocked) return;
    if (id === pattern?.id) { if (queued) { queued = null; showChips(); } return; }
    const saved = library().find((b) => b.id === id);
    if (!saved) return;
    if (!playing()) { openBeat(cleanPattern(saved, personId)); return; }
    queued = { id, at: nextBarLine() };
    for (const r of saved.rows ?? []) prepare(deps.clipById(r.clipId));   // ready by the bar line
    showChips();
    deps.announce?.(`“${saved.name}” starts at the next bar.`);
  }
  // The next bar line far enough ahead that nothing after it is booked yet.
  function nextBarLine() {
    const now = audio.context().currentTime;
    const barLen = bar() * baseStep();
    let at = grid()?.next ?? now;
    while (at < now + lookahead() + 0.01) at += barLen;
    return at;
  }
  // The bar line has come: the chosen beat takes over from its first pill,
  // on the same clock, so it carries on without a gap. What the old beat
  // still rings out goes on ringing (■ Stop fades it too).
  function switchNow() {
    const { id, at } = queued;
    queued = null;
    const saved = library().find((b) => b.id === id);
    if (!saved) { showChips(); return; }
    const now = audio.context().currentTime;
    const after = Math.round((at - run.t0) / (bar() * baseStep()));   // bars the old beat played
    ringing = [...ringing, ...run.voices.flat()].filter((v) => !(v.end <= now));
    const before = pattern;
    letGo((m) => m.p === before);   // rings out, then goes
    pattern = cleanPattern(saved, personId);
    save();
    run.restart(pattern.rows.length, at);
    clickNext = at;
    clickBeat = 0;
    logEvent('beat', { action: 'switch', bpm: pattern.bpm, bars: pattern.bars, after });
    render();
    deps.onBeatChange?.();
    deps.onTempo?.();
  }
  // The keys view locks the chips while it records into the beat.
  function lockChips(on) {
    if (chipsLocked === !!on) return;
    chipsLocked = !!on;
    if (on) queued = null;
    showBeatBars();   // 💾 Keep waits too
    if (!on && wantedName) queueMicrotask(keep);   // so does a named scratch
  }
  for (const line of el.chipLines ?? []) {
    line.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) pickChip(chip.dataset.chip);
    });
  }
  // Switches this screen to another beat (opened, new, or a groove), or to
  // the scratch (null: as it is stored), carrying on playing if it was, and
  // tells the keys. `resume`: carry on playing if something was (🗂️ Beats,
  // Undo); 🆕 New stops playback instead (Ben, 2026-10-11).
  function openBeat(next, { resume = true } = {}) {
    const was = playing();
    queued = null;
    stop();
    loaded = null;
    wantedName = null;
    if (next && !isScratch(next)) { pattern = next; save(); }
    else { doc = scratchDoc(); pattern = doc.pattern; deps.setOpen(personId, null); }
    render();
    deps.onBeatChange?.();
    if (resume && was) play();
  }
  // A beat deleted in 🗂️ Beats closes if it was the open one: the scratch opens.
  function closeEverywhere(id) {
    if (doc?.pattern.id === id || pattern?.id === id) openBeat(null);
  }
  // A name no other beat of this person's has.
  function uniqueName(name, exceptId) {
    const taken = new Set(library().filter((b) => b.id !== exceptId).map((b) => b.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const tail = ` ${n}`;
      const candidate = cutName(name, MAX_LABEL - tail.length) + tail;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
  // A name typed into the scratch's title: kept under it now if it has
  // rows; an empty scratch holds the name until its first row (save).
  function nameScratch(wanted) {
    if (wanted === titleOf()) return;
    wantedName = wanted;
    if (pattern.rows.length) keep();
    else deps.announce?.(`Named “${wanted}”. It goes in 🗂️ Beats when you add a sound.`);
  }
  for (const bar of el.beatBars ?? []) {
    const name = bar.querySelector('[data-beat-name]');
    name.addEventListener('change', () => {
      const wanted = cutName(name.value.trim());
      if (wanted && pattern && onScratch()) nameScratch(wanted);
      else if (wanted && pattern) { pattern.name = uniqueName(wanted, pattern.id); save(); }
      if (pattern) name.value = titleOf();   // still focused while it changes
      showBeatBars();
      deps.onBeatChange?.();
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    // "Scratch beat" is all chosen, so typing replaces it.
    name.addEventListener('focus', () => { if (onScratch() && !wantedName) name.select?.(); });
    bar.querySelector('[data-beat-rename]').addEventListener('click', () => { name.focus(); name.select?.(); });
    bar.querySelector('[data-beat-new]').addEventListener('click', newScratch);
    bar.querySelector('[data-beat-open]').addEventListener('click', () => openLibrary(bar.querySelector('[data-beat-open]')));
    bar.querySelector('[data-beat-keep]')?.addEventListener('click', () => keep());
  }
  // On a phone the five tools with their words don't fit beside the name:
  // the bar splits, 💃 Grooves, ⌨️ Keys and 🗂️ Beats on a row of their own
  // above the title, still worded (styles.css, "The beat bar"). Measured on
  // the bar, so it switches where the words really stop fitting.
  refitBars = [...(el.beatBars ?? [])].map((bar) => fitLine(bar, BEAT_BAR_STEPS));

  // ── Playback ──

  // `countIn`: one bar of clicks first, so the beat (and a DJ recording)
  // starts on the next "1".
  async function play({ countIn = false } = {}) {
    if (playing() || !pattern) return;
    deps.onPlay?.();   // a song playing stops: one thing plays at a time
    const ctx = audio.wake();
    const asked = pattern;
    const ask = ++playAsk;
    await refresh(pattern.rows);
    // Stopped (a song or a sample began, the screen changed), or another
    // beat opened, while its sounds loaded: this ▶ stands down.
    if (playing() || pattern !== asked || ask !== playAsk) return;
    // Only the open beat's sounds stay (a song playing stopped as this began),
    // so a sound deleted or taken off every row is not kept decoded all visit.
    if (!engine.preparing()) {
      const used = new Set(pattern.rows.map((r) => r.clipId));
      engine.keep(used);
    }
    let t0 = ctx.currentTime + 0.05;
    if (countIn) {
      let at = t0;
      groups().forEach((size, b) => { blip(at, b === 0); at += size * baseStep(); });
      t0 = at;
    }
    clickNext = t0;
    clickBeat = 0;
    clickOn = clickOverride ?? clickWanted;
    stats = { started: performance.now(), limiterDb: 0 };
    logEvent('beat', { action: 'play', bpm: pattern.bpm, bars: pattern.bars, advanced, mode: playMode(), signature: sigOf(), rows: pattern.rows.map(rowSummary) });
    run = engine.play({
      from: t0,
      beat: () => pattern,
      mode: playMode,
      swing: swingNow,
      loaded: (id) => (engine.has(id) ? { clip: deps.clipById(id), loaded: engine.get(id) } : null),
      steps: true,
      limit: () => (queued ? queued.at - 0.001 : Infinity),
      beforeRows: (until) => {
        scheduleClicks(clickOn, until);
        if (skips.length) skips = skips.filter((k) => k.at > audio.context().currentTime - 1);   // a skip whose moment passed
      },
      join: joinClock,
      skip: usedSkip,
      onStop: stop,   // taken over by another run: stop as ■ does (a synced beat is read again, the keys' recording ends)
      onHit: (clipId, at) => deps.onHit?.(clipId, (at - audio.context().currentTime) * 1000),
      afterTick: () => {
        meter.run();  // the speaker grille follows the beat
        if (queued && audio.context().currentTime + lookahead() >= queued.at) { switchNow(); run.tick(); }
      },
    });
    deps.onTempo?.();  // before the first tick, so pads already looping join on the first "1"
    run.tick();
    raf = requestAnimationFrame(follow);
    rowFollow.start();
    showPlayKeys(true);
  }
  // ▶ Play on Beats and in the keys view (el.djPlay): ■ Stop while playing.
  function showPlayKeys(on) {
    for (const b of [el.play, el.djPlay]) {
      if (!b) continue;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '■ Stop' : '▶ Play';
      b.dataset.icon = on ? '■' : '▶';   // all it shows where its line is short (styles.css)
    }
    roll?.showPlay();
  }

  // A groove loaded with ⌨️ Keys on stays in the scratch when it stops.
  let playAsk = 0;   // counts ▶ asks; stop() makes one still loading stand down
  function stop() {
    playAsk++;
    growHook = null;
    // A chip waiting for the bar line is taken back: a tap on it now opens it at once.
    if (queued) { queued = null; showChips(); }
    // The beat's graphs (and a 🎹 note preview's) go once they ring out; a groove sample keeps its own.
    letGo((m) => m.dest === audio.master && m.p !== sample?.pattern);
    if (!playing()) return;
    const was = run;
    run = null;
    was.stop();   // its timer, and its voices fade
    cancelAnimationFrame(raf);
    raf = 0;
    skips = [];
    const now = audio.context().currentTime;
    for (const v of ringing) fadeStop(v, now);
    ringing = [];
    showSteps();
    if (stats) {
      logEvent('beat', { action: 'stop', seconds: Math.round((performance.now() - stats.started) / 100) / 10,
        hits: was.stats.hits, cuts: was.stats.cuts, maxRinging: was.stats.maxRinging, limiterDb: Math.round(stats.limiterDb * 10) / 10 });
      stats = null;
    }
    showPlayKeys(false);
    if (readAgain) setPerson(personId);
    deps.onStop?.();   // The keys view's recording ends with the beat, whatever stopped it
  }

  // A row added while playing joins on the beat's grid: at the next step of
  // the beat, on the step it would be at had it been there from the start.
  // It takes the place of a row already playing at its speed, so it lines up
  // whatever happened since the start: counting from t0 at today's tempo put
  // a row joining after a tempo change on the wrong pill (Ben, 2026-10-11:
  // two rows out of sync). Only with no such row does it count from t0.
  function joinClock(i) {
    const mine = stepSeconds(pattern, pattern.rows[i], playMode());
    const j = run.clocks.findIndex((c, k) => c && k !== i && pattern.rows[k] && stepSeconds(pattern, pattern.rows[k], playMode()) === mine);
    if (j >= 0) return { next: run.clocks[j].next, step: run.clocks[j].step % countOf(i) };
    const base = baseStep();
    const k = Math.max(0, Math.ceil((audio.context().currentTime - run.t0) / base));
    return { next: run.t0 + k * base, step: k % countOf(i) };
  }

  // ── The click: a short blip on every beat, higher on the "1". Never
  // recorded, never rendered. On while the keys records into the beat. ──
  let clickOn = false;
  let clickNext = 0;
  let clickBeat = 0;
  function blip(at, one) {
    const ctx = audio.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = one ? 1500 : 1000;
    gain.gain.setValueAtTime(0.25, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(at);
    osc.stop(at + 0.04);
  }
  // Pills a live DJ hit already played, so the beat must not play them again.
  let skips = [];   // [{row, at}]

  // The click follows the beat's groups (4/4: four beats; 6/8: two).
  function scheduleClicks(on, until = audio.context().currentTime + lookahead()) {
    const ctx = audio.context();
    // Fallen behind (the beat stopped, or the tab slept): start again now
    // rather than play every missed tick at once.
    // While the beat plays, the ticks it missed are skipped along its grid
    // instead, so the click (and the keys view's growing, which counts on it)
    // stays on the beat after a stall.
    if (playing()) {
      while (clickNext < ctx.currentTime - 0.05) { clickNext += groups()[clickBeat % groups().length] * baseStep(); clickBeat++; }
    } else if (clickNext < ctx.currentTime - 0.05) { clickNext = ctx.currentTime + 0.05; clickBeat = 0; }
    // Off, it still keeps its place on the beat, so turning it on lands on time.
    while (clickNext < until) {
      const g = groups();
      const b = clickBeat % g.length;
      // The last beat of the whole beat is being booked: the keys view may
      // grow it now, a beat before the rows' wrap is booked (setGrow).
      // (Counted in pills from t0, which a tempo change keeps right.)
      if (growHook && playing() && Math.round((clickNext - run.t0) / baseStep()) % total() === total() - g.at(-1) && growHook()) grow();
      if (on) blip(clickNext, b === 0);
      clickNext += g[b] * baseStep();
      clickBeat++;
    }
  }
  // The click on its own, with the beat stopped (the keys' Live): the
  // open beat's tempo and time signature. While the beat plays, its own
  // schedule ticks instead.
  let aloneTimer = 0;
  // Growing while recording (the keys view): `growHook()` is asked once per
  // pass, as the last beat starts; true doubles the bars (1 → 2 → 4), the
  // new bars a copy of the beat so far (multiplyRows). The rows' clocks
  // read the bars every pill, so the playhead carries on into the new bars.
  let growHook = null;
  const setGrow = (fn) => { growHook = typeof fn === 'function' ? fn : null; };
  function grow() {
    const bars = (pattern?.bars || 1) * 2;
    if (!pattern || !BAR_CHOICES.includes(bars)) return;
    const from = total();
    pattern.rows = multiplyRows(pattern.rows, from, from * 2);
    pattern.bars = bars;
    save();
    render();
  }
  // Where the click's next tick goes, with the beat stopped (DJ's tap tempo:
  // one beat after the last tap). While the beat plays it keeps the beat's place.
  function clickAt(at) {
    if (playing() || !Number.isFinite(at)) return;
    clickNext = at;
  }
  function metronome(on) {
    clearInterval(aloneTimer);
    aloneTimer = 0;
    if (!on) return;
    aloneTimer = setInterval(() => { if (!playing()) scheduleClicks(true); }, TICK_MS);
  }

  // The beat's loop is the engine's (beat-engine.js play: what is due, and a
  // tick that books it). What is Beats' own is passed in as hooks (play,
  // above): the click before the rows, the chip switch at the bar line.
  // A pill a live hit already played is not booked again; the skip is used up.
  function usedSkip(row, next, dt) {
    const k = skips.findIndex((s) => s.row === row && Math.abs(s.at - next) < dt / 2);
    if (k < 0) return false;
    skips.splice(k, 1);
    return true;
  }

  // Every frame: the pills being heard now, from the audio clock less the
  // output's delay, so the playhead keeps with the click a kid hears.
  function follow() {
    const ctx = audio.context();
    if (run && stepsHeard(run.queue, run.shown, ctx.currentTime, outputDelay(ctx))) { showSteps(); deps.onSteps?.(run.shown); }
    // How hard the limiter is holding the output down (dB, negative): the
    // event log keeps the worst, a sign that sounds stacked up.
    if (stats && audio.limiter) stats.limiterDb = Math.min(stats.limiterDb, audio.limiter.reduction || 0);
    raf = requestAnimationFrame(follow);
  }

  // Only the pills that change: the one each row leaves and the one it reaches
  // (16 rows of 4 bars are over a thousand pills).
  function showSteps() {
    const shown = run?.shown ?? [];   // nothing is lit once the beat has stopped
    pills.forEach((row, i) => {
      const p = row[shown[i]] ?? null;
      if (litPills[i] === p) return;
      litPills[i]?.classList.remove('now');
      p?.classList.add('now');
      litPills[i] = p;
    });
    litPills.length = pills.length;
    drawPlayhead();
    keepInSight();
    roll?.step(run?.shown ?? []);
  }

  // The rows scroll sideways (Ben, 2026-10-25). While a beat plays the box
  // follows the playhead a screen at a time: once the pill being heard leaves
  // what shows beside the rows' heads, its beat moves to the left edge, as a
  // page turns. A scroll by the kid stops it until the next ▶ Play.
  const rowBox = el.rows.closest?.('.seq-scroll') ?? null;
  const rowFollow = follower(rowBox);   // follow.js
  function keepInSight() {
    const pill = litPills.find(Boolean);
    if (!pill) return;
    keepInView(rowFollow, rowBox, pill, el.rows.querySelector('.seq-head')?.offsetWidth ?? 0, pill.closest('.seq-beat') ?? pill);
  }

  // The playhead: a bar down through every row at the step being played.
  // When the rows are in step and each fits on one line, it is one bar from
  // the first row to the last. When rows run at different tempos, or a phone
  // wraps each row onto two lines of 8, it is a short bar on each row's
  // playing pill instead.
  function drawPlayhead() {
    // Collapsed rows have no pills on screen, so the bar skips them.
    const shown = run?.shown ?? [];
    const current = pills.map((row, i) => (shown[i] >= 0 && row.length ? row[shown[i]] : null)).filter(Boolean);
    if (!current.length) { el.playhead.replaceChildren(); return; }
    const box = el.rows.getBoundingClientRect();
    const rects = current.map((p) => p.getBoundingClientRect());
    const first = pills.find((row) => row.length).filter((p) => !p.hidden);
    const wrapped = first[0].getBoundingClientRect().top !== first[first.length - 1].getBoundingClientRect().top;
    const centre = (r) => r.left + r.width / 2;
    const aligned = rects.every((r) => Math.abs(centre(r) - centre(rects[0])) < 1);
    const spans = wrapped || !aligned
      ? rects.map((r) => [centre(r), r.top - 6, r.bottom + 6])
      : [[centre(rects[0]), rects[0].top - 6, rects[rects.length - 1].bottom + 6]];
    el.playhead.replaceChildren(...spans.map(([x, top, bottom]) => {
      const bar = document.createElement('div');
      bar.className = 'seq-bar';
      bar.style.left = `${x - box.left}px`;
      bar.style.top = `${top - box.top}px`;
      bar.style.height = `${bottom - top}px`;
      return bar;
    }));
  }

  // A row in one line, for the event log.
  function rowSummary(row) {
    const clip = deps.clipById(row.clipId);
    // The label stays in this device's log; a problem report sends only `kind` (log-clean.js).
    return { sound: clip?.label ?? null, kind: soundKind(clip), voice: clip?.voice ?? null, pills: row.steps.filter(Boolean).length,
      rate: row.rate, ring: row.ring, muted: row.muted, volume: rowLevel(row) };
  }

  // ── Rendering ──

  function render() {
    el.bpm.min = 0;
    el.bpm.max = STOPS.length - 1;
    showBeatBars();
    showClick();
    // No person yet, or 🎤 Live: no beat, so the deck and rows go. (Beats
    // always has one: the scratch when nothing else is open, ADR 0020.)
    for (const node of [el.top, el.controls, el.rows]) if (node) node.hidden = !pattern;
    if (!pattern) {
      pills.length = 0;
      el.rows.replaceChildren(el.playhead);
      rowFollow.stop();
      roll?.close();
      el.add.hidden = true;
      if (el.addTune) el.addTune.hidden = true;
      el.empty.hidden = true;
      el.noRows.hidden = true;
      if (undo && undo.pattern !== pattern) offerUndo(null);
      select?.decorate();
      return;
    }
    showTempo();
    showSwing();
    for (const b of el.bars.querySelectorAll('[data-bars]')) b.setAttribute('aria-pressed', String(Number(b.dataset.bars) === pattern.bars));
    for (const b of el.sigs.querySelectorAll('[data-sig]')) b.setAttribute('aria-pressed', String(b.dataset.sig === sigOf()));
    el.sigs.hidden = !advanced;   // the time signature is Advanced; swing shows at Regular too (Ben, 2026-10-26)
    deps.onShape?.();
    // Rows can use any person's sounds, so the beat maker only needs one
    // sound somewhere, not on this board.
    const clips = deps.groups().flatMap((g) => g.clips);
    cell.row = Math.min(cell.row, Math.max(0, pattern.rows.length - 1));
    pills.length = 0;
    twins = twinRows(pattern.rows.map((r) => deps.clipById(r.clipId)?.emoji || '🔊'));
    el.rows.replaceChildren(el.playhead, ruler(), ...pattern.rows.map((row, i) => renderRow(row, i, clips)));
    el.add.hidden = pattern.rows.length >= MAX_ROWS;
    el.add.disabled = clips.length === 0;
    if (el.addTune) { el.addTune.hidden = el.add.hidden; el.addTune.disabled = el.add.disabled; }
    el.empty.hidden = clips.length > 0;
    el.noRows.hidden = clips.length === 0 || pattern.rows.length > 0;
    if (undo && undo.pattern !== pattern) offerUndo(null);
    drawPlayhead();
    speakers?.refresh();   // an open loudness popover follows its row, or closes with it
    rowMenus?.refresh();   // an open row menu shows its row as it is now
    if (mixer?.isOpen()) mixer.render();   // another beat, or a row gone: the open mixer follows
    roll?.refresh();       // and 🎹 the roll, or it closes when its row is gone
    select?.decorate();    // the pick (pill-select.js)
  }

  // A pill's look and its spoken state: off, on, or on and loud.
  function showPill(p, row, s) {
    const loud = !!(row.steps[s] && row.accents?.[s]);
    p.setAttribute('aria-pressed', String(!!row.steps[s]));
    p.classList.toggle('loud', loud);
    p.setAttribute('aria-label', p.getAttribute('aria-label').replace(/, loud$/, '') + (loud ? ', loud' : ''));
  }

  let twins = new Set();   // rows whose emoji another row shows too: a letter tells them apart
  function renderRow(row, i, clips) {
    const clip = deps.clipById(row.clipId);
    const wrap = document.createElement('div');
    wrap.className = 'seq-row';
    wrap.dataset.row = i;
    if (clip) wrap.style.setProperty('--pill', deps.colorOf(clip));

    // The row's controls at its left, its pills on one line after them
    // (beat-row.js draws the emoji and tools); the emoji opens the row's
    // menu. The muted look and faint pills follow the speaker.
    const { pick, tools } = rowTools(row, i, clip);
    wrap.classList.toggle('muted', row.muted);
    showMix(wrap, row);
    wrap.style.setProperty('--vol', String(rowLevel(row)));   // a quieter row's pills draw fainter

    const count = countOf(i);
    // A tune row (ADR 0023): its pills are a preview of its notes, lit where
    // a note starts and half lit while one lasts; a tap opens 🎹 the roll.
    const tune = row.melody;
    const held = tune ? heldPills(row) : null;
    wrap.classList.toggle('tune', tune);
    const steps = document.createElement('div');
    steps.className = tune ? 'seq-steps seq-tune' : 'seq-steps';
    const rowPills = [];
    // One block per bar, side by side on one line (the rows scroll sideways
    // together, Ben, 2026-10-25); in each, one group of pills per beat of
    // the time signature.
    let s0 = 0;
    for (let m = 0; m < pattern.bars; m++) {
    const measure = document.createElement('div');
    measure.className = 'seq-measure';
    measure.hidden = s0 >= count;
    if (pattern.bars > 1) measure.setAttribute('aria-label', `Bar ${m + 1}`);
    groups().forEach((size, b) => {
      const beat = document.createElement('div');
      beat.className = 'seq-beat';
      beat.style.setProperty('--size', size);
      for (let k = 0; k < size; k++) {
        const s = s0 + k;
        const p = document.createElement('button');
        p.type = 'button';
        // The first pill of each beat is a shade brighter, and the first of
        // each bar (the "1") brighter still, so the grid shows its own count.
        p.className = k > 0 ? 'pill' : b > 0 ? 'pill beat-start' : 'pill one';
        p.dataset.step = s;
        p.setAttribute('aria-label', `Row ${i + 1}, ${clip ? clip.label : 'no sound'}: ${pattern.bars > 1 ? `bar ${m + 1}, ` : ''}beat ${b + 1}, part ${k + 1}${tune ? '. A tune: tap to open 🎹 the piano roll' : ''}`);
        p.tabIndex = i === cell.row && s === cell.step ? 0 : -1;
        showPill(p, row, s);
        if (held?.has(s)) p.classList.add('held');
        p.hidden = s >= count;
        if (s === run?.shown[i]) { p.classList.add('now'); litPills[i] = p; }
        beat.append(p);
        rowPills.push(p);
      }
      beat.hidden = s0 >= count;
      measure.append(beat);
      s0 += size;
    });
    steps.append(measure);
    }
    pills[i] = rowPills;
    // The row's head, stuck at the left while its pills scroll: ⠿ · emoji ·
    // name · 🔊 with room, emoji · 🔊 on a phone (styles.css). A long name is
    // cut short with … (Ben, 2026-10-12). The name is the emoji's too: a tap
    // on it opens the menu.
    const name = document.createElement('span');
    name.className = 'seq-name';
    name.textContent = clip ? clip.label : 'No sound';
    name.setAttribute('aria-hidden', 'true');   // the emoji's label says it
    name.addEventListener('click', () => pick.click());
    wrap.append(header(i, [pick, name], tools), steps);
    return wrap;
  }

  // The bar numbers over the rows, laid out as a row's pills are, so a kid
  // scrolled along a long beat knows which bar they are in.
  function ruler() {
    const line = document.createElement('div');
    line.className = 'seq-ruler';
    line.setAttribute('aria-hidden', 'true');
    const head = document.createElement('div');
    head.className = 'seq-head';
    const steps = document.createElement('div');
    steps.className = 'seq-steps';
    for (let m = 0; m < pattern.bars; m++) {
      const measure = document.createElement('div');
      measure.className = 'seq-measure';
      groups().forEach((size, b) => {
        const beat = document.createElement('div');
        beat.className = 'seq-beat';
        beat.style.setProperty('--size', size);
        for (let k = 0; k < size; k++) {
          const tick = document.createElement('span');
          tick.className = k === 0 && b === 0 ? 'seq-tick one' : 'seq-tick';
          tick.textContent = k > 0 ? '' : b === 0 ? String(m + 1) : '·';
          beat.append(tick);
        }
        measure.append(beat);
      });
      steps.append(measure);
    }
    line.append(head, steps);
    return line;
  }


  // The pills a tune row's notes go on sounding through (not their first).
  function heldPills(row) {
    const out = new Set();
    for (const n of row.tune ?? []) for (let s = Math.floor(n.s) + 1; s < n.s + n.l; s++) out.add(s);
    return out;
  }

  // A row's head: the grip that drags it (once there is somewhere to move;
  // with room only, a phone moves rows from the menu), then `middle` (the
  // emoji and name), then 🔊 and the menu's buttons, out of sight.
  function header(i, middle, tools) {
    const head = document.createElement('div');
    head.className = 'seq-head';
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'seq-grip';
    grip.dataset.grip = i;
    grip.hidden = pattern.rows.length < 2;
    grip.setAttribute('aria-label', `Move row ${i + 1}: drag it, or use the up and down arrow keys`);
    head.append(grip, ...[middle].flat(), tools);
    return head;
  }

  // A row's emoji and its 🔔 · 🔊 · 🧹 · ✕, shared with the keys view (beat-row.js). ✕ and 🧹
  // take two taps: the first asks, in red, and the question goes away after a
  // few seconds or any other tap. ✕ has Undo. 🔔 turns the row's Let it ring on
  // or off at once. The emoji opens the sound chooser (with advanced beats
  // on, speed is there too); a tune row's opens 🎹 the roll, and wears a small 🎹.
  function rowTools(row, i, clip) {
    const name = clip ? clip.label : 'no sound';
    const twin = twins.has(i);
    const parts = rowParts({
      asked: asking?.row === i ? asking.kind : null,
      ring: ringTool(row, i, name),
      speaker: rowSpeaker(i, levelState(i)),
      canClear: row.steps.some(Boolean),
      emoji: clip ? rowEmoji(clip.emoji || '🔊', twin, [...clip.label][0]?.toUpperCase()) : '➕',
      title: clip ? clip.label : 'Pick a sound',
      data: { remove: { remove: i }, clear: { clear: i }, pick: { pick: i } },
      // The emoji opens the row's menu (Ben, 2026-10-25).
      menu: { key: i, label: `Row ${i + 1}: ${name}. Menu: ${row.melody ? 'notes' : 'sound, Let it ring'}, Clear, Remove, move`,
        change: row.melody ? ['🎹', 'Edit notes'] : ['🔄', 'Change sound'], extra: moveButtons(i) },
      labels: {
        remove: `Remove row ${i + 1}`, removeAsk: `Tap again to remove row ${i + 1}`,
        clear: row.melody ? `Clear row ${i + 1}: take out all its notes` : `Clear row ${i + 1}: turn off all its pills`, clearAsk: `Tap again to clear row ${i + 1}`,
        pick: row.melody ? `Row ${i + 1}: a tune on ${name}. Tap to open 🎹 the piano roll.` : `Row ${i + 1}: ${name}. Tap to change its sound.`,
      },
    });
    parts.pick.classList.toggle('tune', !!row.melody);
    return parts;
  }

  // ↑ Move up and ↓ Move down, in a row's menu: how a phone, which has no
  // room for the grip, moves a row (Ben, 2026-10-25).
  function moveButtons(i) {
    return [['up', '↑', 'Move up', i > 0], ['down', '↓', 'Move down', i < pattern.rows.length - 1]].map(([dir, icon, word, can]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row-move icon-btn';
      b.textContent = icon;
      b.dataset.move = dir;
      b.disabled = !can;
      b.setAttribute('aria-label', `${word}: row ${i + 1}`);
      b.setAttribute('data-more-word', word);
      return b;
    });
  }

  // A row's 🔔 Let it ring for beat-row.js, here and in the keys view. A tune
  // row's notes always overlap (chords), so it has none.
  function ringTool(row, i, name) {
    if (row.melody) return null;
    return { on: row.ring, data: { ring: i },
      label: `Let it ring for row ${i + 1}, ${name}: ${row.ring ? 'on, its hits ring over each other' : 'off, each hit cuts off the last'}. Tap to turn it ${row.ring ? 'off' : 'on'}.` };
  }
  // Turns row i's 🔔 Let it ring on or off: saved with the beat, heard from its next hit.
  function toggleRing(i) {
    const row = pattern?.rows[i];
    if (!row || row.melody) return;
    row.ring = !row.ring;
    save();
    render();
    deps.announce?.(`Let it ring ${row.ring ? 'on' : 'off'} for row ${i + 1}.`);
  }

  // The Clear or Remove waiting for its second tap: {row, kind}, or null.
  let asking = null;
  let askTimer = 0;
  function arm(next) {
    clearTimeout(askTimer);
    asking = next;
    if (next) askTimer = setTimeout(() => { asking = null; render(); }, ARM_MS);
  }

  // ── Chooser: the row's dialog. Tapping a sound plays it and marks it;
  // "Use" sets the row. With advanced beats on, also the row's speed (its
  // 🔔 Let it ring is on the row's header line). ──

  // What the chooser is choosing for: a beat row ({row: i, title}), or new
  // rows ({adding: true, title}).
  let target = null;
  let choosing = -1;   // the row, when the target is a row
  let picked = null;   // the sound marked in it, not used until "Use"
  let ticks = [];      // new rows: the sounds ticked, in the order tapped
  let opened = new Map();  // group id -> open, set in this dialog (it wins over the shared state)
  let instOpen = null;     // the group whose instrument list is open (one at a time), or null

  function openFor(next, current, returnTo) {
    target = next;
    choosing = next.row ?? -1;
    picked = current ?? null;
    ticks = next.adding && current ? [current] : [];
    // The group holding the current sound starts open, but can still be closed.
    const home = deps.groups().find((g) => g.collapsible && g.clips.some((c) => c.id === picked));
    opened = new Map(home ? [[home.groupId, true]] : []);
    instOpen = null;
    renderChooser();
    openDialog(el.chooser, {
      focus: el.chooserGrid.querySelector('[aria-pressed="true"]') || el.chooserGrid.querySelector('[data-choose], [data-toggle-group]'),
      returnTo,
    });
  }
  function openChooser(i) {
    openFor({ row: i, title: `Row ${i + 1}` }, pattern.rows[i]?.clipId, () => el.rows.querySelector(`[data-pick="${i}"]`) || el.add);
  }

  // The chooser's sections: the kit's groups (each opens and closes, like on
  // the pads screen; the one holding the row's sound starts open),
  // then every person's own sounds, each under their name in their color.
  const isOpen = (id) => (opened.has(id) ? opened.get(id) : Boolean(deps.isGroupOpen?.(id)));

  function renderChooser() {
    el.chooserTitle.textContent = target?.title ?? 'Pick a sound';
    el.chooserGrid.replaceChildren(...deps.groups().map((g) => {
      const section = document.createElement('section');
      section.className = 'chooser-group';
      section.style.setProperty('--c', g.color);
      const open = !g.collapsible || isOpen(g.groupId);
      let heading;
      let list = null;
      if (g.collapsible) {
        heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'chooser-toggle';
        heading.dataset.toggleGroup = g.groupId;
        heading.setAttribute('aria-expanded', String(open));
        heading.textContent = `${open ? '▾' : '▸'} ${g.name} (${g.clips.length})`;
        // Notes, Chords and Bass: who plays them beside the name, as on
        // 🔊 Pads (inst-picker.js, ADR 0030), its list under it while open.
        if (hasPicker(g.groupId)) {
          const kit = { id: g.groupId, name: g.plain ?? g.name };
          const line = document.createElement('div');
          line.className = 'chooser-inst-row';
          line.append(heading, pickerButton(kit, instOpen === g.groupId, { where: 'chooser' }));
          heading = line;
          if (instOpen === g.groupId) list = pickerList(kit, { where: 'chooser' });
        }
      } else {
        heading = document.createElement('h3');
        heading.textContent = g.name;
      }
      const grid = document.createElement('div');
      grid.className = 'chooser-grid';
      grid.append(...g.clips.map((c) => {
        const b = deps.makePad(c);
        b.classList.add('pad-mini');
        b.dataset.choose = c.id;
        showTick(b);
        return b;
      }));
      grid.hidden = !open;
      section.append(...[heading, list, grid].filter(Boolean));
      return section;
    }));
    renderChooserTools();
  }

  // The bottom bar: the Use button names the marked sound; the row buttons
  // show the row as it is now.
  function renderChooserTools() {
    if (target?.adding) {
      const n = ticks.length;
      el.chooserOk.textContent = n ? `Add ${n} row${n === 1 ? '' : 's'}` : 'Tick a sound';
      el.chooserOk.disabled = !n;
      el.chooserTitle.textContent = n && n >= room() ? 'New rows · beat full' : 'New rows';
      el.chooserTools.hidden = true;
      return;
    }
    const clip = deps.clipById(picked);
    el.chooserOk.textContent = clip ? `Use ${clip.label}` : 'Pick a sound';
    el.chooserOk.disabled = !clip;
    const row = pattern?.rows[choosing];
    // 🎹 Tune for everyone; speed with Advanced.
    el.chooserTools.hidden = !row;
    const rates = el.chooserRate.closest('.chooser-rate');
    if (rates) rates.hidden = !advanced;
    if (!row) return;
    showTuneKey(row);
    for (const b of el.chooserRate.querySelectorAll('[data-rate]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === row.rate));
  }

  // A sound in the chooser shows whether it is marked; for new rows, ticked,
  // with its place in the order tapped (the rows go in that order).
  function showTick(b) {
    const id = b.dataset.choose;
    const at = target?.adding ? ticks.indexOf(id) : -1;
    b.setAttribute('aria-pressed', String(target?.adding ? at >= 0 : id === picked));
    if (at >= 0) b.dataset.tick = String(at + 1);
    else delete b.dataset.tick;
  }
  const room = () => MAX_ROWS - (pattern?.rows.length ?? MAX_ROWS);

  // Marks a sound and plays it, so it can be heard before it is used. For new
  // rows a tap ticks it (and plays it), or unticks it; a full beat ticks no more.
  function mark(clipId) {
    let hear = true;
    if (target?.adding) {
      const at = ticks.indexOf(clipId);
      if (at >= 0) { ticks.splice(at, 1); hear = false; }
      else if (ticks.length < room()) ticks.push(clipId);
    } else picked = clipId;
    for (const b of el.chooserGrid.querySelectorAll('[data-choose]')) showTick(b);
    const clip = deps.clipById(clipId);
    if (clip && hear) audio.play(clip);
    renderChooserTools();
  }

  // The new rows' Add: a row for each ticked sound, in the order tapped.
  function addTicked() {
    const clips = ticks.map((id) => deps.clipById(id)).filter(Boolean).slice(0, room());
    for (const clip of clips) {
      pattern.rows.push(cleanRow({ clipId: clip.id }));
      if (playing()) prepare(clip);
    }
    el.chooser.close();
    if (!clips.length) return;
    save();
    render();
  }

  // `then`: what happens once the chooser has closed (🎹 Tune opens the roll).
  function useMarked({ then, changed = false } = {}) {
    const clip = deps.clipById(picked);
    const row = pattern?.rows[choosing];
    if (!row) return;
    if (clip && row.clipId !== picked) {
      row.clipId = picked;
      if (playing()) prepare(clip);
      changed = true;
    }
    if (changed) save();
    el.chooser.close();
    render();
    then?.();
  }

  // A row setting changed from the dialog: save, redraw the rows behind it.
  function rowChanged() {
    save();
    render();
    renderChooserTools();
  }

  // Moves a row; while playing, its clock, voices and playhead go with it.
  function moveRow(from, to) {
    const where = moveItem(pattern.rows, from, to);
    if (playing()) {
      run.moveRow(from, to, where);
    }
    cell.row = where[cell.row] ?? 0;
    save();
    render();
  }

  // Dragging a row by its grip: the row follows the finger, and the others
  // make room as it passes their middle. Near the top or bottom of the
  // screen the page scrolls (edge-scroll.js). The order is saved on release.
  const rowDrag = { row: null, pointerId: null, grabY: 0, y: 0 };
  const rowEls = () => [...el.rows.children].filter((c) => c.classList.contains('seq-row'));
  const rowScroll = edgeScroller(() => placeRow(rowDrag.y));

  function rowDragDown(e) {
    const grip = e.target.closest('[data-grip]');
    if (!grip || e.button !== 0 || rowDrag.row) return;
    e.preventDefault();
    const row = grip.closest('.seq-row');
    Object.assign(rowDrag, { row, pointerId: e.pointerId, grabY: e.clientY - row.getBoundingClientRect().top, y: e.clientY });
    grip.setPointerCapture?.(e.pointerId);
    row.classList.add('dragging');
  }

  function rowDragMove(e) {
    if (!rowDrag.row || e.pointerId !== rowDrag.pointerId) return;
    rowDrag.y = e.clientY;
    placeRow(e.clientY);
    rowScroll.at(e.clientY);
  }
  // Puts the dragged row where a finger at y says (also as the page scrolls under it).
  function placeRow(y) {
    const row = rowDrag.row;
    if (!row) return;
    // Its place is after every other row whose middle is above the finger,
    // which also works past the first or last row.
    const others = rowEls().filter((r) => r !== row);
    const place = others.filter((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < y; }).length;
    if (rowEls().indexOf(row) !== place) {
      if (place === 0) others[0].insertAdjacentElement('beforebegin', row);
      else others[place - 1].insertAdjacentElement('afterend', row);
    }
    // It stays inside the rows' box: below it, it would make the page longer,
    // and the edge scrolling would chase it for ever.
    row.style.translate = '';
    const b = row.getBoundingClientRect(), box = el.rows.getBoundingClientRect();
    const top = Math.max(box.top, Math.min(y - rowDrag.grabY, box.bottom - b.height));
    row.style.translate = `0 ${top - b.top}px`;
  }

  function rowDragUp(e) {
    const row = rowDrag.row;
    if (!row || e.pointerId !== rowDrag.pointerId) return;
    rowDrag.row = null;
    rowScroll.stop();
    row.classList.remove('dragging');
    row.style.translate = '';
    const from = Number(row.dataset.row);
    const to = rowEls().indexOf(row);
    if (from !== to) moveRow(from, to);
    else render();
    el.rows.querySelector(`[data-grip="${to}"]`)?.focus();
  }

  // Switches every pill of row i off, with no Undo bar of its own (the keys
  // offers its own Undo), as Beats' Clear does.
  function clearRow(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    wipeRow(row);
    save();
    render();
  }
  // Every pill of a row off; a tune row's notes go too.
  function wipeRow(row) {
    row.steps = row.steps.map(() => false);
    row.accents = row.steps.map(() => false);
    if (row.melody) { row.tune = []; row.notes = row.steps.map(() => null); }
  }
  // Takes row i out with no Undo bar of its own (the keys offers its own Undo).
  function dropRow(i) {
    if (!pattern?.rows[i]) return;
    removeRow(i);
    offerUndo(null);
  }
  function removeRow(i) {
    if (playing()) {
      run.removeRow(i);
    }
    const [row] = pattern.rows.splice(i, 1);
    offerUndo({ row, at: i, pattern });
    save();
    render();
  }

  // The last removed row, which Undo puts back where it was, for a few
  // seconds. Loading another beat or person forgets it.
  // It shows in the banner over the top of the screen (ui.js showBanner),
  // which forgets it when it goes.
  let undo = null;
  let undoBanner = null;
  function offerUndo(next) {
    undo = next;
    if (!next) { undoBanner?.close(); undoBanner = null; return; }
    const clip = next.row && deps.clipById(next.row.clipId);
    const text = next.copy ? next.text
      : next.level ? `${levelState(next.level.at).name} loudness ${percent(rowLevel(pattern.rows[next.level.at]))} %.`
      : 'before' in next && next.added !== undefined ? `Added ${next.added} ${next.added === 1 ? 'hit' : 'hits'} from “${next.groove}”.`
      : 'before' in next && next.replaced ? `“${next.groove}” replaced your scratch beat.`
      : 'before' in next ? `Loaded “${next.groove}” into your scratch beat.`
      : `Removed row ${next.at + 1}${clip ? ` (${clip.label})` : ''}.`;
    undoBanner = showBanner(text, {
      action: { label: '↩️ Undo', fn: undoRemove },
      ms: UNDO_MS,
      // Focus on a vanishing Undo would be lost; it goes to Add a row.
      focusBack: () => el.add,
      onClose: () => { if (undo === next) { undo = null; undoBanner = null; } },
    });
  }

  function undoRemove() {
    // Pills slid or turned off with a mouse (pill-select.js): the rows as they were.
    if (undo?.copy && undo.pattern === pattern) {
      const { copy } = undo;
      offerUndo(null);
      putRows(copy.rows);
      save();
      return;
    }
    if (undo?.level && undo.pattern === pattern) {
      const { at, before } = undo.level;
      offerUndo(null);
      putLevel(at, before);
      el.rows.querySelector(`[data-speaker="${at}"]`)?.focus();
      return;
    }
    if (undo && 'scratchBefore' in undo && undo.pattern === pattern) {
      const was = undo;
      offerUndo(null);
      undoLoad(was);
      return;
    }
    if (undo && 'before' in undo && undo.pattern === pattern) {
      openBeat(undo.before);
      offerUndo(null);
      return;
    }
    if (!undo || undo.pattern !== pattern || !pattern || pattern.rows.length >= MAX_ROWS) { offerUndo(null); return; }
    const { row, at } = undo;
    const i = Math.min(at, pattern.rows.length);
    pattern.rows.splice(i, 0, row);
    if (playing()) {
      // It rejoins in time, like a row added while playing.
      run.insertRow(i);
      prepare(deps.clipById(row.clipId));
    }
    offerUndo(null);
    save();
    render();
    el.rows.querySelector(`[data-speaker="${i}"]`)?.focus();
  }

  // ── A row's loudness: its speaker (row-volume.js) ──

  // What a row's speaker shows: its level, mute, and its sound's name.
  function levelState(i) {
    const row = pattern?.rows[i];
    if (!row) return null;
    return { level: rowLevel(row), muted: row.muted, solo: !!row.solo, silenced: silencedBySolo(pattern, row), name: deps.clipById(row.clipId)?.label ?? `Row ${Number(i) + 1}` };
  }
  // A row's mixer state in the compact rows: dimmed when another row's Solo
  // silences it, a lit ring on its emoji when soloed (the 🎚️ Mixer).
  function showMix(wrap, row) {
    wrap.classList.toggle('silenced', silencedBySolo(pattern, row));
    wrap.classList.toggle('solo', !!row.solo);
  }
  const levelOf = (i) => (pattern?.rows[i] ? { volume: rowLevel(pattern.rows[i]), muted: pattern.rows[i].muted } : null);
  // A level change reaches the hits still ringing too, not only the next ones.
  function applyLevel(i) {
    const row = pattern?.rows[i];
    if (!row || !playing()) return;
    const now = audio.context().currentTime;
    if (!audible(row, pattern)) { for (const v of run.voices[i] || []) fadeStop(v, now); return; }
    for (const v of run.voices[i] || []) {
      if (v.end <= now) continue;
      v.level = (v.lift ?? 1) * rowLevel(row);
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(v.level, now + 0.03);
      } catch { /* already stopped */ }
    }
  }
  // Redraws one row's speaker and pills' faintness in place, so a
  // drag never rebuilds the rows under the finger.
  function showLevel(i) {
    const s = levelState(i);
    const wrap = el.rows.querySelector(`.seq-row[data-row="${i}"]`);
    if (!s || !wrap) return;
    wrap.classList.toggle('muted', s.muted);
    showMix(wrap, pattern.rows[i]);
    wrap.style.setProperty('--vol', String(s.level));
    const b = wrap.querySelector('[data-speaker]');
    if (b) drawSpeaker(b, s);
  }
  // Puts a row's level and mute back (Undo, or the keys' Undo).
  function putLevel(i, { volume, muted }) {
    const row = pattern?.rows[i];
    if (!row) return;
    setRowLevel(row, volume);
    row.muted = !!muted;
    applyLevel(i);
    save();
    render();
  }
  // Tap on a speaker: mute or unmute; the level stays.
  function toggleMute(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    row.muted = !row.muted;
    applyLevel(i);   // muted: what the row is playing now goes quiet too
    save();
    showLevel(i);
  }
  // A new level for row i. While a drag or slide goes on (`done` false) it
  // plays at once and draws in place; at its end it saves and offers Undo,
  // one step for the whole gesture (and for a run of changes to one row).
  // Turning a muted row's level unmutes it: the kid wants to hear it.
  let levelBefore = null;   // {at, before}: the row's level when this gesture started
  function setLevel(i, level, done = true, { offer = true } = {}) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (levelBefore?.at !== i || levelBefore.pattern !== pattern) levelBefore = { at: i, pattern, before: levelOf(i) };
    setRowLevel(row, level);
    row.muted = false;
    applyLevel(i);
    showLevel(i);
    if (!done) return;
    const { before } = levelBefore;
    levelBefore = null;
    save();
    if (!offer) return;
    // A run of changes to one row is one Undo: it goes back to before the first.
    const kept = undo?.level && undo.pattern === pattern && undo.level.at === i ? undo.level.before : before;
    offerUndo({ level: { at: i, before: kept }, pattern });
  }
  // ── 🎚️ Mixer (mixer.js): per row a fader, Mute, Solo and an effect, and
  // the master. Each change is heard at once, saves, and redraws the rows
  // behind the sheet (the keys view's through onBeatChange). ──
  function mixChanged() {
    save();
    render();
    deps.onBeatChange?.();
  }
  const applyAll = () => pattern?.rows.forEach((_, j) => applyLevel(j));
  function toggleSolo(i) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (row.solo) delete row.solo; else row.solo = true;
    applyAll();   // the rows it silences go quiet now, not at their next hit
    mixChanged();
  }
  function setRowFx(i, id) {
    const row = pattern?.rows[i];
    if (!row) return;
    if (cleanFx(id)) row.fx = cleanFx(id); else delete row.fx;
    mixChanged();
  }
  // The master's level: heard at once while sliding, saved at the end.
  function setMaster(v, done = true) {
    if (!pattern) return;
    if (cleanVolume(v) < 1) pattern.volume = cleanVolume(v); else delete pattern.volume;
    if (playing()) busFor(audio.context(), audio.master, pattern);
    if (done) save();
  }
  function setMasterFx(id) {
    if (!pattern) return;
    if (cleanFx(id)) pattern.fx = cleanFx(id); else delete pattern.fx;
    mixChanged();
  }
  // All on: every row heard again, mutes and solos off; the levels stay.
  function allOn() {
    if (!pattern) return;
    for (const row of pattern.rows) { row.muted = false; delete row.solo; }
    applyAll();
    mixChanged();
  }
  if (el.mixer) {
    mixer = createMixer({ dialog: el.mixer, strips: el.mixerStrips }, {
      beat: () => pattern, clipById: deps.clipById, colorOf: deps.colorOf,
      setLevel: (i, v, done) => { setLevel(i, v, done, { offer: false }); if (done) deps.onBeatChange?.(); },
      toggleMute: (i) => { toggleMute(i); render(); deps.onBeatChange?.(); },
      toggleSolo, setFx: setRowFx, setMaster, setMasterFx, allOn,
    });
    setupDialog(el.mixer);
  }
  // ── 🎹 The piano roll (roll.js, ADR 0023): a tune row's own screen ──
  let roll = null;
  // A note heard as it is placed, while the beat is stopped: the row's
  // sound at that pitch, for that long, through the row's mix.
  const previews = [];
  // The mix a preview builds while the beat is stopped (〰️ Warble and 🤖
  // Robot run oscillators in it) goes once the roll closes, or once no note
  // has been heard for RING_MS.
  let previewTimer = 0;
  function endPreviews() {
    clearTimeout(previewTimer);
    previewTimer = 0;
    // Every mix into the master but a groove sample's is the beat's (or a
    // preview's) while the beat is stopped: nothing else plays into the
    // master through busFor. A new player there must be left out here too.
    if (!playing()) letGo((m) => m.dest === audio.master && m.p !== sample?.pattern);
  }
  async function previewNote(i, p, l) {
    const row = pattern?.rows[i];
    const clip = deps.clipById(row?.clipId);
    if (!row || !clip || playing()) return;
    await prepare(clip);
    const loaded = engine.get(clip.id);
    if (!loaded || playing()) return;
    const ctx = audio.wake();
    sound(ctx, busFor(ctx, audio.master, pattern).input(i), previews, row, loaded, ctx.currentTime + 0.01, false, p, l * baseStep());
    clearTimeout(previewTimer);
    previewTimer = setTimeout(endPreviews, RING_MS);
  }
  if (el.roll) {
    el.roll.addEventListener('close', endPreviews);
    roll = createRoll(el.roll, {
      beat: () => pattern, row: (i) => pattern?.rows[i], total: () => total(), groups: () => groups(), advanced: () => advanced,
      commit: (i, tune) => {
        const row = pattern?.rows[i];
        if (!row) return;
        pattern.rows[i] = cleanRow({ ...row, tune });
        save();
        render();
        deps.onBeatChange?.();
      },
      preview: previewNote, playing,
      // The keys view's ▶ Play also runs its click track (dj.js), so it is pressed for it.
      togglePlay: () => (slot === 'dj' && el.djPlay ? el.djPlay : el.play).click(),
      openSound: (i, returnTo) => openFor({ row: i, title: `Row ${i + 1}` }, pattern.rows[i]?.clipId, returnTo),
      clipById: deps.clipById, colorOf: deps.colorOf,
      placed: () => countPlay('notes'),
      instrument: rowInstrument, swapInstrument,
    });
  }
  // Who plays a tune row (ADR 0030): {group: {id, name}, inst}, for a row
  // on one of Notes', Chords' or Bass' presets; null for any other sound.
  function rowInstrument(i) {
    const clip = deps.clipById(pattern?.rows[i]?.clipId);
    const inst = clip?.kit ? instrumentById(presetInstrument(clip)) : null;
    if (!inst) return null;
    const name = deps.groups().find((g) => g.groupId === clip.group)?.plain ?? clip.group;
    return { group: { id: clip.group, name }, inst };
  }
  // The roll's 🎹 swaps the row to another instrument's copy of the same
  // note (or chord), so every note of the tune sounds where it was. It is
  // the person's pick too, as every picker is.
  function swapInstrument(i, inst) {
    const row = pattern?.rows[i];
    const clip = deps.clipById(row?.clipId);
    if (!row || !clip?.kit) return;
    const kitId = versionFor(ownIdOf(clip), clip.group, inst);
    const next = kitId ? deps.clipById(`${clip.personId}-${kitId}`) : null;
    if (next && next.id !== row.clipId) {
      pattern.rows[i] = cleanRow({ ...row, clipId: next.id });
      if (playing()) prepare(next);
      save();
      render();
      deps.onBeatChange?.();
    }
    pickInstrument(clip.group, inst).catch((err) => console.error('Keeping the instrument failed:', err));
  }
  function openRoll(i, step = 0) {
    if (!roll || !pattern?.rows[i]?.melody) return;
    const returnTo = () => el.rows.querySelector(`.seq-row[data-row="${i}"] [data-pick]`) ?? el.add;
    roll.open(i, { step, returnTo });
  }
  // 🎹 Add a tune asks "Who plays it?" (ADR 0030): the Notes instruments by
  // family, the person's pick ticked. A tap makes a tune row of that
  // instrument's C (the first sound there is, if the board has none), keeps
  // it as the person's pick, and the roll opens on it.
  let tuneWho = null;   // the instrument tapped, until the dialog has closed
  function addTune(inst) {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    const clips = [...deps.clips(), ...deps.groups().flatMap((g) => g.clips)];
    const kitId = (inst && versionFor('note-c', 'notes', inst)) || 'note-c';
    const next = deps.clipById(`${personId}-${kitId}`) || clips.find((c) => c.id === `${personId}-note-c`) || clips[0];
    if (!next) return;
    pattern.rows.push(cleanRow({ clipId: next.id, melody: true, tune: [] }));
    if (playing()) prepare(next);
    save();
    render();
    deps.onBeatChange?.();
    openRoll(pattern.rows.length - 1);
    if (inst) pickInstrument('notes', inst).catch((err) => console.error('Keeping the instrument failed:', err));
  }
  el.addTune?.addEventListener('click', () => {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    if (!el.tuneWho) { addTune(null); return; }
    const notes = deps.groups().find((g) => g.groupId === 'notes');
    el.tuneWhoList.replaceChildren(pickerList({ id: 'notes', name: notes?.plain ?? 'Notes' }, { where: 'tune', label: 'Who plays it?' }));
    tuneWho = null;
    openDialog(el.tuneWho, { focus: el.tuneWhoList.querySelector('[aria-pressed="true"]'), returnTo: () => el.addTune });
  });
  if (el.tuneWho) {
    setupDialog(el.tuneWho);
    el.tuneWho.addEventListener('click', (e) => {
      const b = e.target.closest('[data-inst]');
      if (!b) return;
      tuneWho = b.dataset.inst;
      el.tuneWho.close();
    });
    // After the dialog has handed focus back, so the roll keeps its own.
    el.tuneWho.addEventListener('close', () => {
      const inst = tuneWho;
      tuneWho = null;
      if (inst) addTune(inst);
    });
  }

  // 🎚️ on the control bar, Beats and the keys view alike.
  function openMixer(from) {
    if (!pattern || !mixer) return;
    mixer.render();
    openDialog(el.mixer, { focus: el.mixerStrips.querySelector('[data-fader]'), returnTo: () => from });
  }
  for (const b of el.mixerButtons ?? []) b.addEventListener('click', () => openMixer(b));

  // ⋯ on a header line short of room (under about 360 px): 🔔 🧹 ✕ move into its
  // menu and stay 44 px; the speaker stays on the line (decisions.md, Screens).
  rowMenus = moreMenu(el.rows);
  speakers = speakerControls(el.rows, {
    state: (key) => levelState(Number(key)),
    toggle: (key) => toggleMute(Number(key)),
    change: (key, level, done) => setLevel(Number(key), level, done),
  });

  // ── Events ──

  el.play.addEventListener('click', () => (playing() ? stop() : play()));
  // The keys view's ▶ Play is wired in dj.js (its click track and recording).

  // The tempo slider moves through STOPS (weighted toward common tempos).
  el.bpm.addEventListener('input', () => {
    const was = pattern.bpm;
    pattern.bpm = STOPS[Number(el.bpm.value)] ?? pattern.bpm;
    retime(was);
    showTempo({ slider: false });
  });
  el.bpm.addEventListener('change', () => { save(); deps.onTempo?.(); });
  // Swing: how late the off-beat eighths play. Three keys beside the time signature. Beats saved with
  // another amount keep it, and the nearest key shows lit.
  const SWING_KEYS = [0, 33, 50];
  function showSwing() {
    const v = pattern.swing || 0;
    const near = SWING_KEYS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    for (const b of el.swing.querySelectorAll('[data-swing]')) b.setAttribute('aria-pressed', String(Number(b.dataset.swing) === near));
  }
  el.swing.addEventListener('click', (e) => {
    const b = e.target.closest('[data-swing]');
    if (!b || !pattern) return;
    pattern.swing = Math.min(MAX_SWING, Number(b.dataset.swing));
    showSwing();
    save();
  });
  // Keys move one tempo at a time (ten with Page Up and Down), not one stop.
  el.bpm.addEventListener('keydown', (e) => {
    const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    const to = e.key === 'Home' ? MIN_BPM : e.key === 'End' ? MAX_BPM : by ? pattern.bpm + by : null;
    if (to == null) return;
    e.preventDefault();
    setTempo(to);
  });
  // The chevrons (a phone's short line): to the next common tempo up or down.
  el.bpm.closest('.tempo-box')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tempo-step]');
    if (!b) return;
    e.preventDefault();   // inside the label: no click passed on to the slider
    const next = Number(b.dataset.tempoStep) > 0 ? COMMON_BPMS.find((t) => t > pattern.bpm) : COMMON_BPMS.findLast((t) => t < pattern.bpm);
    if (next) setTempo(next);
  });
  // Tapping the number swaps it for a field to type a tempo into.
  el.bpmOut.addEventListener('click', () => {
    el.bpmType.value = pattern.bpm;
    el.bpmOut.hidden = true;
    el.bpmType.hidden = false;
    el.bpmType.focus();
    el.bpmType.select?.();
  });
  let typing = false;  // so Enter and the blur that follows it count once
  const endTyping = (keep) => {
    if (el.bpmType.hidden) return;
    const bpm = keep ? typedBpm(el.bpmType.value) : null;
    el.bpmType.hidden = true;
    el.bpmOut.hidden = false;
    if (bpm != null) setTempo(bpm);
    if (typing) el.bpmOut.focus();
    typing = false;
  };
  el.bpmType.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      typing = true;
      endTyping(e.key === 'Enter');
    }
  });
  el.bpmType.addEventListener('blur', () => endTyping(true));


  // + Add a row opens the chooser for new rows (Ben, 2026-10-16: adding eight
  // chords one at a time meant closing Drums eight times). The sound after
  // the last row's comes ticked, its group open, so one tap on Add still adds
  // the next one.
  el.add.addEventListener('click', () => {
    if (!pattern || pattern.rows.length >= MAX_ROWS) return;
    const order = deps.groups().flatMap((g) => g.clips);
    const next = nextSound(order, pattern.rows.map((r) => r.clipId), [...deps.clips(), ...order]);
    openFor({ adding: true, title: 'New rows' }, next?.id, () => el.add);
  });

  let afterHold = () => false;   // set below, once the hold listener is on
  onePressOneClick(el.rows, '.pill');   // a held Enter would toggle a pill on and off
  el.rows.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.seq-row');
    if (!rowEl) return;
    const i = Number(rowEl.dataset.row);
    const row = pattern.rows[i];
    if (e.target.closest('[data-more]')) return;   // the emoji: its menu opens (overflow.js)
    const mover = e.target.closest('[data-move]');
    if (mover) {
      const to = i + (mover.dataset.move === 'up' ? -1 : 1);
      if (to < 0 || to >= pattern.rows.length) return;
      if (asking) arm(null);
      moveRow(i, to);
      // The menu follows the row, so ↓ ↓ ↓ walks it down.
      rowMenus?.close();
      el.rows.querySelector(`[data-more="${to}"]`)?.click();
      return;
    }
    // A tune row's emoji opens 🎹 the roll (its sound changes from there).
    if (e.target.closest('[data-pick]')) { if (row?.melody) openRoll(i); else openChooser(i); return; }
    if (e.target.closest('[data-ring]')) {
      if (asking) arm(null);
      toggleRing(i);
      el.rows.querySelector(`[data-ring="${i}"]`)?.focus();
      return;
    }
    const ask = e.target.closest('[data-clear]') || e.target.closest('[data-remove]');
    const kind = ask && (ask.dataset.clear != null ? 'clear' : 'remove');
    if (ask) {
      if (asking?.row !== i || asking.kind !== kind) {
        arm({ row: i, kind });
        render();
        el.rows.querySelector(`[data-${kind}="${i}"]`)?.focus();
        return;
      }
      arm(null);
      if (kind === 'clear') {
        wipeRow(row);
        save();
        render();
        el.rows.querySelector(`[data-speaker="${i}"]`)?.focus();
      } else {
        removeRow(i);
        undoBanner?.focus();
      }
      return;
    }
    // Any other tap takes back a waiting Clear? or Remove?
    if (asking) { arm(null); render(); }
    if (e.target.closest('[data-speaker]')) return;   // the speaker's own controls (speakerControls)
    const pill = e.target.closest('.pill');
    if (!pill || afterHold()) return;
    const s = Number(pill.dataset.step);
    if (row.melody) { openRoll(i, s); return; }
    // A mouse's click picks (pill-select.js). A tap switches it on or off; a
    // hold makes it loud, and with the keyboard Shift+Space or Shift+Enter.
    if (select?.click(e, i, s)) return;
    if (e.shiftKey && e.detail === 0) holdPill(row, s); else tapPill(row, s);
    showPill(pill, row, s);
    const clear = rowEl.querySelector('[data-clear]');
    if (clear) clear.disabled = !row.steps.some(Boolean);
    // Silent on purpose: a pill only sounds when the beat is playing.
    save();
  });

  // Holding a pill makes it a loud hit (or a loud one normal).
  afterHold = pillHolds(el.rows, (t) => t.closest?.('.pill'), (pill) => {
    if (locked || select?.dragging()) return;   // ⇆ locked: nothing changes; a mouse may be sliding
    const rowEl = pill.closest('.seq-row');
    const row = pattern?.rows[Number(rowEl?.dataset.row)];
    if (!row) return;
    const s = Number(pill.dataset.step);
    if (row.melody) { openRoll(Number(rowEl.dataset.row), s); return; }
    holdPill(row, s);
    showPill(pill, row, s);
    const clear = rowEl.querySelector('[data-clear]');
    if (clear) clear.disabled = !row.steps.some(Boolean);
    save();
  });
  el.rows.addEventListener('pointerdown', rowDragDown);
  // Moving the row in the page drops pointer capture, so the drag listens on
  // the window: a release above or below the rows still ends it.
  window.addEventListener('pointermove', rowDragMove);
  window.addEventListener('pointerup', rowDragUp);
  window.addEventListener('pointercancel', rowDragUp);
  // A wheel or trackpad scroll mid-drag keeps the row under the pointer too.
  window.addEventListener('scroll', () => placeRow(rowDrag.y), { passive: true });
  // On a grip, up and down move the row itself.
  el.rows.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const from = Number(grip.dataset.grip);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= pattern.rows.length) return;
    moveRow(from, to);
    el.rows.querySelector(`[data-grip="${to}"]`)?.focus();
  });

  // Arrow keys move between pills (they are one Tab stop, not 128).
  el.rows.addEventListener('keydown', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill || e.altKey || e.ctrlKey || e.metaKey) return;
    const row = Number(pill.closest('.seq-row').dataset.row);
    const to = pillTarget(e.key, row, Number(pill.dataset.step), pattern.rows.length, countOf);
    if (!to) return;
    e.preventDefault();
    pills[row][Number(pill.dataset.step)].tabIndex = -1;
    [cell.row, cell.step] = to;
    const next = pills[to[0]][to[1]];
    next.tabIndex = 0;
    next.focus();
  });
  // A click or touch also makes that pill the one in the Tab order.
  el.rows.addEventListener('focusin', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill || !pills[cell.row]) return;
    pills[cell.row][cell.step].tabIndex = -1;
    cell.row = Number(pill.closest('.seq-row').dataset.row);
    cell.step = Number(pill.dataset.step);
    pill.tabIndex = 0;
  });

  el.chooser.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-group]');
    if (toggle) {
      const id = toggle.dataset.toggleGroup;
      const open = !isOpen(id);
      opened.set(id, open);
      if (Boolean(deps.isGroupOpen?.(id)) !== open) deps.toggleGroup?.(id);  // the pads screen follows
      renderChooser();
      el.chooserGrid.querySelector(`[data-toggle-group="${CSS.escape(toggle.dataset.toggleGroup)}"]`)?.focus();
      return;
    }
    // Who plays Notes, Chords or Bass: the button opens or closes its list;
    // a tap on an instrument picks it (the person's, as on 🔊 Pads), closes
    // the list and opens the group on that instrument's sounds.
    const who = e.target.closest('[data-inst-pick]');
    if (who) {
      instOpen = instOpen === who.dataset.instPick ? null : who.dataset.instPick;
      renderChooser();
      el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(who.dataset.instPick)}"]`)?.focus();
      return;
    }
    const inst = e.target.closest('[data-inst]');
    if (inst) { chooseInstrument(inst.dataset.instGroup, inst.dataset.inst); return; }
    const pick = e.target.closest('[data-choose]');
    if (pick) mark(pick.dataset.choose);
  });
  async function chooseInstrument(group, inst) {
    instOpen = null;
    opened.set(group, true);
    if (!deps.isGroupOpen?.(group)) deps.toggleGroup?.(group);   // the pads screen follows, as a header tap does
    await pickInstrument(group, inst);
    if (!el.chooser.open) return;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  }
  // Esc in an open instrument list closes the list, not the chooser.
  el.chooser.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !instOpen || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    const group = instOpen;
    instOpen = null;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  });
  el.chooserOk.addEventListener('click', () => (target?.adding ? addTicked() : useMarked()));
  // 🎹 Tune: the row plays notes from 🎹 the piano roll (ADR 0023). On, its
  // pills become notes a pill long, at the sound's own note, and the roll
  // opens (after Use, if a sound is marked). Off, its notes become pills
  // where they start: one with another pitch or length asks first, since
  // those are lost ("Off?" in red, then a second tap).
  let tuneAsked = false;
  function showTuneKey(row) {
    const b = el.chooserMelody;
    if (!b) return;
    b.setAttribute('aria-pressed', String(!!row.melody));
    b.classList.toggle('armed', tuneAsked);
    b.textContent = tuneAsked ? '🎹 Off? Notes lose their pitch' : '🎹 Tune';
    b.setAttribute('aria-label', tuneAsked ? 'Tap again to turn the tune off: its notes become plain pills' : '🎹 Tune: the row plays notes you place in the piano roll');
  }
  el.chooserMelody?.addEventListener('click', () => {
    const i = choosing;
    const row = pattern?.rows[i];
    if (!row) return;
    if (!row.melody) {
      pattern.rows[i] = cleanRow({ ...row, melody: true, tune: undefined });
      tuneAsked = false;
      useMarked({ then: () => openRoll(i), changed: true });
      return;
    }
    const plain = (row.tune ?? []).every((n) => n.p === 0 && n.l === 1 && Number.isInteger(n.s));
    if (!plain && !tuneAsked) { tuneAsked = true; showTuneKey(row); return; }
    tuneAsked = false;
    const { tune: _notes, ...rest } = row;
    pattern.rows[i] = cleanRow({ ...rest, melody: false, notes: [] });
    rowChanged();
  });
  el.chooser.addEventListener('close', () => { tuneAsked = false; });
  el.chooserRate.addEventListener('click', (e) => {
    const row = pattern?.rows[choosing];
    const rate = Number(e.target.closest('[data-rate]')?.dataset.rate);
    if (!row || !ROW_RATES.includes(rate) || rate === row.rate) return;
    row.rate = rate;
    rowChanged();
  });

  // ── Starter grooves ──

  // The dialog lists the grooves by style (GROOVE_GROUPS), each group a
  // heading that opens and shuts like the groups in the emoji list. The
  // groups open now are remembered until the page reloads; at first they
  // are all shut, a short menu of styles.
  const grooveFolds = new Set();
  const hasClip = (id) => !!deps.clipById(id);
  // What a groove's card says under its name: its drums, then "bass" and
  // "chords" if it has them, its length if over a bar, its time signature
  // if not 4/4, and its tempo.
  function grooveInfo(g, beat) {
    const groups = beat.rows.map((r) => deps.clipById(r.clipId)?.group);
    const drums = beat.rows.filter((_, i) => !['bass', 'chords'].includes(groups[i])).map((r) => deps.clipById(r.clipId)?.label).filter(Boolean);
    const parts = [drums.join(', ')];
    if (groups.includes('bass')) parts.push('bass');
    if (groups.includes('chords')) parts.push('chords');
    const { signature, bars } = grooveShape(g);
    return [parts.filter(Boolean).join(' + '), bars > 1 ? `${bars} bars` : '', signature === '4/4' ? '' : signature, `${g.bpm} BPM`]
      .filter(Boolean).join(' · ');
  }
  function grooveCard(g) {
    const beat = grooveBeat(g, personId, hasClip);
    const li = document.createElement('li');
    li.className = 'groove-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-beat groove';
    b.dataset.groove = g.id;
    const text = document.createElement('span');
    text.className = 'lib-text';
    const name = document.createElement('span');
    name.className = 'lib-name';
    name.textContent = `${g.emoji} ${g.name}`;
    // Under the name, where it comes from and what to listen for; the
    // sounds, bars and tempo only with Advanced (Ben, 2026-10-17).
    const about = document.createElement('span');
    about.className = 'lib-info groove-about';
    about.textContent = g.about;
    text.append(name, about);
    // Who plays it, beyond the drums: a chip per instrument in its family's
    // color, as in the picker (ADR 0030).
    const players = groovePlayers(g, (kit) => deps.clipById(`${personId}-${kit}`) ?? null);
    if (players.length) {
      const who = document.createElement('span');
      who.className = 'groove-who';
      for (const i of players) {
        const chip = document.createElement('span');
        chip.className = 'groove-player';
        chip.dataset.inst = i.id;
        chip.dataset.family = i.family.id;
        chip.style.setProperty('--fam', i.family.color);
        chip.textContent = `${i.emoji} ${i.name}`;
        who.append(chip);
      }
      text.append(who);
    }
    if (advanced) {
      const info = document.createElement('span');
      info.className = 'lib-info groove-parts';
      info.textContent = grooveInfo(g, beat);
      text.append(info);
    }
    b.append(thumbnail(beat), text);
    // ▶ beside the card plays a short sample without opening it (Ben, 2026-10-12).
    const hear = document.createElement('button');
    hear.type = 'button';
    hear.className = 'chip-dark groove-hear';
    hear.dataset.hear = g.id;
    showHearKey(hear);
    li.append(b, hear);
    return li;
  }
  // ── A groove's sample in the chooser: one pass, at most SAMPLE_SECONDS ──
  // Played as Song mode plays a beat (beatPlan, soundHit), so there is no
  // second player. One thing plays at a time: the beat stops (a groove tried
  // in the keys view stays on screen) and a song stops. ■, another ▶, picking
  // a groove or closing the dialog ends it.
  // 🎧 From a song's ▶ on each part plays a beat of its own the same way
  // (hearBeat): one thing at a time, and its `onEnd` hears when it stops.
  let sample = null;   // {id, run (the engine's, on a planned list), timer, onEnd, pattern (the beat heard)}
  function showHearKey(b) {
    const g = GROOVES.find((x) => x.id === b.dataset.hear);
    const on = sample?.id === b.dataset.hear;
    b.textContent = on ? '■' : '▶';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? `Stop the ${g?.name ?? ''} sample` : `Hear a bit of ${g?.name ?? 'this groove'}`);
  }
  const showHearKeys = () => { for (const b of el.grooveList.querySelectorAll('[data-hear]')) showHearKey(b); };
  function stopSample() {
    if (!sample) return;
    clearTimeout(sample.timer);
    sample.run?.stop();   // its voices fade
    const { onEnd, pattern: heard } = sample;
    if (heard) letGo((m) => m.p === heard);
    sample = null;
    showHearKeys();
    onEnd?.();
  }
  // Plays one pass of a beat (`raw`, as stored), at most `seconds` of it,
  // as `id`; the same id again stops it.
  async function hearBeat(id, raw, { seconds: most = SAMPLE_SECONDS, onEnd } = {}) {
    const again = sample?.id === id;
    stopSample();
    if (again) return;   // ■: the same ▶ again stops it
    stop();              // the beat, or a ▶ still loading its sounds
    deps.onPlay?.();     // a song playing stops
    const mine = { id, run: null, timer: 0, onEnd };
    sample = mine;
    showHearKeys();
    const plan = beatPlan(raw);
    mine.pattern = plan.pattern;
    await prepareBeats([plan.pattern]);
    if (sample !== mine) return;   // stopped while its sounds loaded
    const ctx = audio.wake();
    const t0 = ctx.currentTime + 0.05;
    const seconds = Math.min(plan.seconds, most);
    // The whole pass is booked on the first tick, as one list.
    const events = plan.hits.filter((h) => h.time < seconds)
      .map((h) => ({ at: t0 + h.time, pattern: plan.pattern, row: h.row, loud: h.loud, note: h.note, len: h.len, dest: audio.master, key: h.row }));
    mine.run = engine.play({ list: { events }, lookahead: seconds + 1, onStop: () => { if (sample === mine) stopSample(); } });
    mine.run.tick();
    logEvent('beat', { action: 'sample', bpm: plan.pattern.bpm, bars: plan.pattern.bars, seconds: Math.round(seconds * 10) / 10 });
    mine.timer = setTimeout(() => { if (sample === mine) stopSample(); }, (seconds + 0.4) * 1000);
  }
  const playSample = (g) => hearBeat(g.id, grooveBeat(g, personId, hasClip));
  function showFold(sec, open) {
    sec.head.setAttribute('aria-expanded', String(open));
    sec.head.querySelector('.emoji-all-caret').textContent = open ? '▾' : '▸';
    sec.box.classList.toggle('open', open);
    sec.list.hidden = !open;
  }
  function renderGrooves() {
    el.grooveList.replaceChildren(...GROOVE_GROUPS.map((group) => {
      const grooves = GROOVES.filter((g) => g.group === group.id);
      const box = document.createElement('section');
      box.className = 'emoji-all-sec groove-sec';
      const h = document.createElement('h3');
      h.className = 'emoji-all-h';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'emoji-all-group';
      head.dataset.grooveGroup = group.id;
      const list = document.createElement('ul');
      list.className = 'lib-list';
      list.id = `groove-group-${group.id}`;
      head.setAttribute('aria-controls', list.id);
      const caret = document.createElement('span');
      caret.className = 'emoji-all-caret';
      caret.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'emoji-all-name';
      label.textContent = `${group.emoji} ${group.name}`;
      const count = document.createElement('span');
      count.className = 'emoji-all-count';
      count.textContent = String(grooves.length);
      count.setAttribute('aria-label', `${grooves.length} grooves`);
      head.append(caret, label, count);
      h.append(head);
      list.append(...grooves.map(grooveCard));
      box.append(h, list);
      showFold({ box, head, list }, grooveFolds.has(group.id));
      return box;
    }));
  }
  // `from`: the button that opened it, which gets the focus back.
  function openGrooves(from) {
    el.grooveNote.textContent = '';
    showGrooveHow();
    renderGrooves();
    deps.onGroovesOpen?.();   // 🎧 From a song's card shows for this person's level
    openDialog(el.grooves, from ? { returnTo: () => from } : undefined);
  }

  // A groove loads into the scratch (ADR 0020), so nothing in 🗂️ Beats is
  // copied or overwritten, and the scratch opens; or, with ➕, its hits join
  // the open beat. Undo puts back the beat that was open and the scratch as
  // it was.
  let grooveAdds = false;   // the dialog's choice: into the scratch (off) or add to this one
  // In the keys a groove always loads into the scratch.
  const adding = () => grooveAdds && !!pattern && slot !== 'dj';
  function showGrooveHow() {
    // In the keys a groove plays behind you: there is nothing to choose.
    el.grooveHow.hidden = slot === 'dj';
    for (const b of el.grooveHow.querySelectorAll('[data-how]')) {
      b.setAttribute('aria-pressed', String((b.dataset.how === 'add') === adding()));
      if (b.dataset.how === 'add') b.disabled = !pattern;
    }
    const kept = onScratch() ? '' : ' Yours stays in 🗂️ Beats.';
    el.grooveHint.textContent = slot === 'dj'
      ? `Tap one to load it into your scratch beat and play along: ▶ Play plays it behind you, ● Record adds your hits, and 💾 Keep saves it.${kept}`
      : adding()
      ? 'Adds the groove’s hits to the beat on screen. Nothing is turned off, and Undo takes them back out.'
      : `Loads the groove into your scratch beat to play with. 💾 Keep saves it in 🗂️ Beats.${kept}`;
  }
  el.grooveHow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-how]');
    if (!b) return;
    grooveAdds = b.dataset.how === 'add';
    showGrooveHow();
  });
  function pickGroove(button) {
    const g = GROOVES.find((x) => x.id === button.dataset.groove);
    if (!g) return;
    if (adding()) {
      const before = snapshot();
      const { rows, added } = mergeGroove(pattern.rows, grooveBeat(g, personId, hasClip).rows, bar(), pattern.bars, grooveShape(g));
      el.grooves.close();
      const had = pattern.rows.length;
      pattern.rows = rows;
      if (playing()) for (const r of rows.slice(had)) prepare(deps.clipById(r.clipId));   // new rows join from their next pill
      save();
      render();
      deps.onBeatChange?.();
      offerUndo({ before, pattern, groove: g.name, added });
      undoBanner?.focus();
      return;
    }
    el.grooves.close();
    loadGroove(g);
    if (slot !== 'dj') undoBanner?.focus();
  }

  // The groove into the scratch, which opens. With ⌨️ Keys on it opens
  // stopped ("opening a groove in the beat builder should open stopped"),
  // and ▶ Play plays it behind the keys; on Beats a beat playing carries on.
  // A scratch with hits is replaced, so the line says so, with Undo (Keys
  // off) or ↩️ Beat (Keys on).
  function loadGroove(g) {
    const old = scratchSaved();
    const was = {
      before: structuredClone(pattern),
      scratchBefore: old ? structuredClone(old) : null,
      groove: g.name,
      replaced: hasHits(old),
    };
    const resume = slot !== 'dj' && playing();
    queued = null;
    stop();
    pattern = { ...grooveBeat(g, personId, hasClip), id: old?.id ?? scratchId(personId), name: g.name };
    save();
    loaded = was;
    render();
    deps.onBeatChange?.();
    if (resume) play();
    logEvent('beat', { action: 'groove', replaced: was.replaced });
    if (slot !== 'dj') offerUndo({ ...was, pattern });
  }
  // Undo of a groove loaded: the scratch as it was, and the beat that was
  // open before (the scratch, or a beat in 🗂️ Beats).
  function undoLoad(was) {
    loaded = null;
    if (was.scratchBefore) deps.library.put(was.scratchBefore);
    else if (scratchSaved()) deps.library.remove(scratchSaved().id);
    const back = was.before && !isScratch(was.before) && library().find((b) => b.id === was.before.id);
    openBeat(back ? cleanPattern(back, personId) : null, { resume: slot !== 'dj' });
  }

  el.grooveList.addEventListener('click', (e) => {
    const head = e.target.closest('[data-groove-group]');
    if (head) {
      const id = head.dataset.grooveGroup;
      const open = !grooveFolds.has(id);
      if (open) grooveFolds.add(id); else grooveFolds.delete(id);
      showFold({ box: head.closest('section'), head, list: el.grooveList.querySelector(`#groove-group-${id}`) }, open);
      return;
    }
    const hear = e.target.closest('[data-hear]');
    if (hear) { const g = GROOVES.find((x) => x.id === hear.dataset.hear); if (g) playSample(g); return; }
    const b = e.target.closest('[data-groove]');
    if (b) { stopSample(); pickGroove(b); }
  });

  // ── The keys: a groove just loaded (Ben, 2026-10-12; ADR 0020) ──
  // The keys view shows a line while the scratch holds a groove just loaded
  // and nothing has changed it yet: `trying()`. ↩️ Beat there is the
  // groove's Undo (putTrialAway). Recording onto it or changing it ends the
  // line; the groove stays in the scratch.
  const trying = () => (loaded && onScratch() ? { groove: loaded.groove, replaced: loaded.replaced } : null);
  function putTrialAway() {
    if (!loaded) return;
    stop();
    undoLoad(loaded);
  }
  // 💃 Grooves sits in the beat bar on both screens (Ben, 2026-10-12).
  for (const bar of el.beatBars ?? []) {
    const b = bar.querySelector('[data-beat-grooves]');
    b?.addEventListener('click', () => openGrooves(b));
  }
  // ── 🗂️ Beats: every saved beat, to open, 📌 pin, duplicate or delete ──

  let deleteAsked = null;
  function openLibrary(from) {
    el.libNote.textContent = '';
    deleteAsked = null;
    audioSaver.reset();   // a file made for another beat, waiting to be sent, is forgotten
    renderLibrary();
    openDialog(el.library, { returnTo: () => from });
  }

  function renderLibrary() {
    const beats = library();
    el.libSound.disabled = !pattern;   // 🔊 makes the open beat a sound: with none open, nothing to make
    el.libAudio.disabled = !pattern;   // ⬇️ saves it as an audio file: likewise
    el.libEmpty.hidden = beats.length > 0;
    el.libList.replaceChildren(...beats.map((beat) => {
      const item = document.createElement('li');
      item.className = 'lib-beat';
      item.dataset.id = beat.id;
      const open = beat.id === pattern?.id;
      item.classList.toggle('current', open);

      // The whole card opens it.
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'lib-open';
      openBtn.dataset.load = beat.id;
      const name = document.createElement('span');
      name.className = 'lib-name';
      name.textContent = beat.name;
      const info = document.createElement('span');
      info.className = 'lib-info';
      const bars = beat.bars || 1;
      info.textContent = open ? 'Open now' : `${beat.rows.length} ${beat.rows.length === 1 ? 'sound' : 'sounds'} · ${beat.bpm} BPM${bars > 1 ? ` · ${bars} bars` : ''}`;
      const text = document.createElement('span');
      text.className = 'lib-text';
      text.append(name, info);
      openBtn.append(thumbnail(beat), text);
      openBtn.setAttribute('aria-label', open ? `${beat.name}, open now` : `Open ${beat.name}`);

      // 📌 pins the beat to the pattern chips (up to MAX_PINS), and unpins it.
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'chip-dark lib-pin';
      pin.dataset.pin = beat.id;
      pin.textContent = '📌';
      pin.setAttribute('aria-pressed', String(isPinned(beat)));
      pin.setAttribute('aria-label', isPinned(beat) ? `Unpin ${beat.name} from the chips` : `Pin ${beat.name} to the chips`);
      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'chip-dark';
      dup.dataset.dup = beat.id;
      dup.textContent = '⧉';
      dup.setAttribute('aria-label', `Duplicate ${beat.name}`);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip-dark';
      del.dataset.delete = beat.id;
      const asking = deleteAsked === beat.id;
      del.textContent = asking ? 'Delete?' : '🗑️';
      del.classList.toggle('armed', asking);
      del.setAttribute('aria-label', asking ? `Tap again to delete ${beat.name}` : `Delete ${beat.name}`);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'chip-dark';
      save.dataset.export = beat.id;
      save.textContent = '📄';
      save.setAttribute('aria-label', `Save ${beat.name} as a beat file`);

      item.append(openBtn, pin, dup, save, del);
      return item;
    }));
  }

  // A beat's rows as lines of 16 dots in each sound's color, so a saved beat
  // can be recognised at a glance.
  function thumbnail(beat) {
    const t = document.createElement('div');
    t.className = 'lib-thumb';
    t.setAttribute('aria-hidden', 'true');
    for (const row of beat.rows.slice(0, 4)) {
      const line = document.createElement('div');
      const clip = deps.clipById(row.clipId);
      if (clip) line.style.setProperty('--pill', deps.colorOf(clip));
      line.style.setProperty('--vol', String(row.muted ? 0 : rowLevel(row)));   // a quieter row draws fainter
      for (const on of row.steps.slice(0, 16)) {
        const dot = document.createElement('span');
        if (on) dot.className = 'on';
        line.append(dot);
      }
      t.append(line);
    }
    return t;
  }

  el.library.addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]');
    if (load) {
      const beat = library().find((b) => b.id === load.dataset.load);
      if (beat && beat.id !== pattern?.id) openBeat(cleanPattern(beat, personId));
      el.library.close();
      return;
    }
    const exp = e.target.closest('[data-export]');
    if (exp) {
      const beat = library().find((b) => b.id === exp.dataset.export);
      if (!beat) return;
      const { file, dropped } = beatToFile(cleanPattern(beat, beat.personId), deps.kitIds());
      const safe = (beat.name || 'beat').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'beat';
      downloadBlob(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), `${safe}.beat.json`);
      el.libNote.textContent = dropped
        ? `Saved “${beat.name}” as a file. ${dropped} recorded ${dropped === 1 ? 'sound stays' : 'sounds stay'} behind: only presets go in a beat file.`
        : `Saved “${beat.name}” as a file.`;
      return;
    }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      togglePin(pin.dataset.pin);
      return;
    }
    const dup = e.target.closest('[data-dup]');
    if (dup) {
      const beat = library().find((b) => b.id === dup.dataset.dup);
      if (!beat) return;
      const copy = { ...structuredClone(beat), id: newId('beat'), name: uniqueName(beat.name), created: Date.now(), saved: Date.now() };
      delete copy.pinned;   // a copy is a new beat: not pinned
      deps.library.put(copy);
      el.libNote.textContent = `Made a copy: “${copy.name}”.`;
      renderLibrary();
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      // Tap once to ask, again to delete, as with deleting a sound.
      if (deleteAsked !== del.dataset.delete) { deleteAsked = del.dataset.delete; renderLibrary(); return; }
      deleteAsked = null;
      const beat = library().find((b) => b.id === del.dataset.delete);
      deps.library.remove(del.dataset.delete);
      el.libNote.textContent = beat ? `Deleted “${beat.name}”.` : '';
      // Deleting the open beat opens the scratch.
      if (beat) closeEverywhere(beat.id);
      renderLibrary();
      (el.libList.querySelector('[data-load]') || el.libSound).focus();
    }
  });

  // 📌 in 🗂️ Beats: pins a beat to the chips' first spots, in the order pinned,
  // or unpins it. Pinning is not using it: its `saved` stamp stays. With
  // MAX_PINS pinned, another waits until one is unpinned.
  function togglePin(id) {
    const beat = library().find((b) => b.id === id);
    if (!beat) return;
    const record = structuredClone(beat);
    if (isPinned(beat)) {
      delete record.pinned;
      el.libNote.textContent = `Unpinned “${beat.name}”.`;
    } else if (library().filter(isPinned).length >= MAX_PINS) {
      el.libNote.textContent = `${MAX_PINS} beats are pinned already: unpin one first.`;
      return;
    } else {
      record.pinned = Date.now();
      el.libNote.textContent = `Pinned “${beat.name}” to the chips.`;
    }
    deps.library.put(record);
    renderLibrary();
    showChips();
    el.libList.querySelector(`[data-pin="${CSS.escape(id)}"]`)?.focus();
  }

  // 📥 Load a beat file: it joins the list under a name no other beat has,
  // and opens on this screen.
  el.libFile?.addEventListener('change', async () => {
    const f = el.libFile.files?.[0];
    el.libFile.value = '';
    if (!f) return;
    try {
      if (f.size > MAX_BEAT_FILE_BYTES) throw new Error('That file is too big to be a beat.');
      const beat = beatFromFile(await f.text(), personId, deps.kitIds(), unsignedSignature(personId));
      const now = Date.now();
      Object.assign(beat, { id: newId('beat'), name: uniqueName(beat.name || freshName()), created: now, saved: now });
      openBeat(beat);
      el.library.close();
      deps.announce?.(`Loaded “${beat.name}”.`);
    } catch (err) {
      el.libNote.textContent = err.message;
    }
  });

  // ── Save as a sound: render the beat to audio and add it as a pad ──

  // Plays the pattern into an OfflineAudioContext exactly as play() would:
  // the same hits (planHits), each row's tempo, fades and Let it ring, once
  // through the whole beat, every bar.
  // `passes` plays it round that many times, and `ring` seconds more are
  // rendered past the end so the last hits ring out (⬇️ Save as audio file).
  async function bounce({ passes = 1, ring = 0 } = {}) {
    await Promise.all(pattern.rows.map((r) => prepare(deps.clipById(r.clipId))));
    const rate = audio.context().sampleRate;
    const seconds = total() * baseStep();
    const ctx = new OfflineAudioContext(2, Math.ceil((seconds * passes + ring) * rate), rate);
    const lists = pattern.rows.map(() => []);
    let hits = 0;
    const plan = planHits(pattern, playMode(), seconds, bar(), swingNow(), groups());
    for (let pass = 0; pass < passes; pass++) {
      for (const { row: i, time, loud, note, len } of plan) {
        const loaded = engine.get(pattern.rows[i].clipId);
        if (!loaded) continue;
        sound(ctx, busFor(ctx, ctx.destination, pattern).input(i), lists[i], pattern.rows[i], loaded, time + pass * seconds, loud, note, len);
        hits++;
      }
    }
    if (!hits) return null;
    return normalize(await ctx.startRendering());
  }

  // ⬇️ Save as audio file: the beat round at least 15 s in whole passes, its
  // last hits ringing out up to 2 s, as a WAV that download.js hands on.
  async function makeAudioFile() {
    if (!pattern) return null;
    const rate = audio.context().sampleRate;
    const pass = total() * baseStep();
    const passes = audioPasses(pass);
    const buffer = await bounce({ passes, ring: AUDIO_RING_SECONDS });
    if (!buffer) { el.libNote.textContent = 'Turn on some pills first, then save it as an audio file.'; return null; }
    const frames = audioFileFrames(buffer, Math.ceil(pass * passes * rate), Math.ceil(AUDIO_RING_SECONDS * rate));
    // The name on screen; a scratch beat is named as 🔊 names it (its groove's, or a fun name).
    const name = audioFileName(onScratch() ? grooveOf(pattern)?.name || freshName() : pattern.name);
    return { blob: encodeWav(audioView(buffer, frames)), name, seconds: frames / rate };
  }

  async function saveAsSound() {
    if (!pattern) return;
    const beat = cutName(((onScratch() ? grooveOf(pattern)?.name : pattern.name) || freshName()), MAX_LABEL);
    // The new pad is a remix of the beat: "Wobbly Thunder (🌀 Wonky Remix)".
    const name = deps.remixName ? deps.remixName(beat) : beat;
    el.libSound.disabled = true;
    el.libNote.textContent = 'Making the sound…';
    try {
      const buffer = await bounce();
      if (!buffer) { el.libNote.textContent = 'Turn on some pills first, then save it as a sound.'; return; }
      await deps.addClip({ label: name, blob: encodeWav(buffer) });
      el.libNote.textContent = `Added “${name}” to the pads (${pattern.bars} ${pattern.bars === 1 ? 'bar' : 'bars'}, ${buffer.duration.toFixed(1)} s).`;
    } catch (err) {
      console.error('Making a sound from the beat failed:', err);
      el.libNote.textContent = `That didn't work (${err.message || err.name}). Try again.`;
    } finally {
      el.libSound.disabled = false;
    }
  }

  el.libSound.addEventListener('click', saveAsSound);

  // ⬇️ Save as audio file: the open beat as a WAV, to the share sheet or a download.
  const audioSaver = createAudioSaver({
    button: el.libAudio,
    make: makeAudioFile,
    say: (text) => { el.libNote.textContent = text; },
    done: (how) => logEvent('beat', { action: 'audio', how }),
  });

  // Bars: how long the whole beat is before it starts over. Rows keep pills
  // they had in bars that are no longer shown, so going back loses nothing.
  function setBars(bars) {
    if (!pattern || !BAR_CHOICES.includes(bars)) return;
    pattern.bars = bars;
    save();
    render();
  }
  el.bars.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bars]');
    if (!b) return;
    setBars(Number(b.dataset.bars));
    el.bars.querySelector(`[data-bars="${pattern.bars}"]`)?.focus();
  });
  // The time signature is the beat's own. Pills keep their places, so a
  // beat changed to 3/4 and back to 4/4 is as it was.
  function setSignature(sig) {
    if (!pattern || !Object.hasOwn(SIGNATURES, sig)) return;
    pattern.signature = sig;
    save();
    render();
  }
  el.sigs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sig]');
    if (!b) return;
    setSignature(b.dataset.sig);
    el.sigs.querySelector(`[data-sig="${CSS.escape(pattern.signature)}"]`)?.focus();
  });

  setupDialog(el.chooser);
  setupDialog(el.library);
  setupDialog(el.grooves);
  el.grooves.addEventListener('close', stopSample);

  // ── Recording into the beat, for the keys ──

  // Where the beat is, for snapping hits: pill 0's time, a pill's length,
  // the pills in the whole beat, and each row's speed.
  function beatClock() {
    return { t0: run?.t0 ?? 0, step: baseStep(), total: total(), rates: (pattern?.rows ?? []).map((r) => (playMode() === 'speed' ? r.rate : 1)) };
  }
  // The row for a sound: its first unmuted row, else a muted one (unmuted:
  // the kid is playing it), else a row with no hits, else a new row; -1 when
  // there is neither. It is only asked while recording, when a row with no
  // hits makes way for the new sound (Ben, 2026-10-18), unless it is in
  // `avoid` (rows taken or hit in this recording). It is reused in place, so
  // no row moves.
  function rowFor(clipId, avoid = new Set()) {
    let i = pattern.rows.findIndex((r) => r.clipId === clipId && !r.muted);
    if (i < 0) {
      i = pattern.rows.findIndex((r) => r.clipId === clipId);
      if (i >= 0) pattern.rows[i].muted = false;
    }
    if (i < 0) {
      i = rowSlot(pattern.rows, MAX_ROWS, avoid, true);
      if (i < 0) return -1;
      pattern.rows[i] = cleanRow({ clipId, steps: [] });
      if (playing()) prepare(deps.clipById(clipId));
    }
    return i;
  }
  // The keys view: the row for this sound, made now (empty) if it has none, and
  // saved (Ben, 2026-10-12: pressing an instrument makes its row appear). A
  // full beat, or any beat while `recording`, reuses an empty row not in
  // `avoid`; -1 when there is none.
  function addRowFor(clipId, avoid = new Set(), recording = false) {
    if (!pattern) return -1;
    let i = pattern.rows.findIndex((r) => r.clipId === clipId);
    if (i >= 0) return i;
    i = rowSlot(pattern.rows, MAX_ROWS, avoid, recording);
    if (i < 0) return -1;
    pattern.rows[i] = cleanRow({ clipId, steps: [] });
    if (playing()) prepare(deps.clipById(clipId));
    save();
    render();
    return i;
  }
  // Turns snapped pills on (never off), saves, redraws. A pill still to come
  // in this pass was just heard live, so the beat skips it once. `draw:
  // false` leaves Beats' rows as they are: the keys draw their own pill, and
  // the rows, hidden under the keys, are drawn again when they show (show()).
  function addSnaps(snaps, { skipAfter = Infinity, draw = true } = {}) {
    let lit = 0;   // pills that were off: what the kid added
    for (const { row, step, n } of snaps) {
      const r = pattern.rows[row];
      if (!r) continue;
      if (!r.steps[step]) lit++;
      r.steps[step] = true;
      // Into a tune row, a key plays its sound's own note: a note a pill long.
      if (r.melody && !r.tune.some((o) => Math.floor(o.s) === step)) pattern.rows[row] = cleanRow({ ...r, tune: addNote(r.tune, 0, step, 1)?.tune ?? r.tune });
      const at = (run?.t0 ?? 0) + n * stepSeconds(pattern, r, playMode());
      if (playing() && at > skipAfter) skips.push({ row, at });
    }
    save();
    if (draw) render();
    return lit;
  }
  const snapshot = () => structuredClone(pattern);

  // A pick slid along its rows (pill-select.js): putRows writes slid rows into the open beat's own row objects, so a
  // playing beat plays them from its next pill; a tune row's pills follow
  // its notes again (cleanRow).
  function putRows(rows) {
    rows.forEach((r, i) => {
      const row = pattern?.rows[i];
      if (row && r !== row) Object.assign(row, r.melody ? cleanRow(r) : r);
    });
    render();
  }
  // While a drag slides pills (pill-select.js): the rows go into the
  // open beat as putRows does (a playing beat follows), but only the pills
  // that changed are repainted, never the whole page, so the pills keep up
  // with the pointer (Ben, 2026-10-19: "the pill drag lags"). A tune row or
  // a slim row needs the full draw. `draw: false` writes the beat alone (the
  // keys' grid paints its own pills); the drop's putRows draws everything.
  function paintRows(rows, { draw = true } = {}) {
    let full = false;
    rows.forEach((r, i) => {
      const row = pattern?.rows[i];
      if (!row || r === row) return;
      if (r.melody) {
        // A drag works on a copy of the rows: a tune row it left alone has the same notes.
        if (JSON.stringify(r.tune ?? []) === JSON.stringify(row.tune ?? [])) return;
        Object.assign(row, cleanRow(r));
        full = true;
        return;
      }
      const steps = row.steps, accents = row.accents ?? [];
      Object.assign(row, r);
      if (!draw) return;
      if (!pills[i]?.length) { full = true; return; }
      pills[i].forEach((p, s) => {
        if (!!steps[s] !== !!row.steps[s] || !!accents[s] !== !!row.accents?.[s]) showPill(p, row, s);
      });
    });
    if (!draw) return;
    if (full) { render(); return; }
    select?.decorate();
  }
  // A mouse picks lit pills and drags them along (pill-select.js), and a
  // finger too while ⇆ locks them.
  select = createPillSelect({
    root: el.rows,
    pillOf: (node) => {
      const p = node?.closest?.('.pill');
      const row = p?.closest('.seq-row');
      return p && row && !p.hidden ? { r: Number(row.dataset.row), s: Number(p.dataset.step) } : null;
    },
    pillEl: (r, s) => pills[r]?.[s] ?? null,
    beat: () => pattern, total: () => countOf(), putRows, paint: paintRows, save, snapshot,
    light: (r, s) => { tapPill(pattern.rows[r], s); save(); render(); },
    enabled: () => true, locked: () => locked, changed: () => showLock(),
    undoable: (copy, text) => offerUndo({ copy, text, pattern }),
  });
  pickers.push({ pick: select, shown: () => !el.rows.closest?.('[hidden]') });

  // ⇆ locks the pills (Ben, 2026-10-19: "all it should really change is the
  // ability to turn pills on/off, in order to enable large scale edits"):
  // the view stays as it is, Beats' rows or the keys' grid, and nothing
  // lights or unlights there; taps and drags pick and slide (pill-select.js).
  // Its bar at the foot says what is picked, with All · None · Invert.
  const lockBar = el.moveBar;
  const shownPicker = () => pickers.find((p) => p.shown())?.pick ?? select;
  function showLock() {
    for (const b of document.querySelectorAll('[data-move-open]')) b.setAttribute('aria-pressed', String(locked));
    document.body.classList.toggle('pills-locked', locked);
    if (!lockBar) return;
    lockBar.hidden = !locked;
    if (!locked) return;
    const n = shownPicker().picked().size;
    lockBar.querySelector('[data-move-what]').textContent = n ? `${n} ${n === 1 ? 'pill' : 'pills'} picked` : 'Nothing picked';
    lockBar.querySelector('[data-move-hint]').textContent = n ? 'Drag one to slide them along' : 'Tap lit pills, or drag across them, to pick';
    lockBar.querySelector('[data-move-pick="none"]').disabled = !n;
  }
  function setLock(on) {
    if (on === locked) return;
    locked = on;
    if (!on) for (const p of pickers) p.pick.clear();
    showLock();
  }
  lockBar?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-move-pick]');
    if (!b) return;
    const p = shownPicker();
    if (b.dataset.movePick === 'all') p.all(); else if (b.dataset.movePick === 'none') p.clear(); else p.invert();
  });
  function restore(copy) {
    const was = playing();
    stop();
    pattern = cleanPattern(copy, copy.personId);
    save();
    render();
    if (was) play();
  }
  // The click: the Beats screen's ⏲️ keeps it on while the beat plays. While
  // The keys records, its own ⏲️ Click track alone decides (setClick(on));
  // setClick(null) hands it back. Nothing turns it on by itself (Ben,
  // 2026-10-11: it played with the toggle off).
  let clickWanted = recall('beat-click') === '1';
  let clickOverride = null;
  const setClick = (on) => { clickOverride = on; clickOn = on ?? clickWanted; };
  function showClick() {
    if (!el.click) return;
    el.click.setAttribute('aria-pressed', String(clickWanted));
  }
  el.click?.addEventListener('click', () => {
    clickWanted = !clickWanted;
    remember('beat-click', clickWanted ? '1' : '');
    if (clickOverride === null) clickOn = clickWanted;
    showClick();
  });
  // ⏹️ Stop all turns the click off too, remembered as off.
  function clickOff() {
    clickWanted = false;
    remember('beat-click', '');
    if (clickOverride === null) clickOn = false;
    showClick();
  }
  // A pill tapped (or held, `loud`) elsewhere: the keys' grid.
  // A tune row's pill opens 🎹 the roll instead.
  function cyclePill(r, s, loud = false) {
    const row = pattern?.rows[r];
    if (!row) return;
    if (row.melody) { openRoll(r, s); return; }
    if (loud) holdPill(row, s); else tapPill(row, s);
    save();
    render();
  }
  const beat = () => pattern;

  // ── For Song mode: any saved beat, planned and sounded as play() would ──

  // Pills in one bar of a saved beat: its own time signature, as sigOf()
  // reads the open beat's.
  const sigFor = (raw) => (Object.hasOwn(SIGNATURES, raw?.signature) ? raw.signature : '4/4');
  const barOf = (raw) => barSteps(sigFor(raw));
  // A saved beat once through: its length in seconds (its own tempo, bars and
  // bar length) and every hit in it, as bounce() renders them.
  function beatPlan(raw) {
    const p = cleanPattern(raw, raw.personId);
    const steps = barOf(raw);
    const seconds = steps * p.bars * (60 / p.bpm / STEPS_PER_BEAT);
    const hits = planHits(p, playMode(), seconds, steps, p.swing || 0, SIGNATURES[sigFor(raw)]);
    return { pattern: p, seconds, hits };
  }
  // 🎼 Song is done with these graphs: those into its lanes' gains `dests`
  // (only beat `p`'s, when given). They go once they ring out.
  const endMix = (dests, p) => letGo((m) => dests.includes(m.dest) && (!p || m.p === p));
  return { setPerson, show, tempo: () => shape().bpm, render, play, stop, playing, grid, beatClock, rowFor, addRowFor, addSnaps, snapshot, restore, setClick, beat,
    cyclePill, clearRow, dropRow, toggleRing, ringTool, openLibrary, metronome, clickAt, setGrow, setTempo, setBars, setSignature, signature: () => sigOf(), advanced: () => advanced,
    beatPlan, prepareBeats, soundHit, endMix, thumbnail, levelOf, setLevel, putLevel, toggleMute, levelState,
    trying, putTrialAway, keep, onScratch, sampling: () => sample?.id ?? null, hearBeat, stopHearing: stopSample,
    // A beat in 🗂️ Beats opened by id (🎧 From a song's 🥁 Open part A); false when it is not there.
    openSaved: (id) => { const saved = library().find((b) => b.id === id); if (saved) openBeat(cleanPattern(saved, personId), { resume: false }); return !!saved; },
    lockChips, queuedBeat: () => (queued ? { ...queued } : null), openMixer, toggleSolo, setFx: setRowFx, setMaster, setMasterFx,
    openRoll, rollRow: () => roll?.row() ?? -1, clickOff,
    // ⇆ the lock, and the keys' grid's picker beside these rows' (dj.js).
    toggleLock: () => setLock(!locked), endLock: () => setLock(false), locked: () => locked, lockChanged: () => showLock(),
    addPicker: (pick, shown) => pickers.push({ pick, shown }),
    // For the keys' grid's mouse pick (pill-select.js in dj.js).
    putRows, paintRows, saveBeat: () => save(),
    // The sounds it holds decoded, by clip id (read only, for the tests).
    held: () => engine.held() };
}
