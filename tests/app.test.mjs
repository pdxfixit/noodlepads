import { readFileSync } from 'node:fs';
// Starts the real app.js against the stand-in page (tests/fake-dom.mjs) and
// uses it: switch people, edit sounds, open dialogs, show the beat maker.
// Browser-only things (audio, IndexedDB, layout) are absent, so this checks
// wiring and rendering, not sound.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { hasUndo } from './banner.mjs';
import { isFunName } from '../web/names.js';
import { state } from '../web/state.js';
import { newBeatWithRow, newBuilderBeatWithRow, keysOn, keysOff } from './new-beat.mjs';
import { stripChips, chipName, blocksOn, allBlocks, cellAt, pickBeat, dropBeat } from './song-ui.mjs';

let page;
let $;

before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

// How many sounds the shared kit shows (boards.json `kit`), so adding one doesn't break these tests:
// Notes, Chords and Bass as their own sound plays them (no instrument picked, ADR 0030).
const BOARDS = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));
const SHOWN = BOARDS.kit.filter((k) => !k.inst);
const KIT = SHOWN.length;
const SIMPLE_KIT = SHOWN.filter((k) => !k.advanced).length;   // Advanced off: no sharps or flats
// The kit's first group (Drums) is the only one open to begin with.
const FIRST_GROUP = BOARDS.kit.filter((k) => k.group === BOARDS.kitGroups[0].id).length;
const groupHeaders = () => $('#pads').querySelectorAll('.pad-group');   // Notes, Chords and Bass sit in a row with who plays them
const pads = () => $('#pads').querySelectorAll('.pad');   // not the section headings; in Edit sounds each pad sits in a cell with its badges
const headings = () => $('#pads').children.filter((c) => c.classList.contains('pad-section')).map((h) => h.textContent);
const labelOf = (pad) => pad.children.find((c) => c.classList.contains('pad-label')).textContent;
const labels = () => pads().filter((p) => p.dataset.id).map(labelOf);
const people = () => $('#people').querySelectorAll('[data-person]');   // the corner menu's people
// Whose sounds are showing, from the corner button (the headline is always Noodle Pads).
// (A fun name can hold a full stop, "Mx. Mystery", so the count at the end is matched, not split on.)
const who = () => (($('#people .person-menu-btn')?.getAttribute('aria-label') ?? '').match(/^Whose sounds: (.*)\. \d+ (?:people|person)\.$/) ?? [])[1];

test('the app starts: first person, their pads, and a New sound slot', () => {
  assert.equal($('#board-title').textContent, 'Noodle Pads', 'the headline is the app, for everyone');
  assert.equal(document.title, 'Noodle Pads');
  assert.equal(who(), 'Pip', 'the person is in the corner');
  assert.deepEqual(people().map((b) => b.textContent), ['Pip', 'Juno', 'Toby', 'Wren']);
  assert.deepEqual(people().map((b) => b.getAttribute('aria-current')), ['true', 'false', 'false', 'false']);
  // Each board lists its own four sounds, then the kit every board shares, in
  // groups: only the first (Drums) is open to begin with.
  assert.deepEqual(labels().slice(0, 4), ['Pip Pads!', 'Airhorn', 'Laser', 'Boing']);
  assert.equal(labels().length, 4 + FIRST_GROUP);
  assert.equal(labels()[4], 'Kick');
  assert.equal(groupHeaders().length, BOARDS.kitGroups.length);
  assert.deepEqual(groupHeaders().map((h) => h.getAttribute('aria-expanded')), BOARDS.kitGroups.map((_, i) => String(i === 0)));
  // Two sections: the person's own sounds ending with New sound, then the kit.
  assert.deepEqual(headings(), ['Pip\u2019s sounds', 'Presets']);
  assert.ok(pads()[4].classList.contains('pad-add'));
  assert.equal(labelOf(pads()[5]), 'Kick');
  assert.equal(globalThis.location.hash, '#pip');
});

test('the first nine pads are numbered for the keyboard, and decoration is hidden from screen readers', () => {
  const first = pads()[0];
  assert.equal(first.children.find((c) => c.classList.contains('pad-key')).textContent, '1');
  assert.equal(first.children.find((c) => c.classList.contains('pad-emoji')).getAttribute('aria-hidden'), 'true');
});

test('a dev copy says so (no version.json is served)', () => {
  assert.equal($('#version').textContent, 'dev copy');
});

// Ben, 2026-10-11: tapping the version or date opens Settings at the bottom,
// About and the credits.
test('the footer\'s version is a button that opens Settings scrolled to About', () => {
  const version = $('#version');
  const dialog = $('#settings-dialog');
  assert.equal(version.tagName.toLowerCase(), 'button', 'keyboard reachable');
  assert.equal(version.getAttribute('aria-label'), 'About Noodle Pads');
  dialog.scrollHeight = 1200;
  dialog.scrollTop = 0;
  version.dispatch('click');
  assert.equal(dialog.open, true);
  assert.equal(dialog.scrollTop, 1200, 'scrolled to the end: About');
  // Ben, 2026-10-11: the version sits at the very bottom of About, centered.
  const about = $('#about-version');
  assert.equal(about.textContent, $('#version').textContent || 'dev copy');
  // Its line also links the privacy policy (Ben, 2026-10-16: "next to the version").
  const line = about.parent;
  assert.equal(line.className, 'set-version');
  assert.equal(line.children.at(-1).className, 'privacy-link', 'the privacy policy beside it');
  assert.equal(line.parent.children.at(-1), line, 'last in About');
  assert.equal(dialog.querySelectorAll('section').at(-1), line.parent, 'and About is the last section');
  dialog.close();
  // ⚙️ opens it at the top, as before.
  dialog.scrollTop = 0;
  $('#settings-open').dispatch('click');
  assert.equal(dialog.scrollTop, 0);
  dialog.close();
});

test('tapping a person shows their board and sets the page color', () => {
  people()[1].dispatch('click');
  assert.equal(who(), 'Juno');
  assert.deepEqual(labels().slice(0, 4), ['Juno Pads!', 'Ba dum tss', 'Drumroll', 'Laser']);
  assert.equal(document.documentElement.style.props['--board'], '#0C5E4B');
  assert.equal(globalThis.location.hash, '#juno');
  assert.equal(people()[1].getAttribute('aria-current'), 'true');
});

test('arrow keys step between people, wrapping around', () => {
  page.key('ArrowRight');
  assert.equal(who(), 'Toby');
  page.key('ArrowLeft'); page.key('ArrowLeft'); page.key('ArrowLeft');
  assert.equal(who(), 'Wren');
  page.key('ArrowRight');
  assert.equal(who(), 'Pip');
});

test('arrow keys do nothing in a text field, behind a dialog, or when a control used them', () => {
  const field = new (people()[0].constructor)('input');
  const before = who();
  page.key('ArrowRight', { target: field });
  assert.equal(who(), before);
  const used = page.key('ArrowRight', { defaultPrevented: true });
  assert.equal(used.defaultPrevented, true);
  assert.equal(who(), before);
  $('#people-dialog').open = true;
  page.key('ArrowRight');
  assert.equal(who(), before);
  $('#people-dialog').open = false;
});

test('Edit sounds: each pad has its circle, ✏️ and 🗑️ from the start; tapping a pad or its circle selects it', async () => {
  $('#edit-toggle').dispatch('click');
  assert.ok(document.body.classList.contains('editing'));
  assert.equal($('#edit-toggle').textContent, '✅ Done');
  assert.match($('#screen-hint').textContent, /^Editing:.*✏️.*🗑️.*select.*(drag|Drag)/, 'the footer how-to says all of how to edit');
  assert.equal($('#edit-tools'), null, 'the tools row is gone: People and Backups live in Settings');
  const mine = () => pads().filter((p) => p.dataset.id);
  assert.ok(mine().every((p) => p.getAttribute('aria-pressed') === 'false'));
  assert.ok(mine().every((p) => p.getAttribute('aria-label').startsWith(`Select ${labelOf(p)}`)), 'a screen reader hears "Select Kick"');
  assert.ok(mine().every((p) => p.parent.querySelector('[data-edit]').getAttribute('aria-label') === `Edit ${labelOf(p)}`));
  // Ben, 2026-10-11: "if each editing sound tile is going to have the badge, it should have selection bubble as well (on the left)".
  assert.equal($('#pads').querySelectorAll('.pad-check').length, mine().length, 'every pad shows its circle from the start');
  assert.ok($('#pads').querySelectorAll('.pad-check').every((c) => c.textContent === ''));
  assert.equal($('#pads-chosen').hidden, true);

  const before = labels();
  mine()[0].dispatch('click');
  assert.equal(mine()[0].getAttribute('aria-pressed'), 'true');
  assert.equal(mine()[0].parent.querySelector('.pad-check').textContent, '✓');
  mine()[1].parent.querySelector('[data-pick]').dispatch('click');
  assert.equal(mine()[1].getAttribute('aria-pressed'), 'true', 'tapping the circle selects too');
  assert.equal($('#chosen-count').textContent, '2 selected');
  mine()[1].parent.querySelector('[data-pick]').dispatch('click');
  assert.equal(mine()[1].getAttribute('aria-pressed'), 'false', 'and lets go again');
  assert.equal($('#pads-chosen').hidden, false);
  assert.equal($('#chosen-count').textContent, '1 selected');
  mine()[2].dispatch('click');
  assert.equal($('#chosen-count').textContent, '2 selected');
  assert.deepEqual(labels(), before, 'choosing moves nothing');
  mine()[0].dispatch('click');
  assert.equal($('#chosen-count').textContent, '1 selected');
  assert.equal($('#sheet').open, false, 'a second tap no longer opens the sheet: ✏️ does');
});

test('Esc clears what is selected', () => {
  assert.equal($('#chosen-count').textContent, '1 selected');
  page.key('Escape');
  assert.equal($('#pads-chosen').hidden, true);
  assert.ok(pads().every((p) => p.getAttribute('aria-pressed') !== 'true'));
  assert.ok($('#pads').querySelectorAll('.pad-check').every((c) => c.textContent === ''), 'every circle empty again');
});

test('Edit sounds: Alt+← and Alt+→ move the focused pad within its section', async () => {
  const pad = (label) => pads().find((p) => p.dataset.id && labelOf(p) === label);
  const [a, b, c, d] = labels();
  pad(a).dispatch('keydown', { key: 'ArrowRight', altKey: true });
  await page.settle();
  pad(a).dispatch('keydown', { key: 'ArrowRight', altKey: true });
  await page.settle();
  assert.deepEqual(labels().slice(0, 4), [b, c, a, d]);
  pad(c).dispatch('keydown', { key: 'ArrowLeft', altKey: true });
  await page.settle();
  assert.deepEqual(labels().slice(0, 4), [c, b, a, d]);
  assert.deepEqual(state.orders.get(state.personId).ids.slice(0, 4), [c, b, a, d].map((l) => pad(l).dataset.id), 'kept as their order');
  // The last own sound stays put: a kit pad is in another section.
  const ownCount = pads().findIndex((p) => p.classList.contains('pad-add'));
  const last = pads()[ownCount - 1];
  const name = labelOf(last);
  last.dispatch('keydown', { key: 'ArrowRight', altKey: true });
  await page.settle();
  assert.equal(labels()[ownCount - 1], name);
});

test('tapping a pad twice opens its editor, focused on the name, and saving renames it', async () => {
  const pad = pads()[1];
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  const sheet = $('#sheet');
  assert.equal(sheet.open, true);
  assert.equal($('#sheet-title').textContent, 'Edit sound');
  assert.equal($('#clip-label').value, 'Airhorn', 'the name is the title, ready to rename');
  assert.equal($('#clip-label').value, 'Airhorn');
  assert.equal(document.activeElement, $('#clip-label'));
  assert.equal($('#capture').hidden, true);
  assert.equal($('#remove-btn').textContent, 'Hide sound');
  assert.equal($('#voices').children.length, 14);
  assert.ok($('#voices').children.every((b) => !b.disabled));

  $('#clip-label').value = 'Honk';
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(sheet.open, false);
  assert.deepEqual(labels().slice(0, 4), ['Laser', 'Honk', 'Pip Pads!', 'Boing']);
});

test('Hide sound hides the pad in play mode and shows it, dimmed and badged, in edit mode', async () => {
  const pad = pads()[1];
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  $('#remove-btn').dispatch('click');
  await page.settle();
  assert.equal($('#sheet').open, false);
  const hidden = pads().find((p) => p.classList.contains('hidden-clip'));
  assert.ok(hidden);
  assert.ok(hidden.children.some((c) => c.textContent === 'Hidden'));
  $('#edit-toggle').dispatch('click');
  assert.ok(!labels().includes('Honk'));
  $('#edit-toggle').dispatch('click');
});

test('New sound opens the sheet with Record off (no microphone here) and focus on Choose a file', () => {
  $('#edit-toggle').dispatch('click');  // back to play mode
  assert.match($('#screen-hint').textContent, /^Tap a pad/, 'and the footer says how to play again');
  pads().find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#sheet').open, true);
  assert.equal($('#sheet-title').textContent, 'New sound for Pip');
  // A made-up name is offered in the name field; typing replaces it.
  assert.equal($('#clip-label').value, '');
  assert.ok($('#clip-label').placeholder.length > 2);
  assert.ok(!pads().some((p) => p.textContent.includes($('#clip-label').placeholder)), 'not a name already on the board');
  assert.equal($('#capture').hidden, false);
  assert.equal($('#rec-btn').disabled, true);
  assert.equal(document.activeElement, $('#file-input'));
  assert.equal($('#voice-hint').hidden, false);
  assert.equal($('#wave-box').hidden, true, 'no wave until there is a sound');
  assert.ok($('#voices').children.every((b) => b.disabled));
  assert.equal($('#sheet-error').hidden, true);
  $('#sheet-form').dispatch('submit');
  assert.equal($('#sheet-error').textContent, 'Record a sound, choose a file, or make one first.');
  assert.equal($('#sheet-error').hidden, false);
  $('#sheet').close();
});

// 👥 People's line `i` opens that person's profile sheet (once: a second
// call while it is open for them leaves it as it is).
const profile = (i) => {
  const line = $('#people-edit').children[i].querySelector('[data-profile]');
  if (!$('#profile-dialog').open || $('#profile-reroll').dataset.reroll !== line.dataset.profile) line.dispatch('click');
  return $('#profile-dialog');
};

test('the People dialog is a short list, one line per person; a line opens their profile sheet, with color names a screen reader can say', () => {
  $('#edit-toggle').dispatch('click');
  $('#people-open').dispatch('click');
  assert.equal($('#people-dialog').open, true);
  const rows = $('#people-edit').children;
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.querySelectorAll('button').length === 1), 'one button per line: no swatches, 🎲 or Delete in the list');
  assert.equal($('#people-edit').querySelectorAll('[data-color]').length, 0);
  assert.match(rows[0].querySelector('[data-profile]').getAttribute('aria-label'), /^Pip: .*Opens their profile\.$/);
  const sheet = profile(0);
  assert.equal(sheet.open, true);
  assert.equal($('#profile-name').textContent, 'Pip');
  const colors = $('#profile-colors').querySelectorAll('[data-color]');
  assert.equal(colors.length, 10, 'every person color');
  assert.equal(colors[0].getAttribute('aria-label'), 'Blue');
  assert.equal(colors[0].getAttribute('aria-pressed'), 'true');
  assert.equal($('#profile-delete').textContent, 'Delete');
  assert.equal($('#profile-delete').getAttribute('aria-label'), 'Delete Pip');
  assert.equal($('#profile-cloud').hidden, true, "boards.json's own people have no cloud");
  assert.equal($('#people-gone').hidden, true, 'nobody is deleted yet');
});

test('picking a person color in their profile recolors the board and their line, and keeps focus on the same swatch', async () => {
  const swatch = profile(0).querySelectorAll('[data-color]')[2];
  swatch.focus();
  swatch.dispatch('click');
  await page.settle();
  assert.equal(document.documentElement.style.props['--board'], '#9E1640');
  const again = $('#profile-colors').querySelectorAll('[data-color]')[2];
  assert.equal(document.activeElement, again);
  assert.equal(again.getAttribute('aria-pressed'), 'true');
  assert.equal($('#people-edit').children[0].style.props['--c'], '#9E1640', 'the list line too');
  $('#profile-dialog').close();
});

test('adding a person puts them on the end of the row with a fun name (nobody types one) and focus on 🎲', async () => {
  $('#person-add').dispatch('click');
  await page.settle();
  const added = [...state.peopleEdits.values()].filter((p) => p.added).at(-1);
  const fun = added.name;
  assert.deepEqual(people().map((b) => b.textContent), ['Pip', 'Juno', 'Toby', 'Wren', `${added.avatar} ${fun}`], 'a picture of their own from the start');
  assert.ok(isFunName(fun), `"${fun}" comes from the fun-name generator`);
  assert.equal($('#people-edit').querySelectorAll('input').length, 0, 'no name field anywhere');
  assert.match(document.activeElement?.dataset?.profile ?? '', /^p-/, 'focus on the new person\'s line');
  assert.equal(who(), fun);
  assert.equal(labels().length, FIRST_GROUP); // a new person starts with the shared kit (Drums open)
  assert.equal(labels()[0], 'Kick');
  assert.equal($('#people-edit').children.length, 5);
});

test('deleting an added person (in their profile) asks twice, then removes them and closes the sheet', async () => {
  const remove = profile(4).querySelector('[data-remove]');
  assert.equal(remove.textContent, 'Delete');
  remove.dispatch('click');
  assert.equal(remove.textContent, 'Tap again to delete');
  assert.equal(people().length, 5);
  $('#profile-colors').querySelectorAll('[data-color]')[0].dispatch('click');
  await page.settle();
  assert.equal(remove.textContent, 'Delete', 'any other tap takes it back');
  remove.dispatch('click');
  remove.dispatch('click');
  await page.settle();
  assert.deepEqual(people().map((b) => b.textContent), ['Pip', 'Juno', 'Toby', 'Wren']);
  assert.equal($('#people-edit').children.length, 4);
  assert.equal($('#profile-dialog').open, false);
  $('#people-dialog').close();
});

const removeButton = (i) => profile(i).querySelector('[data-remove]');
const deleteRow = async (i) => { removeButton(i).dispatch('click'); removeButton(i).dispatch('click'); await page.settle(); };

test('deleting Pip (from boards.json) asks twice, then removes his sounds, beats, beat on screen and pad order', async () => {
  const pipSound = { id: 'user-test-1', personId: 'pip', label: 'Mine', created: 1, blob: new Blob(['x']), mime: 'audio/webm' };
  const junoSound = { id: 'user-test-2', personId: 'juno', label: 'Junos', created: 2, blob: new Blob(['x']), mime: 'audio/webm' };
  state.userClips.push(pipSound, junoSound);
  state.savedBeats.push({ id: 'beat-test-1', personId: 'pip', name: 'Groove', bpm: 100, rows: [], created: 1, saved: 1 });
  state.patterns.set('pip', { personId: 'pip', name: 'x', bpm: 100, rows: [] });
  state.orders.set('pip', { personId: 'pip', ids: ['pip-laser'] });
  $('#people-open').dispatch('click');
  assert.equal(removeButton(0).textContent, 'Delete (and 🔊 1 sound)');
  assert.equal($('#people-edit').children[0].querySelector('.pe-counts').textContent, '🔊\u00a01\u00a0· 🥁\u00a01', 'the row says what Pip has here');
  assert.equal($('#people-edit').children[0].querySelector('.pe-counts').getAttribute('aria-label'), 'Pip has 1 sound, 1 beat');

  removeButton(0).dispatch('click');
  assert.equal(removeButton(0).textContent, 'Tap again to delete');
  assert.equal(people().length, 4, 'one tap only arms it');
  removeButton(0).dispatch('click');
  await page.settle();

  assert.deepEqual(people().map((b) => b.textContent), ['Juno', 'Toby', 'Wren']);
  assert.equal(who(), 'Juno');
  assert.deepEqual(state.userClips.map((c) => c.id), ['user-test-2'], 'only Juno keeps his recording');
  assert.equal(state.savedBeats.length, 0);
  assert.equal(state.patterns.has('pip'), false);
  assert.equal(state.orders.has('pip'), false);
  assert.deepEqual(state.peopleEdits.get('pip'), { id: 'pip', hidden: true }, 'kept only as a hidden record');
  assert.equal($('#people-edit').children.length, 3);
  assert.equal($('#people-gone').hidden, false);
  assert.deepEqual($('#people-gone-list').children.map((li) => li.children[0].textContent), ['Pip']);
});

test('Bring back restores a deleted boards.json person with his bundled sounds but not the recorded ones', async () => {
  const back = $('#people-gone-list').children[0].querySelector('[data-restore]');
  assert.equal(back.getAttribute('aria-label'), 'Bring back Pip');
  back.dispatch('click');
  await page.settle();
  assert.deepEqual(people().map((b) => b.textContent), ['Pip', 'Juno', 'Toby', 'Wren']);
  assert.equal(state.peopleEdits.has('pip'), false, 'nothing differs from boards.json again');
  assert.equal($('#people-gone').hidden, true);
  people()[0].dispatch('click');
  // His pad order went with the delete, so the swap from earlier is undone; the rename (Honk) is an edit to a bundled sound and stays.
  assert.deepEqual(labels().slice(0, 4), ['Pip Pads!', 'Honk', 'Laser', 'Boing']);
  assert.ok(!state.userClips.some((c) => c.personId === 'pip'));
  state.userClips = state.userClips.filter((c) => c.id !== 'user-test-2');
});

test('the last person on show cannot be deleted', async () => {
  await deleteRow(0); await deleteRow(0); await deleteRow(0);  // Pip, Juno, Toby
  // One board left: someone with a name still shows in the corner.
  assert.equal($('#people').hidden, false);
  assert.equal(people().length, 1);
  assert.equal(who(), 'Wren');
  assert.equal($('#people-edit').children.length, 1);
  assert.equal($('#people-edit').children[0].dataset.person, 'wren');
  assert.equal(removeButton(0).disabled, true);
  $('#profile-dialog').close();
  assert.equal($('#people-gone-list').children.length, 3);
  for (let i = 0; i < 3; i++) { $('#people-gone-list').children[0].querySelector('[data-restore]').dispatch('click'); await page.settle(); }
  assert.equal(people().length, 4);
  assert.equal($('#people').hidden, false);
  $('#people-dialog').close();
});

test('Beats shows the beat maker in place of the pads; 🆕 New starts with no rows, and + Add a row adds one of 16 pills', () => {
  people()[0].dispatch('click');
  $('#edit-toggle').dispatch('click');
  $('#beats-toggle').dispatch('click');
  assert.equal($('#seq').hidden, false);
  assert.equal($('#pads').hidden, true);
  // The toolbar is a switch of three screens; Edit sounds belongs to the pads.
  assert.equal($('#beats-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal($('#pads-tab').getAttribute('aria-pressed'), 'false');
  assert.equal($('#pads-bar').hidden, true);
  assert.equal(document.body.classList.contains('editing'), false, 'going to Beats ends Edit sounds');
  // Nothing is made for you: the scratch beat is open, ready to play with
  // (ADR 0020), and nothing is saved until it changes.
  const bar = document.querySelectorAll('.beat-bar')[0];
  const name = bar.querySelector('[data-beat-name]');
  assert.equal(name.hidden, false);
  assert.equal(name.value, 'Scratch beat');
  assert.ok(!name.readOnly, 'a name typed here keeps it');
  assert.equal(bar.querySelector('[data-beat-rename]').hidden, true, '💾 Keep stands where ✏️ is');
  assert.equal(bar.querySelector('[data-beat-keep]').hidden, false);
  assert.equal(bar.querySelector('[data-beat-keep]').disabled, true, 'nothing to keep yet');
  assert.equal($('#seq-deck').hidden, false, 'Play and the tempo');
  assert.equal($('#seq-shape-line').hidden, false, 'the bars');
  assert.equal($('#seq-add').hidden, false, '+ Add a row');
  assert.equal(state.savedBeats.filter((b) => b.personId === 'pip').length, 0, 'and nothing joined the list');
  // 🆕 New opens a blank scratch (Ben, 2026-10-12): nothing joins the list.
  bar.querySelector('[data-beat-new]').dispatch('click');
  assert.equal($('#seq-deck').hidden, false);
  assert.equal(name.value, 'Scratch beat');
  assert.equal(bar.querySelector('[data-beat-keep]').hidden, false, '💾 Keep, for when it has something');
  assert.equal(state.savedBeats.filter((b) => b.personId === 'pip').length, 0, '🆕 New adds nothing to 🗂️ My beats');
  assert.equal(hasUndo(), false, 'an empty scratch emptied needs no Undo');
  // A new beat is empty (Ben, 2026-10-11): a line says how to fill it.
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  assert.equal(rows().length, 0, 'no rows');
  assert.equal($('#seq-no-rows').hidden, false);
  assert.match($('#seq-no-rows').textContent, /\+\sAdd\sa\srow/);
  assert.match($('#seq-no-rows').textContent, /💃\sGrooves/);
  assert.equal($('#seq-add').hidden, false, '+ Add a row is there');
  assert.equal($('#seq-grooves').hidden, false, 'and 💃 Grooves');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  assert.equal($('#seq-no-rows').hidden, true, 'the line goes with the first row');
  assert.equal(rows().length, 1);
  const pills = rows()[0].querySelectorAll('.pill');
  assert.equal(pills.length, 16);
  assert.equal(pills[0].getAttribute('aria-label'), 'Row 1, Pip Pads!: beat 1, part 1');
  assert.equal(pills[15].getAttribute('aria-label'), 'Row 1, Pip Pads!: beat 4, part 4');
  assert.deepEqual(pills.map((p) => p.tabIndex), [0, ...Array(15).fill(-1)]);
  // 💾 Keep: now it is a named beat in 🗂️ My beats, for the tests below.
  bar.querySelector('[data-beat-keep]').dispatch('click');
  assert.notEqual(name.value, 'Scratch beat', 'a named beat');
  assert.equal(state.savedBeats.filter((b) => b.personId === 'pip' && !b.id.startsWith('beat-scratch-')).length, 1, '💾 Keep puts it in the list');
});

test('the grid shows its count: the first pill of each bar is the "1", and each beat starts a shade brighter', () => {
  const pills = $('#seq-rows').children.filter((c) => c.classList.contains('seq-row') && !c.classList.contains('collapsed'))[0].querySelectorAll('.pill').filter((p) => !p.hidden);
  const kind = (p) => (p.classList.contains('one') ? '1' : p.classList.contains('beat-start') ? 'b' : '.');
  assert.equal(pills.map(kind).join('').slice(0, 16), '1...b...b...b...');
});

test('beat pills: one tap switches on or off; a hold (or Shift) makes a loud hit; arrow keys move the one Tab stop', async () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const pill = (r, s) => rows()[r].querySelectorAll('.pill')[s];
  // One tap on, one tap off (Ben, 2026-10-11: never two taps).
  pill(0, 0).dispatch('click');
  assert.equal(pill(0, 0).getAttribute('aria-pressed'), 'true');
  assert.equal(pill(0, 0).classList.contains('loud'), false);
  pill(0, 0).dispatch('click');
  assert.equal(pill(0, 0).getAttribute('aria-pressed'), 'false');
  // Holding a pill makes it loud; the click that ends the hold changes nothing more.
  pill(0, 0).dispatch('pointerdown', { button: 0, clientX: 5, clientY: 5 });
  await new Promise((r) => setTimeout(r, 500));
  pill(0, 0).dispatch('pointerup');
  pill(0, 0).dispatch('click');
  assert.equal(pill(0, 0).getAttribute('aria-pressed'), 'true');
  assert.ok(pill(0, 0).classList.contains('loud'));
  assert.match(pill(0, 0).getAttribute('aria-label'), /, loud$/);
  // A short press is just a tap: off.
  pill(0, 0).dispatch('pointerdown', { button: 0, clientX: 5, clientY: 5 });
  pill(0, 0).dispatch('pointerup');
  pill(0, 0).dispatch('click');
  assert.equal(pill(0, 0).getAttribute('aria-pressed'), 'false');
  assert.doesNotMatch(pill(0, 0).getAttribute('aria-label'), /loud/);
  // Shift (Shift+Space on a keyboard) makes it loud too, and again makes it normal.
  pill(0, 0).dispatch('click', { shiftKey: true });
  assert.ok(pill(0, 0).classList.contains('loud'));
  pill(0, 0).dispatch('click', { shiftKey: true });
  assert.equal(pill(0, 0).classList.contains('loud'), false);
  assert.equal(pill(0, 0).getAttribute('aria-pressed'), 'true');
  pill(0, 0).dispatch('click');

  const event = pill(0, 0).dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(pill(0, 1).tabIndex, 0);
  assert.equal(pill(0, 0).tabIndex, -1);
  assert.equal(document.activeElement, pill(0, 1));
  const other = pill(0, 1).dispatch('keydown', { key: 'a' });
  assert.equal(other.defaultPrevented, false);
});

test('Add a row adds a second row, and arrow keys then reach it', () => {
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const rows = $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  assert.equal(rows.length, 2);
  const first = rows[0].querySelectorAll('.pill')[1];
  first.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, rows[1].querySelectorAll('.pill')[1]);
});

test('row grips: none with one row; up and down arrows on a grip move its row', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const sound = (r) => rows()[r].querySelector('[data-pick]').getAttribute('aria-label').split('.')[0];
  assert.equal(rows().length, 2);
  assert.ok(rows().every((r) => !r.querySelector('[data-grip]').hidden));
  const [first, second] = [sound(0), sound(1)];
  rows()[0].querySelectorAll('.pill')[3].dispatch('click');
  const down = rows()[0].querySelector('[data-grip]').dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(down.defaultPrevented, true);
  assert.equal(sound(0), second.replace('Row 2', 'Row 1'));
  assert.equal(sound(1), first.replace('Row 1', 'Row 2'));
  assert.equal(rows()[1].querySelectorAll('.pill')[3].getAttribute('aria-pressed'), 'true', 'the pills go with the row');
  assert.equal(document.activeElement, rows()[1].querySelector('[data-grip]'));
  rows()[1].querySelector('[data-grip]').dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(sound(0), first);
  rows()[0].querySelectorAll('.pill')[3].dispatch('click');   // tidy up: one tap turns it off
});

test('tapping the tempo number lets you type one; arrow keys on the slider move one BPM', () => {
  $('#seq-bpm-out').dispatch('click');
  assert.equal($('#seq-bpm-type').hidden, false);
  assert.equal($('#seq-bpm-out').hidden, true);
  assert.equal(document.activeElement, $('#seq-bpm-type'));
  $('#seq-bpm-type').value = '159';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
  assert.equal($('#seq-bpm-type').hidden, true);
  assert.equal($('#seq-bpm-out').textContent, '159 BPM');
  assert.equal($('#seq-bpm').getAttribute('aria-valuetext'), '159 BPM');
  $('#seq-bpm').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal($('#seq-bpm-out').textContent, '160 BPM');
  // Esc leaves the tempo alone.
  $('#seq-bpm-out').dispatch('click');
  $('#seq-bpm-type').value = '90';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Escape' });
  assert.equal($('#seq-bpm-out').textContent, '160 BPM');
  $('#seq-bpm-out').dispatch('click');                                 // back to 100 for the tests after
  $('#seq-bpm-type').value = '100';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
});

test('Beats tempo: on a short line ⌄ ⌃ step through the common tempos', () => {
  $('#beats-toggle').dispatch('click');
  const box = $('#seq-deck').querySelector('.beat-tempo');
  const was = $('#seq-bpm-out').textContent;
  $('#seq-bpm-out').dispatch('click');
  $('#seq-bpm-type').value = '100';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
  box.querySelector('[data-tempo-step="1"]').dispatch('click');
  assert.equal($('#seq-bpm-out').textContent, '110 BPM');
  box.querySelector('[data-tempo-step="-1"]').dispatch('click');
  box.querySelector('[data-tempo-step="-1"]').dispatch('click');
  assert.equal($('#seq-bpm-out').textContent, '90 BPM');
  $('#seq-bpm-out').dispatch('click');
  $('#seq-bpm-type').value = was.split(' ')[0];
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
});

// ADR 0020: a groove loads into the scratch beat, copying nothing into
// 🗂️ My beats; the beat that was open stays as it was.
test('a groove loads into the scratch beat, copying nothing, and Undo goes back to the beat that was open', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const sounds = () => rows().map((r) => (r.querySelector('[data-pick]') || r.querySelector('.seq-slim')).getAttribute('aria-label').split('.')[0].replace(/^Row \d+: /, ''));
  const name = () => $('.beat-bar [data-beat-name]').value;
  const listed = () => state.savedBeats.filter((b) => b.personId === state.personId && !b.id.startsWith('beat-scratch-')).map((b) => b.name).sort();
  const before = { sounds: sounds(), name: name(), listed: listed() };
  $('#seq-grooves').dispatch('click');
  assert.match($('#groove-hint').textContent, /^Loads the groove into your scratch beat/);
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  assert.equal($('#grooves').open, false, 'no asking: nothing is overwritten');
  assert.deepEqual(sounds(), ['Kick', 'Clap', 'Hi-hat']);
  assert.equal(name(), 'Four on the floor (scratch)');
  assert.equal($('.beat-bar [data-beat-keep]').hidden, false, '💾 Keep shows');
  assert.equal($('#seq-bpm-out').textContent, '120 BPM');
  assert.equal($('#banner-text').textContent, 'Loaded “Four on the floor” into your scratch beat.');
  assert.deepEqual(listed(), before.listed, 'nothing new in 🗂️ My beats');
  $('#banner-action').dispatch('click');
  assert.deepEqual(sounds(), before.sounds);
  assert.equal(name(), before.name);
  assert.deepEqual(listed(), before.listed);
  assert.ok(!state.savedBeats.some((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId), 'and the scratch is as it was: never saved');
  $('#beats-toggle').dispatch('click');
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  assert.ok(!$('#lib-list').children.some((li) => /Four on the floor/.test(li.querySelector('.lib-name')?.textContent)), 'no groove beat in 🗂️ My beats');
  $('#library').close();
});

// ADR 0020: a groove over a scratch with hits warns in one line, with Undo;
// 💾 Keep names a groove "<fun name> (<groove> version)", and the scratch
// starts empty again.
test('a groove over a scratch with hits says so, with Undo; 💾 Keep makes it a named beat and empties the scratch', () => {
  const name = () => $('.beat-bar [data-beat-name]').value;
  const scratch = () => state.savedBeats.find((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId);
  const opened = name();
  $('#seq-grooves').dispatch('click');
  $('#groove-list').querySelector('[data-groove="trap"]').dispatch('click');
  assert.equal(name(), 'Trap (scratch)');
  assert.ok(scratch(), 'the scratch is saved, like any beat');
  $('#seq-grooves').dispatch('click');
  $('#groove-list').querySelector('[data-groove="ska"]').dispatch('click');
  assert.equal(hasUndo(), true);
  assert.equal($('#banner-text').textContent, '“Ska” replaced your scratch beat.');
  $('#banner-action').dispatch('click');
  assert.equal(name(), 'Trap (scratch)', 'Undo brings back the scratch as it was');
  assert.equal(scratch().name, 'Trap');
  $('#seq-grooves').dispatch('click');
  $('#groove-list').querySelector('[data-groove="ska"]').dispatch('click');
  const listed = state.savedBeats.filter((b) => b.personId === state.personId).length;
  $('.beat-bar [data-beat-keep]').dispatch('click');
  assert.match(name(), /^\S+( \S+)? \(Ska version\)$/, 'a fun name and the groove');
  assert.ok(name().length <= 24);
  assert.equal($('.beat-bar [data-beat-keep]').hidden, true, 'a named beat: ✏️ again');
  assert.equal($('.beat-bar [data-beat-rename]').hidden, false);
  const kept = state.savedBeats.find((b) => b.name === name());
  assert.ok(kept && !kept.id.startsWith('beat-scratch-'), 'in 🗂️ My beats under its own id');
  assert.equal(scratch(), undefined, 'the scratch starts empty again');
  assert.equal(state.savedBeats.filter((b) => b.personId === state.personId).length, listed, 'one in, one out');
  // Deleting the open beat opens the scratch, empty.
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const del = () => $('#lib-list').querySelector(`[data-delete="${kept.id}"]`);
  del().dispatch('click');
  del().dispatch('click');
  $('#library').close();
  assert.equal(name(), 'Scratch beat');
  assert.equal($('#seq-rows').children.filter((c) => c.classList.contains('seq-row')).length, 0);
  // Back to the beat that was open before.
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const back = state.savedBeats.find((b) => b.name === opened);
  $('#lib-list').querySelector(`[data-load="${back.id}"]`).dispatch('click');
  assert.equal(name(), opened);
});

test('➕ Add to this beat lays a groove over the open beat, keeping its tempo and name; Undo takes it back out', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const sounds = () => rows().map((r) => (r.querySelector('[data-pick]') || r.querySelector('.seq-slim')).getAttribute('aria-label').split('.')[0].replace(/^Row \d+: /, ''));
  const name = () => $('.beat-bar [data-beat-name]').value;
  const before = { sounds: sounds(), name: name(), bpm: $('#seq-bpm-out').textContent };
  $('#seq-grooves').dispatch('click');
  const how = $('#groove-how');
  assert.equal(how.querySelector('[data-how="load"]').getAttribute('aria-pressed'), 'true', 'into the scratch unless asked');
  how.querySelector('[data-how="add"]').dispatch('click');
  assert.equal(how.querySelector('[data-how="add"]').getAttribute('aria-pressed'), 'true');
  assert.match($('#groove-hint').textContent, /^Adds/);
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  assert.equal(name(), before.name, 'the same beat');
  assert.equal($('#seq-bpm-out').textContent, before.bpm, 'at its own tempo');
  for (const s of ['Kick', 'Clap', 'Hi-hat']) assert.ok(sounds().includes(s), s);
  assert.match($('#banner-text').textContent, /^Added \d+ hits from “Four on the floor”/);
  $('#banner-action').dispatch('click');
  assert.deepEqual(sounds(), before.sounds);
  $('#seq-grooves').dispatch('click');
  $('#groove-how').querySelector('[data-how="load"]').dispatch('click');
  $('#grooves').close();
});

test('a beat file: 📥 Load a beat file opens it under its own name; ⬇️ saves one back with kit sounds by name', async () => {
  $('#beats-toggle').dispatch('click');
  const file = { format: 'noodle-pads-beat', version: 1, name: 'Disco', bpm: 120, bars: 1, swing: 0,
    rows: [{ sound: 'kick', steps: [true, false, false, false, true] }, { sound: 'laser-of-doom', steps: [true] }] };
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  const before = $('#lib-list').querySelector('.lib-beat.current')?.dataset.id;   // put back at the end
  $('#lib-file').files = [{ size: 300, text: async () => JSON.stringify(file) }];
  $('#lib-file').dispatch('change');
  await page.settle();
  assert.equal($('#library').open, false, 'it opens');
  const name = $('.beat-bar [data-beat-name]').value;
  assert.match(name, /^Disco/);
  assert.equal($('#seq-bpm-out').textContent, '120 BPM');
  const rows = $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  assert.equal(rows.length, 1, 'a sound this app has not got is left out');
  // ⬇️ on it in 🗂️ My beats downloads it again.
  document.querySelector('.beat-bar [data-beat-open]').dispatch('click');
  let blob;
  const real = URL.createObjectURL;
  URL.createObjectURL = (b) => { blob = b; return 'blob:test'; };
  try {
    $('#lib-list').querySelector('.lib-beat.current [data-export]').dispatch('click');
  } finally { URL.createObjectURL = real; }
  const saved = JSON.parse(await blob.text());
  assert.equal(saved.format, 'noodlepads-beat', 'saved under the new id; the file it opened had the old one');
  assert.deepEqual(saved.rows.map((r) => r.sound), ['kick']);
  assert.match($('#lib-note').textContent, /^Saved “Disco/);
  // A file that isn't a beat says so.
  $('#lib-file').files = [{ size: 10, text: async () => 'hello' }];
  $('#lib-file').dispatch('change');
  await page.settle();
  assert.match($('#lib-note').textContent, /isn’t a beat file/);
  if (before) $('#lib-list').querySelector(`[data-load="${before}"]`).dispatch('click');
  else $('#library').close();
});

test('a row collapses to one slim line with its sound\'s name, and opens again', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  if (rows().length < 2) $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const fold = () => rows()[0].querySelector('.seq-fold');
  const name = rows()[0].querySelector('[data-pick]').getAttribute('aria-label').split(':')[1].split('.')[0].trim();
  assert.equal(fold().getAttribute('aria-expanded'), 'true');
  fold().dispatch('click');
  assert.ok(rows()[0].classList.contains('collapsed'));
  assert.equal(rows()[0].querySelectorAll('.pill').length, 0);           // no pills, tile or buttons
  assert.equal(rows()[0].querySelector('[data-pick]'), null);
  assert.match(rows()[0].querySelector('.seq-slim').textContent, new RegExp(`${name}$`));
  // Just its header line: ⠿ ▾, the slim name, and 🔊 · 🧹 · ✕ at the right.
  assert.deepEqual(rows()[0].children.map((c) => c.className.split(' ')[0]), ['seq-head']);
  assert.deepEqual(rows()[0].querySelector('.seq-head').children.map((c) => c.className.split(' ')[0]), ['seq-grip', 'seq-fold', 'seq-slim', 'row-tools']);
  assert.equal(document.activeElement, fold());
  // Arrow keys from the next row step over it and stay put.
  const below = rows()[1].querySelectorAll('.pill')[0];
  below.focus();
  below.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(document.activeElement, below);
  rows()[0].querySelector('.seq-slim').dispatch('click');               // the name opens it again
  assert.equal(rows()[0].classList.contains('collapsed'), false);
  assert.equal(rows()[0].querySelectorAll('.pill').length > 0, true);
});

test('a beat row can use any person\'s sound: the kit once, in groups, then a section per person, current board first', () => {
  $('#seq-rows').querySelector('[data-pick="0"]').dispatch('click');
  assert.equal($('#chooser').open, true);
  const sections = $('#chooser-grid').children;
  const kitSections = sections.slice(0, BOARDS.kitGroups.length);
  const personSections = sections.slice(BOARDS.kitGroups.length);
  // The kit's groups first, each a button that opens it, Drums open; then people.
  assert.deepEqual(kitSections.map((g) => g.children[0].dataset.toggleGroup), BOARDS.kitGroups.map((g) => g.id));
  assert.deepEqual(kitSections.map((g) => g.children[0].getAttribute('aria-expanded')), BOARDS.kitGroups.map((_, i) => String(i === 0)));
  // Each person's own sounds are a section that opens and closes too, open to start.
  assert.deepEqual(personSections.map((g) => g.children[0].dataset.toggleGroup), ['person:pip', 'person:juno', 'person:toby', 'person:wren']);
  assert.ok(personSections.every((g) => g.children[0].getAttribute('aria-expanded') === 'true'));
  assert.match(personSections[1].children[0].textContent, /Juno \(\d+\)$/);
  const labels = (g) => g.querySelectorAll('[data-choose]').map((b) => b.dataset.choose);
  const kitIds = kitSections.flatMap(labels);
  assert.equal(kitIds.length, SIMPLE_KIT);                                      // the kit, once (Advanced off: no sharps or flats)
  assert.ok(kitIds.every((id) => id.startsWith('pip-')));                     // this board's copies
  assert.equal(labels(personSections[1]).length, 4);                            // Juno's own sounds only
  assert.equal(sections.flatMap(labels).filter((id) => id.endsWith('-kick')).length, 1);
  assert.equal(document.activeElement.dataset.choose, 'pip-name');  // the row's current sound has focus
  // Opening a closed group in the chooser shows its sounds.
  const notes = kitSections[1];
  assert.equal(notes.children[1].hidden, true);
  notes.children[0].dispatch('click');
  const notesNow = $('#chooser-grid').children[1];
  assert.equal(notesNow.children[0].getAttribute('aria-expanded'), 'true');
  assert.equal(notesNow.children[1].hidden, false);
  notesNow.children[0].dispatch('click');                             // close it again for the tests after
  const maxPad = $('#chooser-grid').children[BOARDS.kitGroups.length + 1].querySelector('[data-choose]');
  // A tap only marks and plays it; the row keeps its sound until Use.
  const card = () => $('#seq-rows').querySelector('[data-pick="0"]');
  maxPad.dispatch('click');
  assert.equal($('#chooser').open, true);
  assert.equal($('#chooser-grid').querySelector('[data-choose="pip-name"]').getAttribute('aria-pressed'), 'false');
  assert.equal(maxPad.getAttribute('aria-pressed'), 'true');
  assert.equal($('#chooser-ok').textContent, `Use ${maxPad.children[1].textContent}`);
  assert.match(card().getAttribute('aria-label'), /^Row 1: Pip Pads!/);
  $('#chooser-ok').dispatch('click');
  assert.equal($('#chooser').open, false);
  assert.match(card().getAttribute('aria-label'), new RegExp(`^Row 1: ${maxPad.children[1].textContent}`));
});

test('a person\'s section in the chooser closes, and stays closed next time', () => {
  const card = () => $('#seq-rows').querySelector('[data-pick="0"]');
  const toby = () => $('#chooser-grid').querySelector('[data-toggle-group="person:toby"]');
  card().dispatch('click');
  toby().dispatch('click');
  assert.equal(toby().getAttribute('aria-expanded'), 'false');
  assert.equal(toby().closest('section').querySelector('.chooser-grid').hidden, true);
  $('#chooser').close();
  card().dispatch('click');
  assert.equal(toby().getAttribute('aria-expanded'), 'false');
  toby().dispatch('click');                                      // open again for the tests after
  assert.equal(toby().getAttribute('aria-expanded'), 'true');
  $('#chooser').close();
});

test('the chooser opens the group holding the row\'s sound, and that group still closes', () => {
  const card = () => $('#seq-rows').querySelector('[data-pick="0"]');
  const toggle = (id) => $('#chooser-grid').querySelector(`[data-toggle-group="${id}"]`);
  const note = BOARDS.kit.find((k) => k.group === 'notes');
  const before = card().getAttribute('aria-label').split(':')[1].split('.')[0].trim();
  card().dispatch('click');
  const own = $('#chooser-grid').querySelectorAll('[data-choose]').find((b) => b.getAttribute('aria-pressed') === 'true').dataset.choose;
  toggle('notes').dispatch('click');                                  // open Notes, pick one of its sounds
  $('#chooser-grid').querySelector(`[data-choose="pip-${note.id}"]`).dispatch('click');
  $('#chooser-ok').dispatch('click');
  card().dispatch('click');
  toggle('notes').dispatch('click');                                  // close Notes everywhere
  $('#chooser').close();
  card().dispatch('click');
  assert.equal(toggle('notes').getAttribute('aria-expanded'), 'true', 'it holds the row\'s sound, so it starts open');
  toggle('notes').dispatch('click');
  assert.equal(toggle('notes').getAttribute('aria-expanded'), 'false', 'and a tap still closes it');
  // Put the row's sound back for the tests after.
  $('#chooser').close();
  card().dispatch('click');
  $('#chooser-grid').querySelector(`[data-choose="${own}"]`).dispatch('click');
  $('#chooser-ok').dispatch('click');
  assert.match(card().getAttribute('aria-label'), new RegExp(`^Row 1: ${before}`));
});

test('closing the chooser without Use leaves the row\'s sound alone', () => {
  const card = () => $('#seq-rows').querySelector('[data-pick="0"]');
  const before = card().getAttribute('aria-label');
  card().dispatch('click');
  $('#chooser-grid').querySelector('[data-choose="pip-kick"]').dispatch('click');
  $('#chooser').close();
  assert.equal(card().getAttribute('aria-label'), before);
  card().dispatch('click');   // reopening marks the row's own sound again
  assert.equal($('#chooser-grid').querySelector('[data-choose="pip-kick"]').getAttribute('aria-pressed'), 'false');
  $('#chooser').close();
});

test('Undo brings a removed row back where it was, pills and all', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const sound = (r) => rows()[r].querySelector('[data-pick]').getAttribute('aria-label').split('.')[0].replace(/^Row \d+: /, '');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const before = rows().map((_, r) => sound(r));
  rows()[1].querySelectorAll('.pill')[6].dispatch('click');
  assert.equal(hasUndo(), false);
  rows()[1].querySelector('[data-remove]').dispatch('click');
  rows()[1].querySelector('[data-remove]').dispatch('click');
  assert.equal(rows().length, before.length - 1);
  assert.equal(hasUndo(), true);
  assert.equal($('#banner-text').textContent, `Removed row 2 (${before[1]}).`);
  assert.equal(document.activeElement, $('#banner-action'));
  $('#banner-action').dispatch('click');
  assert.equal(hasUndo(), false);
  assert.deepEqual(rows().map((_, r) => sound(r)), before);
  assert.equal(rows()[1].querySelectorAll('.pill')[6].getAttribute('aria-pressed'), 'true');
  // Tidy up for the tests after: back to one row, pills off (one tap).
  rows()[1].querySelectorAll('.pill')[6].dispatch('click');
  while (rows().length > 2) { rows()[2].querySelector('[data-remove]').dispatch('click'); rows()[2].querySelector('[data-remove]').dispatch('click'); }
});

test('a row\'s 🧹 and ✕ ask first: the second tap does it, any other tap takes it back', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const tool = (r, kind) => rows()[r].querySelector(`[data-${kind}]`);
  assert.equal(tool(0, 'clear').disabled, true);                  // nothing to clear yet
  rows()[0].querySelectorAll('.pill')[2].dispatch('click');
  assert.equal(tool(0, 'clear').disabled, false);
  tool(0, 'clear').dispatch('click');
  assert.equal(tool(0, 'clear').textContent, '🧹?');
  assert.ok(tool(0, 'clear').classList.contains('armed'), 'red while it asks');
  assert.equal(tool(0, 'clear').getAttribute('aria-label'), 'Tap again to clear row 1');
  assert.equal(rows()[0].querySelectorAll('.pill')[2].getAttribute('aria-pressed'), 'true', 'the first tap only asks');
  rows()[0].querySelectorAll('.pill')[5].dispatch('click');        // another tap: the question goes
  assert.equal(tool(0, 'clear').textContent, '🧹');
  tool(0, 'clear').dispatch('click');
  tool(0, 'clear').dispatch('click');
  assert.ok(rows()[0].querySelectorAll('.pill').every((p) => p.getAttribute('aria-pressed') === 'false'));

  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const count = rows().length;
  tool(count - 1, 'remove').dispatch('click');
  assert.equal(rows().length, count, 'the first tap only asks');
  assert.equal(tool(count - 1, 'remove').textContent, '✕?');
  tool(count - 1, 'remove').dispatch('click');
  assert.equal(rows().length, count - 1);
  // One header line, like a list item (Ben, 2026-10-12): ⠿ ▾ emoji and the
  // sound's name at the left, 🔔 · 🔊 · 🧹 · ✕ at the right; the pills below it.
  assert.deepEqual(rows()[0].children.map((c) => c.className.split(' ')[0]), ['seq-head', 'seq-steps']);
  const head = rows()[0].querySelector('.seq-head');
  assert.deepEqual(head.children.map((c) => c.className.split(' ')[0]), ['seq-grip', 'seq-fold', 'row-emoji', 'seq-name', 'row-tools']);
  assert.deepEqual(head.querySelector('.row-tools').children.map((c) => c.className.split(' ')[0]), ['row-ring', 'speaker', 'row-clear', 'row-x', 'more-btn'], '⋯ last, shown only when the line is short of room');
  assert.equal(head.querySelectorAll('.pill').length, 0, 'no pills on the header line');
  assert.doesNotMatch(head.querySelector('.row-emoji').textContent, /[a-z]{2}/i, 'the emoji button holds the emoji');
  assert.ok(head.querySelector('.seq-name').textContent.length > 0, 'every row shows its sound\'s name');
  assert.ok(!rows()[0].querySelector('.pad'), 'no big sound tile');
  // The row's dialog has the sound and 🎹 Tune (speed hides with advanced beats off).
  rows()[0].querySelector('[data-pick="0"]').dispatch('click');
  assert.equal($('#chooser-tools').hidden, false);
  assert.equal($('#chooser-melody').textContent, '🎹 Tune');
  assert.equal($('#chooser-rate').closest('.chooser-rate').hidden, true);
  $('#chooser').close();
});

test('🔔 Overlap is on each beat row\'s header line, at every level: a tap turns the row\'s `ring` on and off; the sound picker has none', async () => {
  const { setSetting, getSetting } = await import('../web/settings.js');
  assert.equal(getSetting('advancedBeats'), false, 'Regular, not Advanced');
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  if (!rows().length) $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const bell = () => rows()[0].querySelector('.seq-head .row-tools [data-ring]');
  const beat = () => state.patterns.get(state.personId);
  assert.equal(bell().textContent, '🔔');
  assert.equal(bell().getAttribute('aria-pressed'), 'false');
  assert.equal(beat().rows[0].ring, false);
  assert.match(bell().getAttribute('aria-label'), /^Overlap for row 1, .+: off/);
  bell().dispatch('click');
  assert.equal(beat().rows[0].ring, true, 'saved with the beat');
  assert.equal(bell().getAttribute('aria-pressed'), 'true', 'pressed while on');
  assert.match(bell().getAttribute('aria-label'), /: on, its hits ring over each other/);
  assert.equal(rows().length > 0 && rows()[0].querySelectorAll('.pill').filter((p) => p.getAttribute('aria-pressed') === 'true').length, 0, 'no pill changed');
  bell().dispatch('click');
  assert.equal(beat().rows[0].ring, false);
  assert.equal(bell().getAttribute('aria-pressed'), 'false');
  // Out of the sound picker, at every level.
  await setSetting('advancedBeats', true);
  try {
    rows()[0].querySelector('[data-pick="0"]').dispatch('click');
    assert.equal($('#chooser-ring'), null, 'no 🔔 in the sound picker');
    assert.ok(!$('#chooser').querySelectorAll('button').some((b) => /Overlap/.test(b.textContent)));
    $('#chooser').close();
    assert.ok(bell(), 'Advanced: still on the header line');
  } finally {
    await setSetting('advancedBeats', false);
  }
});

// Ben, 2026-10-12: "no need to muck about with smaller sizes… allow the
// buttons to move into a sub menu where space requires it".
test('a Beats row\'s ⋯: 🔔 🧹 ✕ move into its menu on a line short of room, and still work there (Overlap on, Clear and Remove ask first, Undo)', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  while (rows().length < 2) $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  const beat = () => state.patterns.get(state.personId);
  const more = () => rows()[0].querySelector('.seq-head .row-tools [data-more]');
  const pop = () => document.body.children.find((c) => c.classList.contains('more-pop'));
  const items = () => pop().querySelectorAll('[data-more-item]');
  const words = () => items().map((b) => b.textContent);
  // Roomy (nothing measures a squeeze here): every button is on the line, and ⋯ waits, hidden by the CSS.
  assert.ok(!$('#seq-rows').classList.contains('more-tight'), 'room enough: no ⋯ shows');
  assert.equal(more().textContent, '⋯');
  assert.equal(more().getAttribute('aria-haspopup'), 'menu');
  assert.deepEqual(rows()[0].querySelectorAll('[data-more-word]').map((b) => b.getAttribute('data-more-word')), ['Overlap', 'Clear', 'Remove']);
  assert.ok(!rows()[0].querySelector('[data-speaker]').hasAttribute('data-more-word'), 'the speaker stays on the line');
  // Opens beside ⋯: icon + word for each, the focus on the first.
  more().dispatch('click');
  assert.equal(pop().hidden, false);
  assert.equal(more().getAttribute('aria-expanded'), 'true');
  assert.deepEqual(words(), ['🔔 Overlap', '🧹 Clear', '✕ Remove']);
  assert.equal(document.activeElement, items()[0]);
  // 🔔 Overlap: on at once, shown checked; the menu stays open.
  const was = beat().rows[0].ring;
  items()[0].dispatch('click');
  assert.equal(beat().rows[0].ring, !was);
  assert.equal(items()[0].getAttribute('aria-checked'), String(!was), 'its on state shows in the menu');
  assert.equal(items()[0].getAttribute('role'), 'menuitemcheckbox');
  items()[0].dispatch('click');
  assert.equal(beat().rows[0].ring, was);
  // 🧹 Clear asks first, in red, then clears.
  pop().dispatch('keydown', { key: 'Escape' });
  rows()[0].querySelectorAll('.pill')[1].dispatch('click');
  assert.ok(beat().rows[0].steps.some(Boolean));
  more().dispatch('click');
  items()[1].dispatch('click');
  assert.equal(items()[1].textContent, '🧹 Clear?', 'the first tap only asks');
  assert.ok(items()[1].classList.contains('armed'), 'red while it asks');
  assert.ok(beat().rows[0].steps.some(Boolean));
  items()[1].dispatch('click');
  assert.ok(!beat().rows[0].steps.some(Boolean), 'the second tap clears');
  assert.equal(pop().hidden, true, 'done: the menu closes');
  // ✕ Remove asks first, then removes, and ↩️ Undo brings the row back.
  const count = rows().length;
  more().dispatch('click');
  items()[2].dispatch('click');
  assert.equal(items()[2].textContent, '✕ Remove?');
  assert.equal(rows().length, count, 'the first tap only asks');
  items()[2].dispatch('click');
  assert.equal(rows().length, count - 1);
  assert.equal(pop().hidden, true);
  $('#banner-action').dispatch('click');
  assert.equal(rows().length, count, 'Undo puts it back');
  // Esc closes it, the focus back on ⋯; a tap outside closes it too.
  more().dispatch('click');
  pop().dispatch('keydown', { key: 'Escape' });
  assert.equal(pop().hidden, true);
  assert.equal(document.activeElement, more());
  assert.equal(more().getAttribute('aria-expanded'), 'false');
  more().dispatch('click');
  page.docEvent('pointerdown', { target: $('#seq-add') });
  assert.equal(pop().hidden, true, 'a tap outside closes it');
  // Up and down move through it, round and round.
  more().dispatch('click');
  pop().dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, items()[1]);
  pop().dispatch('keydown', { key: 'ArrowUp' });
  pop().dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(document.activeElement, items()[2], 'wraps round');
  pop().dispatch('keydown', { key: 'Escape' });
});

test('a row’s speed (Advanced) is three keys in its sound picker: ½× 1× 2×', async () => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('advancedBeats', true);
  try {
    const row = () => $('#seq-rows').children.find((c) => c.classList.contains('seq-row'));
    row().querySelector('[data-pick="0"]').dispatch('click');
    assert.equal($('#chooser-tools').hidden, false);
    const keys = () => $('#chooser-rate').querySelectorAll('[data-rate]');
    const pressed = () => keys().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
    assert.deepEqual(keys().map((b) => b.textContent), ['½×', '1×', '2×']);
    assert.deepEqual(pressed(), ['1×']);
    keys()[2].dispatch('click');
    assert.deepEqual(pressed(), ['2×']);
    keys()[0].dispatch('click');
    assert.deepEqual(pressed(), ['½×']);
    keys()[1].dispatch('click');
    assert.deepEqual(pressed(), ['1×']);
    $('#chooser').close();
  } finally {
    await setSetting('advancedBeats', false);
  }
});

test('beats are open documents: they save themselves; the beat bar renames, starts new and opens; Open duplicates and deletes', () => {
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row') && !c.classList.contains('collapsed'));
  const bar = () => document.querySelectorAll('.beat-bar')[0];
  const name = () => bar().querySelector('[data-beat-name]');
  const list = () => $('#lib-list').children;
  const names = () => list().map((li) => li.querySelector('.lib-name').textContent);
  // A pill turned on: the beat saves itself, under its name.
  rows()[0].querySelectorAll('.pill')[4].dispatch('click');
  name().value = 'Groove';
  name().dispatch('change');
  assert.equal(name().value, 'Groove');
  bar().querySelector('[data-beat-open]').dispatch('click');
  assert.equal($('#library').open, true);
  assert.ok(names().includes('Groove'));
  assert.ok(list().find((li) => li.querySelector('.lib-name').textContent === 'Groove').classList.contains('current'));
  $('#library').close();
  // 🆕 New: a clean beat with its own name; Groove is kept.
  bar().querySelector('[data-beat-new]').dispatch('click');
  assert.notEqual(name().value, 'Groove');
  assert.equal(rows().length, 0, 'a new beat has no rows');
  // 🗂️ My beats Groove: its pill is back.
  bar().querySelector('[data-beat-open]').dispatch('click');
  list().find((li) => li.querySelector('.lib-name').textContent === 'Groove').querySelector('[data-load]').dispatch('click');
  assert.equal($('#library').open, false);
  assert.equal(name().value, 'Groove');
  assert.equal(rows()[0].querySelectorAll('.pill')[4].getAttribute('aria-pressed'), 'true');
  // Duplicate, then delete the copy (it asks first).
  bar().querySelector('[data-beat-open]').dispatch('click');
  const groove = () => list().find((li) => li.querySelector('.lib-name').textContent === 'Groove');
  groove().querySelector('[data-dup]').dispatch('click');
  assert.ok(names().includes('Groove 2'));
  const copy = () => list().find((li) => li.querySelector('.lib-name').textContent === 'Groove 2');
  copy().querySelector('[data-delete]').dispatch('click');
  assert.ok(names().includes('Groove 2'), 'the first tap only asks');
  copy().querySelector('[data-delete]').dispatch('click');
  assert.ok(!names().includes('Groove 2'));
  $('#library').close();
  rows()[0].querySelectorAll('.pill')[4].dispatch('click');   // tidy up: one tap turns it off
});

// Ben, 2026-10-11: "new beat should stop playback, and have no rows".
test('🆕 New stops the beat playing and starts with no rows; 🗂️ My beats, a groove and Undo carry on playing', async () => {
  const bar = () => document.querySelectorAll('.beat-bar')[0];
  const name = () => bar().querySelector('[data-beat-name]').value;
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const playing = () => $('#seq-play').getAttribute('aria-pressed') === 'true';
  const openBeat = (beat) => {
    bar().querySelector('[data-beat-open]').dispatch('click');
    $('#lib-list').children.find((li) => li.querySelector('.lib-name').textContent === beat).querySelector('[data-load]').dispatch('click');
  };
  const groove = name();
  assert.ok(rows().length > 0, 'a beat with rows is open');
  $('#seq-play').dispatch('click');
  await page.settle();
  assert.equal(playing(), true);
  assert.equal($('#seq-play').textContent, '■ Stop');
  // 🆕 New: a clean start, quiet and empty.
  bar().querySelector('[data-beat-new]').dispatch('click');
  await page.settle();
  assert.equal(playing(), false, '🆕 New stops playback');
  assert.equal($('#seq-play').textContent, '▶ Play');
  assert.equal(rows().length, 0, 'and has no rows');
  assert.equal($('#seq-no-rows').hidden, false);
  assert.equal(name(), 'Scratch beat', 'a blank scratch');
  // 🗂️ My beats while playing carries on playing, as before.
  $('#seq-play').dispatch('click');
  await page.settle();
  openBeat(groove);
  await page.settle();
  assert.equal(name(), groove);
  assert.equal(playing(), true, '🗂️ My beats keeps playing');
  // A groove into the scratch keeps playing too, and so does its Undo.
  $('#seq-grooves').dispatch('click');
  $('#groove-list').querySelector('[data-groove="four"]').dispatch('click');
  await page.settle();
  assert.match(name(), /^Four on the floor/);
  assert.equal(playing(), true, 'a groove keeps playing');
  $('#banner-action').dispatch('click');
  await page.settle();
  assert.equal(name(), groove);
  assert.equal(playing(), true, 'Undo keeps playing');
  $('#seq-play').dispatch('click');
  assert.equal(playing(), false);
});

test('Pads puts the board back', () => {
  $('#pads-tab').dispatch('click');
  assert.equal($('#pads').hidden, false);
  assert.equal($('#seq').hidden, true);
});

test('🎤 Live: 40 keys like the number row and the letter rows, drums on the home row, played by the real keys', () => {
  $('#live-tab').dispatch('click');
  assert.equal($('#dj').hidden, false);
  assert.equal($('#pads').hidden, true);
  assert.equal($('#seq').hidden, true);
  assert.equal($('#live-tab').getAttribute('aria-pressed'), 'true');
  const keys = $('#dj-keys').querySelectorAll('.dj-key');
  assert.equal(keys.length, 40);
  assert.deepEqual($('#dj-keys').querySelectorAll('.dj-row').map((r) => r.children.length), [10, 10, 10, 10], 'four rows of ten');
  assert.equal($('#dj-keys').children[0].children[0].dataset.code, 'Digit1', 'the number row on top');
  assert.equal($('#dj-keys').querySelector('[data-code="Digit1"]').getAttribute('aria-label'), '1: C', 'a scale along the number row');
  assert.deepEqual($('#dj-tabs').querySelectorAll('[data-row]').map((t) => t.getAttribute('aria-label')), ['Number row', 'Top letter row', 'Middle row', 'Bottom row'], 'a phone\'s row tabs: four');
  assert.deepEqual($('#dj-tabs').querySelectorAll('[aria-pressed="true"]').map((t) => t.dataset.row), ['2'], 'the drums show first');
  const a = $('#dj-keys').querySelector('[data-code="KeyA"]');
  assert.equal(a.getAttribute('aria-label'), 'A: Kick');
  assert.equal($('#dj-keys').querySelector('[data-code="KeyZ"]').getAttribute('aria-label'), 'Z: Bass C');
  // No keyboard in sight (a phone): a plain grid of pads that fits, no letters, no row tabs; the kid picks the size.
  assert.ok($('#dj-keys').classList.contains('pads-mode'));
  assert.equal($('#dj-tabs').hidden, true);
  assert.equal($('#dj-size').hidden, false);
  assert.equal($('#dj-keys').querySelector('.dj-sym').hidden, true, 'no letters on a phone');
  $('#dj-size').querySelector('[data-size="l"]').dispatch('click');
  assert.equal($('#dj-keys').dataset.size, 'l');
  $('#dj-size').querySelector('[data-size="m"]').dispatch('click');
  // Pressing A plays Kick; the key flashes, and the key is the page's (no typing, no find).
  const press = page.key('a', { code: 'KeyA' });
  assert.equal(press.defaultPrevented, true);
  assert.ok($('#dj-keys').querySelector('[data-code="KeyA"]').classList.contains('hit'));
  // The number row plays its keys here, not the pads.
  assert.equal(page.key('1', { code: 'Digit1' }).defaultPrevented, true);
  assert.ok($('#dj-keys').querySelector('[data-code="Digit1"]').classList.contains('hit'), '1 plays the number row\'s first key');
  assert.equal(page.key('1', { code: 'Digit1', target: document.createElement('input') }).defaultPrevented, false, 'not while typing');
  assert.equal(page.key('1', { code: 'Digit1', target: document.createElement('textarea') }).defaultPrevented, false);
  // Behind a dialog, or in a text field, the keys stand down.
  const field = document.createElement('input');
  assert.equal(page.key('a', { code: 'KeyA', target: field }).defaultPrevented, false);
  // Other keys are left alone.
  assert.equal(page.key('Enter', { code: 'Enter' }).defaultPrevented, false);
  assert.match($('#screen-hint').textContent, /^Tap a key/, 'the DJ how-to is in the page footer');
  // Q / D hang under ⌨️ / 👆 while the keys show letters (Ben, 2026-10-16),
  // and Settings has no Keyboard section any more.
  assert.equal($('#set-keys'), null, 'no ⌨️ Keyboard in Settings');
  assert.equal($('#dj-input-line').contains($('#dj-layout-keys')), true, 'Q / D sit with ⌨️ / 👆');
  assert.equal($('#dj-layout-keys').hidden, false, 'a keyboard was pressed: Q / D show');
  const layoutKeys = $('#dj-layout-keys').querySelectorAll('[data-layout]');
  assert.deepEqual(layoutKeys.map((b) => b.dataset.layout), ['qwerty', 'dvorak'], 'no Auto');
  assert.deepEqual(layoutKeys.map((b) => b.getAttribute('aria-label')), ['QWERTY keyboard', 'Dvorak keyboard']);
  assert.deepEqual(layoutKeys.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.layout), ['qwerty'], 'never picked, and the browser says nothing: QWERTY');
  // D relabels the same physical keys (a Dvorak home row), and is kept as the device's.
  layoutKeys.find((b) => b.dataset.layout === 'dvorak').click();
  assert.equal($('#dj-keys').querySelector('[data-code="KeyS"]').getAttribute('aria-label'), 'O: Snare');
  assert.deepEqual(layoutKeys.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.layout), ['dvorak']);
  assert.equal(state.settings.get('djLayout'), 'dvorak', 'kept as this device\'s');
  layoutKeys.find((b) => b.dataset.layout === 'qwerty').click();
  assert.equal($('#dj-keys').querySelector('[data-code="KeyS"]').getAttribute('aria-label'), 'S: Snare');
  // With 👆 there are no letters, so no Q / D.
  $('#dj-input').querySelector('[data-input="touch"]').click();
  assert.equal($('#dj-layout-keys').hidden, true, 'gone with 👆');
  $('#dj-input').querySelector('[data-input="keys"]').click();
  assert.equal($('#dj-layout-keys').hidden, false, 'back with ⌨️');
  $('#pads-tab').dispatch('click');
  assert.equal($('#dj').hidden, true);
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, false, 'the keys play only where they show');
  assert.ok(!$('#dj-keys').querySelector('[data-code="Digit2"]').classList.contains('hit'));
  page.key('2', { code: 'Digit2' });
  assert.ok(!$('#dj-keys').querySelector('[data-code="Digit2"]').classList.contains('hit'), 'on 🔊 Pads, 2 plays the second pad, not a key');
});

test('✏️ Edit keys: a focused view; layouts load and are saved, sounds go on keys by tap or drag, Undo and Reset', async () => {
  $('#live-tab').dispatch('click');
  const { state } = await import('../web/state.js');
  const key = (code) => $('#ke-keys').querySelector(`[data-code="${code}"]`);
  const label = (code) => key(code).getAttribute('aria-label');
  const layout = (id) => $('#ke-layouts').querySelector(`[data-layout="${id}"]`);
  const chips = () => $('#ke-layouts').querySelectorAll('.ke-layout').map((b) => b.textContent);
  $('#dj-change').dispatch('click');
  assert.equal($('#keys-edit').open, true, 'its own view, over the DJ screen');
  assert.equal($('#ke-keys').querySelectorAll('.ke-key').length, 40);
  assert.deepEqual($('#ke-keys').querySelectorAll('.ke-row').map((r) => r.getAttribute('aria-label')), ['number row', 'top letter row', 'middle row', 'bottom row']);
  assert.equal(label('Digit5'), '5: G');
  assert.equal(label('KeyA'), 'A: Kick');
  // 🎤 My sounds is always the first group, even with none made yet; opened empty, it says how to make one.
  const mine = $('#ke-groups').querySelector('[data-group="mine"]');
  assert.ok(mine, '🎤 My sounds is there');
  assert.equal($('#ke-groups').children[0], mine);
  if (!$('#ke-picks').children.length || mine.getAttribute('aria-pressed') !== 'true') {
    mine.dispatch('click');
    if (!$('#ke-picks').children.length) assert.match($('#ke-picks-hint').textContent, /No sounds of your own yet/);
  }
  // Layouts: the ready-made ones, then Save; no ⭐ My keys until a layout replaces the keys.
  assert.deepEqual(chips(), ['🥁 Beat lab', '🚀 Space band', '🐾 Zoo party', '🎹 Piano-ish', '⭐ Save this layout']);

  // Pick two animals, then tap A: they go on A and S. The keys are full, so Kick and Snare have no room.
  $('#ke-groups').querySelector('[data-group="kit-animals"]').dispatch('click');
  $('#ke-picks').querySelector('[data-sound="pip-moo"]').dispatch('click');
  $('#ke-picks').querySelector('[data-sound="pip-quack"]').dispatch('click');
  assert.match($('#ke-picks-hint').textContent, /^2 sounds picked/);
  key('KeyA').dispatch('click');
  assert.deepEqual([label('KeyA'), label('KeyS')], ['A: Moo', 'S: Quack']);
  assert.match($('#ke-note').textContent, /^2 sounds are on the keys from A\. No room for 🦶 Kick, 🥁 Snare\.$/);
  assert.equal($('#ke-picks').querySelectorAll('[aria-pressed="true"]').length, 0, 'the picks are used up');
  $('#ke-undo').dispatch('click');
  assert.equal(label('KeyA'), 'A: Kick');

  // A ready-made layout replaces the keys; the kid's own keys are kept as ⭐ My keys.
  layout('ready-zoo-party').dispatch('click');
  assert.equal(label('KeyQ'), 'Q: Moo');
  assert.equal(layout('ready-zoo-party').getAttribute('aria-pressed'), 'true');
  assert.match($('#ke-note').textContent, /kept in ⭐ My keys/);
  assert.equal(chips()[0], '⭐ My keys');
  layout('mine').dispatch('click');
  assert.equal(label('KeyA'), 'A: Kick', 'My keys brings the hand-made board back');

  // ⭐ Save this layout: a name typed (never pre-filled), then rename and delete (two taps).
  $('#ke-save').dispatch('click');
  assert.equal($('#ke-save-line').hidden, false);
  assert.equal($('#ke-save-name').value, '');
  $('#ke-save-name').value = '  Party keys ';
  $('#ke-save-ok').dispatch('click');
  assert.deepEqual(state.layouts.map((l) => [l.name, l.personId, l.keys.KeyA]), [['Party keys', 'pip', 'pip-kick']]);
  assert.deepEqual(chips().slice(0, 2), ['⭐ My keys', '⭐ Party keys'], 'own layouts first');
  assert.equal($('#ke-own-line').hidden, false, 'the one on the keys can be renamed or deleted');
  $('#ke-rename').value = 'Fiesta';
  $('#ke-rename').dispatch('change');
  assert.equal(state.layouts[0].name, 'Fiesta');
  $('#ke-delete').dispatch('click');
  assert.equal(state.layouts.length, 1, 'the first tap only asks');
  $('#ke-delete').dispatch('click');
  assert.equal(state.layouts.length, 0);

  // Drag a key onto a key: they swap. Drag one off the board: No sound. Drop on nothing: nothing changes.
  const drag = async (from, to) => {
    document.elementFromPoint = () => to;
    from.dispatch('pointerdown', { pointerId: 7, pointerType: 'mouse', clientX: 0, clientY: 0 });
    from.dispatch('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 40, clientY: 40 });
    from.dispatch('pointerup', { pointerId: 7, pointerType: 'mouse', clientX: 40, clientY: 40 });
    from.dispatch('click');   // the click a browser sends after the drag is not a tap
    await new Promise((r) => setTimeout(r, 0));
  };
  await drag(key('KeyA'), key('KeyZ'));
  assert.deepEqual([label('KeyA'), label('KeyZ')], ['A: Bass C', 'Z: Kick']);
  await drag(key('KeyZ'), $('#ke-picks'));
  assert.equal(label('KeyZ'), 'Z: no sound');
  // A sound dragged onto a key lands there; one dropped on nothing bounces back.
  await drag($('#ke-picks').querySelector('[data-sound="pip-roar"]'), key('KeyZ'));
  assert.equal(label('KeyZ'), 'Z: Roar');
  await drag($('#ke-picks').querySelector('[data-sound="pip-meow"]'), $('#ke-groups'));
  assert.ok(!$('#ke-keys').querySelectorAll('.ke-key').some((k) => /Meow/.test(k.getAttribute('aria-label'))));
  // A group onto a row: the whole row.
  await drag($('#ke-groups').querySelector('[data-group="kit-sci-fi"]'), key('KeyX'));
  assert.deepEqual(['KeyZ', 'KeyX', 'KeyC'].map(label), ['Z: Laser', 'X: Warp', 'C: Phaser']);
  // A group dropped on the number row fills it from 1.
  await drag($('#ke-groups').querySelector('[data-group="kit-sci-fi"]'), key('Digit4'));
  assert.deepEqual(['Digit1', 'Digit2'].map(label), ['1: Laser', '2: Warp']);
  assert.match($('#ke-note').textContent, /^👽 Sci-fi is on the number row\./);
  // Tapping the open group again fills the emptiest row: the top one when all are as full.
  $('#ke-groups').querySelector('[data-group="kit-sci-fi"]').dispatch('click');
  $('#ke-groups').querySelector('[data-group="kit-sci-fi"]').dispatch('click');
  assert.match($('#ke-note').textContent, /^👽 Sci-fi is on the number row\./);
  // Delete on a focused key clears it; a keyboard's own letter key taps its key.
  key('KeyQ').dispatch('keydown', { key: 'Delete', code: 'Delete' });
  assert.equal(label('KeyQ'), 'Q: no sound');
  $('#ke-picks').querySelector('[data-sound="pip-laser"]').dispatch('click');
  $('#keys-edit').dispatch('keydown', { key: 'q', code: 'KeyQ' });
  assert.equal(label('KeyQ'), 'Q: Laser');

  // Reset asks first, then puts every key back.
  $('#ke-reset').dispatch('click');
  assert.equal(label('KeyA'), 'A: Bass C', 'the first tap only asks');
  $('#ke-reset').dispatch('click');
  assert.equal(label('KeyA'), 'A: Kick');
  assert.deepEqual(state.decks.get('pip').keys, {});
  assert.ok(state.decks.get('pip').mine, 'My keys stays');
  // Done: the DJ keys show what was arranged.
  key('KeyA').dispatch('keydown', { key: 'Delete', code: 'Delete' });
  $('#keys-edit').querySelector('.ke-done').dispatch('click');
  assert.equal($('#keys-edit').open, false);
  assert.equal($('#dj-keys').querySelector('[data-code="KeyA"]').getAttribute('aria-label'), 'A: no sound');
  $('#dj-change').dispatch('click');
  $('#ke-reset').dispatch('click');
  $('#ke-reset').dispatch('click');
  $('#keys-edit').close();
  // The kid's own sounds come first, then their own groups (groups.js), then the presets' groups.
  const burp = { id: 'user-keys-1', personId: 'pip', label: 'Burp', created: 1, blob: new Blob(['x']), mime: 'audio/webm', group: 'g-burps' };
  state.userClips.push(burp);
  const order = state.orders.get('pip');
  state.orders.set('pip', { personId: 'pip', ids: [], ...order, groups: [{ id: 'g-burps', name: 'Burps' }] });
  $('#dj-change').dispatch('click');
  const groupChips = $('#ke-groups').querySelectorAll('[data-group]').map((b) => b.textContent);
  assert.deepEqual(groupChips.slice(0, 3), ['🎤 My sounds', '📁 Burps', '🥁 Drums']);
  assert.ok(!groupChips.some((t) => /Not in a group/.test(t)));
  $('#ke-groups').querySelector('[data-group="own-g-burps"]').dispatch('click');
  assert.deepEqual($('#ke-picks').querySelectorAll('[data-sound]').map((b) => b.dataset.sound), ['user-keys-1']);
  $('#keys-edit').close();
  state.userClips = state.userClips.filter((c) => c !== burp);
  if (order) state.orders.set('pip', order); else state.orders.delete('pip');
  delete document.elementFromPoint;
  $('#pads-tab').dispatch('click');
});

test('🎤 Live: Record waits for the first hit, Stop saves a named take, Takes renames and deletes it', async () => {
  $('#live-tab').dispatch('click');
  $('#dj-record').dispatch('click');
  assert.equal($('#dj-record').textContent, '■ Stop');
  assert.equal($('#dj-status').textContent, 'Play something!');
  page.key('a', { code: 'KeyA' });
  page.key('s', { code: 'KeyS' });
  assert.match($('#dj-status').textContent, /^● 0:00/);
  $('#dj-record').dispatch('click');
  assert.equal($('#dj-record').textContent, '● Record');
  assert.equal($('#dj-done').hidden, false);
  // Logged, for problem reports and the usage events (track-page.js content).
  const { getLog } = await import('../web/log.js');
  assert.deepEqual(getLog().filter((e) => e.kind === 'take').slice(-2).map((e) => [e.data.rec, e.data.made ?? null]), [['start', null], ['stop', true]]);
  // The done bar names the take in a field: renaming it there renames the take.
  assert.equal($('#dj-take-line').hidden, false);
  assert.ok($('#dj-take-name').value.length > 2);
  $('#dj-done-rename').dispatch('click');
  assert.equal(document.activeElement, $('#dj-take-name'), '✏️ Rename goes to the name');
  $('#dj-take-name').value = 'Big Jam';
  $('#dj-take-name').dispatch('input');
  assert.equal($('#dj-take-name').size, 8, 'the name field is as wide as the name, so the length sits beside it');
  $('#dj-take-name').dispatch('change');
  // ▶ Play turns into ■ Stop while the take plays; a second tap stops it.
  assert.equal($('#dj-done-play').textContent, '▶ Play');
  $('#dj-done-play').dispatch('click');
  assert.equal($('#dj-done-play').textContent, '■ Stop');
  assert.equal($('#dj-done-play').getAttribute('aria-pressed'), 'true');
  $('#dj-done-play').dispatch('click');
  assert.equal($('#dj-done-play').textContent, '▶ Play');
  // Takes lists it, with its hits; the name field renames it.
  $('#dj-takes-open').dispatch('click');
  assert.equal($('#takes').open, true);
  const rows = () => $('#takes-list').children;
  assert.equal(rows().length, 1);
  assert.match(rows()[0].querySelector('.lib-info').textContent, /2 hits/);
  assert.equal(rows()[0].querySelector('[data-rename]').value, 'Big Jam', 'renamed from the done bar');
  rows()[0].querySelector('[data-play]').dispatch('click');
  assert.equal(rows()[0].querySelector('[data-play]').textContent, '■ Stop', 'in Takes too');
  rows()[0].querySelector('[data-play]').dispatch('click');
  assert.equal(rows()[0].querySelector('[data-play]').textContent, '▶ Play');
  // Delete asks first.
  rows()[0].querySelector('[data-delete]').dispatch('click');
  assert.equal(rows().length, 1);
  rows()[0].querySelector('[data-delete]').dispatch('click');
  assert.equal(rows().length, 0);
  assert.equal($('#takes-empty').hidden, false);
  $('#takes').close();
  // Esc stops a take and keeps it; Undo takes it back.
  $('#dj-record').dispatch('click');
  page.key('d', { code: 'KeyD' });
  page.key('Escape');
  assert.equal($('#dj-record').textContent, '● Record');
  assert.equal($('#dj-done').hidden, false);
  $('#dj-done-undo').dispatch('click');
  assert.equal($('#dj-done').hidden, true);
  // ✕ puts the bar away and keeps the take.
  $('#dj-record').dispatch('click');
  page.key('d', { code: 'KeyD' });
  $('#dj-record').dispatch('click');
  $('#dj-done-close').dispatch('click');
  assert.equal($('#dj-done').hidden, true);
  $('#dj-takes-open').dispatch('click');
  assert.equal($('#takes-list').children.length, 1, 'dismissed, still kept');
  $('#takes-list').children[0].querySelector('[data-delete]').dispatch('click');
  $('#takes-list').children[0].querySelector('[data-delete]').dispatch('click');
  $('#takes').close();
  $('#dj-takes-open').dispatch('click');
  assert.equal($('#takes-list').children.length, 0);
  $('#takes').close();
  $('#pads-tab').dispatch('click');
});

// ADR 0017: Beats with ⌨️ Keys on is what DJ's Beat Builder was, on Beats'
// one open beat.
test('Beats with ⌨️ Keys: a count-in, then hits land on the open beat\'s pills; Stop says how many; Undo puts the beat back', async () => {
  const { audio } = await import('../web/audio.js');
  keysOff(page);
  const beatsOpen = document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value;
  assert.ok(beatsOpen, 'a beat is open on Beats');
  assert.equal($('#seq').hidden, false, 'Keys off: Beats\' rows');
  assert.equal($('#dj').hidden, true);
  assert.equal($('#seq-keys').getAttribute('aria-pressed'), 'false');
  assert.equal(page.key('a', { code: 'KeyA' }).defaultPrevented, false, 'Keys off: the letter keys play nothing');
  keysOn(page);
  assert.equal($('#beats-toggle').getAttribute('aria-pressed'), 'true', 'still on 🥁 Beats');
  assert.equal($('#seq').hidden, true);
  assert.equal($('#dj').hidden, false, 'the keys, under the open beat');
  assert.equal($('#dj-keys-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal($('#dj-click').hidden, true, 'the keys\' ⏲️ is on the control bar, not the footer');
  assert.equal($('#dj-takes-open').hidden, true, 'takes are 🎤 Live\'s');
  // The one open beat: the same as Beats', so Record is ready at once.
  assert.equal($('#dj-beatbar').hidden, false);
  assert.equal($('#dj-grid').hidden, false);
  assert.equal($('#dj-record').disabled, false);
  const beatName = $('#dj-beatbar').querySelector('[data-beat-name]').value;
  assert.equal(beatName, beatsOpen);
  audio.context().currentTime = 100;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal($('#dj-status').textContent, 'Get ready… 1');
  assert.equal($('#dj-count').hidden, false, 'a big count over the keys');
  assert.equal($('#dj-count').textContent, '1');
  page.key('a', { code: 'KeyA' });                         // a count-in tap: played, not recorded
  // One bar of count-in at 100 BPM (2.4 s) after a 0.05 s start: the "1" is at 102.45.
  audio.context().currentTime = 102.47;
  page.key('a', { code: 'KeyA' });                         // Kick, just after the "1"
  audio.context().currentTime = 103.06;
  page.key('a', { code: 'KeyA' });                         // pill 4 (102.45 + 4 × 0.15)
  page.key('a', { code: 'KeyA' });                         // a double tap: counts once
  audio.context().currentTime = 103.65;                    // on pill 8, but with Shift: "a pill earlier"
  page.key('A', { code: 'KeyA', shiftKey: true });
  assert.equal($('#dj-status').textContent, '', 'after the count-in, no status line: ■ Stop says it (Ben, 2026-10-12)');
  assert.equal($('#dj-record').textContent, '■ Stop');
  $('#dj-record').dispatch('click');
  assert.equal($('#banner-text').textContent, `Added 3 notes to “${beatName}”.`);
  // The news also floats over the beat's name and fades (Ben, 2026-10-12);
  // Undo rides in the banner over the top, and the take card stays away.
  assert.equal($('#dj-name-flash').hidden, false);
  assert.equal($('#dj-name-flash').textContent, '✅ 3 notes added');
  assert.equal(hasUndo(), true);
  assert.equal($('#banner-action').textContent, '↩️ Undo');
  assert.equal($('#dj-done').hidden, true, 'the take card is for 🎤 Live');
  // The Kick row (added for the hits) has pills 0 and 4 on, with Keys off too: it is the one open beat.
  keysOff(page);
  const rows = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'));
  const kick = () => rows().find((r) => (r.querySelector('[data-pick]')?.getAttribute('aria-label') ?? '').startsWith(`Row ${rows().indexOf(r) + 1}: Kick`));
  assert.ok(kick(), 'a Kick row');
  const on = (r) => r.querySelectorAll('.pill').map((p, i) => (p.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(on(kick()).slice(0, 3), [0, 4, 7], 'Shift put the last one on pill 7');
  keysOn(page);
  $('#banner-action').dispatch('click');
  keysOff(page);
  assert.ok(!kick() || on(kick()).length === 0 || on(kick())[0] !== 4, 'Undo: the beat is as it was');
  $('#pads-tab').dispatch('click');
  audio.context().currentTime = 0;
});

// ADR 0017: ⌨️ Keys is remembered per device, and waits while recording.
test('⌨️ Keys stays on when Beats comes back, and can\'t change while recording into the beat', async () => {
  const { audio } = await import('../web/audio.js');
  keysOff(page);
  keysOn(page);
  $('#pads-tab').dispatch('click');
  $('#beats-toggle').dispatch('click');
  assert.equal($('#dj').hidden, false, 'Beats opens with the keys again');
  audio.context().currentTime = 300;
  $('#dj-record').dispatch('click');
  await page.settle();
  $('#dj-keys-toggle').dispatch('click');
  assert.equal($('#dj').hidden, false, 'not while recording');
  assert.equal($('#dj-record').textContent, '■ Stop');
  $('#dj-record').dispatch('click');
  keysOff(page);
  assert.equal($('#seq').hidden, false);
  assert.equal($('#dj').hidden, true);
  $('#pads-tab').dispatch('click');
  audio.context().currentTime = 0;
});

test('the click only ticks when its toggle is on: recording an empty beat with ⌨️ Keys, with Beats\' ⏲️ on, stays quiet after the count-in', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  // Beats' own ⏲️ on, DJ's ⏲️ Click track off.
  $('#beats-toggle').dispatch('click');
  if ($('#seq-click').getAttribute('aria-pressed') !== 'true') $('#seq-click').dispatch('click');
  keysOn(page);
  if ($('#dj-click').getAttribute('aria-pressed') === 'true') $('#dj-click').dispatch('click');
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');   // an empty beat
  ctx.currentTime = 600;
  $('#dj-record').dispatch('click');
  await page.settle();                                  // the count-in's clicks are made now
  const real = ctx.createOscillator;
  let ticks = 0;
  ctx.createOscillator = function () { ticks++; return real.call(this); };
  ctx.currentTime = 606;                                // well past the count-in
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(ticks, 0, 'no click after the count-in with ⏲️ Click track off');
  $('#dj-record').dispatch('click');
  ctx.createOscillator = real;
  ctx.currentTime = 0;
  keysOff(page);
  $('#seq-click').dispatch('click');                    // Beats' ⏲️ back off
  $('#pads-tab').dispatch('click');
});

test('Beats with ⌨️ Keys: tapping a row\'s emoji picks a new picture for that sound everywhere; one already taken asks first', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  const emoji = () => $('#dj-grid').children[0].querySelector('[data-picture]');
  const before = emoji().textContent;
  emoji().dispatch('click');
  assert.equal($('#pictures').open, true);
  assert.match($('#pictures-title').textContent, /^Pick a picture for /);
  const pick = (p) => $('#pictures-grid').querySelector(`[data-pick="${p}"]`);
  // A picture another sound on the board has (the kit's Snare is 🥁): asks first.
  pick('🥁').dispatch('click');
  assert.equal($('#pictures').open, true, 'not yet');
  assert.match($('#pictures-note').textContent, /already .+'s picture\. Tap it again to use it anyway/);
  assert.ok(pick('🥁').classList.contains('armed'));
  // A free one is used at once, everywhere.
  pick('🦄').dispatch('click');
  await page.settle();
  assert.equal($('#pictures').open, false);
  assert.match(emoji().textContent, /🦄/);
  // Back as it was.
  emoji().dispatch('click');
  $('#pictures-grid').querySelector(`[data-pick="${[...before][0] === '🔊' ? '🦶' : before.split(' ')[0]}"]`)?.dispatch('click');
  await page.settle();
  if ($('#pictures').open) $('#pictures').close();
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

test('Beats with ⌨️ Keys: a row\'s ✕ beside its emoji asks first, then removes the row; Undo puts it back', async () => {
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  const lines = () => $('#dj-grid').children;
  const before = lines().length;
  assert.ok(before > 0);
  const x = () => lines()[0].querySelector('[data-remove-row]');
  assert.equal(x().textContent, '✕');
  assert.match(x().getAttribute('aria-label'), /^Remove the .+ row$/);
  x().dispatch('click');
  assert.equal(lines().length, before, 'the first tap only asks');
  assert.equal(x().textContent, '✕?');
  assert.ok(x().classList.contains('armed'));
  lines()[0].querySelector('[data-step]').dispatch('click');          // any other tap takes it back
  assert.equal(x().textContent, '✕');
  lines()[0].querySelector('[data-step]').dispatch('click');          // (that pill back off)
  x().dispatch('click');
  x().dispatch('click');
  assert.equal(lines().length, before - 1);
  assert.match($('#banner-text').textContent, /^Removed the .+ row\.$/);
  $('#banner-action').dispatch('click');
  assert.equal(lines().length, before, 'Undo puts it back');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

// Ben, 2026-10-12: "a clean button between the emoji and the x".
test('Beats with ⌨️ Keys: a row\'s 🧹 beside ✕ asks first, then clears its pills; Undo puts them back; it waits with nothing to clear or while recording', async () => {
  const { audio } = await import('../web/audio.js');
  $('#live-tab').dispatch('click');
  await newBuilderBeatWithRow(page);
  const line = () => $('#dj-grid').children[0];
  const sweep = () => line().querySelector('[data-clear-row]');
  const lit = () => line().querySelectorAll('[data-step]').map((p, i) => (p.classList.contains('on') ? i : -1)).filter((i) => i >= 0);
  const kids = line().children.map((c) => c.className.split(' ')[0]);
  assert.deepEqual(kids, ['row-emoji', 'dj-grid-pills', 'row-tools'], 'emoji · pills · tools');
  assert.deepEqual(line().querySelector('.row-tools').children.map((c) => c.className.split(' ')[0]), ['row-ring', 'speaker', 'row-clear', 'row-x'], '🔔 · 🔊 · 🧹 · ✕ at the right');
  // 🔔 on a compact row turns that row's Overlap on and off, as on Beats.
  const at = Number(line().dataset.row);
  const ring = () => state.patterns.get(state.personId).rows[at].ring;
  const before = ring();
  line().querySelector('[data-ring]').dispatch('click');
  assert.equal(ring(), !before);
  assert.equal(line().querySelector('[data-ring]').getAttribute('aria-pressed'), String(!before));
  line().querySelector('[data-ring]').dispatch('click');
  assert.equal(ring(), before);
  line().querySelectorAll('[data-step]')[6].dispatch('click');
  assert.deepEqual(lit(), [0, 6]);
  assert.equal(sweep().textContent, '🧹');
  assert.match(sweep().getAttribute('aria-label'), /^Clear the .+ row$/);
  assert.equal(sweep().disabled, false);
  sweep().dispatch('click');
  assert.deepEqual(lit(), [0, 6], 'the first tap only asks');
  assert.equal(sweep().textContent, '🧹?');
  assert.ok(sweep().classList.contains('armed'));
  assert.match(sweep().getAttribute('aria-label'), /^Tap again to clear/);
  line().querySelectorAll('[data-step]')[9].dispatch('click');        // any other tap takes it back
  assert.equal(sweep().textContent, '🧹');
  line().querySelectorAll('[data-step]')[9].dispatch('click');        // (that pill back off)
  sweep().dispatch('click');
  sweep().dispatch('click');
  assert.deepEqual(lit(), [], 'cleared');
  assert.equal($('#dj-grid').children.length, 1, 'the row stays');
  assert.match($('#banner-text').textContent, /^Cleared the .+ row\.$/);
  assert.equal(sweep().disabled, true, 'nothing to clear: it waits');
  $('#banner-action').dispatch('click');
  assert.deepEqual(lit(), [0, 6], 'Undo puts the pills back');
  // While recording, it keeps its place but hides, as ✕ does.
  audio.context().currentTime = 70;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal(sweep().style.visibility, 'hidden');
  assert.equal(line().querySelector('[data-remove-row]').style.visibility, 'hidden');
  $('#dj-record').dispatch('click');
  assert.equal(sweep().style.visibility, '');
  audio.context().currentTime = 0;
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

// Ben, 2026-10-12: "pressing an instrument in beat builder should cause its
// row to appear, even if it's not in record mode. and rows should always be
// ordered similar to how they appear in the key layout".
test('Beats with ⌨️ Keys: a key played makes its sound\'s row at once, without recording; rows show in keyboard order and act on the right row', async () => {
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  const lines = () => $('#dj-grid').children;
  const shown = () => lines().map((l) => l.querySelector('[data-picture]').title);
  const soundOn = (code) => $('#dj-keys').querySelector(`[data-code="${code}"]`).getAttribute('aria-label').replace(/^.*?: /, '');
  const [q, a, z] = [soundOn('KeyQ'), soundOn('KeyA'), soundOn('KeyZ')];
  assert.equal(a, 'Kick');
  assert.equal(lines().length, 0);
  // Not recording: a key makes its row, empty, quietly (Ben, 2026-10-16:
  // "drop the notification that a new row has been added to beats").
  $('#dj-done-close').dispatch('click');
  page.key('z', { code: 'KeyZ' });
  assert.deepEqual(shown(), [z], 'the row is there at once');
  assert.equal(lines()[0].querySelectorAll('[data-step].on').length, 0, 'empty: nothing was recorded');
  assert.equal($('#dj-done').hidden, true, 'no notice and no Undo line');
  // Its ✕ takes it out (two taps).
  lines()[0].querySelector('[data-remove-row]').dispatch('click');
  lines()[0].querySelector('[data-remove-row]').dispatch('click');
  assert.equal(lines().length, 0, 'the row\'s ✕ takes it out');
  $('#dj-done-close').dispatch('click');
  // Played again: one row per sound, never two.
  page.key('z', { code: 'KeyZ' });
  page.key('z', { code: 'KeyZ' });
  assert.deepEqual(shown(), [z]);
  page.key('a', { code: 'KeyA' });
  page.key('q', { code: 'KeyQ' });
  // Stored in the order played (Z, A, Q); shown in the keyboard's (Q, A, Z).
  assert.deepEqual(shown(), [q, a, z], 'top row, then home row, then bottom row');
  assert.deepEqual(lines().map((l) => l.dataset.row), ['2', '1', '0'], 'each line keeps its stored row');
  // The saved beat keeps its own order (what 🥁 Beats shows): as played.
  // (🆕 New opened the scratch, which is no `patterns` record.)
  const stored = () => state.savedBeats.find((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId).rows.map((r) => anyLabel(r.clipId));
  const anyLabel = (id) => lines().find((l) => l.querySelector('[data-picture]').dataset.picture === id)?.querySelector('[data-picture]').title;
  assert.deepEqual(stored(), [z, a, q]);
  // A tap on a pill, the speaker and 🧹 act on the row they are drawn on.
  const line = (name) => lines().find((l) => l.querySelector('[data-picture]').title === name);
  line(a).querySelectorAll('[data-step]')[4].dispatch('click');
  assert.ok(line(a).querySelectorAll('[data-step]')[4].classList.contains('on'));
  assert.equal(line(z).querySelectorAll('[data-step].on').length + line(q).querySelectorAll('[data-step].on').length, 0, 'only Kick\'s pill');
  line(z).querySelector('[data-speaker]').dispatch('click');
  assert.equal(line(z).querySelector('[data-speaker]').getAttribute('aria-pressed'), 'true', 'Z\'s row muted');
  assert.equal(line(a).querySelector('[data-speaker]').getAttribute('aria-pressed'), 'false');
  line(z).querySelector('[data-speaker]').dispatch('click');
  line(a).querySelector('[data-clear-row]').dispatch('click');
  line(a).querySelector('[data-clear-row]').dispatch('click');
  assert.equal(line(a).querySelectorAll('[data-step].on').length, 0, '🧹 cleared Kick');
  assert.match($('#banner-text').textContent, /^Cleared the Kick row\.$/);
  // ✕ on the first line shown removes that sound's row (stored last).
  line(q).querySelector('[data-remove-row]').dispatch('click');
  line(q).querySelector('[data-remove-row]').dispatch('click');
  assert.deepEqual(shown(), [a, z]);
  $('#banner-action').dispatch('click');
  assert.deepEqual(shown(), [q, a, z]);
  assert.deepEqual(stored(), [z, a, q], 'still stored as played');
  // ✏️ Edit keys: swap A and Z, and the rows follow the keys.
  const key = (code) => $('#ke-keys').querySelector(`[data-code="${code}"]`);
  $('#dj-change').dispatch('click');
  document.elementFromPoint = () => key('KeyZ');
  const from = key('KeyA');
  from.dispatch('pointerdown', { pointerId: 9, pointerType: 'mouse', clientX: 0, clientY: 0 });
  from.dispatch('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 40, clientY: 40 });
  from.dispatch('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 40, clientY: 40 });
  from.dispatch('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(key('KeyZ').getAttribute('aria-label'), 'Z: Kick');
  assert.deepEqual(shown(), [q, z, a], `${z} is on A now, Kick on Z`);
  $('#ke-undo').dispatch('click');
  assert.deepEqual(shown(), [q, a, z], 'and back with Undo');
  $('#keys-edit').close();
  // The number row plays here too, and its row shows first: it is the keyboard's top row.
  const one = soundOn('Digit1');
  page.key('1', { code: 'Digit1' });
  assert.deepEqual(shown(), [one, q, a, z], 'the number row, then the letter rows');
  line(one).querySelector('[data-remove-row]').dispatch('click');
  line(one).querySelector('[data-remove-row]').dispatch('click');
  assert.deepEqual(shown(), [q, a, z]);
  $('#live-tab').dispatch('click');
  page.key('s', { code: 'KeyS' });
  keysOn(page);
  assert.deepEqual(shown(), [q, a, z], '🎤 Live never adds a row');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

test('Beats with ⌨️ Keys: tempo, bars and (with Advanced) time signature are on Record\'s line, as on Beats; bars and signature go while recording', async () => {
  const { audio } = await import('../web/audio.js');
  const { setSetting } = await import('../web/settings.js');
  $('#live-tab').dispatch('click');
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  keysOn(page);
  const setup = $('#dj-setup');
  assert.equal(setup.hidden, false);
  const setupKeys = () => [...$('#dj-tempo').querySelectorAll('button'), ...setup.querySelectorAll('button')];
  assert.equal($('#dj-bpm').textContent, '100 BPM');
  assert.equal($('#dj-sigs').hidden, true, 'the time signature needs Advanced, as on Beats');
  const slider = $('#dj-bpm-slider');
  slider.value = String(Number(slider.value) + 20);                  // past 100's pull, to the next tempo up
  slider.dispatch('input');
  assert.notEqual($('#dj-bpm').textContent, '100 BPM');
  slider.value = String(Number(slider.max));
  slider.dispatch('input');
  assert.equal($('#dj-bpm').textContent, '180 BPM');
  $('#dj-tempo').querySelector('[data-tempo-step="-1"]').dispatch('click');     // the chevrons, on a short line
  assert.equal($('#dj-bpm').textContent, '170 BPM');
  $('#dj-tempo').querySelector('[data-tempo-step="1"]').dispatch('click');
  assert.equal($('#dj-bpm').textContent, '180 BPM');
  slider.value = String(Number(slider.max) / 2 | 0);
  slider.dispatch('input');
  $('#dj-bars').querySelector('[data-bars="2"]').dispatch('click');
  assert.equal($('#dj-bars').querySelector('[data-bars="2"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('#dj-grid').querySelector('.dj-grid-pills').children.length, 32);
  await setSetting('advancedBeats', true);
  keysOn(page);
  assert.equal($('#dj-sigs').hidden, false);
  $('#dj-sigs').querySelector('[data-sig="3/4"]').dispatch('click');
  assert.equal($('#dj-grid').querySelector('.dj-grid-pills').children.length, 24, '2 bars of 3/4');
  assert.equal($('#dj-sigs').querySelector('[data-sig="3/4"]').getAttribute('aria-pressed'), 'true');
  const starts = $('#dj-grid').querySelector('.dj-grid-pills').children.map((p, i) => (p.classList.contains('beat-start') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(starts, [0, 4, 8, 12, 16, 20]);
  audio.context().currentTime = 100;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal($('#dj-status').textContent, 'Get ready… 1', 'the count-in starts');
  assert.ok(setupKeys().every((b) => b.disabled), 'no changes while hits land on the grid');
  assert.equal($('#dj-bpm-slider').disabled, true);
  assert.equal($('#dj-bars').hidden, true, 'the bars go away while recording');
  assert.equal($('#dj-sigs').hidden, true, 'and the time signature');
  $('#dj-record').dispatch('click');
  assert.ok(setupKeys().every((b) => !b.disabled));
  assert.equal($('#dj-bars').hidden, false);
  $('#dj-sigs').querySelector('[data-sig="4/4"]').dispatch('click');
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  await setSetting('advancedBeats', false);
  keysOff(page);
  $('#pads-tab').dispatch('click');
  audio.context().currentTime = 0;
});

test('⏲️ Click track: emoji-only by Play on Beats; on 🎤 Live, at the bottom with its own tempo slider, and it ticks there', async () => {
  const { audio } = await import('../web/audio.js');
  assert.ok($('#seq-deck').contains($('#seq-click')), 'on the sticky bar with Play and the tempo');
  assert.equal($('#seq-click').textContent, '⏲️');
  assert.match($('#seq-click').getAttribute('aria-label'), /^Click track/);
  assert.equal($('#dj-click').textContent, '⏲️ Click track');
  assert.ok($('.dj-end').contains($('#dj-click')), 'DJ: the bottom line, opposite the key colors');
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-setup').hidden, true);
  const shown = () => !$('#dj-click-tempo').classList.contains('off');
  assert.equal(shown(), false, 'no tempo while the click track is off (its room is kept)');
  $('#dj-click').dispatch('click');
  assert.equal(shown(), true, 'Freestyle: the click track tempo, left of the button');
  $('#dj-click').dispatch('click');
  const slider = $('#dj-click-bpm');
  const beatBpm = state.patterns.get(state.personId)?.bpm;
  slider.value = String(Number(slider.max));
  slider.dispatch('input');
  assert.equal($('#dj-click-bpm-out').textContent, '180 BPM');
  assert.equal(state.patterns.get(state.personId)?.bpm, beatBpm, 'Live has no open beat: its tempo is its own, for the visit (ADR 0017)');
  slider.value = '0';
  slider.dispatch('input');
  $('#dj-click-tempo').querySelector('[data-click-step="1"]').dispatch('click');   // narrow screens: chevrons
  assert.equal($('#dj-click-bpm-out').textContent, '70 BPM', 'from 60 to the next common tempo');
  $('#beats-toggle').dispatch('click');
  $('#seq-bpm-out').dispatch('click');
  $('#seq-bpm-type').value = '100';
  $('#seq-bpm-type').dispatch('keydown', { key: 'Enter' });
  $('#live-tab').dispatch('click');
  const ctx = audio.context();
  const real = ctx.createOscillator;
  let ticks = 0;
  ctx.createOscillator = function () { ticks++; return real.call(this); };
  ctx.currentTime = 500;                                // later than any test before (the clock only goes forward)
  $('#dj-click').dispatch('click');
  assert.equal($('#dj-click').getAttribute('aria-pressed'), 'true');
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(ticks > 0, 'it ticks with the beat stopped');
  $('#pads-tab').dispatch('click');                     // leaving DJ stops it
  const after = ticks;
  ctx.currentTime = 502;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ticks, after);
  keysOn(page);
  assert.equal($('#dj-click-tempo').hidden, true, 'Beat Builder has one tempo, by ● Record: none by the click');
  // Beat Builder's ⏲️ is on its control bar, emoji only, as on Beats; the footer's goes.
  assert.equal($('#dj-click').hidden, true);
  assert.equal($('#dj-beat-click').hidden, false);
  assert.ok($('.dj-bar').contains($('#dj-beat-click')));
  assert.equal($('#dj-beat-click').textContent, '⏲️');
  assert.equal($('#dj-beat-click').getAttribute('aria-pressed'), 'true', 'one click setting for DJ: on in both places');
  $('#dj-beat-click').dispatch('click');
  assert.equal($('#dj-beat-click').getAttribute('aria-pressed'), 'false');
  // The control bar reads ▶ Play · ● Record · tempo · ⏲️, then the bars, as on Beats.
  const order = (root) => root.querySelector('.beat-go').children.filter((c) => !c.hidden).map((c) => c.className.split(' ')[0]);
  assert.deepEqual(order($('.dj-bar')).slice(0, 4), ['seq-play', 'dj-rec', 'beat-tempo', 'seq-click']);
  assert.deepEqual(order($('#seq-deck')), ['seq-play', 'beat-tempo', 'seq-click']);
  assert.ok($('.dj-bar').querySelector('.beat-shape').contains($('#dj-bars')) && $('#seq-deck').querySelector('.beat-shape').contains($('#seq-bars')));
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-click').hidden, false, 'Live keeps ⏲️ in the footer');
  assert.equal($('#dj-beat-click').hidden, true);
  assert.equal($('#dj-play').hidden, true, 'Live has no ▶ Play');
  assert.equal($('#dj-click-tempo').hidden, false, 'Live keeps it');
  assert.equal(shown(), false);
  ctx.createOscillator = real;
  ctx.currentTime = 0;
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

// Ben, 2026-10-11: the tempo can change while Beat Builder records, once
// the count-in is over. Hits already in stay; new taps land at the new speed.
test('Beats with ⌨️ Keys: the tempo waits out the count-in, then changes while recording; a later tap lands on the new tempo\'s pill', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  const up = $('#dj-tempo').querySelector('[data-tempo-step="1"]');
  // Tap the number to type a tempo, as on Beats.
  $('#dj-bpm').dispatch('click');
  assert.equal($('#dj-bpm-type').hidden, false);
  $('#dj-bpm-type').value = '100';
  $('#dj-bpm-type').dispatch('keydown', { key: 'Enter' });
  assert.equal($('#dj-bpm').textContent, '100 BPM');
  assert.equal($('#dj-bpm-type').hidden, true);
  ctx.currentTime = 900;
  $('#dj-record').dispatch('click');
  await page.settle();
  assert.equal($('#dj-status').textContent, 'Get ready… 1');
  assert.equal(up.disabled, true, 'the count-in\'s clicks are booked: the tempo waits');
  up.dispatch('click');
  assert.equal($('#dj-bpm').textContent, '100 BPM');
  // GO at 902.45 (a 2.4 s count-in after a 0.05 s start). By 903.52 pills
  // 0 to 7 are booked; pill 8 (903.65) is the first still to come.
  ctx.currentTime = 902.45 + 7 * 0.15 + 0.02;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(up.disabled, false, 'after GO the tempo is live');
  assert.equal($('#dj-bpm-slider').disabled, false);
  up.dispatch('click');
  assert.equal($('#dj-bpm').textContent, '110 BPM');
  $('#dj-bpm').dispatch('click');                                    // typed, while recording
  $('#dj-bpm-type').value = '140';
  $('#dj-bpm-type').dispatch('keydown', { key: 'Enter' });
  assert.equal($('#dj-bpm').textContent, '140 BPM');
  assert.equal($('#dj-bars').hidden, true, 'the bars still wait for Stop');
  // Pill 12 at 140 BPM: 4 new pills after pill 8. Counted from the start at
  // the new tempo it would be pill 15; at the old tempo, pill 11.
  ctx.currentTime = 903.65 + 4 * (60 / 140 / 4);
  page.key('a', { code: 'KeyA' });
  $('#dj-record').dispatch('click');
  const kick = $('#dj-grid').children.find((line) => line.querySelector('[data-picture]')?.title === 'Kick');
  const lit = kick.querySelector('.dj-grid-pills').children.map((p, i) => (p.classList.contains('on') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(lit, [12]);
  keysOff(page);
  $('#pads-tab').dispatch('click');
  ctx.currentTime = 0;
});

// Ben, 2026-10-11: tap tempo on ⏲️. One or two taps toggle the click as
// always; a third quick tap in time sets the tempo and leaves the click on.
test('⏲️ tap tempo (Beats with ⌨️ Keys): two taps toggle and say keep tapping…, a third in time sets the tempo and leaves the click on', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const click = $('#dj-click');
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.match(click.getAttribute('aria-label'), /Tap it three times in time to set the tempo/);
  if (click.getAttribute('aria-pressed') === 'true') { ctx.currentTime = 1000; click.dispatch('click'); }
  const pressed = () => click.getAttribute('aria-pressed');
  ctx.currentTime = 1010;
  click.dispatch('click');
  assert.equal(pressed(), 'true', 'one tap: on, as always');
  assert.equal(click.textContent, '⏲️ Click track');
  ctx.currentTime = 1010.625;
  click.dispatch('click');
  assert.equal(pressed(), 'false', 'two taps: off again');
  assert.equal(click.textContent, 'keep tapping…');
  ctx.currentTime = 1011.25;
  click.dispatch('click');
  assert.equal(pressed(), 'true', 'the third tap leaves it on');
  assert.equal(click.textContent, '👆 96');
  assert.equal($('#dj-bpm').textContent, '96 BPM', 'the tempo by ● Record changes with the taps');
  // The beat is stopped, so the click carries on in the kid's time: one beat (0.625 s) after the last tap.
  const real = ctx.createOscillator;
  const ticks = [];
  ctx.createOscillator = function () { const o = real.call(this); const start = o.start; o.start = (at) => { ticks.push(at); return start?.call(o, at); }; return o; };
  ctx.currentTime = 1011.8;
  await new Promise((r) => setTimeout(r, 60));
  ctx.createOscillator = real;
  assert.ok(ticks.some((at) => Math.abs(at - 1011.875) < 1e-6), `a tick at 1011.875 (${ticks})`);
  ctx.currentTime = 1011.85;
  click.dispatch('click');
  ctx.currentTime = 1012.45;
  click.dispatch('click');
  assert.equal(pressed(), 'true');
  assert.equal($('#dj-bpm').textContent, '100 BPM', 'later taps refine it (98, within 2 BPM of 100: pulled to it)');
  // A tap long after starts a new run: a plain toggle again.
  ctx.currentTime = 1020;
  click.dispatch('click');
  assert.equal(pressed(), 'false');
  assert.equal(click.textContent, '⏲️ Click track');
  assert.equal($('#dj-bpm').textContent, '100 BPM');
  keysOff(page);
  $('#pads-tab').dispatch('click');
  ctx.currentTime = 0;
});

// Ben, 2026-10-11: bars grow while Beat Builder records, doubling 1 → 2 → 4,
// the new bars a copy of the beat so far, while the kid keeps playing into
// the last bar on the first pass. A pass with no hit there goes round.
test('Beats with ⌨️ Keys: the beat grows while you keep playing into its last bar, as a copy of itself; resting goes round; Undo puts it back', async () => {
  const { audio } = await import('../web/audio.js');
  const ctx = audio.context();
  const wait = () => new Promise((r) => setTimeout(r, 60));
  const P = 0.15;                                   // a pill at 100 BPM
  keysOn(page);
  await newBuilderBeatWithRow(page);   // a new beat is empty: one key recorded gives it a row
  $('#dj-bars').querySelector('[data-bars="1"]').dispatch('click');
  const pillsOf = () => $('#dj-grid').querySelector('.dj-grid-pills').children.filter((p) => p.tagName.toLowerCase() === 'i').length;
  const ghost = () => !!$('#dj-grid').querySelector('.dj-grid-grow');
  const kickLit = () => {
    const kick = $('#dj-grid').children.find((line) => line.querySelector('[data-picture]')?.title === 'Kick');
    return kick ? kick.querySelector('.dj-grid-pills').children.map((p, i) => (p.classList.contains('on') ? i : -1)).filter((i) => i >= 0) : [];
  };
  ctx.currentTime = 1100;
  $('#dj-record').dispatch('click');
  await page.settle();
  const go = 1100.05 + 16 * P;                      // after one bar of count-in
  // Time jumps between steps, as after a stall on a device: the click skips
  // along the beat's grid, so the beat still grows at the right moment.
  const at = async (pill) => { ctx.currentTime = go + pill * P; await wait(); };
  await at(0);
  assert.equal(ghost(), true, 'room to grow: a dashed bar after the last');
  assert.equal($('#dj-status').textContent, '');
  page.key('a', { code: 'KeyA' });                  // Kick on pill 0
  await at(8);
  page.key('a', { code: 'KeyA' });                  // and 8: in the last bar
  await at(11.8);                                   // the last beat is being booked: it grows
  assert.equal(pillsOf(), 32, 'two bars now');
  assert.deepEqual(kickLit(), [0, 8, 16, 24], 'bar 2 starts as a copy of bar 1');
  await at(14);
  page.key('a', { code: 'KeyA' });                  // still in bar 1: goes in the copy too
  assert.deepEqual(kickLit(), [0, 8, 14, 16, 24, 30]);
  await at(17);
  assert.equal($('#dj-status').textContent, '');
  await at(20);
  page.key('a', { code: 'KeyA' });                  // playing on in the last bar
  await at(27.8);
  assert.equal(pillsOf(), 64, 'and four');
  assert.deepEqual(kickLit(), [0, 8, 14, 16, 20, 24, 30, 32, 40, 46, 48, 52, 56, 62]);
  assert.equal(ghost(), false, '4 bars is as long as a beat gets');
  assert.equal($('#dj-status').textContent, '');
  $('#dj-record').dispatch('click');
  $('#banner-action').dispatch('click');
  assert.equal(pillsOf(), 16, 'Undo: one bar again');
  assert.deepEqual(kickLit(), []);
  // Resting through the last bar: it goes round, as before.
  ctx.currentTime = 1200;
  $('#dj-record').dispatch('click');
  await page.settle();
  const go2 = 1200.05 + 16 * P;
  ctx.currentTime = go2 + 11.8 * P;
  await wait();
  assert.equal(pillsOf(), 16, 'no hit in the last bar: no growing');
  assert.equal(ghost(), false);
  assert.equal($('#dj-status').textContent, '');
  ctx.currentTime = go2 + 16 * P;
  page.key('a', { code: 'KeyA' });                  // the next pass's "1": overdubs as today
  $('#dj-record').dispatch('click');
  assert.deepEqual(kickLit(), [0]);
  keysOff(page);
  $('#pads-tab').dispatch('click');
  ctx.currentTime = 0;
});

// Beat Builder's 🆕 New: the same empty beat, and a line pointing to the keys.
test('Beats with ⌨️ Keys: 🆕 New has no rows and says to play the keys; the first hit recorded makes a row', async () => {
  keysOn(page);
  $('#dj-beatbar').querySelector('[data-beat-new]').dispatch('click');
  assert.equal($('#dj-grid').hidden, false);
  assert.equal($('#dj-grid').children.length, 0, 'no rows');
  assert.equal($('#dj-no-rows').hidden, false);
  assert.match($('#dj-no-rows').textContent, /●\sRecord/);
  assert.match($('#dj-no-rows').textContent, /play the sounds below/, 'the keys or the 👆 tiles alike');
  assert.equal($('#dj-record').disabled, false, 'Record is ready');
  await newBuilderBeatWithRow(page);
  assert.equal($('#dj-grid').children.length, 1, 'one row for the sound played');
  assert.equal($('#dj-no-rows').hidden, true, 'the line goes with it');
  keysOff(page);
  assert.equal($('#dj-no-rows').hidden, true, 'Freestyle never shows it');
  $('#pads-tab').dispatch('click');
  $('#beats-toggle').dispatch('click');
});

test('kit groups open and close, and every group holds its sounds', () => {
  document.querySelectorAll?.('dialog[open]')?.forEach?.((d) => d.close());
  if (!$('#seq').hidden) $('#pads-tab').dispatch('click');
  const header = (id) => groupHeaders().find((h) => h.dataset.group === id);
  const before = labels().length;
  header('game').dispatch('click');                                   // open Game
  assert.equal(header('game').getAttribute('aria-expanded'), 'true');
  const game = BOARDS.kit.filter((k) => k.group === 'game').length;
  assert.equal(labels().length, before + game);
  assert.ok(labels().includes('Coin'));
  header('game').dispatch('click');                                   // and close it again
  assert.equal(header('game').getAttribute('aria-expanded'), 'false');
  assert.equal(labels().length, before);
  assert.ok(!labels().includes('Coin'));
  // Open every group: all of the kit is there, once.
  for (const g of BOARDS.kitGroups) if (header(g.id).getAttribute('aria-expanded') === 'false') header(g.id).dispatch('click');
  const kitLabels = labels().slice(labels().indexOf('Kick'));
  assert.equal(kitLabels.length, SIMPLE_KIT);
});

test('⚙️ Advanced shows the sharps and flats in keyboard order; off, they hide, and a beat row using one keeps it', async () => {
  const { setSetting } = await import('../web/settings.js');
  const NOTES = ['C', 'C♯ · D♭', 'D', 'D♯ · E♭', 'E', 'F', 'F♯ · G♭', 'G', 'G♯ · A♭', 'A', 'A♯ · B♭', 'B', 'High C'];
  const notes = () => labels().slice(labels().indexOf('C'), labels().indexOf('High C') + 1);
  assert.deepEqual(notes(), NOTES.filter((n) => !n.includes('♯')));     // every group is open from the test before
  await setSetting('advancedBeats', true);
  assert.deepEqual(notes(), NOTES);
  assert.equal(labels().slice(labels().indexOf('Kick')).length, KIT);
  assert.ok(labels().includes('Bass A♯ · B♭') && labels().includes('B♭ chord'));
  // A beat row picks one…
  $('#beats-toggle').dispatch('click');
  const card = () => $('#seq-rows').querySelector('[data-pick="0"]');
  card().dispatch('click');
  const was = document.activeElement.dataset.choose;
  $('#chooser-grid').querySelector('[data-choose="pip-note-cs"]').dispatch('click');
  $('#chooser-ok').dispatch('click');
  assert.match(card().getAttribute('aria-label'), /^Row 1: C♯ · D♭\./);
  // …and keeps it with Advanced off, though the chooser no longer offers it.
  await setSetting('advancedBeats', false);
  assert.match(card().getAttribute('aria-label'), /^Row 1: C♯ · D♭\./);
  card().dispatch('click');
  assert.equal($('#chooser-grid').querySelector('[data-choose="pip-note-cs"]'), null);
  $('#chooser-grid').querySelector(`[data-choose="${was}"]`).dispatch('click');   // put the row back for the tests after
  $('#chooser-ok').dispatch('click');
  $('#pads-tab').dispatch('click');
  assert.deepEqual(notes(), NOTES.filter((n) => !n.includes('♯')));
});

test('Edit sounds: a kit pad\'s 🗑️ hides it and 👁 brings it back', async () => {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const kick = () => pads().find((p) => labelOf(p) === 'Kick');
  const badge = (pad) => pad.parent.querySelector('[data-x]');   // in the pad's cell, beside ✏️
  assert.equal(badge(kick()).dataset.x, 'hide');
  assert.equal(badge(kick()).getAttribute('aria-label'), 'Hide Kick');
  badge(kick()).dispatch('click');
  await page.settle();
  assert.ok(kick().classList.contains('hidden-clip'), 'hidden, still shown dimmed in edit mode');
  assert.equal(badge(kick()).dataset.x, 'show');
  assert.equal(badge(kick()).getAttribute('aria-label'), 'Bring back Kick');
  badge(kick()).dispatch('click');
  await page.settle();
  assert.equal(kick().classList.contains('hidden-clip'), false, 'brought back');
  $('#edit-toggle').dispatch('click');
  assert.equal($('#pads').querySelector('[data-x]'), null, 'no 🗑️ outside Edit sounds');
  // While playing, only ✏️, in a part styles.css shows on hover with a mouse (never on touch).
  const hover = kick().parent.querySelector('.pad-hover');
  assert.deepEqual(hover.children.map((b) => b.getAttribute('aria-label')), ['Edit Kick']);
  hover.querySelector('[data-edit]').dispatch('click');
  assert.equal($('#sheet').open, true, '✏️ opens the sound sheet while playing');
  assert.equal($('#clip-label').value, 'Kick', 'its name, in the title bar');
  $('#sheet').close();
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.pad-hover \{ display: none; \}/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s*body:not\(\.editing\) \.pad-cell:is\(:hover, :focus-within\) > \.pad-hover \{ display: flex; \}/);
});

test('a kit group with every sound hidden has no heading, on the pads or in a sound picker; Edit sounds keeps it, dimmed, to bring them back', async () => {
  const header = (id) => groupHeaders().find((h) => h.dataset.group === id);
  const game = BOARDS.kit.filter((k) => k.group === 'game').map((k) => k.label);
  const badges = (kind) => pads().filter((p) => game.includes(labelOf(p))).map((p) => p.parent.querySelector(`[data-x="${kind}"]`)).filter(Boolean);
  const pickerSections = () => $('#chooser-grid').querySelectorAll('[data-toggle-group]').map((h) => h.dataset.toggleGroup);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  if (header('game').getAttribute('aria-expanded') === 'false') header('game').dispatch('click');
  while (badges('hide').length) { badges('hide')[0].dispatch('click'); await page.settle(); }   // each tap redraws the pads
  assert.ok(header('game').classList.contains('all-hidden'), 'dimmed in Edit sounds');
  assert.equal(header('game').querySelector('.pad-group-count').textContent, `${game.length} hidden`);
  assert.ok(!header('drums').classList.contains('all-hidden'));
  $('#edit-toggle').dispatch('click');
  assert.equal(header('game'), undefined, 'no heading for a group with nothing to tap');
  assert.ok(header('drums'), 'other groups stay');
  // A row's sound picker leaves it out too.
  $('#beats-toggle').dispatch('click');
  $('#seq-rows').querySelector('[data-pick]').dispatch('click');
  assert.ok(pickerSections().includes('drums'));
  assert.ok(!pickerSections().includes('game'));
  $('#chooser').close();
  $('#pads-tab').dispatch('click');
  // Back in Edit sounds, the heading is there and 👁 brings each one back.
  $('#edit-toggle').dispatch('click');
  if (header('game').getAttribute('aria-expanded') === 'false') header('game').dispatch('click');
  while (badges('show').length) { badges('show')[0].dispatch('click'); await page.settle(); }   // each tap redraws the pads
  assert.ok(!header('game').classList.contains('all-hidden'));
  $('#edit-toggle').dispatch('click');
  assert.ok(header('game'));
});

// ADR 0017: 🎼 Song is a tab of its own, for everyone (out of Advanced).
// ADR 0024: a song is a playlist: lanes of beat blocks at one song tempo.
test('🎼 Song: its own tab, Advanced or not; pick a beat, then tap a spot on a lane; blocks never overlap; ➖ ➕ and a drag repeat one; 🗑️ asks first; ↩️ Undo; a deleted beat greys out', async () => {
  const { getSetting } = await import('../web/settings.js');
  assert.equal(getSetting('advancedBeats'), false, 'Advanced is off');
  assert.equal($('#beats-modes'), null, 'no 🥁 Beat · 🎼 Song switch on Beats');
  assert.ok($('.screens').contains($('#song-tab')), 'a toolbar tab of its own');
  $('#song-tab').dispatch('click');
  assert.equal($('#song-tab').getAttribute('aria-pressed'), 'true');
  assert.equal($('#beats-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal($('#song').hidden, false, 'shown with Advanced off');
  assert.equal($('#seq').hidden, true, 'its own screen, not under the beat grid');
  assert.match($('#screen-hint').textContent, /^Pick a beat, then tap a spot on a lane/);
  // Nothing is made for you: the scratch song is open (ADR 0020), and
  // nothing is saved until it changes.
  assert.equal($('#song-name').value, 'Scratch song');
  assert.ok(!$('#song-name').readOnly, 'a name typed here keeps it');
  assert.equal($('#song-rename').hidden, true);
  assert.equal($('#song-keep').hidden, false, '💾 Keep stands where ✏️ is');
  assert.equal($('#song-keep').disabled, true, 'nothing to keep yet');
  assert.equal($('#song-new').hidden, false);
  assert.equal(state.songs.has(state.personId), false);
  assert.equal(state.songbook.filter((s) => s.personId === state.personId).length, 0);
  // Four lanes to start, each with a fun name and picture, and a speaker.
  const lanes = () => $('#song-lanes').querySelectorAll('.song-lane');
  assert.equal(lanes().length, 4);
  assert.deepEqual(lanes().map((l) => l.querySelector('.lane-name').textContent), ['Drums', 'Bass', 'Keys', 'Voice']);
  assert.deepEqual(lanes().map((l) => l.querySelector('.lane-emoji').textContent), ['🥁', '🎸', '🎹', '🎤']);
  assert.ok(lanes().every((l) => l.querySelector('[data-speaker]')));
  assert.equal($('#song-lanes').querySelectorAll('[data-start-bar]').length, 16, 'bar numbers across the top');
  // 🆕 New opens a blank scratch song (Ben, 2026-10-12): nothing joins the list.
  $('#song-new').dispatch('click');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(state.songbook.filter((s) => s.personId === state.personId).length, 0, '🆕 New adds nothing to 🗂️ My songs');
  assert.equal(hasUndo(), false, 'an empty scratch emptied needs no Undo');
  assert.equal($('#song-step-undo').hidden, true, '↩️ Undo shows once there is something to take back');
  // Two saved beats: the open one with a pill on, then a new one at 132 BPM.
  const bar = () => document.querySelectorAll('.beat-bar')[0];
  const row0 = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row'))[0];
  newBeatWithRow(page);
  row0().querySelectorAll('.pill')[0].dispatch('click');
  const first = bar().querySelector('[data-beat-name]').value;
  newBeatWithRow(page);
  row0().querySelectorAll('.pill')[2].dispatch('click');
  const second = bar().querySelector('[data-beat-name]').value;
  state.savedBeats.find((b) => b.name === first).bpm = 132;
  $('#song-tab').dispatch('click');
  // The strip: your beats, newest first, as the pattern chips look.
  assert.deepEqual(stripChips($).map(chipName).slice(0, 2), [second, first]);
  assert.ok(stripChips($).every((c) => c.classList.contains('beat-chip')));
  assert.equal($('#song-empty').textContent, 'Pick a beat above, then tap a spot on a lane.');
  assert.equal($('#song-play').disabled, true, 'nothing to play yet');
  // A spot tapped with no beat picked says what to do.
  cellAt($, 0, 0).dispatch('click');
  assert.match($('#banner-text').textContent, /^Pick a beat above first/);
  assert.equal(allBlocks($).length, 0);
  // Pick, then tap: the beat goes there, and stays picked for more.
  pickBeat($, first);
  assert.equal(stripChips($).find((c) => chipName(c) === first).getAttribute('aria-pressed'), 'true');
  assert.match($('#song-empty').textContent, /^Now tap a spot on a lane/);
  cellAt($, 0, 0).dispatch('click');
  assert.deepEqual(blocksOn($, 0).map((b) => [b.bar, b.len, b.name]), [[0, 1, first]]);
  assert.equal($('#song-tempo').value, '132', 'the first beat in sets the song tempo');
  assert.equal(stripChips($).find((c) => chipName(c) === first).getAttribute('aria-pressed'), 'true', 'still picked');
  cellAt($, 0, 1).dispatch('click');
  cellAt($, 0, 4).dispatch('click');
  assert.deepEqual(blocksOn($, 0).map((b) => b.bar), [0, 1, 4]);
  // Lanes play together: the other beat on lane 2, at bar 0 too.
  dropBeat($, { lane: 1, bar: 0, name: second });
  assert.deepEqual(blocksOn($, 1).map((b) => [b.bar, b.name]), [[0, second]]);
  assert.equal($('#song-play').disabled, false);
  assert.equal($('#song-empty').hidden, true);
  const songNow = () => state.songbook.find((s) => s.personId === state.personId && s.id.startsWith('song-scratch-'));
  assert.equal(songNow().tempo, 132, 'saved as it changes');
  assert.deepEqual(songNow().lanes[0].blocks, [{ beatId: songNow().lanes[0].blocks[0].beatId, bar: 0, times: 1 }, { beatId: songNow().lanes[0].blocks[1].beatId, bar: 1, times: 1 }, { beatId: songNow().lanes[0].blocks[2].beatId, bar: 4, times: 1 }]);
  assert.equal(songNow().slots.length, 4, 'and the slots older copies read');
  // The block just placed is selected: its bar under the lanes, and its ⟷ end.
  assert.equal($('#song-sel').hidden, false);
  assert.ok($('#song-lanes').querySelector('[data-grip]'));
  // A tap on a block selects it, even with a beat picked: nothing goes on top.
  blocksOn($, 0)[1].el.dispatch('click');
  assert.equal(blocksOn($, 0).length, 3);
  assert.ok(blocksOn($, 0)[1].el.classList.contains('chosen'));
  assert.match($('#song-sel-text').textContent, new RegExp(`${first} · plays once`));
  // ➕ repeats it, up to where the next block starts (bar 4): three times.
  assert.equal($('#song-less').disabled, true);
  $('#song-more').dispatch('click');
  $('#song-more').dispatch('click');
  assert.deepEqual(blocksOn($, 0).map((b) => [b.bar, b.len]), [[0, 1], [1, 3], [4, 1]]);
  assert.equal($('#song-more').disabled, true, 'no room for a fourth');
  $('#song-less').dispatch('click');
  assert.equal(blocksOn($, 0)[1].len, 2);
  // A beat dropped on a block selects the block: nothing goes on top.
  dropBeat($, { lane: 0, bar: 2, name: first });
  assert.equal(blocksOn($, 0).length, 3);
  assert.ok(blocksOn($, 0)[1].el.classList.contains('chosen'));
  // Drag the selected block's end: two bars further, two more times.
  blocksOn($, 0)[2].el.dispatch('click');
  const grip = $('#song-lanes').querySelector('[data-grip]');
  const track = grip.parent;
  const cells = track.children.filter((c) => c.dataset.bar !== undefined).length;
  track.getBoundingClientRect = () => ({ left: 0, top: 0, right: cells * 48, bottom: 56, width: cells * 48, height: 56 });
  grip.dispatch('pointerdown', { clientX: 240 });
  page.winEvent('pointermove', { clientX: 240 + 2 * 48 });
  page.winEvent('pointerup', {});
  $('#song-lanes').querySelector('[data-grip]').dispatch('click');   // the click a browser sends after the drag
  assert.deepEqual(blocksOn($, 0).map((b) => [b.bar, b.len]), [[0, 1], [1, 2], [4, 3]]);
  assert.match($('#song-sel-text').textContent, /plays 3 times/);
  // ↩️ Undo takes back the drag (one step), then the ➖.
  $('#song-step-undo').dispatch('click');
  assert.equal(blocksOn($, 0)[2].len, 1);
  // 🗑️ asks first, then takes it off; ↩️ Undo brings it back.
  blocksOn($, 0)[1].el.dispatch('click');
  $('#song-remove').dispatch('click');
  assert.equal(blocksOn($, 0).length, 3, 'the first tap only asks');
  assert.equal($('#song-remove').textContent, 'Remove?');
  $('#song-remove').dispatch('click');
  assert.deepEqual(blocksOn($, 0).map((b) => b.bar), [0, 4]);
  assert.equal($('#song-sel').hidden, true);
  $('#song-step-undo').dispatch('click');
  assert.deepEqual(blocksOn($, 0).map((b) => [b.bar, b.len]), [[0, 1], [1, 2], [4, 1]]);
  // The keyboard: on a lane, → → → then Enter puts the picked beat at bar 3.
  const lane3 = () => $('#song-lanes [data-track="2"]');
  lane3().focus();
  for (let i = 0; i < 3; i++) lane3().dispatch('keydown', { key: 'ArrowRight' });
  assert.match(lane3().getAttribute('aria-label'), /^Keys lane, bar 4: empty, Enter puts/);
  lane3().dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(blocksOn($, 2).map((b) => b.bar), [3]);
  // On a block, + repeats it and Delete asks, then takes it off.
  const kb = blocksOn($, 2)[0].el;
  kb.dispatch('keydown', { key: '+' });
  assert.equal(blocksOn($, 2)[0].len, 2);
  blocksOn($, 2)[0].el.dispatch('keydown', { key: 'Delete' });
  blocksOn($, 2)[0].el.dispatch('keydown', { key: 'Delete' });
  assert.equal(blocksOn($, 2).length, 0);
  // The tempo: ➕ by 5, typed, and kept between 60 and 180.
  $('#song-tempo-up').dispatch('click');
  assert.equal(songNow().tempo, 137);
  $('#song-tempo').value = '400';
  $('#song-tempo').dispatch('change');
  assert.equal($('#song-tempo').value, '180');
  assert.equal($('#song-tempo-up').disabled, true);
  // A bar number tapped: ▶ Play song starts there.
  $('#song-lanes').querySelector('[data-start-bar="4"]').dispatch('click');
  assert.equal($('#song-lanes').querySelector('[data-start-bar="4"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('#song-lanes').querySelector('[data-start-bar="0"]').getAttribute('aria-pressed'), 'false');
  // A lane's speaker mutes it; its name and picture change in its sheet.
  lanes()[1].querySelector('[data-speaker]').dispatch('click');
  assert.equal(songNow().lanes[1].muted, true);
  assert.ok(lanes()[1].classList.contains('muted'));
  lanes()[1].querySelector('[data-lane-pick]').dispatch('click');
  assert.equal($('#lane-sheet').open, true);
  assert.equal($('#lane-name').value, 'Bass');
  $('#lane-name').value = 'Wobbles';
  $('#lane-name').dispatch('change');
  $('#lane-grid').querySelector('[data-lane-emoji="🐸"]').dispatch('click');
  $('#lane-sheet').close();
  assert.equal(lanes()[1].querySelector('.lane-name').textContent, 'Wobbles');
  assert.equal(lanes()[1].querySelector('.lane-emoji').textContent, '🐸');
  assert.deepEqual([songNow().lanes[1].name, songNow().lanes[1].emoji], ['Wobbles', '🐸']);
  // ➕ Add a lane, up to eight.
  for (let i = 0; i < 6; i++) $('#song-add-lane').dispatch('click');
  assert.equal(lanes().length, 8);
  assert.equal($('#song-add-lane').disabled, true);
  assert.equal(lanes()[7].querySelector('.lane-name').textContent, 'Horns');
  // 💾 Keep: a song in 🗂️ My songs with a fun name, which saves itself.
  $('#song-keep').dispatch('click');
  assert.equal($('#song-rename').hidden, false);
  assert.ok(state.songbook.some((s) => s.name === $('#song-name').value), '💾 Keep puts it in the list');
  assert.equal(state.songs.get(state.personId).lanes.length, 8);
  // Deleting a beat in 🗂️ My beats: its blocks stay, greyed, as a deleted beat.
  $('#beats-toggle').dispatch('click');
  bar().querySelector('[data-beat-open]').dispatch('click');
  const lib = () => $('#lib-list').children.find((li) => li.querySelector('.lib-name').textContent === first);
  lib().querySelector('[data-delete]').dispatch('click');
  lib().querySelector('[data-delete]').dispatch('click');
  $('#library').close();
  $('#song-tab').dispatch('click');
  assert.ok(blocksOn($, 0)[0].el.classList.contains('gone'));
  assert.equal(blocksOn($, 0)[0].name, 'Deleted beat');
  assert.ok(!stripChips($).some((c) => chipName(c) === first), 'gone from the strip');
  assert.equal($('#song-play').disabled, false, 'the other beat still plays');
  // Advanced on and off again: Song stays.
  $('#settings-open').dispatch('click');
  $('#level-keys').querySelector('[data-level="advanced"]').dispatch('click');
  $('#level-keys').querySelector('[data-level="regular"]').dispatch('click');
  $('#settings-dialog').close();
  await page.settle();
  assert.equal($('#song').hidden, false, 'Advanced off leaves Song where it is');
  $('#pads-tab').dispatch('click');
  $('#song-tab').dispatch('click');
  assert.equal($('#song').hidden, false);
  $('#pads-tab').dispatch('click');
});

test('songs are a list, like beats: the open song saves itself; 🆕 New, 🗂️ My songs, ⧉ duplicate, 🗑️ delete (asks first); a song from before the list, or the playlist, joins it as lanes', async () => {
  $('#song-tab').dispatch('click');
  const pid = state.personId;
  const mine = () => state.songbook.filter((s) => s.personId === pid);
  const names = () => $('#songs-list').children.map((li) => li.querySelector('.lib-name').textContent);
  // The open song has a block, so it is in the list; rename it.
  if (!allBlocks($).length) dropBeat($);
  $('#song-name').value = 'Verse';
  $('#song-name').dispatch('change');
  assert.ok(mine().some((s) => s.name === 'Verse' && s.id === state.songs.get(pid).id));
  // 🆕 New: the blank scratch song; Verse is kept. 💾 Keep makes a second song.
  $('#song-new').dispatch('click');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(allBlocks($).length, 0);
  dropBeat($);
  $('#song-keep').dispatch('click');
  $('#song-name').value = 'Verse';
  $('#song-name').dispatch('change');
  assert.equal($('#song-name').value, 'Verse 2', 'two songs never share a name');
  // 🗂️ My songs lists both, marks the open one, and opens the other.
  $('#song-open').dispatch('click');
  assert.equal($('#songs').open, true);
  assert.ok(names().includes('Verse') && names().includes('Verse 2'));
  const item = (n) => $('#songs-list').children.find((li) => li.querySelector('.lib-name').textContent === n);
  assert.ok(item('Verse 2').classList.contains('current'));
  assert.match(item('Verse').querySelector('.lib-info').textContent, /^\d+ blocks? · \d+ BPM$/);
  item('Verse').querySelector('[data-load]').dispatch('click');
  assert.equal($('#songs').open, false);
  assert.equal($('#song-name').value, 'Verse');
  // ⧉ then 🗑️ (asks first).
  $('#song-open').dispatch('click');
  item('Verse').querySelector('[data-dup]').dispatch('click');
  assert.ok(names().includes('Verse 3'));
  item('Verse 3').querySelector('[data-delete]').dispatch('click');
  assert.ok(names().includes('Verse 3'), 'the first tap only asks');
  item('Verse 3').querySelector('[data-delete]').dispatch('click');
  assert.ok(!names().includes('Verse 3'));
  // Deleting the open song opens the scratch song.
  item('Verse').querySelector('[data-delete]').dispatch('click');
  item('Verse').querySelector('[data-delete]').dispatch('click');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(state.songs.has(pid), false);
  item('Verse 2').querySelector('[data-load]').dispatch('click');
  assert.equal($('#song-name').value, 'Verse 2');
  // A song kept before songs were a list (version 8: no id, slots) becomes
  // the open song, joins the list, and opens as lanes (ADR 0024): its slots
  // in order on lane 1, at its first beat's tempo.
  const beat = state.savedBeats.find((b) => b.id === state.songs.get(pid).lanes[0].blocks[0].beatId);
  state.songs.set(pid, { personId: pid, name: 'Old Anthem', slots: [{ beatId: beat.id, times: 3 }, { beatId: beat.id, times: 1 }] });
  people()[0].dispatch('click');
  assert.equal($('#song-name').value, 'Old Anthem');
  const linked = state.songs.get(pid);
  assert.match(linked.id, /^song-/);
  const bars = beat.bars ?? 1;
  assert.deepEqual(mine().find((s) => s.id === linked.id).lanes[0].blocks, [{ beatId: beat.id, bar: 0, times: 3 }, { beatId: beat.id, bar: 3 * bars, times: 1 }]);
  assert.equal(mine().find((s) => s.id === linked.id).tempo, beat.bpm);
  assert.deepEqual(blocksOn($, 0).map((b) => b.bar), [0, 3 * bars]);
  // An empty open song that never joined the list was made by the app: it closes.
  state.songs.set(pid, { personId: pid, name: 'Made For You', slots: [] });
  people()[0].dispatch('click');
  assert.equal($('#song-name').value, 'Scratch song');
  assert.equal(state.songs.has(pid), false);
  assert.ok(!mine().some((s) => s.name === 'Made For You'));
  $('#settings-open').dispatch('click');
  $('#level-keys').querySelector('[data-level="regular"]').dispatch('click');
  $('#settings-dialog').close();
  await page.settle();
  $('#pads-tab').dispatch('click');
});

// ADR 0017: one open beat, not two. Beats shows it with ⌨️ Keys off or on;
// 🎤 Live has none.
test('one open beat: ⌨️ Keys on and off show the same beat and its edits; New, Open and Delete act on it; Live needs no beat', async () => {
  const beatsBar = () => document.querySelectorAll('.beat-bar')[0];
  const djBar = () => $('#dj-beatbar');
  const nameOf = (bar) => bar.querySelector('[data-beat-name]').value;
  const pills = () => $('#seq-rows').children.filter((c) => c.classList.contains('seq-row') && !c.classList.contains('collapsed'))[0].querySelectorAll('.pill');
  const lit = () => pills().map((p, i) => (p.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0);
  const djLit = () => $('#dj-grid').children[0].querySelectorAll('[data-step]').map((p, i) => (p.classList.contains('on') ? i : -1)).filter((i) => i >= 0);
  const library = () => $('#lib-list').children;
  // A new beat with Keys off is the beat with Keys on.
  keysOff(page);
  newBeatWithRow(page);
  const first = nameOf(beatsBar());
  pills()[5].dispatch('click');
  keysOn(page);
  assert.equal(nameOf(djBar()), first, 'the same beat with ⌨️ Keys on');
  assert.deepEqual(djLit(), [5]);
  // An edit with Keys on shows with Keys off: one file.
  $('#dj-grid').children[0].querySelectorAll('[data-step]')[9].dispatch('click');
  keysOff(page);
  assert.deepEqual(lit(), [5, 9], 'one beat, two views');
  // 🆕 New with Keys on replaces the open beat everywhere; the first stays in 🗂️ My beats.
  keysOn(page);
  await newBuilderBeatWithRow(page);
  const second = nameOf(djBar());
  assert.notEqual(second, first);
  keysOff(page);
  assert.equal(nameOf(beatsBar()), second, 'Keys off shows the new one too');
  assert.equal(state.patterns.get(state.personId).id, state.savedBeats.find((b) => b.name === second).id, 'stored once, as Beats\' open beat');
  beatsBar().querySelector('[data-beat-open]').dispatch('click');
  assert.ok(library().some((li) => li.querySelector('.lib-name').textContent === first), 'the first beat is in 🗂️ My beats');
  // Deleting the open beat opens the scratch, Keys on or off (ADR 0020).
  const item = () => library().find((li) => li.querySelector('.lib-name').textContent === second);
  item().querySelector('[data-delete]').dispatch('click');
  item().querySelector('[data-delete]').dispatch('click');
  $('#library').close();
  assert.equal(nameOf(beatsBar()), 'Scratch beat');
  assert.equal(state.patterns.has(state.personId), false, 'the scratch open is no record');
  keysOn(page);
  assert.equal(nameOf(djBar()), 'Scratch beat');
  assert.equal(djBar().querySelector('[data-beat-keep]').hidden, false, '💾 Keep with ⌨️ Keys on too');
  assert.equal($('#dj-record').disabled, false, '● Record records into the scratch');
  // ➕ Add to this beat adds to the scratch too.
  keysOff(page);
  $('#seq-grooves').dispatch('click');
  assert.equal($('#groove-how').querySelector('[data-how="add"]').disabled, false);
  $('#grooves').close();
  // 🎤 Live has no beat bar and needs no beat to record.
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-beatbar').hidden, true);
  assert.equal($('#dj-record').disabled, false, 'Live needs no beat');
  assert.equal($('#dj-takes-open').hidden, false);
  $('#pads-tab').dispatch('click');
});

// ADR 0017's upgrade: a device from before kept Beat Builder's own open
// beat as `beatId` on the person's deck (ADR 0008). Beats' open beat is the
// one that stays open; Beat Builder's stays in 🗂️ My beats; the deck drops the
// id the next time it saves, and nothing brings it back.
test('upgrade: Beats\' open beat stays open, with ⌨️ Keys on too; Beat Builder\'s own beat stays in 🗂️ My beats; the deck drops its id', async () => {
  const pid = state.personId;
  const beat = (id, name) => ({ id, personId: pid, name, bpm: 100, bars: 1, signature: '4/4', created: 1, saved: 1, rows: [{ clipId: `${pid}-kick`, steps: [true, false, true, false] }] });
  state.savedBeats = [...state.savedBeats, beat('beat-onbeats', 'On Beats'), beat('beat-inbuilder', 'In Builder')];
  state.patterns.set(pid, beat('beat-onbeats', 'On Beats'));
  state.decks.set(pid, { personId: pid, keys: {}, beatId: 'beat-inbuilder' });
  people()[1].dispatch('click');
  people()[0].dispatch('click');
  keysOff(page);
  assert.equal(document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value, 'On Beats');
  keysOn(page);
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'On Beats', 'the keys show Beats\' beat, not Beat Builder\'s');
  $('#dj-beatbar').querySelector('[data-beat-open]').dispatch('click');
  assert.ok($('#lib-list').children.some((li) => li.querySelector('.lib-name').textContent === 'In Builder'), 'Beat Builder\'s beat is in 🗂️ My beats');
  $('#library').close();
  // ✏️ Edit keys saves the deck: the old id goes, the keys stay.
  $('#dj-change').dispatch('click');
  $('#ke-reset').dispatch('click');
  $('#ke-reset').dispatch('click');
  $('#keys-edit').close();
  assert.ok(state.decks.has(pid));
  assert.equal('beatId' in state.decks.get(pid), false, 'the deck no longer names a second open beat');
  // A deck from the cloud or a backup that still has one changes nothing.
  state.decks.set(pid, { ...state.decks.get(pid), beatId: 'beat-inbuilder' });
  people()[1].dispatch('click');
  people()[0].dispatch('click');
  keysOn(page);
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'On Beats');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

test('an open beat saved before the library stays open on Beats; an empty one the app made closes', () => {
  const pid = state.personId;
  state.patterns.set(pid, { personId: pid, name: 'Old Groove', bpm: 110, rows: [{ clipId: `${pid}-kick`, steps: [true, false, true] }] });
  people()[1].dispatch('click');
  people()[0].dispatch('click');
  $('#beats-toggle').dispatch('click');
  assert.equal(document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value, 'Old Groove');
  const linked = state.patterns.get(pid);
  assert.match(linked.id, /^beat-/);
  assert.ok(state.savedBeats.some((b) => b.id === linked.id && b.bpm === 110), 'it joins the list');
  keysOn(page);
  assert.equal($('#dj-beatbar').querySelector('[data-beat-name]').value, 'Old Groove', 'and with ⌨️ Keys on');
  keysOff(page);
  // An empty beat that never joined the list was made by the app: the scratch opens.
  state.patterns.set(pid, { personId: pid, name: 'Made For You', bpm: 100, rows: [{ clipId: `${pid}-kick`, steps: [] }] });
  people()[1].dispatch('click');
  people()[0].dispatch('click');
  $('#beats-toggle').dispatch('click');
  assert.equal(document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value, 'Scratch beat');
  assert.equal(state.patterns.has(pid), false);
  assert.ok(!state.savedBeats.some((b) => b.name === 'Made For You'));
  $('#pads-tab').dispatch('click');
});

// Ben, 2026-10-11: "it would be nice to have a slider here … allow the user
// to see the transition of 'any' size they want". One smooth slider, many
// stops (so no S M L keys); the grid follows it while it moves, and the size
// is kept as a setting when it lets go (backups carry it). Its ends are the
// screen's own smallest and biggest pads (pad-size.js; the fake page has no
// layout, so the widths themselves are tested there).
test('Pads has a pad size: one smooth slider sizes the grid as it moves and is remembered', async () => {
  const { getSetting, setSetting } = await import('../web/settings.js');
  const slider = $('#pads-size-slider');
  assert.equal(slider.getAttribute('aria-label'), 'Pad size');
  assert.equal(['min', `max`, 'step'].map((a) => slider.getAttribute(a)).join(' '), '0 100 1');   // max in backticks: tests/no-names.test.mjs
  assert.equal($('#pads-size').classList.contains('keyed'), false, 'many stops: a slider, not keys');
  assert.equal($('#pads-size').querySelector('.slider-keys'), null);
  assert.equal(getSetting('padSize'), 'auto', 'the screen\'s own size to begin with');
  assert.equal(slider.getAttribute('aria-valuetext'), 'Medium');
  slider.value = '25';
  slider.dispatch('input');
  assert.equal(slider.getAttribute('aria-valuetext'), '25%', 'the slider says where it is while it moves');
  assert.equal(getSetting('padSize'), 'auto', 'kept only when it lets go');
  slider.dispatch('change');
  assert.equal(getSetting('padSize'), 0.25, 'kept as a setting, a share of the way from smallest to biggest');
  // A loaded backup (or anything else) setting it moves the slider.
  await setSetting('padSize', 1);
  assert.equal(slider.value, '100');
  assert.equal(slider.getAttribute('aria-valuetext'), 'Biggest');
  await setSetting('padSize', 'auto');
});

// 🔔 Overlap on 🎤 Live (Ben, 2026-10-12: "next to the click track (on the
// right) as a button for the whole session"): on, a key's repeated hits ring
// over each other; off, each hit restarts its sound. For the visit only.
test('🎤 Live: 🔔 Overlap right of ⏲️ Click track makes every key ring over itself, for this visit only; takes keep it', async () => {
  const { audio } = await import('../web/audio.js');
  $('#live-tab').dispatch('click');
  const b = $('#dj-overlap');
  assert.equal(b.textContent, '🔔 Overlap');
  assert.ok($('.dj-end').contains(b));
  assert.equal(b.hidden, false);
  assert.equal(b.getAttribute('aria-pressed'), 'false', 'off at the start of a visit');
  const calls = [];
  const realPlay = audio.play;
  audio.play = function (clip, opts) { calls.push(opts?.ring === true); };
  const writes = [];
  const realStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: (k) => writes.push(k), removeItem: (k) => writes.push(k) };
  try {
    page.key('a', { code: 'KeyA' }); page.keyup?.('a', { code: 'KeyA' });
    writes.length = 0;   // a key counts its use ('uses'); the button saves nothing
    b.dispatch('click');
    assert.equal(b.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(writes.filter((k) => k !== 'uses'), [], 'not remembered: nothing saved on this device (turning it on is counted, uses.js)');
    $('#dj-record').dispatch('click');
    page.key('s', { code: 'KeyS' }); page.keyup?.('s', { code: 'KeyS' });
    page.key('s', { code: 'KeyS' }); page.keyup?.('s', { code: 'KeyS' });
    $('#dj-record').dispatch('click');
    assert.deepEqual(calls, [false, true, true], 'off restarts; on rings');
    const take = state.takes.at(-1);
    assert.ok(take.events.filter((e) => e.kind === 'hit').every((e) => e.ring === true), 'the take keeps that its hits rang');
    // With ⌨️ Keys on Beats it is not there, and the keys restart.
    keysOn(page);
    assert.equal(b.hidden, true, 'Live only');
    calls.length = 0;
    page.key('a', { code: 'KeyA' }); page.keyup?.('a', { code: 'KeyA' });
    assert.deepEqual(calls, [false]);
    keysOff(page);
    $('#live-tab').dispatch('click');
    b.dispatch('click');
    assert.equal(b.getAttribute('aria-pressed'), 'false');
  } finally {
    audio.play = realPlay;
    globalThis.localStorage = realStorage;
  }
  // The audio: a ringing hit keeps the sound's last hit sounding under it,
  // up to 8 at once; a hit that doesn't ring, or a stop, ends them all.
  const sound = { buffer: {}, duration: 5 };
  const ctx = audio.context();
  ctx.createBufferSource ??= () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, loop: false });   // the fake page's context makes no sources
  audio.start('ring-test', sound);
  audio.start('ring-test', sound, { ring: true });
  assert.equal(audio.ringing.get('ring-test').length, 1);
  for (let k = 0; k < 10; k++) audio.start('ring-test', sound, { ring: true });
  assert.equal(audio.ringing.get('ring-test').length, 7, 'with the one playing: 8 at once');
  audio.start('ring-test', sound);
  assert.equal(audio.ringing.get('ring-test'), undefined, 'a hit that restarts ends the ringing too');
  audio.start('ring-test', sound, { ring: true });
  audio.stop('ring-test');
  assert.equal(audio.ringing.has('ring-test'), false);
  assert.equal(audio.playing.has('ring-test'), false);
  $('#pads-tab').dispatch('click');
});
