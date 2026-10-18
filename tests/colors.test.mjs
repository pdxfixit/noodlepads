// Text must stay readable (WCAG AA, 4.5:1 for normal text) on every color it
// can land on. The pairs below are the text/background combinations in
// styles.css; the colors come from styles.css, boards.json and model.js so
// the test follows them when they change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio, blend, mix } from '../web/contrast.js';
import { PERSON_COLORS } from '../web/model.js';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const boards = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8'));

// A custom property from :root, as #RRGGBB.
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `--${name} is a hex color in :root`);
  return m[1];
};

const WHITE = '#FFFFFF';
const INK = token('ink');
const PAPER = token('paper');
const CHALK = token('chalk');
const MUTED = token('muted');
const LED = token('led');
const RECORD = token('record');
const DANGER = css.match(/\.danger\s*\{\s*color:\s*(#[0-9a-fA-F]{6})/)[1];
const DANGER_BG = css.match(/\.sheet-error\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/)[1];
const DANGER_INK = css.match(/\.sheet-error\s*\{[^}]*color:\s*(#[0-9a-fA-F]{6})/)[1];

// Every color a board can have: boards.json's people and the choices in the People dialog.
const BOARDS = [...new Set([...boards.people.map((p) => p.color), ...PERSON_COLORS].map((c) => c.toUpperCase()))];
// The recessed pad bed under the pads: the board color at 24% over near-black (see --bed).
const bedOf = (board) => mix(board, 24, '#141318');

const check = (what, fg, bg, min = 4.5) => {
  const ratio = contrastRatio(fg, bg);
  assert.ok(ratio >= min, `${what}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
};

test('the board colors cover every person', () => {
  assert.ok(BOARDS.length >= 10);
});

test('pad text (ink) reads on every palette color, and on the grey of a pad that failed to load', () => {
  for (const [name, hex] of Object.entries(boards.palette)) check(`pad ${name}`, INK, hex);
  check('broken pad', INK, '#D9D6E3');
  check('broken pad (stripe)', INK, '#C9C5D6');
});

// The page's pattern: the board lightened toward white (--backdrop-ink).
const BACKDROP_WHITE = Number(css.match(/--backdrop-ink:\s*color-mix\(in srgb, var\(--board\) (\d+)%, white\)/)?.[1]);

test('white on the casing reads across the page\'s pattern too: title, version, how-to', () => {
  assert.ok(BACKDROP_WHITE > 0 && BACKDROP_WHITE < 100, '--backdrop-ink mixes the board with white');
  for (const board of BOARDS) check('text on the pattern', WHITE, mix(board, BACKDROP_WHITE, WHITE));
});

test('white reads on every board: title, people keys, toolbar, edit tools, chips', () => {
  for (const board of BOARDS) {
    check('title on the casing', WHITE, board);
    check('people key', WHITE, board);
    check('chip on the casing', WHITE, board);
    check('voice/bars/dark chip selected', WHITE, board);
  }
});

test('white reads on the pad bed of every board: notices, the hint, toolbar keys, "New sound"', () => {
  for (const board of BOARDS) check('on the bed', WHITE, bedOf(board));
});

test('the small version label (white, faded) reads on every board', () => {
  const opacity = Number(css.match(/\.version\s*\{[^}]*opacity:\s*([\d.]+)/)[1]);
  for (const board of BOARDS) check('version', blend(WHITE, board, opacity), board);
});

test('the dashed "New sound" border and edit tool borders are not the only cue: labels carry the meaning', () => {
  // Borders are decoration here (the text names the control); this just pins
  // the white-at-40% border against the bed so it is at least visible.
  for (const board of BOARDS) check('dashed border', blend(WHITE, bedOf(board), 0.4), bedOf(board), 1.5);
});

test('the current person key and a pressed toolbar key (ink on chalk) read', () => {
  check('current person', INK, CHALK);
  check('pressed tool', INK, CHALK);
});

test('the Play button (ink on the LED yellow) reads', () => {
  check('play', INK, LED);
});

test('dialog text reads: ink and muted text on paper and on chalk', () => {
  check('body', INK, PAPER);
  check('hint', MUTED, PAPER);
  check('beat info on chalk', MUTED, CHALK);
  check('quiet buttons on chalk', INK, CHALK);
});

test('danger text reads on paper, on chalk, and white on a red armed button', () => {
  check('Delete', DANGER, PAPER);
  check('Delete in a beat row', DANGER, CHALK);
  check('armed', WHITE, DANGER);
  check('People dialog armed (red on white)', DANGER, WHITE);
  check('error banner', DANGER_INK, DANGER_BG);
});

test('the Record button label (white on record red) reads', () => {
  check('record', WHITE, RECORD);
});

test('on a person\'s row in the People dialog, white text and the white-on-ink "Hidden" badge read', () => {
  for (const board of BOARDS) check('person row', WHITE, board);
  check('badge', WHITE, INK);
});

// 🎧 From a song (listen-ui.js): the blue card, the dark listening sheet with
// its chips, legend and labels, the yellow tempo line, and the first choice's
// light blue.
test('🎧 From a song\'s words read: on the blue card, the night sheet, the tempo line and the picked choice', () => {
  const BLUE = token('listen-blue');
  const NIGHT = token('listen-night');
  check('card name, letters, ▶', WHITE, BLUE);
  check('card line', CHALK, BLUE);
  check('Listen', INK, LED);
  check('listening: title, chips, tempo', WHITE, NIGHT);
  check('listening: labels, legend, row sound', CHALK, NIGHT);
  check('the chip playing now, the tempo line', INK, LED);
  check('■ Stop', WHITE, RECORD);
  const PICKED = css.match(/\.listen-source:first-child\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/)[1];
  check('the first choice', INK, PICKED);
  check('the first choice\'s line', MUTED, PICKED);
  const err = css.match(/\.listen-error\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6});\s*color:\s*(#[0-9a-fA-F]{6})/);
  check('a problem starting', err[2], err[1]);
});

// The rolling bars' oldest line fades as it rolls off: a hit that fits must
// still look brighter than a one-off, for the kick and snare's blue and the
// hats' teal. (At 0.55 a faded fit was the one-off's color.)
test('🎧 the oldest rolling bar fades, but a hit that fits there still outshines a one-off', () => {
  const NIGHT = token('listen-night');
  const fade = Math.round(Number(css.match(/\.listen-line\.oldest\s*\{\s*opacity:\s*([\d.]+)/)[1]) * 100);
  for (const [fit, odd] of [['listen-fit', 'listen-odd'], ['listen-hat-fit', 'listen-hat-odd']]) {
    check(`faded ${fit} beside ${odd}`, mix(token(fit), fade, NIGHT), token(odd), 1.75);
  }
});
