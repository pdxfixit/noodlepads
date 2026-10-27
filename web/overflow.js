// ⋯ menus: where a line of controls runs out of room, its less-used buttons
// move into a ⋯ at the line's end (docs/decisions.md, Screens; Ben,
// 2026-10-12: "no need to muck about with smaller sizes… allow the buttons
// to move into a sub menu where space requires it"). Buttons stay 44 px.
//
// The buttons never leave their line. A screen marks the ones that may move
// with `data-more-word` (the word the menu shows after the button's icon)
// and opens the menu (moreMenu) from a ⋯ (moreButton) or the row's emoji. The
// menu lists the marked siblings as icon + word and a tap in it taps the real
// button, so each keeps its own behavior: a toggle shows its on state, Clear
// and Remove still ask first in red and keep their Undo. (No screen hides the
// buttons for lack of room today; the ⋯ stays hidden, styles.css "⋯ menus".)

// A ⋯ button for one line. `key` names the line among its box's lines (a row
// number), so the menu finds the line again after the screen redraws it.
export function moreButton(key, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'more-btn icon-btn';   // the same square as the buttons it holds
  b.textContent = '⋯';
  b.setAttribute('data-more', String(key));
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-label', label);
  b.title = 'More';
  return b;
}

// Marks a button as one that moves into ⋯ when its line runs out of room.
export function movable(b, word) {
  if (b) b.setAttribute('data-more-word', word);
  return b;
}

// What the menu shows for a line: its ⋯'s siblings marked data-more-word that
// are not set aside for now (hidden while recording), as {real, icon, word,
// armed, pressed, disabled, label}. A button asking first ("🧹?") reads
// "🧹 Clear?".
export function moreItems(more) {
  const out = [];
  for (const real of more.parentElement?.querySelectorAll('[data-more-word]') ?? []) {
    if (real.hidden || real.style?.visibility === 'hidden') continue;
    const armed = real.classList.contains('armed');
    const text = String(real.textContent).trim();
    out.push({
      real,
      icon: armed ? text.replace(/\?$/, '') : text,
      word: `${real.getAttribute('data-more-word')}${armed ? '?' : ''}`,
      armed,
      pressed: real.getAttribute('aria-pressed'),
      disabled: !!real.disabled,
      label: real.getAttribute('aria-label') || '',
    });
  }
  return out;
}

// The ⋯ menus under `root` (one open at a time): a tap on a ⋯ opens its
// line's menu beside it; Esc, a tap outside or a scroll closes it. Up and
// down move through it. Returns {close, refresh, isOpen, key}: refresh()
// after the screen redraws its lines, so an open menu shows the new state
// (a toggle's on, a button asking first) or closes with its line.
// `opened(key)`, if given, hears each time a menu opens.
export function moreMenu(root, { opened } = {}) {
  let pop = null;   // {box, key}
  const find = (key) => root.querySelector(`[data-more="${CSS.escape(String(key))}"]`);

  function make() {
    const box = document.createElement('div');
    box.className = 'more-pop';
    box.setAttribute('role', 'menu');
    box.hidden = true;
    box.addEventListener('click', (e) => {
      const item = e.target.closest?.('[data-more-item]');
      if (!item || !pop) return;
      const more = find(pop.key);
      const at = Number(item.getAttribute('data-more-item'));
      const it = more && moreItems(more)[at];
      if (!it || it.disabled) return;
      it.real.click();
      // The second tap of one that asked first did it (cleared, removed): done.
      if (it.armed) { close(false); return; }
      refresh(at);
    });
    box.addEventListener('keydown', (e) => {
      const items = [...box.querySelectorAll('[data-more-item]')];
      const at = items.indexOf(document.activeElement);
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); return; }
      const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
      if (to == null || !items.length) return;
      e.preventDefault();
      items[(to + items.length) % items.length].focus();
    });
    document.body.append(box);
    return { box, key: null };
  }

  function open(key) {
    pop ??= make();
    pop.key = key;
    pop.box.hidden = false;
    find(key)?.setAttribute('aria-expanded', 'true');
    refresh(0);
    opened?.(key);
  }
  // Closes it; `back` puts the focus on its ⋯ again (Esc, Tab).
  function close(back = false) {
    if (!pop || pop.box.hidden) return;
    const more = find(pop.key);
    more?.setAttribute('aria-expanded', 'false');
    pop.box.hidden = true;
    pop.key = null;
    if (back) more?.focus();
  }
  // Draws the open menu from its line as it is now, beside its ⋯ (under it,
  // its right edges lined up; above it near the bottom of the screen).
  // `focusAt`: the item to focus, if the menu had the focus.
  function refresh(focusAt = null) {
    if (!pop || pop.box.hidden) return;
    const more = find(pop.key);
    const shown = more && (typeof more.getClientRects !== 'function' || more.getClientRects().length > 0);
    const items = shown ? moreItems(more) : [];
    if (!items.length) { close(false); return; }
    more.setAttribute('aria-expanded', 'true');
    pop.box.setAttribute('aria-label', more.getAttribute('aria-label') || 'More');
    const had = pop.box.contains(document.activeElement)
      ? [...pop.box.querySelectorAll('[data-more-item]')].indexOf(document.activeElement) : -1;
    // The same buttons, brought up to date, so a focused one keeps its focus.
    const olds = [...pop.box.querySelectorAll('[data-more-item]')];
    const btns = items.map((it, i) => {
      const b = olds.length === items.length ? olds[i] : document.createElement('button');
      b.type = 'button';
      b.className = `more-item${it.armed ? ' armed' : ''}`;
      b.setAttribute('data-more-item', String(i));
      b.setAttribute('role', it.pressed == null ? 'menuitem' : 'menuitemcheckbox');
      if (it.pressed != null) b.setAttribute('aria-checked', it.pressed); else b.removeAttribute('aria-checked');
      b.setAttribute('aria-label', it.label || it.word);
      b.disabled = it.disabled;
      b.tabIndex = -1;
      b.textContent = `${it.icon} ${it.word}`;
      return b;
    });
    if (olds.length !== items.length) pop.box.replaceChildren(...btns);
    const want = focusAt ?? (had >= 0 ? had : null);
    if (want != null) (btns[Math.min(want, btns.length - 1)])?.focus();
    // Placed under the ⋯, right edges lined up, inside the screen.
    const r = more.getBoundingClientRect();
    const w = pop.box.offsetWidth || 180;
    const h = pop.box.offsetHeight || 150;
    const vw = document.documentElement.clientWidth || window.innerWidth || 0;
    const vh = document.documentElement.clientHeight || window.innerHeight || 0;
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const top = r.bottom + 4 + h <= vh - 8 || r.top - 4 - h < 8 ? r.bottom + 4 : r.top - 4 - h;
    pop.box.style.left = `${left}px`;
    pop.box.style.top = `${Math.max(8, top)}px`;
  }

  root.addEventListener('click', (e) => {
    const more = e.target.closest?.('[data-more]');
    if (!more) return;
    const key = more.getAttribute('data-more');
    if (pop && !pop.box.hidden && pop.key === key) close(true); else { close(false); open(key); }
  });
  // A tap anywhere but the menu or its ⋯ closes it (its ⋯ toggles it).
  document.addEventListener('pointerdown', (e) => {
    if (!pop || pop.box.hidden || pop.box.contains(e.target)) return;
    const more = e.target.closest?.('[data-more]');
    if (more && more.getAttribute('data-more') === pop.key && root.contains(more)) return;
    close(false);
  }, true);
  // Handled: the page's Esc (⏹️ Stop all, app.js) stands down.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop && !pop.box.hidden && !pop.box.contains(e.target)) { e.preventDefault(); close(true); } });
  // It stays where it opened (fixed, over the page), so a scroll closes it.
  window.addEventListener('scroll', () => close(false), { passive: true });
  return { close, refresh, isOpen: () => !!pop && !pop.box.hidden, key: () => pop?.key ?? null };
}
