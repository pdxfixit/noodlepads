// Dialogs: the app's four <dialog>s share one way of closing (the ✕ button,
// a click on the backdrop, Esc) and of handing focus back.

const openers = new WeakMap();   // dialog -> what had focus when it opened
const returns = new WeakMap();   // dialog -> where to put focus if that is gone

// Wires closing. Call once per dialog.
export function setupDialog(dialog) {
  // A press that starts inside the dialog (selecting text in a field, say) and
  // ends on the backdrop is not a click on the backdrop.
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { pressedBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => {
    const onBackdrop = e.target === dialog && pressedBackdrop;
    pressedBackdrop = false;
    if (onBackdrop || e.target.closest('[data-close]')) dialog.close();
  });
  // Closing returns focus to what opened the dialog. When that was redrawn in
  // the meantime (a pad, after saving), `returnTo` finds its replacement.
  dialog.addEventListener('close', () => {
    const opener = openers.get(dialog);
    const returnTo = returns.get(dialog);
    openers.delete(dialog);
    returns.delete(dialog);
    // Some browsers don't focus a button on click, so the opener can be the page itself.
    const usable = opener && opener !== document.body && opener.isConnected;
    const target = usable ? opener : returnTo?.();
    target?.focus({ preventScroll: true });
  });
}

// Who hears of every dialog opened (app.js counts them, uses.js
// DIALOG_USES). A watcher's trouble never stops a dialog opening.
const openWatchers = [];
export function onDialogOpen(fn) {
  const safe = (d) => { try { fn(d); } catch { /* counting is never in the way */ } };
  openWatchers.push(safe);
  return () => openWatchers.splice(openWatchers.indexOf(safe), 1);
}

// Opens `dialog` as a modal. `focus` is the element to focus first (the
// dialog's own first control otherwise); `returnTo()` finds where focus goes
// on close if the opening element is gone by then.
export function openDialog(dialog, { focus, returnTo } = {}) {
  for (const fn of openWatchers) fn(dialog);
  openers.set(dialog, document.activeElement);
  if (returnTo) returns.set(dialog, returnTo);
  dialog.showModal();
  focus?.focus();
}
