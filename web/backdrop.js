// The page's pattern: a faint tile behind the panels, a new one picked at
// random on each visit (docs/decisions.md, Screens, 2026-10-13). No picker
// and nothing remembered. Each tile is a small SVG in web/bg/, used as a
// mask over the casing color (styles.css, "The page's pattern"), so it
// takes every person's color without a copy per color. `?bg=<name>` asks
// for one pattern, and `?bg=none` for none: for `just look --bg` and tests.

export const BACKDROPS = [
  'dots', 'stripes', 'waves', 'zigzag', 'checks', 'stars', 'hearts', 'notes',
  'noodles', 'confetti', 'triangles', 'rings', 'plus', 'bubbles', 'diamonds', 'grid',
  'scales', 'bolts', 'flowers', 'sparkles', 'smiles', 'drops', 'moons',
];

// The pattern for this visit: the one `?bg=` asks for, else one at random.
// null means none.
export function pickBackdrop(search = '', random = Math.random) {
  const asked = new URLSearchParams(search).get('bg');
  if (asked === 'none') return null;
  if (BACKDROPS.includes(asked)) return asked;
  return BACKDROPS[Math.min(BACKDROPS.length - 1, Math.floor(random() * BACKDROPS.length))];
}

// Puts the pattern behind the page: styles.css draws it only once the root
// says which (data-bg).
export function showBackdrop(root, name) {
  if (!name) return;
  root.dataset.bg = name;
  root.style.setProperty('--backdrop', `url("bg/${name}.svg")`);
}
