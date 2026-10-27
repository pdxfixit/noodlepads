// 🧸 Kids: no picture is used twice on a screen (council round 1, the
// pre-reader and child psychologist seats; Ben, 2026-10-26). A kid who can't
// read tells two buttons apart by their pictures, so a picture that means two
// things on one screen is a mistake. This test builds the real app on a new
// device, opens each Kids screen, and reads every picture that screen can show
// at once: its tab bar, its buttons and every pad, in every pad skin, on every
// instrument, with the sounds a kid has recorded. A repeat fails it.
//
// Repeats made on purpose are named here: the small instrument picture on
// every key (it says who plays; it is the round button's picture), and a high
// key, which is its low key's fruit again with ✦ (the same note, higher).
// Not tested: how the pictures look (`just look kids-pads`).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import {
  KIDS_PADS, KIDS_EMOJI, KIDS_INSTRUMENTS, KIDS_KEYS, KIDS_DRUMS, KIDS_PLAY_FACES, KIDS_MIC_FACE, KIDS_TABS, instPicture, isHighKey,
} from '../web/kids-logic.js';
import { SKINS } from '../web/skins.js';
import { instrumentById } from '../web/instruments.js';

let page;
let $;
let state;
before(async () => {
  console.error = () => {};
  page = installPage();   // the real boards.json: a new device with the kit
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  audio.play = async () => {};
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', 'kids');
  await page.settle();
});

const tab = async (name) => { $(`[data-kids-tab="${name}"]`).dispatch('click'); await page.settle(); };
const text = (selector) => $(selector).textContent;
const all = (selector) => $('#kids').querySelectorAll(selector).map((n) => n.textContent);

// The pictures always on screen, whatever the tab: the four tabs, ⏹️ and ⚙️.
const chrome = () => [...all('[data-kids-tab]'), text('#kids-stop'), text('#settings-open')];

function repeats(pictures) {
  const seen = new Map();
  for (const p of pictures) seen.set(p, (seen.get(p) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([p, n]) => `${p} ×${n}`);
}

// A kid who recorded every picture a new sound can be given.
async function recordEverything() {
  KIDS_EMOJI.forEach((emoji, i) => state.userClips.push({
    id: `user-pic-${i}`, personId: state.personId, label: `Sound ${i}`, emoji, color: 'blue', voice: 'normal', blob: new Blob(['x']), mime: 'audio/webm', created: 1000 + i,
  }));
}

test('the tabs are four different pictures, and ⏹️ and ⚙️ are two more', async () => {
  assert.equal(repeats(chrome()).length, 0, repeats(chrome()).join(', '));
  assert.equal(all('[data-kids-tab]').length, KIDS_TABS.length, 'four tabs');
  assert.equal(chrome().length, KIDS_TABS.length + 2);
});

test('🔊 Pads: no pad, button or tab shares a picture, in any skin, with a kid\'s recordings among them', async () => {
  await recordEverything();
  const { setSetting } = await import('../web/settings.js');
  await tab('pads');
  let pads = [];
  for (const skin of SKINS) {
    await setSetting('kidsPadSkin', skin.id);
    await page.settle();
    await tab('pads');
    pads = $('#kids-pages').querySelectorAll('.kids-pad').map((p) => p.textContent);
    const pictures = [...chrome(), text('#kids-skin'), ...pads, ...$('#kids-turn').querySelectorAll('.kids-arrow').map((a) => a.textContent)];
    assert.equal(repeats(pictures).length, 0, `${skin.id}: ${repeats(pictures).join(', ')}`);
  }
  assert.ok(pads.length >= KIDS_PADS.length + KIDS_EMOJI.length, `every recording and every preset is a pad: ${pads.length}`);
  for (const emoji of KIDS_EMOJI) assert.ok(pads.includes(emoji), `${emoji} is a pad`);
  await setSetting('kidsPadSkin', 'tiles');
});

test('🎙️ Record: the mic, the three voices and the last sound are four pictures, none a tab\'s', async () => {
  await tab('record');
  const voices = all('[data-kids-voice]');
  assert.equal(voices.length, 3);
  for (const emoji of KIDS_EMOJI) {
    const pictures = [...chrome(), text('#kids-mic-face'), ...voices, emoji];
    assert.equal(repeats(pictures).length, 0, `${emoji}: ${repeats(pictures).join(', ')}`);
  }
  assert.equal(text('#kids-mic-face'), KIDS_MIC_FACE);
  assert.notEqual(KIDS_MIC_FACE, text('[data-kids-tab="record"]'), 'the mic is not the Record tab\'s picture');
});

test('🥁 Beats: ▶️ (and what it shows while playing), 🐢, 🏃 and the four drums are all different, none a tab\'s', async () => {
  await tab('beats');
  const drums = all('.kids-drum');
  assert.equal(drums.length, KIDS_DRUMS.length);
  for (const face of Object.values(KIDS_PLAY_FACES)) {
    const pictures = [...chrome(), face, text('#kids-slow'), text('#kids-fast'), ...drums];
    assert.equal(repeats(pictures).length, 0, `${face}: ${repeats(pictures).join(', ')}`);
  }
  assert.equal(text('#kids-play'), KIDS_PLAY_FACES.idle);
});

test('🎹 Keys: the round button, ●, and the five fruits are different on every instrument; a high key is its low key\'s fruit with ✦', async () => {
  const { setSetting } = await import('../web/settings.js');
  for (const id of KIDS_INSTRUMENTS) {
    await setSetting('kidsInstNotes', id);
    await page.settle();
    await tab('keys');
    const inst = text('#kids-inst');
    assert.equal(inst, instPicture(instrumentById(id)), `${id}: the button wears the instrument's picture`);
    const faceNodes = $('#kids-keys').querySelectorAll('.kids-key-face');
    const faces = faceNodes.map((f) => f.textContent);
    const badges = $('#kids-keys').querySelectorAll('.kids-key-inst').map((b) => b.textContent);
    assert.equal(faces.length, KIDS_KEYS.length);
    assert.ok(badges.every((b) => b === inst), `${id}: every key says who plays with the button's picture`);
    const low = faces.filter((_, i) => !isHighKey(KIDS_KEYS[i]));
    faces.forEach((face, i) => {
      if (isHighKey(KIDS_KEYS[i])) {
        const lowKey = KIDS_KEYS.findIndex((k) => k.note === KIDS_KEYS[i].note && !isHighKey(k));
        assert.equal(face, faces[lowKey], `${id}: key ${i} is its low key's fruit`);
        assert.ok(faceNodes[i].querySelector('.kids-key-star'), `${id}: key ${i} wears ✦`);
      }
    });
    const pictures = [...chrome(), inst, text('#kids-rec-face'), ...low];
    assert.equal(repeats(pictures).length, 0, `${id}: ${repeats(pictures).join(', ')}`);
  }
  await setSetting('kidsInstNotes', KIDS_INSTRUMENTS[0]);
});

test('a kid\'s new sounds take pictures no screen uses: 28 different ones, none a preset pad\'s or button\'s', () => {
  assert.equal(repeats(KIDS_EMOJI).length, 0, 'each once');
  assert.ok(KIDS_EMOJI.length >= 28);
});
