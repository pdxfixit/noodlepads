// A new device with the real boards.json, which lists no people: the app
// starts with one board, "Me", with the kit, and no names anywhere.

import { test, before } from 'node:test';
import { isFunName } from '../web/names.js';
import { PICTURES } from '../web/model.js';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { state } from '../web/state.js';

let page;
before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage();      // the real web/boards.json
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
});

test('a new device starts with one board, a fun name and a picture (never "Me"), and the kit', () => {
  const $ = page.$;
  const all = [...state.peopleEdits.values()];
  assert.equal(all.length, 1);
  assert.ok(isFunName(all[0].name), all[0].name);
  assert.ok(PICTURES.includes(all[0].avatar));
  assert.equal(all[0].added, true);
  assert.equal(all[0].solo, true, "the app's own first person, dropped if data arrives with nothing of theirs");
  assert.equal($('#people').hidden, false, 'they show in the corner, like anyone');
  const pads = $('#pads').querySelectorAll('.pad').filter((c) => c.dataset.id);
  assert.ok(pads.length > 0, 'the kit is there');
  assert.ok(pads.every((p) => p.dataset.id.startsWith(`${all[0].id}-`)), 'every pad is their copy of the kit');
  const headings = $('#pads').children.filter((c) => c.classList.contains('pad-section')).map((h) => h.textContent);
  assert.equal(headings[0], 'My sounds');
});

test('✏️ Edit keys shows 🎤 My sounds on a new device too, and says how to make one', () => {
  const $ = page.$;
  $('#live-tab').dispatch('click');
  $('#dj-change').dispatch('click');
  const mine = $('#ke-groups').querySelector('[data-group="mine"]');
  assert.ok(mine, '🎤 My sounds is there with nothing made yet');
  assert.notEqual(mine.getAttribute('aria-pressed'), 'true', 'it opens on a group that has sounds');
  mine.dispatch('click');
  assert.equal($('#ke-picks').children.length, 0);
  assert.match($('#ke-picks-hint').textContent, /No sounds of your own yet/);
});
