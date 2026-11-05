// The 🎛️ key and its panel on 🥁 Beats (web/beat-menu.js; docs/design/beat-menu.md;
// Ben, 2026-11-05): the play line keeps ▶ Play (● Record), ↩️ ↪️ (✏️ Layout) and the key; the
// tempo, ⏲️ Click track, Bars, Feel, the time signature, 🎚️ Mixer and ⇆ Move pills are in one
// panel under it, ⌨️ Keys off and on. How the panel lays out at each width is
// `just look beat-menu builder-menu --wide`.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPage } from './fake-dom.mjs';
import { testManifest } from './test-board.mjs';
import { keysOn, keysOff, newBeatWithRow } from './new-beat.mjs';
import { beatMenu } from '../web/beat-menu.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

let page;
let $;
before(async () => {
  console.error = () => {};
  page = installPage({ manifest: testManifest() });
  $ = page.$;
  await (await import('../web/app.js')).ready;
  await page.settle();
});

const open = (k) => $(k).getAttribute('aria-expanded') === 'true';
const DECKS = [
  { name: '🥁 Beats', key: '#seq-tempo-key', menu: '#seq-menu', deck: '#seq-deck', click: '#seq-click', bars: '#seq-bars', swing: '#seq-swing', sigs: '#seq-sigs', keys: false },
  { name: '⌨️ Keys', key: '#dj-tempo-key', menu: '#dj-setup', deck: '.dj-bar', click: '#dj-beat-click', bars: '#dj-bars', swing: '#dj-swing', sigs: '#dj-sigs', keys: true },
];
const show = (d) => { if (d.keys) keysOn(page); else { keysOff(page); $('#beats-toggle').dispatch('click'); } };

for (const d of DECKS) {
  test(`${d.name}: the key is named with the tempo, starts closed, and opens and closes the panel`, () => {
    show(d);
    $(d.deck === '.dj-bar' ? '.dj-beatbar [data-beat-new]' : '.beat-bar [data-beat-new]').dispatch('click');
    const bpm = $(d.key).querySelector('.beat-key-num').textContent;
    assert.match($(d.key).getAttribute('aria-label'), new RegExp(`^Beat settings, tempo ${bpm}$`));
    assert.equal($(d.key).getAttribute('aria-controls'), d.menu.slice(1), 'it controls the panel');
    for (const glyph of $(d.key).children) assert.equal(glyph.getAttribute('aria-hidden'), 'true', 'the picture and the number are not read twice');
    assert.equal(open(d.key), false, 'closed to begin with');
    assert.ok(!$(d.deck).classList.contains('menu-open'));
    $(d.key).dispatch('click');
    assert.equal(open(d.key), true);
    assert.ok($(d.deck).classList.contains('menu-open'), 'the bar shows the panel under itself');
    $(d.key).dispatch('click');
    assert.equal(open(d.key), false, 'the key again closes it');
    assert.ok(!$(d.deck).classList.contains('menu-open'));
  });

  test(`${d.name}: Esc closes the panel with preventDefault and puts focus back on the key`, () => {
    show(d);
    $(d.key).dispatch('click');
    $(`${d.menu} [data-bars="2"]`).focus();
    const esc = $(`${d.menu} [data-bars="2"]`).dispatch('keydown', { key: 'Escape' });
    assert.equal(open(d.key), false);
    assert.equal(esc.defaultPrevented, true, 'the page\'s Esc (⏹️ Stop all) stands down, so a beat plays on');
    assert.ok(document.activeElement === $(d.key), 'focus is back on the key');
    const again = $(d.key).dispatch('keydown', { key: 'Escape' });
    assert.equal(again.defaultPrevented, false, 'closed, an Esc is the page\'s own');
  });

  test(`${d.name}: a control moved into the panel works from inside it (Bars, Feel, the time signature)`, async () => {
    show(d);
    $(d.key).dispatch('click');
    $(`${d.bars} [data-bars="2"]`).dispatch('click');
    assert.equal($(`${d.bars} [data-bars="2"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(open(d.key), true, 'choosing something leaves the panel open');
    $(`${d.swing} [data-swing="33"]`).dispatch('click');
    assert.equal($(`${d.swing} [data-swing="33"]`).getAttribute('aria-pressed'), 'true', 'Feel, at Regular');
    assert.equal($(d.sigs).hidden, true, 'the time signature is Advanced');
    const { setSetting } = await import('../web/settings.js');
    await setSetting('advancedBeats', true);
    show(d);
    assert.equal($(d.sigs).hidden, false);
    $(`${d.sigs} [data-sig="3/4"]`).dispatch('click');
    assert.equal($(`${d.sigs} [data-sig="3/4"]`).getAttribute('aria-pressed'), 'true');
    // ↩️ takes each of them back, one at a time (the parent seat's check).
    const undoBtn = $(`${d.deck} [data-beat-undo]`);
    undoBtn.dispatch('click');
    assert.equal($(`${d.sigs} [data-sig="4/4"]`).getAttribute('aria-pressed'), 'true', '↩️ takes back the time signature');
    undoBtn.dispatch('click');
    assert.equal($(`${d.swing} [data-swing="0"]`).getAttribute('aria-pressed'), 'true', 'and Feel');
    undoBtn.dispatch('click');
    assert.equal($(`${d.bars} [data-bars="1"]`).getAttribute('aria-pressed'), 'true', 'and Bars');
    await setSetting('advancedBeats', false);
    $(d.key).dispatch('click');
  });

  test(`${d.name}: a dot on the key and its name say ⏲️ Click track is on`, () => {
    show(d);
    const key = $(d.key);
    const on = () => $(d.click).getAttribute('aria-pressed') === 'true';
    if (on()) $(d.click).dispatch('click');
    assert.ok(!key.classList.contains('click-on'), 'no dot while the click is off');
    assert.doesNotMatch(key.getAttribute('aria-label'), /click/);
    $(d.click).dispatch('click');
    assert.equal(on(), true);
    assert.ok(key.classList.contains('click-on'), 'a dot while it is on, with the panel shut');
    assert.match(key.getAttribute('aria-label'), /^Beat settings, tempo \d+, click track on$/);
    $(d.click).dispatch('click');
    assert.ok(!key.classList.contains('click-on'));
  });
}

test('⌨️ Keys on shows ↩️ ↪️ and ✏️ Layout beside ● Record, and Feel in the panel; 🎤 Live shows none of them', () => {
  keysOn(page);
  $('.dj-beatbar [data-beat-new]').dispatch('click');
  const bar = $('.dj-bar');
  const undo = bar.querySelector('[data-beat-undo]');
  const redo = bar.querySelector('[data-beat-redo]');
  assert.equal(bar.querySelector('.beat-undo').hidden, false, '↩️ ↪️ show with a beat open');
  assert.equal(undo.getAttribute('aria-disabled'), 'true', 'faint with nothing to undo');
  $('#dj-bars [data-bars="2"]').dispatch('click');
  assert.equal(undo.getAttribute('aria-disabled'), 'false', 'a change lights ↩️ (wired like Beats\')');
  undo.dispatch('click');
  assert.equal(redo.getAttribute('aria-disabled'), 'false');
  redo.dispatch('click');
  undo.dispatch('click');
  assert.ok($('#dj-setup').contains($('#dj-swing')), 'Feel is in the panel');
  assert.equal($('#dj-change-tempo').hidden, false);
  $('#live-tab').dispatch('click');
  assert.equal($('#dj-tempo-key').hidden, true, 'no 🎛️ key on Live');
  assert.equal(bar.querySelector('.beat-undo').hidden, true, 'no ↩️ ↪️');
  assert.equal($('#dj-setup').hidden, true, 'no panel');
  keysOff(page);
  $('#pads-tab').dispatch('click');
});

test('the play line is only what is tapped while playing: ▶, ↩️ ↪️ and the key; no bars line', () => {
  const go = html.slice(html.indexOf('id="seq-deck"'), html.indexOf('id="seq-menu"'));
  assert.deepEqual([...go.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]), ['seq-deck', 'seq-play', 'seq-tempo-key']);
  assert.doesNotMatch(html, /class="beat-shape/, 'the bars line is gone from the bar');
  const menu = html.slice(html.indexOf('id="seq-menu"'), html.indexOf('id="seq-empty"'));
  const order = ['id="seq-tempo"', 'id="seq-click"', 'id="seq-bars"', 'id="seq-swing"', 'id="seq-sigs"', 'data-mixer', 'data-move-open'].map((m) => menu.indexOf(m));
  assert.ok(order.every((n, i) => n > (order[i - 1] ?? -1)), 'tempo, ⏲️, Bars, Feel, time signature, 🎚️, ⇆: in that order');
});

test('the panel in the CSS: a class, never an inline style; from 700 px its parts sit side by side', () => {
  assert.doesNotMatch(html.slice(html.indexOf('id="seq-deck"'), html.indexOf('id="seq-empty"')), /style="/);
  assert.match(css, /\.beat-deck\.menu-open > \.beat-menu \{ display: grid;/);
  assert.match(css, /@media \(min-width: 700px\) \{\n {2}\.beat-deck\.menu-open > \.beat-menu \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.beat-menu \.seq-barsel button\[aria-pressed="true"\]::before \{ content: "✓ "/, 'the chosen one shows a ✓ as well as yellow');
});

// ── A tap outside, on its own stand-in bar and document ──────────────────────────────

function standIn() {
  const deck = document.createElement('div');
  const key = document.createElement('button');
  key.innerHTML = '';
  const num = document.createElement('span');
  num.className = 'beat-key-num';
  key.append(num);
  const panel = document.createElement('div');
  const inside = document.createElement('button');
  panel.append(inside);
  const away = document.createElement('button');
  deck.append(key, panel);
  document.body.append(deck, away);
  const listeners = new Map();
  const doc = {
    addEventListener: (t, f) => listeners.set(t, [...(listeners.get(t) ?? []), f]),
    removeEventListener: (t, f) => listeners.set(t, (listeners.get(t) ?? []).filter((g) => g !== f)),
  };
  const send = (type, target) => {
    const e = { type, target, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    for (const f of listeners.get(type) ?? []) f(e);
    return e;
  };
  const menu = beatMenu(key, panel, deck, { bpm: () => 100, doc });
  return { menu, key, inside, away, send, deck };
}

test('a tap outside only closes the panel: it never reaches a pad or a pill under it', () => {
  const { menu, key, inside, away, send } = standIn();
  key.dispatch('click');
  assert.equal(menu.isOpen(), true);
  assert.equal(send('pointerdown', inside).stopped, false, 'a tap inside is its own');
  assert.equal(menu.isOpen(), true);
  const e = send('pointerdown', away);
  assert.equal(menu.isOpen(), false, 'outside closes it');
  assert.ok(e.stopped && e.prevented, 'and is swallowed: it plays nothing');
  assert.ok(send('pointerup', away).stopped, 'its release too');
  assert.ok(send('click', away).stopped, 'and its click');
  assert.equal(send('click', away).stopped, false, 'the next tap is the page\'s again');
  assert.equal(send('pointerdown', away).stopped, false, 'closed, nothing is listening');
});

test('a tap in a dialog on top (🎚️ Mixer) is not outside', () => {
  const { menu, key, send } = standIn();
  key.dispatch('click');
  const dialog = document.createElement('dialog');
  const inDialog = document.createElement('button');
  dialog.append(inDialog);
  document.body.append(dialog);
  assert.equal(send('pointerdown', inDialog).stopped, false);
  assert.equal(menu.isOpen(), true);
  menu.close();
});

test('a panel that is no longer on screen closes on the next tap and lets it through', () => {
  const { menu, key, away, send, deck } = standIn();
  key.dispatch('click');
  deck.setAttribute('hidden', '');   // another screen
  const e = send('pointerdown', away);
  assert.equal(menu.isOpen(), false);
  assert.equal(e.stopped, false, 'the tap is the page\'s');
});
