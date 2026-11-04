// web/undo-history.js: the steps behind ↩️ Undo · ↪️ Redo on Beats (ADR 0036).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, LIMIT } from '../web/undo-history.js';

test('a change is one step back; Undo and Redo walk the steps; a new change ends Redo', () => {
  const h = createHistory();
  h.seen('b', 'A');
  assert.deepEqual(h.can('b'), { undo: false, redo: false });
  h.changed('b', 'B');
  h.changed('b', 'C');
  assert.equal(h.undo('b'), 'B');
  assert.equal(h.undo('b'), 'A');
  assert.equal(h.undo('b'), null, 'nothing before the beat as opened');
  assert.equal(h.redo('b'), 'B');
  assert.deepEqual(h.can('b'), { undo: true, redo: true });
  h.changed('b', 'D');
  assert.deepEqual(h.can('b'), { undo: true, redo: false }, 'a new change ends Redo');
  assert.equal(h.undo('b'), 'B');
});

test('a save with nothing changed is no step', () => {
  const h = createHistory();
  h.seen('b', 'A');
  h.changed('b', 'A');
  assert.equal(h.can('b').undo, false);
});

test('each beat keeps its own steps; seeing it again unchanged keeps them, changed elsewhere starts afresh', () => {
  const h = createHistory();
  h.seen('a', 'A1'); h.changed('a', 'A2');
  h.seen('b', 'B1'); h.changed('b', 'B2');
  h.seen('a', 'A2');
  assert.equal(h.undo('a'), 'A1', 'back on beat a: its step is still there');
  h.seen('b', 'B9');
  assert.equal(h.can('b').undo, false, 'beat b changed by a sync: Undo never takes that back');
});

test(`at most ${LIMIT} steps back; the oldest go first`, () => {
  const h = createHistory();
  h.seen('b', 's0');
  for (let i = 1; i <= LIMIT + 10; i++) h.changed('b', `s${i}`);
  let last = null;
  let n = 0;
  for (let s = h.undo('b'); s !== null; s = h.undo('b')) { last = s; n++; }
  assert.equal(n, LIMIT);
  assert.equal(last, 's10');
});

test('a first change with nothing seen is where it starts', () => {
  const h = createHistory();
  h.changed('b', 'A');
  assert.equal(h.can('b').undo, false);
  h.changed('b', 'B');
  assert.equal(h.undo('b'), 'A');
});
