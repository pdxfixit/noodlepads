// The ⚙️ Settings dialog: Backups (its buttons live here, its code is in
// backup-ui.js; people are managed from the corner avatar, people.js), the
// person's Level (🧸 Kids · Regular · Advanced, ADR 0019),
// 📮 Problem reports (sending is log-send.js) and About. The button sits in the top corner, small and away from the pads and
// the toolbar where thumbs play, so it isn't pressed by accident.
//
// Every section but About folds under its heading (Ben, 2026-10-11: "each
// -other- settings section should be collapsible"). Which are open is this
// device's, remembered in localStorage `settings-open`; all start closed
// (Q22). A section marked `data-open-first` would start open until this
// device folds it; none is now (🔓 What's private left Settings for the
// shared privacy policy, Ben, 2026-10-16). About is always open and ends
// with the version, as the footer shows it.

import { SETTINGS, getSetting, setSetting, onSetting } from './settings.js';
import { openDialog, setupDialog } from './dialogs.js';
import { deviceCode, LIVE_HOST } from './log-send.js';
import { LAYOUT_NAMES } from './rhythm.js';
import { remember, recall } from './util.js';

const el = {};

// The dialog's status line (notices are mirrored there, ui.js).
const note = (text) => { el.note.textContent = text; };

// ── Folding sections ──

const OPEN_KEY = 'settings-open';

// The section ids remembered: only strings, and junk reads as none. The list
// names the sections open, and "!<id>" a section that starts open but was
// folded (so an older copy reading it finds no id it knows).
export function rememberedOpen(raw) {
  try {
    const list = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

// Whether `section` shows open, by what the device remembers.
export const startsOpen = (id, openFirst, remembered) => (openFirst ? !remembered.has(`!${id}`) : remembered.has(id));

const sections = () => [...el.dialog.querySelectorAll('.set-fold')];
const headOf = (section) => section.querySelector('.set-head');
const opensFirst = (section) => section.hasAttribute('data-open-first');

function showOpen(section, open) {
  const head = headOf(section);
  head.setAttribute('aria-expanded', String(open));
  head.querySelector('.set-head-caret').textContent = open ? '▾' : '▸';
  section.querySelector('.set-body').hidden = !open;
}

function keepOpen() {
  const list = [];
  for (const s of sections()) {
    const open = headOf(s).getAttribute('aria-expanded') === 'true';
    if (opensFirst(s) ? !open : open) list.push(opensFirst(s) ? `!${s.id}` : s.id);
  }
  remember(OPEN_KEY, JSON.stringify(list));
}

// Opens one section, for whatever points at it (`keep: false` when the
// app opens it for the kid, so it does not stay open next time by itself).
export function unfoldSettings(id, { keep = true } = {}) {
  const section = el.dialog?.querySelector(`#${id}`);
  if (!section?.classList.contains('set-fold')) return;
  showOpen(section, true);
  if (keep) keepOpen();
}

// Each level's name, and what it shows (ADR 0019).
export const LEVEL_NAMES = { kids: '🧸 Kids', regular: 'Regular', advanced: 'Advanced' };
export const LEVEL_HINTS = {
  kids: '🧸 Kids: big picture pads, a hold-to-record mic, a little beat and toy keys, for small kids. No deleting or editing. ⚙️ asks a grown-up sum to come back here.',
  regular: 'Regular: everything for making sounds, beats and songs.',
  advanced: "Advanced: the extra tools too. In the beat maker: Overlap, each row's speed (½×, 1×, 2×), swing and a time signature for each beat; the sharps and flats in the presets.",
};

// A heading's chip says the section's state at a glance, where there is one.
function chips() {
  const on = (v) => (v ? 'On' : 'Off');
  const words = {
    'set-beats': LEVEL_NAMES[getSetting('level')],
    'set-keys': LAYOUT_NAMES[getSetting('djLayout')] ?? '',
    'set-reports': on(getSetting('sendLogs') === true),
  };
  for (const section of sections()) {
    const chip = section.querySelector('.set-head-chip');
    const text = words[section.id] ?? '';
    chip.textContent = text;
    chip.hidden = !text;
  }
}

// Puts the controls in step with the stored settings and the current people.
export function syncSettingsControls() {
  for (const radio of el.radios) radio.checked = radio.dataset.value === getSetting(radio.getAttribute('name'));
  const level = getSetting('level');
  for (const b of el.levels) b.setAttribute('aria-pressed', String(b.dataset.level === level));
  el.levelHint.textContent = LEVEL_HINTS[level];
  el.shareUsage.checked = getSetting('sendUsage') === true;
  const reports = getSetting('sendLogs') === true;
  el.sendLogs.checked = reports;
  el.code.hidden = !reports;
  el.device.textContent = reports ? deviceCode() : '';
  el.where.hidden = !reports || globalThis.location?.hostname === LIVE_HOST;
  // Ben's wording, 2026-10-11; the version has its own line below it.
  el.about.textContent = 'Noodle Pads. Tap a pad, hold it to loop, record your own sounds and make beats. Made by the Sandberg Family.';
  el.aboutVersion.textContent = el.version.textContent || 'dev copy';
  chips();
}

let openSettings = () => {};
// Opens Settings, as the ⚙️ gear does (🧸 Kids, after the grown-up sum).
export const showSettings = () => openSettings();

// `gate()`: true when it took the ⚙️ tap itself (🧸 Kids asks a sum first).
// `onKids()`: 🧸 Kids was chosen, even when it already was (back to Kids
// after a grown-up's visit).
export function initSettingsUI({ gate = () => false, onKids = () => {} } = {}) {
  Object.assign(el, {
    open: document.querySelector('#settings-open'),
    dialog: document.querySelector('#settings-dialog'),
    note: document.querySelector('#settings-note'),
    about: document.querySelector('#about-text'),
    aboutVersion: document.querySelector('#about-version'),
    version: document.querySelector('#version'),
    radios: document.querySelector('#settings-dialog').querySelectorAll('input[type="radio"]'),
    levels: document.querySelector('#level-keys').querySelectorAll('[data-level]'),
    levelHint: document.querySelector('#level-hint'),
    sendLogs: document.querySelector('#send-logs'),
    shareUsage: document.querySelector('#share-usage'),
    code: document.querySelector('#send-logs-code'),
    device: document.querySelector('#send-logs-device'),
    where: document.querySelector('#send-logs-where'),
  });
  setupDialog(el.dialog);

  const open0 = rememberedOpen(recall(OPEN_KEY));
  for (const section of sections()) showOpen(section, startsOpen(section.id, opensFirst(section), open0));
  el.dialog.addEventListener('click', (e) => {
    const head = e.target.closest('.set-head');
    if (!head) return;
    showOpen(head.closest('.set-fold'), head.getAttribute('aria-expanded') !== 'true');
    keepOpen();
  });

  const open = (atEnd = false) => {
    note('');
    syncSettingsControls();
    openDialog(el.dialog);
    // The dialog is the box that scrolls; its end is About and the credits.
    if (atEnd) el.dialog.scrollTop = el.dialog.scrollHeight;
  };
  openSettings = () => open();
  el.open.addEventListener('click', () => { if (!gate()) open(); });
  // The level: three keys (ADR 0019). 🧸 Kids closes Settings and shows the kid's screens.
  document.querySelector('#level-keys').addEventListener('click', async (e) => {
    const key = e.target.closest('[data-level]');
    if (!key) return;
    try {
      await setSetting('level', key.dataset.level);
    } catch (err) {
      console.error('Changing the level failed:', err);
    }
    syncSettingsControls();
    if (key.dataset.level === 'kids') {
      el.dialog.close();
      onKids();
    }
  });
  // The version and date in the page footer open Settings at About (Ben, 2026-10-11).
  el.version.addEventListener('click', () => open(true));
  // The radios are named for the setting they set (timeSignature);
  // the switches are sendLogs and sendUsage, real booleans.
  el.dialog.addEventListener('change', async (e) => {
    const radio = e.target.closest('input[type="radio"]');
    const change = radio ? [radio.getAttribute('name'), radio.dataset.value]
      : e.target.closest('#send-logs') ? ['sendLogs', el.sendLogs.checked]
        : e.target.closest('#share-usage') ? ['sendUsage', el.shareUsage.checked] : null;
    if (!change) return;
    try {
      await setSetting(...change);
    } catch (err) {
      console.error('Changing a setting failed:', err);
    }
    syncSettingsControls();
  });
  // A loaded backup replaces the settings behind the dialog's back.
  for (const key of Object.keys(SETTINGS)) onSetting(key, syncSettingsControls);
}
