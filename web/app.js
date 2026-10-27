// Noodle Pads v1: a throwaway interface prototype (v2 is a native
// Kotlin/Compose app). Plain ES modules, no build step.
//
// Bundled clips come from boards.json, the format v2 reads too. Clips made in
// the app (recorded or uploaded) live in this browser's IndexedDB, along with
// edits to bundled clips. A clip's voice is a setting, never baked in: the
// original audio is kept and the voice is rendered from it on load.
//
// This file starts everything, builds every screen and hands each its
// elements and callbacks (the only composition root), and holds what spans
// screens: who is showing, which screen shows, ✏️ Edit sounds, 🧸 Kids on or
// off, the page keys and the footer. The rest is one module per concern;
// docs/architecture/shell.md "The composition root" says what each one gets
// from here, and docs/layout.md has a line for every file.

import { state, loadStorage, persist, setOverride, adoptStoredPeople, reIdStoredPeople, renamedId, removeRecord } from './state.js';
import { audio, voicesMade, fadeStop } from './audio.js';
import { meter, buildGrille } from './meter.js';
import { createSequencer } from './sequencer.js';
import { createBeatEngine } from './beat-engine.js';
import { people, person, currentPerson, clipsFor, anyClip, padColor, nextClipColor } from './board.js';
import { PLAYED } from './instruments.js';
import { groupOwn, UNGROUPED } from './groups.js';
import { validateManifest, isKitClip, boardTitle, soloPerson, SOLO_NAME, groupKit, overrideWithEmoji } from './model.js';

// The Common section's heading color in the beat maker's sound chooser: a
// neutral deep grey, as it is nobody's board.
const COMMON_COLOR = '#333040';
import { createDJ } from './dj.js';
import { createSong } from './song.js';
import { initPads, renderPads, renderPeople, makePad, makeAddPad, padFor, setProgress, tapPad, flash, hasChosen, clearChosen, cancelDrag, kitOpen, toggleKitGroup } from './pads.js';
import { initBulk } from './bulk.js';
import { initSheet, openSheet, setBeatTempo, isRecording } from './sheet.js';
import { initUpdate } from './update.js';
import { registerOffline } from './offline.js';
import { initPeople, refreshPeople, addPerson, deleteHere, beingDeleted, editLook, openPictures, storedLists } from './people.js';
import { initThings } from './things.js';
import { initWelcome, markNew, offerWelcome } from './welcome.js';
import { initWhoNow, openWhoNow, closeWhoNow, whoNowOpen } from './who-now.js';
import { initTips, tipsScreen } from './tips.js';
import { initNudge } from './nudge.js';
import { beatHasHits } from './firsts.js';
import { initCloud, needsPin, leftPerson, onCloud, pinGuards } from './cloud.js';
import { initCloudUI, askToOpen, shareSounds } from './cloud-ui.js';
import { renderPreview, renderAudio } from './share-render.js';
import { initBackups, storeLoaded, whatIsHere, savePersonBackup } from './backup-ui.js';
import { initSettingsUI, showSettings } from './settings-ui.js';
import { initKids, showKids, refreshKids, kidsPersonLeaving, kidsShowing, kidsBusy, askGrownUp, kidsKeydown, kidsKeyup } from './kids.js';
import { initHelp } from './help.js';
import { initFeedback } from './feedback.js';
import { initListen, showCard } from './listen-ui.js';
import { initLogSend } from './log-send.js';
import { watchTaps } from './tap-watch.js';
import { lately } from './finger.js';
import { initLeftover } from './leftover.js';
import { installErrorLog, logEvent, onLog } from './log.js';
import { onDialogOpen } from './dialogs.js';
import { createTelemetry, useTelemetry } from './telemetry.js';
import { trackPage, learnLabels } from './track-page.js';
import { setUsage } from './usage.js';
import { clearPlay } from './play-count.js';
import { $, showNotice, announce, fadeAway, trackSlimHead } from './ui.js';
import { initMiniDeck } from './mini-deck.js';
import { db } from './store.js';
import { newId, versionLabel, remember, recall, forget } from './util.js';
import { beatName, remixName, songName, funName, keptName } from './names.js';
import { adoptKidsBeats, isHiddenBeat } from './scratch.js';
import { onSetting, followPerson, getSetting } from './settings.js';
import { fitLine, pickerFor, refitLines } from './lines.js';
import { watchTips } from './tooltips.js';
import { pickBackdrop, showBackdrop } from './backdrop.js';
import { showSkin } from './skins.js';

const GRILLE_DOTS = 15;
const GRILLE_DOTS_LG = 24;

const el = {};
let seq = null;
let engine = null;  // the one beat engine (beat-engine.js): shared by Beats, 🎼 Song and 🧸 Kids
let song = null;  // 🎼 Song's screen
let dj = null;   // The keys: 🎤 Live's screen, and Beats' ⌨️ Keys (dj.js)

// ── Who is showing, Edit sounds, Beats ─────────────────────────────────

// A person with a PIN is asked for it each time they are opened (cloud-ui.js
// askToOpen). Starting up on one, someone without a PIN shows meanwhile; if
// everyone here has one, the board stays hidden until a PIN is typed.
// `again`: the person showing has just turned out to have a PIN new to this
// device (a sync, cloud.js keyRefused), so they are asked as on start-up.
function setPerson(id, { checked = false, again = false } = {}) {
  const p = person(id) || people()[0];
  if (!checked && (again || p.id !== state.personId) && needsPin(p.id)) {
    const fresh = !state.personId || again;
    const free = fresh && people().find((x) => !needsPin(x.id));
    // Everyone has a PIN: a kid picks themselves (Ben, 2026-10-24).
    if (fresh && !free) { startOver(); return; }
    if (free) setPerson(free.id, { checked: true });
    else if (!state.personId) showPerson(p);
    const locked = !state.personId || state.personId === p.id;
    if (locked) document.body.dataset.locked = '';
    askToOpen(p.id, { locked }).then((ok) => { if (ok) setPerson(p.id, { checked: true }); });
    return;
  }
  showPerson(p);
}

// 🤷 I don't know the PIN (cloud-ui.js): they go from this device, with
// everything of theirs. When they were the one on show, the board starts
// over (people.js refreshPeople).
async function dropLockedPerson(id) {
  const name = person(id)?.name;
  if (!await deleteHere(id)) return;   // this browser wouldn't: they stay, and a notice says so
  renderPeople();
  if (state.personId === id || whoNowOpen()) startOver(name ? `${name} is deleted from this device. Tap your picture.` : undefined);
  else refreshPeople();
}

// The person on show is being deleted (people.js deleteHere, at the
// grown-up's tap, before its awaits): the keys' take or beat recording, a
// take playing back, Kids' mic and tune all stop now, kept as theirs. The
// delete takes them with it, or keeps them all when the browser refuses.
function letGoOf(id) {
  if (id !== state.personId) return;
  dj?.personLeft();
  kidsPersonLeaving();
}

// 🎉 Play as them, once someone has come down from the cloud (cloud-ui.js):
// 👥 People closes, and they show on Pads.
function playAs(id) {
  const sheet = document.querySelector('#people-dialog');
  if (sheet?.open) sheet.close();
  renderPeople();
  setPerson(id);
  setScreen('pads');
}

// Nobody is on show (the one who was is deleted, or at start everyone has a
// PIN): 👋 Who's playing now? (who-now.js). The board behind it is drawn for
// the first person but hidden, and nothing shows it until a pick: while the
// chooser is open, that person is not "the one showing" (see onCloud below,
// people.js refreshPeople). The only one left, with no PIN, just shows;
// nobody left, a new person.
function startOver(note) {
  const left = people();
  // Before nobody is on show, so the keys let go of the one who was: kept
  // as theirs, unless they are gone (deleted here at the tap, `letGoOf`, or
  // in another tab), when nothing is saved under a dead id.
  if (state.personId) {
    const keep = !!person(state.personId);
    dj?.personLeft({ keep });
    kidsPersonLeaving({ keep });
  }
  state.personId = null;
  if (!left.length) { closeWhoNow(); addPerson(); return; }
  if (left.length === 1 && !needsPin(left[0].id)) { setPerson(left[0].id); return; }
  showPerson(left[0], { behind: true });
  document.body.dataset.locked = '';
  openWhoNow(note);
}

// A pick in 👋 Who's playing now?: their PIN first if they have one; closing
// the PIN pad comes back to the chooser.
function pickWhoNow(id) {
  if (!person(id)) { openWhoNow(); return; }
  if (!needsPin(id)) { setPerson(id, { checked: true }); return; }
  askToOpen(id).then((ok) => { if (ok) setPerson(id, { checked: true }); });
}

// `behind`: drawn hidden behind 👋 Who's playing now?, which stays open.
function showPerson(p, { behind = false } = {}) {
  if (!behind) closeWhoNow();
  delete document.body.dataset.locked;
  if (state.personId && state.personId !== p.id) {
    dj?.personLeft();   // a take or a recording into the beat ends as the person's own
    kidsPersonLeaving();   // and 🧸 Kids' mic or tune
    leftPerson(state.personId);
  }
  state.personId = p.id;
  followPerson();   // their own settings (Advanced, pad size…) take over
  el.root.style.setProperty('--board', p.color);
  el.themeColor.content = p.color;
  const title = boardTitle(people(), p);
  el.title.textContent = title;
  document.title = title;
  if (location.hash !== `#${p.id}`) history.replaceState(null, '', `#${p.id}`);
  remember('person', p.id);
  renderPeople();
  renderPads();
  adoptKidsBeat(p.id);
  seq?.setPerson(p.id);
  song?.setPerson(p.id);
  if (keysShow()) dj?.render();
  applyKids();
  refreshKids();
  for (const clip of clipsFor(p.id)) audio.load(clip).catch(() => {});
}

// 🧸 Kids' own beat from before ADR 0020 (`beat-kids-…`) becomes the
// person's scratch beat, or a beat of its own when the scratch already has
// hits (scratch.js adoptKidsBeats). Runs whenever a person shows, so one
// arriving from an older device or a backup is adopted too.
function adoptKidsBeat(pid) {
  const { put, remove } = adoptKidsBeats(state.savedBeats, pid, () => newId('beat'));
  if (!put.length && !remove.length) return;
  const gone = new Set([...remove, ...put.map((b) => b.id)]);
  state.savedBeats = [...state.savedBeats.filter((b) => !gone.has(b.id)), ...put];
  db.batch([...put.map((b) => ({ store: 'beats', put: structuredClone(b) })), ...remove.map((id) => ({ store: 'beats', del: id }))])
    .catch((err) => console.error('Adopting the 🧸 Kids beat failed:', err));
}

// 🧸 Kids (ADR 0019): a person on the Kids level sees the kid's screens
// (kids.js) in place of the regular app, until a grown-up answers the sum
// behind ⚙️. That lets the grown-up into the regular app until the page
// reloads; the level stays Kids (provisional, questions.md Q63). Choosing
// 🧸 Kids in Settings shows the kid's screens again.
let grownUp = false;
// The other way round: 🧸 in the header (or 🧸 Kids mode in the person menu)
// shows Kids to a Regular or Advanced person for this visit, their level
// unchanged; ⚙️ and the sum lead out again (Ben, 2026-10-22: a way "to
// toggle in between kid mode and out again"). For a Kids-level person a
// grown-up let out, 🧸 simply brings Kids back.
let kidsVisit = false;
function applyKids() {
  if (!seq || !state.personId) return;
  const on = kidsVisit || (getSetting('level') === 'kids' && !grownUp);
  if (on === kidsShowing()) return;
  if (on) {
    if (state.editing) setEditing(false);
    if (keysShow()) { dj.leave(); dj.shown(false); }   // the keys' ⏲️ ticks only on screen
    seq.stop();
    song.stop();
    audio.stopAll();
    dj?.stopReplay();   // a 🎬 take playing back: its hits still to come
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  }
  document.body.classList.toggle('kids', on);
  showKids(on);
  page?.screen(on ? 'kids' : state.screen);
  // Kids wrote the kid's beat (the scratch) behind the beat maker's back:
  // show it again, so a pill tapped next builds on the kid's squares.
  if (!on) { showView(); refitLines(); }
}
function enterKids() {
  grownUp = false;
  kidsVisit = getSetting('level') !== 'kids';
  applyKids();
}

function stepPerson(delta) {
  const list = people();
  const i = list.findIndex((p) => p.id === state.personId);
  setPerson(list[(i + delta + list.length) % list.length].id);
}

function setEditing(on) {
  if (on && state.screen !== 'pads') setScreen('pads');
  state.editing = on;
  cancelDrag();
  document.body.classList.toggle('editing', on);
  el.editToggle.setAttribute('aria-pressed', String(on));
  // ✏️ Edit sounds keeps " sounds" in its own span: the slim header (Q26)
  // shortens it to ✏️ Edit where a phone has no room beside its buttons.
  // The words are spans, so the band can drop them where they would collide (styles.css).
  el.editToggle.textContent = on ? '✅' : '✏️';
  el.editToggle.append(Object.assign(document.createElement('span'), { className: 'edit-word', textContent: on ? ' Done' : ' Edit' }));
  if (!on) el.editToggle.append(Object.assign(document.createElement('span'), { className: 'edit-more', textContent: ' sounds' }));
  showHint();
  if (on) audio.stopAll();
  renderPads();
}

// Four screens, chosen in the toolbar: 🔊 Pads, 🥁 Beats, 🎼 Song and 🎤 Live.
// Beats' ⌨️ Keys shows the keys under its beat. Edit sounds belongs to the
// pads screen.
export const SCREENS = ['pads', 'beats', 'song', 'live'];
// Two modes in the toolbar (ADR 0033; Ben, 2026-10-26): 🎉 Play is Pads and
// Live, 🛠️ Make is Beats and Song. The open mode shows both its screens; the
// other is one button that goes back to the screen it last had (remembered
// per device as `play-side` and `make-side`), else its first.
export const MODES = { play: ['pads', 'live'], make: ['beats', 'song'] };
export const modeOf = (screen) => Object.keys(MODES).find((m) => MODES[m].includes(screen)) ?? 'play';
export const sideOf = (mode, remembered) => (MODES[mode]?.includes(remembered) ? remembered : MODES[mode]?.[0] ?? 'pads');
// The screen each mode last had, in memory too (storage may be blocked).
const sides = { play: recall('play-side'), make: recall('make-side') };
// A screen remembered by an older copy: DJ is 🎤 Live now, and DJ's Beat
// Builder is Beats with ⌨️ Keys on (`dj-mode` was 'beat'). Anything unknown
// is Pads.
export function startScreen(screen, djMode) {
  if (screen === 'dj') return djMode === 'beat' ? { screen: 'beats', keys: true } : { screen: 'live' };
  return { screen: SCREENS.includes(screen) ? screen : 'pads' };
}
// Each screen's one-line how-to, in the page footer opposite the version.
// Worded for the device: a touch screen taps and holds; a mouse and keyboard
// clicks, holds or Shift-clicks, and the keys are real keys. `keys` is Beats
// with ⌨️ Keys on; `tiles-keys` and `tiles-live` the same with 👆 (ADR 0029).
const SCREEN_HINTS = {
  touch: {
    pads: 'Tap a pad to play it. Hold one to keep it going.',
    beats: 'Tap a pill to turn it on or off; hold it for a loud hit. ▶ Play to hear it.',
    keys: 'Tap a key: its sound gets a row. ● Record and play along to fill the beat.',
    live: 'Tap a key to play it. Hold one to keep it going. Tap ⏲️ in time to set the speed.',
    'tiles-keys': 'Tap a pad: its sound gets a row. ● Record and play along to fill the beat.',
    'tiles-live': 'Tap a pad to play it. Hold one to keep it going. Tap ⏲️ in time to set the speed.',
    song: 'Pick a beat, then tap a spot on a lane. Tap a block to repeat it or take it off.',
    editing: 'Editing: ✏️ changes a sound, 🗑️ deletes it. Tap sounds to select them, then act on them all. Hold and drag one to move it. ✅ Done to play.',
  },
  mouse: {
    pads: 'Click a pad to play it, or press 1–9. Hold one or Shift-click it to keep it going.',
    beats: 'Click an empty pill to light it; click lit ones to pick them, then drag. Hold one for a loud hit. ▶ Play to hear it.',
    keys: 'Click a key or press it: its sound gets a row. ● Record and play along to fill the beat.',
    live: 'Click a key, or press it on the keyboard. Hold one or Shift-click it to keep it going. Click ⏲️ in time to set the speed.',
    'tiles-keys': 'Click a pad: its sound gets a row. ● Record and play along to fill the beat.',
    'tiles-live': 'Click a pad to play it. Hold one or Shift-click it to keep it going. Click ⏲️ in time to set the speed.',
    song: 'Click a beat, then a spot on a lane. Click a block to repeat it or take it off.',
    editing: 'Editing: ✏️ changes a sound, 🗑️ deletes it. Click sounds to select them, then act on them all. Drag one, or Alt+← →, to move it. ✅ Done to play.',
  },
};
// A mouse or trackpad, as the keys' keyboard check reads it.
const pointerFine = () => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
export const screenHint = (screen, editing, fine = pointerFine()) => SCREEN_HINTS[fine ? 'mouse' : 'touch'][editing ? 'editing' : screen];
// The footer how-to: the screen's, or Edit sounds' while editing.
function showHint() {
  const name = state.screen === 'beats' && keysOn ? 'keys' : state.screen;
  el.screenHint.textContent = screenHint(keysShow() && dj?.touching() ? `tiles-${name}` : name, state.editing);
}

// Beats' ⌨️ Keys (ADR 0017): the keys under the open beat, with ● Record,
// as Beats with ⌨️ Keys had. Remembered per device ('beat-keys'), in memory
// too (storage may be blocked).
let keysOn = recall('beat-keys') === '1';
// The keys are on screen: on 🎤 Live, or on Beats with ⌨️ Keys on.
const keysShow = () => state.screen === 'live' || (state.screen === 'beats' && keysOn);
// The view the beat maker shows the open beat in (sequencer.js show).
const beatView = () => (state.screen === 'live' ? 'live' : keysOn ? 'dj' : 'beats');

function setScreen(name) {
  if (!SCREENS.includes(name)) name = 'pads';
  if (name !== 'pads' && state.editing) setEditing(false);
  if (keysShow() && state.screen !== name) dj.leave();   // a recording ends with the screen
  const leftBeats = state.screen === 'beats' && name !== 'beats';
  if (leftBeats) seq.stop();
  if (state.screen === 'song' && name !== 'song') song.stop();
  state.screen = name;
  if (leftBeats) seq.endLock();   // ⇆ unlocks with the screen
  for (const s of SCREENS) document.body.classList.toggle(`screen-${s}`, s === name);
  for (const b of el.screens.querySelectorAll('[data-screen]')) b.setAttribute('aria-pressed', String(b.dataset.screen === name));
  for (const m of el.screens.querySelectorAll('[data-mode]')) m.classList.toggle('open', m.dataset.mode === modeOf(name));
  sides[modeOf(name)] = name;
  remember(`${modeOf(name)}-side`, name);
  showView();
  el.song.hidden = name !== 'song';
  if (name === 'song') song.render();  // beats may have changed too; shown first, so its lanes can fill the width
  el.pads.hidden = name !== 'pads';
  el.padsBar.hidden = name !== 'pads';
  remember('screen', name);
  if (!kidsShowing()) page?.screen(name);
  tipsScreen(name);   // a one-time tip for this screen, if it has one (tips.js)
}

// What Beats and Live show: Beats' rows (⌨️ Keys off), or the keys panel,
// under the open beat on Beats (Keys on) and on its own on Live. The beat
// maker shows the one open beat in that view, read again in case it changed.
function showView() {
  const name = state.screen;
  const keys = keysShow();
  if (name === 'beats' || name === 'live') seq.show(beatView());
  if (keys) dj.setMode(name === 'live' ? 'free' : 'beat');
  document.body.classList.toggle('keys-on', name === 'beats' && keysOn);
  for (const b of document.querySelectorAll('[data-beat-keys]')) b.setAttribute('aria-pressed', String(keysOn));
  el.seq.hidden = name !== 'beats' || keysOn;
  el.dj.hidden = !keys;
  el.dj.setAttribute('aria-label', name === 'live' ? 'Live' : 'Beat maker with keys');
  if (keys) { dj.render(); dj.renderGrid(); }
  showHint();
  dj?.shown(keys && !kidsShowing());   // behind 🧸 Kids the keys are not on screen: their ⏲️ waits
}

// ⌨️ Keys on Beats: on or off. Not while recording into the beat (● Record's
// ■ Stop ends that first), as DJ's Live · the keys view switch waited.
function setKeys(on) {
  if (on === keysOn || dj.recording()) return;
  if (keysShow()) dj.leave();
  keysOn = on;
  remember('beat-keys', on ? '1' : '');
  if (state.screen === 'beats') showView();
}

// Lines that stay on one line and give way step by step as room runs out
// (lines.js): the toolbar, Beats' bars · time signature · swing, Beat
// Builder's bars · time signature beside Record and the tempo, and the
// Keyboard keys in Settings.
function fitLines() {
  for (const sel of document.querySelectorAll('.seq-pick')) pickerFor(sel.closest('.seq-barsel'), sel);
  fitLine(document.querySelector('.toolbar'), ['fit-tight', 'fit-short', 'fit-stack']);
  fitLine($('#seq-shape-line'), ['fit-tight', 'fit-short', 'fit-pick', 'fit-nosig'], $('#seq-deck'));
  const deck = document.querySelector('.dj-bar');
  fitLine(deck.querySelector('.beat-shape'), ['fit-tight', 'fit-short', 'fit-pick', 'fit-nosig'], deck);
  fitLine($('#groove-how'), ['fit-stack']);   // keeps its padding: stacks before it hugs the frame
}

// ── Version ────────────────────────────────────────────────────────────

// version.json is stamped by the deploy (every push to main); without it this is a dev copy.
// The version's parts. The corner says only when it went live, in the
// device's time ("Updated Oct 19, 9:27 PM"), a button that opens ⚙️ Settings
// at About (settings-ui.js listens for [data-about]); About says it too, with
// the release and the commit, a link to it on GitHub ("Updated Oct 20,
// 12:01 AM · 1.0.217 · f52728b"; Ben, 2026-10-19 and 2026-10-20). A dev copy says so.
function versionParts(label, { inAbout = false } = {}) {
  const make = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
  const when = label.updated ? `Updated ${label.updated}` : label.date || label.text;
  if (!inAbout) {
    const button = make('button', 'ver-date', when);
    button.type = 'button';
    button.dataset.about = '';
    button.setAttribute('aria-label', `About Noodle Pads: ${when}`);
    return [button];
  }
  const sep = () => make('span', 'ver-sep', ' · ');
  const release = label.release ? [sep(), make('span', 'ver-release', label.release)] : [];
  if (!label.url) return [make('span', 'ver-date', when), ...release];
  const sha = make('a', 'ver-sha', label.commit);
  sha.setAttribute('href', label.url);
  sha.setAttribute('target', '_blank');
  sha.setAttribute('rel', 'noopener');
  sha.setAttribute('aria-label', `Build ${label.commit} on GitHub`);
  return [make('span', 'ver-date', when), ...release, sep(), sha];
}

async function loadVersion() {
  let found = null;
  try {
    const res = await fetch('version.json', { cache: 'no-cache' });
    if (res.ok) found = await res.json();
  } catch { /* no version file: a dev copy */ }
  const label = versionLabel(found);
  state.version = label.version;
  telemetry?.setVersion(label.version);
  // "Updated Oct 19, 9:27 PM" in the corner; About adds the commit.
  el.version.replaceChildren(...versionParts(label));
  el.aboutVersion?.replaceChildren(...versionParts(label, { inAbout: true }));
}

// ── Events ─────────────────────────────────────────────────────────────

// ⏹️ Stop all: every sound, the beat and the song, and both ⏲️ Click tracks off.
// `keepClicks` (🧸 Kids' ⏹️): quiet for now, the grown-up's saved ⏲️ choices kept.
function stopEverything({ keepClicks = false } = {}) {
  audio.stopAll();
  dj?.stopReplay();
  seq.stop();
  song.stop();
  if (keepClicks) return;
  seq.clickOff();
  dj?.clickOff();
}

// Space is Stop all almost everywhere (Ben, 2026-10-12): not while typing,
// and not on a focused button, link or the like, which Space presses for
// keyboard users. Shift+Space stays a pill's loud hit. Pure, for the tests.
export function spaceStops(e) {
  if (e.key !== ' ' || e.shiftKey || e.repeat) return false;
  return !e.target?.closest?.('input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="button"], [role="switch"], [role="slider"], [role="option"]');
}

function bindEvents() {
  // Any gesture unlocks audio, so the first pad tap plays instantly: the
  // first one makes the context, and each after resumes it should the phone
  // have stopped it meanwhile (a call, a locked screen), so the first tap
  // back plays too. Coming back to the page asks for it at once.
  const unlock = () => audio.wake();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') audio.revive(); });
  window.addEventListener('pageshow', () => audio.revive());

  el.stopAll.addEventListener('click', stopEverything);
  el.editToggle.addEventListener('click', () => setEditing(!state.editing));
  el.screens.addEventListener('click', (e) => {
    const b = e.target.closest('[data-screen]');
    if (b) { setScreen(b.dataset.screen); return; }
    const mode = e.target.closest('[data-mode-open]')?.dataset.modeOpen;
    if (mode) setScreen(sideOf(mode, sides[mode]));
  });
  // ⌨️ Keys in the beat bar, with Keys off (Beats' rows) and on (the keys).
  for (const b of document.querySelectorAll('[data-beat-keys]')) b.addEventListener('click', () => setKeys(!keysOn));
// ⇆ locks the pills in whichever view shows (sequencer.js setLock; Ben,
// 2026-10-19: it no longer switches ⌨️ Keys off). Not while recording.
for (const b of document.querySelectorAll('[data-move-open]')) b.addEventListener('click', () => { if (!dj.recording()) seq.toggleLock(); });
  // The keys: the number row and the letter rows play them, only while they are on screen.
  document.addEventListener('keyup', (e) => { if (kidsShowing()) kidsKeyup(e); else if (keysShow()) dj.keyup(e); });

  window.addEventListener('hashchange', () => {
    const id = renamedId(location.hash.slice(1));
    if (person(id) && id !== state.personId) setPerson(id);
  });

  // Page-level keys: Esc stops everything, ← → change person, 1-9 play the
  // first nine pads on 🔊 Pads. Where the keys are shown (🎤 Live, 🥁 Beats
  // with ⌨️ Keys) the number row and the letters play the keys instead. They
  // stand down behind a dialog, in a text field, and when a control (the
  // beat pills, say) already used the key.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    // 🧸 Kids has its own few keys; none of the regular ones (← → change person).
    if (kidsShowing()) { kidsKeydown(e); return; }
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (keysShow() && dj.keydown(e)) return;
    if (e.key === 'Escape' && keysShow() && dj.escape()) return;
    // Esc that a control used (overflow.js closing a row menu, pill-select.js
    // letting go of a pick) is defaultPrevented above. Those two listen on the
    // document too, and that works only because they are registered first
    // (createSequencer runs before bindEvents, in start()).
    if (e.key === 'Escape') { if (hasChosen()) clearChosen(); else stopEverything(); return; }
    if (spaceStops(e)) { e.preventDefault(); stopEverything(); return; }
    if (e.key === 'ArrowRight') { stepPerson(1); return; }
    if (e.key === 'ArrowLeft') { stepPerson(-1); return; }
    if (/^[1-9]$/.test(e.key) && !state.editing && state.screen === 'pads') {
      const clip = clipsFor(state.personId)[Number(e.key) - 1];
      if (!clip) return;
      const pad = padFor(clip.id);
      if (pad) flash(pad);
      tapPad(clip);
    }
  });
}

// ── Start ──────────────────────────────────────────────────────────────

async function loadManifest() {
  let res;
  try {
    res = await fetch('boards.json', { cache: 'no-cache' });
  } catch {
    throw new Error('boards.json could not be fetched. Open the app with `just serve`, not by double-clicking index.html.');
  }
  if (!res.ok) throw new Error(`boards.json didn't load (HTTP ${res.status}). Start the app with \`just serve\` from the repo.`);
  let m;
  try { m = await res.json(); } catch (err) { throw new Error(`boards.json isn't valid JSON: ${err.message}`); }
  const problem = validateManifest(m);
  if (problem) throw new Error(`boards.json can't be used: ${problem}.`);
  return m;
}

// The people sections closed in the beat sound chooser (kept on this device,
// in memory too, for when storage is off). They start open.
let closedSections = null;
function closedPeople() {
  if (!closedSections) {
    let ids = [];
    try { ids = JSON.parse(recall('chooser-closed')); } catch { /* none yet */ }
    closedSections = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
  }
  return closedSections;
}
const toggleSet = (set, id) => (set.has(id) ? set.delete(id) : set.add(id));

// A beat or a DJ take made into a sound: a new pad on the current board,
// like a recording, stored as WAV and kept at its exact length.
// Emoji for made sounds: the first one not already on this board, so a
// beat's sounds can be told apart by picture (then the kind's own emoji).
const MADE_EMOJI = ['🎛️', '🎚️', '📻', '💿', '📀', '🎼', '🪩', '🛸', '🚀', '🌋', '🧨', '🎆', '🌀', '🔮', '🧃', '🍩'];
function freshEmoji(personId, preferred) {
  const used = new Set(clipsFor(personId, { includeHidden: true }).map((c) => c.emoji));
  return [preferred, ...MADE_EMOJI].find((e) => !used.has(e)) ?? preferred;
}

async function addMadeSound({ label, blob, emoji }) {
  const p = currentPerson();
  const clip = {
    id: newId('user'),
    personId: p.id,
    label,
    emoji: freshEmoji(p.id, emoji),
    color: nextClipColor(p.id),
    voice: 'normal',
    blob,
    mime: blob.type,
    created: Date.now(),
    exact: true,
  };
  state.userClips.push(clip);
  await persist('clips', clip);
  renderPads();
  return { ...clip, source: 'user' };
}

// Every saved beat (🗂️ My beats, and the scratch beats) and every song
// (🗂️ My songs), as the beat maker, 🎼 Song and 🎧 From a song keep them.
const beatLibrary = {
  list: (personId) => state.savedBeats
    .filter((b) => b.personId === personId)
    .sort((a, b) => b.saved - a.saved),
  put: (beat) => {
    state.savedBeats = [...state.savedBeats.filter((b) => b.id !== beat.id), beat];
    persist('beats', structuredClone(beat));
  },
  remove: async (id) => {
    state.savedBeats = state.savedBeats.filter((b) => b.id !== id);
    await removeRecord('beats', id, 'That beat');
  },
};
const songBook = {
  list: (personId) => state.songbook.filter((s) => s.personId === personId).sort((a, b) => b.saved - a.saved),
  put: (record) => {
    state.songbook = [...state.songbook.filter((s) => s.id !== record.id), record];
    persist('songbook', structuredClone(record));
  },
  remove: async (id) => {
    state.songbook = state.songbook.filter((s) => s.id !== id);
    await removeRecord('songbook', id, 'That song');
  },
};

// The beat maker, wired to the board: its sounds, its saved beat, its library.
function makeSequencer() {
  return createSequencer({
    el: {
      play: $('#seq-play'), bpm: $('#seq-bpm'), bpmOut: $('#seq-bpm-out'), bpmType: $('#seq-bpm-type'), tempoKey: $('#seq-tempo-key'), tempoBox: $('#seq-tempo'),
      rows: $('#seq-rows'), moveBar: $('#seq-move'), add: $('#seq-add'), addTune: $('#seq-add-tune'), roll: $('#roll'), top: $('#seq-deck'), controls: $('#seq-shape-line'), djPlay: $('#dj-play'),
      empty: $('#seq-empty'), noRows: $('#seq-no-rows'),
      chooser: $('#chooser'), chooserTitle: $('#chooser-title'), chooserGrid: $('#chooser-grid'),
      chooserOk: $('#chooser-ok'), chooserTools: $('#chooser-tools'), chooserMelody: $('#chooser-melody'),
      chooserRate: $('#chooser-rate'), tuneWho: $('#tune-who'), tuneWhoList: $('#tune-who-list'),
      library: $('#library'), beatBars: document.querySelectorAll('.beat-bar'), chipLines: document.querySelectorAll('[data-beat-chips]'),
      mixer: $('#mixer'), mixerStrips: $('#mixer-strips'), mixerButtons: document.querySelectorAll('[data-mixer]'),
      libNote: $('#lib-note'), libList: $('#lib-list'), libEmpty: $('#lib-empty'),
      libSound: $('#lib-sound'), libFile: $('#lib-file'), bars: $('#seq-bars'), sigs: $('#seq-sigs'),
      swing: $('#seq-swing'), shape: $('#seq-shape'), click: $('#seq-click'),
      grooves: $('#grooves'), grooveList: $('#groove-list'), grooveNote: $('#groove-note'), grooveHow: $('#groove-how'), grooveHint: $('#groove-hint'),
    },
    audio,
    meter,
    engine,
    clips: () => clipsFor(state.personId),
    ready: () => !!currentPerson(),   // a restore may be mid-way
    onTempo: () => { audio.syncLoops(); if (keysShow()) dj?.showSetup(); },
    // A beat's hit: keys with that sound light in time with it.
    onHit: (clipId, ms) => { if (keysShow()) dj?.flashClip(clipId, ms); },
    onSteps: (shown) => { if (keysShow()) dj?.steps(shown); },
    // The keys panel draws the open beat only while it shows.
    onBeatChange: () => { if (keysShow()) dj?.renderGrid(); song?.render(); },
    onPlay: () => song?.stop(),
    onGroovesOpen: () => showCard(),   // 🎧 From a song's card, for this person's level
    // ⇆ Move on or off: the ⇆ keys show it.
    onStop: () => dj?.beatStopped(),
    groups: groupsForChooser,
    isGroupOpen: (groupId) => (groupId.startsWith('person:') ? !closedPeople().has(groupId) : kitOpen().has(groupId)),
    toggleGroup: (groupId) => {
      if (groupId.startsWith('person:')) { toggleSet(closedPeople(), groupId); remember('chooser-closed', JSON.stringify([...closedPeople()])); return; }
      toggleKitGroup(groupId);
      renderPads();
    },
    clipById: (id) => anyClip(id),
    colorOf: (clip) => padColor(clip.color),
    makePad,
    // A fun name for a beat about to be saved, not one already in the library.
    beatName: (taken) => beatName(taken),
    keptName: (groove, taken) => keptName(groove, taken),
    remixName: (beat) => remixName(beat, clipsFor(state.personId, { includeHidden: true }).map((c) => c.label)),
    makeAddPad,
    addClip: (made) => addMadeSound({ emoji: '🥁', ...made }),
    announce: (text) => announce(text),
    // The one open beat (ADR 0017): the whole beat in `patterns`, as Beats
    // always kept it. Nothing open is no record. Beats with ⌨️ Keys kept a
    // second one as `beatId` on the person's deck (ADR 0008); nothing reads
    // it now, and the deck drops it the next time it saves. That beat is in
    // the library, so it stays in 🗂️ My beats.
    opened: (personId) => state.patterns.get(personId),
    setOpen: (personId, pattern) => {
      if (pattern) {
        state.patterns.set(personId, pattern);
        persist('patterns', structuredClone(pattern));
      } else if (state.patterns.delete(personId)) {
        removeRecord('patterns', personId);   // refused: after a reload the beat that was open may open again
      }
    },
    kitIds: () => state.manifest.kit.map((k) => k.id),   // for beat files: kit sounds travel, recorded ones don't
    library: beatLibrary,
  });
}

// A sound's picture, changed from the emoji chooser: on the sound itself, so
// its pad, DJ key and beat rows all follow. Only the emoji changes: a
// recorded sound's record, or a boards.json/kit sound's override.
async function setClipEmoji(clipId, emoji) {
  const own = state.userClips.find((c) => c.id === clipId);
  if (own) {
    own.emoji = emoji;
    await persist('clips', own);
  } else {
    const base = people().flatMap((p) => clipsFor(p.id, { includeHidden: true, allPresets: true })).find((c) => c.id === clipId);
    if (!base) return;
    const file = state.manifest.kit.find((k) => k.id === base.kitId) ?? state.manifest.people.flatMap((p) => p.clips).find((c) => c.id === clipId);
    await setOverride(overrideWithEmoji({ id: clipId, emoji: file?.emoji ?? base.emoji }, state.overrides.get(clipId), emoji));
  }
  renderPads();
  seq?.render();
  dj?.render();
  dj?.renderGrid();
}

// Song mode: a person's song of saved beats, played and rendered by the beat maker.
function makeSong() {
  const made = createSong({
    el: {
      name: $('#song-name'), empty: $('#song-empty'), keep: $('#song-keep'),
      rename: $('#song-rename'), newSong: $('#song-new'), open: $('#song-open'),
      songs: $('#songs'), songsList: $('#songs-list'), songsEmpty: $('#songs-empty'), songsNote: $('#songs-note'),
      play: $('#song-play'), sound: $('#song-sound'),
      tempo: $('#song-tempo'), tempoDown: $('#song-tempo-down'), tempoUp: $('#song-tempo-up'),
      tempoField: $('#song-tempo-field'), tempoOpen: $('#song-tempo-open'), tempoKey: $('#song-tempo-key'), tempoBox: $('#song-tempo-box'), tempoSlider: $('#song-tempo-slider'),
      tempoSheet: $('#tempo-sheet'), tempoTitle: $('#tempo-title'), tempoListView: $('#tempo-list-view'), tempoEditView: $('#tempo-edit-view'),
      tempoBase: $('#tempo-base'), tempoMarks: $('#tempo-marks'), tempoAdd: $('#tempo-add'),
      tempoBar: $('#tempo-bar'), tempoBpm: $('#tempo-bpm'), tempoHint: $('#tempo-hint'),
      tempoRemove: $('#tempo-remove'), tempoBack: $('#tempo-back'), tempoDone: $('#tempo-done'),
      strip: $('#song-beats'), lanes: $('#song-lanes'),
      sel: $('#song-sel'), selText: $('#song-sel-text'), less: $('#song-less'), more: $('#song-more'), remove: $('#song-remove'), selClose: $('#song-sel-close'),
      addLane: $('#song-add-lane'), stepUndo: $('#song-step-undo'),
      laneSheet: $('#lane-sheet'), laneTitle: $('#lane-title'), laneName: $('#lane-name'), laneGrid: $('#lane-grid'),
    },
    audio,
    meter,
    seq,
    // Beats a song can use: not the scratch (ADR 0020: 💾 Keep it first).
    beats: (personId) => state.savedBeats.filter((b) => b.personId === personId && !isHiddenBeat(b)).sort((a, b) => b.saved - a.saved),
    load: (personId) => state.songs.get(personId),
    save: (record) => {
      state.songs.set(record.personId, record);
      persist('songs', record);
    },
    close: (personId) => {
      if (state.songs.delete(personId)) removeRecord('songs', personId);   // refused: the song that was open may open again
    },
    songs: songBook,
    songName: (taken) => songName(taken),
    announce: (text) => announce(text),
    // The song's own name, unless a pad already has it; then a remix of it.
    soundLabel: (name) => {
      const taken = clipsFor(state.personId, { includeHidden: true }).map((c) => c.label);
      return taken.some((t) => t.toLowerCase() === name.toLowerCase()) ? remixName(name, taken) : name;
    },
    addClip: (made) => addMadeSound({ emoji: '🎼', ...made }),
    // A beat's color in the strip and on its blocks: its first sound's, as its pattern chip.
    beatColor: (beat) => { const clip = anyClip(beat.rows?.[0]?.clipId); return clip ? padColor(clip.color) : null; },
    onHit: (clipId, ms) => { if (keysShow()) dj?.flashClip(clipId, ms); },
  });
  // A beat deleted or renamed in 🗂️ My beats shows in the song when it closes.
  $('#library').addEventListener('close', () => made.render());
  return made;
}

// Who is on the board once storage has loaded. People named by an older
// boards.json are kept as people added here (state.js adoptStoredPeople),
// and a board with no one on show gets one person with a fun name and a
// picture (model.js soloPerson): that is how a new device starts, as
// boards.json lists no people. Nobody is called "Me" any more (Ben,
// 2026-10-11): an older copy's "Me" gets a fun name too, staying the app's
// own default until someone edits it. The new person is stored only when
// storage is open; otherwise it lasts for this visit.
async function settlePeople() {
  if (db.handle) {
    const kept = await adoptStoredPeople();
    if (kept) logEvent('person', { adopted: kept });
    // Everyone gets a random id (state.js reIdStoredPeople): a plain one was
    // a kid's name, and ids go to the cloud and into the address.
    try {
      followRenames(await reIdStoredPeople());
    } catch (err) {
      console.error('Giving people new ids failed:', err);
      logEvent('error', { storage: String(err.message || err.name) });
    }
  }
  for (const p of [...state.peopleEdits.values()]) {
    if (!p.added || p.name !== SOLO_NAME) continue;
    const taken = people({ includeHidden: true }).map((x) => x.name);
    const named = { ...soloPerson(p.id, p.created), ...p, name: funName(taken), fun: true, solo: !p.edited };
    state.peopleEdits.set(p.id, named);
    if (db.handle) await persist('people', named);
  }
  if (people().length) return;
  const me = soloPerson(newId('p'));
  state.peopleEdits.set(me.id, me);
  if (db.handle) await persist('people', me);
  logEvent('person', { soloStart: true });
  markNew(me.id, { device: true });   // made from nothing: welcomed once the app is drawn, with the cloud offered (welcome.js)
}

// After people here got new ids at start: the remembered person, the closed
// sections of the beat sound chooser, and the person showing follow, and the
// address stops naming the old id.
function followRenames(pairs) {
  if (!pairs?.length) return;
  const to = new Map(pairs);
  const was = recall('person');
  if (to.has(was)) remember('person', to.get(was));
  const closed = closedPeople();
  for (const [from, next] of to) {
    if (closed.delete(`person:${from}`)) closed.add(`person:${next}`);
  }
  remember('chooser-closed', JSON.stringify([...closed]));
  if (to.has(state.personId)) {
    const next = to.get(state.personId);
    state.personId = null;
    setPerson(next, { checked: true });
  }
}

// Usage events (ADR 0026): screens, dialogs, controls, content, settings,
// errors and speed all come from track-page.js; the play counts it sends are
// kept by play-count.js (pads.js, kids.js, dj.js, roll, song.js).
let telemetry = null;   // usage events in the shared standard (telemetry.js)
let page = null;        // where they come from (track-page.js)
function startUsage() {
  telemetry = useTelemetry(createTelemetry({
    screen: () => page?.current(),
  }));
  learnLabels(document.body);   // before anyone's sounds or names are drawn
  page = trackPage({
    telemetry, onLog, onDialogOpen, root: document.body, doc: document, win: globalThis,
    // The sound's delay in ms, or null before any sound has played.
    latency: () => (audio.ctx ? ((audio.ctx.outputLatency || 0) + (audio.ctx.baseLatency || 0)) * 1000 : null),
  });
  // Counts and visits that older copies of the app left in this device's
  // storage (ADR 0027): nothing sends them any more.
  forget('uses');
  forget('visits');
}

// The usage switch (settings.js sendUsage), from storage and whenever it
// changes. Off: nothing is counted, kept or sent, and what waited goes.
function followUsage() {
  const apply = (on) => {
    setUsage(on);
    if (on) return;
    telemetry?.clear();
    clearPlay();
  };
  apply(getSetting('sendUsage'));
  onSetting('sendUsage', apply);
}

async function start() {
  // Too old a browser: too-old.js has shown its notice instead (the browser floor).
  if (document.documentElement.hasAttribute('data-too-old')) return;
  installErrorLog();
  Object.assign(el, {
    root: document.documentElement,
    themeColor: $('meta[name="theme-color"]'),
    title: $('#board-title'),
    grille: $('#grille'),
    version: $('#version'),
    aboutVersion: $('#about-version'),
    pads: $('#pads'),
    editToggle: $('#edit-toggle'),
    padsBar: $('#pads-bar'),
    screens: $('.screens'),
    dj: $('#dj'),
    seq: $('#seq'),
    stopAll: $('#stop-all'),
    song: $('#song'),
    screenHint: $('#screen-hint'),
  });
  showBackdrop(el.root, pickBackdrop(globalThis.location?.search ?? ''));
  startUsage();
  buildGrille(el.grille, GRILLE_DOTS);
  buildGrille($('#rec-grille'), GRILLE_DOTS_LG);
  try {
    state.manifest = await loadManifest();
  } catch (err) {
    showNotice(err.message);
    return;
  }
  // If saved data arrives late (another tab was holding the database), redraw
  // with it. `started` guards against that racing the first draw below.
  let started = false;
  await loadStorage({
    onLateOpen: async () => {
      await settlePeople();
      if (started) setPerson(person(state.personId) ? state.personId : people()[0].id);
    },
  });
  await settlePeople();
  followUsage();

  meter.grille = el.grille;
  meter.setProgress = setProgress;
  audio.on.started = () => meter.run();
  meter.onLevel = (l) => { if (keysShow()) dj?.level(l); };

  initPads({ openSheet, onPerson: setPerson, onLooping: (id, on) => dj?.looping(id, on) });
  initSheet();
  initBulk({ share: shareSounds });   // ✏️ Edit sounds with sounds chosen: Move, Color · picture, Voice, Share, Delete
  initPeople({ showPerson: setPerson, startOver, letGoOf });
  initWhoNow({ pick: pickWhoNow, someoneNew: addPerson });
  // 🗂️ See all, from a profile's count line: everything of one person's,
  // each row playing in place; a beat, song or take is recorded as a share's
  // preview is, at the device's own rate.
  initThings({
    lists: storedLists,
    anyone: (id) => people({ includeHidden: true }).find((p) => p.id === id),
    preset: (kitId) => (state.manifest.kit ?? []).find((k) => k.id === kitId) ?? null,
    clipById: (cid, personId) => clipsFor(personId, { includeHidden: true, allPresets: true }).find((c) => c.id === cid) ?? anyClip(cid),
    sampleClips: (personId) => [
      ...clipsFor(personId, { includeHidden: true }).filter((c) => c.source === 'user').sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 1),
      ...clipsFor(personId).filter((c) => c.source !== 'user').slice(0, 1),
    ],
    render: (kind, id, personId, rate) => renderAudio(kind, id, {
      seq,
      rate,
      clipById: (cid) => anyClip(cid),
      beatById: (bid) => state.savedBeats.find((b) => b.id === bid),
      songById: (sid) => state.songbook.find((s) => s.id === sid)
        ?? [...state.songs.values()].find((s) => s.personId === personId && String(s.id ?? '') === sid),
      takeById: (tid) => state.takes.find((t) => t.id === tid),
    }),
    backup: savePersonBackup,
  });
  // 👋 Who's playing? for a new person (ADR 0028). A card's sound is the
  // person's copy of a ready-made one.
  initWelcome({
    play: (kitId) => {
      const clip = clipsFor(state.personId, { includeHidden: true, allPresets: true }).find((c) => c.kitId === kitId);
      if (clip) audio.play(clip);
    },
    edit: editLook,
    pictures: openPictures,
  });
  // One-time tips (ADR 0028): Beats' needs to know the open beat is empty.
  initTips({
    keysOn: () => keysOn,
    beatHasHits: () => beatHasHits(seq?.beat()),
  });
  initCloudUI({ refresh: () => { renderPeople(); refreshPeople(); }, addPerson, dropPerson: dropLockedPerson, backup: savePersonBackup, play: playAs });
  // A sync that finds a PIN new to this device on the person showing: the
  // board goes behind the PIN pad until it is typed (Ben, 2026-10-19).
  onCloud(() => {
    if (state.personId && !whoNowOpen() && needsPin(state.personId)) setPerson(state.personId, { again: true });
  });
  initBackups();
  // ⚙️ while 🧸 Kids shows asks a grown-up sum first (kids.js).
  initSettingsUI({
    gate: () => { if (!kidsShowing()) return false; askGrownUp(); return true; },
    onKids: () => { grownUp = false; kidsVisit = false; applyKids(); },
  });
  // 🧸 at the top, and 🧸 Kids mode at the end of the person menu: Kids, now.
  document.querySelector('#kids-open').addEventListener('click', enterKids);
  document.querySelector('#people').addEventListener('click', (e) => { if (e.target.closest?.('[data-kids-open]')) enterKids(); });
  initFeedback();   // ⚙️ Settings → About → Feedback, behind the grown-up sum
  trackSlimHead();
  initMiniDeck();   // 🥁 Beats' play bar tucks into the slim bar at the top; its Esc listener runs before bindEvents' page keys (mini-deck.js)
  initHelp();
  initLogSend();
  // A finger tap that plays nothing goes in the log, for a problem report.
  watchTaps({
    doc: document, win: window, lately, voices: voicesMade, log: logEvent,
    audioState: () => audio.ctx?.state ?? null,
    isLooping: (id) => audio.isLooping(id),
    loops: () => [...audio.playing.values()].filter((v) => v.loop).length,
  });
  engine = createBeatEngine({ audio, clipById: (id) => anyClip(id) });
  seq = makeSequencer();
  globalThis.noodleTestSeq?.(seq);   // a test's way in to the beat maker (tests/beat-ready.test.mjs); the page never sets it
  setBeatTempo(() => seq.beat()?.bpm);   // Echo's 🥁 On the beat follows the open beat
  song = makeSong();
  // Pads that loop while a beat plays start on its bars and keep its time.
  audio.grid = () => seq.grid();
  dj = createDJ({
    el: { keys: $('#dj-keys'), touch: $('#dj-touch'), inputs: [$('#ke-input'), $('#te-input')], tabs: $('#dj-tabs'), layout: $('#dj-layout-keys'), legend: $('#dj-legend'), panel: $('#dj'),
      change: $('#dj-change'), changeTop: $('#dj-change-top'), changeBars: [$('#dj-change-bar'), $('#dj-change-tempo')],
      keysEdit: { dialog: $('#keys-edit'), layouts: $('#ke-layouts'), saveLine: $('#ke-save-line'), saveName: $('#ke-save-name'), saveOk: $('#ke-save-ok'), saveCancel: $('#ke-save-cancel'),
        ownLine: $('#ke-own-line'), rename: $('#ke-rename'), remove: $('#ke-delete'), keys: $('#ke-keys'), note: $('#ke-note'), undo: $('#ke-undo'), reset: $('#ke-reset'),
        groups: $('#ke-groups'), inst: $('#ke-inst'), picks: $('#ke-picks'), picksHint: $('#ke-picks-hint'), clearPicks: $('#ke-clear-picks') },
      touchEdit: { dialog: $('#touch-edit'), layouts: $('#te-layouts'), saveLine: $('#te-save-line'), saveName: $('#te-save-name'), saveOk: $('#te-save-ok'), saveCancel: $('#te-save-cancel'),
        ownLine: $('#te-own-line'), rename: $('#te-rename'), remove: $('#te-delete'), bands: $('#te-bands'), bandsTitle: $('#te-bands-title'), grids: $('#te-grids'), note: $('#te-note'), undo: $('#te-undo'), add: $('#te-add'), addHint: $('#te-add-hint') },
      record: $('#dj-record'), status: $('#dj-status'), done: $('#dj-done'), nameFlash: $('#dj-name-flash'),
      donePlay: $('#dj-done-play'), doneUndo: $('#dj-done-undo'), doneSound: $('#dj-done-sound'),
      trying: $('#dj-trying'), tryingText: $('#dj-trying-text'), tryingStop: $('#dj-trying-stop'),
      takeLine: $('#dj-take-line'), doneRename: $('#dj-done-rename'), doneClose: $('#dj-done-close'), takeName: $('#dj-take-name'), takeLength: $('#dj-take-length'),
      takesOpen: $('#dj-takes-open'), takes: $('#takes'), pictures: $('#pictures'), picturesTitle: $('#pictures-title'), picturesGrid: $('#pictures-grid'), picturesNote: $('#pictures-note'), takesList: $('#takes-list'), takesEmpty: $('#takes-empty'),
      click: $('#dj-click'), overlap: $('#dj-overlap'), beatClick: $('#dj-beat-click'), play: $('#dj-play'), tempo: $('#dj-tempo'), grid: $('#dj-grid'),
      size: $('#dj-size'), tempoKey: $('#dj-tempo-key'), clickKey: $('#dj-click-key'),
      beatbar: $('#dj-beatbar'), count: $('#dj-count'), noRows: $('#dj-no-rows'), deck: $('.dj-bar'), setup: $('#dj-setup'), clickTempo: $('#dj-click-tempo'), clickBpm: $('#dj-click-bpm'), clickBpmOut: $('#dj-click-bpm-out'), bpm: $('#dj-bpm'), bpmType: $('#dj-bpm-type'), bpmSlider: $('#dj-bpm-slider'), bars: $('#dj-bars'), sigs: $('#dj-sigs') },
    deps: {
      personId: () => state.personId,
      personColor: () => person(state.personId)?.color ?? '#333040',
      clipsFor: (id, opts) => clipsFor(id, opts),
      clipById: (id) => anyClip(id),
      savedDeck: (id) => state.decks.get(id),
      tap: (clip, opts) => tapPad(clip, opts),
      loop: (clip) => audio.loop(clip),
      isLooping: (id) => audio.isLooping(id),
      now: () => audio.context().currentTime,
      // How late what a kid hears comes out of the speaker (kids play to it).
      latency: () => Math.min(0.2, (audio.context().outputLatency || 0) + (audio.context().baseLatency || 0)),
      seq,
      colorOf: (clip) => padColor(clip.color),
      sampleRate: () => audio.context().sampleRate,
      loadSound: (clip) => audio.load(clip),
      addSound: (made) => addMadeSound({ emoji: '🎛️', ...made }),
      soundNames: () => clipsFor(state.personId, { includeHidden: true }).map((c) => c.label),
      playOnce: (clip, opts) => audio.play(clip, opts),
      stopClip: (clip) => audio.stop(clip.id),
      bookPlay: (loaded, at, end) => audio.book(loaded, at, end),   // a take played back, on the audio clock
      cutVoice: (voice) => fadeStop(voice, audio.context().currentTime),   // a take's play booked ahead: it never sounds
      announce: (text) => announce(text),
      notice: (text) => showNotice(text),   // the banner over the top, which fades by itself
      takes: (pid) => state.takes.filter((t) => t.personId === pid),
      setEmoji: setClipEmoji,
      boardClips: (clipId) => { const owner = people().find((p) => clipsFor(p.id, { allPresets: true }).some((c) => c.id === clipId)); return owner ? clipsFor(owner.id, { allPresets: true }) : []; },
      saveTake: (take) => {
        state.takes = [...state.takes.filter((t) => t.id !== take.id), take];
        persist('takes', take);
      },
      deleteTake: (id) => {
        state.takes = state.takes.filter((t) => t.id !== id);
        removeRecord('takes', id, 'That take');
      },
      // Saved key layouts (✏️ Layout with ⌨️ Keys, ADR 0013).
      layouts: (pid) => state.layouts.filter((l) => l.personId === pid),
      saveLayout: (layout) => {
        state.layouts = [...state.layouts.filter((l) => l.id !== layout.id), layout];
        persist('layouts', layout);
      },
      deleteLayout: (id) => {
        state.layouts = state.layouts.filter((l) => l.id !== id);
        removeRecord('layouts', id, 'That key layout');
      },
      // Saved 👆 touch layouts (✏️ Layout with 👆 Pads, ADR 0029).
      touchLayouts: (pid) => state.touchLayouts.filter((l) => l.personId === pid),
      saveTouchLayout: (layout) => {
        state.touchLayouts = [...state.touchLayouts.filter((l) => l.id !== layout.id), layout];
        persist('touchLayouts', layout);
      },
      deleteTouchLayout: (id) => {
        state.touchLayouts = state.touchLayouts.filter((l) => l.id !== id);
        removeRecord('touchLayouts', id, 'That touch layout');
      },
      kitGroups: () => state.manifest.kitGroups ?? [],
      inputChanged: () => showHint(),   // ⌨️ Keys | 👆 Pads: the footer's how-to follows
      // The kid's own groups of their sounds (groups.js), for ✏️ Layout's picker.
      ownGroups: (pid) => groupOwn(clipsFor(pid).filter((c) => !c.kit), state.orders.get(pid)?.groups)
        .filter((g) => g.id !== UNGROUPED),
      // `more`: other fields to set (`mine`, ⭐ My keys); the rest are kept,
      // except the open beat older copies kept for DJ's Beat Builder (`beatId`,
      // ADR 0008), gone with ADR 0017's one open beat.
      saveDeck: (pid, keys, more = {}) => {
        const { beatId, ...kept } = state.decks.get(pid) ?? {};
        const record = { ...kept, ...more, personId: pid, keys };
        state.decks.set(pid, record);
        persist('decks', record);
      },
    },
  });
  // 🎧 From a song: its card in 💃 Grooves and its sheet (listen-ui.js).
  initListen({
    audio,
    seq,
    song,
    personId: () => state.personId,
    clipById: (id) => anyClip(id),
    library: beatLibrary,
    songs: songBook,
    engine,
    showScreen: (name) => setScreen(name),
    stopAll: () => stopEverything(),
    refresh: () => { seq.render(); song.render(); },
    announce: (text) => announce(text),
  });
  initKids({
    engine,
    personId: () => state.personId,
    stopAll: () => stopEverything({ keepClicks: true }),   // Kids' ⏹️: the whole app quiet, the grown-up's ⏲️ choices kept
    clips: (opts, pid = state.personId) => clipsFor(pid, opts),
    // A person shown (a deleted one from boards.json is stored hidden), not
    // being deleted; `deletion` waits for one being deleted to go or stay.
    isPerson: (pid) => !!person(pid) && !beingDeleted.has(pid),
    deletion: (pid) => beingDeleted.get(pid) ?? null,
    colorOf: (clip) => padColor(clip.color),
    nextColor: (pid = state.personId) => nextClipColor(pid),
    // A recording, saved as the sound sheet saves one; `changed`: its voice changed.
    saveClip: async (clip, { changed = false } = {}) => {
      if (!changed) state.userClips.push(clip);
      await persist('clips', clip);
      renderPads();
    },
    ownClip: (id) => state.userClips.find((c) => c.id === id),
    // The kid's one beat is their scratch beat (ADR 0020), in the library
    // with every other beat but never listed.
    beats: (pid) => state.savedBeats.filter((b) => b.personId === pid),
    saveBeat: (beat) => {
      state.savedBeats = [...state.savedBeats.filter((b) => b.id !== beat.id), beat];
      persist('beats', structuredClone(beat));
    },
    // The sum ends a visit into Kids as well: then no grown-up is "in", so a
    // later change of level to Kids shows Kids at once.
    grownUp: () => { grownUp = !kidsVisit; kidsVisit = false; applyKids(); showSettings(); },
  });
  onSetting('level', () => applyKids());
  // The person's pad skin on every pad (skins.js): it follows a switch of
  // person, a loaded backup and the cloud, as every setting does.
  showSkin(el.root, getSetting('padSkin'));
  onSetting('padSkin', (id) => showSkin(el.root, id));
  bindEvents();
  watchTips(document.body);   // a tooltip on nearly every control (Ben)

  const wanted = renamedId(location.hash.slice(1) || recall('person'));
  setPerson(person(wanted) ? wanted : people()[0].id);
  started = true;
  loadVersion();
  registerOffline();   // opens with no network after one visit, and installs as an app (sw.js)
  // "🆕 An update for Noodle Pads is ready.": waits while anything records, plays or
  // is open, so a reload never loses an unsaved sheet or a take (update.js).
  initUpdate({
    bar: $('#update-bar'),
    reloadBtn: $('#update-reload'),
    closeBtn: $('#update-close'),
    loaded: () => state.version,
    busy: () => isRecording() || !!document.querySelector('dialog[open]') || seq.playing() || song.playing() || dj.busy() || kidsBusy()
      || [...audio.playing.values()].some((v) => v.loop),
  });
  initNudge();   // 🎛️ Want more knobs? in the update bar's place (ADR 0028)
  onSetting('advancedBeats', () => {
    if (currentPerson()) renderPads();   // the sharps and flats come and go with Advanced (a restore may be mid-way)
    if (keysShow()) dj?.render();
    refitLines();
  });
  // Who plays Notes, Chords and Bass (ADR 0030): the group shows that
  // instrument's notes, ready to play at once.
  for (const [group, { setting }] of Object.entries(PLAYED)) {
    onSetting(setting, () => {
      if (!currentPerson()) return;
      renderPads();
      if (keysShow()) dj?.render();
      for (const clip of clipsFor(state.personId).filter((c) => c.kit && c.group === group)) audio.load(clip).catch(() => {});
    });
  }
  fitLines();
  // Every notice fades by itself. The banner over the top of the screen fades
  // on its own (ui.js showBanner); the take card after a take, when it shows,
  // and the status lines in sheets, when they get words.
  if (typeof MutationObserver === 'function') {
    const take = $('#dj-done');
    if (take) new MutationObserver(() => { if (!take.hidden) fadeAway(take, 10000); }).observe(take, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    for (const line of document.querySelectorAll('.lib-note, .set-note')) {
      new MutationObserver(() => { if (line.textContent.trim()) fadeAway(line, 6000, { clear: true }); }).observe(line, { childList: true, characterData: true, subtree: true });
    }
  }
  // The last screen (older copies of the app remembered only "beats", and
  // later "dj", with its mode in "dj-mode").
  const first = startScreen(recall('screen') || (recall('beats') ? 'beats' : 'pads'), recall('dj-mode'));
  if (first.keys) { keysOn = true; remember('beat-keys', '1'); }
  setScreen(first.screen);
  applyKids();
  page?.level(getSetting('level'));   // the level this load starts at, for the usage events
  offerWelcome(state.personId);   // a device's first person, made just now (settlePeople)
  initLeftover();   // sounds an older copy saved on this address, under the old database name
  // Everyone in the cloud syncs now, and after changes (cloud.js); a share's
  // preview is recorded by the beat maker, as Save as a sound does.
  initCloud({
    storeLoaded,
    whatIsHere,
    renderShare: (kind, id, { leave } = {}) => renderPreview(kind, id, {
      seq,
      leave,
      clipById: (cid) => anyClip(cid),
      beatById: (bid) => state.savedBeats.find((b) => b.id === bid),
      songById: (sid) => state.songbook.find((s) => s.id === sid),
    }),
  });
}

// The sound chooser's sections: the shared kit once (this board's copies, so
// its renames and hides apply), then each person's own sounds, this board
// first. Someone else with a PIN not typed on this visit is left out: their
// sounds are read only past their PIN (Ben, 2026-10-24).
export function groupsForChooser() {
  const list = people().filter((p) => p.id === state.personId || !pinGuards(p.id));
  const ordered = [list.find((p) => p.id === state.personId), ...list.filter((p) => p.id !== state.personId)].filter(Boolean);
  // The kit is in its groups; each can open and close, shared with the pads screen.
  const kit = groupKit(clipsFor(state.personId).filter(isKitClip), state.manifest.kitGroups)
    .map((g) => ({ id: `kit-${g.id}`, groupId: g.id, name: `${g.emoji ?? ''} ${g.name}`.trim(), plain: g.name, color: COMMON_COLOR, clips: g.clips, collapsible: true }));
  // Each person's own sounds open and close too; they start open.
  return [...kit, ...ordered.map((p) => ({ id: p.id, groupId: `person:${p.id}`, name: p.name, color: p.color, clips: clipsFor(p.id).filter((c) => !isKitClip(c)), collapsible: true }))]
    .filter((g) => g.clips.length);
}

// Resolves once the app is drawn and every control is wired. The tests wait
// for it before their first tap: a fixed wait was too short on a busy machine.
export const ready = start();
