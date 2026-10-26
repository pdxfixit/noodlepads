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
//   --height PX: a window PX tall instead of 800: a phone with its browser bar showing (Firefox for Android leaves about 680 px).
//   A new person's first steps (the welcome, tips, hint dots, the nudge; ADR 0028) stay off,
//   as a fresh device always looked, except in the views that show them (welcome, …).
//   node tools/look.mjs cloud-smoke|cloud-e2e [--url URL]   the live cloud checks (look-cloud.mjs)
//   node tools/look.mjs taps [--url URL]   a finger on a phone: every tap must sound (taps(), at the end)
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
if (process.argv[2] === 'taps') process.exit(await taps(process.argv.slice(3)));
// The four tabs (ADR 0017). A view on Beats says whether ⌨️ Keys is on
// (`keys: true`) or off; the run sets it first, as the widths share
// localStorage, which remembers it.
const SCREENS = { pads: '#pads-tab', beats: '#beats-toggle', song: '#song-tab', live: '#live-tab' };
const KEYS = (on) => `if (document.body.classList.contains('keys-on') !== ${on}) document.querySelector(${JSON.stringify(on ? '#seq-keys' : '#dj-keys-toggle')}).click();`;
// Named states past a screen: a dialog or mode, opened by script, so a look
// at every screen is one command (just look pads settings help sheet ...).
const q = (sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;
// ✏️ Layout with 👆 Pads open: Two and one, then Drums, Chords and Bass into its blocks, in order.
const GRID_FILL = ['[data-shape="two-one"]', '[data-add-group="drums"]', '[data-add-group="chords"]', '[data-add-group="bass"]'].map(q).join('');
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
// This device's first person, linked to the cloud with a PIN, its key held
// for this visit (faked: the look server has no /api), for the profile-pin views.
const PIN_LINK = `const { state } = await import('/state.js'); const pinId = [...state.peopleEdits.keys()][0];
  state.cloud.set(pinId, { id: pinId, key: 'x', rev: 0, sent: {}, sounds: {}, pin: true });`;
// A long notice in the banner over the top of the screen (ui.js showNotice),
// after its slide-in, for the notice views.
const NOTICE = `const { showNotice } = await import('/ui.js');
  showNotice('Saved a backup: Noodle Pads 2026-10-16.zip (3 sounds, 2 beats, 1 song). Keep it somewhere safe.');
  await new Promise((r) => setTimeout(r, 500));`;
// 👋 A new person's first steps (ADR 0028; web/firsts.js). Every view starts
// with them off (the app's test hook), as a fresh device always looked; a
// view with `firstSteps: true` turns them on. WELCOME opens the welcome for
// the person showing, as if the device just made them (the widths share one
// device, so only the first width's person is new by itself).
const WELCOME = `const w = await import('/welcome.js'); const { state } = await import('/state.js');
  if (!w.welcomeOpen()) { w.markNew(state.personId, { device: true }); w.offerWelcome(state.personId); } ${nap}`;
// A person with first steps on and nothing seen yet: the welcome (open on
// the first width's new person) put away, and `seen` emptied (the widths
// share one device).
const FRESH = `{ const d = document.querySelector('#welcome'); if (d.open) d.close(); }
  await (await import('/settings.js')).setSetting('seen', ''); ${nap}`;
// 🎧 From a song's test hook (listen-ui.js listenEnv): which ways to listen
// this device offers (all four, or a phone's 🎤 and 📁), and no prints, so
// every row keeps its plain sound.
const LISTEN = (kinds = "['tab', 'screen', 'mic', 'file']") => `const L = await import('/listen-ui.js');
  L.listenEnv.sources = () => ${kinds}; L.listenEnv.printOf = async () => null; L.showCard();`;
// A made-up capture that sends a frame every 60 ms, and a listener whose
// snapshots step through `which` (finding: the tempo settling; live: parts
// A, B, A again, then C after a speed-up at bar 22; nothing: no beat), one
// per frame, then stay on the last; finish() gives three parts (or none).
const LISTEN_FAKE = (which) => `const cells = (p, upto = 99) => [...p].map((c, i) => (i > upto ? -1 : c === 'x' ? 2 : c === 'o' ? 1 : 0));
  const K = ['x.....x...x.....', 'x.....x.o.x.....', 'x.....x...x.....'];
  const S = ['....x.......x...', '....x.......x..o', '....x.......x...'];
  const H = ['x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.xo', 'x.x.x.x.x.x.x.x.'];
  const recent = (step) => ({ kick: K.map((p, i) => cells(p, i === 2 ? step : 99)), snare: S.map((p, i) => cells(p, i === 2 ? step : 99)), hat: H.map((p, i) => cells(p, i === 2 ? step : 99)) });
  const parts = [{ id: 'A', bpm: 92, signature: '4/4', swing: 0, bars: 1 }, { id: 'B', bpm: 92, signature: '4/4', swing: 0, bars: 2 }, { id: 'C', bpm: 120, signature: '4/4', swing: 0, bars: 1 }];
  const live = (bar, partId, n, step = 15, tempoChange = null) => ({ status: 'listening', seconds: bar * 2.4, bpm: partId === 'C' ? 120 : 92, signature: '4/4', swing: 0,
    parts: parts.slice(0, n), current: { partId, bar, step, recent: recent(step) }, tempoChange });
  const finding = { status: 'finding-tempo', seconds: 3, bpm: 96, signature: null, swing: 0, parts: [], current: { partId: null, bar: 1, step: 0, recent: { kick: [], snare: [], hat: [] } }, tempoChange: null };
  const snaps = ${JSON.stringify(which)} === 'live'
    ? [live(6, 'A', 1), live(10, 'B', 2), live(14, 'A', 2), live(24, 'C', 3, 9, { atBar: 22, from: 92, to: 120 })]
    : [finding];
  const steps = (bars, rows) => Object.fromEntries(Object.entries(rows).map(([r, p]) => [r, [...p.repeat(bars)].map((c) => c === 'x')]));
  const result = ${JSON.stringify(which)} === 'nothing' ? { seconds: 12, parts: [], order: [], tempos: [] } : {
    seconds: 112,
    parts: [
      { ...parts[0], steps: steps(1, { kick: K[0], snare: S[0], hat: H[0] }), prints: { kick: null, snare: null, hat: null } },
      { ...parts[1], steps: steps(1, { kick: K[0] + K[1], snare: S[0] + S[1], hat: H[0] + H[0] }), prints: { kick: null, snare: null, hat: null } },
      { ...parts[2], steps: steps(1, { kick: 'x...x...x...x...', snare: S[0], hat: 'xxxxxxxxxxxxxxxx' }), prints: { kick: null, snare: null, hat: null } },
    ],
    order: [{ partId: 'A', startBar: 1, bars: 8 }, { partId: 'B', startBar: 9, bars: 4 }, { partId: 'A', startBar: 13, bars: 8 }, { partId: 'C', startBar: 22, bars: 16 }],
    tempos: [{ bar: 22, bpm: 120 }],
  };
  let fed = 0;
  L.listenEnv.createListener = () => ({ feed() { fed++; }, snapshot: () => snaps[Math.min(fed, snaps.length) - 1], finish: () => result });
  L.listenEnv.startCapture = async (kind, { onFrames, onEnd }) => {
    let k = 0;
    const t = setInterval(() => { onFrames(new Float32Array(2048), 48000); if (++k >= snaps.length) clearInterval(t); }, 60);
    return { stop() { clearInterval(t); onEnd('stopped'); }, label: '', sampleRate: 48000 };
  };`;
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
  // shows in edit-undo (Pads); 🆕 New's kept line in new-full (Beats), keys-new-full and song-new-full.
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
  // 🗂️ See all (a profile's count line): six made-up sounds (MINE), two beats,
  // a take and a key layout of the kid's own, so every part of the sheet shows.
  'see-all': { screen: 'pads', js: `${MINE}
    state.savedBeats.push({ id: 'beat-look-1', personId: pid, name: 'Funky Pickle', bars: 2, bpm: 120, rows: [], saved: 9 },
      { id: 'beat-scratch-' + pid, personId: pid, name: 'Scratch', bars: 1, bpm: 100, rows: [], saved: 1 });
    state.takes.push({ id: 'take-look-1', personId: pid, name: 'Take 1', duration: 42, events: [], created: 3 });
    state.layouts.push({ id: 'layout-look-1', personId: pid, name: 'Zoo keys with a very long name indeed', keys: { KeyA: 'user-look-0' }, created: 2 });
    ${q('#people-open')} ${q('#people-edit [data-profile]')} ${q('#profile-counts')} ${nap}` },
  // Loading a one-person backup (⬇️ Export a backup): it asks where it goes,
  // ♻️ Restore them or load it all into someone here. Two made-up people here.
  'load-who': { screen: 'pads', js: `const { state } = await import('/state.js');
    const { makeBackup, personBackupLists } = await import('/backup.js');
    for (const [id, name, avatar] of [['p-look-a', 'Captain Cranberries', '🍒'], ['p-look-b', 'Agent Alpaca with a long name', '🦙']])
      state.peopleEdits.set(id, { id, name, fun: true, avatar, color: '#0E2C78', added: true, created: 1 });
    const blob = await makeBackup(personBackupLists({
      people: [{ id: 'p-look-away', name: 'Baron Bagel', fun: true, avatar: '🥯', color: '#304A00', added: true, created: 2 }],
      clips: [{ id: 'user-look-away', personId: 'p-look-away', label: 'Big burp', emoji: '🐸', color: 'red', voice: 'normal', mime: 'audio/wav', created: 5, blob: new Blob([new Uint8Array(44)], { type: 'audio/wav' }) }],
      beats: [{ id: 'beat-look-away', personId: 'p-look-away', name: 'Away groove', bpm: 90, rows: [], created: 1, saved: 2 }],
    }, 'p-look-away'));
    const input = document.querySelector('#backup-file');
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'baron.zip', { type: 'application/zip' }));
    input.files = dt.files; input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 600));` },
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
  'keys-inst': { screen: 'live', from: 700, js: q('#ke-input [data-input="keys"]') + q('#dj-change') + q('[data-group="kit-notes"]') + q('#ke-inst [data-inst-pick]') + nap },
  'touch-inst': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-inst-pick]') + nap },
  sheet: { screen: 'pads', js: q('.pad-add') },
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
  // A Beats row's menu open from its emoji (overflow.js): 🔄 Change sound,
  // 🔔 Overlap, 🧹 Clear, ✕ Remove, ↑ Move up, ↓ Move down.
  // `still`: the shot is the 800 px window as the view left it (the menu closes on a scroll).
  'row-more': { screen: 'beats', still: true, js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));'
    + 'document.querySelector(".seq-row .seq-head").scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 200));' + q('.seq-head [data-more]') + nap },
  'beat-groove': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' },
  // ⇆ locked on Pop: every lit pill picked (All), the bar at the foot. Locked only if not (the widths share the page's beat, not the mode).
  'beat-move': { screen: 'beats', js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' + MOVE_OPEN + q('[data-move-pick="all"]') },
  // Mid-slide, locked: a finger on the kick's lit third pill dragged two pills left, so the pick shows where it slid. The drag is left in the air for the shot.
  'beat-move-slide': { screen: 'beats', still: true, js: q('#seq-grooves') + GROOVE_GROUPS_OPEN('rock') + q('[data-groove="pop"]') + 'await new Promise((r) => setTimeout(r, 300));' + MOVE_OPEN
    + `const pill = (s) => document.querySelector('#seq-rows .seq-row[data-row="0"] .pill[data-step="' + s + '"]');
       pill(2).scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 100));
       const at = (el, type) => { const b = el.getBoundingClientRect(); return new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); };
       pill(2).dispatchEvent(at(pill(2), 'pointerdown'));
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
  // 🆕 New over a scratch with hits (Ska loaded): the blank scratch and the line saying it was kept;
  // keys-new-full is the same with ⌨️ Keys on, song-new-full on Song (a kept beat, twice).
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
  keys: { screen: 'live', from: 700, js: q('#ke-input [data-input="keys"]') + q('#dj-change') },
  // ⌨️ / 👆 (ADR 0029): 🎤 Live on the touch layout or on the keys (a phone's
  // default is 👆), and Beats with ⌨️ Keys on the touch layout.
  touch: { screen: 'live', js: q('#ke-input [data-input="touch"]') },
  'live-keys': { screen: 'live', js: q('#ke-input [data-input="keys"]') },
  'touch-beats': { screen: 'beats', keys: true, js: q('#ke-input [data-input="touch"]') },
  // ✏️ Edit layout: as it opens, with a tile's picker open (swap or take out), + more on
  // Drums, + more with its ▾ list of groups open, and Drums sized down to S.
  'touch-edit': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') },
  // ✏️ Layout from Beats' control bar (Ben, 2026-10-19): ⌨️ Keys | 👆 Pads in its title line, from 700 px.
  layout: { screen: 'beats', keys: true, js: q('#ke-input [data-input="keys"]') + q('#dj-change-bar') },
  'layout-pads': { screen: 'beats', keys: true, js: q('#ke-input [data-input="touch"]') + q('#dj-change-bar') },
  // 👆 A grid (ADR 0032): Two and one, filled with Drums, Chords and Bass; in ✏️ Layout, and played.
  'grid-edit': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + GRID_FILL },
  'grid-menu': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + GRID_FILL + q('[data-block-more="0-0"]') },
  'grid-split': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + GRID_FILL + q('[data-block-more="0-0"]') + q('[data-split="down"]') + q('[data-add-group="animals"]') + q('#touch-edit [data-close]') },
  'grid-empty': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('[data-shape="two-one"]') },
  'grid-play': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + GRID_FILL + q('#touch-edit [data-close]') },
  'grid-beats': { screen: 'beats', keys: true, js: q('#ke-input [data-input="touch"]') + q('#dj-change-bar') + GRID_FILL + q('#touch-edit [data-close]') },
  'touch-edit-swap': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-tile="0"]') },
  'touch-edit-more': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-more="1"]') },
  'touch-edit-groups': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-more="1"]') + q('#te-bands [data-group-pick]') },
  'touch-edit-small': { screen: 'live', js: q('#ke-input [data-input="touch"]') + q('#dj-change') + q('#te-bands [data-size="s"][data-band="1"]') },
  'keys-layout': { screen: 'live', from: 700, js: q('#ke-input [data-input="keys"]') + q('#dj-change') + q('[data-layout="ready-space-band"]') + q('#ke-save') },
  'keys-picked': { screen: 'live', from: 700, js: `${q('#ke-input [data-input="keys"]')} ${q('#dj-change')} ${q('[data-group="kit-animals"]')} for (let i = 0; i < 3; i++) document.querySelectorAll('#ke-picks [data-sound]')[i].click();` },
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
  // 🎧 From a song (listen-ui.js): a look device has no song, so these swap
  // in a made-up capture and listener through its test hook (listenEnv).
  // listen-card: the card at the top of 💃 Grooves; listen-sources: what to
  // listen to on a computer (four ways), listen-phone on a phone (🎤 and 📁
  // only); listen-finding: before the tempo is found; listen-live: parts
  // A, B, A again and C with a tempo change, the bars rolling; listen-result:
  // What I heard after ■ Stop (three parts, a song); listen-nothing: no beat heard.
  'listen-card': { screen: 'beats', js: `${LISTEN()} ${q('#seq-grooves')}` },
  'listen-sources': { screen: 'beats', js: `${LISTEN()} ${q('#seq-grooves')} ${q('#listen-open')} ${nap}` },
  'listen-phone': { screen: 'beats', js: `${LISTEN("['mic', 'file']")} ${q('#seq-grooves')} ${q('#listen-open')} ${nap}` },
  'listen-finding': { screen: 'beats', js: `${LISTEN()} ${LISTEN_FAKE('finding')} ${q('#seq-grooves')} ${q('#listen-open')} ${q('[data-source="tab"]')} await new Promise((r) => setTimeout(r, 500));` },
  'listen-live': { screen: 'beats', js: `${LISTEN()} ${LISTEN_FAKE('live')} ${q('#seq-grooves')} ${q('#listen-open')} ${q('[data-source="tab"]')} await new Promise((r) => setTimeout(r, 700));` },
  'listen-result': { screen: 'beats', js: `${LISTEN()} ${LISTEN_FAKE('live')} ${q('#seq-grooves')} ${q('#listen-open')} ${q('[data-source="tab"]')} await new Promise((r) => setTimeout(r, 700));
    ${q('#listen-stop')} await new Promise((r) => setTimeout(r, 300));` },
  'listen-nothing': { screen: 'beats', js: `${LISTEN()} ${LISTEN_FAKE('nothing')} ${q('#seq-grooves')} ${q('#listen-open')} ${q('[data-source="mic"]')} await new Promise((r) => setTimeout(r, 400));
    ${q('#listen-stop')} await new Promise((r) => setTimeout(r, 300));` },
  // Cloud profiles (cloud-ui.js). The look server has no /api, so these show
  // the screens as a device sees them with the cloud out of reach, and
  // cloud and cloud-in: a profile sheet scrolled to its ☁️ In the cloud and
  // 🔒 PIN parts; cloud-in fakes this device's link (with a PIN) to draw them on.
  avatar: { screen: 'pads', js: q('#people-open') + q('#people-edit [data-profile]') + q('#profile-picture') },
  // All emoji (the "…" at the end of a picture chooser), opened and loaded:
  // the round picture's and the sound sheet's. Add a state with --js, e.g.
  //   --js 'document.querySelector(".emoji-all:not([hidden]) .emoji-all-group").click()'   one group open
  'avatar-all': { screen: 'pads', js: `${q('#people-open') + q('#people-edit [data-profile]') + q('#profile-picture') + q('#avatar-grid .emoji-more')} ${nap} ${nap}` },
  'sheet-all': { screen: 'pads', js: `${q('.pad-add')} ${nap} ${q('#emoji-grid .emoji-more')} ${nap} ${nap}` },
  cloud: { screen: 'pads', js: `${q('#people-open') + q('#people-edit [data-profile]')} ${nap} document.querySelector('#profile-cloud').scrollIntoView();` },
  'cloud-in': { screen: 'pads', js: `const { state } = await import('/state.js'); const id = [...state.peopleEdits.keys()][0];
    state.cloud.set(id, { id, key: 'x', rev: 0, sent: {}, sounds: {}, pin: true });
    ${q('#people-open') + q('#people-edit [data-profile]')} ${nap} document.querySelector('#profile-cloud').scrollIntoView();` },
  // who-now: 👋 Who's playing now? with four people, two with a PIN (faked
  // links), as it comes up after the person on show is deleted.
  'who-now': { screen: 'pads', js: `const { state } = await import('/state.js'); const { addPerson } = await import('/people.js');
    while (state.peopleEdits.size < 4) await addPerson();
    const ids = [...state.peopleEdits.keys()];
    for (const id of ids.slice(0, 2)) state.cloud.set(id, { id, key: null, rev: 0, sent: {}, sounds: {}, pin: true });
    document.body.dataset.locked = '';
    (await import('/who-now.js')).openWhoNow('Admiral Acorn is deleted from this device. Tap your picture.'); ${nap}` },
  // profile-left: a new person in the cloud (a faked link, with a PIN), after
  // Delete's second tap: gone here, the sheet showing only Delete's third tap.
  'profile-left': { screen: 'pads', js: `${q('#people-open') + q('#person-add')} ${nap}
    const { state } = await import('/state.js'); const id = [...state.peopleEdits.keys()].at(-1);
    state.cloud.set(id, { id, key: 'x', rev: 0, sent: {}, sounds: {}, pin: true });
    document.querySelector('#people-edit [data-person="' + id + '"] [data-profile]').click(); ${nap}
    ${q('#profile-delete')} ${nap} ${q('#profile-delete')} ${nap} ${nap}` },
  share: { screen: 'pads', js: `const { state } = await import('/state.js'); const id = [...state.peopleEdits.keys()][0];
    state.cloud.set(id, { id, key: 'x', rev: 0, sent: {}, sounds: {} });
    ${q('#people-open') + q('#people-edit [data-profile]')} ${nap} ${q('#cloud-share')} ${nap}
    document.querySelector('#share-code').textContent = 'ABCD-2345'; document.querySelector('#share-title-made').textContent = 'Wobbly Taco';
    document.querySelector('#share-made').hidden = false;` },
  shared: { screen: 'pads', js: `localStorage.setItem('shared', JSON.stringify([{ code: 'ABCD2345', kind: 'beat', title: 'Wobbly Taco Remix Deluxe', at: 1 }, { code: 'WXYZ6789', kind: 'sound', title: 'Burp', at: 2 }]));
    ${q('#settings-open') + q('#shared-browse')} ${nap}` },
  'cloud-list': { screen: 'pads', js: `${q('#people-open') + q('#cloud-browse')} ${nap}` },
  pin: { screen: 'pads', js: `const ui = await import('/cloud-ui.js');
    ui.askPin({ title: '🦊 Admiral Acorn', hint: "They have a new PIN. Type it to open them here. Don't know it? Their things on this device are deleted; the cloud keeps what it has.", note: "That PIN isn't right. 4 tries left before a 10-minute wait.", forgot: true, someoneNew: true, unknown: true });` },
  // ⚙️ Settings → 🎨 Look open (the pad skins to choose from), scrolled to it.
  look: { screen: 'pads', js: `${q('#settings-open')} { const h = document.querySelector('#set-look .set-head'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); }
    document.querySelector('#set-look').scrollIntoView(); ${nap}` },
  // Settings with every section open, to see them all at once.
  'settings-all': { screen: 'pads', js: `${q('#settings-open')} for (const h of document.querySelectorAll('#settings-dialog .set-head[aria-expanded="false"]')) h.click(); ${nap}` },
  // ⚙️ Settings → About → Feedback: the grown-up sum, after a wrong answer (its note, and another sum).
  'feedback-gate': { screen: 'pads', js: `${q('#settings-open')} ${q('#feedback-open')} ${nap}
    const a = Number(document.querySelector('#kids-sum-a').textContent) + Number(document.querySelector('#kids-sum-b').textContent);
    for (const d of String(a === 12 ? 13 : 12)) document.querySelector('#kids-sum-keys [data-digit="' + d + '"]').click(); ${nap}` },
  // …and the Feedback dialog after the right answer, a message typed in (centered on every width).
  feedback: { screen: 'pads', js: `${q('#settings-open')} ${q('#feedback-open')} ${nap}
    const a = Number(document.querySelector('#kids-sum-a').textContent) + Number(document.querySelector('#kids-sum-b').textContent);
    for (const d of String(a)) document.querySelector('#kids-sum-keys [data-digit="' + d + '"]').click(); ${nap}
    const t = document.querySelector('#feedback-text'); t.value = 'The burp pad is the best. Could Beats have a cowbell? 🐄'; t.dispatchEvent(new Event('input')); ${nap}` },
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
  console.error('usage: just look [pads|beats|keys-on|song|live|VIEW ...] [--advanced] [--top PX] [--scroll PX | --scroll-to SELECTOR] [--js CODE | --js-file PATH] [--url URL] [--out DIR] [--widths 320,375,...] [--wide] [--bg NAME,...|all|none] [--skin ID,...|all] [--reduced-motion] [--cpu RATE] [--height PX]');
  console.error(`skins: ${SKIN_IDS.join(' ')}`);
  process.exit(2);
}

const opts = { screens: [], js: '', url: '', out: '', advanced: false, reduced: false, cpu: 1, height: 800, top: 0, scroll: null, scrollTo: '', widths: [320, 375, 700, 900, 1100], bgs: [''], skins: [''] };
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
  // A shorter window: a phone with its browser bar showing (Firefox for Android leaves about 680 px, 2026-10-22). The fixed screens (🧸 Kids) must still fit it.
  else if (a === '--height') opts.height = Number(val());
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
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: opts.height, deviceScaleFactor: 1, mobile: w < 768 });
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
    else await send('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(Math.max(m.height, opts.height), 8000), deviceScaleFactor: 1, mobile: w < 768 });
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
// A view with `from` exists only from that width: ✏️ Layout's keys view (a
// phone has only pads, Ben 2026-10-19). Narrower widths are skipped, and said.
const skipped = [];
for (const screen of opts.screens) {
  for (const w of opts.widths) {
    if (VIEWS[screen].from > w) { skipped.push(`${screen} ${w}`); continue; }
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
if (skipped.length) console.log(`⏭️  not on a phone (only from 700 px), skipped: ${skipped.join(', ')}`);
console.log(`\n📸 screenshots: ${out}`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);

// `just taps`: a finger on a phone, in headless Chrome. A tap on a pad on
// 🔊 Pads, a tile on 🎤 Live and a pad on 🧸 Kids must each sound (a voice
// started and the audio running): on a fresh device, whose first tap is the
// page's first gesture; after 🛠️ Make and back to 🎉 Play; and after the page
// is frozen and thawed with its audio suspended, as Android does to an app
// left in the background. Then a pad under something else must be logged as
// a silent tap (web/tap-watch.js), and no tap that sounded may be. Ben,
// 2026-10-26: his installed app went silent, and nothing tested a finger in a
// real browser. Exits 1 on any ❌. CI runs it on every push (test.yml), and
// `just deploy-checks` against the live site.
async function taps(argv) {
  let base = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) base = argv[++i];
    else { console.error('usage: just taps [--url URL]'); return 2; }
  }
  if (!fs.existsSync(CHROME)) { console.error(`no Chrome at ${CHROME}; set CHROME=/path/to/chrome`); return 2; }
  const children = [];
  process.on('exit', () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* already gone */ } } });
  if (!base) {
    const port = await freePort();
    children.push(spawn('python3', [path.join(ROOT, 'tools/serve.py'), String(port)], { stdio: 'ignore' }));
    base = `http://localhost:${port}/`;
    await waitFor('the dev server', async () => (await fetch(base)).ok);
  }
  const chrome = await launchChrome();
  const { send, listeners } = await connect(await chrome.page());
  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
  });
  // Reads the page with no user gesture: evaluate() lends one, which would
  // start the audio for the page and hide a tap that cannot.
  const read = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  // A phone: 412 px wide and touch only, so the page sees fingers.
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  // No first steps (as in `just look`), and a count of every voice the page starts.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.noodleFirstSteps = false; globalThis.__voices = 0;
    { const start = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { globalThis.__voices++; return start.apply(this, a); }; }` });
  const loaded = new Promise((r) => listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); }));
  await send('Page.navigate', { url: base });
  await loaded;
  await waitFor('the pads', () => read('!!document.querySelector("#pads .pad[data-id]")'));
  // 📮 Problem reports and 📊 play data off: on the live site its made-up taps
  // must not reach the real reports or play counts (a dev copy never sends).
  await read('import("/settings.js").then(async (s) => { await s.setSetting("sendLogs", false); await s.setSetting("sendUsage", false); })');
  await sleep(500);

  // One finger, down and up where it landed.
  const finger = async ({ x, y }) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  // The middle of the first `sel` showing, scrolled into the window first.
  const spot = (sel) => read(`(() => {
    const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length);
    if (!e) return null;
    let r = e.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: 'center' }); r = e.getBoundingClientRect(); }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const press = async (sel) => {
    const at = await spot(sel);
    if (!at) throw new Error(`nothing showing for ${sel}`);
    await finger(at);
    await sleep(250);
  };
  const voices = () => read('globalThis.__voices');
  const audioState = () => read('import("/audio.js").then((m) => m.audio.ctx?.state ?? "none")');
  // A finger on `sel` must start a voice, with the audio running, within 3 s.
  const sounds = async (sel) => {
    const at = await spot(sel);
    if (!at) throw new Error(`nothing showing for ${sel}`);
    const before = await voices();
    await finger(at);
    const end = Date.now() + 3000;
    let state = '';
    while (Date.now() < end) {
      state = await audioState();
      if ((await voices()) > before && state === 'running') return;
      await sleep(100);
    }
    throw new Error((await voices()) > before ? `a voice started, but the audio is ${state}` : `no sound (audio ${state})`);
  };
  const screen = () => read('document.body.className.match(/screen-(\\w+)/)?.[1] ?? ""');
  const silentTaps = () => read('import("/log.js").then((m) => m.getLog().filter((e) => e.kind === "tap").map((e) => e.data))');

  const PAD = '#pads .pad[data-id]';
  const TILE = '#dj-touch [data-clip]';
  const steps = [
    ['🔊 Pads: a fresh device\'s first tap sounds', () => sounds(PAD)],
    ['🎤 Live: a tile sounds', async () => { await press('#live-tab'); await sounds(TILE); }],
    ['🛠️ Make, then 🎉 Play: back on 🎤 Live, a tile sounds', async () => {
      await press('[data-mode-open="make"]');
      if ((await screen()) !== 'beats') throw new Error(`🛠️ Make opened ${await screen()}`);
      await press('[data-mode-open="play"]');
      if ((await screen()) !== 'live') throw new Error(`🎉 Play opened ${await screen()}, not the screen it last had`);
      await sounds(TILE);
    }],
    ['🔊 Pads after that: a pad sounds', async () => { await press('#pads-tab'); await sounds(PAD); }],
    ['frozen and thawed, the audio suspended (Android, in the background): a pad sounds', async () => {
      await send('Page.setWebLifecycleState', { state: 'frozen' });
      await sleep(1500);
      // Back in front, as a phone shows the app again: thawed alone, headless
      // Chrome leaves the page hidden, and a hidden page's audio never resumes.
      await send('Page.setWebLifecycleState', { state: 'active' });
      await send('Page.bringToFront');
      await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await waitFor('the page shown again', () => read('document.visibilityState === "visible"'), 5000);
      await read('import("/audio.js").then((m) => m.audio.ctx.suspend())');
      await sounds(PAD);
    }],
    ['…and on 🎤 Live a tile sounds', async () => {
      await read('import("/audio.js").then((m) => m.audio.ctx.suspend())');
      await press('#live-tab');
      await sounds(TILE);
    }],
    ['🧸 Kids: a pad sounds', async () => {
      await read('import("/settings.js").then((s) => s.setSetting("level", "kids"))');
      await waitFor('🧸 Kids', () => read('document.body.classList.contains("kids")'), 5000);
      await sleep(300);
      await sounds('#kids-pages .kids-pad');
      await read('import("/settings.js").then((s) => s.setSetting("level", "regular"))');
      await waitFor('Kids gone', () => read('!document.body.classList.contains("kids")'), 5000);
    }],
    ['no tap that sounded was logged as silent', async () => {
      await sleep(3200);   // the watcher's wait after the last tap (tap-watch.js SILENT_AFTER_MS)
      const logged = await silentTaps();
      if (logged.length) throw new Error(`logged: ${JSON.stringify(logged)}`);
    }],
    ['a pad under something else is logged as a silent tap, unheard and covered', async () => {
      if (await spot('[data-mode-open="play"]')) await press('[data-mode-open="play"]');
      await press('#pads-tab');
      await read(`(() => { const v = document.createElement('div'); v.className = 'tap-check-veil'; v.style.cssText = 'position:fixed;inset:0;z-index:2147483647'; document.body.append(v); })()`);
      await finger(await spot(PAD));
      await sleep(3600);
      await read('document.querySelector(".tap-check-veil").remove()');
      const logged = await silentTaps();
      const t = logged.at(-1);
      if (!t || t.why !== 'unheard' || !t.covered || t.over !== 'div.tap-check-veil' || t.screen !== 'pads' || typeof t.loops !== 'number' || typeof t.upMin !== 'number') throw new Error(`logged: ${JSON.stringify(logged)}`);
    }],
  ];
  let failed = 0;
  for (const [name, run] of steps) {
    const t0 = Date.now();
    try {
      // A step that hangs fails instead of holding the run (and CI) for ever.
      await Promise.race([run(), sleep(20_000).then(() => { throw new Error('no answer in 20 s'); })]);
      console.log(`✅ ${name} (${Date.now() - t0} ms)`);
    } catch (err) {
      failed += 1;
      console.log(`❌ ${name}: ${err.message.split('\n')[0]}`);
    }
  }
  for (const e of [...new Set(errors)]) { failed += 1; console.log(`💥 ${e}`); }
  console.log(failed ? `❌ taps: ${failed} failed (${base})` : `✅ taps: every finger tap sounded (${base})`);
  return failed ? 1 : 0;
}
