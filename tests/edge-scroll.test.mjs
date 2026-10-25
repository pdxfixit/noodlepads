// Beats on a computer (Ben, 2026-10-19): dragging a row a long way scrolls the
// page instead of taking several leaps, and ▶ Play and the rest of the
// control bar stay at the top while the rows scroll, at every width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGE, EDGE_MAX, edgeSpeed, room, edgeScroller } from '../web/edge-scroll.js';

test('edgeSpeed: still in the middle, faster nearer an edge, full speed past it', () => {
  const [top, bottom] = [130, 720];
  assert.equal(edgeSpeed(400, top, bottom), 0);
  assert.equal(edgeSpeed(top + EDGE + 1, top, bottom), 0);
  assert.ok(edgeSpeed(top + EDGE / 2, top, bottom) < 0, 'up near the top');
  assert.ok(edgeSpeed(bottom - EDGE / 2, top, bottom) > 0, 'down near the bottom');
  assert.ok(edgeSpeed(top + 4, top, bottom) < edgeSpeed(top + 40, top, bottom), 'faster nearer the edge');
  assert.equal(edgeSpeed(20, top, bottom), -EDGE_MAX, 'over the stuck bar: full speed up');
  assert.equal(edgeSpeed(790, top, bottom), EDGE_MAX, 'over the toolbar: full speed down');
});

test('edgeSpeed: a short room keeps its middle still', () => {
  assert.equal(edgeSpeed(150, 100, 200), 0);
  assert.ok(edgeSpeed(110, 100, 200) < 0 && edgeSpeed(190, 100, 200) > 0);
});

const box = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom, height: bottom - top }) });

test('room: under the lowest stuck bar in the top half, above the toolbar', () => {
  const doc = {
    querySelectorAll: () => [box(52, 130), box(0, 0), box(600, 680)],   // the stuck bar, a hidden one, one low on the page
    querySelector: () => box(720, 800),
  };
  assert.deepEqual(room(doc, { innerHeight: 800 }), { top: 130, bottom: 720 });
  assert.deepEqual(room({ querySelectorAll: () => [], querySelector: () => null }, { innerHeight: 800 }), { top: 0, bottom: 800 });
});

test('edgeScroller: scrolls each frame while the finger is at an edge, moving the drag along, and stops', () => {
  const frames = [];
  let scrolled = 0, moved = 0;
  const win = {
    innerHeight: 800,
    requestAnimationFrame: (f) => frames.push(f),
    cancelAnimationFrame: () => frames.splice(0),
    scrollBy: (x, y) => { scrolled += y; },
  };
  const doc = { querySelectorAll: () => [box(52, 130)], querySelector: () => box(720, 800) };
  const s = edgeScroller(() => moved++, { win, doc });
  s.at(400);
  assert.equal(frames.length, 0, 'the middle never scrolls');
  s.at(715);
  s.at(716);
  assert.equal(frames.length, 1, 'one loop, however many moves');
  for (let t = 16; t <= 160; t += 16) frames.shift()(t);
  assert.ok(scrolled > 100, `scrolled down ${scrolled} px`);
  assert.ok(moved > 0, 'the dragged row follows the page');
  const down = scrolled;
  s.at(140);
  frames.shift()(176);
  assert.ok(scrolled < down, 'and back up near the top');
  s.stop();
  assert.equal(frames.length, 0, 'stop ends the loop');
});

// The rule sits outside any @media: every width, not only under 900 px.
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const depthAt = (needle) => {
  const at = css.indexOf(needle);
  assert.ok(at >= 0, needle);
  const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '');
  return (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
};

test('the beat control bar sticks under the slim header at every width, Keys off and on', () => {
  const top = 'top: calc(var(--head-h, 0px) - var(--deck-h, 0px));';
  for (const rule of [`.seq .beat-deck { position: sticky; ${top}`, `body.keys-on .dj-bar { position: sticky; ${top}`]) {
    assert.equal(depthAt(rule), 0, `${rule} is in no @media`);
  }
});
