// Whose sounds: a round button in the top right corner with the person's
// first letter in their color, opening a list of everyone and 👥 People.
// The headline is always just "Noodle Pads" (Ben, 2026-10-11).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { initialOf } from '../web/pads.js';

let page;
let $;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

const row = () => $('#people');

test('initialOf: the first letter, capitalized; a whole emoji; never empty', () => {
  assert.equal(initialOf('pip'), 'P');
  assert.equal(initialOf('  Éva'), 'É');
  assert.equal(initialOf('🦖 Rex'), '🦖');
  assert.equal(initialOf(''), '?');
});

test('the corner button shows the current person\'s letter in their color; the headline is just Noodle Pads', () => {
  assert.equal($('#board-title').textContent, 'Noodle Pads');
  assert.ok($('.title-tools').contains(row()), 'in the top right, with Help and Settings');
  const button = row().querySelector('.person-menu-btn');
  assert.equal(row().children.length, 1);
  assert.equal(button.children[0].textContent, 'P');
  assert.equal(button.style.props['--c'], '#2D3FD6');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-haspopup'), 'true');
  assert.match(button.getAttribute('aria-label'), /^Whose sounds: Pip\. 4 people\.$/);
  const items = row().querySelectorAll('.person-item');
  assert.deepEqual(items.map((i) => i.textContent), ['Pip', 'Juno', 'Toby', 'Wren', '🧸 Kids mode', '👥 People'], '🧸 Kids mode (Ben, 2026-10-22), then 👥 People');
  assert.deepEqual(items.slice(0, 4).map((i) => i.style.props['--c']), ['#2D3FD6', '#304A00', '#A3156E', '#0E2C78'], 'each in their color');
  assert.equal(row().querySelector('.person-list').hidden, true);
});

test('the button opens the list with focus on the current person; Esc closes it and returns focus', () => {
  const button = row().querySelector('.person-menu-btn');
  button.dispatch('click');
  assert.equal(row().querySelector('.person-list').hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement.textContent, 'Pip');
  const esc = document.activeElement.dispatch('keydown', { key: 'Escape' });
  assert.equal(esc.defaultPrevented, true, 'the page-wide Esc (stop all) stands down');
  assert.equal(row().querySelector('.person-list').hidden, true);
  assert.equal(document.activeElement, button);
});

test('arrow keys, Home and End move through the list', () => {
  row().querySelector('.person-menu-btn').dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(row().querySelector('.person-list').hidden, false);
  const items = row().querySelectorAll('.person-item');
  items[0].dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, items[1]);
  items[1].dispatch('keydown', { key: 'End' });
  assert.ok(document.activeElement === items[5], 'End: 👥 People, the last line');
  items[5].dispatch('keydown', { key: 'ArrowDown' });
  assert.ok(document.activeElement === items[0], 'wraps');
  items[0].dispatch('keydown', { key: 'Home' });
  assert.equal(document.activeElement, items[0]);
  items[0].dispatch('keydown', { key: 'Escape' });
});

test('choosing someone switches the board, closes the list and keeps focus on the button', () => {
  row().querySelectorAll('.person-item')[2].dispatch('click');
  assert.equal($('#board-title').textContent, 'Noodle Pads');
  const button = row().querySelector('.person-menu-btn');
  assert.equal(button.children[0].textContent, 'T');
  assert.match(button.getAttribute('aria-label'), /Toby/);
  assert.equal(button.style.props['--c'], '#A3156E');
  assert.equal(row().querySelector('.person-list').hidden, true);
  assert.equal(document.activeElement, button);
});

test('👥 People opens the People editor, and a new person joins the list', async () => {
  row().querySelector('.person-menu-btn').dispatch('click');
  row().querySelector('[data-people-edit]').dispatch('click');
  assert.equal($('#people-dialog').open, true);
  assert.equal(row().querySelector('.person-list').hidden, true);
  $('#person-add').dispatch('click');
  await page.settle();
  assert.equal(row().querySelectorAll('[data-person]').length, 5);
  $('#people-dialog').close();
});
