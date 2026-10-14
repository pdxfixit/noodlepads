// Tooltips on nearly everything (Ben, 2026-10-12): a control with no title of
// its own gets one from its screen-reader label, else its text, and keeps it
// in step when that label changes ("✕" becoming "✕?"). A title someone wrote
// by hand is left alone. On a phone nobody hovers, so this is for mice.

const CONTROLS = 'button, [role="button"], [role="switch"], [role="tab"], a[href], input, select, summary, output[for]';

// The tooltip a control should have, or '' for none. Pure, for the tests.
export function tipFor(el) {
  const label = el.getAttribute?.('aria-label');
  if (label && label.trim()) return label.trim();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 120);
}

// Gives every control under `root` that has no title of its own its tooltip.
export function addTips(root = document) {
  const list = [...(root.querySelectorAll?.(CONTROLS) ?? [])];
  if (root.matches?.(CONTROLS)) list.push(root);
  for (const el of list) {
    const own = el.hasAttribute?.('title') && el.dataset?.autoTip === undefined;
    if (own) continue;
    const tip = tipFor(el);
    if (!tip) continue;
    if (el.getAttribute('title') !== tip) el.setAttribute('title', tip);
    el.dataset.autoTip = '';
  }
}

// Keeps it so as the page changes: new controls, and labels that change.
export function watchTips(root = document.body) {
  addTips(root);
  if (typeof MutationObserver !== 'function' || !root) return;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; addTips(root); });
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
}
