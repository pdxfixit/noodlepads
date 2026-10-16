// 👋 The welcome for a new person (ADR 0028, web/welcome.js): Who's playing?
// on a device's first open and for everyone added, never for anyone who
// already exists. The real app on the stand-in page, as a new device, with
// first steps on (fake-dom.mjs installPage's `firstSteps`). The sound a card
// plays and how the cards look need a browser: `just look welcome`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { state } from '../web/state.js';
import { getSetting } from '../web/settings.js';

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
});

test('a card sets the level for the person showing; Advanced shows at once', async () => {
  const id = state.personId;
  card('advanced').dispatch('click');
  await page.settle();
  assert.equal(getSetting('level'), 'advanced');
  assert.equal(state.prefs.get(id).values.level, 'advanced', "stored as the person's own level");
});

test('➕ in 👥 People welcomes the new person; Skip keeps Regular', async () => {
  if ($('#welcome').open) $('#welcome').close();
  $('#person-add').dispatch('click');
  await page.settle();
  const id = state.personId;
  assert.equal($('#welcome').open, true, 'asked again, for the new person');
  $('#wl-skip').dispatch('click');
  await page.settle();
  assert.equal($('#welcome').open, false);
  assert.equal(state.personId, id);
  assert.equal(getSetting('level'), 'regular');
});

test('nobody is welcomed twice: showing someone who exists asks nothing', async () => {
  const [first] = [...state.peopleEdits.keys()];
  const { setPersonEdit } = await import('../web/state.js');
  await setPersonEdit(first, { color: '#0C5E4B' });   // a change, as a sync or backup would make
  location.hash = `#${first}`;
  page.winEvent('hashchange');
  await page.settle();
  assert.equal($('#welcome').open, false);
});
