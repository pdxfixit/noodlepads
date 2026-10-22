// 👋 The welcome for a new person (ADR 0028; Ben, 2026-10-16): one dialog
// over the screen, in two steps.
//
// 1. Who's playing? Three big picture cards, each drawn as a pad in the
//    person's pad skin, set their level: 🧸 Little noodler (Kids), 🎵 Tap and
//    make beats (Regular), 🎛️ Show me everything (Advanced). No ages on them
//    (Ben: "drop"). A tap is a real gesture, so it plays a ready-made sound
//    (the audio may start there), sets the level and moves on. A quiet Skip
//    keeps Regular and ends the welcome. A grown-up picks; the kid sees
//    pictures, and leaving 🧸 Kids still needs the grown-up sum.
// 2. Pick your stage name. A big face on the person's color with their name
//    and 🎲; a few fun names (names.js, as 👥 People's Pick a name deals
//    them; 🎲 deals more); a row of pictures ending in … (the full chooser);
//    the person colors; ▶ Let's play and Skip. Each tap changes them at once
//    (the screen takes the color as you tap), through the profile sheet's own
//    paths (people.js editLook, openPictures), so sync, a PIN's guard and the
//    fun-name rules hold. Skip puts back the ones the app gave. 🧸 Kids picks
//    only a picture and a color and keeps its given name. Kids' screens come
//    after this step: switching to them closes every open dialog (app.js
//    applyKids), so the Kids level is set as the welcome ends.
//
// Who is new. Only the two places that make a person from nothing mark
// one, in memory: app.js settlePeople, for a device's automatic first
// person (model.js soloPerson), and people.js addPerson (➕ in 👥 People,
// 👋 Someone new on the PIN pad). A person read from storage, pulled from
// the cloud or loaded from a backup never passes through either, so nobody
// who exists before this ships, or arrives from elsewhere, is ever
// welcomed. Nothing is stored: a reload before the welcome shows skips it,
// as Skip would.

import { state } from './state.js';
import { person, people } from './board.js';
import { setSetting, LEVELS } from './settings.js';
import { makePad } from './pads.js';
import { PERSON_COLORS, PERSON_COLOR_NAMES, PICTURES } from './model.js';
import { nameChoices } from './names.js';
import { avatarBadge } from './cloud-ui.js';
import { openDialog, setupDialog } from './dialogs.js';
import { announce } from './ui.js';
import { logEvent } from './log.js';
import { firstStepsOn } from './firsts.js';
import { showTipsAgain } from './tips.js';

// The three cards: the level, the picture and words on the pad, its pad
// color (boards.json palette) and the ready-made sound a tap plays (a kit id).
export const LEVEL_CARDS = [
  { level: 'kids', emoji: '🧸', label: 'Little noodler', color: 'yellow', sound: 'pop', words: '🧸 Kids: big pictures, no reading' },
  { level: 'regular', emoji: '🎵', label: 'Tap and make beats', color: 'teal', sound: 'clap', words: 'Regular' },
  { level: 'advanced', emoji: '🎛️', label: 'Show me everything', color: 'pink', sound: 'chord-c', words: 'Advanced: every tool' },
];
export const STAGE_NAMES = 6;      // fun names dealt at a time
export const STAGE_PICTURES = 7;   // pictures in the row, before …

const el = {};
let deps = { play: () => {}, edit: async () => false, pictures: () => {} };
const fresh = new Set();   // people made this visit and not yet welcomed
// The open welcome: whose, the step, the level waiting for its end (Kids),
// the looks the app gave (for Skip), and the names and pictures dealt.
let now = null;

// A person just made from nothing (see above).
export function markNew(id) {
  if (id) fresh.add(id);
}

// Opens the welcome for `id` when they are new and not yet welcomed, once.
// True when it opened.
export function offerWelcome(id) {
  if (!fresh.has(id) || !el.dialog || !firstStepsOn()) return false;
  fresh.delete(id);
  if (!person(id)) return false;
  now = { id, step: 'who', kids: false, was: null, names: [], pics: [] };
  showStep();
  logEvent('welcome', { shown: true });
  openDialog(el.dialog, { focus: el.cards.querySelector('[data-level]') });
  return true;
}

// ⚙️ Settings → About → Show the welcome again (as isopix has, Ben, 2026-10-16):
// the welcome opens once more for the person showing, and their one-time
// tips and dots come back (tips.js showTipsAgain), so a new person's whole
// first run can be seen again. Picking a level or a name changes them as the
// first time did; Skip keeps what they have. True when it opened.
export async function replayWelcome() {
  const id = state.personId;
  if (!el.dialog || !person(id)) return false;
  await showTipsAgain();
  now = { id, step: 'who', kids: false, was: null, names: [], pics: [] };
  showStep();
  logEvent('welcome', { shown: true });
  openDialog(el.dialog, { focus: el.cards.querySelector('[data-level]') });
  return true;
}

export const welcomeOpen = () => !!el.dialog?.open;

function showStep() {
  const stage = now?.step === 'stage';
  el.who.hidden = stage;
  el.stage.hidden = !stage;
  el.title.textContent = !stage ? "Who's playing?" : now.kids ? 'Pick your picture' : 'Pick your stage name';
  el.dialog.classList.toggle('wl-on-stage', stage);
  if (stage) renderStage();
}

// ── 1. Who's playing? ──

async function pick(level) {
  if (!LEVELS.includes(level) || !now || now.step !== 'who') return;
  deps.play(LEVEL_CARDS.find((c) => c.level === level).sound);
  logEvent('welcome', { level });
  const p = person(now.id);
  if (!p) { end(); return; }
  now.kids = level === 'kids';
  now.was = { name: p.name, fun: p.fun, avatar: p.avatar, color: p.color };
  now.step = 'stage';
  now.names = dealNames(p);
  now.pics = dealPictures(p.avatar);
  showStep();
  (now.kids ? el.pics : el.names).querySelector('button')?.focus();
  if (!now.kids && state.personId === now.id) await setSetting('level', level);
}

// ── 2. Pick your stage name ──

const othersNames = (id) => people({ includeHidden: true }).filter((x) => x.id !== id).map((x) => x.name);
// Fresh fun names nobody here has, as Pick a name deals them (its special
// names stay in 👥 People's list).
const dealNames = (p) => nameChoices([...othersNames(p.id), p.name], STAGE_NAMES).slice(0, STAGE_NAMES);
// Their own picture first, then others picked at random.
function dealPictures(own, random = Math.random) {
  const rest = PICTURES.filter((x) => x !== own);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...(own ? [own] : []), ...rest].slice(0, STAGE_PICTURES);
}

const make = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text === undefined ? {} : { textContent: text }) });
function button(className, text, data = {}) {
  const b = make('button', className, text);
  b.type = 'button';
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  return b;
}

function renderStage() {
  const p = now && person(now.id);
  if (!p) return;
  // A picture chosen in the full chooser joins the row, first.
  if (p.avatar && !now.pics.includes(p.avatar)) now.pics = [p.avatar, ...now.pics].slice(0, STAGE_PICTURES);
  el.dialog.style.setProperty('--c', p.color);
  el.face.replaceChildren(avatarBadge(p, 'wl-badge'));
  el.name.textContent = p.name;
  el.dice.hidden = now.kids;
  el.names.hidden = now.kids;
  el.names.replaceChildren(...(now.kids ? [] : now.names.map((name) => {
    const li = make('li', '');
    const b = button('wl-pick', name, { name });
    b.setAttribute('aria-pressed', String(name === p.name));
    li.append(b);
    return li;
  })));
  const more = button('wl-pic wl-more', '…', { more: '' });
  more.setAttribute('aria-label', 'Every picture');
  el.pics.replaceChildren(...now.pics.map((pic) => {
    const b = button('wl-pic', pic, { pic });
    b.setAttribute('aria-label', `Picture ${pic}`);
    b.setAttribute('aria-pressed', String(pic === p.avatar));
    return b;
  }), more);
  for (const b of el.colors.children) b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === p.color.toLowerCase()));
}

async function onStageClick(e) {
  const t = e.target.closest?.('button');
  if (!t || !now || now.step !== 'stage') return;
  const id = now.id;
  if (t === el.dice) {
    const p = person(id);
    if (p) now.names = dealNames(p);
    renderStage();
    el.names.querySelector('button')?.focus();
    return;
  }
  if (t.dataset.name !== undefined && !now.kids) {
    if (await deps.edit(id, { name: t.dataset.name, fun: true })) announce(`Now called ${t.dataset.name}.`);
  } else if (t.dataset.pic !== undefined) {
    await deps.edit(id, { avatar: t.dataset.pic });
  } else if (t.dataset.more !== undefined) {
    deps.pictures(id);   // the chooser's close redraws this step (initWelcome)
    return;
  } else if (t.dataset.color !== undefined) {
    await deps.edit(id, { color: t.dataset.color });
  } else if (t === el.go) {
    end();
    return;
  } else if (t === el.stageSkip) {
    await putBack();
    logEvent('welcome', { skipped: true });
    end();
    return;
  } else {
    return;
  }
  renderStage();
  // The redraw replaced the button: focus its new copy.
  const again = [...el.stage.querySelectorAll('button')].find((b) => ['name', 'pic', 'color'].some((k) => b.dataset[k] !== undefined && b.dataset[k] === t.dataset[k]));
  again?.focus({ preventScroll: true });
}

// Skip on step 2: the name, picture and color the app gave come back.
async function putBack() {
  const p = person(now.id);
  const was = now.was;
  if (!p || !was) return;
  const changes = {};
  for (const k of ['name', 'avatar', 'color']) if (p[k] !== was[k]) changes[k] = was[k];
  if (changes.name) changes.fun = was.fun;
  if (Object.keys(changes).length) await deps.edit(now.id, changes);
}

// The welcome ends (▶ Let's play, Skip, Esc): a Kids pick takes the person
// to Kids' screens now.
function end() {
  if (el.dialog.open) el.dialog.close();
  else finish();
}
function finish() {
  const was = now;
  now = null;
  if (was?.kids && state.personId === was.id) setSetting('level', 'kids').catch((err) => console.error('Setting the level failed:', err));
}

export function initWelcome(hooks = {}) {
  deps = { ...deps, ...hooks };
  Object.assign(el, {
    dialog: document.querySelector('#welcome'),
    title: document.querySelector('#welcome-title'),
    who: document.querySelector('#wl-who'),
    cards: document.querySelector('#wl-cards'),
    skip: document.querySelector('#wl-skip'),
    stage: document.querySelector('#wl-stage'),
    face: document.querySelector('#wl-face'),
    name: document.querySelector('#wl-name'),
    dice: document.querySelector('#wl-dice'),
    names: document.querySelector('#wl-names'),
    pics: document.querySelector('#wl-pics'),
    colors: document.querySelector('#wl-colors'),
    go: document.querySelector('#wl-go'),
    stageSkip: document.querySelector('#wl-stage-skip'),
  });
  if (!el.dialog) return;
  setupDialog(el.dialog);
  el.cards.replaceChildren(...LEVEL_CARDS.map((c) => {
    const pad = makePad({ id: `welcome-${c.level}`, emoji: c.emoji, label: c.label, color: c.color });
    pad.classList.add('wl-card');
    pad.dataset.level = c.level;
    pad.setAttribute('aria-label', `${c.emoji} ${c.label}: ${c.words}`);
    return pad;
  }));
  el.colors.replaceChildren(...PERSON_COLORS.map((c) => {
    const b = button('', '', { color: c });
    b.style.setProperty('--sw', c);
    b.setAttribute('aria-label', PERSON_COLOR_NAMES[c] || c);
    b.setAttribute('aria-pressed', 'false');
    return b;
  }));
  el.cards.addEventListener('click', (e) => {
    const card = e.target.closest('[data-level]');
    if (card) pick(card.dataset.level);
  });
  // Skip on step 1 keeps Regular (nothing to set) and ends the welcome.
  el.skip.addEventListener('click', () => { logEvent('welcome', { skipped: true }); end(); });
  el.stage.addEventListener('click', onStageClick);
  // ⚙️ Settings → About → Show the welcome again: Settings closes, the welcome opens.
  document.querySelector('#welcome-again')?.addEventListener('click', () => {
    document.querySelector('#settings-dialog')?.close();
    replayWelcome().catch((err) => console.error('Showing the welcome again failed:', err));
  });
  document.querySelector('#avatar-dialog')?.addEventListener('close', () => { if (now?.step === 'stage') renderStage(); });
  el.dialog.addEventListener('close', finish);
}
