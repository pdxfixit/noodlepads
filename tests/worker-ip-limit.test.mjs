// New profiles per address (Ben, 2026-10-26): at most 3 a UTC day from one
// address, counted in `counters` as "ip:<hash>", where the hash is an HMAC
// under a key that is new each UTC day (worker/cloud.js ipCounterName). The
// address itself is never stored, logged or answered; earlier days' rows are
// deleted. The deploy checks' profiles are exempt. Without the Worker secret
// IP_HASH_KEY nothing is counted. The deploy puts the secret in
// (tools/ensure_ip_key.sh, at the end).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from '../worker/index.js';
import { LIMITS, addressGroup } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';
import { CloudError, cloudTrouble } from '../web/cloud-api.js';

const T0 = Date.parse('2026-10-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'a1'.repeat(32);
const PIN = '2468';

function cloud({ secret = KEY, checks = null } = {}) {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  if (secret !== null) env.IP_HASH_KEY = secret;
  if (checks !== null) env.CHECKS_KEY = checks;
  let now = T0;
  const logged = [];
  const spy = (name) => { const old = console[name]; console[name] = (...a) => logged.push(a.map(String).join(' ')); return () => { console[name] = old; }; };
  const make = async (id, ip, extra = {}) => {
    const headers = { Origin: ORIGIN, 'Content-Type': 'application/json', ...extra };
    if (ip) headers['CF-Connecting-IP'] = ip;
    const realNow = Date.now;
    Date.now = () => now;
    const restore = [spy('log'), spy('error'), spy('warn')];
    try {
      const res = await worker.fetch(new Request('https://noodlepads.com/api/profiles', {
        method: 'POST', headers, body: JSON.stringify({ id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: PIN }),
      }), env);
      const text = await res.text();
      return { status: res.status, text, data: JSON.parse(text) };
    } finally {
      Date.now = realNow;
      restore.forEach((r) => r());
    }
  };
  const list = async () => {
    const realNow = Date.now;
    Date.now = () => now;
    try { return await worker.fetch(new Request('https://noodlepads.com/api/profiles', { headers: { Origin: ORIGIN } }), env); } finally { Date.now = realNow; }
  };
  return { env, make, list, logged, later: (ms) => { now += ms; } };
}
const ipRows = (c) => c.env.DB.rows("SELECT name, day, n FROM counters WHERE name LIKE 'ip:%'");

test('the 4th new profile from one address in a UTC day is refused 429 busy for the network; another address and the next day are fine', async () => {
  const c = cloud();
  assert.equal(LIMITS.newProfilesPerIpPerDay, 3);
  assert.equal(LIMITS.newProfilesPerDay, 50);
  for (let i = 0; i < 3; i++) assert.equal((await c.make(`p-ip-${i}`, '203.0.113.7')).status, 201, `profile ${i + 1}`);
  const over = await c.make('p-ip-3', '203.0.113.7');
  assert.deepEqual([over.status, over.data.error, over.data.network], [429, 'busy', true]);
  assert.equal(c.env.DB.rows("SELECT 1 FROM profiles WHERE id = 'p-ip-3'").length, 0, 'nothing was made');
  assert.equal((await c.make('p-other', '203.0.113.8')).status, 201, 'another address');
  c.later(DAY);
  assert.equal((await c.make('p-ip-3', '203.0.113.7')).status, 201, 'the next UTC day');
});

test("a refused address spends none of the site's 50; the site's cap still holds for an address with room", async () => {
  const c = cloud();
  for (let i = 0; i < 3; i++) await c.make(`p-a-${i}`, '203.0.113.7');
  await c.make('p-a-3', '203.0.113.7');
  const site = () => c.env.DB.rows("SELECT n FROM counters WHERE name = 'profiles'")[0].n;
  assert.equal(site(), 3, 'the refused one did not count');
  c.env.DB.db.prepare("UPDATE counters SET n = ? WHERE name = 'profiles'").run(LIMITS.newProfilesPerDay);
  const over = await c.make('p-site-full', '198.51.100.1');
  assert.deepEqual([over.status, over.data.error, over.data.network], [429, 'busy', undefined], "the site's cap is not the network's");
});

test('an IPv6 address counts as its /64, written any way', async () => {
  assert.equal(addressGroup('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2');
  assert.equal(addressGroup('2001:DB8:1:2::1'), '2001:db8:1:2');
  assert.equal(addressGroup('2001:db8::1'), '2001:db8:0:0');
  assert.equal(addressGroup('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8:0:0');
  assert.equal(addressGroup('::1'), '0:0:0:0');
  assert.equal(addressGroup('203.0.113.7'), '203.0.113.7');
  const c = cloud();
  const homes = ['2001:db8:1:2::1', '2001:db8:1:2:aaaa::2', '2001:db8:1:2:0:0:0:3', '2001:db8:1:2:f::4'];
  for (let i = 0; i < 3; i++) assert.equal((await c.make(`p-v6-${i}`, homes[i])).status, 201);
  assert.equal((await c.make('p-v6-3', homes[3])).status, 429, 'one /64 is one home');
  assert.equal((await c.make('p-v6-other', '2001:db8:1:3::1')).status, 201, 'the next /64');
});

test('no raw address in any row or answer or log line; the rows are keyed hashes, new each day', async () => {
  const c = cloud();
  const ips = ['203.0.113.7', '2001:db8:1:2::1'];
  const answers = [];
  for (const ip of ips) for (let i = 0; i < 4; i++) answers.push(await c.make(`p-${ip.length}-${i}`, ip));
  const tables = c.env.DB.rows("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  const dump = JSON.stringify(tables.flatMap((t) => c.env.DB.rows(`SELECT * FROM ${t}`)));
  for (const needle of ['203.0.113.7', '2001:db8', '2001:db8:1:2']) {
    assert.ok(!dump.includes(needle), `the database holds no ${needle}`);
    assert.ok(!answers.some((a) => a.text.includes(needle)), `no answer has ${needle}`);
    assert.ok(!c.logged.some((l) => l.includes(needle)), `no log line has ${needle}`);
  }
  const rows = ipRows(c);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.match(r.name, /^ip:[0-9a-f]{64}$/);
  assert.deepEqual(rows.map((r) => r.n).sort(), [4, 4], 'a refused try still counts');
  // The same address on another day hashes differently, so rows of two days can't be joined.
  const before = rows.map((r) => r.name);
  c.later(DAY);
  await c.make('p-next-day', ips[0]);
  const after = ipRows(c);
  assert.equal(after.length, 1, "yesterday's rows are gone");
  assert.ok(!before.includes(after[0].name), 'a new day, a new hash');
  // A different secret makes a different hash.
  const d = cloud({ secret: 'b2'.repeat(32) });
  await d.make('p-x', ips[0]);
  assert.ok(!before.includes(ipRows(d)[0].name));
});

test("earlier days' address rows are also swept when the list is read, so none outlasts a day", async () => {
  const c = cloud();
  await c.make('p-one', '203.0.113.7');
  assert.equal(ipRows(c).length, 1);
  c.later(3 * DAY);
  assert.equal((await c.list()).status, 200);
  assert.equal(ipRows(c).length, 0);
});

test("the deploy checks' profiles are exempt, with a valid CHECKS_KEY; a made-up check id is refused and spends no address", async () => {
  const c = cloud({ checks: 'c0ffee'.repeat(8) });
  const proof = { 'X-Checks-Key': 'c0ffee'.repeat(8) };
  for (let i = 0; i < 5; i++) assert.equal((await c.make(`p-smoke-mv4cyiqj-b8b${i}`, '203.0.113.7', proof)).status, 201, `check ${i + 1}`);
  assert.equal(ipRows(c).length, 0, 'a check counts for no address');
  const fake = await c.make('p-smoke-mv4cyiqj-zzzz', '203.0.113.7');
  assert.deepEqual([fake.status, fake.data.error], [400, 'id']);
  assert.equal(ipRows(c).length, 0);
  for (let i = 0; i < 3; i++) assert.equal((await c.make(`p-kid-${i}`, '203.0.113.7')).status, 201, 'kids still have their three');
});

test('without the Worker secret or the address header, nothing is counted and nothing breaks', async () => {
  const none = cloud({ secret: null });
  for (let i = 0; i < 5; i++) assert.equal((await none.make(`p-n-${i}`, '203.0.113.7')).status, 201);
  assert.equal(ipRows(none).length, 0);
  const headerless = cloud();
  for (let i = 0; i < 5; i++) assert.equal((await headerless.make(`p-h-${i}`, null)).status, 201);
  assert.equal(ipRows(headerless).length, 0);
});

test('the app says plainly that this network is used up for today, apart from the site being busy', () => {
  const say = (data) => cloudTrouble(new CloudError(429, data));
  assert.equal(say({ error: 'busy', network: true }), 'This network has put as many people in the cloud as it can today. Try again tomorrow.');
  assert.equal(say({ error: 'busy' }), 'The cloud is busy today. Try again tomorrow.');
});

// The deploy gives the Worker IP_HASH_KEY by itself (Ben: wrangler first), only
// when it lacks one, so a deploy never changes the key and resets the day's counts.
function fakeWrangler(dir, listed) {
  const bin = join(dir, 'wrangler.sh');
  const log = join(dir, 'calls.log');
  writeFileSync(bin, `#!/usr/bin/env bash
echo "$*" >> "${log}"
if [ "$3" = list ]; then echo '${listed}'; exit 0; fi
if [ "$3" = put ]; then cat > "${join(dir, 'put.in')}"; exit 0; fi
exit 1
`);
  chmodSync(bin, 0o755);
  return { bin, log, put: join(dir, 'put.in') };
}
const script = new URL('../tools/ensure_ip_key.sh', import.meta.url).pathname;
test('tools/ensure_ip_key.sh puts a random IP_HASH_KEY from stdin when the Worker lacks one, and leaves one alone', () => {
  for (const [listed, puts] of [['[{"name":"CHECKS_KEY","type":"secret_text"}]', true], ['[{"name":"CHECKS_KEY"},{"name":"IP_HASH_KEY","type":"secret_text"}]', false], ['[]', true]]) {
    const dir = mkdtempSync(join(tmpdir(), 'ipkey-'));
    const w = fakeWrangler(dir, listed);
    const r = spawnSync('bash', [script, w.bin, 'site'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const calls = readFileSync(w.log, 'utf8');
    assert.match(calls, /^site secret list/m);
    if (puts) {
      assert.match(calls, /^site secret put IP_HASH_KEY$/m, 'on stdin, never the command line');
      assert.match(readFileSync(w.put, 'utf8'), /^[0-9a-f]{64}\n?$/);
    } else {
      assert.ok(!/secret put/.test(calls), 'left as it is');
    }
  }
});

test('deploy.yml and the Mac deploy run it before the upload, with the token only in the one step', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const at = wf.indexOf('tools/ensure_ip_key.sh');
  assert.ok(at > 0 && at < wf.indexOf('uses: pdxfixit/flarepress@'), 'before the upload');
  assert.ok(at > wf.indexOf('secret put CHECKS_KEY'));
  const step = wf.slice(wf.lastIndexOf('- name:', at), wf.indexOf('- uses:', at));
  assert.match(step, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(step, /CHECKS_KEY/);
  const just = readFileSync(new URL('../justfile', import.meta.url), 'utf8');
  const body = just.split('\ndeploy:')[1].split('\n\n')[0];
  assert.ok(body.indexOf('tools/ensure_ip_key.sh') > 0 && body.indexOf('tools/ensure_ip_key.sh') < body.indexOf('wrangler.sh" "{{site}}" deploy'));
});
