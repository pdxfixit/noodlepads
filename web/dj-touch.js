// 👆 The touch layout (ADR 0028): 🎤 Live and Beats with ⌨️ Keys played on
// big tiles in bands, one group each, top to bottom (Ben, 2026-10-16: "not
// tied to a kbd… preset groups… far simpler"). This file draws the bands
// for playing; dj.js listens to them and plays through the same path as the
// keys. The rules are in touch.js.

import { MINE } from './touch.js';

// A band's heading: the group's emoji and name, or 🎤 My sounds.
export function groupLabel(group, kitGroups = []) {
  if (group === MINE) return '🎤 My sounds';
  const g = kitGroups.find((x) => x.id === group);
  return g ? `${g.emoji || '🔊'} ${g.name}` : '🔊 Sounds';
}

// Draws `touch` into `box` for playing: a heading and a grid of tiles per
// band, each tile a sound in its family's color. A sound that is gone is
// left out, and so is a band with none left. `deps`: clipById, family(clip)
// -> {color}, kitGroups(), isLooping(id).
export function drawBands(box, touch, deps) {
  const bands = (touch?.bands ?? []).map((b, i) => ({ b, i, clips: b.sounds.map((id) => deps.clipById(id)).filter(Boolean) }))
    .filter((x) => x.clips.length);
  if (!bands.length) {
    const p = document.createElement('p');
    p.className = 'touch-empty';
    p.textContent = 'No sounds here yet. ✏️ Edit layout adds a group of them.';
    box.replaceChildren(p);
    return;
  }
  box.replaceChildren(...bands.map(({ b, i, clips }) => {
    const band = document.createElement('section');
    band.className = 'touch-band';
    band.dataset.band = i;
    band.dataset.size = b.size;
    const head = document.createElement('h3');
    head.className = 'touch-head';
    head.id = `touch-head-${i}`;
    head.textContent = groupLabel(b.group, deps.kitGroups());
    band.setAttribute('aria-labelledby', head.id);
    const tiles = document.createElement('div');
    tiles.className = 'touch-tiles';
    tiles.append(...clips.map((clip) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'touch-tile';
      t.dataset.clip = clip.id;
      t.style.setProperty('--c', deps.family(clip).color);
      t.setAttribute('aria-label', clip.label);
      if (deps.isLooping?.(clip.id)) t.classList.add('looping');
      const emoji = document.createElement('span');
      emoji.className = 'touch-emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = clip.emoji || '🔊';
      const name = document.createElement('span');
      name.className = 'touch-name';
      name.setAttribute('aria-hidden', 'true');
      name.textContent = clip.label;
      t.append(emoji, name);
      return t;
    }));
    band.append(head, tiles);
    return band;
  }));
}
