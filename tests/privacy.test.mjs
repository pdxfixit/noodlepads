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
import { KEEP_MS, DEVICE_KEEP_MS } from '../worker/metrics.js';
import { FakeD1 } from './fake-d1.mjs';
import { PRIVACY, PRIVACY_TITLE, PRIVACY_URL } from '../web/privacy.js';
import { cleanPayload } from '../web/log-clean.js';
import { HELP } from '../web/help.js';
import { hasMade } from '../web/cloud-sync.js';

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
  claim('sees the list of profiles');
  const call = cloud();
  await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '🐙', color: '#1F3FA8', pin: '1234' } });
  const res = await call('GET', 'profiles', { origin: null });
  assert.equal(res.status, 200);
  const [p] = (await res.json()).profiles;
  assert.deepEqual([p.name, p.avatar], ['Sir Squid', '🐙'], 'fun names and avatars only');
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

test('"They are deleted from the cloud after 14 days": the report table keeps 14 days', () => {
  assert.match(claim('Problem reports'), /deleted from the cloud after 14 days/);
  assert.equal(TTL_MS, 14 * 24 * 60 * 60 * 1000);
});

test('"To delete a profile": the steps name real buttons, and Offline deletes the cloud copy', async () => {
  const line = claim('To delete a profile');
  assert.ok(line.includes('📴 Offline (this device only)') && html.includes('📴 Offline (this device only)'));
  assert.ok(html.includes('👥 People'));
  const js = readFileSync(new URL('../web/cloud.js', import.meta.url), 'utf8');
  assert.match(js, /if \(inCloud\(personId\)\) await deleteFromCloud\(personId, pin\)/, 'Offline deletes the profile first');
});

test('"Everyone on this device goes to the cloud once they make something, unless … Offline"', () => {
  claim('once they make something');
  const js = readFileSync(new URL('../web/cloud.js', import.meta.url), 'utf8');
  assert.match(js, /wantsCloud = \(p\) => p\.added && !p\.hidden && !isOffline\(p\.id\) && !inCloud\(p\.id\)\s*&& hasMade/);
  assert.equal(hasMade({ prefs: [{ personId: 'p-a', values: {} }] }, 'p-a'), false, 'settings alone are not something made');
});

test('"Everyone in the cloud is in that list": the list has no filter', async () => {
  claim('Everyone in the cloud is in that list');
  const call = cloud();
  for (const id of ['p-a', 'p-b']) await call('POST', 'profiles', { body: { id, name: 'Sir Squid', avatar: '', color: '#1F3FA8', pin: '1234' } });
  assert.equal((await (await call('GET', 'profiles?family=PLUM-7K3Q', { origin: null })).json()).profiles.length, 2);
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
  const a = (await (await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8' } })).json()).key;
  const s = await sound('p-a', a, 1);
  const { code } = await (await call('POST', 'profiles/p-a/shares', { key: a, body: { kind: 'sound', title: 'Burp', bundle: { clips: [{ id: 'user-1', sound: s }] } } })).json();
  // A remix is the receiver's own record with its own copy of the audio (cloud.js remixShare, then their sync).
  const b = (await (await call('POST', 'profiles', { body: { id: 'p-b', name: 'Sir Squid', avatar: '', color: '#1F3FA8' } })).json()).key;
  const mine = await sound('p-b', b, 1);
  await call('POST', 'profiles/p-b/records', { key: b, body: { put: [{ kind: 'clips', id: 'user-9', body: { sound: mine } }] } });
  assert.equal((await call('DELETE', `profiles/p-a/shares/${code}`, { key: a })).status, 200);
  assert.equal((await call('GET', `shares/${code}`, { origin: null })).status, 404, 'the code stops working for everyone');
  assert.equal((await call('GET', `sounds/${mine}`, { origin: null })).status, 200, 'the remix still plays');
});

test('"Anyone with a share code can see and play what was shared, even after its profile is deleted"', async () => {
  claim('Anyone with a share code');
  const call = cloud();
  const { key } = await (await call('POST', 'profiles', { body: { id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8' } })).json();
  const { code } = await (await call('POST', 'profiles/p-a/shares', { key, body: { kind: 'beat', title: 'Wobbly Taco', bundle: { beats: [{ id: 'beat-1' }] } } })).json();
  await call('DELETE', 'profiles/p-a', { key, body: {} });
  const seen = await call('GET', `shares/${code}`, { origin: null });
  assert.equal(seen.status, 200, 'no key, no PIN, and the profile is gone');
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
    body: JSON.stringify({ id: 'p-a', name: 'Sir Squid', avatar: '', color: '#1F3FA8' }),
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
    'browser, system and device type', 'never the full browser string', 'screen size', 'time zone', 'sound timing', 'random code']) {
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

test('the privacy policy is linked beside the version, in the footer and in About, and not in "What\'s private"', () => {
  assert.equal(PRIVACY_URL, 'https://privacy.pdxfixit.com/noodlepads/');
  const link = (where) => where.match(/<a class="privacy-link"(?: id="privacy-policy")? href="([^"]+)" target="_blank" rel="noopener">([^<]+)<\/a>/);
  const foot = html.slice(html.indexOf('<div class="page-foot">'), html.indexOf('</div>', html.indexOf('<div class="page-foot">')));
  const inFoot = link(foot);
  assert.ok(inFoot, 'a link in the page footer, opening in a new tab');
  assert.ok(foot.indexOf('id="version"') < foot.indexOf('privacy-policy'), 'right after the version');
  const about = html.match(/<p class="set-version">[\s\S]*?<\/p>/)?.[0] ?? '';
  assert.match(about, /<span id="about-version"><\/span>/, 'About keeps its version');
  const inAbout = link(about);
  assert.ok(inAbout, 'a link beside the version in Settings → About');
  for (const l of [inFoot, inAbout]) {
    assert.equal(l[1], PRIVACY_URL);
    assert.equal(l[2], 'Privacy policy');
  }
  assert.doesNotMatch(html, /id="set-privacy"/, 'no "What\'s private" section in Settings');
  assert.ok(readme.includes(`(${PRIVACY_URL})`), 'README links it');
});
