// Picking pills and sliding them along their rows (Ben, 2026-10-17), so a
// beat that starts on pill 3 can be put back on pill 1, all its rows in
// step, or one part of it moved. Pure: lists in, lists out. pill-select.js
// wires the gestures (a mouse, or a finger while ⇆ locks the pills); this
// file decides what a pick is and what a slide does.
//
// A pick is a Set of pill keys, "row:pill" (pillKey): a box drawn across
// pills, single pills, every lit pill, or Invert of those.
// A slide moves every picked pill `d` pills along its own row (sideways
// only, so each keeps its sound), round the end of the beat (`total` pills),
// since beats loop: nothing is lost, and sliding back undoes it. Where a
// picked pill lands it replaces what was there; where it left goes empty.
// With every pill of a row picked, that is the row turned round.

export const pillKey = (row, step) => `${row}:${step}`;
export const fromKey = (key) => key.split(':').map(Number);
const wrap = (s, total) => ((s % total) + total) % total;
const span = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => Math.min(a, b) + k);

// Every pill of rows `rows` × pills `steps`.
export const pillsOf = (rows, steps) => new Set(rows.flatMap((r) => steps.map((s) => pillKey(r, s))));
// The whole beat: every pill of `count` rows, `total` pills each.
const upTo = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
export const pickAll = (count, total) => pillsOf(upTo(count), upTo(total));
// What a drag paints: the rows and pills from where it started to where the
// finger is, as a rectangle, whichever way it went.
export const section = (r0, s0, r1, s1) => pillsOf(span(r0, r1), span(s0, s1));
// The pick moved along with its pills.
export const shiftPick = (pick, d, total) => new Set([...pick].map((k) => { const [r, s] = fromKey(k); return pillKey(r, wrap(s + d, total)); }));

// The rows after sliding the picked pills `d` along, round `total` pills.
// New row objects; the old ones are left as they were (for Undo). A plain
// row moves its pills with their loud hits (and an old melody row's
// per-pill notes); pills past `total` (kept from a longer shape) stay put.
// A tune row (ADR 0023) moves the notes that start in a picked pill, the
// half-pill ones with them, and drops the notes starting where they land;
// its pills are worked out again from its notes by the caller (cleanRow).
export function slideRows(rows, pick, d, total) {
  const byRow = new Map();
  for (const k of pick) {
    const [r, s] = fromKey(k);
    if (r < rows.length && s < total) (byRow.get(r) ?? byRow.set(r, new Set()).get(r)).add(s);
  }
  return rows.map((row, r) => {
    const from = byRow.get(r);
    if (!from?.size || wrap(d, total) === 0) return row;
    const to = new Set([...from].map((s) => wrap(s + d, total)));
    if (row.melody) {
      const tune = (row.tune ?? []).flatMap((n) => {
        const s = Math.floor(n.s);
        if (from.has(s)) return [{ ...n, s: wrap(s + d, total) + (n.s - s) }];
        return to.has(s) ? [] : [n];
      });
      return { ...row, tune };
    }
    const move = (list, empty) => {
      const out = [...list];
      for (const s of from) out[s] = empty;
      for (const s of from) out[wrap(s + d, total)] = list[s] ?? empty;
      return out;
    };
    return { ...row, steps: move(row.steps, false), accents: move(row.accents ?? [], false), notes: move(row.notes ?? [], null) };
  });
}
