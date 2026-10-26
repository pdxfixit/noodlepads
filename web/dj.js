// The keys (docs/design/dj-mode.md): 40 sound keys laid out like the number
// row and the letter rows of a keyboard, each a tile like an element in the periodic table: the
// key's letter, the sound's emoji and name, colored by family. On a laptop
// the real keys play them; on a phone they are big pads, one row at a time.
// The rules (default keys, labels, snapping) are in rhythm.js.
//
// Two ways to play them, picked on the device with ⌨️ / 👆 (ADR 0029): the
// keys, or a touch layout of bands of big tiles (dj-touch.js, touch.js).
// Both play through the same path (hit), so takes, rows and loops agree.
//
// One panel, two places (ADR 0017): 🎤 Live (mode 'free': takes and the
// click track) and 🥁 Beats with ⌨️ Keys on (mode 'beat': the open beat
// above the keys, ● Record into it). app.js picks the mode with setMode.

import { countAt, KEY_ROWS, KEY_CODES, keyboardOrder, defaultDeck, fallbackLabel, layoutLabel, detectLayout, LAYOUTS, LAYOUT_NAMES, keyFor, takeFrom, planTake, clockText, MAX_TAKE_SECONDS, createSnapper, tapTempo, TAP_GAP_MAX } from './rhythm.js';
import { encodeWav, SIGNATURES, COMMON_BPMS, tempoStops, stopFor, pillHolds, typedBpm } from './sequencer.js';
import { recall, remember, newId } from './util.js';
import { PICTURES, pictureTakenBy } from './model.js';
import { emojiMore, withCurrent } from './emoji-more.js';
import { takeName, soundName } from './names.js';
import { openDialog, setupDialog, openerOf } from './dialogs.js';
import { setSetting, onSetting, deviceChoice } from './settings.js';
import { createKeysEditor } from './dj-keys.js';
import { fadeAway, showBanner } from './ui.js';
import { drawSpeaker, speakerControls, percent } from './row-volume.js';
import { rowParts, rowSpeaker, rowEmoji, twinRows } from './beat-row.js';
import { logEvent } from './log.js';
import { countPlay } from './play-count.js';
import { renderTake } from './share-render.js';
import { fingerTaps, isFinger } from './finger.js';
import { soundsOf, defaultTouch, touchOrder, touchSounds } from './touch.js';
import { drawBands, createTouchEditor } from './dj-touch.js';
import { createPillSelect } from './pill-select.js';
import { moreMenu } from './overflow.js';
import { follower, keepInView } from './follow.js';

const STOPS = tempoStops();   // the click track slider's positions (see sequencer.js)
const ARM_MS = 3000;           // how long "Make another?" waits for its second tap
const HOLD_TO_LOOP_MS = 350;   // as on the pads: hold this long and it keeps repeating

// One color per family, like the groups of the periodic table. Dark enough
// for white text (tests/contrast.test.mjs). A person's own sounds use their color.
export const FAMILY_COLORS = {
  drums: '#C2410C',
  notes: '#6D28D9', chords: '#6D28D9', bass: '#6D28D9',
  game: '#0F766E',
  effects: '#B91C1C',
  voices: '#3F6212',
  silly: '#BE185D',
  animals: '#854D0E',
  'sci-fi': '#1D4ED8',
};
const FAMILY_NAMES = { notes: 'tunes', chords: 'tunes', bass: 'tunes' };
// The rows' names for the phone's row tabs, top to bottom (rhythm.js KEY_ROWS).
const ROW_LABELS = ['Number row', 'Top letter row', 'Middle row', 'Bottom row'];
const HOME = 2;   // A S D F…: the drums by default

export function createDJ({ el, deps }) {
  let row = HOME;              // the row shown on phones: the home row (drums) first
  let keyboardSeen = false;    // a key was pressed this visit, so letters are worth showing
  // The keyboard's layout, for the letters on the tiles and which key a
  // press is: the one the kid picked on the Q / D keycaps (settings.js
  // djLayout, the device's own), else the one the browser says this is
  // (Chrome, Edge), else QWERTY.
  let detected = null;
  const layoutNow = () => deviceChoice('djLayout') ?? detected ?? 'qwerty';
  let layout = layoutNow();
  const holds = new Map();     // pointer id -> timer that turns the loop on
  // Keys held down: code -> {at, looped}. A key loops only when the OS's own
  // repeat presses prove it is still down past the hold time, so a lost
  // keyup (focus change, ⌘ held, a keyboard that drops keys) can never leave
  // a sound looping by itself.
  const held = new Map();

  // The person's keys before any was changed (rhythm.js defaultDeck), on
  // the groups' own sounds whatever instrument is picked (ADR 0030): only
  // the keys that differ from these are stored, so they must not move.
  function baseDeck() {
    const pid = deps.personId();
    const clips = deps.clipsFor(pid, { ownSounds: true });
    const own = clips.filter((c) => !c.kit);
    const kit = clips.filter((c) => c.kit).map((c) => ({ ...c, kitId: c.id.slice(pid.length + 1) }));
    return defaultDeck(own, kit);
  }
  // Each key's sound for the person on screen: their changed keys over the defaults.
  function deck() {
    const pid = deps.personId();
    const base = baseDeck();
    const changed = deps.savedDeck(pid)?.keys ?? {};
    const out = {};
    // The defaults are the board's own sounds, so only a changed key is looked
    // up (every board's sounds are gone through for each lookup, and a key
    // press asks for the deck more than once): a sound since deleted gives
    // the key back its default.
    for (const code of KEY_CODES) {
      const id = Object.hasOwn(changed, code) ? changed[code] : base[code];
      out[code] = id === base[code] || (id && deps.clipById(id)) ? id : (id === null ? null : base[code]);
    }
    return out;
  }

  const letterFor = (code) => layoutLabel(code, layout) || fallbackLabel(code);
  // A keyboard is likely when one was used this visit, or the device has a
  // mouse. Then the keys are laid out like a keyboard, with letters. On a
  // phone or tablet they are a plain grid of pads that fits the screen.
  const keyboardish = () => keyboardSeen || globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
  const showLetters = keyboardish;
  const SIZES = { s: 'Small', m: 'Medium', l: 'Large' };
  let size = Object.hasOwn(SIZES, recall('dj-size')) ? recall('dj-size') : 'm';

  // ⌨️ Keys or 👆 Pads, remembered on this device (Ben, 2026-10-16: "a
  // switch everywhere"), picked at the top of ✏️ Layout (2026-10-19).
  // Until the kid picks, 👆 on a phone-sized screen.
  const INPUTS = ['keys', 'touch'];
  let input = INPUTS.includes(recall('dj-input')) ? recall('dj-input') : null;
  let gridPick = null;         // the grid's mouse pick (pill-select.js), set once the grid listens
  const narrow = () => globalThis.matchMedia?.('(max-width: 699px)')?.matches === true;
  // A phone has no keyboard to play: always the pads there (Ben, 2026-10-19).
  const inputNow = () => (narrow() ? 'touch' : input ?? 'keys');
  const touching = () => inputNow() === 'touch';
  // The person's touch layout: the one they made, else the default (🎸 Band
  // under their newest sounds), worked out afresh so new sounds show. The
  // default plays the groups' own sounds, as the default keys do; the
  // sounds to edit with are the picked instrument's (ADR 0030).
  const soundsNow = () => soundsOf(deps.clipsFor(deps.personId()), deps.personId());
  const touchNow = () => deps.savedDeck(deps.personId())?.touch
    ?? defaultTouch(soundsOf(deps.clipsFor(deps.personId(), { ownSounds: true }), deps.personId()));

  function family(clip) {
    if (!clip.kit) return { name: 'mine', color: deps.personColor() };
    return { name: FAMILY_NAMES[clip.group] || clip.group || 'presets', color: FAMILY_COLORS[clip.group] || '#333040' };
  }

  function render() {
    const keys = deck();
    const letters = showLetters();
    const pads = !keyboardish();
    const touch = touching();
    el.keys.classList.toggle('pads-mode', pads);
    el.keys.dataset.size = size;
    el.tabs.hidden = pads || touch;
    el.size.hidden = !pads || touch;
    el.keys.hidden = touch;
    el.touch.hidden = !touch;
    // ✏️ Layout's ⌨️ Keys | 👆 Pads, in both its views; none on a phone, which has only pads.
    for (const sw of el.inputs) {
      sw.hidden = narrow();
      for (const b of sw.querySelectorAll('[data-input]')) b.setAttribute('aria-pressed', String(b.dataset.input === inputNow()));
    }
    // Q / D hang under ⌨️ while the keys show their letters.
    el.layout.hidden = touch || !letters;
    showLayout();
    if (touch) drawBands(el.touch, touchNow(), { clipById: deps.clipById, family, kitGroups: () => deps.kitGroups?.() ?? [], isLooping: deps.isLooping });
    for (const b of el.size.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(b.dataset.size === size));
    el.keys.replaceChildren(...KEY_ROWS.map((codes, r) => {
      const line = document.createElement('div');
      line.className = 'dj-row';
      line.dataset.row = r;
      line.classList.toggle('shown', r === row);
      line.append(...codes.map((code) => {
        const clip = keys[code] ? deps.clipById(keys[code]) : null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dj-key';
        b.dataset.code = code;
        const sym = document.createElement('span');
        sym.className = 'dj-sym';
        sym.textContent = letterFor(code);
        sym.hidden = !letters;
        const emoji = document.createElement('span');
        emoji.className = 'dj-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'dj-name';
        const fam = document.createElement('span');
        fam.className = 'dj-fam';
        if (clip) {
          const f = family(clip);
          b.style.setProperty('--c', f.color);
          emoji.textContent = clip.emoji || '🔊';
          name.textContent = clip.label;
          fam.textContent = f.name;
        } else {
          b.classList.add('empty');
          name.textContent = 'No sound';
        }
        b.setAttribute('aria-label', `${letterFor(code)}: ${clip ? clip.label : 'no sound'}`);
        if (clip && deps.isLooping?.(clip.id)) b.classList.add('looping');
        b.append(sym, emoji, name, fam);
        return b;
      }));
      return line;
    }));
    renderGrid?.();
    // The legend: each family on the keys (or the tiles), once, in its color.
    const families = new Map();
    for (const id of touch ? touchSounds(touchNow()) : Object.values(keys)) {
      const clip = id && deps.clipById(id);
      if (clip) { const f = family(clip); if (!families.has(f.name)) families.set(f.name, f.color); }
    }
    el.legend.replaceChildren(...[...families].map(([name, color]) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', color);
      li.textContent = name;
      return li;
    }));
    for (const t of el.tabs.querySelectorAll('[data-row]')) {
      const r = Number(t.dataset.row);
      t.setAttribute('aria-pressed', String(r === row));
      // Each tab shows the first three sounds of its row.
      t.textContent = KEY_ROWS[r].slice(0, 3).map((c) => deps.clipById(keys[c])?.emoji || '·').join('');
      t.setAttribute('aria-label', ROW_LABELS[r]);
    }
  }

  // Where the browser can say which keyboard this is (Chrome, Edge), it
  // decides until the kid picks one.
  async function readLayout() {
    try {
      detected = detectLayout(await globalThis.navigator?.keyboard?.getLayoutMap?.());
    } catch { /* no layout map: QWERTY until one is picked */ }
    if (layoutNow() === layout) return;
    layout = layoutNow();
    render();
  }

  function keyEl(code) { return el.keys.querySelector(`[data-code="${code}"]`); }
  const tilesOf = (clipId) => (el.touch.hidden ? [] : [...el.touch.querySelectorAll('[data-clip]')].filter((t) => t.dataset.clip === clipId));

  // ── The light show (a kid's idea): a hit lights its key, ripples its
  // color out across the keys around it, and tints the panel's glow, which
  // breathes with the sound's level. Calm with reduced motion. ──
  const calm = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const where = new Map(KEY_ROWS.flatMap((codes, r) => codes.map((c, i) => [c, [r, i]])));
  function light(code, { ripple = true } = {}) {
    const k = keyEl(code);
    if (!k) return;
    k.classList.add('hit');
    setTimeout(() => k.classList.remove('hit'), 120);
    const color = k.style.getPropertyValue?.('--c')?.trim() || '#ffffff';  // set on the tile by render()
    el.panel?.style.setProperty('--glow', color);
    if (!ripple || calm()) return;
    const [r0, c0] = where.get(code);
    for (const [c, [r, i]] of where) {
      const d = Math.max(Math.abs(r - r0), Math.abs(i - c0));
      if (d < 1 || d > 2) continue;
      keyEl(c)?.animate?.([
        { boxShadow: `0 0 0 0 transparent`, filter: 'brightness(1)' },
        { boxShadow: `0 0 ${22 - d * 6}px ${6 - d * 2}px ${color}`, filter: `brightness(${1.5 - d * 0.15})` },
        { boxShadow: `0 0 0 0 transparent`, filter: 'brightness(1)' },
      ], { duration: 360, delay: d * 70, easing: 'ease-out' });
    }
  }
  // A tile's hit lights it and tints the panel's glow (no ripple: bands are not a keyboard).
  function lightTiles(clipId) {
    for (const t of tilesOf(clipId)) {
      t.classList.add('hit');
      setTimeout(() => t.classList.remove('hit'), 120);
      el.panel?.style.setProperty('--glow', t.style.getPropertyValue?.('--c')?.trim() || '#ffffff');
    }
  }
  // The panel's glow follows how loud the sound is now (0 to 1).
  function level(l) {
    el.panel?.style.setProperty('--glow-level', calm() ? Math.min(l, 0.3).toFixed(2) : l.toFixed(2));
  }
  // A sound playing elsewhere (a beat's hit, scheduled `ms` from now): its
  // keys light in time, and a freestyle take records it.
  function flashClip(clipId, ms = 0) {
    record(clipId, 'beat', deps.now() + Math.max(0, ms) / 1000);
    const codes = Object.entries(deck()).filter(([, id]) => id === clipId).map(([c]) => c);
    setTimeout(() => { codes.forEach((c) => light(c, { ripple: false })); lightTiles(clipId); }, Math.max(0, ms));
  }
  // A sound started or stopped looping: its keys and tiles glow while it loops.
  function looping(clipId, on) {
    for (const [code, id] of Object.entries(deck())) if (id === clipId) keyEl(code)?.classList.toggle('looping', on);
    for (const t of tilesOf(clipId)) t.classList.toggle('looping', on);
  }

  // A key: its sound, and its tile lit with a ripple.
  function play(code, opts) {
    const clip = hit(deck()[code], opts);
    if (clip) light(code);
    return clip;
  }
  // A touch tile: the same, for the sound on it.
  function playTile(clipId, opts) {
    const clip = hit(clipId, opts);
    if (clip) lightTiles(clipId);
    return clip;
  }
  // What a key or a tile is: {code} or {clip}.
  const soundOf = (t) => (t.code ? deck()[t.code] : t.clip);
  const playTarget = (t, opts) => (t.code ? play(t.code, opts) : playTile(t.clip, opts));
  // A sound played from the keys or a tile: tapped (a looping one stops),
  // recorded into a take, given a row and a hit on the beat.
  function hit(id, { earlier = false } = {}) {
    const clip = deps.clipById(id);
    if (!clip) return null;
    // 🔔 Overlap on Live: a key's repeated hits ring over each other.
    const ring = ringing();
    const stopped = deps.tap(clip, { ring });   // a tap on a looping sound stops it
    if (!stopped) countPlay('keys');
    record(clip.id, stopped ? 'stop' : 'hit', deps.now(), ring);
    showRow(clip);
    if (!stopped) intoBeat(clip, earlier);
    return clip;
  }
  function loopIt(clip) {
    deps.loop(clip);
    record(clip.id, 'loop');
  }

  // A touch or click: plays now, and loops if still held after the hold time.
  // With Shift it loops at once (a looping sound stops, as a tap does).
  function pointerDown(target, id, shift = false) {
    if (shift) { shiftPlay(target); return; }
    const clip = playTarget(target);
    if (!clip) return;
    clearTimeout(holds.get(id));
    holds.set(id, setTimeout(() => { holds.delete(id); loopIt(clip); }, HOLD_TO_LOOP_MS));
  }
  function shiftPlay(target) {
    const wasLooping = deps.isLooping?.(soundOf(target));
    const clip = playTarget(target);
    if (clip && !wasLooping) loopIt(clip);
  }
  function pointerUp(id) {
    clearTimeout(holds.get(id));
    holds.delete(id);
  }

  // Forgets every hold: nothing half-pressed may turn into a loop.
  function letGo() {
    for (const t of holds.values()) clearTimeout(t);
    holds.clear();
    fingers.clear();
    held.clear();
    for (const k of [...el.keys.querySelectorAll('.down'), ...el.touch.querySelectorAll('.down')]) k.classList.remove('down');
  }

  // From the page's keydown: a DJ key plays (once per press, held keys loop).
  function keydown(e) {
    const code = keyFor(e, layout);
    if (!code) return false;
    e.preventDefault();
    const now = e.timeStamp ?? performance.now();
    if (e.repeat) {
      // Still down: loop once it has been held long enough.
      const h = held.get(code);
      if (h && !h.looped && now - h.at >= HOLD_TO_LOOP_MS) {
        h.looped = true;
        const clip = deps.clipById(deck()[code]);
        if (clip) loopIt(clip);
      }
      return true;
    }
    // The first key pressed shows a keyboard is there: the letters (and Q / D) come out.
    if (!keyboardSeen) { keyboardSeen = true; render(); }
    // Shift: "that one was meant a pill earlier", for recording into the beat.
    if (play(code, { earlier: e.shiftKey })) held.set(code, { at: now, looped: false });
    keyEl(code)?.classList.add('down');
    return true;
  }
  function keyup(e) {
    // macOS sends no keyup for other keys while ⌘ is down: letting go of a
    // modifier forgets them all.
    if (['Meta', 'Control', 'Alt', 'OS'].includes(e.key)) { letGo(); return; }
    const code = keyFor(e, layout) ?? (KEY_CODES.includes(e.code) ? e.code : null);
    if (!code) return;
    held.delete(code);
    keyEl(code)?.classList.remove('down');
  }

  // A finger plays a key when it lifts where it landed, as on the pads, so a
  // scroll that starts on the keys stays silent (Ben, 2026-10-16; finger.js).
  // Held still, it plays and loops. A mouse still plays on press.
  // A touch tile is the same as a key (Ben, 2026-10-16): lift to play, hold to loop.
  const fingers = fingerTaps({
    onTap: (t) => playTarget(t),
    onHold: (t) => { const clip = playTarget(t); if (clip) loopIt(clip); },
    holdMs: HOLD_TO_LOOP_MS,
  });
  // `sel` finds what was pressed in `box`; `targetOf` says which sound it is.
  function listen(box, sel, targetOf) {
    box.addEventListener('pointerdown', (e) => {
      const k = e.target.closest(sel);
      if (!k || e.button > 0) return;
      k.classList.add('down');
      const target = targetOf(k);
      if (isFinger(e)) { fingers.down(e, target, { hold: !deps.isLooping?.(soundOf(target)) }); return; }
      pointerDown(target, `p${e.pointerId}`, e.shiftKey);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      box.addEventListener(type, (e) => {
        pointerUp(`p${e.pointerId}`);
        e.target.closest?.(sel)?.classList.remove('down');
      });
    }
    // Enter or Space on a focused key or tile plays it (pointer taps are
    // handled above); Shift+Enter or Shift+Space loops it, as a hold does.
    box.addEventListener('click', (e) => {
      const k = e.target.closest(sel);
      if (!k || e.detail !== 0) return;
      if (e.shiftKey) shiftPlay(targetOf(k)); else playTarget(targetOf(k));
    });
  }
  listen(el.keys, '[data-code]', (k) => ({ code: k.dataset.code }));
  listen(el.touch, '[data-clip]', (k) => ({ clip: k.dataset.clip }));
  // On the window: a finger may lift off the key, or the browser may take it for a scroll.
  window.addEventListener('pointermove', (e) => fingers.move(e));
  window.addEventListener('pointerup', (e) => fingers.up(e));
  window.addEventListener('pointercancel', (e) => fingers.cancel(e));

  // ── ✏️ Layout (⌨️ Keys): a focused view of its own (dj-keys.js) ──
  const editor = createKeysEditor({
    el: el.keysEdit,
    deps: {
      ...deps,
      keys: () => deck(),
      base: () => baseDeck(),
      letterFor,
      family,
      layout: () => layout,
      preview: (clip) => deps.playOnce(clip),
      // The keys view's rows follow the keys (keyboard order), so they redraw too.
      saveKeys: (keys) => { deps.saveDeck(deps.personId(), keys); if (mode === 'beat') renderGrid(); },
      saveMine: (keys) => deps.saveDeck(deps.personId(), deps.savedDeck(deps.personId())?.keys ?? {}, { mine: keys }),
      closed: () => render(),
    },
  });
  // ── ✏️ Layout (👆 Pads): the touch layout's own view (dj-touch.js, ADR 0029) ──
  const touchEditor = createTouchEditor({
    el: el.touchEdit,
    deps: {
      personId: deps.personId,
      clipById: deps.clipById,
      family,
      kitGroups: () => deps.kitGroups?.() ?? [],
      sounds: () => soundsNow(),
      touch: () => touchNow(),
      // The beat's rows follow the bands, so they redraw too.
      saveTouch: (t) => { const pid = deps.personId(); deps.saveDeck(pid, deps.savedDeck(pid)?.keys ?? {}, { touch: t }); if (mode === 'beat') renderGrid(); },
      mine: () => deps.savedDeck(deps.personId())?.touchMine ?? null,
      saveMine: (t) => { const pid = deps.personId(); deps.saveDeck(pid, deps.savedDeck(pid)?.keys ?? {}, { touchMine: t }); },
      layouts: (pid) => deps.touchLayouts?.(pid) ?? [],
      saveLayout: (l) => deps.saveTouchLayout?.(l),
      deleteLayout: (id) => deps.deleteTouchLayout?.(id),
      preview: (clip) => deps.playOnce(clip),
      closed: () => render(),
    },
  });
  const openEditor = () => {
    letGo();
    if (touching()) touchEditor.open();
    else editor.open();
  };
  // ✏️ Layout: by the keys on 🎤 Live, in the slim bar once scrolled, and
  // on Beats' control bar (after 🎚️; on a phone after ⏲️) open the editor at once.
  for (const b of [el.change, el.changeTop, ...(el.changeBars ?? [])]) b?.addEventListener('click', openEditor);
  el.tabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-row]');
    if (!t) return;
    row = Number(t.dataset.row);
    render();
  });

  // ── Live: record whatever is played, whenever ──

  let rec = null;        // {started: bool, events: [{at, clipId, kind, ring?}]} while recording
  let recTimer = 0;
  let lastTake = null;   // the take just made, for the take card (#dj-done)
  let beatLine = null;   // the banner with ↩️ Undo for a change to the beat (ui.js showBanner)
  let levelUndo = null;  // {at, before}: a row's loudness before the drags that line undoes
  let gridSpeakers = null;   // the grid's speakers and their loudness popover (renderGrid draws them)
  let gridMenus = null;      // the rows' menus, each opened by its emoji (overflow.js)
  let replay = [];       // timers of a take being played back
  let booked = [];       // the plays it booked on the audio clock (deps.bookPlay's voices)
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
  // The big count-in over the keys: 1, 2, 3, 4 (as many as the time
  // signature has beats), each in its own color, popping in on its beat.
  const COUNT_COLORS = ['#FF6B6B', '#FFB347', '#FFE066', '#7CE38B', '#6EC6FF', '#C792EA', '#FF8FC8'];
  let shownCount = null;
  function showCount(at) {
    const key = at === 'go' ? 'go' : at ? String(at.n) : null;
    if (key === shownCount) return;
    shownCount = key;
    el.count.hidden = !key;
    if (!key) return;
    el.count.textContent = key === 'go' ? 'GO!' : key;
    el.count.style.setProperty('--count', key === 'go' ? '#FF4D4D' : COUNT_COLORS[(at.n - 1) % COUNT_COLORS.length]);
    el.count.classList.toggle('go', key === 'go');
    el.count.classList.remove('pop');
    void el.count.offsetWidth;   // restart the pop
    el.count.classList.add('pop');
  }

  // showRec runs every 40 ms while recording, so it writes only what changed:
  // each text or label written again is work for the whole page (laid out
  // again, and every control's tooltip looked at again, tooltips.js), and on
  // a slower computer that work held the playhead back (2026-10-18).
  function putText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function putAttr(node, name, value) { if (node.getAttribute(name) !== value) node.setAttribute(name, value); }
  function showRec() {
    const on = !!rec || !!beatRec;
    putText(el.record, on ? '■ Stop' : '● Record');
    putAttr(el.record, 'aria-pressed', String(on));
    el.record.classList.toggle('recording', on);
    showSetup();
    if (beatRec) {
      // The count-in: a big number in a new color on every beat, then GO!
      const groups = SIGNATURES[deps.seq.signature()] || SIGNATURES['4/4'];
      const at = countAt(deps.now(), beatRec.from, groups, deps.seq.beatClock().step);
      showCount(at);
      // After the count-in, no status line: ■ Stop already says it is
      // recording, the playhead shows the bar and the grid grows in sight
      // (Ben, 2026-10-12: "isn't that indicated by the record / stop button").
      putText(el.status, at && at !== 'go' ? `Get ready… ${at.n}` : '');
      return;
    }
    showCount(null);
    putText(el.status, !rec ? '' : !rec.started ? 'Play something!'
      : `● ${clockText(deps.now() - rec.from)}`);
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
      booked.push(deps.bookPlay(loaded.get(clipId), t0 + at, end == null ? null : t0 + end));
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
    later(t0 + take.duration + 0.5, () => { replay = []; booked = []; replaying = null; replayRun = null; showPlaying(); });
  }
  // Stops a take being played back: its timers, and every play it booked
  // (one still to come never sounds).
  function stopReplay() {
    replay.forEach(clearTimeout);
    replay = [];
    for (const voice of booked) deps.cutVoice(voice);
    booked = [];
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
      // with the same short fade (planTake `end`; 🔔 Overlap lets it ring).
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

  // ── Beats with ⌨️ Keys (once DJ's Beat Builder): hits land on the beat's grid, forgivingly ──

  let mode = 'free';   // 'free' on 🎤 Live, 'beat' on Beats with ⌨️ Keys (setMode)
  let clickWanted = recall('dj-click') === '1';
  // 🔔 Overlap on Live (Ben, 2026-10-12: "a button for the whole session"):
  // on, every key's repeated hits ring over each other; off, a hit restarts
  // its sound. For this visit only: never saved, off again after a reload.
  // With ⌨️ Keys on Beats the keys restart (a beat row's own 🔔 sets how it plays back).
  let overlap = false;
  const ringing = () => overlap && mode === 'free';
  function showOverlap() {
    if (!el.overlap) return;
    el.overlap.hidden = mode === 'beat';
    el.overlap.setAttribute('aria-pressed', String(overlap));
  }
  el.overlap?.addEventListener('click', () => {
    overlap = !overlap;
    showOverlap();
    deps.announce?.(overlap ? 'Overlap on: each hit rings over the last.' : 'Overlap off: each hit starts its sound again.');
  });
  let beatRec = null;   // {copy, from, snap, rows, added, startedBeat, growing, lastBar, mirror}
  let beatTimer = 0;
  let lastShown = [];   // the step each row's playhead is on (steps), for a redrawn grid
  const litPill = new WeakMap();   // a grid line -> its pill marked .now (steps)

  function showMode() {
    for (const b of [el.click, el.beatClick]) b?.setAttribute('aria-pressed', String(clickWanted));
    el.takesOpen.hidden = mode === 'beat';
    el.beatbar.hidden = mode !== 'beat';
    showBeat();
    // On Live, ⏲️ and its tempo sit on the control bar where Beats has its
    // own, the tempo always shown, as Beats' is. The keys view has the beat's
    // ⏲️ and one tempo (Ben, 2026-10-11, -12 and -26). ✏️ Layout and
    // 🔔 Overlap are Live's too: the keys view has its ✏️ after 🎚️.
    el.click.hidden = mode === 'beat';
    el.clickTempo.hidden = mode === 'beat';
    if (el.change) el.change.hidden = mode === 'beat';
    showOverlap();
    if (mode === 'beat') renderGrid();
    showSetup();
  }
  function recording() { return !!rec || !!beatRec; }
  // The count-in's clicks are already booked, so the tempo waits for GO.
  // After it, the tempo can change while recording (Ben, 2026-10-11).
  function countingIn() { return !!beatRec && !(deps.now() >= beatRec.from); }
  // The open beat (ADR 0017): a beat in 🗂️ My beats, or the scratch (ADR
  // 0020). Only before a person is set is there none; then the Record deck
  // and the grid wait. Live needs none.
  function showBeat() {
    const builder = mode === 'beat';
    const beat = builder && !!deps.seq.beat();
    el.grid.hidden = !beat;
    // The control bar as on Beats: ▶ Play, the tempo, ⏲️ and the bars, with a beat open.
    for (const node of [el.setup, el.play, el.tempo, el.beatClick]) if (node) node.hidden = !beat;
    // A new beat has no rows (Ben, 2026-10-11): a line points to the keys,
    // until the first hit lands (or while recording, when the keys are the point).
    if (el.noRows) el.noRows.hidden = !beat || !!beatRec || deps.seq.beat().rows.length > 0;
    el.deck.hidden = builder && !beat && !beatRec;
    el.record.disabled = el.deck.hidden;
    // A groove just loaded into the scratch (💃, ADR 0020): a line says so,
    // with ↩️ My beat, which undoes it. It opens stopped (Ben, 2026-10-12):
    // ▶ Play plays it behind the keys. While recording onto it, ● Record's
    // own ■ Stop ends both. A scratch it replaced is said first.
    const trying = builder && deps.seq.trying?.();
    if (el.trying) {
      el.trying.hidden = !trying || !!beatRec;
      if (trying) {
        const name = trying.groove;
        const was = trying.replaced ? `“${name}” replaced your scratch beat. ` : '';
        el.tryingText.textContent = deps.seq.playing()
          ? `💃 ${was}“${name}” is playing. Play along, or ● Record to add your hits.`
          : `💃 ${was}“${name}”: ▶ Play to hear it behind you, or ● Record to add your hits on top.`;
        el.done.hidden = true;   // the take's or the line's news is older than the groove
        beatLine?.close();
      }
    }
    if (el.play) el.play.disabled = !!beatRec;   // ● Record's ■ Stop ends a recording
  }

  async function startBeatRec() {
    const seq = deps.seq;
    stopReplay();
    lastTake = null;
    el.done.hidden = true;
    beatLine?.close();   // its Undo is older than the take
    // Records into the open beat (🆕 New in the beat bar for a clean start).
    const copy = seq.snapshot();
    beatRec = { copy, snap: null, rows: new Set(), added: 0, startedBeat: !seq.playing(), from: Infinity, growing: false, lastBar: false, mirror: null,
      // Recording onto a groove playing behind you: the hits go into the
      // scratch with it; ■ Stop stops the groove too.
      groove: seq.trying?.() ?? null };
    // Growing bars (Ben, 2026-10-11): only when Record started the beat, so
    // this is its first pass, and while there is room to double.
    beatRec.growing = beatRec.startedBeat && (seq.beat()?.bars ?? 4) < 4;
    seq.setGrow(beatRec.growing ? growNow : null);
    logEvent('dj', { rec: 'start', started: beatRec.startedBeat, bars: seq.beat()?.bars ?? 0, bpm: seq.beat()?.bpm ?? 0, growing: beatRec.growing });
    renderGrid();
    seq.metronome(false);                 // the beat's own schedule ticks now
    seq.setClick(clickWanted);            // only when ⏲️ Click track is on (the count-in always counts)
    showRec();
    if (beatRec.startedBeat) {
      await seq.play({ countIn: true });
      if (beatRec) beatRec.from = seq.beatClock().t0;
    } else {
      beatRec.from = seq.grid()?.next ?? deps.now();
    }
    if (beatRec) beatRec.snap = createSnapper(beatRec.from);
    beatTimer = setInterval(showRec, 40);   // often enough that the count lands on its beat
  }
  // why: what ended it ('button', 'escape', 'leave', or 'stopped': the beat
  // stopped from outside, by ⏹ Stop all or a song, say), for problem reports.
  function stopBeatRec(why = 'button') {
    if (!beatRec) return;
    const seq = deps.seq;
    clearInterval(beatTimer);
    seq.setGrow(null);
    seq.setClick(null);   // back to the Beats screen's own ⏲️
    // Cleared first: stopping the beat calls beatStopped(), which must find it done.
    const done = beatRec;
    beatRec = null;
    if (done.startedBeat || done.groove) seq.stop();   // a groove stays in the scratch, stopped
    logEvent('dj', { rec: 'stop', why, added: done.added, bars: seq.beat()?.bars ?? 0, seconds: Math.max(0, Math.round((deps.now() - done.from) * 10) / 10) || 0 });
    tick();
    showRec();
    renderGrid();   // 🗑️ Remove a row and the shape keys come back
    // An empty row reused with no note landing (a key in the count-in) can
    // be undone too: the kid may have set it up.
    if (!done.added && !done.reused) return;
    // The beat saved itself as each note landed; Undo takes them out. The
    // news also shows over the beat's name and fades (Ben, 2026-10-12).
    const where = seq.onScratch?.() ? 'your scratch beat' : `“${seq.beat().name}”`;
    const text = done.added ? `Added ${done.added} ${done.added === 1 ? 'note' : 'notes'} to ${where}.` : `Changed the rows of ${where}.`;
    if (el.nameFlash && done.added) {
      el.nameFlash.textContent = `✅ ${done.added} ${done.added === 1 ? 'note' : 'notes'} added`;
      el.nameFlash.hidden = false;
      fadeAway(el.nameFlash, 3500);
    }
    offerBeatUndo(done.copy, text);
    deps.announce?.(`Stopped. ${text} Undo is available.`);
  }
  const FULL = 'The beat is full: every row has hits. Remove a row (✕) to add another sound.';
  // How long a line with Undo for the beat stays (held while touched).
  const LINE_MS = 10000;
  // The banner with ↩️ Undo for a change to the beat: `copy` is the beat to
  // put back, or `fn` undoes it (🆕 New's emptied scratch, sequencer.js).
  function offerBeatUndo(copy, text, fn = null) {
    showBeatLine(text, () => {
      if (fn) fn(); else deps.seq.restore(copy);
      renderGrid();
    });
  }
  // Focus in a vanishing banner goes to ● Record.
  function showBeatLine(text, undo) {
    beatLine = showBanner(text, {
      action: { label: '↩️ Undo', fn: undo },
      ms: LINE_MS,
      focusBack: () => el.record,
      onClose: () => { beatLine = null; levelUndo = null; },
    });
  }
  // The keys view: a key played whose sound has no row gets one at once,
  // recording or not (Ben, 2026-10-12: "pressing an instrument in beat
  // builder should cause its row to appear"). It comes quietly, with no
  // notice (Ben, 2026-10-16: "drop the notification that a new row has been
  // added to beats"): the row's ✕ takes it out; while recording, the take's
  // own Undo does. While recording, a row with no hits takes the sound before
  // a new row is added, and is then kept from the next new sound.
  function showRow(clip) {
    const seq = deps.seq;
    const beat = mode === 'beat' && seq.beat();
    if (!beat || beat.rows.some((r) => r.clipId === clip.id)) return;
    if (seq.trying?.() && !beatRec) return;   // jamming over a groove changes nothing
    const had = beat.rows.length;
    const row = seq.addRowFor(clip.id, beatRec?.rows, !!beatRec);
    if (row < 0) { (deps.notice ?? deps.announce)?.(FULL); return; }
    if (beatRec) { beatRec.rows.add(row); if (row < had) beatRec.reused = true; }
    renderGrid();
  }
  // A live hit while recording into the beat: snapped once, as it arrives,
  // on the beat's clock of this moment (rhythm.js createSnapper), so a
  // tempo change or a growing beat never moves a hit already placed.
  function intoBeat(clip, earlier = false) {
    if (!beatRec?.snap || deps.now() < beatRec.from - 2 * deps.seq.beatClock().step) return;
    const seq = deps.seq;
    // A sound already playing in a row of its own: its pills are drawn in
    // place. A row new or unmuted for it: everything is drawn again.
    const kept = seq.beat().rows.some((r) => r.clipId === clip.id && !r.muted);
    const row = seq.rowFor(clip.id, beatRec.rows);
    if (row < 0) { (deps.notice ?? deps.announce)?.(FULL); return; }
    beatRec.rows.add(row);
    const clock = seq.beatClock();
    const pill = clock.step / (clock.rates[row] || 1);
    const k = beatRec.snap({ t: deps.now() - deps.latency() - (earlier ? pill : 0), row }, clock);
    if (!k) return;
    beatRec.added += seq.addSnaps([k], { skipAfter: deps.now() + 0.1, draw: !kept });
    const snaps = [k];
    // The new bars started as a copy: a hit still landing in the old bars
    // (the last beat before the playhead gets there) goes in the copy too.
    if (beatRec.mirror && k.n < beatRec.mirror.before) {
      snaps.push({ row: k.row, step: k.step + beatRec.mirror.offset, n: k.n + beatRec.mirror.offset });
      seq.addSnaps([snaps[1]], { draw: !kept });
    }
    // A hit in the last bar on the first pass: the beat keeps growing.
    const bar = clock.total / (seq.beat()?.bars || 1);
    if (k.n >= clock.total - bar && k.n < clock.total) beatRec.lastBar = true;
    if (!kept || !snaps.every((s) => showHit(s.row, s.step))) renderGrid();
    showRec();
  }
  // A pill turned on while recording, drawn in place: drawing the whole grid
  // again for each hit (over a thousand pills with 16 rows of 4 bars) held
  // the playhead up. False when it can't be (a tune row, or bars not drawn
  // yet), so the grid is drawn again.
  function showHit(row, step) {
    const r = deps.seq.beat()?.rows[row];
    const line = !r?.melody && el.grid.querySelector(`.dj-grid-row[data-row="${row}"]`);
    const p = line?.querySelector('.dj-grid-pills')?.children[step];
    if (!p || p.tagName.toLowerCase() !== 'i') return false;
    p.classList.add('on');
    p.classList.toggle('loud', !!r.accents?.[step]);
    return true;
  }

  // Asked by the beat as its last beat starts, on the first pass: grow if a
  // hit landed in the last bar ("keep playing and the beat gets longer"),
  // else go round as before, for good. Doubles: 1 → 2 → 4 bars.
  function growNow() {
    const beat = deps.seq.beat();
    if (!beatRec?.growing || !beat) return false;
    const grows = beatRec.lastBar && beat.bars < 4;
    beatRec.lastBar = false;
    if (!grows) { beatRec.growing = false; deps.seq.setGrow(null); queueMicrotask(renderGrid); logEvent('dj', { rec: 'round', bars: beat.bars }); return false; }
    logEvent('dj', { rec: 'grow', bars: beat.bars * 2 });
    const total = deps.seq.beatClock().total;
    beatRec.mirror = { before: total, offset: total };
    if (beat.bars * 2 >= 4) beatRec.growing = false;   // 4 bars is as long as a beat gets
    if (!beatRec.growing) deps.seq.setGrow(null);
    queueMicrotask(() => { renderGrid(); showRec(); });
    return true;
  }

  // The beat, small and still, with pills filling as hits land.
  function renderGrid() {
    showBeat();
    deps.seq.lockChips?.(!!beatRec);   // recording into the beat: its chips wait
    const beat = deps.seq.beat();
    const keys = beat ? deck() : {};
    // At start-up there is no beat yet (the person is set after the keys are
    // made): nothing to draw, and drawing must never stop the app starting.
    if (el.grid.hidden || !beat) return;
    const total = deps.seq.beatClock().total;
    // Where each beat starts in a bar, from the beat's time signature.
    const groups = SIGNATURES[deps.seq.signature()] || SIGNATURES['4/4'];
    const bar = groups.reduce((a, b) => a + b, 0);
    const starts = new Set(groups.map((_, g) => groups.slice(0, g).reduce((a, b) => a + b, 0)));
    showSetup();
    // In keyboard order (or the touch layout's, band by band, with 👆);
    // each line's data-row is its row's index in the beat.
    const twins = twinRows(beat.rows.map((r) => deps.clipById(r.clipId)?.emoji || '🔊'));
    const touch = touching();
    const order = touch ? touchOrder(beat.rows, touchNow()) : keyboardOrder(beat.rows, keys);
    drawRuler(groups, total, bar, starts);
    el.grid.replaceChildren(...order.map((at) => beat.rows[at]).map((r) => {
      const line = document.createElement('div');
      line.className = 'dj-grid-row beat-row';
      line.dataset.row = beat.rows.indexOf(r);
      const clip = deps.clipById(r.clipId);
      const at = Number(line.dataset.row);
      // As on Beats (Ben, 2026-10-26: "scrolling rows for consistent views as
      // much as possible no matter the size"): the row's head stays at the
      // left, emoji · 🔊 (and its name with room), its pills on one line after
      // it, scrolling sideways with the others. The emoji opens the row's menu
      // (beat-row.js, overflow.js): 🖼️ Change picture, 🔔 Overlap, 🧹 Clear
      // and ✕ Remove, the last two asking first (in red), with Undo. While
      // recording the menu waits. If two rows share an emoji, its key's letter
      // (or its name's first) tells them apart.
      const e = clip?.emoji || '🔊';
      const code = twins.has(at) && !touch && Object.entries(keys).find(([, id]) => id === r.clipId)?.[0];
      const letter = code ? letterFor(code) : [...(clip?.label ?? '')][0]?.toUpperCase() ?? '';
      const name = clip?.label ?? 'empty';
      const level = deps.seq.levelState(at);
      showGridMix(line, level);
      const { pick, tools } = rowParts({
        asked: rowAsked?.row === at ? rowAsked.kind : null,
        ring: deps.seq.ringTool?.(r, at, name) ?? null,
        speaker: rowSpeaker(line.dataset.row, level),
        canClear: r.steps.some(Boolean),
        locked: !!beatRec,
        emoji: rowEmoji(e, twins.has(at), letter),
        title: clip?.label ?? '',
        pickable: !!clip,
        data: { remove: { removeRow: at }, clear: { clearRow: at }, pick: { picture: r.clipId ?? '' } },
        menu: { key: at, label: `${name}: menu. Picture, ${r.melody ? '' : 'Overlap, '}Clear, Remove`, change: ['🖼️', 'Change picture'] },
        labels: {
          remove: `Remove the ${name} row`, removeAsk: `Tap again to remove the ${name} row`,
          clear: `Clear the ${name} row`, clearAsk: `Tap again to clear the ${name} row`,
          pick: `Change the picture for ${clip?.label ?? 'this row'}`,
        },
      });
      const head = document.createElement('div');
      head.className = 'dj-grid-head';
      const label = document.createElement('span');
      label.className = 'dj-grid-name';
      label.textContent = clip?.label ?? '';
      label.setAttribute('aria-hidden', 'true');   // the emoji's label says it
      label.addEventListener('click', () => pick.click());
      head.append(pick, label, tools);
      line.append(head);
      const pills = document.createElement('span');
      pills.className = 'dj-grid-pills';
      pills.setAttribute('aria-hidden', 'true');   // a picture of the beat; the pills are on Beats for screen readers
      if (clip) line.style.setProperty('--c', deps.colorOf?.(clip) || '#fff');
      // A tune row (🎹, ADR 0023): lit where a note starts, half lit while
      // one lasts; a tap on it opens the piano roll (sequencer cyclePill).
      const held = new Set();
      if (r.melody) for (const n of r.tune ?? []) for (let s = Math.floor(n.s) + 1; s < n.s + n.l; s++) held.add(s);
      for (let i = 0; i < total; i++) {
        const p = document.createElement('i');
        p.dataset.step = i;
        if (r.steps[i]) p.className = r.accents?.[i] ? 'on loud' : 'on';
        else if (held.has(i)) p.className = 'held';
        if (starts.has(i % bar)) p.classList.add('beat-start');
        if (i % bar === 0) p.classList.add('one');   // the "1" of each bar, as on Beats
        if (i > 0 && i % bar === 0) p.classList.add('bar-start');
        pills.append(p);
      }
      // Room to grow: a dashed empty bar after the last, while it still can.
      if (beatRec?.growing) {
        const more = document.createElement('span');
        more.className = 'dj-grid-grow';
        pills.append(more);
      }
      line.append(pills);
      return line;
    }));
    gridSpeakers?.refresh();
    gridMenus?.refresh();   // an open row menu shows its row as it is now
    gridPick?.decorate();   // a mouse's pick (pill-select.js)
    // New pills: the playhead goes back on at once, not a pill later.
    if (deps.seq.playing()) steps(lastShown);
  }
  // The bar numbers over the rows (outside the grid, whose children are its
  // rows), laid out as a row's pills are: each bar's number over its "1".
  function drawRuler(groups, total, bar, starts) {
    const ruler = el.grid.parentElement?.querySelector('.dj-grid-ruler');
    if (!ruler) return;
    const head = document.createElement('div');
    head.className = 'dj-grid-head';
    const ticks = document.createElement('span');
    ticks.className = 'dj-grid-pills';
    for (let i = 0; i < total; i++) {
      const t = document.createElement('i');
      t.className = i % bar === 0 ? 'one' : '';
      if (starts.has(i % bar)) t.classList.add('beat-start');
      if (i > 0 && i % bar === 0) t.classList.add('bar-start');
      t.textContent = i % bar === 0 ? String(i / bar + 1) : starts.has(i % bar) ? '·' : '';
      ticks.append(t);
    }
    ruler.replaceChildren(head, ticks);
  }
  // A row's faintness and mixer state: muted or silenced by another row's
  // Solo draws faintest (and dimmed), a soloed row's emoji gets a lit ring.
  function showGridMix(line, level) {
    line.style.setProperty('--vol', String(level.muted || level.silenced ? 0 : level.level));
    line.classList.toggle('muted', level.muted);
    line.classList.toggle('silenced', !!level.silenced);
    line.classList.toggle('solo', !!level.solo);
  }
  // One row's speaker and faintness, redrawn in place (a drag goes on under the finger).
  function showGridLevel(i) {
    const line = el.grid.querySelector(`.dj-grid-row[data-row="${i}"]`);
    const level = deps.seq.levelState(i);
    if (!line || !level) return;
    showGridMix(line, level);
    const b = line.querySelector('[data-speaker]');
    if (b) drawSpeaker(b, level);
  }
  // A level change here has Undo on the done bar, as removing a row does:
  // one step for a whole drag, and for a run of changes to one row.
  let levelBefore = null;   // {at, before}: the row's level as this gesture started
  gridMenus = moreMenu(el.grid);
  gridSpeakers = speakerControls(el.grid, {
    state: (key) => deps.seq.levelState(Number(key)),
    toggle: (key) => { deps.seq.toggleMute(Number(key)); showGridLevel(Number(key)); },
    change: (key, value, done) => {
      const i = Number(key);
      if (levelBefore?.at !== i) levelBefore = { at: i, before: deps.seq.levelOf(i) };
      deps.seq.setLevel(i, value, done, { offer: false });
      showGridLevel(i);
      if (!done) return;
      // Drags on the same row while its line shows undo back to the first.
      const kept = levelUndo?.at === i && beatLine?.open ? levelUndo.before : levelBefore.before;
      levelBefore = null;
      if (beatRec) return;   // while recording, Undo is the take's
      const s = deps.seq.levelState(i);
      showBeatLine(`${s.name} loudness ${percent(s.level)} %.`, () => {
        deps.seq.putLevel(i, kept);
        renderGrid();
      });
      levelUndo = { at: i, before: kept };
    },
  });
  // While the beat plays the rows turn a page as the playhead leaves the view,
  // until the kid scrolls them (follow.js, as Beats' rows).
  const gridBox = el.grid.parentElement?.classList.contains('dj-grid-scroll') ? el.grid.parentElement : null;
  const gridFollow = follower(gridBox);
  let gridPlaying = false;
  function steps(shown) {
    lastShown = [...shown];
    const on = shown.some((s) => s >= 0);
    if (on && !gridPlaying) gridFollow.start();
    if (!on) gridFollow.stop();
    gridPlaying = on;
    if (el.grid.hidden) return;
    // Only the pills that change: the one each row leaves and the one it
    // reaches (16 rows of 4 bars are over a thousand pills).
    let lit = null;   // the first row's pill being heard, for the page turn
    for (const line of [...el.grid.children]) {
      const i = Number(line.dataset.row);   // lines are in keyboard order, not the beat's
      const p = line.querySelector('.dj-grid-pills')?.children[shown[i]] ?? null;
      lit ??= p;
      const was = litPill.get(line);
      if (was === p) continue;
      was?.classList.remove('now');
      p?.classList.add('now');
      litPill.set(line, p);
    }
    // Once the pill being heard leaves the view, its beat turns to the left edge.
    let from = lit;
    while (from && !from.classList.contains('beat-start') && from.previousElementSibling) from = from.previousElementSibling;
    keepInView(gridFollow, gridBox, lit, el.grid.querySelector('.dj-grid-head')?.offsetWidth ?? 0, from);
  }

  // The grid takes taps too (mouse or touch), as in Beats: a tap switches a
  // pill on or off, a hold (or Shift) makes it loud.
  // A row's ✕ and 🧹: tap once to ask, again to remove or clear (it waits
  // ARM_MS), with Undo. `rowAsked`: {row, kind: 'remove' | 'clear'}.
  let rowAsked = null;
  let askTimer = 0;
  // The picture chooser: tap a picture to use it; one another sound on that
  // board already has asks first ("Tap it again to use it anyway").
  let picturing = null;     // the clip whose picture is being chosen
  let pictureAsked = null;  // the picture tapped once while taken
  function openPictures(clip) {
    picturing = clip;
    pictureAsked = null;
    el.picturesTitle.textContent = `Pick a picture for ${clip.label}`;
    el.picturesNote.textContent = '';
    pictureAll.reset();
    renderPictures();
    openDialog(el.pictures);
  }
  const takenBy = (p) => pictureTakenBy(deps.boardClips(picturing?.id), p, picturing?.id);
  function renderPictures() {
    // The short list, the picture in use if it came from "…", then "…".
    el.picturesGrid.replaceChildren(...withCurrent(PICTURES, picturing?.emoji).map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.pick = p;
      b.textContent = p;
      b.setAttribute('aria-pressed', String(p === picturing?.emoji));
      b.classList.toggle('armed', p === pictureAsked);
      const other = takenBy(p);
      b.setAttribute('aria-label', other ? `${p}, already ${other.label}'s picture` : p);
      return b;
    }), pictureAll.button);
    pictureAll.refresh();
  }
  // A tap on a picture, from the short list or from "…": the same rule.
  async function choosePicture(p) {
    if (!picturing) return;
    const other = takenBy(p);
    if (other && pictureAsked !== p) {
      pictureAsked = p;
      el.picturesNote.textContent = `${p} is already ${other.label}'s picture. Tap it again to use it anyway.`;
      renderPictures();
      if (pictureAll.open) pictureAll.focus(p);
      else el.picturesGrid.querySelector(`[data-pick="${CSS.escape(p)}"]`)?.focus();
      return;
    }
    await deps.setEmoji(picturing.id, p);
    el.pictures.close();
    deps.announce?.(`${picturing.label} is now ${p}.`);
    picturing = null;
  }
  setupDialog(el.pictures);
  const pictureAll = emojiMore({
    grid: el.picturesGrid,
    onPick: choosePicture,
    stateOf: (p, name) => {
      const other = takenBy(p);
      return { pressed: p === picturing?.emoji, armed: p === pictureAsked, label: other ? `${name}, already ${other.label}'s picture` : name };
    },
  });
  el.picturesGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) choosePicture(b.dataset.pick);
  });
  el.grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) return;   // the emoji: its menu opens (overflow.js)
    const pic = e.target.closest('[data-picture]');
    if (pic) {
      const clip = deps.clipById(pic.dataset.picture);
      if (clip && !beatRec) openPictures(clip);
      return;
    }
    if (e.target.closest('[data-ring]')) {
      const i = Number(e.target.closest('[data-ring]').dataset.ring);
      if (rowAsked) rowAsked = null;
      deps.seq.toggleRing(i);
      renderGrid();
      el.grid.querySelector(`[data-ring="${i}"]`)?.focus();
      return;
    }
    const rm = e.target.closest('[data-remove-row]');
    const sweep = e.target.closest('[data-clear-row]');
    const ask = rm || sweep;
    if (!ask && rowAsked) { rowAsked = null; renderGrid(); }   // any other tap takes it back
    if (ask) {
      if (beatRec || ask.disabled) return;
      const seq = deps.seq;
      const kind = rm ? 'remove' : 'clear';
      const attr = rm ? 'data-remove-row' : 'data-clear-row';
      const i = Number(rm ? rm.dataset.removeRow : sweep.dataset.clearRow);
      clearTimeout(askTimer);
      if (rowAsked?.row !== i || rowAsked.kind !== kind) {
        rowAsked = { row: i, kind };
        askTimer = setTimeout(() => { rowAsked = null; renderGrid(); }, ARM_MS);
        renderGrid();
        el.grid.querySelector(`[${attr}="${i}"]`)?.focus();
        return;
      }
      rowAsked = null;
      const clip = deps.clipById(seq.beat()?.rows[i]?.clipId);
      const copy = seq.snapshot();
      if (rm) seq.dropRow(i); else seq.clearRow(i);
      const text = `${rm ? 'Removed' : 'Cleared'} the ${clip?.label ?? 'empty'} row.`;
      offerBeatUndo(copy, text);
      renderGrid();
      deps.announce?.(`${text} Undo is available.`);
      return;
    }
    const p = e.target.closest('[data-step]');
    const line = e.target.closest('[data-row]');
    if (!p || !line || gridHeld()) return;
    // A mouse's click picks (pill-select.js); a tap lights or unlights, a hold makes it loud.
    if (gridPick?.click(e, Number(line.dataset.row), Number(p.dataset.step))) return;
    deps.seq.cyclePill(Number(line.dataset.row), Number(p.dataset.step));
    renderGrid();
  });
  const gridHeld = pillHolds(el.grid, (t) => t.closest?.('[data-step]'), (p) => {
    if (gridPick?.dragging() || deps.seq.locked()) return;   // a mouse sliding the pick; ⇆ locked: nothing changes
    const line = p.closest('[data-row]');
    if (!line) return;
    deps.seq.cyclePill(Number(line.dataset.row), Number(p.dataset.step), true);
    renderGrid();
  });
  // A mouse picks lit pills of the beat and drags them along their rows, as
  // on Beats' rows (pill-select.js), and a finger too while ⇆ locks them;
  // not while recording.
  const gridPill = (node) => {
    const p = node?.closest?.('.dj-grid-pills > [data-step]');
    const line = p?.closest('[data-row]');
    return p && line ? { r: Number(line.dataset.row), s: Number(p.dataset.step) } : null;
  };
  gridPick = createPillSelect({
    root: el.grid,
    pillOf: gridPill,
    pillEl: (r, s) => el.grid.querySelector(`.dj-grid-row[data-row="${r}"] .dj-grid-pills`)?.children[s] ?? null,
    beat: () => deps.seq.beat(), total: () => deps.seq.beatClock().total,
    putRows: (rows) => { deps.seq.putRows(rows); renderGrid(); },
    // A drag's every step: the beat takes the rows, and only the grid's pills
    // that changed are repainted (the drop's putRows draws the rest).
    paint: (rows) => {
      const was = deps.seq.beat().rows.map((r) => [r.steps, r.accents ?? []]);
      deps.seq.paintRows(rows, { draw: false });
      const lines = new Map([...el.grid.querySelectorAll('.dj-grid-row')].map((l) => [Number(l.dataset.row), l.querySelector('.dj-grid-pills')]));
      deps.seq.beat().rows.forEach((r, i) => {
        const pills = lines.get(i);
        if (!pills || r.melody) return;
        const [steps, accents] = was[i];
        for (let s = 0; s < pills.children.length; s++) {
          if (!!steps[s] === !!r.steps[s] && !!accents[s] === !!r.accents?.[s]) continue;
          pills.children[s].classList.toggle('on', !!r.steps[s]);
          pills.children[s].classList.toggle('loud', !!(r.steps[s] && r.accents?.[s]));
        }
      });
    },
    save: () => deps.seq.saveBeat(), snapshot: () => deps.seq.snapshot(),
    light: (r, s) => { deps.seq.cyclePill(r, s); renderGrid(); },
    enabled: () => !beatRec, locked: () => deps.seq.locked(), changed: () => deps.seq.lockChanged(),
    undoable: (copy, text) => offerBeatUndo(copy, text),
  });
  deps.seq.addPicker(gridPick, () => !el.grid.hidden && !el.grid.closest?.('[hidden]'));

  // The beat's shape, chosen before Record: tempo, bars and (with Advanced)
  // the time signature. They change the open beat, as on the Beats screen,
  // and wait while recording, since the hits are landing on that grid.
  function showSetup() {
    // The click track's tempo: the open beat's, or with none open a
    // tempo for this visit (100 BPM to start).
    const bpm = deps.seq.tempo();
    if (document.activeElement !== el.clickBpm) el.clickBpm.value = stopFor(bpm, STOPS);   // not under a dragging thumb
    putText(el.clickBpmOut, `${bpm} BPM`);
    putAttr(el.clickBpm, 'aria-valuetext', `${bpm} BPM`);
    const beat = deps.seq.beat();
    if (!beat) return;
    putText(el.bpm, `${beat.bpm} BPM`);
    putAttr(el.bpm, 'aria-label', `Tempo ${beat.bpm} BPM. Tap to type a tempo.`);
    if (document.activeElement !== el.bpmSlider) el.bpmSlider.value = stopFor(beat.bpm, STOPS);   // not under a dragging thumb
    putAttr(el.bpmSlider, 'aria-valuetext', `${beat.bpm} BPM`);
    const locked = countingIn();
    el.bpmSlider.disabled = locked;
    for (const b of el.bars.querySelectorAll('[data-bars]')) putAttr(b, 'aria-pressed', String(Number(b.dataset.bars) === beat.bars));
    for (const b of [...el.tempo.querySelectorAll('button'), ...el.setup.querySelectorAll('button')]) b.disabled = b.closest('.beat-tempo') ? locked : !!beatRec;
    // The beat's shape can't change once hits are landing on its grid, so
    // the bars and time signature go away while recording.
    el.bars.hidden = !!beatRec;
    for (const b of el.sigs.querySelectorAll('[data-sig]')) putAttr(b, 'aria-pressed', String(b.dataset.sig === deps.seq.signature()));
    el.sigs.hidden = !deps.seq.advanced() || !!beatRec;
  }
  // The click track's tempo slider (Live): Live's own tempo for the visit (no beat is open there), with
  // the same pull toward common tempos as the Beats slider.
  el.clickBpm.min = 0;
  el.clickBpm.max = STOPS.length - 1;
  // The chevrons (narrow screens): to the next common tempo up or down.
  el.clickTempo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-click-step]');
    if (!b) return;
    const bpm = deps.seq.tempo();
    const next = Number(b.dataset.clickStep) > 0 ? COMMON_BPMS.find((t) => t > bpm) : COMMON_BPMS.findLast((t) => t < bpm);
    if (next) deps.seq.setTempo(next);
  });
  // The keys view's tempo slider: the same stops as on Beats.
  el.bpmSlider.min = 0;
  el.bpmSlider.max = STOPS.length - 1;
  el.bpmSlider.addEventListener('input', () => {
    const bpm = STOPS[Number(el.bpmSlider.value)];
    if (!countingIn() && bpm && bpm !== deps.seq.beat()?.bpm) deps.seq.setTempo(bpm);
  });
  // Tapping the number swaps it for a field to type a tempo into, as on Beats.
  el.bpm.addEventListener('click', () => {
    if (countingIn() || !deps.seq.beat()) return;
    el.bpmType.value = deps.seq.beat().bpm;
    el.bpm.hidden = true;
    el.bpmType.hidden = false;
    el.bpmType.focus();
    el.bpmType.select?.();
  });
  const endTyping = (keep) => {
    if (el.bpmType.hidden) return;
    const bpm = keep && !countingIn() ? typedBpm(el.bpmType.value) : null;
    el.bpmType.hidden = true;
    el.bpm.hidden = false;
    if (bpm != null && deps.seq.beat()) deps.seq.setTempo(bpm);
    showSetup();
  };
  el.bpmType.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    endTyping(e.key === 'Enter');
    el.bpm.focus();
  });
  el.bpmType.addEventListener('blur', () => endTyping(true));
  el.clickBpm.addEventListener('input', () => {
    const bpm = STOPS[Number(el.clickBpm.value)];
    if (bpm && bpm !== deps.seq.tempo()) deps.seq.setTempo(bpm);
  });
  el.deck.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tempo-step], [data-bars], [data-sig]');
    if (!b || !deps.seq.beat()) return;
    if (b.dataset.tempoStep ? countingIn() : beatRec) return;   // bars and signature wait for Stop
    const seq = deps.seq;
    if (b.dataset.tempoStep) {
      // The chevrons (a short line): to the next common tempo up or down.
      const bpm = seq.beat().bpm;
      const next = Number(b.dataset.tempoStep) > 0 ? COMMON_BPMS.find((t) => t > bpm) : COMMON_BPMS.findLast((t) => t < bpm);
      if (next) seq.setTempo(next);
    } else if (b.dataset.bars) seq.setBars(Number(b.dataset.bars));
    else if (b.dataset.sig) seq.setSignature(b.dataset.sig);
    renderGrid();
    showSetup();
  });

  // Which place the keys are in: 'free' (🎤 Live) or 'beat' (Beats with
  // ⌨️ Keys). app.js has already ended a recording into the beat (leave)
  // and shown the beat maker's view for it.
  function setMode(next) {
    const m = next === 'beat' ? 'beat' : 'free';
    if (m === mode) return;
    mode = m;
    showMode();
  }
  // ↩️ My beat on the line under a groove just loaded: Undo of it (the beat
  // open before, and the scratch as it was).
  el.trying?.querySelector('button')?.addEventListener('click', () => { deps.seq.putTrialAway?.(); renderGrid(); });
  // ▶ Play, as on Beats: the keys view's beat round and round, recording
  // nothing; ■ Stop. ⏲️ ticks with it when on. A groove tried stays on screen.
  el.play?.addEventListener('click', () => {
    const seq = deps.seq;
    if (beatRec || !seq.beat()) return;
    if (seq.playing()) { seq.stop(); showBeat(); return; }
    seq.setClick(clickWanted);
    seq.play().then(showBeat);
  });
  // ⏲️ Click, in both modes: recording into the beat, the beat ticks it;
  // otherwise it ticks on its own at the open beat's tempo while DJ shows.
  let onScreen = false;
  function tick() { if (!beatRec) deps.seq.metronome(clickWanted && onScreen); }
  function shown(on) { onScreen = on; tick(); }
  // Tap tempo (Ben, 2026-10-11): one or two taps on ⏲️ turn the click on or
  // off as always; a third quick tap in time sets the tempo from the taps
  // (rhythm.js tapTempo) and leaves the click on. The button says
  // "keep tapping…" after two quick taps, then "👆 96" while the taps set it.
  // Not during the count-in, whose clicks are already booked.
  const clicks = [el.click, el.beatClick].filter(Boolean);   // Live's and the keys view's, both on the control bar
  for (const b of clicks) b.dataset.idle = b.textContent;
  let taps = [];
  let tapTimer = 0;
  let tapped = null;    // the tempo the taps set, said when they stop
  function endTaps() {
    taps = [];
    for (const b of clicks) { b.textContent = b.dataset.idle; b.classList.remove('tapping'); }
    if (tapped) deps.announce?.(`Tempo ${tapped} BPM.`);
    tapped = null;
  }
  function setClickWanted(on) {
    clickWanted = on;
    remember('dj-click', clickWanted ? '1' : '');
    if (beatRec || (mode === 'beat' && deps.seq.playing())) deps.seq.setClick(clickWanted);
    tick();
  }
  const clickTapped = (button) => {
    const now = deps.now();
    if (taps.length && !(now - taps.at(-1) <= TAP_GAP_MAX)) { tapped = null; endTaps(); }
    taps.push(now);
    clearTimeout(tapTimer);
    tapTimer = setTimeout(endTaps, TAP_GAP_MAX * 1000);
    const groups = SIGNATURES[deps.seq.signature()] || SIGNATURES['4/4'];
    const bpm = taps.length >= 3 && !countingIn() ? tapTempo(taps, groups[0], { common: COMMON_BPMS }) : null;
    if (bpm) {
      if (!clickWanted) setClickWanted(true);
      deps.seq.setTempo(bpm);
      // With the beat stopped, the next tick comes one beat after this tap,
      // so the click carries on in the kid's own time.
      if (!deps.seq.playing()) deps.seq.clickAt(now + (15 * groups[0]) / bpm);
      tapped = bpm;
      button.textContent = `👆 ${bpm}`;
      button.classList.add('tapping');
    } else {
      setClickWanted(!clickWanted);
      if (taps.length === 2) { button.textContent = 'keep tapping…'; button.classList.add('tapping'); }
    }
    showMode();
    showSetup();
  };
  for (const b of clicks) b.addEventListener('click', () => clickTapped(b));
  // ⏹️ Stop all turns ⏲️ off too, remembered as off; taps so far start over.
  function clickOff() {
    clearTimeout(tapTimer);
    tapped = null;
    endTaps();
    if (!clickWanted) return;
    setClickWanted(false);
    showMode();
  }
  el.record.addEventListener('click', () => {
    if (rec) stopRec();
    else if (beatRec) stopBeatRec();
    else if (mode === 'beat') { if (deps.seq.beat()) startBeatRec(); }
    else startRec();
  });
  el.donePlay.addEventListener('click', () => lastTake && playTake(lastTake));
  // ✕ puts the take card away (the take stays as it is).
  el.doneClose.addEventListener('click', () => { lastTake = null; el.done.hidden = true; });
  el.takeName.addEventListener('change', () => {
    const name = el.takeName.value.trim().slice(0, 24);
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
    showBanner(`Took out “${take.name}”.`, {
      action: { label: '↩️ Undo', fn: () => bringBack(take) },
      ms: LINE_MS,
      focusBack: () => el.record,
    });
    deps.announce?.(`Took out ${take.name}. Undo is available.`);
  });
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
    const name = input.value.trim().slice(0, 24);
    if (name) deps.saveTake({ ...t, name });
    else input.value = t.name;
  });
  setupDialog(el.takes);

  // Leaving the keys view ends a recording into the beat (the beat maker
  // switches to the next screen's own beat).
  function leave() {
    if (beatRec) stopBeatRec('leave');
  }
  // The beat stopped (sequencer onStop): a recording into it ends too, so
  // ● Record never says recording with nothing playing.
  function beatStopped() {
    if (beatRec) stopBeatRec('stopped');
    else deps.seq.setClick(null);   // after ▶ Play: back to the Beats screen's own ⏲️
    if (mode === 'beat') showBeat();
  }

  // Esc stops a take (and keeps it) before it stops everything else.
  function escape() {
    if (beatRec) { stopBeatRec('escape'); return true; }
    if (!rec) return false;
    stopRec();
    return true;
  }

  // Leaving the window or the tab drops every hold.
  globalThis.addEventListener?.('blur', letGo);
  globalThis.document?.addEventListener?.('visibilitychange', () => { if (document.hidden) letGo(); });

  // ⌨️ Keys | 👆 Pads at the top of ✏️ Layout: the keys or the touch layout,
  // remembered on this device. The beat's rows follow the one showing, so
  // they redraw too, and the editor open swaps for the other one's.
  for (const sw of el.inputs) sw.addEventListener('click', (e) => {
    const b = e.target.closest('[data-input]');
    if (!b || !INPUTS.includes(b.dataset.input)) return;
    const was = inputNow();
    letGo();
    input = b.dataset.input;
    remember('dj-input', input);
    render();
    if (mode === 'beat') renderGrid();
    deps.inputChanged?.();
    deps.announce?.(input === 'touch' ? 'Pads: big pads in groups.' : 'Keys: laid out like a keyboard.');
    const open = [el.keysEdit.dialog, el.touchEdit.dialog].find((d) => d.open);
    if (!open || inputNow() === was) return;
    const opener = openerOf(open);
    open.close();
    const other = touching() ? el.touchEdit : el.keysEdit;
    (touching() ? touchEditor : editor).open({ opener, focus: other.dialog.querySelector(`[data-input-switch] [data-input="${input}"]`) });
  });
  // A phone turned or a window resized past 700 px: pads under it, the kid's pick (or keys) over it.
  globalThis.matchMedia?.('(max-width: 699px)')?.addEventListener?.('change', () => { render(); if (mode === 'beat') renderGrid(); deps.inputChanged?.(); });

  // S M L in ✏️ Layout (⌨️ Keys), the pads' size: more sounds on screen, or bigger targets.
  el.size.addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    size = b.dataset.size;
    remember('dj-size', size);
    render();
  });

  // Q / D in ✏️ Layout (⌨️ Keys): the keyboard the letters follow, this device's own.
  function showLayout() { for (const b of el.layout.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === layout)); }
  el.layout.addEventListener('click', (e) => {
    const b = e.target.closest('[data-layout]');
    if (!b || !Object.hasOwn(LAYOUTS, b.dataset.layout)) return;
    letGo();
    layout = b.dataset.layout;
    setSetting('djLayout', layout);
    keyboardSeen = true;  // picking a keyboard means there is one: show the letters
    render();
    deps.announce?.(`${LAYOUT_NAMES[layout]} keyboard.`);
  });
  // A backup loaded, or the setting changed elsewhere: follow it.
  onSetting('djLayout', () => {
    if (layoutNow() === layout) return;
    layout = layoutNow();
    render();
  });

  readLayout();
  showMode();
  // Recording a take, or playing one back: the update bar waits (update.js).
  const busy = () => recording() || !!replaying;
  return { render, keydown, keyup, deck, touchNow, touching, letGo, level, flashClip, looping, escape, stopReplay, steps, renderGrid, showSetup, shown, leave, beatStopped, busy, setMode, recording, clickOff };
}
