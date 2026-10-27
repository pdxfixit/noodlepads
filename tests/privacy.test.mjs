// "🔓 What's private (not much)" must say exactly what is true (Ben,
// 2026-10-11). README carries the lines of web/privacy.js (the app no longer
// shows them: Settings and Help link the shared policy, Ben 2026-10-16), and
// each key claim is checked against the code that makes it true:
// the Worker, the name generator, the report expiry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { ORIGIN } from '../worker/http.js';
import { TTL_MS } from '../worker/reports.js';
import { LIMITS } from '../worker/cloud.js';
import { KEEP_MS, DEVICE_KEEP_MS } from '../worker/metrics.js';
import { FakeD1 } from './fake-d1.mjs';
import { PRIVACY, PRIVACY_TITLE, PRIVACY_URL } from '../web/privacy.js';
import { cleanPayload } from '../web/log-clean.js';
import { HELP } from '../web/help.js';
import { hasMade } from '../web/cloud-sync.js';
import { SETTINGS } from '../web/settings.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const claim = (words) => {
  const line = PRIVACY.find((l) => l.includes(words));
  assert.ok(line, `the statement still says "${words}"`);
  return line;
};

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('') } };
  return (method, path, { body, key, origin = ORIGIN } = {}) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
      method, headers, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
    }), env);
  };
}

test('README carries every line of the statement, word for word; Help points at the Privacy policy, not at it', () => {
  assert.ok(readme.includes(PRIVACY_TITLE));
  for (const line of PRIVACY) assert.ok(readme.includes(line), `README is missing: ${line}`);
  const help = JSON.stringify(HELP);
  assert.ok(!help.includes("What's private"), 'Help no longer names a section that is gone');
  assert.ok(help.includes('Privacy policy'), 'Help points at the policy');
});

test('"Anyone who opens noodlepads.com sees the list": the list needs no key, no PIN, no Origin', async () => {
  claim('sees the list of the newest');
  const call = cloud();
  await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '🐙', color: '#1F3FA8', pin: '1234' } });
  const res = await call('GET', 'profiles', { origin: null });
  assert.equal(res.status, 200);
  const [p] = (await res.json()).profiles;
  assert.deepEqual([p.name, p.avatar, p.color, p.pin], ['Sir Squid', '🐙', '#1F3FA8', true]);
  // Besides its random id, the list holds what the line names, and no more (`edited`: when its look last changed).
  assert.deepEqual(Object.keys(p).sort(), ['avatar', 'color', 'edited', 'id', 'name', 'pin']);
  for (const words of ['fun names', 'avatars', 'colors', 'has a PIN', 'when its look last changed', `newest ${LIMITS.listed}`]) assert.ok(claim('sees the list of').includes(words), `the list line names: ${words}`);
});

test('"Anyone who has a sound\'s link can play it": even a profile with a PIN', async () => {
  claim("has a sound's link can play it");
  const call = cloud();
  const { key } = await (await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } })).json();
  const { id } = await (await call('POST', 'profiles/p-a/sounds', { key, body: { sha256: 'a'.repeat(64), bytes: 2, mime: 'audio/wav' } })).json();
  await call('PUT', `sounds/${id}/0`, { key, body: new Uint8Array([4, 2]) });
  assert.match(id, /^s-[a-z2-7]{26}$/, 'long and random');
  const played = await call('GET', `sounds/${id}`, { origin: null });
  assert.equal(played.status, 200);
});

test('"A PIN is not security": it guards opening the records, and nothing else', async () => {
  claim('A PIN is not security');
  const call = cloud();
  await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } });
  assert.equal((await call('POST', 'profiles/p-a/open', { body: {} })).status, 401);
  assert.equal((await call('GET', 'profiles')).status, 200);
});

// Ben, 2026-10-27: 🔑 Remember has no day of its own; sharing still asks.
test('"A device that remembers a profile … opens it with no PIN … Sharing from it still asks the PIN": a lasting key, and Share asks', async () => {
  const line = claim('A device that remembers a profile');
  assert.match(line, /until someone taps Forget this device/);
  assert.match(line, /Sharing from it still asks the PIN/);
  const call = cloud();
  await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '2468' } });
  const { key } = await (await call('POST', 'profiles/p-a/open', { body: { pin: '2468', remember: true } })).json();
  assert.equal((await call('GET', 'profiles/p-a/records', { key })).status, 200, 'the remembered key opens it, no PIN');
  const ui = readFileSync(new URL('../web/cloud-ui.js', import.meta.url), 'utf8');
  for (const at of ['shareItem(from, shareKind', "shareItem(personId, 'sound', ids)"]) {
    const made = ui.indexOf(at);
    assert.ok(made > 0, at);
    const body = ui.slice(ui.lastIndexOf('async function', made), made);
    assert.match(body, /askToShare\(/, `the PIN is asked before ${at}`);
  }
});

test('"Profile names are made up by the app; nobody types one": the Worker refuses a typed name, and People has no name field', async () => {
  claim('nobody types one');
  const call = cloud();
  const res = await call('POST', 'profiles', { body: { id: 'p-a', name: 'Real Name', avatar: '', color: '#1F3FA8' } });
  assert.equal(res.status, 400);
  for (const id of ['people-dialog', 'profile-dialog']) {
    const at = html.indexOf(`<dialog id="${id}"`);
    assert.ok(at >= 0, id);
    assert.ok(!/<input/.test(html.slice(at, html.indexOf('</dialog>', at))), `no name field in #${id}`);
  }
  const js = readFileSync(new URL('../web/people.js', import.meta.url), 'utf8');
  assert.ok(!/createElement\('input'\)/.test(js));
});

test('"They are deleted from the cloud about 14 days later, once the site is next used": the report table keeps 14 days', () => {
  // About, and once the site is used: nothing is scheduled (no Cron Triggers, docs/decisions.md).
  assert.match(claim('Problem reports'), /deleted from the cloud about 14 days later, once the site is next used/);
  assert.equal(TTL_MS, 14 * 24 * 60 * 60 * 1000);
});

test('an expired report goes even when no new report comes: a make, open, push, share or PIN change sweeps it, apart from the metrics', async () => {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('') } };
  const now = Date.now();
  const report = (key, expires) => env.DB.db.prepare('INSERT INTO reports (key, device, app, errors, body, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(key, 'K7Q4-M2XD', 'v1.0.1-abc1234', 0, '{}', expires - TTL_MS, expires);
  report('old', now - 1000);
  report('new', now + 1000);
  // Every device has switched reports off; a kid's tablet makes a profile (no X-Noodle-App: usage off too).
  const res = await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' }),
  }), env);
  assert.equal(res.status, 201);
  assert.deepEqual(env.DB.rows('SELECT key FROM reports').map((r) => r.key), ['new']);
  // A metrics batch that fails (here, a table gone) never keeps an expired report.
  env.DB.db.exec('DROP TABLE activity');
  report('old-too', now - 1000);
  const made = await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Noodle-App': 'v=abc&w=400&t=1' },
    body: JSON.stringify({ id: 'p-b', name: 'Baron Bagel', avatar: '', color: '#1F3FA8', pin: '1234' }),
  }), env);
  assert.equal(made.status, 201);
  assert.deepEqual(env.DB.rows('SELECT key FROM reports').map((r) => r.key), ['new']);
});

test('an expired report also goes when someone only syncs or looks at the profile list, and the Worker logs how many went', async () => {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('') } };
  const now = Date.now();
  const report = (key, expires) => env.DB.db.prepare('INSERT INTO reports (key, device, app, errors, body, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(key, 'K7Q4-M2XD', 'v1.0.1-abc1234', 0, '{}', expires - TTL_MS, expires);
  const api = (method, path, key) => worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
    method, headers: { Origin: ORIGIN, ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  }), env);
  const { key } = await (await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' }),
  }), env)).json();
  const said = [];
  const log = console.log;
  console.log = (...args) => said.push(args.join(' '));
  try {
    report('old-1', now - 1000);
    report('old-2', now - 2000);
    report('new', now + 60_000);
    assert.equal((await api('GET', 'profiles/p-a/records?since=0', key)).status, 200);
    assert.deepEqual(env.DB.rows('SELECT key FROM reports').map((r) => r.key), ['new'], 'a pull');
    report('old-3', now - 1000);
    assert.equal((await api('GET', 'profiles')).status, 200);
    assert.deepEqual(env.DB.rows('SELECT key FROM reports').map((r) => r.key), ['new'], 'a look at the list');
    assert.equal((await api('GET', 'profiles')).status, 200);
  } finally {
    console.log = log;
  }
  assert.deepEqual(said, ['reports: 2 expired, deleted', 'reports: 1 expired, deleted'], 'a line when some went, none when none did');
});

// Feedback (Ben, 2026-10-19: privacy changes "all approved", kept "90d?"):
// what the line says, tied to the dialog, the gate and the Worker.
test('"Feedback is sent only when a grown-up answers a sum and taps Send": always gated, only the text, no name or IP', async () => {
  const line = claim('Feedback is sent only when');
  for (const words of ['a grown-up answers a sum', 'taps Send', '⚙️ Settings → About → Feedback', 'only what they typed', "the app's version", 'deleted after 90 days', 'No name or IP address']) {
    assert.ok(line.includes(words), `the feedback line names: ${words}`);
  }
  assert.match(html, /We keep messages for 90 days\./, 'the dialog says the same');
  const js = readFileSync(new URL('../web/feedback.js', import.meta.url), 'utf8');
  assert.match(js, /addEventListener\('click', \(\) => askSum\(\{ owner: 'feedback'/, 'every tap asks the sum, at every level');
  const put = [];
  const env = { FEEDBACK: { put: async (key, body) => { put.push([key, new TextDecoder().decode(body)]); } }, ASSETS: { fetch: async () => new Response('') } };
  const res = await worker.fetch(new Request('https://noodlepads.com/api/feedback', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'X-Feedback': '7c9e6679-7425-40de-944b-e07fc1f90ae7', 'X-App-Version': 'fd576a9', 'CF-Connecting-IP': '192.0.2.44', 'User-Agent': 'Mozilla/5.0 (iPhone)' },
    body: 'More cowbell',
  }), env);
  assert.equal(res.status, 204);
  assert.deepEqual(put.map(([, body]) => body), ['More cowbell'], 'only what was typed');
  assert.match(put[0][0], /^v1\/noodlepads\/\d{4}-\d{2}-\d{2}\/fd576a9-7c9e6679-7425-40de-944b-e07fc1f90ae7\.txt$/, 'named by day, version and a random id');
  assert.ok(!JSON.stringify(put).includes('192.0.2.44') && !JSON.stringify(put).includes('iPhone'));
});

test('"To delete a profile": the steps name real buttons, and switching the cloud off or ☁️ Delete their cloud copy too deletes the cloud copy', async () => {
  const line = claim('To delete a profile');
  assert.ok(line.includes('☁️ In the cloud') && html.includes('☁️ In the cloud'));
  assert.ok(html.includes('👥 People'));
  assert.ok(line.includes('tap Delete twice, then ☁️ Delete their cloud copy too twice') && html.includes('id="profile-delete" data-remove aria-describedby="profile-delete-hint">🗑️ Delete<'));
  const people = readFileSync(new URL('../web/people.js', import.meta.url), 'utf8');
  assert.ok(people.includes("'☁️ Delete their cloud copy too'"), 'the button the steps name');
  const js = readFileSync(new URL('../web/cloud.js', import.meta.url), 'utf8');
  assert.match(js, /if \(inCloud\(personId\)\) await deleteFromCloud\(personId, pin\)/, 'Offline deletes the profile first');
  const ui = readFileSync(new URL('../web/cloud-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /const go = \(pin\) => removeProfile\(left\.id, left\.key, pin\)/, '☁️ Delete their cloud copy too deletes the profile (tests/delete-cloud.test.mjs runs it)');
});

test('"Everyone on this device goes to the cloud once they make something, unless … Offline"', () => {
  claim('once they make something');
  const js = readFileSync(new URL('../web/cloud.js', import.meta.url), 'utf8');
  assert.match(js, /wantsCloud = \(p\) => p\.added && !p\.hidden && !isOffline\(p\.id\) && !inCloud\(p\.id\)\s*&& hasMade/);
  assert.equal(hasMade({ prefs: [{ personId: 'p-a', values: {} }] }, 'p-a'), false, 'settings alone are not something made');
});

test('"the list of the newest 300 profiles": no other filter, newest first, 300 at most', async () => {
  claim(`the newest ${LIMITS.listed} profiles`);
  const call = cloud();
  for (const id of ['p-a', 'p-b']) await call('POST', 'profiles', { body: { id, name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } });
  assert.equal((await (await call('GET', 'profiles?family=PLUM-7K3Q', { origin: null })).json()).profiles.length, 2);
  assert.equal(LIMITS.listed, 300);
});

// Ben, 2026-10-11 (Q18): "allow to be unshared. copies remain".
test('"until the sharer taps 🚫 Unshare. Remixes others made of it stay theirs"', async () => {
  claim('until the sharer taps 🚫 Unshare');
  claim('Remixes others made of it stay theirs');
  const call = cloud();
  const sound = async (id, key, n) => {
    const { id: s } = await (await call('POST', `profiles/${id}/sounds`, { key, body: { sha256: String(n).repeat(64), bytes: 2, mime: 'audio/wav' } })).json();
    await call('PUT', `sounds/${s}/0`, { key, body: new Uint8Array([n, n]) });
    return s;
  };
  const a = (await (await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } })).json()).key;
  const s = await sound('p-a', a, 1);
  const { code } = await (await call('POST', 'profiles/p-a/shares', { key: a, body: { kind: 'sound', title: 'Burp', bundle: { clips: [{ id: 'user-1', sound: s }] } } })).json();
  // A remix is the receiver's own record with its own copy of the audio (cloud.js remixShare, then their sync).
  const b = (await (await call('POST', 'profiles', { body: { id: 'p-b', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } })).json()).key;
  const mine = await sound('p-b', b, 1);
  await call('POST', 'profiles/p-b/records', { key: b, body: { put: [{ kind: 'clips', id: 'user-9', body: { sound: mine } }] } });
  assert.equal((await call('DELETE', `profiles/p-a/shares/${code}`, { key: a })).status, 200);
  assert.equal((await call('GET', `shares/${code}`, { origin: null })).status, 404, 'the code stops working for everyone');
  assert.equal((await call('GET', `sounds/${mine}`, { origin: null })).status, 200, 'the remix still plays');
});

// The council's review, 2026-10-26: a deleted profile's shares could never be
// unshared (Unshare needs its key), so they go with it.
test('"Anyone with a share code can see and play what was shared, until … their profile is deleted": "gone from the cloud at once, with every share code it made"', async () => {
  claim('until the sharer taps 🚫 Unshare or their profile is deleted');
  claim('gone from the cloud at once, with every share code it made');
  const call = cloud();
  const { key } = await (await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } })).json();
  const { code } = await (await call('POST', 'profiles/p-a/shares', { key, body: { kind: 'beat', title: 'Wobbly Taco', bundle: { beats: [{ id: 'beat-1' }] } } })).json();
  assert.equal((await call('GET', `shares/${code}`, { origin: null })).status, 200, 'no key, no PIN');
  await call('DELETE', 'profiles/p-a', { key, body: { pin: '1234' } });
  assert.equal((await call('GET', `shares/${code}`, { origin: null })).status, 404, 'the profile is gone, and its code with it');
});

// Usage data is described only in the shared policy (Ben, 2026-10-16: "have it
// in the privacy policy so that all apps are consistent"), so no line here names it.
test('"What\'s private" says nothing about usage data: the shared policy does', () => {
  for (const line of PRIVACY) {
    assert.doesNotMatch(line, /how the app is used|Share play data|for 14 days|kept 90 days|internet address/, `usage words in: ${line}`);
  }
});

// ADR 0016 (Ben, 2026-10-12; 14 days and no IP hash, 2026-10-15), narrowed by
// ADR 0027: what the shared policy says of the player metrics, tied to the code.
test('player metrics last 14 days, devices 90, and hold no IP, city or User-Agent', async () => {
  assert.equal(KEEP_MS, 14 * 24 * 60 * 60 * 1000);
  assert.equal(DEVICE_KEEP_MS, 90 * 24 * 60 * 60 * 1000);
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('') } };
  const req = new Request('https://noodlepads.com/api/profiles', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.44', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'X-Noodle-App': 'v=abc&w=400&t=1' },
    body: JSON.stringify({ id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' }),
  });
  Object.defineProperty(req, 'cf', { value: { city: 'Portland', region: 'Oregon', country: 'US', asOrganization: 'Comcast Cable', asn: 7922 } });
  assert.equal((await worker.fetch(req, env)).status, 201);
  const kept = JSON.stringify([env.DB.rows('SELECT * FROM activity'), env.DB.rows('SELECT * FROM devices')]);
  assert.ok(kept.includes('"US"'), 'the country is kept');
  assert.ok(!kept.includes('Portland') && !kept.includes('Oregon') && !kept.includes('Comcast Cable'), 'the city, region and network are not (worker/schema.sql has no column for them)');
  assert.ok(!kept.includes('192.0.2.44') && !kept.includes('iPhone OS'), 'the IP and User-Agent are not');
});

// ADR 0026 (Ben, 2026-10-16): what the shared policy says of usage events, tied to the code.
test('usage events go to the site only, from every device while Share play data is on, with fixed keys', async () => {
  assert.match(html, /<input type="checkbox" id="share-usage"> 📊 Share play data</, 'the checkbox the policy names is in Settings');
  const { EVENTS, shouldSend } = await import('../web/telemetry.js');
  assert.equal(shouldSend({ enabled: true }), true, 'every device, in the cloud or not (question #425)');
  assert.equal(shouldSend({ enabled: false }), false);
  const keys = Object.values(EVENTS).flat();
  for (const bad of ['name', 'label', 'message', 'text', 'title', 'profile', 'person']) assert.ok(!keys.includes(bad), `no ${bad} in any event`);
  const client = readFileSync(new URL('../web/events-client.js', import.meta.url), 'utf8');
  assert.match(client, /endpoint = opts\.endpoint \?\? "\/api\/events"/, 'sent to the site itself');
  const telemetry = readFileSync(new URL('../web/telemetry.js', import.meta.url), 'utf8');
  assert.ok(!/endpoint:\s*['"]http/.test(telemetry), 'never another origin');
});

test('"Problem reports … send": the statement names everything a report holds, and no User-Agent string', () => {
  const line = claim('Problem reports');
  for (const words of ['event log', 'no sounds and no names', 'its settings', 'how many sounds, beats and songs',
    'browser, system and device type', 'never the full browser string', 'screen size', 'time zone', 'sound timing', "the app's version", 'random codes for this device and this visit']) {
    assert.ok(line.includes(words), `the report line names: ${words}`);
  }
  const report = cleanPayload({
    format: 1, device: 'K7Q4-M2XD', entries: [],
    env: { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36', screen: [412, 915], dpr: 2, tz: 'UTC', audio: null },
  });
  // Each part of a report, and the words above that name it.
  assert.deepEqual(Object.keys(report).sort(), ['app', 'counts', 'device', 'dropped', 'entries', 'env', 'format', 'sent', 'session', 'settings']);
  assert.deepEqual(Object.keys(report.env).sort(), ['audio', 'browser', 'dpr', 'os', 'screen', 'type', 'tz']);
  assert.doesNotMatch(JSON.stringify(report), /Mozilla|Pixel/);
});

// Ben, 2026-10-19: "drop privacy policy" from the footer.
test('the privacy policy is linked beside the version in About, not in the footer, and not in "What\'s private"', () => {
  assert.equal(PRIVACY_URL, 'https://privacy.pdxfixit.com/noodlepads/');
  const link = (where) => where.match(/<a class="privacy-link" href="([^"]+)" target="_blank" rel="noopener">([^<]+)<\/a>/);
  const foot = html.slice(html.indexOf('<div class="page-foot">'), html.indexOf('</div>', html.indexOf('<div class="page-foot">')));
  assert.equal(link(foot), null, 'no link in the page footer');
  const about = html.match(/<nav class="about-links"[\s\S]*?<p class="set-version">[\s\S]*?<\/p>/)?.[0] ?? '';
  assert.match(about, /<span id="about-version"><\/span>/, 'About keeps its version');
  const inAbout = link(about);
  assert.ok(inAbout, 'a link in About\'s row, above the version');
  assert.equal(inAbout[1], PRIVACY_URL);
  assert.equal(inAbout[2], 'Privacy policy');
  assert.doesNotMatch(html, /id="set-privacy"/, 'no "What\'s private" section in Settings');
  assert.ok(readme.includes(`(${PRIVACY_URL})`), 'README links it');
});

// 🎧 From a song (Ben, 2026-10-18): the song is heard in the browser and
// never saved, synced or sent. Its modules keep nothing and send nothing:
// none reaches storage, the cloud or the network; only the beats made from
// it are saved, through the app's own paths (listen-ui.js deps).
test('"A song 🎧 From a song listens to ... is never saved, synced or sent": its modules touch no storage, cloud or network', () => {
  claim('never saved, synced or sent');
  for (const name of ['listen.js', 'listen-dsp.js', 'listen-input.js', 'listen-worklet.js', 'listen-make.js', 'listen-ui.js']) {
    const code = readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
    const imports = [...code.matchAll(/from '\.\/([a-z0-9-]+)\.js'/g)].map((m) => m[1]);
    for (const banned of ['state', 'store', 'cloud', 'cloud-api', 'cloud-sync', 'log-send', 'zip', 'backup']) {
      assert.ok(!imports.includes(banned), `${name} imports ${banned}.js`);
    }
    assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|sendBeacon|indexedDB|localStorage/, `${name} reaches no network or storage`);
  }
});

// The same claims are made three times: web/privacy.js (copied word for word
// into README, checked above), and the public policy, docs/privacy-policy.md,
// which the privacy site (pdxfixit/privacy) pulls from this repo (Ben,
// 2026-10-26). The three are worded differently, so each claim below is a few
// key phrases that every one of them must carry. A change to what the cloud
// stores or shows fails here until all three say it.
const policy = readFileSync(new URL('../docs/privacy-policy.md', import.meta.url), 'utf8');
const policyText = policy.replace(/\s+/g, ' ');
const statement = PRIVACY.join(' ');
const readmePrivacy = readme.slice(readme.indexOf('## Privacy'), readme.indexOf('## License'));
const sources = { 'web/privacy.js': statement, 'README.md': readmePrivacy, 'docs/privacy-policy.md': policyText };
const webCode = ['index.html', 'help.js', 'cloud-ui.js', 'people.js', 'settings.js']
  .map((f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8')).join('\n');

test('the policy keeps the shape the privacy site builds: front matter, the shared blocks, no plain address', () => {
  const front = policy.match(/^---\nname: Noodle Pads\nblurb: .+\nupdated: \d{1,2} [A-Z][a-z]+ 20\d\d\nurl: https:\/\/noodlepads\.com\/\n---\n# Noodle Pads privacy policy\n/);
  assert.ok(front, 'front matter and the one headline');
  for (const block of ['rules', 'feedback', 'closing']) assert.match(policy, new RegExp(`^@include ${block}$`, 'm'));
  assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(policy), 'the contact address is written {contact}');
  assert.match(policy, /\{contact\}/);
});

const SHARED = [
  ['the public list shows fun names, colors, whether there is a PIN, and when the look last changed',
    [/fun names?/, /colou?rs?/, /\bPIN\b/, /when (its|their) look last changed|look last changed/]],
  ['a problem report is kept 14 days', [/Problem reports[^.]*\.[^.]*14 days|14 days[^.]*report/i]],
  ['problem reports are on unless switched off', [/Problem reports[^.]{0,12}(are )?on (unless someone switches them off|to start with)/i]],
  ['Share play data off stops problem reports too', [/nothing is sent while [^.]*(Share play data|play data switch)[^.]* is off/i]],
  ['a tap that made no sound adds an open dialog', [/an open dialog/, /how far the tap got/]],
  ['a device nobody chose for sends only after an error or a tap that made no sound', [/only after an error or a tap that made no sound/]],
  ['deleting a profile names the real buttons, and share codes go with it', [/👥 People/, /Delete twice/, /☁️ Delete their cloud copy too/, /☁️ In the cloud/, /every share code it made/]],
  ['sharing ends at 🚫 Unshare or when the profile is deleted', [/🚫 Unshare/, /(sharer taps|until) 🚫 Unshare or their profile is deleted/]],
  ['a sound\'s link plays it for anyone, and is not secret', [/[Aa]nyone with a sound's link can play it|[Aa]nyone who has a sound's link can play it/, /not secret/]],
  ['a PIN is not security', [/PIN[^.]*not security|not security/]],
];
for (const [name, patterns] of SHARED) {
  test(`policy, statement and README agree: ${name}`, () => {
    for (const [file, text] of Object.entries(sources)) {
      for (const p of patterns) assert.match(text, p, `${file} says: ${name} (${p})`);
    }
  });
}

test('the policy tells how to stop problem reports, how long one is kept, and how to find yours', () => {
  const deleting = policyText.slice(policyText.indexOf('## Deleting your data'));
  assert.match(deleting, /\*\*Problem reports:\*\*[^-]*📮 Send problem reports[^-]*📊 Share play data[^-]*14 days[^-]*📋 in ⚙️ Settings[^-]*\{contact\}/);
  assert.ok(webCode.includes('📋') || html.includes('📋'), 'the 📋 button exists');
});

test('every button the policy names is a real one, and the switches it describes default as it says', () => {
  for (const label of ['👥 People', '☁️ Delete their cloud copy too', '☁️ In the cloud', '📊 Data sharing', '📮 Send problem reports', '🚫 Unshare', '⚙️ Settings']) {
    assert.ok(webCode.includes(label.replace(/^\S+ /, '')), `the app has: ${label}`);
  }
  assert.ok(policyText.includes('📮 Send problem reports') && html.includes('📮 Send problem reports'));
  assert.equal(SETTINGS.sendLogs.default, true, 'the policy and the statement say reports start on');
  assert.equal(SETTINGS.sendUsage.default, true, 'the policy says Share play data starts on');
  assert.match(policyText, /Share play data\*\* is on \([^)]*on to start with\)/);
});

test('a push to main that changes the policy tells the privacy site; a missing token only warns', () => {
  const wf = readFileSync(new URL('../.github/workflows/privacy-policy.yml', import.meta.url), 'utf8');
  assert.match(wf, /branches: \[main\]\s+paths: \[docs\/privacy-policy\.md\]/);
  assert.match(wf, /repos\/pdxfixit\/privacy\/dispatches/);
  assert.ok(wf.includes('noodlepads-policy') && wf.includes('event_type'), 'the event the privacy deploy listens for');
  assert.match(wf, /secrets\.PRIVACY_DISPATCH_TOKEN/);
  assert.match(wf, /if \[ -z "\$TOKEN" \]; then\s+echo "::warning::[^\n]+\s+exit 0/, 'no token: warn and succeed');
});
