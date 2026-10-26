// Pad skins (skins.js; Ben, 2026-10-16): each person's `padSkin` puts a
// `data-skin` on the page's root, and styles.css draws every pad in it.
// The real app on the stand-in page: the root follows the setting, a switch
// of person and a loaded backup; a pad says `playing` while its sound is
// part way. How each skin looks needs a browser: `just look --skin all`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { SKINS, SKIN_IDS, nextSkin, skinLabel, showSkin } from '../web/skins.js';

let page;
let $;
let state;
let settings;

before(async () => {
  console.error = () => {};  // clips fail to load without audio; that is expected here
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  settings = await import('../web/settings.js');
});

const root = () => document.documentElement;
const people = () => $('#people').querySelectorAll('[data-person]');

test('seven skins, Tiles first; the next after Googly eyes is Tiles again', () => {
  assert.deepEqual(SKIN_IDS, ['tiles', 'slam', 'lit', 'switch', 'spinner', 'jelly', 'googly']);
  assert.deepEqual(SKINS.map((s) => s.label), ['Tiles', 'Slam buttons', 'Lit pads', 'Switch', 'Spinner', 'Jelly', 'Googly eyes']);
  assert.ok(SKINS.every((s) => s.emoji));
  assert.equal(nextSkin('tiles'), 'slam');
  assert.equal(nextSkin('googly'), 'tiles');
  assert.equal(nextSkin('junk'), 'tiles');
  assert.equal(skinLabel('jelly'), 'Jelly');
  assert.equal(skinLabel('junk'), 'Tiles');
});

test('showSkin puts the skin on a box; Tiles and anything unknown take it off', () => {
  const box = { dataset: {} };
  showSkin(box, 'slam');
  assert.equal(box.dataset.skin, 'slam');
  showSkin(box, 'tiles');
  assert.equal('skin' in box.dataset, false);
  showSkin(box, 'lit');
  showSkin(box, 'glitter');
  assert.equal('skin' in box.dataset, false);
});

test('the page starts in Tiles: no data-skin on the root', () => {
  assert.equal(settings.getSetting('padSkin'), 'tiles');
  assert.equal(root().hasAttribute('data-skin'), false);
});

test('choosing a skin puts it on the root; Tiles takes it off', async () => {
  await settings.setSetting('padSkin', 'slam');
  assert.equal(root().getAttribute('data-skin'), 'slam');
  await settings.setSetting('padSkin', 'tiles');
  assert.equal(root().hasAttribute('data-skin'), false);
});

test('each person has their own skin: switching person follows it', async () => {
  people()[0].dispatch('click');
  await settings.setSetting('padSkin', 'jelly');
  people()[1].dispatch('click');
  await page.settle();
  assert.equal(root().hasAttribute('data-skin'), false, 'the second person never chose one');
  await settings.setSetting('padSkin', 'googly');
  people()[0].dispatch('click');
  await page.settle();
  assert.equal(root().getAttribute('data-skin'), 'jelly');
  people()[1].dispatch('click');
  await page.settle();
  assert.equal(root().getAttribute('data-skin'), 'googly');
  people()[0].dispatch('click');
  await page.settle();
});

// An open database that keeps what is written to it (as older-stores.test.mjs).
function memoryDatabase() {
  const stores = new Map();
  const store = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  return {
    stores,
    close() {},
    transaction: (name) => ({
      set oncomplete(fn) { queueMicrotask(fn); },
      objectStore: () => ({
        put: (v) => { store(name).set(v.id ?? v.personId ?? v.key, v); return {}; },
        delete: (id) => { store(name).delete(id); return {}; },
        getAll: () => ({ result: [...store(name).values()] }),
      }),
    }),
  };
}

test('loading a backup brings the person\'s skin, and the page shows it', async () => {
  const { db } = await import('../web/store.js');
  const { makeBackup, readBackup } = await import('../web/backup.js');
  const ui = await import('../web/backup-ui.js');
  const me = state.personId;
  // A device where this person never chose a skin: the backup's comes in.
  state.prefs.delete(me);
  settings.followPerson();
  assert.equal(root().hasAttribute('data-skin'), false);
  db.handle = memoryDatabase();
  try {
    const zip = await makeBackup({ people: [], clips: [], overrides: [], orders: [], patterns: [], beats: [], prefs: [{ personId: me, values: { padSkin: 'spinner' } }] });
    const data = await readBackup(zip, ui.whatIsHere());
    await ui.storeLoaded(data);
    assert.equal(settings.getSetting('padSkin'), 'spinner');
    assert.equal(root().getAttribute('data-skin'), 'spinner');
  } finally {
    db.handle = null;
  }
});

test('a pad says playing while its sound is part way, and not once it ends or is stopped', async () => {
  const { setProgress, padFor } = await import('../web/pads.js');
  const { audio } = await import('../web/audio.js');
  const pad = $('#pads').querySelectorAll('.pad').find((p) => p.dataset.id);
  const id = pad.dataset.id;
  assert.equal(padFor(id), pad);
  setProgress(id, 0.3);
  assert.ok(pad.classList.contains('playing'));
  assert.equal(pad.style.props['--progress'], 0.3);
  setProgress(id, 1);
  assert.equal(pad.classList.contains('playing'), false, 'the end of the sound');
  setProgress(id, 0.5);
  setProgress(id, 0);
  assert.equal(pad.classList.contains('playing'), false, 'back to the start');
  // Stopped early: audio.stop says 0 for it (audio.on.progress is setProgress).
  setProgress(id, 0.5);
  const ctxWas = audio.ctx;
  audio.ctx = { currentTime: 0 };
  audio.playing.set(id, { src: { stop() {} }, gain: null, t0: 0, duration: 1, loop: false });
  audio.stop(id);
  audio.ctx = ctxWas;
  assert.equal(pad.classList.contains('playing'), false, 'stopped part way');
});

// ⚙️ Settings → 🎨 Look: a radio per skin, each with a sample pad in that skin.
test('🎨 Look: seven choices, each a sample in its own skin; choosing one skins the page and the heading says which', async () => {
  people()[0].dispatch('click');
  await settings.setSetting('padSkin', 'tiles');
  $('#settings-open').dispatch('click');
  const picks = $('#skin-picks').querySelectorAll('.set-skin');
  assert.deepEqual(picks.map((p) => p.dataset.skin), SKIN_IDS, 'each sample carries its own skin, Tiles too (so the page\'s never shows there)');
  assert.deepEqual(picks.map((p) => p.querySelector('.set-skin-name').textContent), SKINS.map((s) => s.label));
  const radios = picks.map((p) => p.querySelector('input'));
  assert.ok(radios.every((r) => r.getAttribute('type') === 'radio' && r.getAttribute('name') === 'padSkin'), 'one radio group: arrow keys move the choice');
  assert.deepEqual(radios.map((r) => r.getAttribute('aria-label')), SKINS.map((s) => s.label), 'a tooltip and a name for each');
  assert.ok(picks.every((p) => p.querySelector('.skin-sample.pad')), 'a sample pad in each');
  assert.equal(radios[0].checked, true);
  const chip = () => $('#set-look').querySelector('.set-head-chip');
  assert.equal(chip().textContent, 'Tiles');
  radios[3].checked = true;
  radios[3].dispatch('change');
  await page.settle();
  assert.equal(settings.getSetting('padSkin'), 'switch');
  assert.equal(root().getAttribute('data-skin'), 'switch');
  assert.equal(chip().textContent, 'Switch');
  assert.ok(picks[3].querySelector('.skin-sample').classList.contains('playing'), 'the chosen sample shows itself playing');
  assert.equal(picks[0].querySelector('.skin-sample').classList.contains('playing'), false);
  // The ring is a class, not :has(input:checked): Firefox 115 to 120 (at the browser floor) has no :has().
  assert.deepEqual(picks.map((p) => p.classList.contains('on')), SKIN_IDS.map((id) => id === 'switch'), 'only the chosen box is marked');
  // Another person's skin shows in the dialog when they are showing.
  $('#settings-dialog').close();
  people()[1].dispatch('click');
  await page.settle();
  $('#settings-open').dispatch('click');
  const now = $('#skin-picks').querySelectorAll('input').find((r) => r.checked);
  assert.equal(now.dataset.value, settings.getSetting('padSkin'));
  $('#settings-dialog').close();
  people()[0].dispatch('click');
  await settings.setSetting('padSkin', 'tiles');
  await page.settle();
});
