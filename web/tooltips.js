// Tooltips on nearly everything (Ben, 2026-10-12): a control with no title of
// its own gets one from its screen-reader label, else its text, and keeps it
// in step when that label changes ("✕" becoming "✕?"). A title someone wrote
// by hand is left alone. On a phone nobody hovers, so this is for mice.

// Every control on the page, as tooltips and usage events (track-page.js) see them.
export const CONTROLS ='button, [role="button"], [role="switch"], [role="tab"], a[href], input, select, summary, output[for]';

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

// The controls a batch of page changes touched: a control whose label or
// text changed, and whatever was added (addTips looks inside it). Pure over
// the records, for the tests.
export function touched(records) {
  const out = new Set();
  for (const r of records) {
    // An element, or the element round a text node that changed.
    const at = typeof r.target?.closest === 'function' ? r.target : r.target?.parentElement;
    const own = at?.closest?.(CONTROLS);
    if (own) out.add(own);
    for (const n of r.addedNodes ?? []) if (typeof n.closest === 'function') out.add(n);
  }
  return out;
}

// Keeps it so as the page changes: new controls, and labels that change.
// Only what changed is looked at again, never the whole page: a pill's
// label changes on every step of a drag, and a page of pills is thousands
// of controls (Ben, 2026-10-19: "the pill drag lags").
export function watchTips(root = document.body) {
  addTips(root);
  if (typeof MutationObserver !== 'function' || !root) return;
  const pending = new Set();
  let queued = false;
  new MutationObserver((records) => {
    for (const el of touched(records)) pending.add(el);
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const list = [...pending];
      pending.clear();
      for (const el of list) if (el.isConnected) addTips(el);
    });
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
}
