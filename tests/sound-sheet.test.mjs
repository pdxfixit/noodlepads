// The sound sheet's sound-design controls, driven through the real app on
// the stand-in page: 👂 Plain, the voice chain (+ Then add, ✕) and
// 🎲 Surprise me. Nothing is heard here: audio.start and audio.stop are
// replaced by recorders, and voices render with a stand-in AudioBuffer.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } from './helpers.mjs';

let page;
let $;
let audio;
const calls = [];   // ['start' | 'stop', id, buffer?]

before(async () => {
  console.error = () => {};
  globalThis.AudioBuffer = FakeAudioBuffer;
  globalThis.OfflineAudioContext = FakeOfflineAudioContext;
  globalThis.performance ??= { now: () => Date.now() };
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ audio } = await import('../web/audio.js'));
  audio.start = (id, { buffer }) => { calls.push(['start', id, buffer]); };
  audio.stop = (id) => { calls.push(['stop', id]); };
});

const pads = () => $('#pads').querySelectorAll('.pad').filter((c) => c.dataset.id);   // in Edit sounds each sits in a cell with its badges
const plain = fakeBuffer([Array.from({ length: 800 }, (_, i) => Math.sin(i / 3) * 0.5)], 8000);

// Opens the editor for the first pad, with `plain` as its recording.
async function openEditor() {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[0];   // after the toggle, which redraws the pads
  audio.originals.set(pad.dataset.id, Promise.resolve(plain));
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#sheet').open, true);
  calls.length = 0;
}

test('👂 Plain is faded until a voice is on, and sits under the wave for everyone', async () => {
  await openEditor();
  assert.equal($('#wave-box').hidden, false, 'an edit shows the wave straight away');
  assert.equal($('#cut').hidden, false, 'the row under the wave shows with Advanced off');
  assert.equal($('#trim-btn').hidden, true, 'Trim and edit is Advanced only');
  assert.equal($('#plain-btn').disabled, true, 'every knob normal: plain sounds the same');
  chip('chipmunk').dispatch('click');
  await page.settle();
  assert.equal($('#plain-btn').disabled, false);
  $('#sheet').close();
});

test('👂 Plain: a tap plays the plain recording, a second tap stops it and puts the voiced wave back', async () => {
  await openEditor();
  chip('chipmunk').dispatch('click');
  await page.settle();
  calls.length = 0;
  $('#plain-btn').dispatch('click');
  await page.settle();
  const started = calls.filter(([what]) => what === 'start');
  assert.deepEqual(started.map(([, id]) => id), ['preview-original']);
  assert.equal(started[0][2], plain, 'the recording itself, with no voice');
  assert.ok(calls.some(([what, id]) => what === 'stop' && id === 'preview'), 'the voiced sound stops first');
  assert.equal($('#plain-btn').getAttribute('aria-pressed'), 'true');

  audio.playing.set('preview-original', { fake: true });   // as if still sounding
  try {
    calls.length = 0;
    $('#plain-btn').dispatch('click');
    await page.settle();
    assert.deepEqual(calls[0], ['stop', 'preview-original']);
    assert.ok(!calls.some(([what]) => what === 'start'), 'stopping plays nothing');
    assert.equal($('#plain-btn').getAttribute('aria-pressed'), 'false');
  } finally { audio.playing.delete('preview-original'); }
  $('#sheet').close();
});

test('👂 Plain then a voice: the plain sound stops and the voiced one plays', async () => {
  await openEditor();
  chip('chipmunk').dispatch('click');
  await page.settle();
  $('#plain-btn').dispatch('click');
  await page.settle();
  calls.length = 0;
  chip('monster').dispatch('click');
  await page.settle();
  assert.ok(calls.some(([what, id]) => what === 'stop' && id === 'preview-original'));
  assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'), 'the voiced sound plays');
  $('#sheet').close();
});

// ── Voices are knob settings (voice-knobs.js) ─────────────────────────

const chip = (id) => $('#voices').children.find((b) => b.dataset.preset === id);
const lit = () => $('#voices').children.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.preset ?? `my:${b.dataset.my}`);
// A row of Layers, and a knob row's slider (its keys sit beside it).
const layerRow = (k) => $('#layer-rows').children.find((li) => li.dataset.layer === k);
const knob = (key) => layerRow(key)?.querySelector('input[data-layer-knob]') ?? null;
const layers = () => $('#layer-rows').children.map((li) => li.dataset.layer);
// ✕ asks first: two taps take a layer out.
const removeLayer = (k) => { layerRow(k).querySelector('[data-remove-layer]').dispatch('click'); layerRow(k).querySelector('[data-remove-layer]').dispatch('click'); };
const addLayer = (data) => { $('#layer-add').dispatch('click'); $('#layer-palette').querySelectorAll('button').find((b) => Object.entries(data).every(([k, v]) => b.dataset[k] === v)).dispatch('click'); };
const chips = () => $('#chain-links').children.map((li) => li.children[0].dataset.voice);

// Opens the editor for a recorded sound made from `fields`, with `plain` as its recording.
async function openClip(fields) {
  const { state } = await import('../web/state.js');
  const { currentPerson } = await import('../web/board.js');
  const { renderPads } = await import('../web/pads.js');
  const clip = { id: `user-${Math.random().toString(36).slice(2, 8)}`, personId: currentPerson().id, label: 'Hey', emoji: '👋', color: 'red', created: 1, blob: new Blob(['x']), mime: 'audio/webm', voice: 'normal', ...fields };
  state.userClips.push(clip);
  renderPads();
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  audio.originals.set(clip.id, Promise.resolve(plain));
  pads().find((p) => p.dataset.id === clip.id).parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  calls.length = 0;
  return clip;
}

test('the voice chips are emoji only, named by their label and title; ✦ marks the special ones; Reset voice is only a button', async () => {
  await openEditor();
  const voices = $('#voices').children.filter((b) => b.dataset.preset);
  assert.equal(voices.length, 13);
  assert.equal(chip('normal'), undefined, 'no Normal chip');
  assert.equal(chip('chipmunk').querySelector('.voice-emoji').textContent, '🐿️', 'emoji only');
  assert.equal(chip('chipmunk').querySelector('.voice-name'), null, 'no name on it');
  assert.equal(chip('chipmunk').getAttribute('aria-label'), 'Chipmunk');
  assert.equal(chip('chipmunk').title, 'Chipmunk', 'a mouse shows its name');
  assert.equal(chip('clones').getAttribute('aria-label'), 'Clones (special)');
  assert.equal(chip('clones').querySelector('.voice-special').textContent, '✦');
  assert.equal($('#voices').children.at(-1).getAttribute('aria-label'), 'Surprise me', '🎲 ends the row');
  assert.match($('#normal-btn').textContent, /Reset voice/);
  assert.equal($('#voice-line').textContent, 'Tap a voice to see which knobs make it.');
  assert.equal($('#chain').hidden, true, 'a plain sound has nothing made the old way');
  $('#sheet').close();
});

test('a voice moves its knobs and lights; the line says what it is; a second adds on top; the last tap wins; a lit one taps off', async () => {
  await openEditor();
  chip('chipmunk').dispatch('click');
  assert.equal(knob('pitch').value, '9');
  assert.equal(knob('speed').value, '0.8');
  assert.deepEqual(lit(), ['chipmunk']);
  assert.equal($('#voice-line').textContent, 'Chipmunk is: higher +9, faster 1.74×');
  assert.ok(layerRow('pitch').classList.contains('knob-glow'), 'the rows it moved glow');
  await page.settle();
  assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'), 'it plays at once');

  chip('stadium').dispatch('click');
  assert.deepEqual(lit(), ['chipmunk', 'stadium'], 'both lit: the knobs are both');
  assert.equal(knob('echo').value, '3');
  assert.equal($('#voice-line').textContent, 'Chipmunk is: higher +9, faster 1.74× · Stadium is: echoes');

  chip('monster').dispatch('click');
  assert.equal(knob('pitch').value, '-8', 'Monster tapped last wins the pitch');
  assert.deepEqual(lit(), ['monster', 'stadium'], 'Chipmunk is no longer what the knobs say');
  assert.match(layerRow('special').querySelector('.layer-name').textContent, /boom/, 'Monster\'s boom shows as a special layer');

  chip('monster').dispatch('click');   // off again
  assert.deepEqual(lit(), ['stadium']);
  assert.equal(knob('pitch').value, '0', 'back to before the first tap, with Stadium on top');
  assert.equal(knob('echo').value, '3');
  assert.equal(layerRow('special'), undefined);
  $('#sheet').close();
});

test('a knob off normal is drawn as changed and stays marked, by voice or by hand; at normal it is plain', async () => {
  await openEditor();
  const changed = (k) => layerRow(k).classList.contains('changed');
  assert.deepEqual(layers().filter(changed), [], 'every knob at normal: nothing marked');
  chip('chipmunk').dispatch('click');
  await page.settle();
  assert.ok(changed('pitch') && changed('speed'), 'the knobs Chipmunk moved are marked, and stay marked after the glow');
  assert.ok(!changed('warble') && !changed('volume'), 'the ones it left are plain');
  const pitch = knob('pitch');
  pitch.value = '0';
  pitch.dispatch('input');
  assert.ok(!changed('pitch'), 'a knob dragged back to normal loses its mark at once');
  pitch.value = '4';
  pitch.dispatch('input');
  assert.ok(changed('pitch'), 'and gets it again when dragged off');
  $('#sheet').close();
});

// ── Closing with unsaved work asks first (Ben, 2026-10-16) ──
const closeX = () => $('#sheet').querySelector('.close').dispatch('click');
const cancelEsc = () => $('#sheet').dispatch('cancel');

test('closing an untouched sheet never asks; closing one with changes asks, and Keep editing or Throw away answers', async () => {
  await openEditor();
  closeX();
  assert.equal($('#sheet').open, false, 'nothing changed: ✕ just closes');

  await openEditor();
  assert.equal($('#sheet-warn').hidden, true);
  chip('chipmunk').dispatch('click');
  closeX();
  assert.equal($('#sheet').open, true, 'a changed knob: ✕ keeps the sheet open');
  assert.equal($('#sheet-warn').hidden, false);
  assert.equal($('#sheet-warn-text').textContent, 'Throw away your changes?');
  assert.equal(cancelEsc().defaultPrevented, true, 'Esc is held back too');
  $('#sheet-warn-keep').dispatch('click');
  assert.equal($('#sheet-warn').hidden, true, 'Keep editing hides the question');
  assert.equal($('#sheet').open, true);
  assert.deepEqual(lit(), ['chipmunk'], 'and the work is as it was');

  closeX();
  $('#sheet-warn-drop').dispatch('click');
  assert.equal($('#sheet').open, false, 'Throw away closes it');

  await openEditor();
  assert.equal($('#sheet-warn').hidden, true, 'the next sheet starts with no question showing');
  closeX();
  assert.equal($('#sheet').open, false, 'and nothing carried over: it is untouched again');
});

test('a name or picture changed, or a knob moved and put back, is judged by what Save would store', async () => {
  await openEditor();
  const label = $('#clip-label');
  const was = label.value;
  label.value = `${was}x`;
  closeX();
  assert.equal($('#sheet').open, true, 'a renamed sound asks');
  label.value = was;
  $('#sheet-warn-keep').dispatch('click');
  closeX();
  assert.equal($('#sheet').open, false, 'the name put back: nothing to lose');
});

test('Save closes the sheet without asking', async () => {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  $('#make-btn').dispatch('click');
  $('#make-starters').children[0].dispatch('click');   // Laser: a new sound, so no pad the other tests use changes
  await page.settle();
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal($('#sheet').open, false);
  assert.equal($('#sheet-warn').hidden, true);
});

test('a new sound that was made but not saved asks, in its own words; one with nothing yet does not', async () => {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  closeX();
  assert.equal($('#sheet').open, false, 'a new sheet with nothing in it closes at once');

  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  $('#make-btn').dispatch('click');
  $('#make-starters').children[0].dispatch('click');   // Laser
  await page.settle();
  closeX();
  assert.equal($('#sheet').open, true);
  assert.equal($('#sheet-warn-text').textContent, 'Throw away this sound?');
  $('#sheet-warn-drop').dispatch('click');
  assert.equal($('#sheet').open, false);
});

test('moving a knob by hand makes it your own; ↩️ Reset voice puts every knob back', async () => {
  await openEditor();
  chip('stadium').dispatch('click');
  const pitch = knob('pitch');
  pitch.value = '-5';
  pitch.dispatch('input');
  assert.equal(pitch.parentElement.querySelector('output').textContent, '5 notes deeper');
  pitch.dispatch('change');
  assert.deepEqual(lit(), [], 'Your own now');
  assert.equal($('#voice-line').textContent, '✏️ Your own voice. ⭐ Save voice saves it.');
  assert.equal($('#keep-btn').disabled, false);
  calls.length = 0;
  $('#normal-btn').dispatch('click');
  assert.equal(knob('pitch').value, '0');
  assert.equal(knob('echo').value, '0');
  assert.equal($('#normal-btn').disabled, true, 'nothing left to put back');
  assert.equal($('#keep-btn').disabled, true, 'nothing to keep');
  await page.settle();
  assert.ok(calls.some(([what]) => what === 'start'), 'the plain sound plays');
  $('#sheet').close();
});

test('Slower ↔ faster snaps to normal near the middle', async () => {
  await openEditor();
  const speed = knob('speed');
  speed.value = '0.1';
  speed.dispatch('input');
  assert.equal(speed.value, '0');
  assert.equal(speed.parentElement.querySelector('output').textContent, 'normal');
  $('#sheet').close();
});

test('saving stores the knobs, never which voice made them; they come back with the voice lit', async () => {
  const { state } = await import('../web/state.js');
  await openEditor();
  const id = pads()[0].dataset.id;
  chip('chipmunk').dispatch('click');
  chip('underwater').dispatch('click');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  const o = state.overrides.get(id);
  assert.deepEqual(o.tweaks, { pitch: 9, speed: 0.8, tone: -2, warble: 2 });
  assert.equal(o.voice, undefined, 'no old voice');
  assert.ok(!('fx' in o));

  await openEditor();
  assert.equal(knob('pitch').value, '9');
  assert.deepEqual(lit(), ['chipmunk', 'underwater'], 'the voices the knobs match light up');
  assert.ok(layerRow('tone'), 'Muffled ↔ Bright is set: its row shows');
  $('#normal-btn').dispatch('click');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.ok(!('tweaks' in (state.overrides.get(id) ?? {})), 'normal stores nothing');
});

test('a voice that uses another knob adds its row, in play order; Backwards is Off · On', async () => {
  await openEditor();
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');
  assert.deepEqual(layers(), ['pitch', 'speed', 'warble', 'volume', 'echo'], 'the five main knobs, in the order they play');
  chip('robot').dispatch('click');
  assert.deepEqual(layers(), ['pitch', 'speed', 'robot', 'warble', 'volume', 'echo']);
  assert.deepEqual(pressedKey(knob('robot')), ['Robot']);
  assert.ok(layerRow('robot').classList.contains('knob-glow'), 'the row it set glows');
  chip('backwards').dispatch('click');
  assert.deepEqual(keyTexts(knob('backwards')), ['Off', 'On']);
  assert.deepEqual(pressedKey(knob('backwards')), ['On']);
  $('#sheet').close();
});

test('⭐ Save voice and ↩️ Reset voice are one row, kept in view while the knobs scroll (sticky, in one box with them)', () => {
  const row = $('#voice-actions');
  assert.deepEqual(row.children.map((b) => b.id), ['keep-btn', 'normal-btn']);
  assert.equal(row.parent, $('#voice-box'));
  assert.equal($('#layers').parent, $('#voice-box'), 'Layers are in the same box, so the row sticks over them');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('\n.voice-actions {'), css.indexOf('}', css.indexOf('\n.voice-actions {')));
  assert.match(rule, /position: sticky;/);
  assert.match(rule, /top: var\(--sheet-head-h/);
});

test('⭐ Save voice saves the knobs as the kid\'s own voice on this device, with a fun name offered, and shows it as a chip', async () => {
  const { state } = await import('../web/state.js');
  const { currentPerson } = await import('../web/board.js');
  const { isFunName } = await import('../web/names.js');
  await openEditor();
  chip('chipmunk').dispatch('click');
  chip('stadium').dispatch('click');
  $('#keep-btn').dispatch('click');
  assert.equal($('#keep-form').hidden, false);
  assert.equal($('#keep-name').value, '', 'never filled in');
  assert.ok(isFunName($('#keep-name').placeholder), `a fun name, not a person's: ${$('#keep-name').placeholder}`);
  $('#keep-name').value = 'Squeaky Hall';
  $('#keep-emoji').children.find((b) => b.dataset.keepEmoji === '🦄').dispatch('click');
  $('#keep-save').dispatch('click');
  await page.settle();
  const mine = state.myVoices.find((v) => v.name === 'Squeaky Hall');
  assert.ok(mine, 'stored');
  assert.equal(mine.personId, currentPerson().id);
  assert.match(mine.id, /^voice-/);
  assert.deepEqual(mine.knobs, { pitch: 9, speed: 0.8, echo: 3 });
  assert.equal($('#keep-form').hidden, true);
  const myChip = $('#voices').children.find((b) => b.dataset.my === mine.id);
  assert.ok(myChip, 'a chip after the voices');
  assert.equal(myChip.querySelector('.voice-emoji').textContent, '🦄');
  assert.equal(myChip.querySelector('.voice-name').textContent, 'Squeaky Hall', 'a kid’s own voice shows its name');
  assert.deepEqual(lit(), [`my:${mine.id}`], 'the knobs are that voice now');
  assert.equal($('#voice-line').textContent, 'Squeaky Hall is: higher +9, faster 1.74×, echoes');

  // Used later, on a plain sound: its knobs, lit.
  $('#normal-btn').dispatch('click');
  myChip.dispatch('click');
  assert.equal(knob('echo').value, '3');
  assert.deepEqual(lit(), [`my:${mine.id}`]);
  $('#sheet').close();
});

test('three of a kid\'s own voices are chips; ⭐ My voices ▾ lists them all, to rename or delete (two taps)', async () => {
  const { state } = await import('../web/state.js');
  const { currentPerson } = await import('../web/board.js');
  const me = currentPerson().id;
  state.myVoices = [1, 2, 3, 4, 5].map((n) => ({ id: `voice-t${n}`, personId: me, name: `Mine ${n}`, emoji: '', knobs: { pitch: n }, created: n, used: n * 10 }))
    .concat({ id: 'voice-other', personId: 'p-someone-else', name: 'Theirs', emoji: '', knobs: { pitch: 1 }, created: 1, used: 99 });
  const { renderPeopleEditor } = await import('../web/people.js');
  renderPeopleEditor();
  const tallies = document.body.querySelectorAll('.pe-counts').map((e) => e.textContent);
  assert.ok(tallies.some((t) => /⭐\s5/u.test(t)), `👥 People counts them: ${tallies.join(' | ')}`);
  await openEditor();
  const mineChips = () => $('#voices').children.filter((b) => b.dataset.my).map((b) => b.dataset.my);
  assert.deepEqual(mineChips(), ['voice-t5', 'voice-t4', 'voice-t3'], 'the three used most recently');
  const open = $('#voices').children.find((b) => b.dataset.myOpen);
  assert.equal(open.querySelector('.voice-name').textContent, 'My voices ▾');
  assert.equal($('#my-voice-list').hidden, true);
  open.dispatch('click');
  assert.equal($('#my-voice-list').hidden, false);
  const rows = () => $('#my-voice-list').children.map((li) => li.children[0].dataset.my);
  assert.deepEqual(rows(), ['voice-t5', 'voice-t4', 'voice-t3', 'voice-t2', 'voice-t1'], 'only this person\'s');

  // Using one from the list moves it to the chips.
  $('#my-voice-list').children[4].children[0].dispatch('click');
  assert.equal(knob('pitch').value, '1');
  assert.deepEqual(mineChips(), ['voice-t1', 'voice-t5', 'voice-t4']);

  // Rename.
  $('#my-voice-list').querySelector('[data-rename="voice-t2"]').dispatch('click');
  assert.equal($('#keep-form').hidden, false);
  assert.equal($('#keep-name').value, 'Mine 2');
  $('#keep-name').value = 'Robo Two';
  $('#keep-save').dispatch('click');
  await page.settle();
  assert.equal(state.myVoices.find((v) => v.id === 'voice-t2').name, 'Robo Two');
  assert.deepEqual(state.myVoices.find((v) => v.id === 'voice-t2').knobs, { pitch: 2 }, 'a rename keeps its knobs');

  // Delete asks first.
  const del = () => $('#my-voice-list').querySelector('[data-delete-voice="voice-t3"]');
  del().dispatch('click');
  assert.ok(state.myVoices.some((v) => v.id === 'voice-t3'), 'the first tap only asks');
  assert.equal(del().textContent, 'Delete?');
  del().dispatch('click');
  await page.settle();
  assert.ok(!state.myVoices.some((v) => v.id === 'voice-t3'));
  assert.ok(!rows().includes('voice-t3'));
  $('#sheet').close();
  state.myVoices = [];
});

test('🎲 Surprise me lights one to three voices and plays them', async () => {
  await openEditor();
  for (let i = 0; i < 20; i++) {
    calls.length = 0;
    $('#voices').children.find((b) => b.dataset.surprise).dispatch('click');
    const n = lit().length;
    assert.ok(n >= 1 && n <= 3, `${n} voices`);
    await page.settle();
    assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'));
  }
  $('#sheet').close();
});

test('a new sound\'s voices and knobs wait for a sound', () => {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#sheet').open, true);
  assert.ok($('#voices').children.every((b) => b.disabled));
  assert.equal($('#keep-btn').disabled, true);
  assert.equal($('#normal-btn').disabled, true);
  assert.equal($('#voice-line').textContent, '', 'no tip before there is a sound');
  $('#sheet').close();
});

test('a sound saved with old voices plays them as before: old-way chips, ⤢ Turn into knobs, and ↩️ The old way', async () => {
  const { state } = await import('../web/state.js');
  const clip = await openClip({ voice: 'chipmunk', amount: 2, fx: [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'robot' }] });
  assert.equal($('#chain').hidden, false);
  assert.deepEqual(chips(), ['chipmunk', 'robot']);
  assert.equal($('#chain-knobs').hidden, false);
  assert.equal(knob('pitch').value, '0', 'the old voices are not knobs');
  assert.ok(audio.key(clip).endsWith(':chipmunk:2>robot:null'), `it renders as it always did: ${audio.key(clip)}`);

  $('#chain-knobs').dispatch('click');
  assert.equal(knob('pitch').value, '12', 'Chipmunk 2× is an octave up');
  assert.deepEqual(pressedKey(knob('robot')), ['Robot']);
  assert.equal($('#chain-links').children.length, 0);
  assert.equal($('#chain-undo').hidden, false, 'the old way can come back');
  $('#chain-undo').dispatch('click');
  assert.deepEqual(chips(), ['chipmunk', 'robot']);
  assert.equal(knob('pitch').value, '0');

  $('#chain-knobs').dispatch('click');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  const saved = state.userClips.find((c) => c.id === clip.id);
  assert.equal(saved.voice, 'normal');
  assert.ok(!('fx' in saved));
  assert.deepEqual(saved.tweaks, { pitch: 12, speed: 1, robot: 1 });
});

test('an old voice keeps its slider: tap its chip; ✕ takes it out, and one voice is stored the old way', async () => {
  const clip = await openClip({ voice: 'chipmunk', amount: 2, fx: [{ type: 'voice', voice: 'chipmunk', amount: 2 }, { type: 'voice', voice: 'robot' }] });
  $('#chain-links').children[0].children[0].dispatch('click');
  assert.equal($('#amount-row').hidden, false, 'Chipmunk’s pitch slider');
  $('#chain-links').children[0].children[1].dispatch('click');   // ✕ on Chipmunk
  assert.deepEqual(chips(), ['robot']);
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(clip.voice, 'robot');
  assert.ok(!('fx' in clip), 'one voice is stored the old way');
  assert.equal(clip.amount, undefined);
});

test('an old voice with knobs keeps playing them after it; a voice tapped on it adds knobs after it too', async () => {
  const clip = await openClip({ voice: 'robot', tweaks: { pitch: -7 } });
  chip('stadium').dispatch('click');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(clip.tweaks, { pitch: -7, echo: 3 }, 'no `first`: the knobs play after Robot, as before');
  assert.ok(audio.key(clip).includes('robot:null~p-7,e3'), audio.key(clip));
});

test('a sound shaped with a step that is not a voice shows it as an old-way chip in simple mode; ✕ takes it out', async () => {
  const clip = await openClip({ fx: [{ type: 'echo', repeats: 3, gap: 0.25 }] });
  const pad = pads().find((p) => p.dataset.id === clip.id);
  assert.equal(pad.children.find((c) => c.classList.contains('pad-voice'))?.textContent, '🔁', 'the pad shows the echo');
  assert.deepEqual(chips(), ['echo']);
  assert.equal($('#chain-knobs').hidden, true, 'nothing to turn into knobs');
  chip('chipmunk').dispatch('click');
  assert.deepEqual(chips(), ['echo'], 'a voice is knobs: the echo stays');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(clip.tweaks, { pitch: 9, speed: 0.8, first: true }, 'a new sound\'s knobs play before its Shape it steps');
  assert.deepEqual(clip.fx, [{ type: 'echo', repeats: 3, gap: 0.25 }]);
});

test('▶︎ at the left of the title row plays the sound as it sounds now; ■ stops it; Space does the same outside a text field', async () => {
  await openEditor();
  const play = $('#sheet-play');
  const head = play.parent;
  assert.ok(head.classList.contains('sheet-head'), 'in the sticky title row');
  assert.ok(head.children.indexOf(play) < head.children.indexOf($('#clip-label').closest('.sheet-title-box')), 'left of the name, away from ✕');
  assert.equal($('#preview-btn'), null, 'one play button, not two');
  assert.equal(play.disabled, false);
  assert.equal(play.textContent, '▶︎');
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');
  chip('robot').dispatch('click');   // an unsaved change: it plays with it
  await page.settle();
  calls.length = 0;
  play.dispatch('click');
  await page.settle();
  const started = calls.find(([w, id]) => w === 'start' && id === 'preview');
  assert.ok(started, 'it plays');
  const { applyChain } = await import('../web/voices.js');
  const robot = (await applyChain(plain, null, { robot: 1, first: false })).buffer;
  assert.equal(started[2].length, robot.length, 'the sound with its layers, as the sheet hears it');
  // While it plays: ■, and a tap stops it.
  audio.playing.set('preview', { fake: true });
  try {
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(play.textContent, '■');
    assert.equal(play.getAttribute('aria-label'), 'Stop the sound');
    calls.length = 0;
    play.dispatch('click');
    assert.ok(calls.some(([w, id]) => w === 'stop' && id === 'preview'), '■ stops it');
  } finally { audio.playing.delete('preview'); }
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(play.textContent, '▶︎', 'the sound ended: ▶︎ again');
  // Space: plays from the sheet, but types in the name.
  calls.length = 0;
  const space = $('#sheet').dispatch('keydown', { key: ' ', repeat: false });
  assert.equal(space.defaultPrevented, true);
  await page.settle();
  assert.ok(calls.some(([w, id]) => w === 'start' && id === 'preview'));
  calls.length = 0;
  const typing = $('#clip-label').dispatch('keydown', { key: ' ', repeat: false });
  assert.equal(typing.defaultPrevented, false, 'a space in the name is a space');
  $('#sheet').close();
});

test('a new sound’s ▶︎ waits for a sound', () => {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#sheet-play').disabled, true);
  $('#sheet').close();
});

test('closing the sheet while 👂 Plain plays stops the plain sound', async () => {
  await openEditor();
  chip('chipmunk').dispatch('click');
  await page.settle();
  $('#plain-btn').dispatch('click');
  await page.settle();
  $('#sheet').close();
  assert.ok(calls.some(([what, id]) => what === 'stop' && id === 'preview-original'));
});

// ── The kid's own steps as layers (Advanced) ──────────────────────────

const stepRows = () => $('#layer-rows').children.filter((li) => li.classList.contains('layer-step'));
const cards = () => stepRows().map((li) => li.querySelector('.layer-name').textContent);
const addStep = (id) => addLayer({ add: id });

async function advanced(on) {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('advancedBeats', on);
}

// Opens the first pad's editor in Advanced with its steps all taken out: a plain sound.
async function openPlain() {
  await openEditor();
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');
  while (stepRows().length) removeLayer(stepRows()[0].dataset.layer);
  await page.settle();
  calls.length = 0;
}

test('simple mode has no steps; Advanced adds them to Layers and widens the sheet', async () => {
  await advanced(false);
  await openEditor();
  assert.equal($('#layer-extra').hidden, true);
  assert.equal($('#sheet').classList.contains('wide'), false);
  $('#layer-add').dispatch('click');
  assert.equal($('#layer-palette').querySelector('[data-add]'), null, 'the palette offers knobs only');
  $('#sheet').close();
  await advanced(true);
  await openPlain();
  assert.equal($('#layer-extra').hidden, false);
  assert.equal($('#chain').hidden, true);
  assert.equal($('#sheet').classList.contains('wide'), true);
  assert.deepEqual(cards(), [], 'a plain sound has no steps yet');
  $('#sheet').close();
  await advanced(false);
});

test('steps: add them from + Add a layer, reorder by the grip, take one out; saving keeps them', async () => {
  const { state } = await import('../web/state.js');
  await advanced(true);
  await openPlain();
  const id = pads()[0].dataset.id;
  addStep('echo');
  assert.deepEqual(cards(), ['Make it echo'], 'the first step takes the plain voice’s place');
  assert.equal($('#layer-palette').hidden, true, 'the palette closes');
  assert.deepEqual(layers().slice(-1), ['step:0'], 'after the knobs, as it plays');
  addStep('tone');
  addStep('crunch');
  assert.deepEqual(cards(), ['Make it echo', 'Muffled ↔ Bright', 'Crunch']);
  assert.equal($('#layer-palette').querySelector('[data-add="voice"]'), null, 'voices are knobs now: the palette has no voice step');
  chip('chipmunk').dispatch('click');
  assert.deepEqual(cards(), ['Make it echo', 'Muffled ↔ Bright', 'Crunch'], 'a voice moves the knobs, not the steps');

  // The grip: arrow keys move a step.
  const grip = (i) => stepRows()[i].querySelector('[data-grip]');
  grip(2).dispatch('keydown', { key: 'ArrowUp' });
  assert.deepEqual(cards(), ['Make it echo', 'Crunch', 'Muffled ↔ Bright']);
  grip(0).dispatch('keydown', { key: 'ArrowDown' });
  assert.deepEqual(cards(), ['Crunch', 'Make it echo', 'Muffled ↔ Bright']);
  grip(0).dispatch('keydown', { key: 'ArrowUp' });
  assert.deepEqual(cards(), ['Crunch', 'Make it echo', 'Muffled ↔ Bright'], 'the top one stays put');

  // ✕ takes one out, on the second tap.
  stepRows()[2].querySelector('[data-remove-layer]').dispatch('click');
  assert.deepEqual(cards(), ['Crunch', 'Make it echo', 'Muffled ↔ Bright'], 'the first tap asks');
  assert.equal(stepRows()[2].querySelector('[data-remove-layer]').textContent, '✕ Remove?');
  stepRows()[2].querySelector('[data-remove-layer]').dispatch('click');
  assert.deepEqual(cards(), ['Crunch', 'Make it echo']);

  $('#sheet-form').dispatch('submit');
  await page.settle();
  const o = state.overrides.get(id);
  assert.equal(o.voice ?? 'normal', 'normal');
  assert.deepEqual(o.fx.map((s) => s.type), ['crunch', 'echo']);
  assert.deepEqual(o.tweaks, { pitch: 9, speed: 0.8, first: true }, 'the knobs play first, above the steps');

  await openEditor();
  assert.deepEqual(cards(), ['Crunch', 'Make it echo'], 'the steps come back');
  $('#sheet').close();
  await advanced(false);
});

test('steps: dragging a live step’s slider loops the sound and lets go into one last pass; a render step renders on release', async () => {
  await advanced(true);
  await openPlain();
  const starts = [];
  const unloops = [];
  const realStart = audio.start;
  audio.start = (id, sound, opts = {}) => { starts.push([id, !!opts.loop, !!opts.via]); calls.push(['start', id, sound.buffer]); };
  audio.unloop = (id) => unloops.push(id);
  try {
    addStep('echo');
    await page.settle();
    starts.length = 0;
    const slider = $('#layer-rows').querySelector('input[data-key="repeats"]');
    slider.dispatch('pointerdown', { button: 0 });
    await page.settle();
    assert.deepEqual(starts, [['preview', true, true]], 'loops through live nodes');
    slider.value = '6';
    slider.dispatch('input');
    assert.equal(slider.closest('.amount').querySelector('output').textContent, '6', 'the words follow');
    slider.dispatch('change');
    assert.deepEqual(unloops, ['preview']);

    addStep('stretch');   // not live: renders when let go
    await page.settle();
    starts.length = 0;
    const speed = $('#layer-rows').querySelector('input[data-key="speed"]');
    speed.dispatch('pointerdown', { button: 0 });
    await page.settle();
    assert.deepEqual(starts, [], 'nothing loops for a step that renders');
    speed.value = '1';
    speed.dispatch('input');
    speed.dispatch('change');
    await page.settle();
    assert.deepEqual(starts, [['preview', false, false]], 'renders and plays once');
  } finally {
    audio.start = realStart;
    $('#sheet').close();
    await advanced(false);
  }
});

test('⤢ opens Stadium into Make it echo and Room size; Normal and Clones have no ⤢', async () => {
  await advanced(true);
  await openClip({ fx: [{ type: 'echo', repeats: 3, gap: 0.25 }, { type: 'voice', voice: 'stadium' }, { type: 'voice', voice: 'clones' }] });
  assert.deepEqual(cards(), ['Make it echo', 'Stadium', 'Clones']);
  const open = (i) => stepRows()[i].querySelector('[data-open]');
  assert.equal(open(0), null, 'a building block has nothing inside');
  calls.length = 0;
  open(1).dispatch('click');
  assert.deepEqual(cards(), ['Make it echo', 'Make it echo', 'Room size', 'Clones']);
  await page.settle();
  assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'), 'the opened sound plays');
  assert.equal(stepRows().at(-1).querySelector('[data-open]'), null, 'Clones does not open');
  $('#sheet').close();
  await advanced(false);
});

test('✨ Make one: a starter makes a sound to try voices on, named for what it is, saved with its recipe', async () => {
  const { state } = await import('../web/state.js');
  const { SYNTH_NOUNS } = await import('../web/names.js');
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#make').hidden, true, 'closed until asked for');
  $('#make-btn').dispatch('click');
  assert.equal($('#make').hidden, false);
  assert.equal($('#make-btn').getAttribute('aria-expanded'), 'true');
  assert.deepEqual($('#make-starters').children.map((b) => b.dataset.make), ['laser', 'boom', 'tss', 'clap', 'siren', 'coin', 'wind', 'surprise']);
  assert.equal($('#make-knobs').hidden, true, 'no sliders in simple mode');
  calls.length = 0;
  $('#make-starters').children[0].dispatch('click');   // Laser
  await page.settle();
  assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'), 'it plays straight away');
  assert.equal($('#voices').children[0].disabled, false, 'voices can be tried');
  assert.ok(SYNTH_NOUNS.laser.some((w) => $('#clip-label').placeholder.endsWith(w)), $('#clip-label').placeholder);
  assert.match($('#rec-status').textContent, /Made a Laser/);
  const before = state.userClips.length;
  $('#sheet-form').dispatch('submit');
  await page.settle();
  const clip = state.userClips.at(-1);
  assert.equal(state.userClips.length, before + 1);
  assert.equal(clip.mime, 'audio/wav');
  assert.equal(clip.synth.tone, 'buzzy');
  assert.equal(clip.label, $('#clip-label').placeholder || clip.label);
});

test('✨ Make one in Advanced: the sliders remake the sound when let go; editing a made sound shows them again', async () => {
  const { state } = await import('../web/state.js');
  await advanced(true);
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  $('#make-btn').dispatch('click');
  $('#make-starters').children[1].dispatch('click');   // Boom
  await page.settle();
  assert.equal($('#make-knobs').hidden, false);
  const length = $('#make-length');
  length.value = '1.5';
  length.dispatch('input');
  assert.equal(length.closest('label').querySelector('output').textContent, '1.50 s');
  calls.length = 0;
  length.dispatch('change');
  await page.settle();
  const played = calls.find(([what, id]) => what === 'start' && id === 'preview');
  assert.ok(played, 'the remade sound plays');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  const clip = state.userClips.at(-1);
  assert.equal(clip.synth.length, 1.5);

  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads().find((p) => p.dataset.id === clip.id);
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#make').hidden, false, 'a made sound opens with its sliders');
  assert.equal($('#make-length').value, '1.5');
  $('#sheet').close();
  await advanced(false);
});

test('🎵 Find its note names the note; Tune moves it; saving keeps the note as root, and a changed chain forgets it', async () => {
  const { state } = await import('../web/state.js');
  const { findNote, noteName } = await import('../web/pitch.js');
  await advanced(true);
  await openPlain();
  const id = pads()[0].dataset.id;
  const heard = findNote(plain);
  assert.ok(heard, 'the test sound has a note');
  assert.equal($('#tune-row').hidden, true, 'no Tune before a note is found');
  $('#note-btn').dispatch('click');
  await page.settle();
  assert.equal($('#note-out').textContent, `Sounds like ${heard.name}.`);
  assert.equal($('#tune-row').hidden, false);
  $('#tune').value = '2';
  $('#tune').dispatch('input');
  assert.deepEqual(cards(), ['Higher or lower'], 'Tune is a Higher or lower at the end');
  assert.equal($('#note-out').textContent, `Sounds like ${heard.name}, tuned to ${noteName(heard.midi + 2)}.`);
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(state.overrides.get(id).root, heard.midi + 2);

  await openEditor();
  assert.match($('#note-out').textContent, /tuned to/, 'the note comes back');
  addStep('echo');   // after the tune: the tune is no longer last, so the note is stale
  assert.equal($('#note-out').textContent, '');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.ok(!('root' in state.overrides.get(id)), 'a stale note is not saved');
  await advanced(false);
});

test('➕ Mix with another sound makes a new pad named as a blend, made from this one', async () => {
  const { state } = await import('../web/state.js');
  await advanced(true);
  await openPlain();
  const here = pads()[0];
  const hereLabel = here.children.find((c) => c.classList.contains('pad-label')).textContent;
  assert.equal($('#mix').hidden, true);
  $('#mix-btn').dispatch('click');
  assert.equal($('#mix').hidden, false);
  assert.ok($('#mix-with').children.length > 0, 'every other sound on the board');
  assert.ok(!$('#mix-with').children.some((o) => o.value === here.dataset.id), 'not itself');
  const otherId = $('#mix-with').children[1].value;
  audio.forget(otherId);   // its file isn't served here: it sounds like the test sound
  audio.originals.set(otherId, Promise.resolve(plain));
  $('#mix-with').value = otherId;
  $('#mix-with').dispatch('change');
  $('#mix-offset').value = '0.5';
  $('#mix-offset').dispatch('input');
  assert.equal($('#mix-offset-out').textContent, '0.50 s');
  calls.length = 0;
  $('#mix-play').dispatch('click');
  await page.settle();
  const heard = calls.find(([what, id]) => what === 'start' && id === 'preview');
  assert.ok(heard, 'the mix plays');
  assert.ok(heard[2].duration > 0.5, 'the second sound starts half a second in');
  const before = state.userClips.length;
  $('#mix-make').dispatch('click');
  await page.settle();
  assert.equal(state.userClips.length, before + 1);
  const made = state.userClips.at(-1);
  assert.deepEqual(made.from, { id: here.dataset.id, how: 'mix' });
  assert.equal(made.mime, 'audio/wav');
  assert.ok(made.label.length >= 3 && made.label !== hereLabel, made.label);
  assert.equal($('#sheet').open, false, 'back to the board, where the new pad is');
  await advanced(false);
});

test('➕ Mix is only for a saved sound', async () => {
  await advanced(true);
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  assert.equal($('#mix-btn').hidden, true);
  $('#sheet').close();
  await advanced(false);
});

test('🎲 Surprise steps makes one or two voices and a building block', async () => {
  const { surpriseShape, cleanChain } = await import('../web/voices.js');
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 200; i++) {
    const chain = surpriseShape(random);
    assert.ok(chain.length >= 2 && chain.length <= 3, JSON.stringify(chain));
    assert.notEqual(chain.at(-1).type, 'voice');
    assert.deepEqual(cleanChain(chain), chain, 'already clean');
  }
});

// A setting with a few stops shows them as keys (lines.js keysForSlider);
// the slider is the fallback when they don't fit, which needs a browser.
const keysOf = (input) => input.parentElement.querySelector('.slider-keys')?.children ?? [];
const keyTexts = (input) => keysOf(input).map((b) => b.textContent);
const pressedKey = (input) => keysOf(input).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

test('✨ Make one in Advanced: Tone is three keys; a key remakes the sound with that tone', async () => {
  await advanced(true);
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  $('#make-btn').dispatch('click');
  $('#make-starters').children[1].dispatch('click');   // Boom: smooth
  await page.settle();
  const tone = $('#make-tone');
  assert.deepEqual(keyTexts(tone), ['Smooth', 'Buzzy', 'Hiss']);
  assert.ok(tone.parentElement.classList.contains('keyed'), 'the row shows keys, not the slider');
  assert.equal($('#make-knobs').querySelector('.slider-keys').getAttribute('aria-label'), 'Tone');
  assert.deepEqual(pressedKey(tone), ['Smooth']);
  calls.length = 0;
  keysOf(tone)[2].dispatch('click');   // Hiss
  await page.settle();
  assert.deepEqual(pressedKey(tone), ['Hiss']);
  assert.equal(tone.value, '2', 'the key moves the slider too');
  assert.ok(calls.some(([what, id]) => what === 'start' && id === 'preview'), 'the remade sound plays');
  const { state } = await import('../web/state.js');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(state.userClips.at(-1).synth.tone, 'hiss');
  await advanced(false);
});

test('Loud’s 1–10 is a slider: more than five stops', async () => {
  await openClip({ voice: 'loud', amount: 7 });
  $('#chain-links').children[0].children[0].dispatch('click');
  assert.equal($('#amount-row').hidden, false);
  assert.deepEqual(keyTexts($('#amount')), []);
  assert.equal($('#amount-row').classList.contains('keyed'), false);
  $('#sheet').close();
});

test('steps: Echoes 1–8 and Stutter repeats 1–6 are sliders; On the beat’s note lengths are keys', async () => {
  await advanced(true);
  await openPlain();
  try {
    addStep('echo');
    await page.settle();
    const repeats = () => $('#layer-rows').querySelector('input[data-key="repeats"]');
    assert.deepEqual(keyTexts(repeats()), [], '8 stops: a slider');
    assert.deepEqual(keyTexts($('#layer-rows').querySelector('input[data-key="gap"]')), [], 'seconds stay a slider');
    $('#layer-rows').querySelector('[data-flag="beat"]').dispatch('click');
    await page.settle();
    assert.deepEqual(keyTexts($('#layer-rows').querySelector('input[data-key="note"]')), ['1/16', '1/8', 'dotted 1/8', '1/4', '1/2']);
    addStep('repeat');
    await page.settle();
    assert.deepEqual(keyTexts($('#layer-rows').querySelector('input[data-key="times"]')), [], '6 stops: a slider');
  } finally {
    $('#sheet').close();
    await advanced(false);
  }
});

// ── Knobs (tweaks.js): on the plain sheet, no Advanced needed ──

const tweakInput = (key) => knob(key);

test('the knobs: Deeper and Slower are sliders; the rest are keys (Ben: five or fewer); all wait for a sound', () => {
  if (document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  $('#pads').children.find((p) => p.classList.contains('pad-add')).dispatch('click');
  try {
    assert.equal($('#layers').hidden, false, 'shown without Advanced');
    assert.deepEqual(layers(), ['pitch', 'speed', 'warble', 'volume', 'echo'], 'the five main knobs, in play order');
    assert.ok(layers().every((k) => !layerRow(k).querySelector('[data-remove-layer]')), 'a main knob has no ✕');
    assert.ok(layers().every((k) => layerRow(k).querySelector('[data-mute]')), 'every row can be muted');
    assert.equal($('#layer-add').disabled, true, '+ Add a layer waits for a sound too');
    $('#layer-palette').hidden = false;
    assert.deepEqual($('#layer-palette').querySelectorAll('[data-add-knob]').map((b) => b.dataset.addKnob), ['backwards', 'tone', 'robot', 'crunch', 'stutter'], 'the other knobs come from + Add a layer');
    $('#layer-palette').hidden = true;
    assert.deepEqual(keyTexts(tweakInput('pitch')), [], '49 stops: a slider');
    assert.deepEqual(keyTexts(tweakInput('speed')), []);
    assert.deepEqual(keyTexts(tweakInput('echo')), ['Off', 'Room', 'Hall', 'Echo']);
    assert.deepEqual(keyTexts(tweakInput('volume')), ['Quietest', 'Quiet', 'Normal', 'Loud', 'Loudest']);
    assert.deepEqual(keyTexts(tweakInput('warble')), ['Off', 'A little', 'Lots']);
    assert.deepEqual(pressedKey(tweakInput('volume')), ['Normal']);
    assert.equal(tweakInput('pitch').disabled, true, 'nothing to change before there is a sound');
    assert.ok(keysOf(tweakInput('echo')).every((b) => b.disabled));
  } finally {
    $('#sheet').close();
  }
});

test('a knob plays the sound with it; saving stores only what moved; it comes back; ↩️ Reset voice clears it', async () => {
  const { state } = await import('../web/state.js');
  await openEditor();
  const id = pads()[0].dataset.id;
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');   // earlier tests left Shape it steps on it
  await page.settle();
  calls.length = 0;
  const pitch = tweakInput('pitch');
  pitch.value = '-5';
  pitch.dispatch('input');
  assert.equal(pitch.parentElement.querySelector('output').textContent, '5 notes deeper');
  assert.equal(calls.length, 0, 'dragging only changes the words');
  pitch.dispatch('change');
  await page.settle();
  assert.ok(calls.some(([what, which]) => what === 'start' && which === 'preview'), 'let go: it plays deeper');
  calls.length = 0;
  keysOf(tweakInput('echo'))[2].dispatch('click');   // Hall
  await page.settle();
  assert.deepEqual(pressedKey(tweakInput('echo')), ['Hall']);
  assert.ok(calls.some(([what]) => what === 'start'), 'a key plays it at once');
  addLayer({ addKnob: 'backwards' });
  await page.settle();
  assert.deepEqual(pressedKey(knob('backwards')), ['On'], 'added from + Add a layer, on');
  addLayer({ addKnob: 'tone' });
  assert.deepEqual(keyTexts(knob('tone')), ['Muffled', 'Dull', 'Normal', 'Clear', 'Bright']);
  assert.deepEqual(pressedKey(knob('tone')), ['Muffled'], 'it starts where it changes the sound');
  removeLayer('tone');
  assert.equal(layerRow('tone'), undefined, '✕ takes it out, back to normal');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(state.overrides.get(id).tweaks, { pitch: -5, echo: 2, backwards: true });
  assert.equal(state.overrides.get(id).voice, undefined, 'the voice is untouched: deeper is not Monster');

  await openEditor();
  assert.equal(tweakInput('pitch').value, '-5', 'the knobs come back');
  assert.deepEqual(pressedKey(tweakInput('echo')), ['Hall']);
  assert.ok(layerRow('backwards'), 'Backwards is on: its row shows');
  $('#normal-btn').dispatch('click');
  await page.settle();
  assert.equal(tweakInput('pitch').value, '0');
  assert.equal(layerRow('backwards'), undefined, '↩️ Reset voice: its row goes');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.ok(!('tweaks' in (state.overrides.get(id) ?? {})), 'no knobs stores none');
});

test('a ✦ special part is a layer where it plays, and ✕ takes it out', async () => {
  await openEditor();
  chip('clones').dispatch('click');
  assert.equal(layerRow('special').querySelector('.layer-name').textContent, 'Special: clones');
  removeLayer('special');
  assert.equal(layerRow('special'), undefined);
  assert.deepEqual(lit(), [], 'Clones is no longer what the knobs say');
  $('#sheet').close();
});

test('a recorded sound keeps its tweaks with its voice; the pad renders them (the cache key has them)', async () => {
  const clip = await openClip({ voice: 'robot', tweaks: { pitch: -7 } });
  assert.equal(tweakInput('pitch').value, '-7');
  keysOf(tweakInput('volume'))[1].dispatch('click');   // Quiet
  await page.settle();
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(clip.tweaks, { pitch: -7, volume: -1 });
  assert.equal(clip.voice, 'robot');
  assert.ok(audio.key(clip).includes('robot:null~p-7,v-1'), audio.key(clip));

  // The pad plays its knobs: Quiet renders at half the level of the same sound without it.
  const peak = (r) => Math.max(...r.buffer.getChannelData(0).map(Math.abs));
  const quiet = { ...clip, id: 'user-tweak-2', voice: 'normal', tweaks: { volume: -1 } };
  const loud = { ...quiet, id: 'user-tweak-3', tweaks: undefined };
  for (const c of [quiet, loud]) audio.originals.set(c.id, Promise.resolve(plain));
  const [q, l] = await Promise.all([audio.load(quiet), audio.load(loud)]);
  assert.ok(Math.abs(peak(q) - peak(l) / 2) < 1e-6, `${peak(q)} vs ${peak(l)}`);
});

test('the name is in the title bar, ready to rename; renaming there saves it', async () => {
  const { state } = await import('../web/state.js');
  await openEditor();
  const id = pads()[0].dataset.id;
  assert.ok($('#clip-label').closest('.sheet-head'), 'in the sticky heading row, beside ✕');
  assert.equal($('#clip-label').getAttribute('maxlength'), '24');
  // Ben: "without the pencil": the name fills the row beside ✕, a dashed underline says it can be typed in.
  assert.equal($('#sheet').querySelector('.sheet-name-pen'), null, 'no ✏️ floating beside it');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('\n.sheet-name input {'), css.indexOf('}', css.indexOf('\n.sheet-name input {')));
  assert.match(rule, /width: 100%;/);
  assert.match(rule, /border-bottom: 2px dashed/);
  assert.match(rule, /text-overflow: ellipsis;/);
  assert.doesNotMatch(css, /\.sheet-name input \{[^}]*field-sizing/, 'never as narrow as its text');
  $('#clip-label').value = 'Big Honk';
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(state.overrides.get(id).label, 'Big Honk');
});

test('Voice and Layers fold under their headings; open to start; the Keep · Normal row stays outside', async () => {
  await openEditor();
  const head = (f) => $('#sheet').querySelector(`[data-fold="${f}"]`);
  for (const f of ['voice', 'layers']) {
    assert.equal(head(f).getAttribute('aria-expanded'), 'true', f);
    assert.ok(head(f).classList.contains('set-head'), 'styled like Settings’ heads (48 px)');
  }
  head('layers').dispatch('click');
  assert.equal(head('layers').getAttribute('aria-expanded'), 'false');
  assert.equal($('#layers-body').hidden, true);
  assert.equal($('#voice-actions').closest('.fold-body'), null, 'Save voice and Reset voice never fold away');
  $('#sheet').close();
  await openEditor();
  assert.equal($('#layers-body').hidden, true, 'kept while the page is open');
  head('layers').dispatch('click');
  assert.equal($('#layers-body').hidden, false);
  $('#sheet').close();
});

// ── Layers: order, mute, rows that stay (Q42a, Q42b) ─────────────────

test('Layers run top to bottom in play order: knob rows, then the kid’s own steps; a ✦ special sits where it plays', async () => {
  await advanced(true);
  await openPlain();
  chip('alien').dispatch('click');   // pitch, speed, warble, robot
  assert.deepEqual(layers(), ['pitch', 'speed', 'robot', 'warble', 'volume', 'echo']);
  assert.equal(layerRow('pitch').querySelector('[data-grip]'), null, 'a knob has its place: no grip');
  assert.equal(layerRow('robot').querySelectorAll('.slider-keys button').length, 3, 'a few stops are keys');
  chip('monster').dispatch('click');   // a ✦ special part plays early, after Backwards
  assert.deepEqual(layers().slice(0, 4), ['pitch', 'speed', 'special', 'robot']);
  addStep('echo');
  assert.deepEqual(layers().slice(-2), ['echo', 'step:0'], 'the steps after the knobs');
  $('#sheet').close();
  await advanced(false);
});

test('a knob moved back to normal by hand keeps its row; a voice, 🎲 or ↩️ Reset voice moves the knobs and it goes (Q42b)', async () => {
  await openEditor();
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');
  chip('robot').dispatch('click');
  keysOf(knob('robot'))[0].dispatch('click');   // Off, by hand
  assert.ok(layerRow('robot'), 'kept while the sheet is open');
  assert.deepEqual(lit(), [], 'moved by hand: the kid’s own');
  chip('chipmunk').dispatch('click');
  assert.equal(layerRow('robot'), undefined, 'a voice moved the knobs: only the ones on show');
  $('#sheet').close();
});

test('🔈 mutes a layer: it keeps its setting, doesn’t play, and is saved muted; 🔇 brings it back', async () => {
  const { state } = await import('../web/state.js');
  await openEditor();
  const id = pads()[0].dataset.id;
  if (!$('#normal-btn').disabled) $('#normal-btn').dispatch('click');
  chip('stadium').dispatch('click');
  await page.settle();
  calls.length = 0;
  const mute = () => layerRow('echo').querySelector('[data-mute]');
  mute().dispatch('click');
  assert.equal(mute().getAttribute('aria-pressed'), 'true');
  assert.equal(mute().textContent, '🔇');
  assert.ok(layerRow('echo').classList.contains('muted'), 'dimmed, like a muted Beats row');
  assert.deepEqual(pressedKey(knob('echo')), ['Echo'], 'its setting stays');
  await page.settle();
  assert.ok(calls.some(([w, which]) => w === 'start' && which === 'preview'), 'it plays without it');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(state.overrides.get(id).tweaks, { echo: 3, muted: ['echo'] });
  await openEditor();
  assert.equal(mute().getAttribute('aria-pressed'), 'true', 'it comes back muted');
  mute().dispatch('click');
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.deepEqual(state.overrides.get(id).tweaks, { echo: 3 });
});

test('a muted step stays in the chain with `off`, and plays no more', async () => {
  const { state } = await import('../web/state.js');
  await advanced(true);
  await openPlain();
  const id = pads()[0].dataset.id;
  addStep('crunch');
  addStep('echo');
  stepRows()[0].querySelector('[data-mute]').dispatch('click');
  assert.ok(stepRows()[0].classList.contains('muted'));
  $('#sheet-form').dispatch('submit');
  await page.settle();
  assert.equal(state.overrides.get(id).fx[0].off, true);
  assert.equal(state.overrides.get(id).fx[1].off, undefined);
  await advanced(false);
});

test('the Advanced switch sits at the bottom of Layers and flips the same setting', async () => {
  const { getSetting } = await import('../web/settings.js');
  await advanced(false);
  await openEditor();
  const sw = $('#sheet-advanced');
  assert.equal(sw.closest('#layers-body'), $('#layers-body'));
  assert.equal(sw.checked, false);
  sw.checked = true;
  sw.dispatch('change');
  await page.settle();
  assert.equal(getSetting('advancedBeats'), true);
  assert.equal($('#layer-extra').hidden, false, 'the sheet follows at once');
  sw.checked = false;
  sw.dispatch('change');
  await page.settle();
  assert.equal($('#layer-extra').hidden, true);
  $('#sheet').close();
});

test('a sound saved with old voices and knobs plays its knobs after its steps, so their rows sit after the steps', async () => {
  await advanced(true);
  await openClip({ fx: [{ type: 'voice', voice: 'chipmunk', amount: 1.7 }, { type: 'echo', repeats: 3, gap: 0.25 }], tweaks: { pitch: -3 } });
  assert.deepEqual(layers(), ['step:0', 'step:1', 'pitch', 'speed', 'warble', 'volume', 'echo']);
  $('#sheet').close();
  await advanced(false);
});

test('the live loop plays the knobs too: knobs that play first are in its head', async () => {
  await advanced(true);
  await openPlain();
  const starts = [];
  const realStart = audio.start;
  audio.start = (id, sound, opts = {}) => { starts.push([id, !!opts.loop]); calls.push(['start', id, sound.buffer]); };
  audio.unloop = () => {};
  try {
    chip('chipmunk').dispatch('click');
    addStep('echo');
    await page.settle();
    const { applyChain } = await import('../web/voices.js');
    starts.length = 0;
    const slider = $('#layer-rows').querySelector('input[data-key="repeats"]');
    slider.dispatch('pointerdown', { button: 0 });
    await page.settle();
    assert.deepEqual(starts, [['preview', true]], 'it loops');
    const head = calls.filter(([w]) => w === 'start').at(-1)[2];
    const chipmunked = (await applyChain(plain, [], { pitch: 9, speed: 0.8, first: true })).buffer;
    const start = (b, n) => [...b.getChannelData(0).slice(0, n)].map((x) => x.toFixed(4));
    assert.deepEqual(start(head, chipmunked.length), start(chipmunked, chipmunked.length), 'the loop is the Chipmunk sound, not the plain one');
    assert.notDeepEqual(start(head, 200), start(plain, 200));
    slider.dispatch('change');
  } finally {
    audio.start = realStart;
    $('#sheet').close();
    await advanced(false);
  }
});
