// 👋 The welcome for a new person (ADR 0028, web/welcome.js): Who's playing?
// then Pick your stage name, on a device's first open and for everyone added,
// never for anyone who already exists. The real app on the stand-in page, as
// a new device, with first steps on (fake-dom.mjs installPage's
// `firstSteps`). The sound a card plays and how it all looks need a browser:
// `just look welcome welcome-stage welcome-kids-stage`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { state } from '../web/state.js';
import { getSetting } from '../web/settings.js';
import { person } from '../web/board.js';
import { isFunName } from '../web/names.js';

let page;
let $;
before(async () => {
  console.error = () => {};   // clips fail to load without audio; that is expected here
  page = installPage({ firstSteps: true });   // the real boards.json: no people, so the app makes one
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const cards = () => $('#wl-cards').querySelectorAll('[data-level]');
const card = (level) => cards().find((c) => c.dataset.level === level);
const names = () => $('#wl-names').querySelectorAll('[data-name]');
const pics = () => $('#wl-pics').querySelectorAll('[data-pic]');
const tap = async (el) => { el.dispatch('click'); await page.settle(); };

test("a new device's first person is asked Who's playing?: three picture pads, no ages", () => {
  assert.equal($('#welcome').open, true, 'the welcome is open over the app');
  assert.equal($('#welcome-title').textContent, "Who's playing?");
  assert.deepEqual(cards().map((c) => c.dataset.level), ['kids', 'regular', 'advanced']);
  assert.deepEqual(cards().map((c) => c.querySelector('.pad-label').textContent), ['Little noodler', 'Tap and make beats', 'Show me everything']);
  assert.deepEqual(cards().map((c) => c.querySelector('.pad-emoji').textContent), ['🧸', '🎵', '🎛️']);
  for (const c of cards()) {
    assert.ok(c.classList.contains('pad'), 'drawn as a pad, so the skin draws it too');
    assert.doesNotMatch(c.getAttribute('aria-label'), /\d/, 'no ages');
  }
  assert.equal($('#wl-skip').textContent, 'Skip');
  assert.equal($('#wl-cloud').hidden, false, "a fresh device offers the cloud beside a new player (Ben, 2026-10-24)");
});

test('a card sets the level for the person showing, then Pick your stage name', async () => {
  const id = state.personId;
  await tap(card('advanced'));
  assert.equal(getSetting('level'), 'advanced');
  assert.equal(state.prefs.get(id).values.level, 'advanced', "stored as the person's own level");
  assert.equal($('#welcome').open, true, 'the same dialog goes on');
  assert.equal($('#wl-who').hidden, true);
  assert.equal($('#wl-stage').hidden, false);
  assert.equal($('#welcome-title').textContent, 'Pick your stage name');
  assert.equal($('#wl-name').textContent, person(id).name);
  assert.equal(names().length, 6);
  for (const b of names()) assert.ok(isFunName(b.dataset.name), b.dataset.name);
  assert.equal(pics().length, 7);
  assert.equal(pics()[0].dataset.pic, person(id).avatar, 'their own picture first');
  assert.equal($('#wl-pics').children.at(-1).textContent, '…', 'then the full chooser');
  assert.equal($('#wl-colors').children.length, 8);
});

test('each tap changes them at once: a name, a picture, a color (the screen takes it); 🎲 deals more names', async () => {
  const id = state.personId;
  const before = names().map((b) => b.dataset.name);
  $('#wl-dice').dispatch('click');
  const after = names().map((b) => b.dataset.name);
  assert.notDeepEqual(after, before);
  const name = after[2];
  await tap(names()[2]);
  assert.equal(person(id).name, name);
  assert.equal(state.peopleEdits.get(id).fun, true, 'a fun name, so it syncs');
  assert.equal($('#wl-name').textContent, name);
  const emoji = pics()[3].dataset.pic;
  await tap(pics()[3]);
  assert.equal(person(id).avatar, emoji);
  await tap($('#wl-colors').querySelector('[data-color="#A3156E"]'));
  assert.equal(person(id).color, '#A3156E');
  assert.equal(document.documentElement.style.props['--board'], '#A3156E', 'the screen takes the color');
  assert.equal($('#welcome').style.props['--c'], '#A3156E');
  await tap($('#wl-go'));
  assert.equal($('#welcome').open, false);
  assert.equal(person(id).name, name, "▶ Let's play keeps them");
});

test('➕ in 👥 People welcomes the new person; Skip on the first step keeps Regular', async () => {
  await tap($('#person-add'));
  const id = state.personId;
  assert.equal($('#welcome').open, true, 'asked again, for the new person');
  assert.equal($('#wl-who').hidden, false, 'from the first step');
  assert.equal($('#wl-cloud').hidden, true, "someone added is a new player: 👥 People's own ☁️ is beside ➕");
  await tap($('#wl-skip'));
  assert.equal($('#welcome').open, false);
  assert.equal(state.personId, id);
  assert.equal(getSetting('level'), 'regular');
});

test('Skip on Pick your stage name puts back what the app gave', async () => {
  await tap($('#person-add'));
  const id = state.personId;
  const was = { ...person(id) };
  await tap(card('regular'));
  await tap(names()[0]);
  await tap($('#wl-colors').querySelector('[data-color="#304A00"]'));
  assert.notEqual(person(id).name, was.name);
  await tap($('#wl-stage-skip'));
  assert.equal($('#welcome').open, false);
  assert.equal(person(id).name, was.name);
  assert.equal(person(id).color, was.color);
  assert.equal(person(id).avatar, was.avatar);
});

test("🧸 Kids picks a picture and a color, keeps its given name, and gets Kids' screens as the welcome ends", async () => {
  await tap($('#person-add'));
  const id = state.personId;
  const name = person(id).name;
  await tap(card('kids'));
  assert.equal($('#welcome').open, true, "still open: Kids' screens wait for the end");
  assert.equal(getSetting('level'), 'regular');
  assert.equal($('#wl-names').hidden, true, 'no names to read');
  assert.equal($('#wl-dice').hidden, true);
  assert.equal($('#welcome-title').textContent, 'Pick your picture');
  await tap(pics()[1]);
  await tap($('#wl-go'));
  assert.equal($('#welcome').open, false);
  assert.equal(getSetting('level'), 'kids');
  assert.equal(person(id).name, name);
  assert.equal(document.body.classList.contains('kids'), true, "Kids' screens show");
});

test('nobody is welcomed twice: showing someone who exists asks nothing', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'regular');
  const [first] = [...state.peopleEdits.keys()];
  const { setPersonEdit } = await import('../web/state.js');
  await setPersonEdit(first, { color: '#0C5E4B' });   // a change, as a sync or backup would make
  location.hash = `#${first}`;
  page.winEvent('hashchange');
  await page.settle();
  assert.equal($('#welcome').open, false);
});

test('⚙️ Settings → About → Show the welcome again closes Settings, opens Who\'s playing? and brings the tips back', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('seen', 'dot-keys,kids-pad,tip-pads');
  $('#settings-open').dispatch('click');
  await page.settle();
  assert.equal($('#settings-dialog').open, true);
  assert.match($('#welcome-again').textContent, /Show the welcome again/);
  await tap($('#welcome-again'));
  assert.equal($('#settings-dialog').open, false, 'Settings steps aside');
  assert.equal($('#welcome').open, true);
  assert.equal($('#welcome-title').textContent, "Who's playing?");
  assert.equal(getSetting('seen'), 'kids-pad', 'the tips and dots are cleared; the 🧸 hand stays seen');
  await tap($('#wl-skip'));
  assert.equal($('#welcome').open, false, 'Skip ends it and keeps what the person has');
});
