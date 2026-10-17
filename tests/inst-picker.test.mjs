// 🎹 Who plays (ADR 0030) on the real app, on the stand-in page: the picker
// on the Notes, Chords and Bass headers, the list it opens by family, a pick
// that closes it and turns the group's pads into that instrument's notes
// (each keeping its fruit, with the instrument's badge), per person.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { state } from '../web/state.js';

let page;
let $;

before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const picker = (group) => $('#pads').querySelector(`[data-inst-pick="${group}"]`);
const list = (group) => $('#pads').querySelector(`#inst-list-${group}`);
const header = (group) => $('#pads').querySelector(`.pad-group[data-group="${group}"]`);
const padsIn = (group) => $('#pads').querySelectorAll('.pad').filter((p) => state.manifest.kit.find((k) => p.dataset.id?.endsWith(`-${k.id}`) && p.dataset.id === `${state.personId}-${k.id}`)?.group === group);
const kitIdOf = (pad) => pad.dataset.id.slice(state.personId.length + 1);

test('Notes, Chords and Bass have who plays them beside their name; other groups do not', () => {
  for (const g of ['notes', 'chords', 'bass']) {
    assert.ok(picker(g), g);
    assert.equal(picker(g).getAttribute('aria-expanded'), 'false');
    assert.equal(list(g), null);
  }
  assert.equal(picker('notes').getAttribute('aria-label'), 'Who plays Notes: Pluck');
  assert.equal(picker('chords').getAttribute('aria-label'), 'Who plays Chords: Synth');
  assert.ok(picker('notes').title, 'a tooltip of its own');
  assert.equal(picker('drums'), null);
  assert.equal(picker('animals'), null);
});

test('a tap opens the instruments by family, today\'s one ticked; a tap again closes them', () => {
  picker('notes').dispatch('click');
  assert.equal(picker('notes').getAttribute('aria-expanded'), 'true');
  const families = list('notes').querySelectorAll('.inst-family-name').map((h) => h.textContent);
  assert.deepEqual(families, ['Keys', 'Mallets', 'Strings', 'Wind']);
  const choices = list('notes').querySelectorAll('[data-inst]');
  assert.ok(choices.length >= 10);
  assert.deepEqual(choices.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.inst), ['pluck']);
  picker('notes').dispatch('click');
  assert.equal(list('notes'), null);
  // Chords: only the families that play chords.
  picker('chords').dispatch('click');
  assert.deepEqual(list('chords').querySelectorAll('.inst-family-name').map((h) => h.textContent), ['Keys', 'Strings']);
  picker('chords').dispatch('click');
});

test('picking Piano closes the list, opens Notes, and its pads are piano notes with their fruit and a 🎹 badge', async () => {
  if (header('notes').getAttribute('aria-expanded') === 'true') header('notes').dispatch('click');
  picker('notes').dispatch('click');
  list('notes').querySelector('[data-inst="piano"]').dispatch('click');
  await page.settle();
  assert.equal(list('notes'), null, 'it closes as soon as one is picked');
  assert.equal(header('notes').getAttribute('aria-expanded'), 'true', 'the group opens, so its notes show');
  assert.equal(picker('notes').getAttribute('aria-label'), 'Who plays Notes: Piano');
  assert.deepEqual(state.prefs.get(state.personId)?.values?.instNotes, 'piano', 'the person\'s own setting');
  const notes = padsIn('notes');
  assert.deepEqual(notes.map(kitIdOf), ['piano-c', 'piano-d', 'piano-e', 'piano-f', 'piano-g', 'piano-a', 'piano-b', 'piano-c-high']);
  const c = notes[0];
  assert.equal(c.querySelector('.pad-emoji').textContent, '🍎', 'C keeps its fruit');
  assert.equal(c.querySelector('.pad-inst').textContent, '🎹');
  assert.equal(c.getAttribute('aria-label'), 'C, Piano');
  // Chords and Bass still play their own.
  assert.equal(picker('chords').getAttribute('aria-label'), 'Who plays Chords: Synth');
});

test('a sound something already uses is still found with another instrument picked', async () => {
  const { anyClip, clipsFor } = await import('../web/board.js');
  const pid = state.personId;
  assert.ok(anyClip(`${pid}-note-c`), 'a beat row or key on Pluck\'s C keeps playing it');
  assert.ok(!clipsFor(pid).some((c) => c.id === `${pid}-note-c`), 'though Notes shows the piano now');
  assert.equal(anyClip(`${pid}-piano-c`).file, 'clips/kit/piano-61.wav');
});

test('each person has their own: someone else still has Pluck, and coming back finds Piano', async () => {
  const people = () => $('#people').querySelectorAll('[data-person]');
  const me = state.personId;
  people()[1].dispatch('click');
  await page.settle();
  assert.notEqual(state.personId, me);
  assert.equal(picker('notes').getAttribute('aria-label'), 'Who plays Notes: Pluck');
  people().find((b) => b.dataset.person === me).dispatch('click');
  await page.settle();
  assert.equal(picker('notes').getAttribute('aria-label'), 'Who plays Notes: Piano');
});

test('Esc in the open list closes it, back on its button', () => {
  picker('bass').dispatch('click');
  const choice = list('bass').querySelector('[data-inst="808"]');
  choice.focus?.();
  choice.dispatch('keydown', { key: 'Escape' });
  assert.equal(list('bass'), null);
  assert.equal(picker('bass').getAttribute('aria-expanded'), 'false');
});
