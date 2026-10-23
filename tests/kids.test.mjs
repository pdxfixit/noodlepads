// 🧸 Kids (ADR 0019): the pure parts (the grown-up sum, pages of pads, the
// pinch, the kid's beat, the voices), then the real app on the stand-in page
// with a person on the Kids level. Sound, the microphone, a real swipe and a
// real pinch need a browser and a device: `just look kids-pads` and the rest
// show how it looks; a phone shows how it feels.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import {
  makeSum, typeDigit, kidsRange, kidsAutoPx, kidsPadPx, kidsShare, shareOf, kidsSliderAt, pageShape, pagesOf, pageAt, pinchShare, kidsPadOrder, KIDS_PADS,
  newKidsBeat, squaresOf, withSquare, tempoAfter, tempoName, squareSeconds, KIDS_TEMPOS,
  kidsVoiceFields, voiceAfter, pictureFor, KIDS_EMOJI, beatLayout, cleanTab, KIDS_KEYS, keyPitch, keyRate, keyPlayId, isHighKey,
} from '../web/kids-logic.js';
import { MELODY_NOTES } from '../web/notes.js';
import { BEAT_ID, cleanPattern } from '../web/sequencer.js';
import { isScratch, scratchId } from '../web/scratch.js';

// ── Pure ──

test('the grown-up sum: two numbers from 6 to 9, so the answer always has two digits', () => {
  for (const r of [0, 0.3, 0.6, 0.999]) {
    const s = makeSum(() => r);
    assert.ok(s.a >= 6 && s.a <= 9 && s.b >= 6 && s.b <= 9, JSON.stringify(s));
    assert.equal(s.answer, s.a + s.b);
    assert.equal(String(s.answer).length, 2);
  }
  let n = 0;
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(makeSum(() => ((n = (n * 7 + 3) % 10) / 10)).a);
  assert.ok(seen.size > 1, 'random each time');
});

test('typing the answer: done after as many digits as it has; right only when they match', () => {
  assert.deepEqual(typeDigit('', '1', 15), { typed: '1', done: false, right: false });
  assert.deepEqual(typeDigit('1', '5', 15), { typed: '15', done: true, right: true });
  assert.deepEqual(typeDigit('1', '4', 15), { typed: '14', done: true, right: false });
  assert.deepEqual(typeDigit('', '9', 15), { typed: '9', done: false, right: false });
});

// Ben, 2026-10-16: Kids uses the person's own pad size, Pads' padSize, with
// ends of its own: four across a phone at the smallest, one pad filling the
// line at the biggest, every step in between a little bigger.
test('pad size: the person\'s padSize between Kids\' own ends, smooth, square pads at an exact size', () => {
  // A 343 px wide box (a 375 px phone) 520 px tall.
  const { min, max } = kidsRange(343, 520);
  assert.equal(min, (343 - 12 * 5) / 4, 'smallest: four across');
  assert.equal(max, 343 - 24, 'biggest: one pad filling the line');
  assert.equal(kidsPadPx(343, 520, 0), Math.floor(min));
  assert.equal(kidsPadPx(343, 520, 1), max);
  assert.equal(kidsPadPx(343, 520, 'auto'), Math.floor((343 - 48) / 3), 'auto: three across, as Kids always opened');
  for (const junk of [null, 'big', 2, -1]) assert.equal(kidsPadPx(343, 520, junk), kidsPadPx(343, 520, 'auto'));
  let last = 0;
  for (let i = 0; i <= 100; i++) {
    const px = kidsPadPx(343, 520, i / 100);
    assert.ok(px >= last, `step ${i} never smaller`);
    last = px;
  }
  assert.ok(kidsPadPx(343, 520, 0.51) > kidsPadPx(343, 520, 0.49), 'the steps between change the size');
  assert.equal(pageShape(343, 520, kidsPadPx(343, 520, 0)).cols, 4);
  assert.equal(pageShape(343, 520, kidsPadPx(343, 520, 1)).cols, 1);
  // A short, wide box: the biggest pad still fits its height.
  assert.equal(kidsRange(1068, 400).max, 400 - 24);
  assert.equal(kidsRange(1068, 400).min, (1068 - 12 * 9) / 8, 'four per 560 px on a wider screen');
  // The slider and the size agree both ways.
  assert.equal(kidsSliderAt(343, 520, 0.37), 37);
  assert.equal(kidsSliderAt(343, 520, 'auto'), Math.round(100 * kidsShare(343, 520, kidsAutoPx(343, 520))));
  assert.equal(shareOf(343, 520, 0.2), 0.2);
});

test('a page of pads: as many square pads as fit, at least one row and column; the list cut into pages', () => {
  const s = pageShape(375, 600, 100);
  assert.deepEqual(s, { cols: Math.floor((375 - 12) / 112), rows: Math.floor((600 - 12) / 112), size: 100 });
  assert.deepEqual(pageShape(375, 50, 100), { cols: 3, rows: 1, size: 100 });
  assert.equal(pageShape(100, 100, 300).cols, 1);
  assert.deepEqual(pagesOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(pagesOf([], 6), [[]]);
});

test('a swipe rests on the nearest page, never past the first or last', () => {
  assert.equal(pageAt(0, 375, 3), 0);
  assert.equal(pageAt(200, 375, 3), 1);
  assert.equal(pageAt(375 * 2, 375, 3), 2);
  assert.equal(pageAt(5000, 375, 3), 2);
  assert.equal(pageAt(-40, 375, 3), 0);
  assert.equal(pageAt(100, 0, 3), 0);
});

test('a pinch: fingers apart make the pads bigger, together smaller, smoothly, kept to the setting\'s steps', () => {
  const ratio = (kidsRange(343, 520).max + 12) / (kidsRange(343, 520).min + 12);
  assert.equal(pinchShare(0.5, 100, 100, 343, 520), 0.5, 'still fingers change nothing');
  const wider = pinchShare(0.5, 100, 120, 343, 520);
  assert.equal(wider, Math.round((0.5 + Math.log(1.2) / Math.log(ratio)) * 100) / 100, 'the pads grow by as much as the fingers spread');
  assert.ok(pinchShare(0.5, 100, 90, 343, 520) < 0.5, 'pinched: smaller');
  assert.ok(pinchShare(0.5, 100, 103, 343, 520) > 0.5, 'a small spread is a small step, not a jump of a column');
  assert.equal(pinchShare(0.5, 100, 10000, 343, 520), 1);
  assert.equal(pinchShare(0.5, 100, 1, 343, 520), 0);
  assert.equal(pinchShare('auto', 100, 100, 343, 520), Math.round(100 * kidsShare(343, 520, kidsAutoPx(343, 520))) / 100, 'auto starts where the screen\'s own size sits');
  assert.equal(pinchShare(0.3, 0, 50, 343, 520), 0.3);
});

// Ben, 2026-10-22: the kid mode pads "have to have matching sounds to the
// emoji pictures… engaging, interesting and funny ones for the kids to hit".
test('the kid\'s own sounds come first, newest first, then the board\'s own, then only the presets whose picture shows the sound, funniest first', () => {
  const clips = [
    { id: 'k-c', source: 'bundled', kit: true, kitId: 'note-c' }, { id: 'u-old', source: 'user', created: 1 }, { id: 'b1', source: 'bundled' },
    { id: 'k-woof', source: 'bundled', kit: true, kitId: 'woof' }, { id: 'u-new', source: 'user', created: 9 }, { id: 'k-pop', source: 'bundled', kit: true, kitId: 'pop' },
    { id: 'k-hat', source: 'bundled', kit: true, kitId: 'hihat' }, { id: 'k-moo', source: 'bundled', kit: true, kitId: 'moo' },
  ];
  assert.deepEqual(kidsPadOrder(clips).map((c) => c.id), ['u-new', 'u-old', 'b1', 'k-woof', 'k-moo', 'k-pop'], 'a note, and a 🎩 hi-hat, never show');
});

test('every Kids pad is a preset of the kit a kid can have without Advanced, each once, and the animals come first', () => {
  const kit = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kit;
  assert.equal(new Set(KIDS_PADS).size, KIDS_PADS.length, 'no preset twice');
  for (const id of KIDS_PADS) {
    const preset = kit.find((k) => k.id === id);
    assert.ok(preset, `${id} is in the kit`);
    assert.ok(!preset.advanced && !preset.inst, `${id} shows at every level, on no instrument`);
    assert.ok(!['notes', 'chords', 'bass'].includes(preset.group), `${id}: no fruit, weather or bass animals (their pictures teach the notes, not the sound)`);
  }
  assert.deepEqual(KIDS_PADS.slice(0, 8).map((id) => kit.find((k) => k.id === id).group), Array(8).fill('animals'));
  assert.ok(KIDS_PADS.length >= 50 && KIDS_PADS.length <= 90, String(KIDS_PADS.length));
});

test('the kid\'s beat is a normal beat: square i is pill 2i of a 16-pill bar', () => {
  const ids = ['p-kick', 'p-snare', 'p-hihat', 'p-clap'];
  const beat = newKidsBeat('p-a', ids, scratchId('p-a'), 5);
  assert.ok(BEAT_ID.test(beat.id) && isScratch(beat), 'the person\'s scratch beat (ADR 0020)');
  assert.equal(beat.bpm, KIDS_TEMPOS.mid);
  assert.equal(beat.rows.length, 4);
  assert.deepEqual(squaresOf(beat, ids), ids.map(() => Array(8).fill(false)));
  const on = withSquare(beat, ids, 1, 3, true, 9);
  assert.equal(on.rows[1].steps[6], true);
  assert.equal(on.saved, 9);
  assert.equal(beat.rows[1].steps[6], false, 'the old beat is left as it was');
  assert.deepEqual(squaresOf(on, ids)[1], [false, false, false, true, false, false, false, false]);
  // It stays itself through the regular app's cleaning.
  const clean = cleanPattern(on, 'p-a');
  assert.equal(clean.id, 'beat-scratch-p-a');
  assert.deepEqual(squaresOf(clean, ids), squaresOf(on, ids));
  // A drum with no row gets one; other rows and odd pills are left alone.
  const extra = { ...beat, rows: [{ ...beat.rows[0], steps: beat.rows[0].steps.map((_, i) => i === 1) }] };
  const more = withSquare(extra, ids, 3, 0, true);
  assert.equal(more.rows.length, 2);
  assert.equal(more.rows[1].clipId, 'p-clap');
  assert.equal(more.rows[0].steps[1], true);
  assert.equal(withSquare(beat, [null, null, null, null], 0, 0, true), beat, 'no drum, no change');
});

test('🐢 and 🏃: tap one for slow or fast, tap it again for the middle', () => {
  assert.equal(tempoAfter(110, 'slow'), 80);
  assert.equal(tempoAfter(80, 'slow'), 110);
  assert.equal(tempoAfter(80, 'fast'), 140);
  assert.equal(tempoAfter(140, 'fast'), 110);
  assert.equal(tempoName(80), 'slow');
  assert.equal(tempoName(110), 'mid');
  assert.equal(tempoName(140), 'fast');
  assert.equal(squareSeconds(120), 0.25);
});

test('the voices: 🤖 Robot, 🐭 Tiny (Chipmunk), 👻 Spooky (Monster with an echo); tap again for Normal', () => {
  assert.deepEqual(kidsVoiceFields('robot'), { voice: 'robot' });
  assert.equal(kidsVoiceFields('tiny').voice, 'chipmunk');
  const spooky = kidsVoiceFields('spooky');
  assert.equal(spooky.voice, 'monster');
  assert.deepEqual(spooky.fx.map((s) => s.voice), ['monster', 'stadium']);
  assert.deepEqual(kidsVoiceFields(null), { voice: 'normal' });
  assert.equal(voiceAfter(null, 'robot'), 'robot');
  assert.equal(voiceAfter('robot', 'tiny'), 'tiny');
  assert.equal(voiceAfter('tiny', 'tiny'), null);
});

test('small things: a new pad\'s picture, the beat\'s shape, the remembered tab, the keys', () => {
  assert.equal(pictureFor(new Set()), KIDS_EMOJI[0]);
  assert.equal(pictureFor(new Set([KIDS_EMOJI[0]])), KIDS_EMOJI[1]);
  assert.equal(beatLayout(320), 'down');
  assert.equal(beatLayout(375), 'down');
  assert.equal(beatLayout(700), 'across');
  assert.equal(cleanTab('beats'), 'beats');
  assert.equal(cleanTab('settings'), 'pads');
  assert.equal(KIDS_KEYS.length, 8);
  assert.equal(new Set(KIDS_KEYS.map((k) => k.color)).size, 8);
});

test('the toy keys are pentatonic: C D E G A, then high C D E, the high ones the low notes an octave up', () => {
  assert.deepEqual(KIDS_KEYS.map(keyPitch), [0, 2, 4, 7, 9, 12, 14, 16]);
  assert.deepEqual(KIDS_KEYS.map(keyPitch), MELODY_NOTES, 'the same notes as the old melody rows');
  assert.deepEqual(KIDS_KEYS.map((k) => k.note), ['note-c', 'note-d', 'note-e', 'note-g', 'note-a', 'note-c', 'note-d', 'note-e']);
  assert.deepEqual(KIDS_KEYS.map(isHighKey), [false, false, false, false, false, true, true, true]);
  assert.deepEqual(KIDS_KEYS.map(keyRate), [1, 1, 1, 1, 1, 2, 2, 2]);
  assert.deepEqual(KIDS_KEYS.map((k) => k.key).join(''), 'asdfghjk');
  // A high key plays under its own name, so a low C and a high C can sound together.
  assert.equal(keyPlayId(KIDS_KEYS[0], 'note-c'), 'note-c');
  assert.notEqual(keyPlayId(KIDS_KEYS[5], 'note-c'), 'note-c');
});

// ── The app, with a person on the Kids level ──

let page;
let $;
let state;
let played;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  await page.settle();
  ({ state } = await import('../web/state.js'));
  const { audio } = await import('../web/audio.js');
  played = [];
  audio.play = async (clip) => { played.push(clip.id); };
});

const setLevel = async (level) => {
  const { setSetting } = await import('../web/settings.js');
  await setSetting('level', level);
  await page.settle();
};

test('Regular shows the regular app; the Kids level swaps in the kid\'s screens', async () => {
  assert.equal(document.body.classList.contains('kids'), false);
  assert.equal($('#kids').hidden, true);
  await setLevel('kids');
  assert.equal(document.body.classList.contains('kids'), true, 'the regular app hides (styles.css: body.kids)');
  assert.equal($('#kids').hidden, false);
  // Four big picture tabs and ⏹️, no words.
  const tabs = $('#kids').querySelectorAll('[data-kids-tab]');
  assert.deepEqual(tabs.map((b) => b.dataset.kidsTab), ['pads', 'record', 'beats', 'keys']);
  assert.deepEqual(tabs.map((b) => b.textContent), ['🔊', '🎙️', '🥁', '🎹']);
  assert.equal($('#kids-stop').textContent, '⏹️');
  assert.equal($('[data-kids-view="pads"]').hidden, false);
});

test('Pads: big picture pads, the kit and the kid\'s own; a tap plays, nothing to edit or delete', () => {
  const pads = $('#kids-pages').querySelectorAll('.kids-pad');
  assert.ok(pads.length > 20, String(pads.length));
  assert.ok($('#kids-pages').querySelectorAll('.kids-page').length > 1, 'more than one page to swipe');
  assert.equal($('#kids').querySelectorAll('[data-edit]').length, 0);
  assert.equal($('#kids').querySelectorAll('[data-delete]').length, 0);
  played.length = 0;
  pads[0].dispatch('pointerdown');
  assert.deepEqual(played, [pads[0].dataset.clip]);
  assert.ok(pads[0].classList.contains('boing'), 'a bounce');
});

// Ben, 2026-10-13: "dragging a finger should not trigger a sound (like when
// one is scrolling)". A finger plays on the lift, if it stayed put.
// Not tested here: a real swipe's feel and the browser's own pointercancel.
test('Pads, a finger: it sounds on the lift with a bounce; a page swipe, a cancelled touch or a pinch stays silent', () => {
  const pads = $('#kids-pages').querySelectorAll('.kids-pad');
  const touch = (props) => ({ pointerType: 'touch', clientX: 100, clientY: 100, ...props });
  played.length = 0;
  pads[1].classList.remove('boing');
  pads[1].dispatch('pointerdown', touch({ pointerId: 21 }));
  assert.deepEqual(played, [], 'nothing on touch-down');
  page.winEvent('pointerup', touch({ pointerId: 21, clientX: 104, clientY: 103 }));
  assert.deepEqual(played, [pads[1].dataset.clip], 'a tap sounds on the lift');
  assert.ok(pads[1].classList.contains('boing'), 'with its bounce');
  // A swipe to the next page.
  played.length = 0;
  pads[1].dispatch('pointerdown', touch({ pointerId: 22 }));
  page.winEvent('pointermove', touch({ pointerId: 22, clientX: 60 }));
  page.winEvent('pointerup', touch({ pointerId: 22, clientX: 100 }));
  assert.deepEqual(played, [], 'a swipe that came back is still a swipe');
  // The browser took the touch for a scroll.
  pads[1].dispatch('pointerdown', touch({ pointerId: 23 }));
  page.winEvent('pointercancel', touch({ pointerId: 23 }));
  page.winEvent('pointerup', touch({ pointerId: 23 }));
  assert.deepEqual(played, []);
  // A second finger lands: a pinch.
  pads[1].dispatch('pointerdown', touch({ pointerId: 24 }));
  const t = (x) => ({ clientX: x, clientY: 100 });
  $('#kids-pages').dispatch('touchstart', { touches: [t(100), t(200)] });
  $('#kids-pages').dispatch('touchend', { touches: [] });
  page.winEvent('pointerup', touch({ pointerId: 24 }));
  assert.deepEqual(played, [], 'a pinch never plays');
});

test('more pages: ◀️ waits on the first page, ▶️ turns to the next, a dot per page', () => {
  const pages = $('#kids-pages').querySelectorAll('.kids-page').length;
  assert.equal($('#kids-turn').hidden, false);
  assert.equal($('#kids-dots').children.length, pages);
  const [back, next] = $('#kids-turn').querySelectorAll('[data-turn]');
  assert.equal(back.disabled, true);
  assert.ok($('#kids-dots').children[0].classList.contains('here'));
  next.dispatch('click');
  assert.equal(back.disabled, false);
  assert.ok($('#kids-dots').children[1].classList.contains('here'));
  back.dispatch('click');
  assert.equal(back.disabled, true);
});

test('Beats: four drums of eight squares; a tap turns one on and saves the kid\'s one beat, their scratch beat', async () => {
  $('[data-kids-tab="beats"]').dispatch('click');
  assert.equal($('[data-kids-view="beats"]').hidden, false);
  assert.equal($('[data-kids-view="pads"]').hidden, true);
  const squares = $('#kids-beat').querySelectorAll('.kids-square');
  assert.equal(squares.length, 32);
  assert.deepEqual($('#kids-beat').querySelectorAll('.kids-drum').map((d) => d.textContent), ['🦶', '🥁', '🎩', '👏']);
  const mine = () => state.savedBeats.filter((b) => b.personId === state.personId && b.id.startsWith('beat-scratch-'));
  assert.equal(mine().length, 0, 'nothing saved just for looking');
  squares[8 + 2].dispatch('click');   // the snare's third square
  assert.equal(mine().length, 1, 'saved once a square is on');
  assert.equal(squares[10].getAttribute('aria-pressed'), 'true');
  assert.equal(mine()[0].rows[1].steps[4], true);
  $('#kids-slow').dispatch('click');
  assert.equal(mine()[0].bpm, 80);
  assert.equal($('#kids-slow').getAttribute('aria-pressed'), 'true');
  $('#kids-fast').dispatch('click');
  assert.equal(mine()[0].bpm, 140);
  // Showing again finds the same beat, its square still on.
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="beats"]').dispatch('click');
  assert.equal(mine().length, 1);
  assert.equal($('#kids-beat').querySelectorAll('.kids-square')[10].getAttribute('aria-pressed'), 'true');
});

test('Keys: eight colored keys; a held key plays', async () => {
  $('[data-kids-tab="keys"]').dispatch('click');
  const keys = $('#kids-keys').querySelectorAll('.kids-key');
  assert.equal(keys.length, 8);
  // High C D E wear the low notes' fruit, with ✦, and play them an octave up.
  const face = (k) => k.querySelectorAll('.kids-key-face')[0].textContent;
  assert.deepEqual([5, 6, 7].map((i) => face(keys[i])), [0, 1, 2].map((i) => face(keys[i])));
  assert.deepEqual(keys.map((k) => k.classList.contains('high')), [false, false, false, false, false, true, true, true]);
  assert.deepEqual(keys.map((k) => k.querySelectorAll('.kids-key-star').length), [0, 0, 0, 0, 0, 1, 1, 1]);
  assert.equal(keys[5].getAttribute('aria-label'), `High ${keys[0].getAttribute('aria-label')}`);
  const { audio } = await import('../web/audio.js');
  const plain = audio.play;
  const heard = [];
  audio.play = async (clip, opts) => { heard.push({ kit: clip.kitId, rate: opts?.rate ?? 1, id: opts?.id ?? clip.id }); };
  keys[0].dispatch('pointerdown', { pointerId: 9 });
  keys[5].dispatch('pointerdown', { pointerId: 8 });
  keys[0].dispatch('pointerup', { pointerId: 9 });
  keys[5].dispatch('pointerup', { pointerId: 8 });
  audio.play = plain;
  assert.deepEqual(heard.map((h) => [h.kit, h.rate]), [['note-c', 1], ['note-c', 2]]);
  assert.notEqual(heard[0].id, heard[1].id, 'a low C and a high C ring at once');
  played.length = 0;
  keys[0].dispatch('pointerdown', { pointerId: 1 });
  keys[4].dispatch('pointerdown', { pointerId: 2 });
  assert.equal(played.length, 2, 'two fingers, two keys');
  assert.ok(keys[0].classList.contains('down'));
  keys[0].dispatch('pointerup', { pointerId: 1 });
  assert.ok(!keys[0].classList.contains('down'));
  assert.ok(keys[4].classList.contains('down'));
  keys[4].dispatch('pointerup', { pointerId: 2 });
});

// Ben, 2026-10-22: the instrument toggle "should be far more indicative of
// whatever the mode currently playing is": every key wears who plays it,
// and a tap on the button plays a note on the new one.
test('🎹 the instrument button: every key wears who plays it; a tap moves to the next of five, keeps it, and plays a C on it', async () => {
  const { getSetting, setSetting } = await import('../web/settings.js');
  const { KIDS_INSTRUMENTS } = await import('../web/kids-logic.js');
  const { instrumentById } = await import('../web/instruments.js');
  await setSetting('instNotes', 'pluck');
  await page.settle();
  $('[data-kids-tab="keys"]').dispatch('click');
  const button = $('#kids-inst');
  assert.equal(button.closest('[data-kids-view]').dataset.kidsView, 'keys', 'on the Keys screen');
  const badges = () => $('#kids-keys').querySelectorAll('.kids-key-inst').map((b) => b.textContent);
  assert.equal(button.textContent, instrumentById('pluck').emoji);
  assert.deepEqual(badges(), Array(8).fill(instrumentById('pluck').emoji), 'every key wears the picture the button shows');
  assert.ok($('#kids-keys').querySelector('.kids-key').getAttribute('aria-label').endsWith(' on Pluck'));
  const seen = [];
  for (let i = 0; i < KIDS_INSTRUMENTS.length; i++) {
    played.length = 0;
    button.dispatch('click');
    await page.settle();
    const inst = getSetting('instNotes');
    seen.push(inst);
    assert.equal(button.textContent, instrumentById(inst).emoji, 'the button shows the instrument now on');
    assert.deepEqual(badges(), Array(8).fill(instrumentById(inst).emoji), 'and so does every key');
    const c = $('#kids-keys').querySelector('.kids-key');
    assert.ok(c.getAttribute('aria-label').endsWith(` on ${instrumentById(inst).name}`), c.getAttribute('aria-label'));
    assert.equal(played.length, 1, 'a note plays on it');
    const { findClip } = await import('../web/board.js');
    assert.equal(findClip(played[0]).label, 'C', 'the C');
  }
  assert.deepEqual(seen, ['piano', 'marimba', 'steel', 'kalimba', 'pluck']);
});

test('Record: the mic and three voices; without a microphone the mic is off', () => {
  $('[data-kids-tab="record"]').dispatch('click');
  assert.deepEqual($('#kids').querySelectorAll('[data-kids-voice]').map((b) => b.textContent), ['🤖', '🐭', '👻']);
  assert.equal($('#kids-mic').disabled, true, 'the stand-in page has no microphone');
  $('[data-kids-voice="robot"]').dispatch('click');
  assert.equal($('[data-kids-voice="robot"]').getAttribute('aria-pressed'), 'true');
  $('[data-kids-voice="robot"]').dispatch('click');
  assert.equal($('[data-kids-voice="robot"]').getAttribute('aria-pressed'), 'false');
});

// Waits until `fn()` is true, polling: a count that shows 3, 2, 1 is read
// as each number appears, never after a fixed wait.
async function until(fn, what, ms = 3000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`still waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 4));
  }
}

// A stand-in microphone and recorder: the page has neither. Each stream's
// tracks count how often they were stopped (let go of).
const mic = { streams: [] };
function fakeMicrophone() {
  window.MediaRecorder = class {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['sound']) }); this.onstop(); }
  };
  globalThis.MediaRecorder = window.MediaRecorder;
  navigator.mediaDevices = { getUserMedia: async () => { const s = { stopped: 0, getTracks() { return [{ stop: () => { s.stopped += 1; } }]; } }; mic.streams.push(s); return s; } };
}

test('Record: hold the mic, let go, and it is a new pad of the kid\'s own, in the lit voice; a voice tap changes it', async () => {
  const { audio } = await import('../web/audio.js');
  const data = new Float32Array(4800);
  data[2400] = 0.8;
  audio.decode = async () => ({ length: data.length, numberOfChannels: 1, sampleRate: 48000, duration: 0.1, getChannelData: () => data });
  fakeMicrophone();
  $('[data-kids-tab="pads"]').dispatch('click');
  $('[data-kids-tab="record"]').dispatch('click');
  assert.equal($('#kids-mic').disabled, false);
  $('[data-kids-voice="tiny"]').dispatch('click');
  const before = state.userClips.length;
  played.length = 0;
  // A real hold: it listens as soon as the microphone answers; the lift keeps it.
  $('#kids-mic').dispatch('pointerdown', { pointerId: 1 });
  await page.settle();
  assert.ok($('#kids-mic').classList.contains('recording'));
  assert.equal($('#kids-mic').getAttribute('aria-pressed'), 'true');
  await new Promise((r) => setTimeout(r, 400));
  $('#kids-mic').dispatch('pointerup', { pointerId: 1 });
  await page.settle();
  assert.equal($('#kids-mic').classList.contains('recording'), false);
  assert.equal(mic.streams.at(-1).stopped, 1, 'the microphone is let go');
  assert.equal(state.userClips.length, before + 1);
  const made = state.userClips.at(-1);
  assert.equal(made.personId, state.personId);
  assert.equal(made.voice, 'chipmunk', '🐭 was lit');
  assert.ok(made.emoji && made.label && made.blob);
  assert.deepEqual(played, [made.id], 'it plays straight away');
  assert.equal($('#kids-last').hidden, false);
  assert.equal($('#kids-last').textContent, made.emoji);
  // 👻 changes that sound at once, and plays it again.
  $('[data-kids-voice="spooky"]').dispatch('click');
  await page.settle();
  assert.equal(made.voice, 'monster');
  assert.deepEqual(made.fx.map((x) => x.voice), ['monster', 'stadium']);
  assert.equal(played.length, 2);
  // And it is the first pad on Pads.
  $('[data-kids-tab="pads"]').dispatch('click');
  assert.equal($('#kids-pages').querySelector('.kids-pad').dataset.clip, made.id);
  $('[data-kids-voice="spooky"]').dispatch('click');   // Normal again
});

// Ben, 2026-10-22: "Tapping the big microphone to record should give a 321
// countdown… It can be held still if they want but both should be capable".
test('Record: a tap counts 3, 2, 1 on the mic, then it listens until the next tap; the hold\'s first moments are thrown away', async () => {
  const { KIDS_COUNT } = await import('../web/kids-logic.js');
  KIDS_COUNT.ms = 40;
  fakeMicrophone();
  $('[data-kids-tab="record"]').dispatch('click');
  const face = () => $('#kids-mic-face').textContent;
  const before = state.userClips.length;
  played.length = 0;
  $('#kids-mic').dispatch('pointerdown', { pointerId: 2 });
  await page.settle();
  assert.ok($('#kids-mic').classList.contains('recording'), 'a press listens at once, in case it is a hold');
  $('#kids-mic').dispatch('pointerup', { pointerId: 2 });   // a quick lift: a tap
  assert.equal($('#kids-mic').classList.contains('recording'), false, 'the hold\'s first moments are thrown away');
  assert.equal(state.userClips.length, before, 'nothing kept from them');
  assert.ok($('#kids-mic').classList.contains('counting'));
  assert.equal(face(), '3');
  await until(() => face() === '2', '2');
  await until(() => face() === '1', '1');
  await until(() => face() === '🎙️' && $('#kids-mic').classList.contains('recording'), 'listening');
  assert.equal($('#kids-mic').classList.contains('counting'), false);
  assert.equal(mic.streams.at(-1).stopped, 0, 'the same microphone, asked for once, is listening');
  assert.equal(state.userClips.length, before, 'nothing kept yet');
  await new Promise((r) => setTimeout(r, 400));
  $('#kids-mic').dispatch('pointerdown', { pointerId: 3 });   // the next tap stops it
  $('#kids-mic').dispatch('pointerup', { pointerId: 3 });
  await page.settle();
  assert.equal($('#kids-mic').classList.contains('recording'), false);
  assert.equal(mic.streams.at(-1).stopped, 1, 'the microphone is let go');
  assert.equal(state.userClips.length, before + 1, 'a new pad');
  assert.equal(state.userClips.at(-1).voice, 'normal');
  assert.deepEqual(played, [state.userClips.at(-1).id]);
});

test('Record: a tap during 3, 2, 1 calls it off, and nothing is kept', async () => {
  fakeMicrophone();
  const before = state.userClips.length;
  $('#kids-mic').dispatch('pointerdown', { pointerId: 4 });
  await page.settle();
  $('#kids-mic').dispatch('pointerup', { pointerId: 4 });
  assert.equal($('#kids-mic-face').textContent, '3');
  $('#kids-mic').dispatch('pointerdown', { pointerId: 5 });
  $('#kids-mic').dispatch('pointerup', { pointerId: 5 });
  await page.settle();
  assert.equal($('#kids-mic').classList.contains('counting'), false);
  assert.equal($('#kids-mic-face').textContent, '🎙️');
  assert.equal($('#kids-mic').classList.contains('recording'), false);
  assert.equal(mic.streams.at(-1).stopped, 1, 'the microphone is let go');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal($('#kids-mic').classList.contains('recording'), false, 'the count stays called off');
  assert.equal(state.userClips.length, before);
  // Leaving the screen while it counts calls it off too.
  $('#kids-mic').dispatch('pointerdown', { pointerId: 6 });
  await page.settle();
  $('#kids-mic').dispatch('pointerup', { pointerId: 6 });
  assert.ok($('#kids-mic').classList.contains('counting'));
  $('[data-kids-tab="pads"]').dispatch('click');
  assert.equal($('#kids-mic').classList.contains('counting'), false);
  assert.equal(mic.streams.at(-1).stopped, 1);
  $('[data-kids-tab="record"]').dispatch('click');
  assert.equal(state.userClips.length, before);
});

test('the page\'s keys stand down in Kids: ← → never change the person', () => {
  const who = state.personId;
  page.key('ArrowRight');
  assert.equal(state.personId, who);
});

test('⚙️ asks a sum; a wrong answer goes quietly back to the kid\'s screens', async () => {
  $('#settings-open').dispatch('click');
  assert.equal($('#kids-sum').open, true);
  assert.equal($('#settings-dialog').open, false, 'not Settings yet');
  const a = Number($('#kids-sum-a').textContent);
  const b = Number($('#kids-sum-b').textContent);
  const wrong = String(a + b === 12 ? 13 : 12);
  for (const d of wrong) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
  await new Promise((r) => setTimeout(r, 450));
  assert.equal($('#kids-sum').open, false);
  assert.equal($('#settings-dialog').open, false);
  assert.equal(document.body.classList.contains('kids'), true);
});

test('the right answer opens Settings and the regular app; the level stays Kids', async () => {
  $('#settings-open').dispatch('click');
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
  assert.equal($('#kids-sum').open, false);
  assert.equal($('#settings-dialog').open, true);
  assert.equal(document.body.classList.contains('kids'), false);
  assert.equal($('#kids').hidden, true);
  const { getSetting } = await import('../web/settings.js');
  assert.equal(getSetting('level'), 'kids');
  assert.equal($('#level-keys').querySelector('[data-level="kids"]').getAttribute('aria-pressed'), 'true');
  // ⚙️ now opens Settings straight away, for the rest of the visit.
  $('#settings-dialog').close();
  $('#settings-open').dispatch('click');
  assert.equal($('#settings-dialog').open, true);
});

test('🧸 Kids in Settings brings the kid\'s screens back; Regular leaves them for good', async () => {
  $('#level-keys').querySelector('[data-level="kids"]').dispatch('click');
  await page.settle();
  assert.equal($('#settings-dialog').open, false);
  assert.equal(document.body.classList.contains('kids'), true);
  // A grown-up again, then Regular.
  $('#settings-open').dispatch('click');
  const answer = String(Number($('#kids-sum-a').textContent) + Number($('#kids-sum-b').textContent));
  for (const d of answer) $('#kids-sum-keys').querySelector(`[data-digit="${d}"]`).dispatch('click');
  $('#level-keys').querySelector('[data-level="regular"]').dispatch('click');
  await page.settle();
  $('#settings-dialog').close();
  assert.equal(document.body.classList.contains('kids'), false);
  // The kid's beat is their scratch beat: the regular app opens it, and it
  // is not in 🗂️ My beats (ADR 0020).
  assert.ok(state.savedBeats.some((b) => b.id.startsWith('beat-scratch-') && b.personId === state.personId));
  $('#beats-toggle').dispatch('click');
  const bar = document.querySelectorAll('.beat-bar')[0];
  assert.equal(bar.querySelector('[data-beat-name]').value, 'Scratch beat');
  assert.equal($('#seq-rows').children.filter((c) => c.classList.contains('seq-row')).length, 4, 'the four drums');
  bar.querySelector('[data-beat-open]').dispatch('click');
  assert.equal($('#lib-list').children.length, 0, 'not in 🗂️ My beats');
  $('#library').close();
  $('#pads-tab').dispatch('click');
});

// Kids showing for sure: chosen in ⚙️ Settings → Level, which also ends a
// grown-up's visit (an earlier test left one open).
const toKids = async () => {
  $('#level-keys').querySelector('[data-level="kids"]').dispatch('click');
  await page.settle();
  assert.equal(document.body.classList.contains('kids'), true);
};

// Ben, 2026-10-16: 🧸 Kids can't reach ⚙️ Settings → 🎨 Look without a
// grown-up's sum, so its Pads screen has a round skin button at the top left.
test('🎨 the Kids skin button: each tap moves to the next skin and keeps it, round to Tiles again', async () => {
  const { getSetting } = await import('../web/settings.js');
  const { SKINS, SKIN_IDS } = await import('../web/skins.js');
  await toKids();
  $('[data-kids-tab="pads"]').dispatch('click');
  const button = $('#kids-skin');
  assert.equal(button.getAttribute('aria-label'), 'Next look', 'its tooltip; no words on it');
  assert.equal(button.closest('[data-kids-view]').dataset.kidsView, 'pads', 'on the Pads screen');
  assert.equal(getSetting('padSkin'), 'tiles');
  assert.equal(button.textContent, SKINS[0].emoji);
  const seen = [];
  for (let i = 0; i < SKIN_IDS.length; i++) {
    button.dispatch('click');
    await page.settle();
    seen.push(getSetting('padSkin'));
    assert.equal(button.textContent, SKINS.find((s) => s.id === seen.at(-1)).emoji, 'it shows the skin now on');
    assert.equal(document.documentElement.getAttribute('data-skin'), seen.at(-1) === 'tiles' ? null : seen.at(-1));
  }
  assert.deepEqual(seen, ['slam', 'lit', 'switch', 'spinner', 'jelly', 'googly', 'tiles']);
  assert.ok(state.prefs.get(state.personId) && 'padSkin' in state.prefs.get(state.personId).values, 'kept as the person\'s setting');
  await setLevel('regular');
});

// Ben, 2026-10-16: one pad size per person, the same on Pads and on 🧸 Kids
// at any level; Kids has the slider too (centered in its top bar), and a
// pinch moves the same size.
test('the pad size is the person\'s: the same on Pads and Kids, through a level change; two people keep their own', async () => {
  const { getSetting, setSetting } = await import('../web/settings.js');
  const people = () => $('#people').querySelectorAll('[data-person]');
  await setLevel('regular');
  people()[0].dispatch('click');
  await setSetting('padSize', 0.3);
  people()[1].dispatch('click');
  await page.settle();
  await setSetting('padSize', 0.8);
  people()[0].dispatch('click');
  await page.settle();
  assert.equal(getSetting('padSize'), 0.3, 'the first person kept theirs');
  assert.equal($('#pads-size-slider').value, '30');
  await toKids();
  $('[data-kids-tab="pads"]').dispatch('click');
  assert.equal(getSetting('padSize'), 0.3, 'a level change keeps it');
  assert.equal($('#kids-size-slider').value, '30', 'Kids\' slider shows the same size');
  const { kidsPadPx } = await import('../web/kids-logic.js');
  assert.equal($('#kids-pages').style.props['--kids-pad'], `${kidsPadPx(375, 520, 0.3)}px`, 'the pads are that size');
  people()[1].dispatch('click');
  await page.settle();
  assert.equal($('#kids-size-slider').value, '80', 'the other person\'s own size');
  people()[0].dispatch('click');
  await page.settle();
  await setLevel('regular');
});

test('Kids\' slider and a pinch keep the person\'s pad size, and the pads follow as they move', async () => {
  const { getSetting, setSetting } = await import('../web/settings.js');
  const { kidsPadPx, pinchShare } = await import('../web/kids-logic.js');
  await setSetting('padSize', 0.5);
  await toKids();
  $('[data-kids-tab="pads"]').dispatch('click');
  const slider = $('#kids-size-slider');
  assert.ok(slider.closest('.kids-top'), 'in the Pads screen\'s top bar');
  assert.equal(slider.getAttribute('aria-label'), 'Pad size');
  slider.value = '90';
  slider.dispatch('input');
  assert.equal($('#kids-pages').style.props['--kids-pad'] ?? '', `${kidsPadPx(375, 520, 0.9)}px`, 'the pads grow as it moves');
  assert.equal(getSetting('padSize'), 0.5, 'kept only when it lets go');
  slider.dispatch('change');
  await page.settle();
  assert.equal(getSetting('padSize'), 0.9);
  // Two fingers spread: bigger, smoothly; kept as the fingers lift.
  const pages = $('#kids-pages');
  const touch = (x) => [{ clientX: 100, clientY: 100 }, { clientX: 100 + x, clientY: 100 }];
  await setSetting('padSize', 0.5);
  pages.dispatch('touchstart', { touches: touch(100) });
  pages.dispatch('touchmove', { touches: touch(80) });
  const want = pinchShare(0.5, 100, 80, 375, 520);
  assert.ok(want < 0.5);
  assert.equal(slider.value, String(Math.round(want * 100)), 'the slider follows the pinch');
  pages.dispatch('touchend', { touches: [] });
  await page.settle();
  assert.equal(getSetting('padSize'), want);
  await setLevel('regular');
});
