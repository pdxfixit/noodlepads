// Trim and chop in the sound sheet (chop.js), driven through the real app on
// the stand-in page. Nothing is heard: audio.start is replaced by a recorder,
// and the sound is a generated buffer of three blips with quiet between.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { FakeAudioBuffer, FakeOfflineAudioContext, fakeBuffer } from './helpers.mjs';

let page;
let $;
let audio;
let state;
let setSetting;
const started = [];

const RATE = 8000;
// Three blips (0.2 s each) starting at 0.3, 0.9 and 1.5 s, in 2 s of quiet.
const recording = (() => {
  const d = new Array(2 * RATE).fill(0);
  for (const at of [0.3, 0.9, 1.5]) for (let i = 0; i < 0.2 * RATE; i++) d[Math.round(at * RATE) + i] = Math.sin(i / 2) * 0.5;
  return fakeBuffer([d], RATE);
})();

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
  ({ state } = await import('../web/state.js'));
  ({ setSetting } = await import('../web/settings.js'));
  audio.start = (id, { buffer }) => { started.push([id, buffer]); };
  audio.stop = () => {};
  audio.decoded = async () => recording;   // every sound's stored audio, untrimmed
});

const pads = () => $('#pads').querySelectorAll('.pad').filter((c) => c.dataset.id);   // in Edit sounds each sits in a cell with its badges
const handles = () => $('#wave-marks').children;
const at = () => handles().map((h) => Number(h.getAttribute('aria-valuenow')));

// Opens the editor for the first pad, its voices starting from the recording
// with the quiet ends taken off, as the app does.
async function openEditor() {
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[0];
  audio.forget(pad.dataset.id);
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#sheet').open, true);
  started.length = 0;
  return pad.dataset.id;
}

test('trim and chop are Advanced: hidden until the switch is on', async () => {
  await setSetting('advancedBeats', false);
  await openEditor();
  assert.equal($('#cut').hidden, false, 'the row shows for 👂 Plain');
  assert.equal($('#trim-btn').hidden, true);
  assert.equal($('#chop-btn').hidden, true);
  await setSetting('advancedBeats', true);
  assert.equal($('#trim-btn').hidden, false, 'shows at once when switched on');
  assert.equal($('#chop-btn').hidden, false);
  assert.equal($('#cut-panel').hidden, true, 'just the buttons to start');
  $('#sheet').close();
});

test('trim: handles start where the quiet was cut, keys move them, Undo steps back, and Save keeps the trim', async () => {
  await setSetting('advancedBeats', true);
  const id = await openEditor();
  $('#trim-btn').dispatch('click');
  await page.settle();
  assert.equal($('#cut-panel').hidden, false);
  assert.deepEqual(handles().map((h) => h.getAttribute('aria-label')), ['Start', 'End']);
  assert.deepEqual(at(), [0.27, 1.73], 'the automatic trim: 30 ms before the first blip, after the last');
  assert.equal($('#cut-undo').disabled, true);

  // Shift+→ three times moves the start 0.3 s in; letting go keeps it and plays what is kept.
  const start = handles()[0];
  for (let i = 0; i < 3; i++) start.dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  assert.equal(handles()[0], start, 'the same handle, so it keeps the focus');
  start.dispatch('keyup', { key: 'ArrowRight' });
  await page.settle();
  assert.deepEqual(at(), [0.57, 1.73]);
  assert.ok(started.some(([what, buffer]) => what === 'preview' && Math.abs(buffer.duration - 1.16) < 0.01), 'plays the kept part');
  assert.equal($('#cut-undo').disabled, false);

  $('#cut-undo').dispatch('click');
  await page.settle();
  assert.deepEqual(at(), [0.27, 1.73], 'Undo');
  $('#cut-all').dispatch('click');
  await page.settle();
  assert.deepEqual(at(), [0, 2], 'All of it');
  assert.equal($('#cut-all').disabled, true);
  $('#cut-done').dispatch('click');
  await page.settle();
  assert.equal($('#cut-panel').hidden, true);

  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.deepEqual(saved.trim, { start: 0, end: 2 });
  assert.equal((await audio.original({ id, trim: saved.trim })).duration, 2, 'the pad plays all of it now');
});

test('trim: Undo steps back no further than the trim the sheet opened with', async () => {
  await setSetting('advancedBeats', true);
  const id = await openEditor();   // trimmed to all of it by the last test
  $('#trim-btn').dispatch('click');
  await page.settle();
  assert.deepEqual(at(), [0, 2], 'opens on the saved trim');
  const end = handles()[1];
  end.dispatch('keydown', { key: 'ArrowLeft' });
  end.dispatch('keyup', { key: 'ArrowLeft' });
  await page.settle();
  assert.deepEqual(at(), [0, 1.99]);
  $('#cut-undo').dispatch('click');
  await page.settle();
  assert.deepEqual(at(), [0, 2]);
  assert.equal($('#cut-undo').disabled, true);
  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.deepEqual(saved.trim, { start: 0, end: 2 }, 'still the trim it opened with');
});

test('a voice tapped while trimming goes back to the voiced wave, keeping the trim', async () => {
  await setSetting('advancedBeats', true);
  await openEditor();
  $('#trim-btn').dispatch('click');
  await page.settle();
  $('#voices').children.find((b) => b.dataset.preset === 'chipmunk').dispatch('click');
  await page.settle();
  assert.equal($('#cut-panel').hidden, true);
  assert.equal($('#wave-marks').hidden, true);
  $('#sheet').close();
});

test('chop: marks where each blip starts; add, pick and remove marks; Make pads names them as family', async () => {
  await setSetting('advancedBeats', true);
  const before = state.userClips.length;
  // The sound is all of the recording (the trim saved above), so the quiet
  // before the first blip is a piece too.
  const id = await openEditor();
  $('#chop-btn').dispatch('click');
  await page.settle();
  assert.equal($('#cut-panel').hidden, false);
  assert.deepEqual(at(), [0.29, 0.89, 1.49], 'a cut just before each blip');
  assert.equal($('#cut-make').textContent, '🧩 Make 4 pads');
  assert.equal($('#cut-remove').disabled, true, 'nothing picked yet');

  $('#cut-add').dispatch('click');
  assert.equal(handles().length, 4);
  assert.equal($('#cut-make').textContent, '🧩 Make 5 pads');
  assert.equal($('#cut-remove').disabled, false, 'a new mark is picked');
  $('#cut-remove').dispatch('click');
  assert.equal(handles().length, 3);
  handles()[0].dispatch('keydown', { key: 'Delete' });
  assert.deepEqual(at(), [0.89, 1.49], 'Delete removes a mark too');
  assert.equal($('#cut-make').textContent, '🧩 Make 3 pads');

  $('#cut-make').dispatch('click');
  await page.settle();
  const made = state.userClips.slice(before);
  assert.equal(made.length, 3);
  for (const c of made) {
    assert.deepEqual(c.from, { id, how: 'chop' });
    assert.equal(c.mime, 'audio/wav');
    assert.equal(c.voice, 'normal');
    assert.ok(c.label.length <= 24);
  }
  assert.equal(new Set(made.map((c) => c.label)).size, 3, 'no name twice');
  assert.equal($('#cut-panel').hidden, true);
  assert.match($('#cut-from').textContent, /3 new pads/);
  assert.ok(pads().some((p) => p.dataset.id === made[0].id), 'the new pads are on the board');
  $('#sheet').close();
});

test('a chopped pad says where it came from', async () => {
  const piece = state.userClips.at(-1);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads().find((p) => p.dataset.id === piece.id);
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  assert.equal($('#cut-from').hidden, false);
  assert.match($('#cut-from').textContent, /^🧩 Chopped from “.+”$/);
  $('#sheet').close();
});

test('trim: Undo all the way back is the automatic trim again, and saves no trim', async () => {
  await setSetting('advancedBeats', true);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[1];
  const id = pad.dataset.id;
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  $('#trim-btn').dispatch('click');
  await page.settle();
  const start = handles()[0];
  start.dispatch('keydown', { key: 'ArrowRight' });
  start.dispatch('keyup', { key: 'ArrowRight' });
  await page.settle();
  $('#cut-undo').dispatch('click');
  await page.settle();
  assert.deepEqual(at(), [0.27, 1.73]);
  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.ok(!saved?.trim, 'no trim stored');
});

// ── The wave editor: Fades and Select part, on the trim's wave ──

const view = (name) => $('#cut-views').children.find((b) => b.dataset.view === name);
const edit = (name) => $('#cut-edits').children.find((b) => b.dataset.edit === name);

test('wave editor: pick a part, make it louder (twice is one edit) and backwards, Undo, fade in, keep only the part; Save stores it all', async () => {
  await setSetting('advancedBeats', true);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[2];
  const id = pad.dataset.id;
  audio.forget(id);
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  $('#trim-btn').dispatch('click');
  await page.settle();
  assert.equal($('#cut-edits').hidden, true, 'the changes show only in Select part');
  assert.equal(view('ends').getAttribute('aria-pressed'), 'true');

  view('part').dispatch('click');
  assert.equal($('#cut-edits').hidden, false);
  assert.deepEqual(handles().map((h) => h.getAttribute('aria-label')), ['Part starts', 'Part ends']);
  assert.deepEqual(at(), [0.757, 1.243], 'the middle third of what is kept');
  assert.equal(edit('keep').disabled, false);

  started.length = 0;
  edit('louder').dispatch('click');
  await page.settle();
  edit('louder').dispatch('click');
  await page.settle();
  assert.ok(started.some(([what, buffer]) => what === 'preview' && Math.abs(buffer.duration - 1.46) < 0.01), 'hears the part with up to half a second either side, inside what is kept');
  edit('reverse').dispatch('click');
  await page.settle();
  $('#cut-undo').dispatch('click');   // takes Backwards off again
  await page.settle();

  view('fades').dispatch('click');
  assert.deepEqual(handles().map((h) => h.getAttribute('aria-label')), ['Fade in until', 'Fade out from']);
  assert.deepEqual(at(), [0.27, 1.73], 'no fade yet: on the ends');
  assert.equal($('#cut-nofade').hidden, false);
  assert.equal($('#cut-nofade').disabled, true);
  const fin = handles()[0];
  for (let i = 0; i < 2; i++) fin.dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  fin.dispatch('keyup', { key: 'ArrowRight' });
  await page.settle();
  assert.deepEqual(at(), [0.47, 1.73]);
  assert.match($('#cut-hint').textContent, /Fades in over 0\.20 seconds/);

  view('part').dispatch('click');
  edit('keep').dispatch('click');
  await page.settle();
  assert.equal(view('ends').getAttribute('aria-pressed'), 'true', 'back to the ends, now around the part');
  assert.deepEqual(at(), [0.757, 1.243]);
  $('#cut-done').dispatch('click');
  await page.settle();

  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.deepEqual(saved.trim, { start: 0.757, end: 1.243 });
  assert.deepEqual(saved.edits, [{ kind: 'gain', start: 0.757, end: 1.243, amount: 4 }]);
  assert.deepEqual(saved.fade, { in: 0.2, out: 0 });
  const kept = await audio.original({ id, ...saved });
  assert.ok(Math.abs(kept.duration - 0.486) < 0.001);
  assert.equal(kept.getChannelData(0)[0], 0, 'fades in from silence');
  assert.equal(recording.getChannelData(0)[Math.round(0.95 * RATE)], Math.fround(Math.sin(0.05 * RATE / 2) * 0.5), 'the recording itself is unchanged');
});

// The trim editor builds the kept audio (chop.js rebuild) the way the pad does
// (audio.js keptAudio): 👂 Plain after Louder, Backwards, a fade and a trim
// plays what the pad plays once it is saved, sample for sample.
test('wave editor: what 👂 Plain plays after edits, a fade and a trim is what the saved pad plays', async () => {
  const { applyChain } = await import('../web/voices.js');
  await setSetting('advancedBeats', true);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[3];
  const id = pad.dataset.id;
  audio.forget(id);
  pad.parent.querySelector('[data-edit]').dispatch('click');
  await page.settle();
  $('#trim-btn').dispatch('click');
  await page.settle();
  view('part').dispatch('click');
  edit('louder').dispatch('click');
  await page.settle();
  edit('louder').dispatch('click');
  await page.settle();
  view('fades').dispatch('click');
  const fin = handles()[0];
  for (let i = 0; i < 2; i++) fin.dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  fin.dispatch('keyup', { key: 'ArrowRight' });
  await page.settle();
  view('part').dispatch('click');
  edit('keep').dispatch('click');
  await page.settle();
  $('#cut-done').dispatch('click');
  await page.settle();
  $('#voices').children.find((b) => b.dataset.preset === 'chipmunk').dispatch('click');   // 👂 Plain needs a voice on
  await page.settle();
  started.length = 0;
  $('#plain-btn').dispatch('click');
  await page.settle();
  const plain = started.filter(([what]) => what === 'preview-original').at(-1)?.[1];
  assert.ok(plain, '👂 Plain played');
  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.ok(saved.edits?.length && saved.fade && saved.trim, 'edits, a fade and a trim were kept');
  const padPlays = (await applyChain(await audio.original({ id, ...saved }), [], null, saved.level)).buffer;
  assert.equal(plain.length, padPlays.length);
  const a = plain.getChannelData(0), b = padPlays.getChannelData(0);
  let most = 0, peak = 0;
  for (let i = 0; i < a.length; i++) { most = Math.max(most, Math.abs(a[i] - b[i])); peak = Math.max(peak, Math.abs(a[i])); }
  assert.ok(peak > 0.1, 'there is sound to compare');
  assert.ok(most < 1e-6, `sample for sample (${most})`);
  state.overrides.delete(id);   // the next test starts from a pad as it was
  audio.forget(id);
});

test('wave editor: Undo walks back through edits and fades to how the sheet opened; Save then stores none', async () => {
  await setSetting('advancedBeats', true);
  if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
  const pad = pads()[3];
  const id = pad.dataset.id;
  pad.parent.querySelector('[data-edit]').dispatch('click');   // ✏️ opens its sheet
  await page.settle();
  $('#trim-btn').dispatch('click');
  await page.settle();
  view('part').dispatch('click');
  edit('silence').dispatch('click');
  await page.settle();
  view('fades').dispatch('click');
  const fout = handles()[1];
  fout.dispatch('keydown', { key: 'ArrowLeft', shiftKey: true });
  fout.dispatch('keyup', { key: 'ArrowLeft' });
  await page.settle();
  assert.equal($('#cut-nofade').disabled, false);
  $('#cut-undo').dispatch('click');
  await page.settle();
  $('#cut-undo').dispatch('click');
  await page.settle();
  assert.equal($('#cut-undo').disabled, true);
  $('#save-btn').closest('form').dispatch('submit');
  await page.settle();
  const saved = state.overrides.get(id) ?? state.userClips.find((c) => c.id === id);
  assert.ok(!saved?.edits && !saved?.fade, JSON.stringify(saved));
});

// ── 🔊 Even it out: on a kid's own sound only ──

test('🔊 Even it out: presets never show it; a quiet recording of a kid\'s own comes out as loud as the presets, once, and Undo takes it back', async () => {
  const { loudness, PRESET_LOUDNESS } = await import('../web/loudness.js');
  const { currentPerson } = await import('../web/board.js');
  const { renderPads } = await import('../web/pads.js');
  // Regular, not Advanced: it is on the sheet for everyone (Ben, 2026-10-18).
  await setSetting('advancedBeats', false);

  // A preset: no Even it out.
  await openEditor();
  assert.equal($('#cut-even').hidden, true, 'presets never offer it');
  $('#sheet').close();

  // A kid's own recording: quiet talking (a soft hum) with one loud clap, which sets the peak.
  const d = Array.from({ length: 2 * RATE }, (_, i) => 0.06 * Math.sin(2 * Math.PI * 300 * i / RATE));
  for (let i = 0; i < 0.03 * RATE; i++) d[RATE + i] += 0.87 * Math.sin(2 * Math.PI * 1500 * i / RATE) * Math.exp(-i / (0.003 * RATE));
  const quiet = fakeBuffer([d], RATE);
  const clip = { id: 'user-even-1', personId: currentPerson().id, label: 'Hum', emoji: '🐝', color: 'red', created: 1, blob: new Blob(['x']), mime: 'audio/webm', voice: 'normal' };
  state.userClips.push(clip);
  renderPads();
  const decoded = audio.decoded;
  audio.decoded = async (c) => (c?.id === clip.id ? quiet : recording);
  try {
    if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
    audio.forget(clip.id);
    pads().find((p) => p.dataset.id === clip.id).parent.querySelector('[data-edit]').dispatch('click');
    await page.settle();
    assert.equal($('#trim-btn').hidden, true, 'the trim editor is Advanced');
    assert.equal($('#cut-even').hidden, false, 'a kid\'s own sound has it, on the sheet');

    $('#cut-even').dispatch('click');
    await page.settle();
    assert.match($('#banner-text').textContent, /Evened out/);
    $('#banner-action').dispatch('click');   // ↩️ Undo in the banner
    await page.settle();
    $('#cut-even').dispatch('click');
    await page.settle();
    assert.match($('#banner-text').textContent, /Evened out/, 'Undo took it back, so it evens out again');
    $('#cut-even').dispatch('click');   // again: already even, nothing added
    await page.settle();
    assert.match($('#banner-text').textContent, /already even/);
    $('#save-btn').closest('form').dispatch('submit');
    await page.settle();

    const saved = state.userClips.find((c) => c.id === clip.id);
    assert.equal(saved.edits.length, 1);
    const [e] = saved.edits;
    assert.deepEqual([e.kind, e.start, e.end], ['gain', 0, 2], 'over the whole recording');
    assert.ok(e.amount > 1 && e.amount < 8, `turned up: ${e.amount}`);
    // What the voices start from, held under full scale as they play it, seems as loud as the presets.
    audio.forget(clip.id);
    const kept = await audio.original({ ...saved });
    assert.equal(kept.keepLevel, true);
    const before = loudness(quiet);   // its peak is already 0.9, as it played before
    const after = loudness(kept, { limit: true });
    assert.ok(before < PRESET_LOUDNESS - 6, `it started quiet: ${before}`);
    assert.ok(Math.abs(after - PRESET_LOUDNESS) < 0.5, `${after} vs ${PRESET_LOUDNESS}`);
  } finally {
    audio.decoded = decoded;
    if ($('#sheet').open) $('#sheet').close();
    state.userClips = state.userClips.filter((c) => c.id !== clip.id);
    renderPads();
  }
});

// A made sound remade in its sheet (another ✨ starter, or its sliders) is
// new audio before it is saved: 🔊 Even it out, and Trim and edit, work on
// that, never on the sound as it was stored.
test('🔊 Even it out on a ✨ sound just remade works on the new sound, not the stored one', async () => {
  const { currentPerson } = await import('../web/board.js');
  const { renderPads } = await import('../web/pads.js');
  const { RATE: SYNTH_RATE } = await import('../web/synth.js');
  await setSetting('advancedBeats', false);
  const clip = { id: 'user-remade-1', personId: currentPerson().id, label: 'Zap', emoji: '🔫', color: 'red', created: 1, blob: new Blob(['x']), mime: 'audio/wav', voice: 'normal', synth: { tone: 'buzzy', from: 1600, to: 120, length: 0.35, shape: 'drop', pulses: 1 } };
  state.userClips.push(clip);
  renderPads();
  try {
    if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
    audio.forget(clip.id);
    pads().find((p) => p.dataset.id === clip.id).parent.querySelector('[data-edit]').dispatch('click');
    await page.settle();
    $('#make-starters').children.find((b) => b.dataset.make === 'wind').dispatch('click');   // remade: not saved yet
    await page.settle();
    started.length = 0;
    $('#cut-even').dispatch('click');
    await page.settle();
    const played = started.find(([id]) => id === 'preview')?.[1];
    assert.ok(played, 'it evens out and plays');
    assert.equal(played.sampleRate, SYNTH_RATE, 'the Wind just made, not the stored recording');
    assert.ok(played.duration > 2, `the Wind is 2.4 s long: ${played.duration}`);
  } finally {
    if ($('#sheet').open) $('#sheet').close();
    state.userClips = state.userClips.filter((c) => c.id !== clip.id);
    renderPads();
  }
});

// Saved, then the page reloaded (audio.forget: decoded again from what was
// stored), a ✨ sound remade and evened out plays exactly as the sheet
// played it before the save.
test('a ✨ sound remade and evened out sounds the same after a reload as in the sheet', async () => {
  const { currentPerson } = await import('../web/board.js');
  const { renderPads } = await import('../web/pads.js');
  const { renderSynth, RATE: SYNTH_RATE } = await import('../web/synth.js');
  await setSetting('advancedBeats', false);
  // What a stored made sound decodes to: its recipe, rendered.
  const made = (recipe) => {
    const samples = renderSynth(recipe, SYNTH_RATE);
    const b = new FakeAudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: SYNTH_RATE });
    b.copyToChannel(samples, 0);
    return b;
  };
  const clip = { id: 'user-reload-1', personId: currentPerson().id, label: 'Zap', emoji: '🔫', color: 'red', created: 1, blob: new Blob(['x']), mime: 'audio/wav', voice: 'normal', synth: { tone: 'buzzy', from: 1600, to: 120, length: 0.35, shape: 'drop', pulses: 1 } };
  state.userClips.push(clip);
  renderPads();
  const decoded = audio.decoded;
  audio.decoded = async (c) => (c?.id === clip.id ? made(c.synth) : recording);
  try {
    if (!document.body.classList.contains('editing')) $('#edit-toggle').dispatch('click');
    audio.forget(clip.id);
    pads().find((p) => p.dataset.id === clip.id).parent.querySelector('[data-edit]').dispatch('click');
    await page.settle();
    $('#make-starters').children.find((b) => b.dataset.make === 'wind').dispatch('click');
    await page.settle();
    $('#cut-even').dispatch('click');
    await page.settle();
    $('#save-btn').closest('form').dispatch('submit');
    await page.settle();
    const saved = { ...state.userClips.find((c) => c.id === clip.id), source: 'user' };
    assert.equal(saved.edits?.[0]?.kind, 'gain', 'evened out');
    const inSheet = await audio.original(saved);
    audio.forget(clip.id);   // a reload
    const reloaded = await audio.original(saved);
    assert.ok(inSheet !== reloaded, 'decoded again');
    assert.equal(reloaded.length, inSheet.length);
    const a = inSheet.getChannelData(0), b = reloaded.getChannelData(0);
    let most = 0;
    for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i] - b[i]));
    assert.ok(most < 1e-6, `sample for sample (${most})`);
  } finally {
    audio.decoded = decoded;
    if ($('#sheet').open) $('#sheet').close();
    state.userClips = state.userClips.filter((c) => c.id !== clip.id);
    renderPads();
  }
});
