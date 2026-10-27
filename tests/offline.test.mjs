// Installing the app and opening it with no network: the service worker
// (web/sw.js), its registration (web/offline.js) and the manifest. There is
// no browser here, so the worker runs on stand-ins for the network, the
// cache and its events; that it really installs is checked with `just look`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import vm from 'node:vm';
import { registerOffline } from '../web/offline.js';
import { initUpdate } from '../web/update.js';

const WEB = new URL('../web/', import.meta.url).pathname;
const SCOPE = 'https://noodlepads.com/';
const code = readFileSync(join(WEB, 'sw.js'), 'utf8');

// Files in web/ the app never loads, each with its reason. Anything else in
// web/ must be in the worker's SHELL, or it would be missing offline.
const NOT_LOADED = new Map([
  ['_headers', 'Cloudflare reads it; it is never served'],
  ['sw.js', 'the worker itself: the browser fetches it, past the worker'],
  ['version.json', 'written at deploy, and network only'],
  ['version.js', 'the release, read by the deploy (site.conf release=) and the tools, never by the page'],
  ['privacy.js', 'the "What\'s private" lines, read by README and tests/privacy.test.mjs; the page links the shared policy instead'],
  ['fonts/OFL-anybody.txt', 'a license, beside the font'],
  ['fonts/OFL-atkinson-next.txt', 'a license, beside the font'],
  ['clips/kit/LICENSE-samples.txt', 'where the recorded instruments came from, beside them'],
]);

function filesIn(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;   // .assetsignore, .DS_Store: never uploaded
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesIn(full));
    else out.push(relative(WEB, full).split(sep).join('/'));
  }
  return out;
}

// The worker on stand-ins. `net` answers a path with a body, or throws when
// `offline`; `caches` keeps answers in memory, addAll all or nothing.
function worker({ files = {}, offline = false } = {}) {
  const w = { offline, files, fetched: [], listeners: {}, skipped: false, claimed: false };
  const answer = (body, status = 200) => {
    const res = new Response(body, { status });
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };
  w.fetch = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    w.fetched.push(url);
    if (w.offline) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname.slice(1);
    return path in w.files ? answer(w.files[path]) : answer('not found', 404);
  };
  const stores = new Map();
  const cacheFor = () => {
    const kept = new Map();
    const keyOf = (k) => (typeof k === 'string' ? k : k.url);
    return {
      kept,
      put: async (k, res) => { kept.set(keyOf(k), await res.text()); },
      match: async (k) => (kept.has(keyOf(k)) ? new Response(kept.get(keyOf(k))) : undefined),
      addAll: async (reqs) => {
        const got = [];
        for (const r of reqs) {
          const res = await w.fetch(r);
          if (!res.ok) throw new TypeError(`${r.url}: ${res.status}`);
          got.push([r.url, await res.text()]);
        }
        for (const [k, v] of got) kept.set(k, v);
      },
    };
  };
  w.caches = {
    open: async (name) => { if (!stores.has(name)) stores.set(name, cacheFor()); return stores.get(name); },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  w.kept = (name = 'noodlepads-app') => stores.get(name)?.kept ?? new Map();
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type, fn) => { w.listeners[type] = fn; },
    skipWaiting: async () => { w.skipped = true; },
    clients: { claim: async () => { w.claimed = true; } },
  };
  const ctx = vm.createContext({
    self, caches: w.caches, fetch: (r) => w.fetch(r), Request, Response, Headers, URL, TypeError, Promise,
  });
  w.sw = vm.runInContext(`${code}\n;({ SHELL, route, keyFor, MARK, CACHE, refresh })`, ctx);
  // Fires a fetch event; resolves to the answer (or 'passed'), after its waits.
  w.request = async (path, { mode = 'cors', method = 'GET' } = {}) => {
    const waits = [];
    let answered = null;
    w.listeners.fetch({
      request: { url: new URL(path, SCOPE).href, method, mode },
      respondWith: (p) => { answered = p; },
      waitUntil: (p) => { waits.push(p); },
    });
    if (!answered) return 'passed';
    const res = await answered;
    for (let i = 0; i < waits.length; i++) await waits[i];   // waits may add waits
    return res;
  };
  w.lifecycle = async (type) => {
    let wait = Promise.resolve();
    w.listeners[type]({ waitUntil: (p) => { wait = p; } });
    return wait;
  };
  return w;
}

// Every SHELL file, as the site would serve it.
const site = (version = 'aaa1111') => {
  const files = { 'version.json': JSON.stringify({ version }) };
  for (const p of worker().sw.SHELL) files[p === './' ? '' : p] = `${p} @ ${version}`;
  return files;
};

test('the worker keeps every file the app can load, and only files that are there', () => {
  const SHELL = [...worker().sw.SHELL];   // out of the worker's realm, for deepEqual
  const listed = SHELL.map((p) => (p === './' ? 'index.html' : p));
  assert.equal(new Set(listed).size, listed.length, 'SHELL names a file twice');
  const there = filesIn(WEB).filter((f) => !NOT_LOADED.has(f));
  const missing = there.filter((f) => !listed.includes(f));
  const gone = listed.filter((f) => !there.includes(f));
  assert.deepEqual(missing, [], `in web/ but not in sw.js SHELL (add it there, or to NOT_LOADED here with why): ${missing}`);
  assert.deepEqual(gone, [], `in sw.js SHELL but not in web/: ${gone}`);
});

test('route: /api/ and other sites pass through, version.json is its own, the rest is network first', () => {
  const { route } = worker().sw;
  const r = (path, method = 'GET') => route(new URL(path, SCOPE).href, method, SCOPE);
  assert.equal(r('api/cloud'), 'pass');
  assert.equal(r('api/profiles/p-1/records?since=3'), 'pass');
  assert.equal(r('api/events', 'POST'), 'pass');
  assert.equal(r('api'), 'pass');
  assert.equal(r('app.js', 'POST'), 'pass');
  assert.equal(r('sw.js'), 'pass');
  assert.equal(route('https://privacy.pdxfixit.com/noodlepads/', 'GET', SCOPE), 'pass');
  assert.equal(r('version.json'), 'version');
  assert.equal(r('version.json?x=1'), 'version');
  assert.equal(r(''), 'network');
  assert.equal(r('app.js'), 'network');
  assert.equal(r('clips/kit/moo.wav'), 'network');
  assert.equal(r('apiary.js'), 'network');   // only the api/ folder passes
});

test('keyFor: the page is one key whatever its query; files drop theirs; others are not kept', () => {
  const { keyFor } = worker().sw;
  const k = (path) => keyFor(new URL(path, SCOPE).href, SCOPE);
  assert.equal(k(''), SCOPE);
  assert.equal(k('?bg=dots'), SCOPE);
  assert.equal(k('index.html'), SCOPE);
  assert.equal(k('boards.json?x=1'), `${SCOPE}boards.json`);
  assert.equal(k('clips/kit/moo.wav'), `${SCOPE}clips/kit/moo.wav`);
  assert.equal(k('nope.js'), null);
});

const isClip = (p) => p.startsWith('clips/');

// Install, then activate, then the clips' fill that activate starts (it is
// not waited for by the lifecycle, so the test waits for it here).
async function installed(w) {
  await w.lifecycle('install');
  await w.lifecycle('activate');
  await w.sw.refresh();
}

test('install keeps the app and its version first, then takes over at once', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  const kept = w.kept();
  assert.equal(kept.get(`${SCOPE}app.js`), 'app.js @ aaa1111');
  assert.equal(kept.get(SCOPE), './ @ aaa1111');
  assert.equal(JSON.parse(kept.get(`${SCOPE}${w.sw.MARK}`)).version, 'aaa1111');
  const app = [...w.sw.SHELL].filter((p) => !isClip(p));
  assert.equal(kept.size, app.length + 1, 'the app and its mark, not one clip');
  assert.ok(![...kept.keys()].some((k) => k.includes('/clips/')), 'the clips wait for activate');
  assert.ok(w.skipped);
  await w.lifecycle('activate');
  assert.ok(w.claimed);
});

test('the clips come after the app, off the install, and the app is whole before the first one', async () => {
  const w = worker({ files: site() });
  const order = [];
  const fetchOne = w.fetch;
  w.fetch = async (req) => { order.push(typeof req === 'string' ? req : req.url); return fetchOne(req); };
  await installed(w);
  const firstClip = order.findIndex((u) => u.includes('/clips/'));
  const lastApp = order.map((u) => !u.includes('/clips/') && !u.endsWith('version.json')).lastIndexOf(true);
  assert.ok(firstClip > lastApp, 'every app file was asked for before the first clip');
  assert.equal(w.kept().get(`${SCOPE}clips/kit/moo.wav`), 'clips/kit/moo.wav @ aaa1111');
  assert.equal(w.kept().get(`${SCOPE}clips/kit/piano-61.wav`), 'clips/kit/piano-61.wav @ aaa1111');
  assert.equal(w.kept().size, w.sw.SHELL.length + 2, 'every file, the app mark and the clips mark');
});

test('the activate event settles without waiting for the clips', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetchOne = w.fetch;
  w.fetch = async (req) => { if ((req.url ?? req).includes('/clips/')) await gate; return fetchOne(req); };
  await w.lifecycle('activate');           // resolves though every clip is held
  assert.ok(w.claimed);
  assert.equal(w.kept().has(`${SCOPE}clips/kit/moo.wav`), false);
  release();
  await w.sw.refresh();
  assert.equal(w.kept().has(`${SCOPE}clips/kit/moo.wav`), true);
});

test('a clip that will not come does not fail the install; the next page load asks for the clips again', async () => {
  const files = site();
  delete files['clips/kit/moo.wav'];
  const w = worker({ files });
  await installed(w);                      // nothing rejects
  assert.equal(w.kept().get(`${SCOPE}app.js`), 'app.js @ aaa1111', 'the app is kept');
  assert.equal(w.kept().has(`${SCOPE}clips/kit/moo.wav`), false);
  assert.equal(w.kept().get(`${SCOPE}clips/kit/woof.wav`), 'clips/kit/woof.wav @ aaa1111', 'the other clips are kept');
  assert.equal(w.kept().has(`${SCOPE}__precached-clips.json`), false, 'a set that is not whole is not marked');
  files['clips/kit/moo.wav'] = 'clips/kit/moo.wav @ aaa1111';
  await w.request('', { mode: 'navigate' });
  assert.equal(w.kept().get(`${SCOPE}clips/kit/moo.wav`), 'clips/kit/moo.wav @ aaa1111');
  assert.ok(w.kept().has(`${SCOPE}__precached-clips.json`));
});

test('clips fetched offline at install time are tried again on the next visit, with the app still whole', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  w.offline = true;
  await w.lifecycle('activate');
  await w.sw.refresh();                    // quiet, as when a phone goes offline mid-fill
  assert.equal(w.kept().get(`${SCOPE}app.js`), 'app.js @ aaa1111');
  assert.equal(w.kept().has(`${SCOPE}clips/kit/moo.wav`), false);
  w.offline = false;
  await w.request('', { mode: 'navigate' });
  assert.equal(w.kept().has(`${SCOPE}clips/kit/moo.wav`), true);
});

test('install fails, keeping nothing, when an app file will not come', async () => {
  const files = site();
  delete files['help.js'];
  const w = worker({ files });
  await assert.rejects(w.lifecycle('install'));
  assert.equal(w.kept().size, 0);
  assert.equal(w.skipped, false);
});

test('online, every answer comes from the network, and refreshes the kept copy', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  w.files['app.js'] = 'app.js @ new';
  const res = await w.request('app.js');
  assert.equal(await res.text(), 'app.js @ new');
  assert.equal(w.kept().get(`${SCOPE}app.js`), 'app.js @ new');
});

test('offline, the kept copy answers, the page whatever its query', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  w.offline = true;
  assert.equal(await (await w.request('app.js')).text(), 'app.js @ aaa1111');
  assert.equal(await (await w.request('?bg=dots', { mode: 'navigate' })).text(), './ @ aaa1111');
  await assert.rejects(w.request('nope.js'));   // never kept: fails as with no worker
});

test('/api/ is never touched, online or off', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  const before = w.fetched.length;
  assert.equal(await w.request('api/cloud'), 'passed');
  assert.equal(await w.request('api/events', { method: 'POST' }), 'passed');
  assert.equal(w.fetched.length, before);
  assert.ok(![...w.kept().keys()].some((k) => k.includes('/api/')));
});

test('version.json comes from the network and is never kept; offline it says what is kept, marked', async () => {
  const w = worker({ files: site() });
  await w.lifecycle('install');
  w.files['version.json'] = JSON.stringify({ version: 'bbb2222' });
  const live = await w.request('version.json');
  assert.equal(JSON.parse(await live.text()).version, 'bbb2222');
  assert.equal(live.headers.get('X-Noodle-Offline'), null);
  assert.ok(!w.kept().has(`${SCOPE}version.json`));
  w.offline = true;
  const off = await w.request('version.json');
  assert.equal(JSON.parse(await off.text()).version, 'aaa1111');
  assert.equal(off.headers.get('X-Noodle-Offline'), '1');
});

test('offline before anything is kept, version.json fails as with no worker', async () => {
  const w = worker({ offline: true });
  await assert.rejects(w.request('version.json'));
});

test('a page load after a new version went live fills the cache again; the same version does not', async () => {
  const w = worker({ files: site('aaa1111') });
  await w.lifecycle('install');
  await w.lifecycle('activate');
  await w.sw.refresh();
  let before = w.fetched.length;
  await w.request('', { mode: 'navigate' });
  assert.equal(w.fetched.length - before, 2, 'the page, then version.json, and no refill');
  Object.assign(w.files, site('bbb2222'));
  before = w.fetched.length;
  await w.request('', { mode: 'navigate' });
  assert.ok(w.fetched.length - before > w.sw.SHELL.length, 'a refill');
  assert.equal(w.kept().get(`${SCOPE}emoji-all.js`), 'emoji-all.js @ bbb2222');
  assert.equal(JSON.parse(w.kept().get(`${SCOPE}${w.sw.MARK}`)).version, 'bbb2222');
});

test('activate drops older caches of this app, and nothing else', async () => {
  const w = worker({ files: site() });
  await w.caches.open('noodlepads-old');
  await w.caches.open('someone-else');
  await w.lifecycle('install');
  await w.lifecycle('activate');
  assert.deepEqual((await w.caches.keys()).sort(), ['noodlepads-app', 'someone-else']);
});

test('the update check takes the offline answer for no news', async () => {
  let fetchVersion = null;
  const bar = { hidden: true };
  const api = initUpdate({
    bar, loaded: () => 'aaa1111', busy: () => false,
    fetch: async () => fetchVersion(),
    every: () => {}, doc: null, win: null, now: () => 0,
  });
  const offlineAnswer = { ok: true, headers: new Headers({ 'X-Noodle-Offline': '1' }), json: async () => ({ version: 'zzz9999' }) };
  fetchVersion = () => offlineAnswer;
  await api.ask();
  assert.equal(api.live(), null);
  assert.equal(bar.hidden, true);
  fetchVersion = () => ({ ok: true, headers: new Headers(), json: async () => ({ version: 'bbb2222' }) });
  await api.ask();
  assert.equal(api.live(), 'bbb2222');
  assert.equal(bar.hidden, false);
});

test('registerOffline: nothing without service workers; after the page loads with them', () => {
  assert.equal(registerOffline({ nav: {}, win: null, doc: null }), false);
  assert.equal(registerOffline({ nav: undefined }), false);

  const registered = [];
  const nav = { serviceWorker: { register: async (url) => { registered.push(url); } } };
  let onLoad = null;
  const win = { addEventListener: (type, fn) => { if (type === 'load') onLoad = fn; } };
  assert.equal(registerOffline({ nav, win, doc: { readyState: 'interactive' } }), true);
  assert.deepEqual(registered, []);
  onLoad();
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.deepEqual(registered, ['sw.js']);
  });
});

test('registerOffline: a refused registration is quiet', async () => {
  const nav = { serviceWorker: { register: async () => { throw new Error('SecurityError'); } } };
  let unhandled = null;
  const watch = (err) => { unhandled = err; };
  process.on('unhandledRejection', watch);
  registerOffline({ nav, doc: { readyState: 'complete' } });
  await new Promise((r) => setTimeout(r, 10));
  process.off('unhandledRejection', watch);
  assert.equal(unhandled, null);
});

test('the page links the manifest and the iPhone icon; the manifest names what installs', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="app-icons\/apple-touch-icon\.png">/);
  const m = JSON.parse(readFileSync(join(WEB, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Noodle Pads');
  assert.equal(m.short_name, 'Noodle Pads');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#1F3FA8');
  assert.equal(m.background_color, '#1F3FA8');
  assert.match(html, /<meta name="theme-color" content="#1F3FA8">/);
  const png = (src) => readFileSync(join(WEB, src));
  for (const icon of m.icons) {
    const data = png(icon.src);
    assert.equal(data.subarray(1, 4).toString(), 'PNG', icon.src);
    const [w, h] = [data.readUInt32BE(16), data.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    assert.ok(data.length < 16_000, `${icon.src} is small`);
  }
  assert.deepEqual(m.icons.map((i) => `${i.sizes} ${i.purpose}`).sort(), ['192x192 any', '512x512 any', '512x512 maskable']);
  const apple = png('app-icons/apple-touch-icon.png');
  assert.equal(apple.readUInt32BE(16), 180);
});
