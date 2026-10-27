// The live cloud checks, run by `just deploy` once the new version is live,
// and on their own as `just cloud-smoke` and `just cloud-e2e` (through
// look.mjs, the one Node tool). Both use a throwaway profile that is deleted
// in a `finally`, whatever happened; its id says it is test data (p-smoke-…,
// p-e2e-…), and `just cloud-prune --smoke` removes any a killed run left.
//
//   cloud-smoke  the API round trip from Node, through web/cloud-api.js:
//                the other three routes answer (problem reports, usage events
//                and feedback each refuse an empty post with 400, which proves
//                the Worker routes them, their bindings are there and the site's
//                Origin is let in, and stores nothing), make (a create with no PIN is refused), wrong PIN, open, a
//                PATCH that clears the PIN is refused, push, pull, a sound in
//                two pieces read back byte for byte, a share read with no
//                key, the list (which leaves it out), five wrong PINs at open
//                that do not lock the key's delete, delete, and everything
//                gone, its share code too.
//   cloud-e2e    two devices (two browser contexts: separate IndexedDB) in
//                headless Chrome on the live site: A makes a person, a beat
//                and a sound, syncs, and is NOT in the cloud (nobody goes up
//                by themselves); a grown-up's switch puts A up with a PIN
//                (web/cloud.js goUp); B opens the profile from the ☁️ list (a
//                check's profile isn't listed, so its line is added there),
//                types the PIN on the real pad and says Not now to 🔑
//                Remember, and gets them; B rerolls the name and renames the
//                beat; A syncs and has both, the beat edited in place (Q7).
//
// Each step prints ✅ or ❌ with its time; the exit code is 1 on any ❌.
//
// The checks prove who they are: every /api/ request carries the Worker
// secret CHECKS_KEY, read from the environment (deploy.yml passes the GitHub
// secret), in the X-Checks-Key header. Once the Worker holds the secret it
// refuses a p-smoke-/p-e2e- id without it (worker/cloud.js provenCheck).

import crypto from 'node:crypto';
import { createCloudApi, CloudError } from '../web/cloud-api.js';
import { uploadAudio, CHUNK_BYTES } from '../web/cloud-sync.js';
import { funName } from '../web/names.js';
import { obviousPin } from '../web/codes.js';
import { PICTURES, PERSON_COLORS } from '../web/model.js';
import { launchChrome, connect, evaluate, waitFor } from './chrome.mjs';
import { CHECKS_HEADER } from '../worker/cloud.js';

// The Worker takes writes only from its own page (worker/http.js ORIGIN).
const ORIGIN = 'https://noodlepads.com';

function options(argv) {
  const opts = { url: ORIGIN };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) opts.url = argv[++i].replace(/\/+$/, '');
    else throw new Error(`unknown argument: ${argv[i]} (only --url URL)`);
  }
  return opts;
}

const pick = (list) => list[crypto.randomInt(list.length)];
const testId = (kind) => `p-${kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const must = (ok, why) => { if (!ok) throw new Error(why); };

// The checks' proof, as headers: none while CHECKS_KEY is unset. Trimmed at
// both ends, as deploy.yml trims what it puts into the Worker, so a stray
// newline pasted with the secret never splits the two.
export const checksHeaders = (key = process.env.CHECKS_KEY ?? '') => {
  const proof = key.trim();
  return proof ? { [CHECKS_HEADER]: proof } : {};
};

function sayProof() {
  if (!process.env.CHECKS_KEY?.trim()) {
    console.log('ℹ️  CHECKS_KEY is not set: the check sends no proof. A Worker that holds the secret refuses its profile (400 id); set CHECKS_KEY to the GitHub secret\'s value.');
  }
}

// The API from Node: every request carries the site's Origin, and the checks' proof.
function apiFor(base) {
  return createCloudApi({
    base: `${base}/api`,
    fetch: (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, Origin: ORIGIN, ...checksHeaders() } }),
  });
}

// The app's own /api/ requests in a page carry the proof too: each is paused
// on its way out and sent on with the header added. Only /api/ on the site
// checked, so the secret goes nowhere else.
async function proveFrom(page, url) {
  const proof = Object.entries(checksHeaders());
  if (!proof.length) return;
  page.on((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const headers = Object.entries(m.params.request.headers).filter(([name]) => name.toLowerCase() !== CHECKS_HEADER.toLowerCase());
    page.send('Fetch.continueRequest', {
      requestId: m.params.requestId,
      headers: [...headers, ...proof].map(([name, value]) => ({ name, value })),
    }).catch(() => {});
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${url}/api/*`, requestStage: 'Request' }] });
}

// Steps, each timed and said. The first ❌ stops the run (then `finally`).
function steps() {
  const t0 = Date.now();
  let failed = 0;
  return {
    async step(what, fn) {
      const t = Date.now();
      try {
        const said = await fn();
        console.log(`✅ ${said || what} (${secs(Date.now() - t)})`);
        return said;
      } catch (err) {
        failed++;
        console.log(`❌ ${what}: ${err?.message || err}`);
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { said: true });
      }
    },
    fail(line) { failed++; console.log(`❌ ${line}`); },
    get failed() { return failed; },
    total: () => secs(Date.now() - t0),
  };
}

// The Worker's other three routes, each sent a post it refuses after the
// checks that need its bindings: /api/log (the D1 binding), /api/events (the
// EVENTS bucket) and /api/feedback (the FEEDBACK bucket and its rate limit).
// A 400 means the route is wired, the site's Origin is let in and the binding
// is there; a 503 is a missing binding and a 403 a refused Origin. Nothing is
// stored, so no report, event or message of ours reaches the runner or Ben's
// notes. (What the writes themselves do is tested here, in tests/*-route.)
// These carry no proof key: they are open to the site's page anyway.
const OTHER_ROUTES = [
  ['/api/log', 'application/json', '{"entries":"none"}'],
  ['/api/events', 'text/plain', 'check'],
  ['/api/feedback', 'text/plain', 'check'],
];
async function otherRoutes(url) {
  const said = [];
  for (const [path, type, body] of OTHER_ROUTES) {
    const res = await fetch(`${url}${path}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': type }, body });
    must(res.status === 400, `${path} answered ${res.status}, not 400 (503: its binding is missing; 403: the Origin was refused; 404: not routed)`);
    said.push(path);
  }
  return `${said.join(', ')} are routed, bound and refuse an empty post (400)`;
}

// The promise is refused with this status (and `error`), or this throws.
async function refused(promise, status, error) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof CloudError && err.status === status && (!error || err.error === error)) return err;
    throw new Error(`expected ${status} ${error ?? ''}, got ${err?.status ?? ''} ${err?.error ?? err?.message}`);
  }
  throw new Error(`expected ${status} ${error ?? ''}, but it was allowed`);
}

const sha256Of = async (blob) => crypto.createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');

// ── cloud-smoke ──

async function smoke({ url }) {
  const api = apiFor(url);
  const s = steps();
  const id = testId('smoke');
  const pin = madeUpPin();
  const wrong = String((Number(pin) + 1) % 10000).padStart(4, '0');
  const look = { id, name: funName(), avatar: pick(PICTURES), color: pick(PERSON_COLORS) };
  let key = null;
  let gone = false;
  console.log(`☁️  cloud-smoke on ${url}: throwaway profile ${id}`);
  try {
    await s.step('the cloud is there', () => api.hello().then(() => 'the cloud is there (GET /api/cloud)'));
    await s.step('the report, event and feedback routes answer', () => otherRoutes(url));
    await s.step('make the profile', async () => {
      key = (await api.create({ ...look, pin })).key;
      return `made ${look.avatar} ${look.name} with a PIN`;
    });
    // The cloud takes no profile without a PIN (docs/design/cloud-needs-pin.md).
    await s.step('a profile with no PIN is refused', async () => {
      await refused(api.create({ ...look }), 400, 'needs pin');
      return 'a create without a PIN is refused (400 needs pin)';
    });
    await s.step('a wrong PIN is refused', async () => {
      const err = await refused(api.open(id, wrong), 401, 'pin');
      return `a wrong PIN is refused (401, ${err.tries} tries left)`;
    });
    await s.step('open with the PIN', async () => {
      const opened = await api.open(id, pin, false);
      must(opened.name === look.name && opened.pin === true, `opened ${JSON.stringify(opened.name)} pin ${opened.pin}`);
      key = opened.key;
      return 'opened with the PIN: a new key, the same look';
    });
    await s.step('Remove PIN through the API is refused', async () => {
      await refused(api.change(id, key, { pin, newPin: null }), 400, 'needs pin');
      const page = await api.pull(id, key, 0);
      must(page.profile?.pin === true, 'the PIN went');
      return 'a PATCH that clears the PIN is refused (400 needs pin), and the profile still has it';
    });
    const beat = { name: 'Smoke Beat', bpm: 96, bars: 1, swing: 0, rows: [] };
    await s.step('push a record', async () => {
      const res = await api.push(id, key, [{ kind: 'beats', id: 'beat-smoke', body: beat }], []);
      must(res.rev === 1 && res.was === 0, `rev ${res.rev}, was ${res.was}`);
      return 'pushed a beat record (rev 0 → 1)';
    });
    await s.step('pull it back', async () => {
      const page = await api.pull(id, key, 0);
      const got = page.records.find((r) => r.kind === 'beats' && r.id === 'beat-smoke');
      must(got && JSON.stringify(got.body) === JSON.stringify(beat), `pulled ${JSON.stringify(got)}`);
      must(page.profile?.name === look.name, `the pull's profile is ${page.profile?.name}`);
      return 'pulled it back, the same';
    });
    // Over one piece, so it goes up in two (worker/cloud.js CHUNK_BYTES).
    const bytes = crypto.randomBytes(CHUNK_BYTES + 54321);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    let sound = null;
    await s.step('upload a sound in pieces', async () => {
      const up = await uploadAudio(api, id, key, blob, 'audio/wav', sha256Of);
      must(up.sent, 'no piece went up');
      sound = up.sound;
      const again = await api.startSound(id, key, { sha256: up.sha256, bytes: blob.size, mime: 'audio/wav' });
      must(again.id === sound && again.need.length === 0, `asked again: ${JSON.stringify(again)}`);
      await api.push(id, key, [{ kind: 'clips', id: 'user-smoke', body: { label: 'Smoke', mime: 'audio/wav', sound, sha256: up.sha256, bytes: blob.size } }], []);
      return `uploaded ${(blob.size / 1e6).toFixed(2)} MB in 2 pieces, never twice, and a sound record naming it`;
    });
    await s.step('read the sound back', async () => {
      const back = Buffer.from(await (await api.fetchSound(sound)).arrayBuffer());
      must(back.equals(bytes), `read back ${back.length} bytes, not the ${bytes.length} sent`);
      return 'read the sound back byte for byte';
    });
    // The audio a sound held goes with it, at once (the Worker's orphans):
    // its old link plays for no one. A check profile holds one sound, so this
    // deletes the record rather than give it new audio.
    await s.step('a deleted sound lets its audio go', async () => {
      await api.push(id, key, [], [{ kind: 'clips', id: 'user-smoke' }]);
      const res = await fetch(`${url}/api/sounds/${sound}`);
      must(res.status === 404, `its old audio answers ${res.status}`);
      return "deleted the sound's record: its audio answers 404 at once";
    });
    // A second, small sound kept to the end, so deleting the profile is
    // still seen to take its sounds with it.
    await s.step('a sound to keep', async () => {
      const small = new Blob([crypto.randomBytes(4321)], { type: 'audio/wav' });
      const up = await uploadAudio(api, id, key, small, 'audio/wav', sha256Of);
      sound = up.sound;
      await api.push(id, key, [{ kind: 'clips', id: 'user-smoke-2', body: { label: 'Smoke 2', mime: 'audio/wav', sound, sha256: up.sha256, bytes: small.size } }], []);
      must((await fetch(`${url}/api/sounds/${sound}`)).ok, 'the kept sound does not play');
      return 'uploaded a small sound to keep, and a record naming it';
    });
    let code = null;
    await s.step('make a share code', async () => {
      code = (await api.share(id, key, { kind: 'beat', title: 'Smoke test', bundle: { beats: [{ id: 'beat-smoke', ...beat }] }, preview: null })).code;
      return `made share code ${code}`;
    });
    // No key, no PIN, no Origin: anyone with the code.
    const readShare = async () => {
      const res = await fetch(`${url}/api/shares/${code}`);
      must(res.ok, `HTTP ${res.status}`);
      const share = await res.json();
      must(share.kind === 'beat' && share.title === 'Smoke test' && share.bundle?.beats?.[0]?.id === 'beat-smoke', JSON.stringify(share).slice(0, 200));
    };
    await s.step('read the share anonymously', async () => { await readShare(); return 'read the share with no key, PIN or Origin'; });
    // A check's profile never shows (worker/cloud.js TEST_PROFILE); the list itself answers.
    await s.step('the list leaves it out', async () => {
      const { profiles } = await api.list();
      must(Array.isArray(profiles), 'no list');
      must(!profiles.some((x) => x.id === id), 'a check profile is in the public list');
      return `the public list answers (${profiles.length}) and leaves the check's profile out`;
    });
    // Opening and requests that carry a key count wrong PINs apart (migration
    // 009): five wrong at /open wait only /open, and the key still deletes.
    await s.step('wrong PINs at open do not lock the key', async () => {
      for (let i = 0; i < 4; i++) await refused(api.open(id, wrong), 401, 'pin');
      await refused(api.open(id, wrong), 429, 'wait');
      return 'five wrong PINs at open: it waits 10 minutes (429)';
    });
    await s.step('delete the profile', async () => {
      await refused(api.remove(id, key, wrong), 401, 'pin');
      await api.remove(id, key, pin);
      gone = true;
      return 'deleted it with the key and the right PIN, though opening waits (a wrong PIN first: refused)';
    });
    await s.step('it is gone', async () => {
      must(!(await api.list()).profiles.some((x) => x.id === id), 'still in the list');
      await refused(api.open(id, pin), 404, 'profile');
      const res = await fetch(`${url}/api/sounds/${sound}`);
      must(res.status === 404, `its sound answers ${res.status}`);
      const shared = await fetch(`${url}/api/shares/${code}`);
      must(shared.status === 404, `its share code answers ${shared.status}`);
      return 'gone: not listed, opens 404, its sound and its share code 404';
    });
  } catch (err) {
    if (!err?.said) s.fail(err?.message || String(err));   // a step says its own
  } finally {
    if (!gone && key) {
      try {
        await api.remove(id, key, pin);
        console.log(`🧹 deleted ${id} after the failure`);
      } catch (err) {
        s.fail(`could not delete ${id} (${err?.message}). Remove it: just cloud-prune --smoke --yes`);
      }
    }
  }
  console.log(s.failed ? `❌ cloud-smoke failed (${s.total()})` : `✅ cloud-smoke passed (${s.total()})`);
  return s.failed ? 1 : 0;
}

// ── cloud-e2e ──

// One device: a browser context of its own (its own IndexedDB and
// localStorage), with the app loaded and ready.
async function device(cdp, name, url) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = cdp.session(sessionId);
  const errors = [];
  const calls = [];   // the app's /api/ requests, for a failure's report
  const asked = new Map();
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/')) {
      asked.set(m.params.requestId, `${m.params.request.method} ${new URL(m.params.request.url).pathname}`);
    } else if (m.method === 'Network.responseReceived' && asked.has(m.params.requestId)) {
      calls.push(`${asked.get(m.params.requestId)} → ${m.params.response.status}`);
    } else if (m.method === 'Network.loadingFailed' && asked.has(m.params.requestId)) {
      calls.push(`${asked.get(m.params.requestId)} → ${m.params.errorText}`);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await proveFrom(page, url);
  const loaded = new Promise((r) => page.on((m) => { if (m.method === 'Page.loadEventFired') r(); }));
  await page.send('Page.navigate', { url: `${url}/` });
  await loaded;
  const run = (js) => evaluate(page.send, `(async () => { ${js} })()`);
  const ready = `
    const { state } = await import('/state.js');
    const { db } = await import('/store.js');
    return { manifest: !!state.manifest, storage: !!db.handle, pads: !!document.querySelector('#pads .pad') };`;
  try {
    await waitFor(`device ${name}'s app`, async () => Object.values(await run(ready)).every(Boolean), 20000);
  } catch (err) {
    // Say which part never came, and what the page said.
    const got = await run(ready).catch((e) => e.message);
    throw new Error(`${err.message}: ${JSON.stringify(got)}; api ${calls.join(', ') || 'none'}; console ${errors.slice(0, 3).join(' | ') || 'quiet'}`);
  }
  // The start-up sync first, so this check's own starts after it (as a kid's
  // first change would, a moment later).
  await run(`await (await import('/cloud.js')).syncAll(); await new Promise((r) => setTimeout(r, 250));`);
  return { name, run, errors, calls, close: () => cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}) };
}

// The app's modules, in the page (the same instances the app uses).
const MODULES = `
  const { state, persist, setPersonEdit } = await import('/state.js');
  const cloud = await import('/cloud.js');`;

async function e2e({ url }) {
  const api = apiFor(url);
  const s = steps();
  const pid = testId('e2e');
  // Every profile in the cloud has a PIN; this one's is made up for the run.
  const pin = madeUpPin();
  console.log(`☁️  cloud-e2e on ${url}: two devices, throwaway profile ${pid}`);
  const devices = [];
  let made = null;
  try {
    const [a, b] = await s.step('two devices open the app', async () => {
      const cdp = await connect(await (await launchChrome()).browser());
      devices.push(...await Promise.all([device(cdp, 'A', url), device(cdp, 'B', url)]));
      return 'two devices (separate storage) opened the live app';
    }).then(() => devices);

    made = await s.step('A: make a person, a beat and a sound; syncing puts nobody in the cloud', async () => {
      const r = await a.run(`${MODULES}
        const { funName, beatName, soundName } = await import('/names.js');
        const { PICTURES, PERSON_COLORS } = await import('/model.js');
        const { cleanPattern } = await import('/beat.js');
        const { nextClipColor } = await import('/board.js');
        const { newId } = await import('/util.js');
        const id = ${JSON.stringify(pid)};
        const any = (list) => list[Math.floor(Math.random() * list.length)];
        const person = { id, name: funName([...state.peopleEdits.values()].map((p) => p.name)), fun: true,
          avatar: any(PICTURES), color: any(PERSON_COLORS), added: true, created: Date.now() };
        state.peopleEdits.set(id, person);
        await persist('people', person);
        const beat = { ...cleanPattern({ bpm: 96, rows: [{ clipId: id + '-' + state.manifest.kit[0].id }] }, id),
          id: newId('beat'), name: beatName([]), created: Date.now(), saved: Date.now() };
        state.savedBeats = [...state.savedBeats, beat];
        await persist('beats', structuredClone(beat));
        // A sound as a file the app was given: 0.2 s of a 440 Hz tone as 16-bit
        // WAV, made here (headless Chrome has no microphone).
        const rate = 8000, n = 1600, buf = new DataView(new ArrayBuffer(44 + n * 2));
        const str = (at, t) => [...t].forEach((c, i) => buf.setUint8(at + i, c.charCodeAt(0)));
        str(0, 'RIFF'); buf.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); buf.setUint32(16, 16, true);
        buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true);
        buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); str(36, 'data'); buf.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) buf.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 8000), true);
        const blob = new Blob([buf.buffer], { type: 'audio/wav' });
        const clip = { id: newId('user'), personId: id, label: soundName([]), emoji: '🔔', color: nextClipColor(id),
          voice: 'normal', blob, mime: 'audio/wav', created: Date.now() };
        state.userClips.push(clip);
        await persist('clips', clip);
        await cloud.syncAll();
        const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
        return { name: person.name, beat: { id: beat.id, name: beat.name }, clip: { id: clip.id, bytes: blob.size,
          sha: hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())) },
          inCloud: cloud.inCloud(id), link: !!cloud.linkOf(id) };`);
      // The rule itself, checked live: nobody goes up by themselves, whatever they made.
      must(!r.inCloud && !r.link, 'A person who made things went to the cloud by themselves');
      await refused(api.open(pid, pin), 404, 'profile');
      made = r;
      return `A: made ${r.name} with beat “${r.beat.name}” and a sound; syncing sent nothing (the cloud has no such profile)`;
    }).then(() => made);

    // What the ☁️ switch does after the grown-up sum and the PIN pads (cloud-ui.js putUp).
    await s.step('A: a grown-up puts them in the cloud with a PIN', async () => {
      const r = await a.run(`${MODULES}
        const id = ${JSON.stringify(pid)};
        await cloud.goUp(id, ${JSON.stringify(pin)});
        const clip = state.userClips.find((c) => c.personId === id);
        return { status: cloud.statusOf(id), pin: cloud.linkOf(id)?.pin, sound: cloud.linkOf(id)?.sounds?.[clip.id]?.sound ?? null, key: cloud.keyOf(id) };`);
      if (r.key) made = { ...made, key: r.key };   // the key, for the clean-up, even if a check below fails
      must(r.pin === true, 'A is in the cloud with no PIN');
      must(r.status?.state === 'ok', `A's sync says ${JSON.stringify(r.status)}`);
      must(r.sound, 'the sound has no cloud id');
      return 'A: in the cloud with a PIN (goUp), synced: the beat and the sound are up';
    });

    await s.step('B: open it from the ☁️ list', async () => {
      const r = await b.run(`${MODULES}
        const id = ${JSON.stringify(pid)};
        document.querySelector('#settings-open').click();
        document.querySelector('#people-open').click();
        document.querySelector('#cloud-browse').click();
        const until = async (what, fn, ms = 15000) => {
          const end = Date.now() + ms;
          for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 100)); }
        };
        await until('the list', () => document.querySelector('#cloud-list-note').textContent !== 'Looking…');
        // A check's profile is never listed (worker/cloud.js TEST_PROFILE): its line goes in
        // as the list draws one, and the list's own tap opens it.
        if (document.querySelector('#cloud-list-items [data-open="' + id + '"]')) throw new Error('a check profile is in the public list');
        const li = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.dataset.open = id;
        pick.dataset.pin = 'true';
        li.append(pick);
        document.querySelector('#cloud-list-items').append(li);
        pick.click();
        // Every profile has a PIN: the real pad asks it, and the keys are typed.
        await until('the PIN pad', () => document.querySelector('#pin-dialog').open);
        for (const k of ${JSON.stringify(pin)}) document.querySelector('#pin-keys [data-key="' + k + '"]').click();
        // The sheet turns to them and locks, then ends on ✓ or a stop.
        await until('the open', () => ['done', 'stopped'].includes(document.querySelector('#cloud-open').dataset.step) && !document.querySelector('#cloud-open').hidden && cloud.statusOf(id)?.state !== 'syncing');
        // Then 🔑 Remember them here? is offered: Not now.
        await until('the Remember offer', () => document.querySelector('#remember-dialog').open);
        document.querySelector('#remember-no').click();
        const clip = state.userClips.find((c) => c.personId === id);
        const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
        const bar = document.querySelector('#cloud-open-bar');
        const note = document.querySelector('#cloud-open-line').textContent;
        const filled = bar.getAttribute('aria-valuenow');
        document.querySelector('#cloud-open-more').click();
        return { note, filled, status: cloud.statusOf(id),
          name: state.peopleEdits.get(id)?.name, beats: state.savedBeats.filter((x) => x.personId === id).map((x) => ({ id: x.id, name: x.name })),
          clip: clip && { id: clip.id, bytes: clip.blob?.size, sha: clip.blob && hex(await crypto.subtle.digest('SHA-256', await clip.blob.arrayBuffer())) } };`);
      must(r.status?.state === 'ok', `B's open says “${r.note}” ${JSON.stringify(r.status)}`);
      must(r.note === '✓ On this device now' && r.filled === '100', `B's sheet ends on “${r.note}”, its bar at ${r.filled}`);
      must(r.name === made.name, `B has the name ${r.name}, not ${made.name}`);
      must(r.beats.length === 1 && r.beats[0].id === made.beat.id && r.beats[0].name === made.beat.name, `B's beats: ${JSON.stringify(r.beats)}`);
      must(r.clip?.id === made.clip.id && r.clip.sha === made.clip.sha, `B's sound: ${JSON.stringify(r.clip)}`);
      return `B: opened ${r.name} from the ☁️ list: the beat and the sound arrived (audio byte for byte)`;
    });

    let renamed = null;
    await s.step('B: pick a new name, rename the beat, sync', async () => {
      const r = await b.run(`${MODULES}
        const id = ${JSON.stringify(pid)};
        const before = state.peopleEdits.get(id).name;
        // 👥 People is a list; their line opens the profile sheet, which has 🎲 (since 2026-10-12).
        const line = document.querySelector('#people-edit [data-profile="' + id + '"]');
        if (!line) throw new Error('no line for the person in People');
        line.click();
        const dice = document.querySelector('#profile-dialog [data-reroll="' + id + '"]');
        if (!dice) throw new Error('no 🎲 in their profile sheet');   // no quote marks: this is inside a template
        dice.click();   // opens Pick a name (since 2026-10-12): pick its first name
        const pick = document.querySelector('#names-list [data-pick-name]');
        if (!pick) throw new Error('🎲 opened no Pick a name list');
        pick.click();
        for (let i = 0; i < 50 && state.peopleEdits.get(id).name === before; i++) await new Promise((r) => setTimeout(r, 100));
        const beat = { ...state.savedBeats.find((x) => x.personId === id), name: 'Renamed On B', saved: Date.now() };
        state.savedBeats = [...state.savedBeats.filter((x) => x.id !== beat.id), beat];
        await persist('beats', structuredClone(beat));
        await cloud.syncNow(id);
        return { name: state.peopleEdits.get(id).name, before, status: cloud.statusOf(id) };`);
      must(r.name !== r.before, `🎲 left the name ${r.before}`);
      must(r.status?.state === 'ok', `B's sync says ${JSON.stringify(r.status)}`);
      renamed = r;
      return `B: 🎲 rerolled ${r.before} → ${r.name}, renamed the beat, synced`;
    });

    await s.step('A: sync and get both', async () => {
      const r = await a.run(`${MODULES}
        const id = ${JSON.stringify(pid)};
        await cloud.syncNow(id);
        return { name: state.peopleEdits.get(id)?.name, status: cloud.statusOf(id),
          beats: state.savedBeats.filter((x) => x.personId === id).map((x) => ({ id: x.id, name: x.name })) };`);
      must(r.status?.state === 'ok', `A's sync says ${JSON.stringify(r.status)}`);
      must(r.name === renamed.name, `A still has ${r.name}, not B's ${renamed.name}`);
      must(r.beats.length === 1 && r.beats[0].id === made.beat.id && r.beats[0].name === 'Renamed On B', `A's beats: ${JSON.stringify(r.beats)}`);
      return `A: got B's new name ${r.name} and the renamed beat, edited in place (one beat, same id)`;
    });
  } catch (err) {
    if (!err?.said) s.fail(err?.message || String(err));   // a step says its own
  } finally {
    // The only profile a check puts in the cloud is the test profile (nobody
    // goes up by themselves). Its key is A's, or the PIN opens one (a crash
    // mid-step); the delete needs the PIN too.
    let key = made?.key;
    if (!key) {
      try { key = (await api.open(pid, pin)).key; } catch { /* not there: nothing to delete */ }
    }
    if (key) {
      try {
        await api.remove(pid, key, pin);
        console.log(`🧹 deleted ${pid}`);
      } catch (err) {
        if (!(err instanceof CloudError && err.status === 404)) s.fail(`could not delete ${pid} (${err?.message}). Remove it: just cloud-prune --smoke --yes`);
      }
    }
    try {
      await api.open(pid, pin);
      s.fail(`${pid} is still in the cloud after the delete. It goes by itself 10 minutes after it was made`);
    } catch (err) {
      if (!(err instanceof CloudError && err.status === 404)) console.log(`⚠️  could not check ${pid} is gone (${err?.message})`);
    }
    for (const d of devices) {
      for (const e of [...new Set(d.errors)].slice(0, 5)) console.log(`⚠️  device ${d.name} console: ${e}`);
      if (s.failed) {
        // What the device asked the cloud, and what its log says, to see why.
        console.log(`   device ${d.name} asked: ${d.calls.join(', ') || 'nothing'}`);
        try {
          const log = await d.run(`return (await import('/log.js')).getLog().filter((e) => ['cloud', 'error', 'warn'].includes(e.kind)).slice(-8);`);
          for (const e of log) console.log(`   device ${d.name} log: ${e.kind} ${JSON.stringify(e.data)}`);
        } catch { /* the page is gone */ }
      }
      await d.close();
    }
  }
  console.log(s.failed ? `❌ cloud-e2e failed (${s.total()})` : `✅ cloud-e2e passed (${s.total()})`);
  return s.failed ? 1 : 0;
}

// A PIN for a throwaway profile: the Worker refuses the obvious ones (web/codes.js).
function madeUpPin() {
  for (;;) {
    const pin = String(crypto.randomInt(10000)).padStart(4, '0');
    if (!obviousPin(pin)) return pin;
  }
}

export async function main(mode, argv) {
  let opts;
  try { opts = options(argv); } catch (err) { console.error(`🛑 ${err.message}`); return 2; }
  sayProof();
  return mode === 'cloud-smoke' ? smoke(opts) : e2e(opts);
}
