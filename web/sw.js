// The service worker: lets Noodle Pads open with no network after one visit,
// which installing it as an app needs (registered by offline.js).
//
// Online it changes nothing. Every request goes to the network first, as
// before, and the copy kept here is used only when the network fails: the
// site deploys on every push to main, and _headers says no-cache so tablets
// get new code on their next load. This must never serve stale code online.
//
//   /api/      passes straight through, never kept (cloud sync, reports, events)
//   version.json  network only, never kept, so the 🆕 update check stays
//              truthful. With no network it answers with the version this
//              cache holds, marked X-Noodle-Offline: the corner still names
//              the code that is running, and update.js ignores the answer.
//   the rest   network first; each good answer refreshes the kept copy, so
//              the offline copy tracks the live site
//
// The whole app (SHELL) is fetched when the worker installs, and again when
// a page load finds a new version.json, so a module only some screens load
// (emoji-all.js) never stays a version behind the rest offline.
//
// A classic script, not a module: every browser that installs apps runs
// these. Plain functions, so tests/offline.test.mjs can load this file and
// drive it with stand-ins.

const CACHE = 'noodlepads-app';
// Where the cache keeps the version.json it was last filled from. Not a
// file on the site; the worker writes and reads it only.
const MARK = '__precached-version.json';

const KIT = [
  'airhorn', 'alarm', 'bass-a', 'bass-as', 'bass-c', 'bass-cs', 'bass-d', 'bass-ds', 'bass-e', 'bass-f', 'bass-fs',
  'bass-g', 'bass-gs', 'beam', 'blip', 'bloop', 'boing', 'bongo', 'bonk', 'boom-word', 'boom', 'bruh', 'burp',
  'buzz', 'buzzer', 'cackle', 'cajon', 'chord-a', 'chord-am', 'chord-bb', 'chord-bm', 'chord-c', 'chord-cm',
  'chord-csm', 'chord-d', 'chord-dm', 'chord-e', 'chord-eb', 'chord-em', 'chord-f', 'chord-fsm', 'chord-g',
  'chord-g7', 'chord-gm', 'clap', 'clave', 'coin', 'computer', 'conga', 'countdown', 'cowbell', 'crash', 'dhol-high',
  'dhol', 'ding', 'djembe-slap', 'djembe', 'drop-the-beat', 'drumroll', 'evil-laugh', 'explosion', 'game-over', 'gg',
  'glide', 'go', 'hat-roll', 'heartbeat', 'hihat', 'honk', 'horn-stab', 'jump', 'kazoo', 'kick-dusty', 'kick',
  'laser', 'lets-go', 'level-up', 'log-drum', 'meow', 'moo', 'nice', 'no-way', 'note-a', 'note-as', 'note-b',
  'note-c-high', 'note-c', 'note-cs', 'note-d', 'note-ds', 'note-e', 'note-f', 'note-fs', 'note-g', 'note-gs',
  'oh-yeah', 'one-up', 'oof', 'open-hat', 'pew', 'phaser', 'plink', 'pop', 'power-up', 'quack', 'raspberry', 'ready',
  'red-alert', 'rewind', 'ribbit', 'ride', 'rim', 'rimshot', 'roar', 'robot', 'sad-trombone', 'scratch', 'shaker',
  'siren', 'slide-whistle', 'snap', 'snare-808', 'snare-dusty', 'snare', 'splat', 'squeak', 'tada', 'taiko',
  'tambourine', 'teleport', 'tom-fill', 'tom-high', 'tom-low', 'toot', 'tweet', 'ufo', 'vinyl', 'warp', 'whoosh',
  'woodblock', 'woof', 'wow', 'yes', 'zap', 'zip',
];
// The instruments' recordings (ADR 0030): every note and chord of one plays
// one of these, so none of them has a file of its own.
const INSTRUMENT_FILES = [
  '808-40', 'brass-67', 'chip-66', 'flute-64', 'guitar-57', 'guitar-66', 'kalimba-66', 'marimba-66', 'organ-63',
  'piano-61', 'piano-69', 'steel-66', 'strings-62', 'strings-69', 'upright-40',
];
const BG = [
  'bolts', 'bubbles', 'checks', 'confetti', 'diamonds', 'dots', 'drops', 'flowers', 'grid', 'hearts', 'moons',
  'noodles', 'notes', 'plus', 'rings', 'scales', 'smiles', 'sparkles', 'stars', 'stripes', 'triangles', 'waves',
  'zigzag',
];
const MODULES = [
  'agent', 'app', 'audio', 'backdrop', 'backup-ui', 'backup', 'beat-row', 'board', 'bulk', 'chop', 'cloud-api',
  'cloud-sync', 'cloud-ui', 'cloud', 'contact', 'contrast', 'cuts', 'device-meta', 'dialogs', 'dj-keys', 'dj-touch', 'dj',
  'download', 'emoji-all', 'emoji-check', 'emoji-more', 'events-client', 'finger', 'firsts', 'grooves', 'groups', 'help', 'inst-picker', 'instruments',
  'keyset', 'kids-logic', 'kids', 'leftover', 'lines', 'log-clean', 'log-send', 'log', 'loudness', 'merge', 'merge3', 'meter',
  'mix', 'mixer', 'model', 'names', 'notes', 'nudge', 'offline', 'old-backup', 'overflow', 'pad-size', 'pads', 'people',
  'pitch', 'play-count', 'playlist', 'privacy', 'reid', 'rhythm', 'roll', 'row-volume', 'scratch', 'sequencer',
  'settings-ui', 'settings', 'shape', 'share-render', 'sheet', 'skins', 'song', 'starters', 'state', 'steps',
  'store', 'stretch-worker', 'stretch', 'sync-timing', 'synth', 'telemetry', 'tips', 'tooltips', 'touch', 'track-page', 'tweaks',
  'ui', 'update', 'usage', 'util', 'voice-knobs', 'voices', 'wave', 'welcome', 'zip',
];

// Every file the app can load, relative to this worker. './' is the page
// (index.html), as the site serves it. tests/offline.test.mjs fails when a
// file in web/ is missing here, or this names one that is not there.
const SHELL = [
  './',
  'styles.css',
  'boards.json',
  'manifest.webmanifest',
  'fonts/fonts.css',
  'fonts/anybody-latin.woff2', 'fonts/anybody-latin-ext.woff2', 'fonts/anybody-vietnamese.woff2',
  'fonts/atkinson-next-latin.woff2', 'fonts/atkinson-next-latin-ext.woff2',
  'app-icons/icon-192.png', 'app-icons/icon-512.png', 'app-icons/icon-maskable-512.png', 'app-icons/apple-touch-icon.png',
  ...MODULES.map((m) => `${m}.js`),
  ...BG.map((b) => `bg/${b}.svg`),
  ...KIT.map((k) => `clips/kit/${k}.wav`),
  ...INSTRUMENT_FILES.map((k) => `clips/kit/${k}.wav`),
];

// What to do with a request. Pure.
//   url, method: the request's; scope: this worker's scope URL
// → 'pass'    leave it to the browser (another site, not a GET, /api/, this file)
//   'version' version.json: network only (above)
//   'network' network first, the kept copy when it fails
function route(url, method, scope) {
  if (method !== 'GET') return 'pass';
  const u = new URL(url);
  const s = new URL(scope);
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return 'pass';
  const path = u.pathname.slice(s.pathname.length);
  if (path === 'api' || path.startsWith('api/') || path === 'sw.js') return 'pass';
  if (path === 'version.json') return 'version';
  return 'network';
}

// The kept copy's key for a request, or null when it is not one of SHELL's
// files (it then goes to the network and is never kept). The page is one
// key whatever its query (?bg=dots); every other file drops its query. Pure.
function keyFor(url, scope) {
  const u = new URL(url);
  const s = new URL(scope);
  let path = u.pathname.slice(s.pathname.length);
  if (path === '' || path === 'index.html') path = './';
  return SHELL.includes(path) ? new URL(path, scope).href : null;
}

// Only a whole, plain same-site answer is worth keeping (not a 206 part, a
// redirect or an error page).
const keepable = (res) => !!res && res.ok && res.status === 200 && res.type === 'basic';

// A kept page that came through a redirect cannot answer a navigation:
// the browser refuses it. Copy it without the redirect.
const plain = (res) => (res.redirected
  ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers })
  : res);

async function networkFirst(event, key) {
  try {
    const res = await fetch(event.request);
    if (key && keepable(res)) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {}));
    }
    // A page load: if a new version went live since the cache was filled,
    // fill it again in the background.
    if (event.request.mode === 'navigate' && keepable(res)) event.waitUntil(refresh());
    return res;
  } catch (err) {
    const kept = key && await (await caches.open(CACHE)).match(key);
    if (kept) return plain(kept);
    throw err;
  }
}

async function versionFile(event) {
  try {
    return await fetch(event.request);
  } catch (err) {
    const kept = await (await caches.open(CACHE)).match(new URL(MARK, self.registration.scope).href);
    if (!kept) throw err;
    return new Response(await kept.text(), {
      headers: { 'Content-Type': 'application/json', 'X-Noodle-Offline': '1' },
    });
  }
}

// Fills the cache with every SHELL file, all or nothing (Cache.addAll), then
// marks it with the version.json it was filled for. `always` fills it even
// when that version is already there (install). no-cache asks the server
// each time; a file that has not changed costs a 304.
async function fill(always) {
  const scope = self.registration.scope;
  const res = await fetch(new Request(new URL('version.json', scope).href, { cache: 'no-store' }));
  const body = res.ok ? await res.text() : null;
  const cache = await caches.open(CACHE);
  const markKey = new URL(MARK, scope).href;
  if (!always && body !== null) {
    const had = await cache.match(markKey);
    if (had && (await had.text()) === body) return;
  }
  await cache.addAll(SHELL.map((p) => new Request(new URL(p, scope).href, { cache: 'no-cache' })));
  if (body !== null) await cache.put(markKey, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
}

// One background refill at a time; a failed one (offline) waits for the next page load.
let refilling = null;
function refresh() {
  refilling ??= fill(false).catch(() => {}).finally(() => { refilling = null; });
  return refilling;
}

// skipWaiting and clients.claim: a new worker takes over at once, even with
// a tablet's tab left open for days. That is safe here because the worker
// only routes: online, every answer still comes from the network, so taking
// over mid-visit changes no code the page runs. A first visit is looked
// after from the start, so its later loads (a sheet's module, a clip) are kept too.
// An install fails, and is tried again on the next visit, unless the whole
// app is in the cache: a half-filled copy would open broken offline.
self.addEventListener('install', (event) => {
  event.waitUntil(fill(true).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('noodlepads') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const scope = self.registration.scope;
  const how = route(request.url, request.method, scope);
  if (how === 'pass') return;
  if (how === 'version') event.respondWith(versionFile(event));
  else event.respondWith(networkFirst(event, keyFor(request.url, scope)));
});
