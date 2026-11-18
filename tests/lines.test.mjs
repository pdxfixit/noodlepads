// lines.js: a line of controls stays on one line by taking steps in order
// (tighter, shorter labels, pickers, then a group dropping out), and a group
// of latching keys gets a <select> twin for the picker step.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, FakeElement } from './fake-dom.mjs';

let fitStep;
let fitLine;
let pickerFor;
let sliderStops;
let keysForSlider;
let nudgeSlider;
let nudged;
let showingKeys;
let KEYED_STEPS;

before(async () => {
  installPage();
  ({ fitStep, fitLine, pickerFor, sliderStops, keysForSlider, nudgeSlider, nudged, showingKeys, KEYED_STEPS } = await import('../web/lines.js'));
});

test('fitStep takes the first step that fits, and the last when none does', () => {
  assert.equal(fitStep(4, () => true), 0, 'room to spare: nothing gives way');
  assert.equal(fitStep(4, (n) => n >= 2), 2);
  assert.equal(fitStep(4, () => false), 4, 'never fits: every step taken');
  const tried = [];
  fitStep(5, (n) => { tried.push(n); return n === 1; });
  assert.deepEqual(tried, [0, 1], 'steps are tried in order and stop at the first fit');
});

test('fitLine puts on the classes of the first step that fits, cumulatively', () => {
  const line = new FakeElement('div');
  const classes = ['fit-tight', 'fit-short', 'fit-pick', 'fit-nosig'];
  // Each class on the line takes 50 px off a 400 px line, in a 300 px box.
  Object.defineProperty(line, 'clientWidth', { get: () => 300 });
  Object.defineProperty(line, 'scrollWidth', { get: () => 400 - 50 * classes.filter((c) => line.classList.contains(c)).length });
  fitLine(line, classes);
  assert.deepEqual(classes.map((c) => line.classList.contains(c)), [true, true, false, false]);
});

test('fitLine counts a key overflowing inside its own box as not fitting', () => {
  const line = new FakeElement('div');
  const key = new FakeElement('button');
  line.append(key);
  Object.defineProperty(line, 'clientWidth', { get: () => 300 });
  Object.defineProperty(line, 'scrollWidth', { get: () => 300 });
  Object.defineProperty(key, 'clientWidth', { get: () => 100 });
  Object.defineProperty(key, 'scrollWidth', { get: () => (line.classList.contains('fit-stack') ? 100 : 160) });
  fitLine(line, ['fit-stack']);
  assert.equal(line.classList.contains('fit-stack'), true);
});

// A text field scrolls its own text: a long beat name in a short box must not
// push the beat bar onto its phone lines on a wide screen.
test('fitLine never counts a text field\'s own long text as the line not fitting', () => {
  const line = new FakeElement('div');
  const name = new FakeElement('input');
  line.append(name);
  Object.defineProperty(line, 'clientWidth', { get: () => 600 });
  Object.defineProperty(line, 'scrollWidth', { get: () => 600 });
  Object.defineProperty(name, 'clientWidth', { get: () => 120 });
  Object.defineProperty(name, 'scrollWidth', { get: () => 250 });
  fitLine(line, ['fit-split']);
  assert.equal(line.classList.contains('fit-split'), false);
});

test('fitLine leaves a hidden line alone: it is fitted when it shows', () => {
  const line = new FakeElement('div');
  Object.defineProperty(line, 'clientWidth', { get: () => 0 });
  Object.defineProperty(line, 'scrollWidth', { get: () => 999 });
  fitLine(line, ['fit-tight']);
  assert.equal(line.classList.contains('fit-tight'), false);
});

test('pickerFor mirrors the pressed key and presses the key a choice names', () => {
  const group = new FakeElement('div');
  const keys = ['4/4', '3/4', '6/8'].map((sig, i) => {
    const b = new FakeElement('button');
    b.dataset.sig = sig;
    b.textContent = sig;
    b.setAttribute('aria-pressed', String(i === 0));
    return b;
  });
  for (const b of keys) b.addEventListener('click', () => { for (const k of keys) k.setAttribute('aria-pressed', String(k === b)); });
  group.append(...keys);
  const select = new FakeElement('select');
  const sync = pickerFor(group, select);
  assert.deepEqual(select.children.map((o) => [o.value, o.textContent]), [['4/4', '4/4'], ['3/4', '3/4'], ['6/8', '6/8']]);
  assert.equal(select.value, '4/4', 'shows the pressed key');
  select.value = '6/8';
  select.dispatch('change');
  assert.equal(keys[2].getAttribute('aria-pressed'), 'true', 'a choice presses its key');
  keys[1].click();
  sync();
  assert.equal(select.value, '3/4', 'and follows a key pressed elsewhere');
});

test('sliderStops lists a few stops, and gives up past five or off the step', () => {
  assert.deepEqual(sliderStops(0, 2, 1), [0, 1, 2]);
  assert.deepEqual(sliderStops(1, 5, 1), [1, 2, 3, 4, 5]);
  assert.equal(sliderStops(1, 6, 1), null, '6 stops: a slider');
  assert.deepEqual(sliderStops(0, 1, 0.25), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(sliderStops(-12, 12, 1), null, '25 stops: a slider');
  assert.equal(sliderStops(0.05, 3, 0.05), null);
  assert.equal(sliderStops(0, 1, 0.3), null, 'the step misses the end');
  assert.equal(sliderStops(5, 5, 1), null, 'one stop is no choice');
});

// A slider in its row, as the sheet has them.
function sliderRow(min, max, step, value) {
  const row = new FakeElement('div');
  const name = new FakeElement('span');
  name.textContent = 'Tone';
  const input = new FakeElement('input');
  Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(value) });
  row.append(name, input, new FakeElement('output'));
  return { row, input };
}

test('keysForSlider: one key per stop, the pressed one following the slider; a key moves it and sends input then change', () => {
  const { row, input } = sliderRow(0, 2, 1, 1);
  const heard = [];
  input.addEventListener('input', () => heard.push(['input', input.value]));
  input.addEventListener('change', () => heard.push(['change', input.value]));
  const sync = keysForSlider(input, (v) => ['Smooth', 'Buzzy', 'Hiss'][v]);
  const group = row.querySelector('.slider-keys');
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-label'), 'Tone', 'named for its row');
  assert.ok(row.classList.contains('keyed'));
  assert.equal(row.children.indexOf(group), row.children.indexOf(input) + 1, 'right after the slider');
  const keys = group.children;
  assert.deepEqual(keys.map((b) => b.textContent), ['Smooth', 'Buzzy', 'Hiss']);
  const pressed = () => keys.map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(pressed(), ['false', 'true', 'false']);
  keys[2].click();
  assert.equal(input.value, '2');
  assert.deepEqual(heard, [['input', '2'], ['change', '2']]);
  assert.deepEqual(pressed(), ['false', 'false', 'true']);
  keys[2].click();
  assert.equal(heard.length, 2, 'the pressed key does nothing again');
  input.value = '0';
  input.disabled = true;
  sync();
  assert.deepEqual(pressed(), ['true', 'false', 'false'], 'code that sets the slider syncs the keys');
  assert.ok(keys.every((b) => b.disabled), 'and a disabled slider disables them');
  keys[1].click();
  assert.equal(input.value, '0', 'a disabled key does nothing');
});

test('keysForSlider again replaces the keys, or takes them away for a slider with many stops', () => {
  const { row, input } = sliderRow(1, 5, 1, 5);
  keysForSlider(input);
  assert.equal(row.querySelector('.slider-keys').children.length, 5);
  Object.assign(input, { min: '1.2', max: '4', step: '0.1' });
  assert.equal(keysForSlider(input), null);
  assert.equal(row.querySelector('.slider-keys'), null);
  assert.equal(row.classList.contains('keyed'), false);
});

test('a keyed row falls back to its slider when the keys do not fit', () => {
  const { row, input } = sliderRow(1, 5, 1, 3);
  keysForSlider(input);
  Object.defineProperty(row, 'clientWidth', { get: () => 300 });
  // Five keys are 380 px wide, 330 tightened; the slider fits.
  Object.defineProperty(row, 'scrollWidth', { get: () => (row.classList.contains('fit-slider') ? 300 : row.classList.contains('fit-tight') ? 330 : 380) });
  assert.equal(showingKeys(row), true);
  fitLine(row, KEYED_STEPS);
  assert.equal(row.classList.contains('fit-slider'), true);
  assert.equal(showingKeys(row), false, 'the slider shows, so its events are drags');
});

// Ben, 2026-11-18: every Layers slider gets − and + (lines.js nudgeSlider).
test('nudgeSlider: − before the slider and + after it, named for it; a tap moves one notch, marked, and stops at the ends', () => {
  const { row, input } = sliderRow(-2, 2, 1, 1);
  input.setAttribute('aria-label', 'Pitch');
  const heard = [];
  for (const type of ['input', 'change']) input.addEventListener(type, (e) => heard.push([type, input.value, e.nudge]));
  const sync = nudgeSlider(input);
  const [down, up] = [row.querySelector('[data-nudge="-1"]'), row.querySelector('[data-nudge="1"]')];
  assert.ok(row.classList.contains('nudged'));
  assert.equal(row.children.indexOf(down), row.children.indexOf(input) - 1, '− right before the slider');
  assert.equal(row.children.indexOf(up), row.children.indexOf(input) + 1, '+ right after it');
  assert.deepEqual([down.textContent, up.textContent], ['−', '+']);
  assert.deepEqual([down.getAttribute('aria-label'), up.getAttribute('aria-label')], ['Pitch: down one', 'Pitch: up one']);
  up.click();
  assert.equal(input.value, '2');
  assert.deepEqual(heard, [['input', '2', true], ['change', '2', true]], 'input then change, each marked as a tap');
  assert.equal(up.disabled, true, 'faint at the top');
  up.click();
  assert.equal(input.value, '2', 'and does nothing there');
  for (let i = 0; i < 4; i++) down.click();
  assert.equal(input.value, '-2');
  assert.equal(down.disabled, true, 'faint at the bottom');
  input.value = '0';
  input.disabled = true;
  sync();
  assert.ok(down.disabled && up.disabled, 'a disabled slider disables both');
  nudgeSlider(input);
  assert.equal(row.querySelectorAll('.slider-nudge').length, 2, 'run again, it replaces the two');
});

// Ben, 2026-11-18: a ratio slider steps a semitone a tap, on a grid from normal.
test('nudgeSlider: a ratio slider steps a semitone a tap; 12 taps are an octave, with no drift', () => {
  const { input } = sliderRow(Math.log2(0.05), 3, 0.01, 0);
  nudgeSlider(input, { notch: 1 / 12 });
  const up = input.parent.querySelector('[data-nudge="1"]');
  for (let i = 0; i < 12; i++) {
    up.click();
    assert.ok(Math.abs(Number(input.value) - (i + 1) / 12) < 0.006, `tap ${i + 1} lands within a step of its semitone: ${input.value}`);
  }
  assert.equal(Math.round(Number(input.value) * 12), 12, 'an octave up');
  input.value = '0.37';   // a drag between semitones
  input.parent.querySelector('[data-nudge="-1"]').click();
  assert.ok(Math.abs(Number(input.value) - 3 / 12) < 0.006, 'down to the semitone below the nearest one');
});

test('nudged: one notch along, landed on a step from min, kept within the ends', () => {
  const range = { min: -4.3, max: 3, step: 0.1 };
  assert.equal(nudged(0, 1, range), 0.1);
  assert.equal(nudged(0, -1, range), -0.1);
  assert.equal(nudged(2.95, 1, range), 3, 'never past max');
  assert.equal(nudged(-4.3, -1, range), -4.3, 'never past min');
  assert.equal(nudged(0, 1, { min: -4.32, max: 3, step: 0.01, notch: 1 / 12 }), 0.08, 'a semitone, held on the nearest step');
  assert.equal(nudged(0.08, 1, { min: -4.32, max: 3, step: 0.01, notch: 1 / 12 }), 0.17, 'the next tap finds its semitone again');
  assert.equal(nudged(1, 1, { min: 0, max: 8, step: 1 }), 2);
});
