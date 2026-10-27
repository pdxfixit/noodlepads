// Where the usage events come from (web/track-page.js): one hook per
// category, and the rules that keep a kid's own words out of every record.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement } from './fake-dom.mjs';
import { createTelemetry } from '../web/telemetry.js';
import { setUsage } from '../web/usage.js';
import {
  controlName, groupOf, layoutOf, contentOf, appEventOf, errorOf, environment, browserOf, learnLabels, trackPage, PLAY,
} from '../web/track-page.js';

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  setUsage(true);
});

// A telemetry, started, whose shared client sends nothing and runs no timers.
function telemetry() {
  const tel = createTelemetry({
    globals: { window: {}, document: undefined, navigator: {}, storage: globalThis.localStorage, fetch: null, setInterval: () => 1, clearInterval: () => {} },
  });
  tel.setVersion('v');
  return tel;
}

const el = (tag, { id = '', cls = '', attrs = {}, text = '' } = {}, ...kids) => {
  const e = new FakeElement(tag, id);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.textContent = text;
  e.append(...kids);
  return e;
};

// A thing that holds listeners and fires them, as a document or window does.
function emitter(props = {}) {
  const on = new Map();
  return {
    ...props,
    addEventListener(type, fn) { on.set(type, [...(on.get(type) ?? []), fn]); },
    fire(type, ev = {}) { for (const fn of on.get(type) ?? []) fn({ type, ...ev }); },
  };
}

test('a control from the page is named by its first label; anything drawn later by its id, data- attribute or class, never its words', () => {
  const settings = el('button', { id: 'settings-open', attrs: { 'aria-label': 'Settings' } });
  const edit = el('button', { id: 'edit-toggle', text: '✏️ Edit' });
  const bar = el('div', { id: 'toolbar' }, settings, edit);
  learnLabels(bar);
  edit.textContent = '✅ Done';
  assert.equal(controlName(settings), 'Settings');
  assert.equal(controlName(edit), '✏️ Edit', 'its label as the page first drew it');
  // Drawn from a kid's own things: their words are in the label, never in the name.
  const mute = el('button', { cls: 'icon-btn', attrs: { 'aria-label': 'Mute Pip\'s burp', 'data-mute': '' } });
  assert.equal(controlName(mute), 'mute');
  const tool = el('button', { cls: 'pad-tool pad-edit', attrs: { 'aria-label': 'Edit Juno', 'data-id': 'user-123' } });
  assert.equal(controlName(tool), 'pad-tool', 'a record\'s id is never a name');
  assert.equal(controlName(el('button', { id: 'ke-save', text: 'Save Toby' })), 'ke-save');
  assert.equal(controlName(el('summary', { text: 'Wren' })), 'summary');
  assert.equal(groupOf(settings), 'toolbar');
});

test('layout says which arrangement showed a control: split on wide screens, the line\'s give-way step, a ⋯ menu', () => {
  const b = el('button', { id: 'x' });
  const line = el('div', { cls: 'seq-shape fit-tight fit-short' }, el('div', {}, b));
  el('div', { attrs: { role: 'menu' } }, line);
  assert.equal(layoutOf(b, 390), 'fit-short more');
  assert.equal(layoutOf(b, 1920), 'split fit-short more');
  assert.equal(layoutOf(el('button'), 800), 'base');
});

test('content: beats and songs played, recording into a beat, takes; a finish knows how long it ran', () => {
  const open = {};
  assert.deepEqual(contentOf({ kind: 'beat', data: { action: 'play' } }, open, 1000), ['content.start', { kind: 'beat', resumed: false }]);
  assert.deepEqual(contentOf({ kind: 'beat', data: { action: 'stop' } }, open, 4000), ['content.finish', { kind: 'beat', ms: 3000 }]);
  assert.equal(contentOf({ kind: 'beat', data: { action: 'stop' } }, open, 5000), null, 'a stop with nothing playing is nothing');
  contentOf({ kind: 'song', data: { action: 'play' } }, open, 0);
  assert.deepEqual(contentOf({ kind: 'song', data: { action: 'stop' } }, open, 9000), ['content.finish', { kind: 'song', ms: 9000 }]);
  contentOf({ kind: 'dj', data: { rec: 'start' } }, open, 0);
  assert.deepEqual(contentOf({ kind: 'dj', data: { rec: 'stop', added: 0, why: 'button' } }, open, 2000), ['content.abandon', { kind: 'beat-record', ms: 2000, why: 'empty' }]);
  contentOf({ kind: 'dj', data: { rec: 'start' } }, open, 0);
  assert.equal(contentOf({ kind: 'dj', data: { rec: 'grow' } }, open, 1), null);
  assert.equal(contentOf({ kind: 'dj', data: { rec: 'stop', added: 5 } }, open, 3000)[0], 'content.finish');
  contentOf({ kind: 'take', data: { rec: 'start' } }, open, 0);
  assert.deepEqual(contentOf({ kind: 'take', data: { rec: 'stop', made: true } }, open, 7000), ['content.finish', { kind: 'take', ms: 7000 }]);
  contentOf({ kind: 'take', data: { rec: 'start' } }, open, 0);
  assert.deepEqual(contentOf({ kind: 'take', data: { rec: 'stop', made: false } }, open, 500), ['content.abandon', { kind: 'take', ms: 500, why: 'empty' }]);
  assert.equal(contentOf({ kind: 'person', data: {} }, open, 0), null);
});

test("this app's own events: 💾 Keep, grooves, the cloud", () => {
  assert.deepEqual(appEventOf({ kind: 'beat', data: { action: 'keep' } }), ['noodlepads.keep', { kind: 'beat' }]);
  assert.deepEqual(appEventOf({ kind: 'song', data: { action: 'keep' } }), ['noodlepads.keep', { kind: 'song' }]);
  assert.deepEqual(appEventOf({ kind: 'beat', data: { action: 'groove' } }), ['noodlepads.groove', { action: 'load' }]);
  assert.deepEqual(appEventOf({ kind: 'beat', data: { action: 'sample' } }), ['noodlepads.groove', { action: 'sample' }]);
  assert.deepEqual(appEventOf({ kind: 'cloud', data: { shared: true } }), ['noodlepads.cloud', { action: 'share' }]);
  assert.deepEqual(appEventOf({ kind: 'cloud', data: { opened: 'share' } }), ['noodlepads.cloud', { action: 'share-open' }]);
  assert.equal(appEventOf({ kind: 'cloud', data: { synced: 3 } }), null);
});

test('an error keeps its kind and file:line, never its message', () => {
  assert.deepEqual(errorOf({ message: 'Pip broke it', source: 'https://noodlepads.com/app.js?v=1', line: 12 }), { kind: 'error', where: 'app.js:12', fatal: false });
  assert.deepEqual(errorOf({ message: 'nope' }), { kind: 'promise', where: 'promise', fatal: false });
  assert.deepEqual(errorOf({ storage: 'QuotaExceeded' }), { kind: 'storage', where: 'storage', fatal: false });
});

test('app.open carries the environment once: viewport, density, font scale, dark, motion, language, OS, input, installed', () => {
  const win = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    navigator: { language: 'en-US', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
    matchMedia: (q) => ({ matches: q.includes('dark') }),
    getComputedStyle: () => ({ fontSize: '20px' }),
    document: { documentElement: {} },
  };
  assert.deepEqual(environment(win, true), {
    first_run: true, vw: 390, vh: 844, density: 3, font_scale: 1.25, dark: true, reduced_motion: false, lang: 'en', os: 'iOS', input: 'touch', pwa: false, browser: 'safari',
  });
  assert.equal(environment({ navigator: { userAgent: 'X11; Linux x86_64' } }, false).os, 'Linux');
});

test('the browser family from the user agent: the Chrome-built ones are told apart from Chrome, and Safari from them all', () => {
  const ua = {
    chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    edgeAndroid: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
    opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  };
  assert.deepEqual(Object.fromEntries(Object.entries(ua).map(([k, v]) => [k, browserOf(v)])), {
    chrome: 'chrome', chromeIos: 'chrome', safari: 'safari', firefox: 'firefox', firefoxIos: 'firefox',
    edge: 'edge', edgeAndroid: 'edge', samsung: 'samsung', opera: 'opera',
  });
  assert.equal(browserOf('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148'), 'other', 'a web view with no browser name');
  assert.equal(browserOf(''), 'other');
  assert.equal(browserOf(undefined), 'other');
});

test('the hooks: open, screens, dialogs, controls (not play), settings, content, errors, hiding and showing', () => {
  let t = 0;
  const tel = telemetry();
  const doc = emitter({ visibilityState: 'visible', readyState: 'loading' });
  const win = emitter({ innerWidth: 800, innerHeight: 600, navigator: {} });
  const logs = [];
  const dialogWatchers = [];
  const settings = el('button', { id: 'settings-open', attrs: { 'aria-label': 'Settings' } });
  const pad = el('button', { cls: 'pad', text: 'Burp' });
  const body = el('body', { id: '' }, el('div', { id: 'toolbar' }, settings), pad);
  learnLabels(body);
  const page = trackPage({ telemetry: tel, onLog: (fn) => logs.push(fn), onDialogOpen: (fn) => dialogWatchers.push(fn), root: body, doc, win, now: () => t });
  const events = () => tel.queued().map((r) => r.event);
  assert.deepEqual(events(), ['app.open']);

  page.screen('pads');
  page.screen('pads');
  page.screen('beats');
  assert.deepEqual(tel.queued().slice(1).map((r) => [r.event, r.details.from ?? null]), [['screen.view', null], ['screen.view', 'pads']], 'once per change, with where from');
  assert.deepEqual(tel.queued().slice(1).map((r) => r.details.to), ['pads', 'beats'], 'and the screen reached');

  settings.dispatch('click', { pointerType: 'touch' });
  const use = tel.queued().at(-1);
  assert.deepEqual([use.event, use.details], ['control.use', { control: 'Settings', group: 'toolbar', layout: 'base', vw: 800, vh: 600, input: 'touch' }]);
  settings.click();
  assert.equal(tel.queued().at(-1).details.input, 'key', 'Enter or Space on a focused control');
  const n = tel.queued().length;
  pad.dispatch('click');
  settings.dispatch('click', { isTrusted: false });
  assert.equal(tel.queued().length, n, 'a pad is play, and a click made by code is no tap');
  assert.ok(pad.matches(PLAY));

  const dialog = el('dialog', { id: 'settings-dialog' });
  t = 1000;
  for (const fn of dialogWatchers) fn(dialog);
  t = 4000;
  dialog.close();
  dialog.close();
  assert.deepEqual(tel.queued().slice(-2).map((r) => [r.event, r.details]), [
    ['dialog.open', { dialog: 'settings-dialog' }],
    ['dialog.close', { dialog: 'settings-dialog', ms: 3000 }],
  ], 'closed once, with how long it was open');

  const log = (kind, data) => { for (const fn of logs) fn({ kind, data }); };
  log('setting', { key: 'level', value: 'kids', was: 'regular' });
  log('beat', { action: 'play' });
  t = 6000;
  log('beat', { action: 'stop' });
  log('error', { message: 'secret words', source: 'sheet.js', line: 7 });
  assert.deepEqual(tel.queued().slice(-4).map((r) => [r.event, r.details]), [
    ['setting.change', { key: 'level', from: 'regular', to: 'kids' }],
    ['content.start', { kind: 'beat', resumed: false }],
    ['content.finish', { kind: 'beat', ms: 2000 }],
    ['error', { kind: 'error', where: 'sheet.js:7', fatal: false }],
  ]);
  assert.ok(!JSON.stringify(tel.queued()).includes('secret words'));

  t = 10_000;
  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  t = 70_000;
  doc.visibilityState = 'visible';
  doc.fire('visibilitychange');
  assert.deepEqual(tel.queued().slice(-2).map((r) => [r.event, r.details]), [['app.background', { shown_ms: 10_000 }], ['app.foreground', { away_ms: 60_000 }]]);
});

test('the level goes once a page load, right after app.open, and only a real level', () => {
  const tel = telemetry();
  const page = trackPage({ telemetry: tel, root: null, doc: emitter({ visibilityState: 'visible' }), win: emitter({ navigator: {} }), now: () => 0 });
  page.level('typo');
  page.level(undefined);
  assert.deepEqual(tel.queued().map((r) => r.event), ['app.open'], 'not a level, not sent');
  page.level('kids');
  page.level('advanced');
  assert.deepEqual(tel.queued().map((r) => [r.event, r.details.level ?? null]), [['app.open', null], ['noodlepads.level', 'kids']], 'once, whatever it is later');
  setUsage(false);
  const off = telemetry();
  trackPage({ telemetry: off, root: null, doc: emitter({}), win: emitter({ navigator: {} }), now: () => 0 }).level('regular');
  assert.deepEqual(off.queued(), [], 'with the usage switch off, nothing');
});

test('perf.load once the page has loaded, with whether it came over the network', async () => {
  const tel = telemetry();
  const nav = { loadEventEnd: 812.4, transferSize: 5000 };
  const win = emitter({ performance: { getEntriesByType: () => [nav] }, navigator: {} });
  trackPage({ telemetry: tel, doc: emitter({ readyState: 'loading' }), win });
  win.fire('load');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(tel.queued().find((r) => r.event === 'perf.load').details, { ms: 812, cold: true });
});

// ADR 0027: the sound's delay and the play counts, once a visit, as the page hides.
test('hiding the page sends the sound\'s delay and what was played, once, and only when there is something', async () => {
  const { countPlay, clearPlay } = await import('../web/play-count.js');
  const tel = telemetry();
  const doc = emitter({ visibilityState: 'visible', readyState: 'loading' });
  let delay = null;
  trackPage({ telemetry: tel, doc, win: emitter({ innerWidth: 800, navigator: {} }), now: () => 0, latency: () => delay });
  const hide = () => { doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); doc.visibilityState = 'visible'; doc.fire('visibilitychange'); };
  const sent = () => tel.queued().filter((r) => r.event === 'perf.latency' || r.event === 'noodlepads.play').map((r) => [r.event, r.details]);
  hide();
  assert.deepEqual(sent(), [], 'no sound played, nothing played: nothing sent');
  delay = 23.6;
  for (const k of ['pads', 'pads', 'pads', 'keys', 'notes', 'blocks', 'kids', 'nope']) countPlay(k);
  hide();
  assert.deepEqual(sent(), [['perf.latency', { ms: 24 }], ['noodlepads.play', { pads: 3, keys: 1, notes: 1, blocks: 1, kids: 1 }]]);
  hide();
  assert.equal(sent().filter(([e]) => e === 'noodlepads.play').length, 1, 'taken once: the next visit starts from zero');
  countPlay('pads');
  clearPlay();
  hide();
  assert.equal(sent().filter(([e]) => e === 'noodlepads.play').length, 1, 'a cleared count (the switch went off) is not sent');
});

test('what the kid made in one step is a content.finish: a sound recorded on Kids, sounds chopped, a voice rendered', () => {
  assert.deepEqual(contentOf({ kind: 'kids', data: { recorded: 2.4, voice: 'normal' } }, {}, 0), ['content.finish', { kind: 'sound-record', ms: 2400 }]);
  assert.equal(contentOf({ kind: 'kids', data: { tab: 'pads' } }, {}, 0), null, 'a tab change is no recording');
  assert.deepEqual(contentOf({ kind: 'chop', data: { made: 3 } }, {}, 0), ['content.finish', { kind: 'chop' }]);
  assert.equal(contentOf({ kind: 'chop', data: { found: 3, seconds: 4 } }, {}, 0), null, 'finding marks makes nothing yet');
  assert.deepEqual(contentOf({ kind: 'render', data: { voice: 'robot', ms: 80, seconds: 1 } }, {}, 0), ['content.finish', { kind: 'voice', ms: 80 }]);
});

test('play-count counts nothing while the usage switch is off', async () => {
  const { countPlay, takePlay } = await import('../web/play-count.js');
  setUsage(false);
  countPlay('pads');
  setUsage(true);
  assert.equal(takePlay(), null);
});

test('errorSig names where an error came from, never its message', async () => {
  const { errorSig } = await import('../web/track-page.js');
  assert.equal(errorSig({ source: 'https://noodlepads.com/sheet.js?v=3#x', line: 7, message: 'Pip broke it' }), 'sheet.js:7');
  assert.equal(errorSig({ source: 'https://elsewhere.test/Some Odd File.js', line: 1 }), 'other', 'a file name that is not a module name');
  assert.equal(errorSig({ storage: 'Quota' }), 'storage');
  assert.equal(errorSig({ message: 'x' }), 'promise');
});
