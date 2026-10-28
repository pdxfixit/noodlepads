// Profiles nobody uses (worker/cloud.js dropJunkProfiles): one made and never
// used again (no records, no sounds, no shares, no open, pull or push for a
// day) is deleted the next time a profile is made, and counts for nothing
// against the 1,000 places meanwhile. The public list shows the most recently
// used first, so a pile of junk can't hide the profiles people use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { LIMITS } from '../worker/cloud.js';
import { ORIGIN } from '../worker/http.js';
import { FakeD1 } from './fake-d1.mjs';

const T0 = Date.parse('2026-10-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const PIN = '2468';

function cloud() {
  const env = { DB: new FakeD1(), ASSETS: { fetch: async () => new Response('asset') }, ALLOW_UNPROVEN_CHECKS: 'tests' };
  let now = T0;
  const call = async (method, path, { body, key } = {}) => {
    const headers = { Origin: ORIGIN };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const res = await worker.fetch(new Request(`https://noodlepads.com/api/${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
      return { status: res.status, data: await res.json() };
    } finally {
      Date.now = realNow;
    }
  };
  return { env, call, later: (ms) => { now += ms; } };
}

async function made(c, id) {
  const r = await c.call('POST', 'profiles', { body: { id, name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: PIN } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.key;
}

const ids = (c) => c.env.DB.rows('SELECT id FROM profiles ORDER BY id').map((r) => r.id);

test('a profile never used for a day is deleted when the next is made; one that was used, or has anything in it, stays', async () => {
  const c = cloud();
  const unused = await made(c, 'p-unused');
  const pushed = await made(c, 'p-pushed');
  const pulled = await made(c, 'p-pulled');
  await made(c, 'p-fresh-keys-only');
  assert.equal((await c.call('POST', 'profiles/p-pushed/records', { key: pushed, body: { put: [{ kind: 'beats', id: 'b-1', body: { name: 'x' } }] } })).status, 200);
  c.later(10 * HOUR);
  assert.equal((await c.call('GET', 'profiles/p-pulled/records?since=0', { key: pulled })).status, 200);
  c.later(15 * HOUR);   // 25 hours after they were made
  await made(c, 'p-new');
  assert.deepEqual(ids(c), ['p-new', 'p-pulled', 'p-pushed'], 'the unused two went; the pulled, the pushed and the new stay');
  assert.equal(c.env.DB.rows("SELECT COUNT(*) AS n FROM keys WHERE profile_id IN ('p-unused', 'p-fresh-keys-only')")[0].n, 0, 'their keys went too');
  assert.equal(c.env.DB.rows("SELECT COUNT(*) AS n FROM activity WHERE profile_id = 'p-unused'")[0].n, 0, 'and their metrics');
  assert.equal((await c.call('GET', 'profiles/p-unused/records?since=0', { key: unused })).status, 404, 'a device that held one hears it is gone');
});

test('a profile made less than a day ago stays, and a row with no PIN is not touched by it', async () => {
  const c = cloud();
  await made(c, 'p-young');
  c.env.DB.db.prepare("INSERT INTO profiles (id, name, color, edited, created) VALUES ('p-by-hand', 'Funky Moose', 'teal', 0, 0)").run();
  c.later(23 * HOUR);
  await made(c, 'p-new');
  assert.ok(ids(c).includes('p-young'), 'not a day old');
  assert.ok(ids(c).includes('p-by-hand'), 'a row with no PIN is the owner\'s to remove');
  c.later(2 * HOUR);
  await made(c, 'p-newer');
  assert.ok(!ids(c).includes('p-young'), 'a day and an hour on');
  assert.ok(ids(c).includes('p-by-hand'));
});

test('unused profiles do not count against the 1,000 places', async () => {
  const c = cloud();
  const add = c.env.DB.db.prepare("INSERT INTO profiles (id, name, color, pin_hash, pin_salt, edited, created, active) VALUES (?, 'Admiral Acorn', '#1F3FA8', 'h', 's', 1, 1, ?)");
  for (let i = 0; i < LIMITS.profiles; i++) add.run(`p-junk-${i}`, 1);   // used last in 1970
  const r = await c.call('POST', 'profiles', { body: { id: 'p-real', name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: PIN } });
  assert.equal(r.status, 201, 'room, although 1,000 rows are there');
  c.env.DB.db.prepare('DELETE FROM profiles').run();
  const addUsed = c.env.DB.db.prepare("INSERT INTO profiles (id, name, color, pin_hash, pin_salt, rev, edited, created, active) VALUES (?, 'Admiral Acorn', '#1F3FA8', 'h', 's', 1, 1, 1, ?)");
  for (let i = 0; i < LIMITS.profiles; i++) addUsed.run(`p-used-${i}`, T0);   // each has something in it
  const full = await c.call('POST', 'profiles', { body: { id: 'p-more', name: 'Admiral Acorn', avatar: '🦖', color: '#1F3FA8', pin: PIN } });
  assert.deepEqual([full.status, full.data.error], [507, 'full'], 'used ones fill it');
});

test('the public list shows the most recently used first, not the newest made', async () => {
  const c = cloud();
  const older = await made(c, 'p-older');
  c.later(2 * HOUR);
  await made(c, 'p-newer');
  c.later(2 * HOUR);
  await c.call('GET', 'profiles/p-older/records?since=0', { key: older });   // used again
  const list = await c.call('GET', 'profiles');
  assert.deepEqual(list.data.profiles.map((p) => p.id), ['p-older', 'p-newer']);
});
