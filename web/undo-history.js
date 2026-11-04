// ↩️ Undo · ↪️ Redo for the open beat (Ben, 2026-11-04: "undo in general";
// ADR 0036). One history per beat id, for the visit, in memory only: what the
// beat was before each change, as text (merge3.js canon), at most LIMIT steps
// back. The beat maker tells it what the beat is after every change
// (`changed`) and whenever it reads the beat from storage instead (`seen`:
// opened, switched to, synced), and asks it for the beat one step back or
// forward. Pure: no DOM, no storage, no clock.

export const LIMIT = 50;

export function createHistory(limit = LIMIT) {
  const books = new Map();   // beat id → { past: [], future: [], at }
  const book = (id) => {
    let b = books.get(id);
    if (!b) books.set(id, (b = { past: [], future: [], at: null }));
    return b;
  };
  return {
    // The beat as read from storage. Steps kept from before still apply only
    // if it is what was last seen: a beat changed elsewhere (a sync, another
    // tab) starts afresh, so Undo never takes back what another device did.
    seen(id, now) {
      const b = book(id);
      if (b.at !== null && b.at !== now) { b.past = []; b.future = []; }
      b.at = now;
    },
    // After a change: what it was is one step back, and Redo is gone. With
    // `undoing` (a banner's ↩️ Undo, ADR 0036), a change back to exactly the
    // step before is that step undone, so ↪️ can redo it and ↩️ goes on back.
    changed(id, now, { undoing = false } = {}) {
      const b = book(id);
      if (b.at === null) { b.at = now; return; }
      if (b.at === now) return;
      if (undoing && b.past.at(-1) === now) { b.future.push(b.at); b.at = b.past.pop(); return; }
      b.past.push(b.at);
      if (b.past.length > limit) b.past.shift();
      b.future = [];
      b.at = now;
    },
    // The beat one step back (or forward), as text, or null at the end.
    undo(id) {
      const b = books.get(id);
      if (!b?.past.length) return null;
      b.future.push(b.at);
      b.at = b.past.pop();
      return b.at;
    },
    redo(id) {
      const b = books.get(id);
      if (!b?.future.length) return null;
      b.past.push(b.at);
      b.at = b.future.pop();
      return b.at;
    },
    can(id) {
      const b = books.get(id);
      return { undo: !!b?.past.length, redo: !!b?.future.length };
    },
    forget(id) { books.delete(id); },
  };
}
