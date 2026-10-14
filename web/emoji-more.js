// The "…" at the end of every picture chooser (a sound's picture in the sound
// sheet, a row's picture in Beats with ⌨️ Keys, a person's round picture): it
// opens every emoji in the same sheet or dialog, under group headings that
// fold open and shut (a short menu of groups at first) and stay at the top
// while their group scrolls, with a search box ("frog", "rocket"). Ben, 2026-10-11: "the emoji chooser should have an `...` type
// where it allows any of the expansive list".
//
// The list (web/emoji-all.js, made by tools/make_emoji.py) is about 12 KB
// gzipped, so it loads only on the first tap of "…", and its buttons go in a
// few hundred at a time so the list opens at once on a phone. A pick from it
// goes through the chooser's own handler, so it works exactly like a picture
// from the short list (the same "already taken" question where there is one).
// The newest emoji (Unicode 15 and 16) show as boxes on older phones.

export const MORE_LABEL = 'All emoji';
const CHUNK = 160;   // buttons added per step while the list fills in

// [{name, items: [{emoji, name}]}] from emoji-all.js's GROUPS.
export function parseGroups(groups) {
  return groups.map(([name, body]) => ({
    name,
    items: body.split('\n').map((line) => {
      const at = line.indexOf(' ');
      return { emoji: line.slice(0, at), name: line.slice(at + 1) };
    }),
  }));
}

// The emoji whose name has every word typed, in list order; a pasted emoji
// finds itself.
export function searchEmoji(groups, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const all = groups.flatMap((g) => g.items);
  return all.filter((it) => it.emoji === q || it.emoji.replace(/️/g, '') === q.replace(/️/g, '')
    || words.every((w) => it.name.includes(w)));
}

let loading = null;
const loadGroups = () => {
  loading ??= import('./emoji-all.js').then((m) => parseGroups(m.GROUPS)).catch((err) => { loading = null; throw err; });
  return loading;
};

const make = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
};

let made = 0;

// Adds the full list to a chooser. `grid` is its short list; the panel goes
// right after it and takes its place while open. `onPick(emoji)` is the
// chooser's own handler. `stateOf(emoji, name)` says {pressed, armed, label}
// for a button (all optional). Returns:
//   button     the "…" to put last in the grid each time it is drawn
//   reset()    shut the full list without moving focus (when the chooser opens)
//   refresh()  redraw pressed / armed / labels after a pick
//   focus(e)   put focus on emoji e's button in the full list, if it is open
export function emojiMore({ grid, onPick, stateOf = () => ({}) }) {
  const id = `emoji-all-${++made}`;
  const button = make('button', 'emoji-more', '…');
  button.type = 'button';
  button.setAttribute('aria-label', MORE_LABEL);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  button.title = MORE_LABEL;

  const panel = make('div', 'emoji-all');
  panel.id = id;
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', MORE_LABEL);
  const head = make('div', 'emoji-all-head');
  const search = make('input', 'emoji-search');
  search.type = 'search';
  search.placeholder = 'Search emoji';
  search.setAttribute('aria-label', 'Search all emoji');
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('enterkeyhint', 'search');
  search.setAttribute('spellcheck', 'false');
  const back = make('button', 'emoji-back', '⬅️ Fewer');
  back.type = 'button';
  head.append(search, back);
  const status = make('p', 'emoji-all-status');
  status.setAttribute('role', 'status');
  const list = make('div', 'emoji-all-list');
  panel.append(head, status, list);
  grid.insertAdjacentElement('afterend', panel);

  let groups = null;
  let job = 0;          // the drawing in progress; a newer one stops it
  let isOpen = false;

  const paint = (b) => {
    const s = stateOf(b.dataset.any, b.title) ?? {};
    b.setAttribute('aria-pressed', String(!!s.pressed));
    b.classList.toggle('armed', !!s.armed);
    b.setAttribute('aria-label', s.label ?? b.title);
  };
  const emojiButton = (it) => {
    const b = make('button', '', it.emoji);
    b.type = 'button';
    b.dataset.any = it.emoji;
    b.title = it.name;
    b.tabIndex = -1;
    paint(b);
    return b;
  };
  // Every emoji button drawn, and those in open groups (the arrows skip a
  // folded group's buttons).
  const allButtons = () => [...list.querySelectorAll('[data-any]')];
  const buttons = () => allButtons().filter((b) => !b.parentElement.hidden);
  const heads = () => [...list.querySelectorAll('.emoji-all-group')];
  // One emoji button in the open groups is reachable with Tab; the arrows
  // move from it. Each group heading is a Tab stop of its own.
  const rove = (to) => {
    for (const b of allButtons()) b.tabIndex = b === to ? 0 : -1;
  };
  // Keeps that one Tab stop in an open group: the one the kid moved to,
  // else the picture in use (once its chunk is drawn), else the first.
  let moved = false;
  const keepRove = () => {
    const shown = buttons();
    const now = shown.find((b) => b.tabIndex === 0);
    const inUse = shown.find((b) => b.getAttribute('aria-pressed') === 'true');
    rove((moved && now) || inUse || now || shown[0]);
  };

  // The list is a short menu of group headings that open and close like the
  // preset groups on Pads (Ben, 2026-10-11: "can the giant emoji list have
  // collapsible sections"). A group's buttons are made the first time it
  // opens, a chunk at a time, so even Smileys opens at once on a phone.
  // `folds` is the groups open now: on opening the list, only the group of
  // the picture in use. While searching, every group with a match is open,
  // in a set of its own, so clearing the search brings the folds back. Folds
  // are forgotten when the list shuts.
  let folds = new Set();
  let searchFolds = null;
  let secs = [];          // [{name, items, box, head, grid, at}] as drawn
  let pending = [];       // open groups whose buttons are still being made
  let pumping = false;

  const pump = (mine) => {
    if (mine !== job) return;
    let room = CHUNK;
    while (room > 0 && pending.length) {
      const sec = pending[0];
      const end = Math.min(sec.items.length, sec.at + room);
      room -= end - sec.at;
      for (; sec.at < end; sec.at++) sec.grid.append(emojiButton(sec.items[sec.at]));
      if (sec.at >= sec.items.length) pending.shift();
    }
    keepRove();
    if (pending.length) setTimeout(() => pump(mine), 0);
    else pumping = false;
  };
  const fill = (sec) => {
    if (sec.at >= sec.items.length || pending.includes(sec)) return;
    pending.unshift(sec);   // the group just opened goes first
    if (!pumping) { pumping = true; pump(job); }
  };

  const setOpen = (sec, open) => {
    sec.head.setAttribute('aria-expanded', String(open));
    sec.head.querySelector('.emoji-all-caret').textContent = open ? '▾' : '▸';
    sec.box.classList.toggle('open', open);
    sec.grid.hidden = !open;
    if (open) fill(sec);
  };
  function toggle(sec) {
    const set = searchFolds ?? folds;
    const open = !set.has(sec.name);
    if (open) set.add(sec.name); else set.delete(sec.name);
    setOpen(sec, open);
    keepRove();
    // Shutting a group scrolled far into keeps its heading in view.
    if (!open) sec.head.scrollIntoView?.({ block: 'nearest' });
  }

  // Draws `sections` ([{name, items}]) as headings, opening those in `open`.
  function draw(sections, open) {
    job++;
    moved = false;
    pending = [];
    pumping = false;
    list.replaceChildren();
    list.scrollTop = 0;
    secs = sections.map((s, n) => {
      const box = make('section', 'emoji-all-sec');
      const h = make('h3', 'emoji-all-h');
      const head = make('button', 'emoji-all-group');
      head.type = 'button';
      const grid = make('div', 'emoji-all-grid');
      grid.id = `${id}-g${n}`;
      head.setAttribute('aria-controls', grid.id);
      const caret = make('span', 'emoji-all-caret');
      caret.setAttribute('aria-hidden', 'true');
      const count = make('span', 'emoji-all-count', String(s.items.length));
      count.setAttribute('aria-label', `${s.items.length} emoji`);
      head.append(caret, make('span', 'emoji-all-name', s.name), count);
      h.append(head);
      box.append(h, grid);
      list.append(box);
      return { name: s.name, items: s.items, box, head, grid, at: 0 };
    });
    for (const sec of secs) setOpen(sec, open.has(sec.name));
    keepRove();
  }

  function showSearch() {
    if (!groups) return;
    const q = search.value.trim();
    if (!q) {
      status.textContent = '';
      searchFolds = null;
      draw(groups, folds);
      return;
    }
    const found = new Set(searchEmoji(groups, q));
    const sections = groups.map((g) => ({ name: g.name, items: g.items.filter((it) => found.has(it)) })).filter((g) => g.items.length);
    status.textContent = found.size ? `${found.size} found` : `No emoji called “${q}”.`;
    searchFolds = new Set(sections.map((g) => g.name));
    draw(sections, searchFolds);
  }

  async function open() {
    isOpen = true;
    grid.hidden = true;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    search.focus();
    if (!groups) {
      status.textContent = 'Loading every emoji…';
      try {
        groups = await loadGroups();
      } catch {
        status.textContent = 'The full list didn’t load. Check the connection and try again.';
        return;
      }
      if (!isOpen) return;
    }
    const inUse = groups.find((g) => g.items.some((it) => stateOf(it.emoji, it.name)?.pressed));
    folds = new Set(inUse ? [inUse.name] : []);
    showSearch();
  }

  function shut({ focus = true } = {}) {
    isOpen = false;
    job++;
    panel.hidden = true;
    grid.hidden = false;
    button.setAttribute('aria-expanded', 'false');
    search.value = '';
    searchFolds = null;
    status.textContent = '';
    list.replaceChildren();
    secs = [];
    pending = [];
    if (focus) button.focus();
  }

  const secOf = (el) => secs.find((s) => s.box === el.closest('.emoji-all-sec'));
  // Where Down goes from a group's last row, and Up from the next heading.
  const nextHead = (sec) => secs[secs.indexOf(sec) + 1]?.head;
  const lastStop = (sec) => {
    if (!sec) return search;
    return (sec.grid.hidden ? null : sec.grid.lastElementChild) ?? sec.head;
  };
  const go = (to) => {
    if (!to) return;
    if (to.dataset?.any) { moved = true; rove(to); }
    to.focus();
    to.scrollIntoView?.({ block: 'nearest' });
  };

  button.addEventListener('click', open);
  back.addEventListener('click', () => shut());
  search.addEventListener('input', showSearch);
  search.addEventListener('keydown', (e) => {
    // Enter must not submit the form around it (the sound sheet's Save).
    if (e.key === 'Enter') e.preventDefault();
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      // To the Tab stop in an open group; with every group folded, Down goes to the first heading.
      const shown = buttons();
      const to = shown.find((b) => b.tabIndex === 0) ?? shown[0] ?? (e.key === 'ArrowDown' ? heads()[0] : null);
      if (to) { e.preventDefault(); go(to); }
    } else if (e.key === 'Escape' && search.value) {
      // Esc empties the search first; a second Esc closes the dialog as usual.
      e.preventDefault();
      e.stopPropagation();
      search.value = '';
      showSearch();
    }
  });
  list.addEventListener('click', (e) => {
    const head = e.target.closest('.emoji-all-group');
    if (head) { toggle(secOf(head)); return; }
    const b = e.target.closest('[data-any]');
    if (!b) return;
    moved = true;
    rove(b);
    onPick(b.dataset.any);
  });
  list.addEventListener('keydown', (e) => {
    // A heading: Enter or Space (the button's own click) opens or shuts its
    // group. Down goes into an open group, else to the next heading; Up goes
    // to the group above's last emoji, its heading, or the search box.
    const head = e.target.closest?.('.emoji-all-group');
    if (head) {
      const sec = secOf(head);
      const i = secs.indexOf(sec);
      let to;
      if (e.key === 'ArrowDown') to = (sec.grid.hidden ? null : sec.grid.firstElementChild) ?? nextHead(sec);
      else if (e.key === 'ArrowUp') to = lastStop(secs[i - 1]);
      else if (e.key === 'Home') to = secs[0]?.head;
      else if (e.key === 'End') to = lastStop(secs.at(-1));
      else return;
      e.preventDefault();
      go(to);
      return;
    }
    // An emoji: Left and Right step through every open group, skipping
    // folded ones; Up and Down move a whole row, leaving a group by its own
    // heading or the next one; Home and End jump to the ends.
    const b = e.target.closest?.('[data-any]');
    if (!b) return;
    const sec = secOf(b);
    const all = buttons();
    const i = all.indexOf(b);
    const mine = [...b.parentElement.children];
    const j = mine.indexOf(b);
    const cols = Math.max(1, getComputedStyle(b.parentElement).gridTemplateColumns.split(' ').filter(Boolean).length);
    let to;
    if (e.key === 'ArrowLeft') to = all[Math.max(0, i - 1)];
    else if (e.key === 'ArrowRight') to = all[Math.min(all.length - 1, i + 1)];
    else if (e.key === 'Home') to = all[0];
    else if (e.key === 'End') to = all.at(-1);
    else if (e.key === 'ArrowUp') to = j - cols >= 0 ? mine[j - cols] : sec.head;
    else if (e.key === 'ArrowDown') {
      const lastRow = Math.floor((mine.length - 1) / cols);
      if (j + cols < mine.length) to = mine[j + cols];
      else if (Math.floor(j / cols) < lastRow) to = mine.at(-1);
      else to = nextHead(sec) ?? b;
    } else return;
    e.preventDefault();
    go(to);
  });

  return {
    button,
    reset: () => { if (isOpen || !panel.hidden) shut({ focus: false }); },
    refresh: () => { for (const b of allButtons()) paint(b); },
    focus: (emoji) => {
      const b = buttons().find((x) => x.dataset.any === emoji);
      if (b) { moved = true; rove(b); b.focus(); }
    },
    get open() { return isOpen; },
  };
}

// A chooser's short list, with `current` added at the end when it came from
// the full list, so the picture in use always shows pressed.
export const withCurrent = (short, current) => (current && !short.includes(current) ? [...short, current] : short);
