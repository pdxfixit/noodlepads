// Every picture chooser's "…": the full emoji list (web/emoji-all.js) and
// its search, the small checker backups and the Worker use
// (web/emoji-check.js), and the three choosers on the real app (stand-in
// page): the sound sheet's Picture, DJ Beat Builder's row picture (with its
// "already taken" question) and a person's round picture. The list's groups
// fold: headings first, a group's buttons drawn when it opens.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { GROUPS, UNICODE } from '../web/emoji-all.js';
import { isListedEmoji } from '../web/emoji-check.js';
import { parseGroups, searchEmoji, withCurrent } from '../web/emoji-more.js';
import { PICTURES } from '../web/model.js';
import { newBuilderBeatWithRow, keysOn, keysOff } from './new-beat.mjs';

const groups = parseGroups(GROUPS);
const every = groups.flatMap((g) => g.items);

test('the full list: grouped, each emoji once, with a lowercase name, and every short-list picture in it', () => {
  assert.match(UNICODE, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(groups.map((g) => g.name), ['Smileys & people', 'Animals & nature', 'Food & drink', 'Activities', 'Travel & places', 'Objects', 'Symbols', 'Flags']);
  assert.ok(every.length > 1300, `${every.length} emoji`);
  assert.equal(new Set(every.map((it) => it.emoji)).size, every.length, 'no emoji twice');
  for (const it of every) assert.match(it.name, /^[a-z0-9][a-z0-9 ,'().:-]*$/, it.emoji);
  assert.deepEqual(PICTURES.filter((p) => !every.some((it) => it.emoji === p)), []);
});

test('the full list has no skin tones, lone letters, joined sequences or bare text-style symbols', () => {
  for (const { emoji } of every) {
    assert.doesNotMatch(emoji, /[\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}‍]/u, emoji);
    // Text-style symbols carry U+FE0F so they show as emoji: ❤️, not ❤.
    assert.notEqual(emoji, '❤');
  }
  assert.ok(every.some((it) => it.emoji === '❤️'));
  assert.ok(every.some((it) => it.emoji === '#️⃣'), 'keycaps');
});

test('search finds by English name, every word typed, and a pasted emoji finds itself', () => {
  const find = (q) => searchEmoji(groups, q).map((it) => it.emoji);
  assert.ok(find('frog').includes('🐸'));
  assert.ok(find('rocket').includes('🚀'));
  assert.ok(find('ROCKET ').includes('🚀'), 'any case, spaces trimmed');
  assert.ok(find('poop').includes('💩'), 'a word kids use');
  assert.ok(find('red heart').includes('❤️'));
  assert.deepEqual(find('🦖'), ['🦖']);
  assert.deepEqual(find('❤'), ['❤️'], 'without its U+FE0F too');
  assert.deepEqual(find(''), []);
  assert.deepEqual(find('zzzzqq'), []);
});

test('isListedEmoji takes exactly the full list: no text, no skin tones, no flags, no joined sequences', () => {
  for (const { emoji } of every) assert.ok(isListedEmoji(emoji), emoji);
  for (const bad of ['', 'a', '<b>', '🦖🦖', '👍🏽', '🇺🇸', '🧛‍♂️', '❤', '️', '1', '1⃣', '🦖️️', 42, null, undefined, {}, ['🦖']]) {
    assert.equal(isListedEmoji(bad), false, JSON.stringify(bad));
  }
});

test('a short list shows the picture in use at its end when it came from the full list', () => {
  assert.deepEqual(withCurrent(['🐶', '🐱'], '🐱'), ['🐶', '🐱']);
  assert.deepEqual(withCurrent(['🐶', '🐱'], '🧛'), ['🐶', '🐱', '🧛']);
  assert.deepEqual(withCurrent(['🐶'], undefined), ['🐶']);
});

// ── The real app ──────────────────────────────────────────────────────

let page;
let $;
let state;
let openAvatar;

before(async () => {
  console.error = () => {};
  globalThis.getComputedStyle ??= () => ({ gridTemplateColumns: '48px 48px 48px 48px' });
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ state } = await import('../web/state.js'));
  ({ openAvatar } = await import('../web/cloud-ui.js'));
});

// Opens the full list under `grid`, types `query` and waits for the list.
async function searchAll(grid, query) {
  const more = $(grid).querySelector('.emoji-more');
  assert.ok(more, `${grid} ends in …`);
  assert.equal($(grid).children.at(-1), more, '… is last');
  assert.equal(more.getAttribute('aria-label'), 'All emoji');
  more.dispatch('click');
  await page.settle();
  const panel = $(`#${more.getAttribute('aria-controls')}`);
  assert.equal(panel.hidden, false);
  assert.equal($(grid).hidden, true, 'the full list takes the short list\'s place');
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  const search = panel.querySelector('.emoji-search');
  search.value = query;
  search.dispatch('input');
  await page.settle();
  return panel;
}
const anyButton = (panel, e) => panel.querySelector(`[data-any="${e}"]`);

const names = (panel) => panel.querySelectorAll('.emoji-all-name').map((n) => n.textContent);
const head = (panel, name) => panel.querySelectorAll('.emoji-all-group').find((h) => h.querySelector('.emoji-all-name').textContent === name);
const gridOf = (h) => $(`#${h.getAttribute('aria-controls')}`);
const key = (el, k) => el.dispatch('keydown', { key: k });
async function filled(panel, n) {
  // It fills in a chunk at a time; wait for the last one (slower when every suite runs at once).
  for (let i = 0; i < 200 && panel.querySelectorAll('[data-any]').length < n; i++) await page.settle();
}

test('with nothing typed, the full list is a short menu of folded groups; a heading opens its group, drawn only then', async () => {
  openAvatar(state.personId);
  const avatarNow = $('#avatar-grid').querySelector('[aria-pressed="true"]')?.dataset.avatar;
  const panel = await searchAll('#avatar-grid', '');
  assert.deepEqual(names(panel), groups.map((g) => g.name));
  for (const g of groups) {
    const h = head(panel, g.name);
    assert.equal(h.type, 'button');
    assert.equal(h.querySelector('.emoji-all-count').textContent, String(g.items.length), 'a count chip');
    assert.equal(h.querySelector('.emoji-all-caret').getAttribute('aria-hidden'), 'true');
    // Folded, except the group holding the picture in use, if any.
    const inUse = g.items.some((it) => it.emoji === avatarNow);
    assert.equal(h.getAttribute('aria-expanded'), String(inUse), g.name);
    assert.equal(gridOf(h).hidden, !inUse);
  }
  // Animals: nothing made until it opens, then all of it, one Tab stop.
  const animals = head(panel, 'Animals & nature');
  if (animals.getAttribute('aria-expanded') === 'true') animals.dispatch('click');
  const before = panel.querySelectorAll('[data-any]').length;
  if (before === 0) assert.equal(gridOf(animals).children.length, 0, 'lazy: a folded group has no buttons yet');
  animals.dispatch('click');
  assert.equal(animals.getAttribute('aria-expanded'), 'true');
  assert.equal(animals.querySelector('.emoji-all-caret').textContent, '▾');
  assert.equal(gridOf(animals).hidden, false);
  const size = groups.find((g) => g.name === 'Animals & nature').items.length;
  await filled(panel, size);
  assert.equal(gridOf(animals).children.length, size);
  const visible = () => panel.querySelectorAll('[data-any]').filter((b) => !b.parentElement.hidden);
  assert.equal(visible().filter((b) => b.tabIndex === 0).length, 1, 'one emoji takes Tab');
  // Shut again: folded, its buttons kept but out of the arrows' way.
  animals.dispatch('click');
  assert.equal(animals.getAttribute('aria-expanded'), 'false');
  assert.equal(animals.querySelector('.emoji-all-caret').textContent, '▸');
  assert.equal(gridOf(animals).hidden, true);
  panel.querySelector('.emoji-back').dispatch('click');
  assert.equal(panel.hidden, true);
  assert.equal($('#avatar-grid').hidden, false);
  $('#avatar-dialog').close();
});

test('searching opens the groups with a match and hides the rest; clearing it brings the folds back', async () => {
  openAvatar(state.personId);
  const panel = await searchAll('#avatar-grid', '');
  for (const h of panel.querySelectorAll('.emoji-all-group')) if (h.getAttribute('aria-expanded') === 'true') h.dispatch('click');
  head(panel, 'Food & drink').dispatch('click');
  const search = panel.querySelector('.emoji-search');
  search.value = 'cat';
  search.dispatch('input');
  await page.settle();
  const found = searchEmoji(groups, 'cat');
  const withMatch = groups.filter((g) => g.items.some((it) => found.includes(it))).map((g) => g.name);
  assert.ok(withMatch.length >= 2 && withMatch.length < groups.length, withMatch.join(', '));
  assert.deepEqual(names(panel), withMatch, 'only groups with a match');
  for (const h of panel.querySelectorAll('.emoji-all-group')) assert.equal(h.getAttribute('aria-expanded'), 'true');
  await filled(panel, found.length);
  assert.equal(panel.querySelectorAll('[data-any]').length, found.length);
  assert.ok(anyButton(panel, '🐈'), 'cat');
  const animals = head(panel, 'Animals & nature');
  assert.equal(animals.querySelector('.emoji-all-count').textContent, String(found.filter((it) => groups[1].items.includes(it)).length), 'the chip counts matches');
  // A heading folds a group of results too.
  animals.dispatch('click');
  assert.equal(gridOf(animals).hidden, true);
  // Cleared: every group again, as folded as before the search.
  search.value = '';
  search.dispatch('input');
  await page.settle();
  assert.deepEqual(names(panel), groups.map((g) => g.name));
  const open = panel.querySelectorAll('.emoji-all-group').filter((h) => h.getAttribute('aria-expanded') === 'true');
  assert.deepEqual(open.map((h) => h.querySelector('.emoji-all-name').textContent), ['Food & drink']);
  // Nothing found: no headings at all, and says so.
  search.value = 'zzzzqq';
  search.dispatch('input');
  await page.settle();
  assert.equal(panel.querySelectorAll('.emoji-all-group').length, 0);
  assert.match(panel.querySelector('[role="status"]').textContent, /No emoji called/);
  panel.querySelector('.emoji-back').dispatch('click');
  $('#avatar-dialog').close();
});

test('keys: Down from the search reaches the first heading, Enter toggles it (a button), arrows skip folded groups', async () => {
  openAvatar(state.personId);
  const panel = await searchAll('#avatar-grid', '');
  for (const h of panel.querySelectorAll('.emoji-all-group')) if (h.getAttribute('aria-expanded') === 'true') h.dispatch('click');
  const search = panel.querySelector('.emoji-search');
  const smileys = head(panel, 'Smileys & people');
  const animals = head(panel, 'Animals & nature');
  const food = head(panel, 'Food & drink');
  // All folded: Down goes to the first heading, Down again to the next heading.
  key(search, 'ArrowDown');
  assert.equal(document.activeElement, smileys);
  key(smileys, 'ArrowDown');
  assert.equal(document.activeElement, animals);
  key(animals, 'ArrowUp');
  assert.equal(document.activeElement, smileys);
  key(smileys, 'ArrowUp');
  assert.equal(document.activeElement, search);
  // Open Smileys and Food; Animals stays folded between them. (Enter and
  // Space on a heading are the button's own click.)
  smileys.dispatch('click');
  food.dispatch('click');
  const smileyCount = groups[0].items.length;
  await filled(panel, smileyCount + groups[2].items.length);
  const sm = [...gridOf(smileys).children];
  const fd = [...gridOf(food).children];
  // Down from a heading goes into its open group.
  key(smileys, 'ArrowDown');
  assert.equal(document.activeElement, sm[0]);
  assert.equal(sm[0].tabIndex, 0);
  // Right from the last smiley skips folded Animals to the first food.
  sm.at(-1).focus();
  key(sm.at(-1), 'ArrowRight');
  assert.equal(document.activeElement, fd[0], 'skips the folded group');
  key(fd[0], 'ArrowLeft');
  assert.equal(document.activeElement, sm.at(-1));
  // Down from the last row leaves by the next heading (folded Animals); Up from a first row goes to its own heading.
  key(sm.at(-1), 'ArrowDown');
  assert.equal(document.activeElement, animals);
  key(fd[1], 'ArrowUp');
  assert.equal(document.activeElement, food);
  // Up from a heading goes to the group above's last emoji, or its heading when folded.
  key(food, 'ArrowUp');
  assert.equal(document.activeElement, animals);
  key(animals, 'ArrowUp');
  assert.equal(document.activeElement, sm.at(-1));
  // Rows: four columns in this stand-in.
  key(sm[0], 'ArrowDown');
  assert.equal(document.activeElement, sm[4]);
  panel.querySelector('.emoji-back').dispatch('click');
  $('#avatar-dialog').close();
});

test('the sound sheet: … then "rocket" picks 🚀, which shows pressed in the short list after ⬅️ Fewer', async () => {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = $('#pads').querySelectorAll('.pad').filter((c) => c.dataset.id)[0];
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#sheet').open, true);
  const panel = await searchAll('#emoji-grid', 'rocket');
  assert.match(panel.querySelector('[role="status"]').textContent, /found/);
  const rocket = anyButton(panel, '🚀');
  assert.equal(rocket.getAttribute('aria-label'), 'rocket');
  rocket.dispatch('click');
  assert.equal(rocket.getAttribute('aria-pressed'), 'true');
  panel.querySelector('.emoji-back').dispatch('click');
  const pressed = $('#emoji-grid').querySelectorAll('[data-emoji]').filter((b) => b.getAttribute('aria-pressed') === 'true');
  assert.deepEqual(pressed.map((b) => b.dataset.emoji), ['🚀']);
  // Opening the sheet again starts on the short list.
  $('#sheet').close();
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#emoji-grid').hidden, false);
  $('#sheet').close();
  $('#edit-toggle').dispatch('click');
});

test('Beats with ⌨️ Keys: a picture from … that another sound has asks first, like the short list; a free one is used at once', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  const emoji = () => $('#dj-grid').children[0].querySelector('[data-picture]');   // 🖼️ Change picture, in the emoji's menu
  const shown = () => $('#dj-grid').children[0].querySelector('.row-emoji');
  emoji().dispatch('click');
  assert.equal($('#pictures').open, true);
  // 🥁 is the kit Snare's picture.
  let panel = await searchAll('#pictures-grid', 'drum');
  const drum = () => anyButton(panel, '🥁');
  assert.match(drum().getAttribute('aria-label'), /^drum with drumsticks, already .+'s picture$/);
  drum().dispatch('click');
  await page.settle();
  assert.equal($('#pictures').open, true, 'not yet');
  assert.match($('#pictures-note').textContent, /already .+'s picture\. Tap it again to use it anyway/);
  assert.ok(drum().classList.contains('armed'));
  // Something free instead: used at once, everywhere.
  panel.querySelector('.emoji-search').value = 'sloth';
  panel.querySelector('.emoji-search').dispatch('input');
  anyButton(panel, '🦥').dispatch('click');
  await page.settle();
  assert.equal($('#pictures').open, false);
  assert.match(shown().textContent, /🦥/);
  // Reopened: the short list, with 🦥 at its end, pressed, before ….
  emoji().dispatch('click');
  const grid = $('#pictures-grid');
  assert.equal(grid.hidden, false);
  assert.equal(grid.children.at(-2).dataset.pick, '🦥');
  assert.equal(grid.children.at(-2).getAttribute('aria-pressed'), 'true');
  panel = await searchAll('#pictures-grid', 'sloth');
  assert.equal(anyButton(panel, '🦥').getAttribute('aria-pressed'), 'true');
  $('#pictures').close();
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

test('a person\'s round picture: any emoji from … becomes their avatar', async () => {
  const id = state.personId;
  openAvatar(id);
  assert.equal($('#avatar-dialog').open, true);
  const panel = await searchAll('#avatar-grid', 'vampire');
  anyButton(panel, '🧛').dispatch('click');
  await page.settle();
  assert.equal($('#avatar-dialog').open, false);
  assert.equal($('.person-menu-btn').children[0].textContent, '🧛');
  openAvatar(id);
  const now = $('#avatar-grid').querySelectorAll('[aria-pressed="true"]');
  assert.deepEqual(now.map((b) => b.dataset.avatar), ['🧛']);
  $('#avatar-dialog').close();
});

test('the full list opens on the group of the picture in use, with it pressed and the Tab stop', async () => {
  openAvatar(state.personId);
  const panel = await searchAll('#avatar-grid', '');
  // 🧛 from the test above: a Smileys & people emoji.
  const open = panel.querySelectorAll('.emoji-all-group').filter((h) => h.getAttribute('aria-expanded') === 'true');
  assert.deepEqual(open.map((h) => h.querySelector('.emoji-all-name').textContent), ['Smileys & people']);
  await filled(panel, groups[0].items.length);
  const vampire = anyButton(panel, '🧛');
  assert.equal(vampire.getAttribute('aria-pressed'), 'true');
  assert.equal(vampire.tabIndex, 0);
  panel.querySelector('.emoji-back').dispatch('click');
  $('#avatar-dialog').close();
});
