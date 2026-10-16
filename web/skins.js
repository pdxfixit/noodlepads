// Pad skins: how every pad looks, chosen per person in ⚙️ Settings → 🎨 Look
// (setting `padSkin`, settings.js). Tiles is the look the app always had; the
// others are drawn by styles.css ("Pad skins") under a `data-skin` attribute:
// on the page's root for the whole app, or on any box nearer a pad (the
// samples in 🎨 Look), where the nearest one wins. Imports nothing, so
// settings.js can take its list of ids.

export const SKINS = [
  { id: 'tiles', emoji: '🟨', label: 'Tiles' },
  { id: 'slam', emoji: '🔴', label: 'Slam buttons' },
  { id: 'lit', emoji: '💡', label: 'Lit pads' },
  { id: 'switch', emoji: '🎚️', label: 'Switch' },
  { id: 'spinner', emoji: '🌀', label: 'Spinner' },
  { id: 'jelly', emoji: '🍮', label: 'Jelly' },
  { id: 'googly', emoji: '👀', label: 'Googly eyes' },
];

export const SKIN_IDS = SKINS.map((s) => s.id);

// A skin's name, for the 🎨 Look heading's chip; an unknown id reads as Tiles.
export const skinLabel = (id) => (SKINS.find((s) => s.id === id) ?? SKINS[0]).label;

// The skin after this one, round to the first again (🧸 Kids' skin button).
export const nextSkin = (id) => SKIN_IDS[(SKIN_IDS.indexOf(id) + 1) % SKIN_IDS.length];

// Puts a skin on the page (or on one box): Tiles needs nothing, as the
// plain styles are Tiles, so the attribute goes; anything unknown is Tiles.
export function showSkin(root, id) {
  if (!root?.dataset) return;
  if (SKIN_IDS.includes(id) && id !== 'tiles') root.dataset.skin = id;
  else delete root.dataset.skin;
}
