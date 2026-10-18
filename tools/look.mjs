#!/usr/bin/env node
// `just look`: checks the app at every width in a private headless Chrome.
//
// Each agent gets its own Chrome (throwaway profile) and its own dev server on
// a free port, so agents never fight over the shared Browser pane. For each
// width it loads the page, opens the screen asked for, runs any extra JS,
// then reports sideways scroll, console errors, CSP blocks and controls under
// 44 px tall or wide, and saves a full-page screenshot. Exits 1 when a check fails.
//
//   node tools/look.mjs [pads|beats|keys-on|song|live|VIEW ...] [--advanced] [--top PX] [--scroll PX | --scroll-to SELECTOR] [--js CODE | --js-file PATH] [--url URL] [--out DIR] [--widths 320,375] [--wide]
//   console.log() in --js prints under the table (📝), to measure as well as look.
//   --bg NAME[,NAME…]|all|none: the page's pattern (backdrop.js) instead of a random one; one shot per pattern.
//   --skin ID[,ID…]|all: the pad skin (skins.js), set as the person's padSkin before the view runs; one shot per skin.
//   --reduced-motion: the device asks for less motion (prefers-reduced-motion: reduce).
//   --cpu RATE: the page's CPU RATE times slower, as a slow device runs it (timing checks with --js).
//   A new person's first steps (the welcome, tips, hint dots, the nudge; ADR 0028) stay off,
//   as a fresh device always looked, except in the views that show them (welcome, …).
//   node tools/look.mjs cloud-smoke|cloud-e2e [--url URL]   the live cloud checks (look-cloud.mjs)
//
// Node with no dependencies: the DevTools protocol over Node's own WebSocket
// and fetch (chrome.mjs). This is the one Node tool in tools/ (Ben's call,
// 2026-10-11): headless Chrome needs a WebSocket client, which stdlib Python
// lacks. chrome.mjs and look-cloud.mjs are its parts, not tools of their own.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME, launchChrome, connect, evaluate as evaluateIn, waitFor, sleep, freePort } from './chrome.mjs';
import { BACKDROPS } from '../web/backdrop.js';
import { SKIN_IDS } from '../web/skins.js';

// The live cloud checks `just deploy` runs (just cloud-smoke, just cloud-e2e).
if (['cloud-smoke', 'cloud-e2e'].includes(process.argv[2])) {
  const { main } = await import('./look-cloud.mjs');
  process.exit(await main(process.argv[2], process.argv.slice(3)));
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// The four tabs (ADR 0017). A view on Beats says whether ⌨️ Keys is on
// (`keys: true`) or off; the run sets it first, as the widths share
// localStorage, which remembers it.
const SCREENS = { pads: '#pads-tab', beats: '#beats-toggle', song: '#song-tab', live: '#live-tab' };
const KEYS = (on) => `if (document.body.classList.contains('keys-on') !== ${on}) document.querySelector(${JSON.stringify(on ? '#seq-keys' : '#dj-keys-toggle')}).click();`;
// Named states past a screen: a dialog or mode, opened by script, so a look
// at every screen is one command (just look pads settings help sheet ...).
const q = (sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;
// 🆕 New in a beat bar, then a 24-character name typed into its title (the scratch holds it).
const LONG_NAME = (bar) => `${q(`${bar} [data-beat-new]`)} { const n = document.querySelector(${JSON.stringify(`${bar} [data-beat-name]`)});
  n.value = 'Wobbly Noodle Jamboree 9'; n.dispatchEvent(new Event('change')); } await new Promise((r) => setTimeout(r, 300));`;
// ⇆ Move on, unless a wider shot of the same page already turned it on.
const MOVE_OPEN = 'if (document.querySelector("#seq-deck [data-move-open]").getAttribute("aria-pressed") !== "true") document.querySelector("#seq-deck [data-move-open]").click(); await new Promise((r) => setTimeout(r, 100));';
const nap = 'await new Promise((r) => setTimeout(r, 150));';
// Opens a kit group on Pads only if it is shut: the widths share localStorage.
const OPEN_KIT = (id) => `{ const h = document.querySelector('.pad-group[data-group="${id}"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); } ${nap}`;
// Opens 💃 Grooves' style groups by id, each only if shut (a click toggles).
const GROOVE_GROUPS_OPEN = (...ids) => ids.map((id) => `{ const h = document.querySelector('[data-groove-group="${id}"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); }`).join(' ');
// House loaded into the scratch on Beats: its bass line is a tune row (🎹).
const ROLL_GROOVE = q('#seq-grooves') + GROOVE_GROUPS_OPEN('dance') + q('[data-groove="house"]') + 'await new Promise((r) => setTimeout(r, 300));';
// Record with ⌨️ Keys on, then two Kicks (the A key) in the first bar after the count-in.
const BUILDER_REC = `${q('#dj-record')}
  const hit = () => { for (const type of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(type, { code: 'KeyA', key: 'a', bubbles: true })); };
  await new Promise((r) => setTimeout(r, 2700)); hit();
  await new Promise((r) => setTimeout(r, 600)); hit();
  await new Promise((r) => setTimeout(r, 300));`;
// 🆕 New, + Add a row and 💾 Keep on Beats (⌨️ Keys off): a named beat in 🗂️ My beats.
// + Add a row opens the chooser with the next sound ticked; Add puts its row in.
const ADD_ROW = q('#seq-add') + q('#chooser-ok');
const KEEP_NEW = q('.beat-bar [data-beat-new]') + ADD_ROW + q('.beat-bar [data-beat-keep]');
// 🎼 Song's playlist (ADR 0024). SONG_DROP defines chip(i) (the strip's beat
// i, newest first) and drop(i, lane, bar): pick it (if not picked) and tap
// that spot. PLAYLIST keeps three grooves as beats on Beats (Ska, House, then
// Pop: chip 0 is Pop), opens Song's blank scratch and arranges them: Pop ×2
// on Drums, House twice on Bass, Ska on Keys, nothing selected.
const SONG_DROP = `const chip = (i) => document.querySelectorAll('#song-beats [data-beat]')[i];
  const drop = (i, lane, bar) => { if (chip(i).getAttribute('aria-pressed') !== 'true') chip(i).click();
    document.querySelector('#song-lanes [data-track="' + lane + '"] [data-bar="' + bar + '"]').click(); };`;
const GROOVE_KEEP = (group, id) => q('#seq-grooves') + GROOVE_GROUPS_OPEN(group) + q(`[data-groove="${id}"]`) + nap + q('.beat-bar [data-beat-keep]') + nap;
const PLAYLIST = `${q('#beats-toggle') + GROOVE_KEEP('latin', 'ska') + GROOVE_KEEP('dance', 'house') + GROOVE_KEEP('rock', 'pop')}
  ${q('#song-tab') + nap + q('#song-new') + nap} ${SONG_DROP}
  drop(0, 0, 0); ${q('#song-more')} drop(1, 1, 0); drop(1, 1, 4); drop(2, 2, 2); ${q('#song-sel-close')}`;
// The playlist with Advanced on and two tempo marks put in through 🎼 Tempo
// (140 BPM from bar 3, 80 from bar 9), the sheet shut again.
const TEMPO_MARK = (bar, bpm) => `${q('#tempo-add')} document.querySelector('#tempo-bar').value = '${bar}';
  document.querySelector('#tempo-bpm').value = '${bpm}'; ${q('#tempo-done')}`;
const TEMPO_MARKS = `${PLAYLIST} (await import('/settings.js')).setSetting('advancedBeats', true); ${nap}
  ${q('#song-tempo-open')} ${TEMPO_MARK(3, 140)} ${TEMPO_MARK(9, 80)} document.querySelector('#tempo-sheet').close(); ${nap}`;
// Six made-up sounds of the kid's own (silent audio), four of them in two
// groups, for the Edit sounds views. Not stored: a reload forgets them.
const MINE = `const { state } = await import('/state.js'); const pid = state.personId;
  const wav = new Blob([new Uint8Array(44)], { type: 'audio/wav' });
  [['Burp', '🤢', 'g-farm'], ['Moo', '🐮', 'g-farm'], ['Quack quack', '🦆', 'g-silly'], ['Boing', '🚀', 'g-silly'], ['Laser beam', '⚡'], ['Ha ha', '😂']]
    .forEach(([label, emoji, group], i) => state.userClips.push({ id: 'user-look-' + i, personId: pid, label, emoji, color: ['red', 'blue', 'yellow', 'teal', 'pink', 'orange'][i],
      voice: i === 2 ? 'robot' : 'normal', blob: wav, mime: 'audio/wav', created: i + 1, ...(group ? { group } : {}) }));
  state.orders.set(pid, { personId: pid, ids: [], groups: [{ id: 'g-farm', name: 'Farm animals' }, { id: 'g-silly', name: 'Silly' }] });
  // Views share one browser: a group closed by an earlier view starts open again.
  const pads = await import('/pads.js'); pads.ownClosed().clear(); localStorage.removeItem('groups-closed');
  pads.renderPads();`;
// A kid's own sound with real audio (two seconds of hum and one clap, made
// in the page), its sheet open: SHEET_OWN at Regular (🔊 Even it out beside
// 👂 Plain), WAVE_OWN on ✂️ Trim and edit's 👆 Select part (Advanced).
const OWN_SOUND = (advanced) => `const { state } = await import('/state.js'); const pid = state.personId;
  await (await import('/settings.js')).setSetting('advancedBeats', ${advanced});
  const rate = 22050; const b = new AudioBuffer({ length: 2 * rate, numberOfChannels: 1, sampleRate: rate }); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.06 * Math.sin(2 * Math.PI * 300 * i / rate);
  for (let i = 0; i < 0.03 * rate; i++) d[rate + i] += 0.87 * Math.sin(2 * Math.PI * 1500 * i / rate) * Math.exp(-i / (0.003 * rate));
  const blob = (await import('/sequencer.js')).encodeWav(b);
  state.userClips.push({ id: 'user-look-wave', personId: pid, label: 'Hum', emoji: '🐝', color: 'red', voice: 'normal', blob, mime: blob.type, created: 1 });
  (await import('/pads.js')).renderPads();
  ${q('#edit-toggle')} ${q('#pads .pad-cell:has([data-id="user-look-wave"]) [data-edit]')}
  await new Promise((r) => setTimeout(r, 600));`;
const SHEET_OWN = `${OWN_SOUND(false)} ${nap}`;
const WAVE_OWN = `${OWN_SOUND(true)} ${q('#trim-btn')}
  await new Promise((r) => setTimeout(r, 400)); ${q('#cut-views [data-view="part"]')} ${nap}`;
// Taps the made-up sound `i` in Edit sounds: it is chosen.
const CHOOSE = (i) => q(`#pads .pad[data-id="user-look-${i}"]`);
// This device's first person, linked to the cloud with a PIN it remembers
// (faked: the look server has no /api), for the profile-pin views.
const PIN_LINK = `const { state } = await import('/state.js'); const pinId = [...state.peopleEdits.keys()][0];
  state.cloud.set(pinId, { id: pinId, key: 'x', rev: 0, sent: {}, sounds: {}, pin: true, remember: true });`;
// A long notice in the banner over the top of the screen (ui.js showNotice),
// after its slide-in, for the notice views.
const NOTICE = `const { showNotice } = await import('/ui.js');
  showNotice('Saved a backup: Noodle Pads 2026-10-16.zip (3 sounds, 2 beats, 1 song). Keep it somewhere safe.');
  await new Promise((r) => setTimeout(r, 500));`;
// 👋 A new person's first steps (ADR 0028; web/firsts.js). Every view starts
// with them off (the app's test hook), as a fresh device always looked; a
// view with `firstSteps: true` turns them on. WELCOME opens the welcome for
// the person showing, as if just made (the widths share one device, so only
// the first width's person is new by itself).
const WELCOME = `const w = await import('/welcome.js'); const { state } = await import('/state.js');
  if (!w.welcomeOpen()) { w.markNew(state.personId); w.offerWelcome(state.personId); } ${nap}`;
// A person with first steps on and nothing seen yet: the welcome (open on
// the first width's new person) put away, and `seen` emptied (the widths
// share one device).
const FRESH = `{ const d = document.querySelector('#welcome'); if (d.open) d.close(); }
  await (await import('/settings.js')).setSetting('seen', ''); ${nap}`;
const VIEWS = {
  // Who's playing?: the three picture cards.
  welcome: { screen: 'pads', firstSteps: true, js: WELCOME },
  // Pick your stage name, after 🎵 Tap and make beats; and after 🧸 Little noodler (picture and color only).
  'welcome-stage': { screen: 'pads', firstSteps: true, js: `${WELCOME} ${q('#wl-cards [data-level="regular"]')} ${nap}` },
  // A one-time tip in the banner: 🥁 Beats' first visit, the scratch beat empty.
  'tip-beats': { screen: 'beats', firstSteps: true, js: `${FRESH} ${q('#pads-tab')} ${q('#beats-toggle')} ${nap}` },
  // Hint dots on ⌨️ Keys, 💃 Grooves and 🎚️ Mixer, for a person who has tapped none (the tip put away).
  'hint-dots': { screen: 'beats', firstSteps: true, js: `${FRESH} document.querySelector('#banner-close')?.click(); ${nap}` },
  // 🎛️ The level-up nudge in the update bar's place: three reaches over two visits, made up.
  nudge: { screen: 'pads', firstSteps: true, js: `${FRESH} document.querySelector('#banner-close')?.click();
    await (await import('/settings.js')).setSetting('reaches', 'a,b,c'); (await import('/nudge.js')).nudgeTick(); ${nap}` },
  'welcome-kids-stage': { screen: 'pads', firstSteps: true, js: `${WELCOME} ${q('#wl-cards [data-level="kids"]')} ${nap}` },
  edit: { screen: 'pads', js: q('#edit-toggle') },
  settings: { screen: 'pads', js: q('#settings-open') },
  // The banner with a notice, on Pads and over ⚙️ Settings. The Undo banner
  // shows in edit-undo (Pads), new-full (Beats), keys-new-full and song-new-full.
  notice: { screen: 'pads', js: NOTICE },
  'settings-notice': { screen: 'pads', js: q('#settings-open') + NOTICE },
  people: { screen: 'pads', js: q('#people-open') },
  // A person's profile sheet (👥 People → tap them): name, picture, color, ☁️, PIN, Delete.
  profile: { screen: 'pads', js: `${q('#people-open')} ${q('#people-edit [data-profile]')}` },
  // The same, for someone in the cloud with a PIN (a faked link): the PIN
  // part shows Change, Forget and Remove; profile-guard then taps a color, and
  // the guard's PIN pad asks before it changes.
  'profile-pin': { screen: 'pads', js: `${PIN_LINK} ${q('#people-open')} ${q('#people-edit [data-profile]')} ${nap}` },
  'profile-guard': { screen: 'pads', js: `${PIN_LINK} ${q('#people-open')} ${q('#people-edit [data-profile]')} ${nap}
    ${q('#profile-colors [aria-pressed="false"]')} ${nap}` },
  // 👥 People's Pick a name list (a profile's 🎲).
  'people-names': { screen: 'pads', js: `${q('#people-open')} ${q('#people-edit [data-profile]')} ${q('#profile-reroll')}` },
  // 👥 People with four people who have different amounts (the counts under each name).
  'people-many': { screen: 'pads', js: `${q('#people-open')} for (let i = 0; i < 3; i++) { ${q('#person-add')} ${nap} }
    const { state } = await import('/state.js');
    const ids = [...document.querySelectorAll('#people-edit [data-person]')].map((r) => r.dataset.person);
    const amounts = [[27, 4, 2, 1], [3, 0, 1, 0], [1, 12, 0, 5]];
    ids.forEach((id, i) => {
      const [s, b, g, t] = amounts[i] ?? [0, 0, 0, 0];
      for (let k = 0; k < s; k++) state.userClips.push({ id: id + '-c' + k, personId: id, label: 'x' });
      for (let k = 0; k < b; k++) state.savedBeats.push({ id: id + '-b' + k, personId: id, name: 'b', rows: [] });
      for (let k = 0; k < g; k++) state.songbook.push({ id: id + '-s' + k, personId: id, name: 's', slots: [] });
      for (let k = 0; k < t; k++) state.takes.push({ id: id + '-t' + k, personId: id, name: 't' });
    });
    (await import('/people.js')).renderPeopleEditor();` },
  help: { screen: 'pads', js: q('#help-open') },
  // 🎹 Who plays (ADR 0030): Notes open with its instrument list open, and
  // Notes picked as Piano (the list closed, the pads with their 🎹 badge).
  // Use --scroll-to '.pad-group-inst' to see them on a phone.
  'inst-list': { screen: 'pads', js: `${OPEN_KIT('notes')} ${q('[data-inst-pick="notes"]')} ${nap}` },
  'inst-piano': { screen: 'pads', js: `${OPEN_KIT('notes')} ${q('[data-inst-pick="notes"]')} ${nap} ${q('#inst-list-notes [data-inst="piano"]')} ${nap}` },
  // The same picker everywhere else (phase 2): a row's sound chooser with
  // Notes' list open (--scroll-to '.chooser-inst-row'); 🎹 Add a tune's Who
  // plays it?; the roll on House's bass line with its instrument list open;
  // ✏️ Edit keys with Notes open and its list open; ✏️ Edit layout with the
  // Chords band's list open. kids-keys shows 🧸 Kids' round instrument button.
  'chooser-inst': { screen: 'beats', js: q('.beat-bar [data-beat-new]') + ADD_ROW + q('.seq-row [data-pick]') + q('#chooser-grid [data-inst-pick="notes"]') + nap },
  'tune-who': { screen: 'beats', js: q('.beat-bar [data-beat-new]') + q('#seq-add-tune') + nap },
  'roll-inst': { screen: 'beats', js: ROLL_GROOVE + q('.seq-row.tune [data-pick]') + q('[data-roll="inst"] [data-inst-pick]') + nap },
  'keys-inst': { screen: 'live', js: q('#dj-input [data-input="keys"]') + q('#dj-change') + q('[data-group="kit-notes"]') + q('#ke-inst [data-inst-pick]') + nap },
  'touch-inst': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-inst-pick]') + nap },
  sheet: { screen: 'pads', js: q('.pad-add') },
  // The tab-audio check page for 🎧 From a song (web/check-tab-audio.html), not the app:
  // as it opens, hearing sound (a made-up level), and a problem (the no-sound message).
  'check-tab': { page: 'check-tab-audio.html' },
  'check-tab-heard': { page: 'check-tab-audio.html', js: `const c = await import('/check-tab-audio.js');
    c.show('heard', 'Hearing sound ✓'); c.showLevel(0.72);
    document.querySelector('#share').textContent = '■ Stop'; document.querySelector('#share').classList.add('stop');
    document.querySelector('#detail').textContent = 'Sharing “Tab audio” · 48000 Hz · loudest so far -3 dB';` },
  'check-tab-error': { page: 'check-tab-audio.html', js: `const c = await import('/check-tab-audio.js');
    c.show('error', 'No sound came with that tab: share it again and leave Also share tab audio ticked.');
    document.querySelector('#detail').textContent = 'What the browser said (NotAllowedError: Permission denied)';` },
  'sheet-edit': { screen: 'pads', js: `${q('#edit-toggle')} ${q('#pads .pad-cell [data-edit]')}` },
  // ✏️ Edit sounds with six made-up sounds of the kid's own, four in two
  // groups (MINE): as it opens, with two chosen (the bar), with a preset
  // chosen too (Move and Share wait), a group closed, each bulk sheet, a
  // group's ✏️, and the Undo bar after a delete.
  'edit-groups': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')}` },
  // ✂️ Trim and edit on a kid's own sound (a made-up hum with one clap),
  // Advanced on, on 👆 Select part: 🔊 Even it out shows beside 🔉 Quieter.
  'wave-own': { screen: 'pads', js: WAVE_OWN },
  'sheet-own': { screen: 'pads', js: SHEET_OWN },
  'edit-chosen': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${CHOOSE(3)}` },
  'edit-presets': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${q('#pads .pad-cell [data-id$="-kick"]')}` },
  'edit-closed': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${q('#pads .pad-group[data-group="g-farm"]')} ${CHOOSE(3)}` },
  'bulk-move': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${CHOOSE(4)} ${q('[data-bulk="move"]')}` },
  'bulk-look': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${CHOOSE(4)} ${q('[data-bulk="look"]')}` },
  'bulk-voice': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${CHOOSE(4)} ${q('[data-bulk="voice"]')}` },
  'group-edit': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${q('[data-group-edit="g-silly"]')}` },
  'edit-undo': { screen: 'pads', js: `${MINE} ${q('#edit-toggle')} ${CHOOSE(0)} ${CHOOSE(4)} ${q('[data-bulk="delete"]')} ${q('[data-bulk="delete"]')} ${nap}` },
  open: { screen: 'beats', js: q('.beat-bar [data-beat-open]') },
  grooves: { screen: 'beats', js: q('#seq-grooves') },
  // 💃 Grooves with two style groups open (opened only if shut: the widths share localStorage, not the page).
  'grooves-open': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('latin', 'swing') },
  // The builder-* views are Beats with ⌨️ Keys on (once DJ's Beat Builder).
  // Pop loaded into the scratch behind the keys (ADR 0020): 4 bars and 11 rows, the widest grid a groove makes.
  'builder-groove': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') + q('#dj-beatbar [data-beat-grooves]')
    + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 400));' },
  // Beats with Pop loaded into the scratch: 4 bars and 11 rows, to set beside builder-groove.
  // A Beats row's ⋯ menu open (overflow.js): on a line short of room (under
  // about 360 px) it holds 🔔 Overlap, 🧹 Clear and ✕ Remove; wider, ⋯ hides and nothing opens.
  // `still`: the shot is the 800 px window as the view left it (the menu closes on a scroll).
  'row-more': { screen: 'beats', still: true, js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));'
    + 'document.querySelector(".seq-head").scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 200));' + q('.seq-head [data-more]') + nap },
  'beat-groove': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' },
  // ⇆ Move on Pop (beat-move.js): the whole beat picked, the Move bar at the foot. Opened only if shut (the widths share the page's beat, not the mode).
  'beat-move': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' + MOVE_OPEN },
  // Mid-slide: a hold on the kick's third pill lifted the pick, and the finger is two pills left, so the dashed shadows show. The drag is left in the air for the shot.
  'beat-move-slide': { screen: 'beats', still: true, js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' + MOVE_OPEN
    + `const pill = (s) => document.querySelector('#seq-rows .seq-row[data-row="0"] .pill[data-step="' + s + '"]');
       pill(2).scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 100));
       const at = (el, type) => { const b = el.getBoundingClientRect(); return new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); };
       pill(2).dispatchEvent(at(pill(2), 'pointerdown')); await new Promise((r) => setTimeout(r, 600));
       document.querySelector('#seq-rows').dispatchEvent(at(pill(0), 'pointermove')); await new Promise((r) => setTimeout(r, 100));` },
  // The scratch beat with Ska loaded (ADR 0020): "Ska (scratch)", 💾 Keep where ✏️ was, and the Undo line.
  keep: { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('latin') + q('[data-groove="ska"]') + 'await new Promise((r) => setTimeout(r, 300));' },
  // A fresh device has the empty scratch beat open (ADR 0020). 🆕 New opens it blank (Ben, 2026-10-12);
  // KEEP_NEW is New, + Add a row and 💾 Keep: a named beat in 🗂️ My beats.
  beat: { screen: 'beats', js: q('.beat-bar [data-beat-new]') },
  // The beat bar with the longest name (24 characters) typed into the scratch's title: one
  // line on a wide screen, 💃 ⌨️ 🗂️ on their own row above it on a phone; keys-long-name with ⌨️ Keys on.
  'beat-long-name': { screen: 'beats', js: LONG_NAME('.beat-bar') },
  'keys-long-name': { screen: 'beats', keys: true, js: LONG_NAME('#dj-beatbar') },
  // 🆕 New over a scratch with hits (Ska loaded): the blank scratch and the Undo line;
  // keys-new-full is the same with ⌨️ Keys on (the keys' line), song-new-full on Song (a kept beat, twice).
  'new-full': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('latin') + q('[data-groove="ska"]') + nap + q('.beat-bar [data-beat-new]') + nap },
  'keys-new-full': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-grooves]') + GROOVE_GROUPS_OPEN('dance') + q('[data-groove="house"]') + nap
    + q('#dj-beatbar [data-beat-new]') + nap },
  'song-new-full': { screen: 'song', js: `${q('#beats-toggle') + KEEP_NEW + q('#song-tab') + nap + q('#song-new')} ${SONG_DROP} drop(0, 0, 0); drop(0, 0, 1); ${q('#song-new') + nap}` },
  chooser: { screen: 'beats', js: q('.beat-bar [data-beat-new]') + q('#seq-add') },   // the chooser for new rows (+ Add a row)
  // A row's own sound chooser (tap its emoji), on a new beat with one row.
  'chooser-row': { screen: 'beats', js: q('.beat-bar [data-beat-new]') + ADD_ROW + q('.seq-row [data-pick]') },
  // Pattern chips: six beats made with 🆕 New, + Add a row and 💾 Keep (the newest open), then the chips' line.
  'beat-chips': { screen: 'beats', js: KEEP_NEW.repeat(6) },
  // beat-chips with the two oldest beats 📌 pinned in 🗂️ My beats (each only if not pinned yet), Open closed again.
  'beat-pins': { screen: 'beats', js: KEEP_NEW.repeat(6) + q('.beat-bar [data-beat-open]')
    + `for (const b of [...document.querySelectorAll('#lib-list [data-pin]')].slice(-2).reverse()) if (b.getAttribute('aria-pressed') !== 'true') b.click();`
    + q('#library [data-close]') },
  // With ⌨️ Keys on: six beats, each 🆕 New, the Z key played (its row) and 💾 Keep.
  'builder-chips': { screen: 'beats', keys: true, js: (q('#dj-beatbar [data-beat-new]')
    + `for (const type of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(type, { code: 'KeyZ', key: 'z', bubbles: true }));`
    + q('#dj-beatbar [data-beat-keep]')).repeat(6) },
  // 🎚️ Mixer on a new beat with six rows (+ Add a row brings sounds not used yet), the second soloed;
  // beat-solo is the rows behind it after closing; builder-mixer is the keys view's after builder-rows.
  mixer: { screen: 'beats', js: q('.beat-bar [data-beat-new]') + ADD_ROW.repeat(6) + q('#seq-shape-line [data-mixer]') + q('[data-solo="1"]') },
  'beat-solo': { screen: 'beats', js: q('.beat-bar [data-beat-new]') + ADD_ROW.repeat(6) + q('#seq-shape-line [data-mixer]') + q('[data-solo="1"]') + q('#mixer [data-close]') },
  'builder-mixer': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') + BUILDER_REC + q('#dj-record')
    + `for (const [code, key] of [['KeyZ', 'z'], ['KeyQ', 'q']]) for (const type of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));`
    + q('#dj-setup [data-mixer]') },
  // 🎹 The piano roll (ADR 0023) on House's bass line (a groove's bass rows load as one tune row):
  // as it opens, with ♯ All notes, and playing (the playhead; needs the audio to start).
  'beat-tune': { screen: 'beats', js: ROLL_GROOVE },
  roll: { screen: 'beats', js: ROLL_GROOVE + q('.seq-row.tune [data-pick]') },
  'roll-all-notes': { screen: 'beats', js: ROLL_GROOVE + q('.seq-row.tune [data-pick]') + `{ const b = document.querySelector('[data-roll="scale"]'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); }` },
  'roll-playing': { screen: 'beats', js: ROLL_GROOVE + q('.seq-row.tune [data-pick]') + q('[data-roll="play"]') + 'await new Promise((r) => setTimeout(r, 900));' },
  'builder-tune': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-grooves]') + GROOVE_GROUPS_OPEN('dance') + q('[data-groove="house"]') + 'await new Promise((r) => setTimeout(r, 300));' },
  builder: { screen: 'beats', keys: true, js: '' },
  'builder-beat': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') },
  // Recording a new 1-bar beat with ⌨️ Keys at 100 BPM (real time: about 4
  // and 6.5 s each): two Kicks in bar 1 (the dashed bar), then grown into
  // bar 2 as a copy of bar 1.
  'builder-rec': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') + BUILDER_REC },
  // After that recording, stopped, then Z and Q played (not
  // recording: each gets an empty row): rows with their ✕ · 🧹 · emoji, in
  // keyboard order (Q, A, Z).
  'builder-rows': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') + BUILDER_REC + q('#dj-record')
    + `for (const [code, key] of [['KeyZ', 'z'], ['KeyQ', 'q']]) for (const type of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));` },
  'builder-grown': { screen: 'beats', keys: true, js: q('#dj-beatbar [data-beat-new]') + BUILDER_REC + 'await new Promise((r) => setTimeout(r, 1700));' },
  takes: { screen: 'live', js: q('#dj-takes-open') },
  // ✏️ Edit keys: as it opens, with a ready-made layout loaded, and with sounds picked.
  keys: { screen: 'live', js: q('#dj-input [data-input="keys"]') + q('#dj-change') },
  // ⌨️ / 👆 (ADR 0029): 🎤 Live on the touch layout or on the keys (a phone's
  // default is 👆), and Beats with ⌨️ Keys on the touch layout.
  touch: { screen: 'live', js: q('#dj-input [data-input="touch"]') },
  'live-keys': { screen: 'live', js: q('#dj-input [data-input="keys"]') },
  'touch-beats': { screen: 'beats', keys: true, js: q('#dj-input [data-input="touch"]') },
  // ✏️ Edit layout: as it opens, with a tile's picker open (swap or take out), + more on
  // Drums, + more with its ▾ list of groups open, and Drums sized down to S.
  'touch-edit': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') },
  'touch-edit-swap': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-tile="0"]') },
  'touch-edit-more': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-more="1"]') },
  'touch-edit-groups': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-more="1"]') + q('#te-bands [data-group-pick]') },
  'touch-edit-small': { screen: 'live', js: q('#dj-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-size="s"][data-band="1"]') },
  'keys-layout': { screen: 'live', js: q('#dj-input [data-input="keys"]') + q('#dj-change') + q('[data-layout="ready-space-band"]') + q('#ke-save') },
  'keys-picked': { screen: 'live', js: `${q('#dj-input [data-input="keys"]')} ${q('#dj-change')} ${q('[data-group="kit-animals"]')} for (let i = 0; i < 3; i++) document.querySelectorAll('#ke-picks [data-sound]')[i].click();` },
  'song-new': { screen: 'song', js: q('#song-new') },
  songs: { screen: 'song', js: q('#song-open') },
  // 🎼 Song's playlist (ADR 0024), PLAYLIST: as arranged; with a beat picked in the strip;
  // with a block selected (its ⟷ end and the bar under the lanes); playing (the playhead;
  // needs the audio to start); with eight lanes (lanes 5–8 scroll on a phone); a lane's sheet.
  playlist: { screen: 'song', js: PLAYLIST },
  'playlist-pick': { screen: 'song', js: `${PLAYLIST} chip(1).click();` },
  'playlist-select': { screen: 'song', js: `${PLAYLIST} ${q('#song-lanes [data-block="1:1"]')}` },
  'playlist-playing': { screen: 'song', js: `${PLAYLIST} ${q('#song-play')} await new Promise((r) => setTimeout(r, 2500));` },
  'playlist-lanes': { screen: 'song', js: `${PLAYLIST} ${q('#song-add-lane').repeat(4)}` },
  'playlist-lane': { screen: 'song', js: `${PLAYLIST} ${q('#song-lanes [data-lane-pick="1"]')}` },
  // Tempo marks (ADR 0031), with Advanced on: song-tempos has two (140 from
  // bar 3, 80 from bar 9), their BPM chips over the ruler; tempo-sheet is 🎼
  // Tempo's list (the deck's tempo tapped); tempo-mark is a chip tapped, its
  // mark open to change or remove; song-tempos-regular is the chips with Advanced off.
  'song-tempos': { screen: 'song', js: TEMPO_MARKS },
  'song-tempos-regular': { screen: 'song', js: `${TEMPO_MARKS} (await import('/settings.js')).setSetting('advancedBeats', false); ${nap}` },
  'tempo-sheet': { screen: 'song', js: `${TEMPO_MARKS} ${q('#song-tempo-open')} ${nap}` },
  'tempo-mark': { screen: 'song', js: `${TEMPO_MARKS} ${q('#song-lanes [data-tempo-bar="9"]')} ${nap}` },
  // Cloud profiles (cloud-ui.js). The look server has no /api, so these show
  // the screens as a device sees them with the cloud out of reach, and
  // cloud-in fakes this device's link to draw the in-the-cloud sheet.
  avatar: { screen: 'pads', js: q('#people-open') + q('#people-edit [data-profile]') + q('#profile-picture') },
  // All emoji (the "…" at the end of a picture chooser), opened and loaded:
  // the round picture's and the sound sheet's. Add a state with --js, e.g.
  //   --js 'document.querySelector(".emoji-all:not([hidden]) .emoji-all-group").click()'   one group open
  'avatar-all': { screen: 'pads', js: `${q('#people-open') + q('#people-edit [data-profile]') + q('#profile-picture') + q('#avatar-grid .emoji-more')} ${nap} ${nap}` },
  'sheet-all': { screen: 'pads', js: `${q('.pad-add')} ${nap} ${q('#emoji-grid .emoji-more')} ${nap} ${nap}` },
  cloud: { screen: 'pads', js: q('#people-open') + q('#people-edit [data-profile]') + q('#profile-cloud') },
  'cloud-in': { screen: 'pads', js: `const { state } = await import('/state.js'); const id = [...state.peopleEdits.keys()][0];
    state.cloud.set(id, { id, key: 'x', rev: 0, sent: {}, sounds: {}, pin: true, remember: true });
    ${q('#people-open') + q('#people-edit [data-profile]') + q('#profile-cloud')} ${nap}` },
  share: { screen: 'pads', js: `const { state } = await import('/state.js'); const id = [...state.peopleEdits.keys()][0];
    state.cloud.set(id, { id, key: 'x', rev: 0, sent: {}, sounds: {} });
    ${q('#people-open') + q('#people-edit [data-profile]') + q('#profile-cloud')} ${nap} ${q('#cloud-share')} ${nap}
    document.querySelector('#share-code').textContent = 'ABCD-2345'; document.querySelector('#share-title-made').textContent = 'Wobbly Taco';
    document.querySelector('#share-made').hidden = false;` },
  shared: { screen: 'pads', js: `localStorage.setItem('shared', JSON.stringify([{ code: 'ABCD2345', kind: 'beat', title: 'Wobbly Taco Remix Deluxe', at: 1 }, { code: 'WXYZ6789', kind: 'sound', title: 'Burp', at: 2 }]));
    ${q('#settings-open') + q('#shared-browse')} ${nap}` },
  'cloud-list': { screen: 'pads', js: `${q('#people-open') + q('#cloud-browse')} ${nap}` },
  pin: { screen: 'pads', js: `const ui = await import('/cloud-ui.js');
    ui.askPin({ title: 'Their PIN', hint: 'Type the PIN to open this profile on this device.', note: "That PIN isn't right. 4 tries left before a 10-minute wait.", remember: true, forgot: true, someoneNew: true });` },
  // ⚙️ Settings → 🎨 Look open (the pad skins to choose from), scrolled to it.
  look: { screen: 'pads', js: `${q('#settings-open')} { const h = document.querySelector('#set-look .set-head'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); }
    document.querySelector('#set-look').scrollIntoView(); ${nap}` },
  // Settings with every section open, to see them all at once.
  'settings-all': { screen: 'pads', js: `${q('#settings-open')} for (const h of document.querySelectorAll('#settings-dialog .set-head[aria-expanded="false"]')) h.click(); ${nap}` },
};
// 🧸 Kids (ADR 0019): the person on the Kids level, on each of its tabs;
// kids-mine adds six made-up sounds of the kid's own (they come first);
// kids-sum is the grown-up sum behind ⚙️. Every other view puts the level
// back to Regular first (the views share one browser).
const KIDS = (tab) => `(await import('/settings.js')).setSetting('level', 'kids'); ${nap} ${q(`[data-kids-tab="${tab}"]`)} ${nap}`;
for (const tab of ['pads', 'record', 'beats', 'keys']) VIEWS[`kids-${tab}`] = { screen: 'pads', kids: true, js: KIDS(tab) };
VIEWS['kids-mine'] = { screen: 'pads', kids: true, js: `${MINE} ${KIDS('pads')} ${q('[data-kids-tab="record"]')} ${q('[data-kids-tab="pads"]')}` };
VIEWS['kids-sum'] = { screen: 'pads', kids: true, js: `${KIDS('pads')} ${q('#settings-open')}` };
// A new kid's first steps (ADR 0028): the 👆 hand over the first pad (add --reduced-motion to see it still).
VIEWS['kids-hand'] = { screen: 'pads', kids: true, firstSteps: true, js: `${FRESH} ${KIDS('pads')}` };
for (const s of Object.keys(SCREENS)) VIEWS[s] = { screen: s, js: '' };
VIEWS.beat = VIEWS.beats;   // the singular too: "just look beat" was a usage error (2026-10-12)
VIEWS['keys-on'] = { screen: 'beats', keys: true, js: '' };   // Beats with ⌨️ Keys on, the empty scratch open
VIEWS.dj = VIEWS.live;   // the old name of 🎤 Live
// Each ❓ Help tab on its own: help-pads, help-sounds, help-beats, help-song, help-live, help-settings.
for (const tab of ['pads', 'sounds', 'beats', 'song', 'live', 'settings']) {
  VIEWS[`help-${tab}`] = { screen: 'pads', js: q('#help-open') + q(`#help-tabs [data-help="${tab}"]`) };
}
const MIN_TAP = 44;

function usage(msg) {
  if (msg) console.error(`🛑 ${msg}`);
  console.error(`views: ${Object.keys(VIEWS).join(' ')}`);
  console.error('usage: just look [pads|beats|keys-on|song|live|VIEW ...] [--advanced] [--top PX] [--scroll PX | --scroll-to SELECTOR] [--js CODE | --js-file PATH] [--url URL] [--out DIR] [--widths 320,375,...] [--wide] [--bg NAME,...|all|none] [--skin ID,...|all] [--reduced-motion] [--cpu RATE]');
  console.error(`skins: ${SKIN_IDS.join(' ')}`);
  process.exit(2);
}

const opts = { screens: [], js: '', url: '', out: '', advanced: false, reduced: false, cpu: 1, top: 0, scroll: null, scrollTo: '', widths: [320, 375, 700, 900, 1100], bgs: [''], skins: [''] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => argv[++i] ?? usage(`${a} needs a value`);
  if (a === '--js') opts.js = val();
  // A longer script from a file: no shell quoting, and a sandbox that refuses $(cat …) can still pass it.
  else if (a === '--js-file') opts.js = fs.readFileSync(val(), 'utf8');
  else if (a === '--url') opts.url = val();
  else if (a === '--out') opts.out = val();
  else if (a === '--widths') opts.widths = val().split(',').map(Number);
  else if (a === '--wide') opts.widths = [320, 375, 700, 900, 1100, 1366, 1920, 2560, 3440];   // phones to ultrawide
  else if (a === '--advanced') opts.advanced = true;
  // The device asks for less motion (prefers-reduced-motion: reduce): what still moves, and what shows instead.
  else if (a === '--reduced-motion') opts.reduced = true;
  // A slow device: the page's CPU this many times slower, so a --js timing script shows what a slower phone or laptop would.
  else if (a === '--cpu') opts.cpu = Number(val());
  else if (a === '--top') opts.top = Number(val());
  else if (a === '--scroll') opts.scroll = Number(val());
  // An 800 px window with this element 200 px from the top (clear of the
  // sticky bars), at every width: no measuring its offset per width first.
  else if (a === '--scroll-to') opts.scrollTo = val();
  // The page's pattern: one shot per pattern named (a contact sheet with `all`), else a random one per load.
  else if (a === '--bg') {
    const v = val();
    opts.bgs = v === 'all' ? [...BACKDROPS] : v.split(',');
    for (const b of opts.bgs) if (b !== 'none' && !BACKDROPS.includes(b)) usage(`no pattern called ${b}: ${BACKDROPS.join(' ')}`);
  }
  // The pad skin: one shot per skin named (all seven with `all`), else the person's own (Tiles on a fresh device).
  else if (a === '--skin') {
    const v = val();
    opts.skins = v === 'all' ? [...SKIN_IDS] : v.split(',');
    for (const k of opts.skins) if (!SKIN_IDS.includes(k)) usage(`no skin called ${k}: ${SKIN_IDS.join(' ')}`);
  }
  else if (a === '-h' || a === '--help') usage();
  else if (a in VIEWS) opts.screens.push(a);
  else usage(`unknown argument: ${a}`);
}
if (!opts.screens.length) opts.screens.push('pads');
if (!fs.existsSync(CHROME)) usage(`no Chrome at ${CHROME}; set CHROME=/path/to/chrome`);

// Everything started here is stopped on any exit, Ctrl-C included (Chrome
// by chrome.mjs).
const children = [];
process.on('exit', () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* already gone */ } } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

// The dev server, unless a URL was given.
let base = opts.url;
if (!base) {
  const port = await freePort();
  const server = spawn('python3', [path.join(ROOT, 'tools/serve.py'), String(port)], { stdio: 'ignore' });
  children.push(server);
  base = `http://localhost:${port}/`;
  await waitFor('the dev server', async () => (await fetch(base)).ok);
}

const chrome = await launchChrome();
const { send, listeners } = await connect(await chrome.page());
const evaluate = (expression) => evaluateIn(send, expression);

// Errors and CSP blocks, collected per page load.
let errors = [];
let csp = [];
// console.log from --js, printed under the table: measure with --js instead
// of reading pixels off a screenshot.
let logs = [];
listeners.push((m) => {
  // The sound sheet asks before the tab closes with unsaved work (a --js that
  // leaves it changed). Navigating to the next width would wait on that for
  // ever, so a "Leave site?" is accepted (2026-10-16: it hung a run).
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'log') {
    logs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push(d.exception?.description?.split('\n')[0] || d.text);
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    const { text, url } = m.params.entry;
    if (/Content Security Policy/i.test(text)) csp.push(text);
    else errors.push(`${text}${url ? ` (${url})` : ''}`);
  }
});
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
if (opts.reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (opts.cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });

// Controls a finger can see and reach that are under 44 px tall or wide:
// buttons, summaries, selects, sliders, checkboxes and radios. A checkbox or
// radio inside a <label> is measured by its label, which takes the tap too.
// Skips what is not rendered or not reachable: hidden, inert, aria-hidden,
// closed <details>, zero-size, invisible, or outside a closed dialog.
const MEASURE = (width) => `(() => {
  const reachable = (el) => {
    if (el.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])')) return false;
    if (el.closest('details:not([open])') && !el.matches('summary')) return false;
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && Number(s.opacity) > 0 && s.pointerEvents !== 'none';
  };
  const name = (el) => el.id ? '#' + el.id
    : JSON.stringify(el.getAttribute('aria-label') || el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24)
      || (el.type && el.tagName.toLowerCase() + '[' + el.type + ']') || el.className);
  const small = [];
  const boxes = [];   // [control, rect, in a fixed layer?] for the overlap check
  let checked = 0;
  const seen = new Set();
  const controls = 'button, [role="button"], summary, select, input[type="range"], input[type="checkbox"], input[type="radio"]';
  // The beat grid's pills, the piano roll's squares and notes are exempt: their width is the
  // grid's (16 a bar, a decision in docs/decisions.md), and they are 64 px tall.
  const exempt = '.pill, .note-cell, .roll-note, .dj-grid-row .row-x, .dj-grid-row .row-clear, .dj-grid-row .row-ring, .dj-grid-row > .row-emoji, .dj-grid-row .row-vol, .ke-key';   // Beat Builder's row ✕ and picture: Ben chose the ✕ as small as the emoji beside it (2026-10-11), so the pair keeps the row's height; its 🧹 clear (Ben, 2026-10-12) and 🔔 Overlap are the ✕'s size, and its speaker matches them (provisional, questions.md); the three sit in .row-tools at the row's right
  // ✏️ Edit keys' keyboard keeps all ten keys of a row across even at 320 px (Ben, 2026-10-11), so its keys are narrow there; they stay 52 px tall.
  // An open modal dialog makes the rest of the page inert: check only it.
  // The last one opened is on top (People opens over Settings).
  const scope = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1) || document;
  for (const el of scope.querySelectorAll(controls)) {
    if (el.matches(exempt) || !reachable(el)) continue;
    const box = el.matches('input[type="checkbox"], input[type="radio"]') ? (el.closest('label') || el) : el;
    if (seen.has(box)) continue;
    seen.add(box);
    checked++;
    const r = box.getBoundingClientRect();
    const miss = [];
    if (r.height < ${MIN_TAP} - 0.5) miss.push(Math.round(r.height) + 'px tall');
    if (r.width < ${MIN_TAP} - 0.5) miss.push(Math.round(r.width) + 'px wide');
    if (miss.length) small.push(name(box === el ? el : box) + ' ' + miss.join(' '));
    // Its layer: the nearest box that stays put while what is under it
    // scrolls, fixed or sticky (the toolbar; the chooser's "Use …" footer over
    // its list, inside a modal dialog, which is fixed itself), or the page.
    const layer = (() => { for (let e = box; e; e = e.parentElement) if (['fixed', 'sticky'].includes(getComputedStyle(e).position)) return e; return null; })();
    // What shows of it: a box scrolled out of a scrolling list (All emoji's)
    // is clipped there, so it cannot run into the controls below the list.
    let v = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let e = box.parentElement; e && e !== layer; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = e.getBoundingClientRect();
      v = { left: Math.max(v.left, c.left), top: Math.max(v.top, c.top), right: Math.min(v.right, c.right), bottom: Math.min(v.bottom, c.bottom) };
    }
    if (v.right - v.left > 2 && v.bottom - v.top > 2) boxes.push([box, v, layer]);
  }
  // Controls that run into each other (by more than 2 px both ways): two keys
  // squeezed onto one line once overlapped by 10 px and passed every other
  // check. A control inside another (a label's checkbox) doesn't count, nor
  // controls in different layers (the fixed toolbar, a sticky footer, the page).
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ra, fa] = boxes[i];
      const [b, rb, fb] = boxes[j];
      if (fa !== fb || a.contains(b) || b.contains(a)) continue;
      // Edit sounds' ✏️ and 🗑️ sit on their own pad's corner by design (the
      // badge is on top, the pad answers taps elsewhere); a badge running
      // into the other badge, or into another pad's, still counts.
      const cell = a.closest('.pad-cell');
      if (cell && cell === b.closest('.pad-cell') && (a.matches('.pad') || b.matches('.pad'))) continue;
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 2 && y > 2) overlaps.push(name(a) + ' ↔ ' + name(b) + ' (' + Math.round(Math.min(x, y)) + 'px)');
    }
  }
  return {
    // Against the width asked for, not innerWidth: a phone (and mobile
    // emulation) zooms out to fit a too-wide page, so innerWidth grows with it.
    sideways: Math.max(document.documentElement.scrollWidth, innerWidth) > ${width},
    scrollWidth: Math.max(document.documentElement.scrollWidth, innerWidth),
    // What sticks out: the innermost boxes running past the right edge, so a
    // sideways scroll names its cause (a class clash once made a key 319 px wide).
    wide: (() => {
      const out = [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > ${width} + 0.5 && !e.closest('dialog:not([open])'));
      const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
      return out.filter((e) => !out.some((o) => o !== e && e.contains(o))).slice(0, 3)
        .map((e) => name(e) + ' ' + Math.round(e.getBoundingClientRect().left) + '–' + Math.round(e.getBoundingClientRect().right) + 'px');
    })(),
    height: document.documentElement.scrollHeight,
    small,
    overlaps,
    checked,
    // An open sheet scrolls on its own, so it can overflow inside a page that fits.
    dialogSideways: [...document.querySelectorAll('dialog[open]')].filter((d) => d.scrollWidth > d.clientWidth).map((d) => '#' + d.id),
  };
})()`;

// Screenshot folders from earlier runs pile up in the temp folder: clear
// those over a day old (not newer ones: another agent's run may be reading them).
for (const name of fs.readdirSync(os.tmpdir())) {
  if (!/^look-(?!chrome-)/.test(name)) continue;
  const dir = path.join(os.tmpdir(), name);
  try { if (Date.now() - fs.statSync(dir).mtimeMs > 24 * 3600e3) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone already */ }
}
const out = opts.out ? path.resolve(opts.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'look-'));
fs.mkdirSync(out, { recursive: true });

const rows = [];
// One page load at one width, measured and photographed.
async function lookOnce(screen, w, bg = '', skin = '') {
    errors = []; csp = []; logs = [];
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
    const loaded = new Promise((r) => listeners.push(function once(m) {
      if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(once), 1); r(); }
    }));
    // The first-steps hook (web/firsts.js), set before the app's scripts run.
    const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.noodleFirstSteps = ${!!VIEWS[screen].firstSteps};` });
    // A view with `page` opens that page of the site instead of the app (a dev check page).
    const page = VIEWS[screen].page ?? '';
    await send('Page.navigate', { url: `${base}${page}${bg ? `?bg=${bg}` : ''}` });
    await loaded;
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier });
    await sleep(400);
    const row = { screen: [screen, bg, skin].filter(Boolean).join(' '), w, extra: [] };
    try {
      if (page) {
        if (VIEWS[screen].js) await evaluate(`(async () => { ${VIEWS[screen].js} })()`);
        if (opts.js) await evaluate(`(async () => { ${opts.js} })()`);
      } else {
        if (!VIEWS[screen].kids) {
          await evaluate(`(async () => { const s = await import('/settings.js'); if (s.getSetting('level') === 'kids') { await s.setSetting('level', 'regular'); await new Promise((r) => setTimeout(r, 150)); } })()`);
        }
        // --skin: the person's pad skin, before the view (the widths share storage, so it is set each time).
        if (skin) {
          await evaluate(`(async () => { await (await import('/settings.js')).setSetting('padSkin', ${JSON.stringify(skin)}); await new Promise((r) => setTimeout(r, 100)); })()`);
        }
        // --advanced turns on the Advanced switch first, so every control is on the page.
        if (opts.advanced) {
          await evaluate(`(async () => { (await import('/settings.js')).setSetting('advancedBeats', true); await new Promise((r) => setTimeout(r, 200)); })()`);
        }
        const view = VIEWS[screen];
        await evaluate(`document.querySelector(${JSON.stringify(SCREENS[view.screen])}).click()`);
        if (view.screen === 'beats') await evaluate(KEYS(!!view.keys));
        if (view.js) { await sleep(150); await evaluate(`(async () => { ${view.js} })()`); }
        if (opts.js) await evaluate(`(async () => { ${opts.js} })()`);
      }
    } catch (err) {
      row.extra.push(`script failed: ${err.message.split('\n')[0]}`);
    }
    await sleep(400);
    const m = await evaluate(MEASURE(w));
    const shot = path.join(out, `${screen}-${w}${bg ? `-${bg}` : ''}${skin ? `-${skin}` : ''}.png`);
    // A full-page shot grows the window to the page's height first, as a
    // phone scrolled to the end would show it: capturing beyond an 800 px
    // window leaves the fixed toolbar mid-picture, over the page foot.
    // --scroll shows one 800 px window scrolled that far down instead, to see
    // what sticks at the top (a full-page shot has nothing to scroll).
    // An open sheet scrolls inside itself, so it is scrolled the same distance.
    if (opts.scrollTo) await evaluate(`{ const e = document.querySelector(${JSON.stringify(opts.scrollTo)}); if (e) scrollTo(0, e.getBoundingClientRect().top + scrollY - 200); }`);
    else if (opts.scroll !== null) await evaluate(`scrollTo(0, ${opts.scroll}); for (const d of document.querySelectorAll('dialog[open]')) d.scrollTop = ${opts.scroll};`);
    else if (VIEWS[screen].still) { /* a popover open where its view put it: a scroll or resize would close it */ }
    else await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(Math.max(m.height, 800), 8000), deviceScaleFactor: 1, mobile: w < 768 });
    await sleep(200);
    // --top keeps only the top of the page: cheaper to read when the change is there.
    const clip = opts.top ? { clip: { x: 0, y: 0, width: w, height: Math.min(opts.top, m.height), scale: 1 } } : {};
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: m.sideways, ...clip });
    fs.writeFileSync(shot, Buffer.from(r.data, 'base64'));
    Object.assign(row, m, { errors: [...new Set(errors)], csp: [...new Set(csp)], logs: [...logs], shot });
    // Zero buttons means the page never drew, not that every button passed.
    for (const d of m.dialogSideways) row.extra.push(`${d} scrolls sideways`);
    for (const o of m.overlaps) row.extra.push(`overlap: ${o}`);
    if (!m.checked) row.extra.push('no buttons found: the page did not render');
    row.ok = !m.sideways && !row.errors.length && !row.csp.length && !m.small.length && !row.extra.length;
    return row;
}
// A file the dev server failed to send (net::ERR_…, "Failed to load
// resource") has twice failed a run that passed on a rerun, so such a
// width gets one more try, and the report says it did.
const hiccup = (row) => row.errors.some((e) => /net::ERR_|Failed to load resource/.test(e));
for (const screen of opts.screens) {
  for (const w of opts.widths) {
    for (const bg of opts.bgs) {
      for (const skin of opts.skins) {
        let row = await lookOnce(screen, w, bg, skin);
        if (!row.ok && hiccup(row)) {
          const first = row.errors.find((e) => /net::ERR_|Failed to load resource/.test(e));
          row = await lookOnce(screen, w, bg, skin);
          row.retried = first;
        }
        rows.push(row);
      }
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
const W = Math.max(7, ...rows.map((r) => r.screen.length + 1));
console.log(`${pad('screen', W)}${pad('width', 6)}${pad('sideways', 10)}${pad('errors', 7)}${pad('csp', 5)}${pad('<44px', 6)}${pad('buttons', 8)}result`);
for (const r of rows) {
  console.log(pad(r.screen, W) + pad(r.w, 6) + pad(r.sideways ? `yes ${r.scrollWidth}` : 'no', 10)
    + pad(r.errors.length, 7) + pad(r.csp.length, 5) + pad(r.small.length, 6) + pad(r.checked, 8) + (r.ok ? '✅' : '❌'));
}
for (const r of rows.filter((x) => !x.ok)) {
  console.log(`\n${r.screen} @ ${r.w}px:`);
  for (const e of r.extra) console.log(`  ⚠️  ${e}`);
  if (r.sideways) console.log(`  ↔️  page is ${r.scrollWidth}px wide in a ${r.w}px window${r.wide?.length ? `; sticking out: ${r.wide.join(', ')}` : ''}`);
  if (r.retried) console.log(`  ↻ ${r.screen} ${r.w}: retried once after a load error: ${r.retried}`);
  for (const e of r.errors) console.log(`  💥 ${e}`);
  for (const e of r.csp) console.log(`  🚫 ${e}`);
  if (r.small.length) console.log(`  👆 under ${MIN_TAP}px: ${r.small.join(', ')}`);
}
for (const r of rows.filter((x) => x.logs?.length)) for (const l of r.logs) console.log(`📝 ${r.screen} ${r.w}: ${l}`);
console.log(`\n📸 screenshots: ${out}`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
