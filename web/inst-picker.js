// The instrument picker (ADR 0030): "who plays" a group. It sits on the
// Notes, Chords and Bass headers as one button, "💧 Pluck ▾", that opens the
// list of instruments by family (Keys, Mallets, Strings, Wind). A tap on one
// picks it and closes the list (open, it fills most of a phone). The pick is
// the person's setting (instNotes, instChords, instBass), so it goes with
// them to every device, and every picker shows it: 🔊 Pads, the beat row's
// sound chooser, ✏️ Edit keys. Nothing already made changes: a beat row,
// key or band keeps the preset it was given. Two pickers also change the
// thing they sit on, keeping every note: 🎹 the piano roll's (its tune row)
// and a 👆 band's in ✏️ Edit layout (its tiles).
//
// Draws only; each screen puts the parts in place and handles the taps
// (`data-inst-pick` on the button, `data-inst` and `data-inst-group` on a
// choice). `where` names the screen, so two lists open at once never share
// an id.

import { PLAYED, FAMILIES, instrumentsFor, instrumentById } from './instruments.js';
import { getSetting, setSetting } from './settings.js';

export const hasPicker = (group) => Object.hasOwn(PLAYED, group);

// Who plays `group` for the person showing.
export function pickedFor(group) {
  return instrumentById(getSetting(PLAYED[group].setting)) ?? instrumentById(PLAYED[group].default);
}

// Pads' lists keep their first ids (`inst-list-notes`); the others say where.
// Picks who plays `group` for the person showing (app.js redraws whatever
// lists the presets).
export const pickInstrument = (group, inst) => setSetting(PLAYED[group].setting, inst);

const listId = (group, where) => (where === 'pads' ? `inst-list-${group}` : `inst-list-${where}-${group}`);

// The button on a group's header: the instrument's picture and name, and ▾.
// `g` is the kit group ({id, name}). `inst`: who it shows, when that is not
// the person's pick (a tune row's own instrument); `title`: its tooltip.
export function pickerButton(g, open, { where = 'pads', inst = pickedFor(g.id), title } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'inst-pick';
  b.dataset.instPick = g.id;
  b.setAttribute('aria-expanded', String(open));
  b.setAttribute('aria-controls', listId(g.id, where));
  b.setAttribute('aria-label', `Who plays ${g.name}: ${inst.name}`);
  b.title = title ?? `Who plays ${g.name}: pick an instrument`;
  const pic = document.createElement('span');
  pic.className = 'inst-pick-emoji';
  pic.setAttribute('aria-hidden', 'true');
  pic.textContent = inst.emoji;
  const name = document.createElement('span');
  name.className = 'inst-pick-name';
  name.textContent = inst.name;
  const caret = document.createElement('span');
  caret.className = 'inst-pick-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = open ? '▴' : '▾';
  b.append(pic, name, caret);
  return b;
}

// The open list under the header: each family that has an instrument for
// this group, under its name and color, the one playing now (`now`, an
// instrument id; the person's pick unless given) marked ✓. `label`: the
// list's name for a screen reader.
export function pickerList(g, { where = 'pads', now = pickedFor(g.id).id, label = `Who plays ${g.name}` } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'inst-list';
  wrap.id = listId(g.id, where);
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', label);
  for (const f of FAMILIES) {
    const here = instrumentsFor(g.id).filter((i) => i.family === f.id);
    if (!here.length) continue;
    const family = document.createElement('div');
    family.className = 'inst-family';
    family.style.setProperty('--fam', f.color);
    const head = document.createElement('h3');
    head.className = 'inst-family-name';
    head.textContent = f.name;
    const row = document.createElement('div');
    row.className = 'inst-choices';
    for (const i of here) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'inst-choice';
      b.dataset.inst = i.id;
      b.dataset.instGroup = g.id;
      b.setAttribute('aria-pressed', String(i.id === now));
      const pic = document.createElement('span');
      pic.setAttribute('aria-hidden', 'true');
      pic.className = 'inst-choice-emoji';
      pic.textContent = i.emoji;
      const name = document.createElement('span');
      name.textContent = i.name;
      b.append(pic, name);
      if (i.id === now) {
        const tick = document.createElement('span');
        tick.className = 'inst-choice-tick';
        tick.setAttribute('aria-hidden', 'true');
        tick.textContent = '✓';
        b.append(tick);
      }
      row.append(b);
    }
    family.append(head, row);
    wrap.append(family);
  }
  return wrap;
}

// A pad's small badge for who plays it: an instrument's preset only (the
// groups' own sounds have none). Null for any other sound.
export function instrumentBadge(clip) {
  const inst = clip?.inst ? instrumentById(clip.inst) : null;
  if (!inst) return null;
  const tag = document.createElement('span');
  tag.className = 'pad-inst';
  tag.setAttribute('aria-hidden', 'true');
  tag.textContent = inst.emoji;
  tag.title = inst.name;
  return { tag, name: inst.name };
}
