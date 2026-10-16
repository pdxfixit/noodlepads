import { readFileSync } from 'node:fs';
// The Settings dialog, run against the real app on the stand-in page: where
// People and Backups live, the Beats choice, Problem reports, About, and the
// fun default beat name. Sound is stubbed.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';

// How many sounds the shared kit has, so adding one doesn't break this file.
const KIT = JSON.parse(readFileSync(new URL('../web/boards.json', import.meta.url), 'utf8')).kit.length;

let page;
let $;
let getSetting;
let getLog;
let showNotice;

before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;   // drawn and wired
  ({ getSetting } = await import('../web/settings.js'));
  ({ getLog } = await import('../web/log.js'));
  ({ showNotice } = await import('../web/ui.js'));
  await page.settle();
});

test('the Settings button is in the header, named for screen readers, and opens the dialog', () => {
  const button = $('#settings-open');
  assert.equal(button.getAttribute('aria-label'), 'Settings');
  assert.ok($('.title-row').contains(button), 'up in the corner with the speaker grille');
  assert.ok(!$('.toolbar').contains(button), 'not in the toolbar where thumbs play');
  button.dispatch('click');
  assert.equal($('#settings-dialog').open, true);
});

// Ben, 2026-10-11: "people can leave settings, and the user avatar should be
// permanently visible". 👥 People is the corner menu's last line only.
test('Backups are in Settings; 👥 People lives in the corner avatar\'s menu, not Settings; the Edit sounds tools row is gone', () => {
  const dialog = $('#settings-dialog');
  for (const id of ['#backup-save', '#backup-file']) assert.ok(dialog.contains($(id)), id);
  assert.equal(dialog.contains($('#people-open')), false, 'People left Settings');
  assert.equal($('#set-people'), null);
  assert.ok($('#people').contains($('#people-open')), 'the corner menu holds 👥 People');
  $('#people-open').dispatch('click');
  assert.equal($('#people-dialog').open, true, 'and opens the People editor');
  $('#people-dialog').close();
  assert.equal($('#edit-tools'), null);
  assert.equal($('#edit-hint'), null, 'how to edit is in the footer, the one place for how-tos');
});

test('Settings has no time signature or row-tempo choice: each beat has its own signature', () => {
  const dialog = $('#settings-dialog');
  assert.equal(dialog.querySelectorAll('input[name="rowTempoMode"]').length, 0);   // Speed is the only row tempo now
  assert.equal(dialog.querySelectorAll('input[name="timeSignature"]').length, 0);
});

test('Level is three keys, Regular by default; Advanced offers the time signature and swing beside the bars', async () => {
  const sigs = $('#seq-sigs');
  const keys = $('#level-keys');
  const level = (l) => keys.querySelector(`[data-level="${l}"]`);
  // 🧸 Kids · Regular · Advanced (ADR 0019): Advanced is still stored as advancedBeats too.
  assert.deepEqual(keys.querySelectorAll('[data-level]').map((b) => b.textContent), ['🧸 Kids', 'Regular', 'Advanced']);
  assert.equal(getSetting('level'), 'regular');
  assert.equal(getSetting('advancedBeats'), false);
  document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-new]').dispatch('click');   // nothing is open until 🆕 New
  $('#settings-open').dispatch('click');
  assert.equal(level('regular').getAttribute('aria-pressed'), 'true');
  assert.equal(level('advanced').getAttribute('aria-pressed'), 'false');
  assert.equal($('#seq-shape').hidden, true);

  level('advanced').dispatch('click');
  await page.settle();
  assert.equal(getSetting('level'), 'advanced');
  assert.strictEqual(getSetting('advancedBeats'), true, 'a real boolean, not "true"');
  assert.equal(level('advanced').getAttribute('aria-pressed'), 'true');
  assert.match($('#level-hint').textContent, /swing/);
  assert.equal($('#seq-shape').hidden, false);
  // Swing: three keys, like the bars and time signature beside them.
  const swing = $('#seq-swing');
  assert.deepEqual(swing.querySelectorAll('[data-swing]').map((b) => b.textContent), ['Straight', 'Swing', 'Shuffle']);
  assert.equal(swing.querySelector('[data-swing="0"]').getAttribute('aria-pressed'), 'true');
  swing.querySelector('[data-swing="33"]').dispatch('click');
  assert.equal(swing.querySelector('[data-swing="33"]').getAttribute('aria-pressed'), 'true');
  swing.querySelector('[data-swing="0"]').dispatch('click');
  const buttons = sigs.querySelectorAll('[data-sig]');
  assert.deepEqual(buttons.map((b) => b.dataset.sig), ['4/4', '3/4', '5/4', '6/8', '7/8']);
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false', 'false']);
  buttons[3].dispatch('click');
  assert.deepEqual(sigs.querySelectorAll('[data-sig]').map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'false', 'true', 'false']);
  assert.equal(getSetting('advancedBeats'), true);

  level('regular').dispatch('click');
  await page.settle();
  assert.equal(getSetting('advancedBeats'), false);
  assert.equal($('#seq-shape').hidden, true, 'choosing needs Advanced; the beat keeps its 6/8');
  sigs.querySelector('[data-sig="4/4"]').dispatch('click');   // back to 4/4 for the tests after
  $('#settings-dialog').close();
});

test('the page footer has each screen\'s how-to, opposite the version', () => {
  const hint = () => $('#screen-hint').textContent;
  $('#pads-tab').dispatch('click');
  assert.match(hint(), /^Tap a pad/);
  $('#beats-toggle').dispatch('click');
  assert.match(hint(), /^Tap a pill/);
  $('#live-tab').dispatch('click');
  assert.match(hint(), /^Tap a key/);
  assert.ok($('.page-foot').contains($('#version')));
  $('#pads-tab').dispatch('click');
});

test('the footer how-tos are worded for the device: tap and hold on a touch screen, click, hold or Shift-click with a mouse', async () => {
  const { screenHint } = await import('../web/app.js');
  assert.match(screenHint('beats', false, false), /^Tap a pill to turn it on or off; hold it for a loud hit/);
  assert.match(screenHint('beats', false, true), /^Click a pill to turn it on or off; hold it or Shift-click for a loud hit/);
  assert.match(screenHint('live', false, false), /^Tap a key to play it/);
  assert.match(screenHint('live', false, true), /press it on the keyboard/);
  assert.match(screenHint('keys', false, false), /^Tap a key: its sound gets a row/, 'Beats with ⌨️ Keys on');
  assert.match(screenHint('keys', false, true), /^Click a key or press it/);
  assert.match(screenHint('pads', true, true), /^Editing: ✏️.*Click sounds to select them.*Alt/);
  assert.match(screenHint('pads', true, false), /^Editing: ✏️.*Tap sounds to select them.*Hold and drag/);
  assert.doesNotMatch(screenHint('beats', false, false), /again for a loud/, 'one tap is on or off now');
});

test('notices fade away by themselves: a bar hides, a line empties; a finger on it holds it', async () => {
  const { fadeAway, FADE_MS } = await import('../web/ui.js');
  const bar = document.createElement('div');
  bar.hidden = false;
  fadeAway(bar, 30);
  await new Promise((r) => setTimeout(r, 30 + FADE_MS + 60));
  assert.equal(bar.hidden, true);
  const line = document.createElement('p');
  line.textContent = 'Saved.';
  fadeAway(line, 30, { clear: true });
  line.dispatch('pointerenter');                      // held while a finger is on it
  await new Promise((r) => setTimeout(r, 30 + FADE_MS + 60));
  assert.equal(line.textContent, 'Saved.');
  line.dispatch('pointerleave');                      // and the wait starts again
  await new Promise((r) => setTimeout(r, 30 + FADE_MS + 60));
  assert.equal(line.textContent, '');
});

test('About says what the app is, and ends with the version on its own line', () => {
  // Ben, 2026-10-16: drop "Noodle Pads." from the start.
  assert.match($('#about-text').textContent, /^Tap a pad, hold it to loop, record your own sounds and make beats\. Made by the Sandberg Family\.$/);
  assert.equal($('#about-version').textContent, 'dev copy');
});

// Ben, 2026-10-11: "each -other- settings section should be collapsible".
// A heading button folds its section; About never folds. Which are open is
// this device's (localStorage settings-open); all start closed.
test('every Settings section but About folds under its heading, and the device remembers which are open', () => {
  const stored = new Map();
  globalThis.localStorage = { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, String(v)), removeItem: (k) => stored.delete(k) };
  try {
    const dialog = $('#settings-dialog');
    const folds = dialog.querySelectorAll('.set-fold');
    assert.deepEqual(folds.map((s) => s.id), ['set-sharing', 'set-backups', 'set-older', 'set-beats', 'set-look', 'set-keys', 'set-data']);
    assert.equal($('#about-text').closest('.set-fold'), null, 'About is always open');
    for (const s of folds) {
      const head = s.querySelector('.set-head');
      assert.equal(head.tagName.toLowerCase(), 'button', s.id);
      assert.equal(head.getAttribute('aria-expanded'), 'false', `${s.id} starts closed`);
      assert.equal($(`#${head.getAttribute('aria-controls')}`), s.querySelector('.set-body'));
      assert.equal(s.querySelector('.set-body').hidden, true);
    }
    // Tapping a heading opens it, and the device remembers.
    const keys = $('#set-keys');
    keys.querySelector('.set-head').dispatch('click', { bubbles: true });
    assert.equal(keys.querySelector('.set-head').getAttribute('aria-expanded'), 'true');
    assert.equal(keys.querySelector('.set-body').hidden, false);
    assert.equal(keys.querySelector('.set-head-caret').textContent, '▾');
    assert.deepEqual(JSON.parse(stored.get('settings-open')), ['set-keys']);
    // The heading's chip says the state at a glance.
    $('#settings-open').dispatch('click');
    assert.equal(keys.querySelector('.set-head-chip').textContent, 'Auto');
    assert.equal($('#set-backups').querySelector('.set-head-chip').hidden, true, 'no chip where there is nothing to say');
    $('#settings-dialog').close();
    // And again closes it.
    keys.querySelector('.set-head').dispatch('click', { bubbles: true });
    assert.equal(keys.querySelector('.set-body').hidden, true);
    assert.deepEqual(JSON.parse(stored.get('settings-open')), []);
  } finally {
    delete globalThis.localStorage;
  }
});

// Ben, 2026-10-16: "take the what's-private section out of the settings now
// that we have the privacy policy". 🔗 Sharing comes first and holds
// Shared with me. A section marked data-open-first would start open until
// folded; none is now, but startsOpen keeps that rule.
test('🔓 What\'s private is gone from Settings; 🔗 Sharing is first and holds Shared with me', async () => {
  const { startsOpen } = await import('../web/settings-ui.js');
  assert.equal($('#set-privacy'), null, 'no 🔓 What\'s private');
  assert.equal($('#settings-dialog').querySelectorAll('.set-fold')[0], $('#set-sharing'), '🔗 Sharing is first');
  assert.equal($('#settings-dialog').querySelectorAll('[data-open-first]').length, 0, 'nothing starts open');
  assert.ok($('#set-sharing').contains($('#shared-browse')), '🔗 Shared with me is under Sharing');
  assert.equal($('#set-cloud'), null, 'no ☁️ Cloud section is left');
  assert.equal(startsOpen('set-x', true, new Set()), true);
  assert.equal(startsOpen('set-x', true, new Set(['!set-x'])), false, 'folded here, it stays folded');
  assert.equal(startsOpen('set-keys', false, new Set(['set-keys'])), true);
  assert.equal(startsOpen('set-keys', false, new Set()), false, 'the others start closed (Q22)');
});

test('a remembered list of open sections reads junk as none', async () => {
  const { rememberedOpen } = await import('../web/settings-ui.js');
  assert.deepEqual([...rememberedOpen('["set-people",3,null]')], ['set-people']);
  assert.deepEqual([...rememberedOpen('{nope')], []);
  assert.deepEqual([...rememberedOpen('{"a":1}')], []);
  assert.deepEqual([...rememberedOpen(null)], []);
});

// Ben, 2026-10-11: "if the cloudflare logging is working, stow/hide/getridof
// the diagnostics bit in settings". Problem reports and the device code stay.
test('Settings has no Diagnostics section; 📮 Send problem reports stays', () => {
  const dialog = $('#settings-dialog');
  assert.equal($('#diag-copy'), null);
  assert.equal($('#diag-save'), null);
  assert.ok(!dialog.querySelectorAll('h3').some((h) => /diagnostics/i.test(h.textContent)));
  assert.ok(dialog.contains($('#send-logs')));
  assert.ok(dialog.contains($('#send-logs-device')));
});

// The dialog covers the page and makes the rest of it inert, so the banner
// moves inside it while it is open, and floats over it (a popover in the
// browser); it goes home when the dialog closes. Ben, 2026-10-16.
test('a notice with ⚙️ Settings open floats in the banner over the dialog, and is written to the log', () => {
  const dialog = $('#settings-dialog');
  if (!dialog.open) $('#settings-open').dispatch('click');
  showNotice('Saved a backup: test.');
  assert.equal($('#banner').hidden, false);
  assert.equal($('#banner-text').textContent, 'Saved a backup: test.');
  assert.ok(dialog.contains($('#banner')), 'inside the open dialog, so it is not inert');
  assert.equal($('#settings-note'), null, 'no status line of its own in the dialog');
  assert.ok(getLog().some((e) => e.kind === 'notice' && e.data.text === 'Saved a backup: test.'));
  dialog.close();
  assert.equal(dialog.contains($('#banner')), false, 'home again when the dialog closes');
  assert.equal($('#banner').hidden, false, 'still showing');
  $('#banner-close').dispatch('click');
  assert.equal($('#banner').hidden, true);
});

test('a kept beat gets a fun name, not "Beat 1"', () => {
  $('#settings-dialog').close();
  const bar = document.querySelectorAll('.beat-bar')[0];
  bar.querySelector('[data-beat-new]').dispatch('click');
  $('#seq-add').dispatch('click'); $('#chooser-ok').dispatch('click');
  bar.querySelector('[data-beat-keep]').dispatch('click');
  const name = document.querySelectorAll('.beat-bar')[0].querySelector('[data-beat-name]').value;
  assert.doesNotMatch(name, /^Beat \d+$/);
  assert.ok(name.length > 0 && name.length <= 24, name);
  assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

// 📮 Problem reports (Ben, 2026-10-11): off by default, a grown-up line, a
// device code shown while on and forgotten when switched off. Since
// 2026-10-16 a plain checkbox in About, right under 📊 Share play data, with
// no words about what a report holds (the shared policy says that).
test('Send problem reports is a checkbox under Share play data, off by default, with a grown-up line and a device code while on', async () => {
  const sw = $('#send-logs');
  assert.equal($('#set-reports'), null, 'no Problem reports fold');
  assert.equal(sw.getAttribute('role'), null, 'a checkbox, not a switch');
  assert.equal(sw.closest('.set-fold'), $('#set-data'), 'in 📊 Data sharing');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="share-usage"> 📊 Share play data<\/label>\s*<label class="set-check"><input type="checkbox" id="send-logs" aria-describedby="send-logs-grownup"> 📮 Send problem reports<\/label>\s*<p class="field-hint set-check-hint" id="send-logs-grownup">Ask a grown-up before you turn this on\.<\/p>/);
  assert.doesNotMatch(html, /never hold sounds|go only to Ben/, 'what a report holds is in the policy');
  assert.equal(getSetting('sendLogs'), false);
  $('#settings-open').dispatch('click');
  assert.equal(sw.checked, false);
  assert.equal($('#send-logs-code').hidden, true);

  sw.checked = true;
  sw.dispatch('change');
  await page.settle();
  assert.strictEqual(getSetting('sendLogs'), true);
  assert.equal($('#send-logs-code').hidden, false);
  const code = $('#send-logs-device').textContent;
  assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal($('#send-logs-where').hidden, false, 'this stand-in page is not the live site, and says so');

  sw.checked = false;
  sw.dispatch('change');
  await page.settle();
  assert.equal($('#send-logs-code').hidden, true);
  sw.checked = true;
  sw.dispatch('change');
  await page.settle();
  assert.notEqual($('#send-logs-device').textContent, code, 'switching off forgot the old code');
  sw.checked = false;
  sw.dispatch('change');
  await page.settle();
  $('#settings-dialog').close();
});

// Ben, 2026-10-16: "use B and 'Share play data' everywhere"; then "put the
// choices in a collapsing pane": 📊 Data sharing, the last fold before
// About, holds both checkboxes; then "drop privacy policy link from the
// collapsing section" (the version line in About keeps one).
test('📊 Share play data is a checkbox in 📊 Data sharing, the last fold, on by default', async () => {
  const fold = $('#set-data');
  const folds = $('#settings-dialog').querySelectorAll('.set-fold');
  assert.equal(folds[folds.length - 1], fold, 'the last fold, right above About');
  assert.equal($('#set-data-title').textContent, '📊 Data sharing');
  const sw = $('#share-usage');
  assert.equal(sw.getAttribute('type'), 'checkbox');
  assert.equal(sw.getAttribute('role'), null, 'a checkbox, not a switch');
  assert.equal(sw.closest('.set-fold'), fold);
  assert.ok(fold.contains($('#send-logs')), 'with 📮 Send problem reports');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /<label class="set-check"><input type="checkbox" id="share-usage"> 📊 Share play data<\/label>/, 'its name only');
  const body = html.slice(html.indexOf('id="set-data-body"'), html.indexOf('</section>', html.indexOf('id="set-data-body"')));
  const at = (s) => body.indexOf(s);
  assert.ok(at('id="share-usage"') >= 0 && at('id="share-usage"') < at('id="send-logs"'), 'then 📮 Send problem reports');
  assert.doesNotMatch(body, /privacy-link|Privacy policy/, 'no Privacy policy link in the fold');
  assert.equal(getSetting('sendUsage'), true);
  $('#settings-open').dispatch('click');
  assert.equal(sw.checked, true);
  assert.equal($('#set-data').querySelector('.set-head-chip').textContent, '📊 On');
  const { dataChip } = await import('../web/settings-ui.js');
  assert.deepEqual([dataChip(true, true), dataChip(false, true), dataChip(false, false)], ['📊📮 On', '📮 On', 'Off']);
  sw.checked = false;
  sw.dispatch('change');
  await page.settle();
  assert.strictEqual(getSetting('sendUsage'), false);
  assert.equal($('#set-data').querySelector('.set-head-chip').textContent, 'Off', 'the chip says both at a glance');
  sw.checked = true;
  sw.dispatch('change');
  await page.settle();
  assert.strictEqual(getSetting('sendUsage'), true);
  $('#settings-dialog').close();
});
