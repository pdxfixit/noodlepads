// The sound chooser (a row's dialog, and + Add's New rows): what it is choosing
// for, the sound marked or the sounds ticked, the groups opening and shutting,
// who plays Notes, Chords and Bass, 🎹 Tune and a row's speed. Made once by
// sequencer.js with createChooser; it reads and changes the open beat through
// `shared` (the beat maker's view of itself) and gives back openFor and openChooser.

import { cleanRow, MAX_ROWS, nextSound, ROW_RATES } from './beat.js';
import { hasPicker, pickerButton, pickerList, pickInstrument } from './inst-picker.js';
import { openDialog } from './dialogs.js';

export function createChooser(shared) {
  const { audio, deps, el, openRoll, playing, prepare, render, save } = shared;
  // ── Chooser: the row's dialog. Tapping a sound plays it and marks it;
  // "Use" sets the row. With advanced beats on, also the row's speed (its
  // 🔔 Let it ring is on the row's header line). ──

  // What the chooser is choosing for: a beat row ({row: i, title}), or new
  // rows ({adding: true, title}).
  let target = null;
  let choosing = -1;   // the row, when the target is a row
  let picked = null;   // the sound marked in it, not used until "Use"
  let ticks = [];      // new rows: the sounds ticked, in the order tapped
  let opened = new Map();  // group id -> open, set in this dialog (it wins over the shared state)
  let instOpen = null;     // the group whose instrument list is open (one at a time), or null

  function openFor(next, current, returnTo) {
    target = next;
    choosing = next.row ?? -1;
    picked = current ?? null;
    ticks = next.adding && current ? [current] : [];
    // The group holding the current sound starts open, but can still be closed.
    const home = deps.groups().find((g) => g.collapsible && g.clips.some((c) => c.id === picked));
    opened = new Map(home ? [[home.groupId, true]] : []);
    instOpen = null;
    renderChooser();
    openDialog(el.chooser, {
      focus: el.chooserGrid.querySelector('[aria-pressed="true"]') || el.chooserGrid.querySelector('[data-choose], [data-toggle-group]'),
      returnTo,
    });
  }
  function openChooser(i) {
    openFor({ row: i, title: `Row ${i + 1}` }, shared.pattern.rows[i]?.clipId, () => el.rows.querySelector(`[data-pick="${i}"]`) || el.add);
  }

  // The chooser's sections: the kit's groups (each opens and closes, like on
  // the pads screen; the one holding the row's sound starts open),
  // then every person's own sounds, each under their name in their color.
  const isOpen = (id) => (opened.has(id) ? opened.get(id) : Boolean(deps.isGroupOpen?.(id)));

  function renderChooser() {
    el.chooserTitle.textContent = target?.title ?? 'Pick a sound';
    el.chooserGrid.replaceChildren(...deps.groups().map((g) => {
      const section = document.createElement('section');
      section.className = 'chooser-group';
      section.style.setProperty('--c', g.color);
      const open = !g.collapsible || isOpen(g.groupId);
      let heading;
      let list = null;
      if (g.collapsible) {
        heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'chooser-toggle';
        heading.dataset.toggleGroup = g.groupId;
        heading.setAttribute('aria-expanded', String(open));
        heading.textContent = `${open ? '▾' : '▸'} ${g.name} (${g.clips.length})`;
        // Notes, Chords and Bass: who plays them beside the name, as on
        // 🔊 Pads (inst-picker.js, ADR 0030), its list under it while open.
        if (hasPicker(g.groupId)) {
          const kit = { id: g.groupId, name: g.plain ?? g.name };
          const line = document.createElement('div');
          line.className = 'chooser-inst-row';
          line.append(heading, pickerButton(kit, instOpen === g.groupId, { where: 'chooser' }));
          heading = line;
          if (instOpen === g.groupId) list = pickerList(kit, { where: 'chooser' });
        }
      } else {
        heading = document.createElement('h3');
        heading.textContent = g.name;
      }
      const grid = document.createElement('div');
      grid.className = 'chooser-grid';
      grid.append(...g.clips.map((c) => {
        const b = deps.makePad(c);
        b.classList.add('pad-mini');
        b.dataset.choose = c.id;
        showTick(b);
        return b;
      }));
      grid.hidden = !open;
      section.append(...[heading, list, grid].filter(Boolean));
      return section;
    }));
    renderChooserTools();
  }

  // The bottom bar: the Use button names the marked sound; the row buttons
  // show the row as it is now.
  function renderChooserTools() {
    if (target?.adding) {
      const n = ticks.length;
      el.chooserOk.textContent = n ? `Add ${n} row${n === 1 ? '' : 's'}` : 'Tick a sound';
      el.chooserOk.disabled = !n;
      el.chooserTitle.textContent = n && n >= room() ? 'New rows · beat full' : 'New rows';
      el.chooserTools.hidden = true;
      return;
    }
    const clip = deps.clipById(picked);
    el.chooserOk.textContent = clip ? `Use ${clip.label}` : 'Pick a sound';
    el.chooserOk.disabled = !clip;
    const row = shared.pattern?.rows[choosing];
    // 🎹 Tune for everyone; speed with Advanced.
    el.chooserTools.hidden = !row;
    const rates = el.chooserRate.closest('.chooser-rate');
    if (rates) rates.hidden = !shared.advanced;
    if (!row) return;
    showTuneKey(row);
    for (const b of el.chooserRate.querySelectorAll('[data-rate]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === row.rate));
  }

  // A sound in the chooser shows whether it is marked; for new rows, ticked,
  // with its place in the order tapped (the rows go in that order).
  function showTick(b) {
    const id = b.dataset.choose;
    const at = target?.adding ? ticks.indexOf(id) : -1;
    b.setAttribute('aria-pressed', String(target?.adding ? at >= 0 : id === picked));
    if (at >= 0) b.dataset.tick = String(at + 1);
    else delete b.dataset.tick;
  }
  const room = () => MAX_ROWS - (shared.pattern?.rows.length ?? MAX_ROWS);

  // Marks a sound and plays it, so it can be heard before it is used. For new
  // rows a tap ticks it (and plays it), or unticks it; a full beat ticks no more.
  function mark(clipId) {
    let hear = true;
    if (target?.adding) {
      const at = ticks.indexOf(clipId);
      if (at >= 0) { ticks.splice(at, 1); hear = false; }
      else if (ticks.length < room()) ticks.push(clipId);
    } else picked = clipId;
    for (const b of el.chooserGrid.querySelectorAll('[data-choose]')) showTick(b);
    const clip = deps.clipById(clipId);
    if (clip && hear) audio.play(clip);
    renderChooserTools();
  }

  // The new rows' Add: a row for each ticked sound, in the order tapped.
  function addTicked() {
    const clips = ticks.map((id) => deps.clipById(id)).filter(Boolean).slice(0, room());
    for (const clip of clips) {
      shared.pattern.rows.push(cleanRow({ clipId: clip.id }));
      if (playing()) prepare(clip);
    }
    el.chooser.close();
    if (!clips.length) return;
    save();
    render();
  }

  // `then`: what happens once the chooser has closed (🎹 Tune opens the roll).
  function useMarked({ then, changed = false } = {}) {
    const clip = deps.clipById(picked);
    const row = shared.pattern?.rows[choosing];
    if (!row) return;
    if (clip && row.clipId !== picked) {
      row.clipId = picked;
      if (playing()) prepare(clip);
      changed = true;
    }
    if (changed) save();
    el.chooser.close();
    render();
    then?.();
  }

  // A row setting changed from the dialog: save, redraw the rows behind it.
  function rowChanged() {
    save();
    render();
    renderChooserTools();
  }

  // + Add a row opens the chooser for new rows (Ben, 2026-10-16: adding eight
  // chords one at a time meant closing Drums eight times). The sound after
  // the last row's comes ticked, its group open, so one tap on Add still adds
  // the next one.
  el.add.addEventListener('click', () => {
    if (!shared.pattern || shared.pattern.rows.length >= MAX_ROWS) return;
    const order = deps.groups().flatMap((g) => g.clips);
    const next = nextSound(order, shared.pattern.rows.map((r) => r.clipId), [...deps.clips(), ...order]);
    openFor({ adding: true, title: 'New rows' }, next?.id, () => el.add);
  });

  el.chooser.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-group]');
    if (toggle) {
      const id = toggle.dataset.toggleGroup;
      const open = !isOpen(id);
      opened.set(id, open);
      if (Boolean(deps.isGroupOpen?.(id)) !== open) deps.toggleGroup?.(id);  // the pads screen follows
      renderChooser();
      el.chooserGrid.querySelector(`[data-toggle-group="${CSS.escape(toggle.dataset.toggleGroup)}"]`)?.focus();
      return;
    }
    // Who plays Notes, Chords or Bass: the button opens or closes its list;
    // a tap on an instrument picks it (the person's, as on 🔊 Pads), closes
    // the list and opens the group on that instrument's sounds.
    const who = e.target.closest('[data-inst-pick]');
    if (who) {
      instOpen = instOpen === who.dataset.instPick ? null : who.dataset.instPick;
      renderChooser();
      el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(who.dataset.instPick)}"]`)?.focus();
      return;
    }
    const inst = e.target.closest('[data-inst]');
    if (inst) { chooseInstrument(inst.dataset.instGroup, inst.dataset.inst); return; }
    const pick = e.target.closest('[data-choose]');
    if (pick) mark(pick.dataset.choose);
  });
  async function chooseInstrument(group, inst) {
    instOpen = null;
    opened.set(group, true);
    if (!deps.isGroupOpen?.(group)) deps.toggleGroup?.(group);   // the pads screen follows, as a header tap does
    await pickInstrument(group, inst);
    if (!el.chooser.open) return;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  }
  // Esc in an open instrument list closes the list, not the chooser.
  el.chooser.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !instOpen || !e.target.closest?.('.inst-list, [data-inst-pick]')) return;
    e.preventDefault();
    e.stopPropagation();
    const group = instOpen;
    instOpen = null;
    renderChooser();
    el.chooserGrid.querySelector(`[data-inst-pick="${CSS.escape(group)}"]`)?.focus();
  });
  el.chooserOk.addEventListener('click', () => (target?.adding ? addTicked() : useMarked()));
  // 🎹 Tune: the row plays notes from 🎹 the piano roll (ADR 0023). On, its
  // pills become notes a pill long, at the sound's own note, and the roll
  // opens (after Use, if a sound is marked). Off, its notes become pills
  // where they start: one with another pitch or length asks first, since
  // those are lost ("Off?" in red, then a second tap).
  let tuneAsked = false;
  function showTuneKey(row) {
    const b = el.chooserMelody;
    if (!b) return;
    b.setAttribute('aria-pressed', String(!!row.melody));
    b.classList.toggle('armed', tuneAsked);
    b.textContent = tuneAsked ? '🎹 Off? Notes lose their pitch' : '🎹 Tune';
    b.setAttribute('aria-label', tuneAsked ? 'Tap again to turn the tune off: its notes become plain pills' : '🎹 Tune: the row plays notes you place in the piano roll');
  }
  el.chooserMelody?.addEventListener('click', () => {
    const i = choosing;
    const row = shared.pattern?.rows[i];
    if (!row) return;
    if (!row.melody) {
      shared.pattern.rows[i] = cleanRow({ ...row, melody: true, tune: undefined });
      tuneAsked = false;
      useMarked({ then: () => openRoll(i), changed: true });
      return;
    }
    const plain = (row.tune ?? []).every((n) => n.p === 0 && n.l === 1 && Number.isInteger(n.s));
    if (!plain && !tuneAsked) { tuneAsked = true; showTuneKey(row); return; }
    tuneAsked = false;
    const { tune: _notes, ...rest } = row;
    shared.pattern.rows[i] = cleanRow({ ...rest, melody: false, notes: [] });
    rowChanged();
  });
  el.chooser.addEventListener('close', () => { tuneAsked = false; });
  el.chooserRate.addEventListener('click', (e) => {
    const row = shared.pattern?.rows[choosing];
    const rate = Number(e.target.closest('[data-rate]')?.dataset.rate);
    if (!row || !ROW_RATES.includes(rate) || rate === row.rate) return;
    row.rate = rate;
    rowChanged();
  });

  return { openFor, openChooser };
}
