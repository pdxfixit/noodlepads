// Help (❓): the picture reference. The pure parts (which tab opens, what is
// shown, that every drawn label is a real one), then the real app on the
// stand-in page: the button, the dialog, and the tab for the screen you are on.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { HELP, helpSectionFor, shownItems } from '../web/help.js';
import { VOICES } from '../web/voices.js';

const webDir = new URL('../web/', import.meta.url);

test('Help opens on the tab for the screen you are on, and Pads for anything else', () => {
  assert.equal(helpSectionFor('pads'), 'pads');
  assert.equal(helpSectionFor('beats'), 'beats');
  assert.equal(helpSectionFor('live'), 'live');
  assert.equal(helpSectionFor('song'), 'song');
  assert.equal(helpSectionFor(undefined), 'pads');
  assert.equal(helpSectionFor('nowhere'), 'pads');
});

test('Help covers every part of the app, each with something to show', () => {
  assert.deepEqual(HELP.map((s) => s.id), ['pads', 'sounds', 'beats', 'song', 'live', 'settings']);
  for (const s of HELP) assert.ok(shownItems(s).length >= 4, s.id);
});

// A new toolbar screen must get its own part of Help, so ❓ never opens on
// the wrong tab and a whole screen can't go unexplained.
test('every screen in the toolbar has its own part of Help, in toolbar order', () => {
  const html = readFileSync(new URL('index.html', webDir), 'utf8');
  const screens = [...html.matchAll(/data-screen="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(screens.length >= 4);
  assert.deepEqual(HELP.filter((s) => s.screen).map((s) => s.screen), screens);
  for (const screen of screens) assert.equal(helpSectionFor(screen), screen);
});

// The controls Help must explain. Each label must still be in the app (so a
// rename fails here) and somewhere in Help, drawn or in a sentence (so a
// line can't be dropped or left behind). Add a line here with a new control.
const MUST_MENTION = [
  // Pads
  '✏️ Edit sounds', '✅ Done', 'Stop all', '👥 People', '⬆️',
  // Making a sound
  'New sound', 'Record', 'Choose a file', '✨ Make one', '🎲 Surprise me', '👂 Hold: before', 'Save sound', 'All emoji', 'Layers', 'Deeper ↔ higher', 'Slower ↔ faster', '+ Add a layer', '🔈', 'Backwards', 'Warble', '⭐ Keep as mine', 'My voices ▾', '↩️ Normal', '⤢ Turn into knobs', '↩️ The old way', 'Muffled ↔ Bright', 'Crunch', 'Stutter',
  '🎲 Surprise steps', '⚙️ Advanced', '⤢', '🥁 On the beat', 'Smooth', 'Buzzy', 'Hiss', '🎵 Find its note', '➕ Mix with another sound', '✂️ Trim and edit', '✂️ Ends', '📐 Fades',
  '👆 Select part', '🔄 Backwards', '🔇 Silence it', '🔊 Louder', '🔉 Quieter', '✂️ Keep only this', '🧩 Chop into pads', '🧩 Make pads',
  // Beats
  '🆕 New', '🗂️ My beats', '🗂️ My songs', '▶ Play', '⏲️', 'Straight', 'Swing', 'Shuffle', '4/4', '+ Add a row', 'loudness', '🧹?',
  '💃 Grooves', '📝 Into my scratch', '➕ Add to this beat', '💾 Keep', '🔊 Make the open beat a sound', '📥 Load a beat file', '🔔 Overlap', '🎹 Tune', '🎹 Add a tune', '♯ All notes', '½ Half pills', '🎚️ Mixer', 'All on',
  '⌨️', '● Record', '↩️ My beat',
  // Live
  '⏲️ Click track', 'keep tapping…', '✏️ Edit keys', '↺ Reset keys', '⭐ Save this layout', '⭐ My keys', '✕ Unpick all', '🎬 Takes',
  '🔊 Make a sound', 'Make another?', '⌨️ Keyboard',
  // Song
  '🎼 Song', '➕ Add a lane', '▶ Play song', '🔊 Save as a sound', '↩️ Undo',
  // Settings
  '💾 Save a backup', '📂 Load a backup', 'Advanced', '🧸 Kids', 'Regular', '📮 Send problem reports',
  // The cloud
  '☁️ Open from the cloud', '☁️ Cloud', '🎲 Pick a name', '🔒 Set a PIN', 'Remember on this device', '🙈 Forget on this device', '🔄 Sync now',
  '🔗 Share…', '🔗 Shared with me', '📴 Offline (this device only)', '☁️ Put back in the cloud', "🔓 What's private (not much)",
];

const appText = () => {
  const html = readFileSync(new URL('index.html', webDir), 'utf8')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const code = readdirSync(webDir).filter((f) => f.endsWith('.js') && f !== 'help.js')
    .map((f) => readFileSync(new URL(f, webDir), 'utf8')).join('\n');
  return `${html}\n${code}`;
};

test('Help mentions every key control, by the label the app really shows', () => {
  const app = appText();
  const help = HELP.flatMap((s) => shownItems(s).flatMap((i) => [i.text, ...i.pic.flatMap((p) => p.t ?? [])])).join('\n');
  assert.deepEqual(MUST_MENTION.filter((t) => !app.includes(t)), [], 'not in the app any more: update the list and Help');
  assert.deepEqual(MUST_MENTION.filter((t) => !help.includes(t)), [], 'in the app but not in Help');
});

test('Beats Help explains 💃 Grooves with ⌨️ Keys on: a groove behind you, in the scratch, ↩️ My beat, and 💾 Keep', () => {
  const line = shownItems(HELP.find((s) => s.id === 'beats')).find((i) => i.pic.some((p) => p.t === '💃 Grooves') && /Keys on/.test(i.text));
  assert.ok(line, 'a Beats line draws 💃 Grooves for the keys');
  assert.ok(line.pic.some((p) => p.t === '↩️ My beat'));
  assert.match(line.text, /behind you/);
  assert.match(line.text, /scratch beat/);
  assert.match(line.text, /💾 Keep saves it, named after the groove/);
});

// ADR 0017: the keys are on 🎤 Live and on Beats with ⌨️ Keys; Help never
// names DJ, Freestyle or Beat Builder again.
test('Help names the four tabs and ⌨️ Keys, never DJ, Freestyle or Beat Builder', () => {
  const words = HELP.flatMap((s) => [s.tab, s.title, ...shownItems(s).flatMap((i) => [i.text, ...i.pic.flatMap((p) => p.t ?? [])])]).join('\n');
  assert.doesNotMatch(words, /\bDJ\b|Freestyle|Beat Builder/);
  assert.deepEqual(HELP.filter((s) => s.screen).map((s) => s.tab), ['🔊 Pads', '🥁 Beats', '🎼 Song', '🎤 Live']);
  assert.ok(shownItems(HELP.find((s) => s.id === 'beats')).some((i) => i.pic.some((p) => p.t === '⌨️ Keys')));
});

test('features still being built are kept out of sight until they land', () => {
  for (const s of HELP) assert.ok(shownItems(s).every((i) => !i.soon));
});

// Every label Help draws must be a label the app really shows, so a renamed
// button fails here instead of leaving Help out of date. Features still to
// come are skipped: their labels don't exist yet.
test('every button Help draws uses a label the app really has', () => {
  const app = appText();
  const missing = [];
  for (const s of HELP) {
    for (const item of shownItems(s)) {
      for (const p of item.pic) {
        if (p.k === 'voice') { if (!VOICES.some((v) => v.id === p.id)) missing.push(`${s.id}: voice ${p.id}`); continue; }
        const labels = p.k === 'seg' ? p.t : ['pad', 'key', 'pills', 'word', 'eg', 'person', 'count'].includes(p.k) ? [] : [p.t];
        for (const t of labels) if (!app.includes(t)) missing.push(`${s.id}: ${t}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('Advanced-only items say so', () => {
  const adv = HELP.flatMap((s) => shownItems(s).filter((i) => i.adv));
  assert.ok(adv.some((i) => i.pic[0].k === 'seg' && i.pic[0].t.includes('2×')), 'a row\'s speed needs Advanced');
  // 🔔 Overlap is for every level since 2026-10-12 (Ben): on the row's line, and on Live.
  const bells = HELP.flatMap((s) => shownItems(s)).filter((i) => i.pic[0].k === 'lit' && /🔔/.test(i.pic[0].t));
  assert.equal(bells.length, 2);
  assert.ok(bells.every((i) => !i.adv));
  assert.ok(adv.some((i) => /Half pills/.test(i.pic[0].t)), 'half-pill notes need Advanced (ADR 0023)');
  // 🎹 tune rows are for everyone since the piano roll (ADR 0023).
  const tune = HELP.flatMap((s) => shownItems(s)).filter((i) => /🎹 (Tune|Add a tune)/.test(i.pic[0].t ?? ''));
  assert.equal(tune.length, 2);
  assert.ok(tune.every((i) => !i.adv));
  // 🎼 Song is for everyone since ADR 0017: none of its lines needs Advanced.
  assert.ok(shownItems(HELP.find((s) => s.id === 'song')).every((i) => !i.adv));
});

// ── The real app ──────────────────────────────────────────────────────

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const pressedTab = () => $('#help-tabs').querySelectorAll('[data-help]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.help);
const shownSections = () => $('#help-body').querySelectorAll('.help-sec').filter((s) => !s.hidden).map((s) => s.dataset.help);

test('❓ sits up top beside ⚙️ Settings, named for screen readers, not in the toolbar', () => {
  const button = $('#help-open');
  assert.equal(button.getAttribute('aria-label'), 'Help');
  assert.ok($('.title-tools').contains(button));
  assert.ok(!$('.toolbar').contains(button));
});

test('❓ opens Help on the Pads tab from the Pads screen', () => {
  $('#help-open').dispatch('click');
  assert.equal($('#help').open, true);
  assert.deepEqual(pressedTab(), ['pads']);
  assert.deepEqual(shownSections(), ['pads']);
  $('#help').close();
});

test('❓ opens Help on the Beats tab from Beats, and on Live from Live', () => {
  $('#beats-toggle').dispatch('click');
  $('#help-open').dispatch('click');
  assert.deepEqual(pressedTab(), ['beats']);
  assert.deepEqual(shownSections(), ['beats']);
  $('#help').close();
  $('#live-tab').dispatch('click');
  $('#help-open').dispatch('click');
  assert.deepEqual(shownSections(), ['live']);
  $('#help').close();
  $('#pads-tab').dispatch('click');
});

test('a tab shows its part of Help', () => {
  $('#help-open').dispatch('click');
  $('#help-tabs').querySelector('[data-help="settings"]').dispatch('click');
  assert.deepEqual(pressedTab(), ['settings']);
  assert.deepEqual(shownSections(), ['settings']);
  $('#help').close();
});

test('Help draws the pictures and the sentences, with Advanced marked', () => {
  const beats = $('#help-beats');
  const items = beats.querySelectorAll('.help-item');
  assert.equal(items.length, shownItems(HELP.find((s) => s.id === 'beats')).length);
  assert.ok(beats.querySelectorAll('.help-pic').every((p) => p.getAttribute('aria-hidden') === 'true'));
  assert.ok(beats.querySelectorAll('.help-btn').some((b) => b.textContent === '💃 Grooves'));
  assert.ok(beats.querySelectorAll('.help-adv').length >= 3);
});

test('Live\'s Help says the number row plays the keys too', () => {
  const live = HELP.find((s) => s.id === 'live');
  assert.ok(shownItems(live).some((i) => /number row \(1 to 0\)/.test(i.text) && i.pic.some((p) => p.letter === '1')));
});
