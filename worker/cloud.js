// Cloud profiles (docs/design/cloud-profiles.md): the shared list, each
// profile's records and sounds, its keys, and share codes. Everything is in the one D1 database (binding DB,
// worker/schema.sql). The device keeps the working copy; this only stores
// and hands back, and checks everything it is sent.

import { PERSON_ID, PERSON_COLORS, OLD_PERSON_COLORS } from '../web/model.js';
import { isListedEmoji } from '../web/emoji-check.js';
import { isFunName, cutName } from '../web/names.js';
import { CLOUD_ID, SYNCED } from '../web/reid.js';
import { ORIGIN, json, fail, Refuse, readJson, readBytes, randomId, sha256Hex, hmacHex, toBytes, withinDaily, utcDay } from './http.js';
import { isPin, newSalt, hashSecret, checkSecret, OPENING, KEYED, shareCode, isShareCode, plainCode } from './pin.js';
import { noteEvent, forgetProfile, expireReports } from './metrics.js';
import { allowed } from './events-worker.js';

// A D1 row holds at most 2,000,000 bytes; audio goes in pieces a little smaller.
export const CHUNK_BYTES = 1_900_000;
// The biggest sound the cloud keeps (web/cloud-sync.js CLOUD_MAX_SOUND): 14
// pieces. The app makes longer ones; those stay on their device.
export const MAX_SOUND_BYTES = 25 * 1024 * 1024;

// The free plan's 500 MB database, and its daily rows, shared out.
export const LIMITS = {
  listed: 300,                       // profiles in one listing
  profiles: 1000,                    // profiles in all
  profileBytes: 40 * 1024 * 1024,    // one profile's sounds
  totalBytes: 400 * 1024 * 1024,     // every sound
  newProfilesPerDay: 50,             // across the site (Ben, 2026-10-26)
  newProfilesPerIpPerDay: 3,         // from one address (below; Ben, 2026-10-26)
  checkProfilesPerDay: 100,          // the deploy checks' (TEST_PROFILE): two a deploy
  pushesPerDay: 5000,
  sharesPerDay: 500,
  // One profile's own share of a day (UTC), so it can't use up the site's
  // caps above for every family: a fifth of the pushes, a tenth of the
  // shares, and new sounds (each one D1 rows written).
  profilePushesPerDay: 1000,
  profileSoundsPerDay: 2000,
  profileSharesPerDay: 50,
  perPush: 200,                      // records in one push
  recordBytes: 512 * 1024,           // one record's JSON (a long take is about 400 KB)
  pushBytes: 4 * 1024 * 1024,        // one push's body
  profileRecordBytes: 10 * 1024 * 1024, // one profile's records and shares (ROW_BYTES each, plus its JSON)
  totalRecordBytes: 60 * 1024 * 1024,   // every profile's: with every sound, under the 500 MB
  pullPage: 500,                     // records in one pull
  sharesPerProfile: 50,              // and their bundles count in profileRecordBytes
  shareBytes: 1024 * 1024,           // one share's bundle
};

// What a record costs in the database: its JSON, plus about 100 bytes for its
// ids, rev and index entries, so a tombstone (no body) costs something too.
// A share costs its bundle and title, plus a row for it and one for each
// sound it names. profiles.record_bytes keeps each profile's total of both
// (migration 006 counts it the same way).
export const ROW_BYTES = 100;
const SIZE = `COALESCE(LENGTH(CAST(records.body AS BLOB)), 0) + ${ROW_BYTES}`;
const SHARE_SIZE = `LENGTH(CAST(shares.bundle AS BLOB)) + LENGTH(CAST(shares.title AS BLOB))
  + ${ROW_BYTES} * (1 + (SELECT COUNT(*) FROM share_sounds WHERE share_sounds.code = shares.code))`;
const byteLength = (text) => new TextEncoder().encode(text).length;
// The records a push names, one bound JSON list of [kind, id] (D1 binds at
// most 100 values a query), each found by its primary key.
const TOUCHED = `json_each(?) AS j JOIN records ON records.profile_id = ?
  AND records.kind = json_extract(j.value, '$[0]') AND records.id = json_extract(j.value, '$[1]')`;

// A device that did not tick "Remember on this device" holds its key in
// memory only; keys like that are deleted once they are a week old.
export const SESSION_KEY_MS = 7 * 24 * 60 * 60 * 1000;
// Any key unused for half a year stops working and is deleted: a family that
// opens the app even every few months keeps its devices; a phone given away
// or a browser cleared doesn't keep a key forever. (A device whose key went
// opens the profile again: by itself with no PIN, else it asks the PIN.)
export const KEY_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
// A profile keeps the keys of its 20 most recently used devices; opening it
// on one more drops the one unused longest.
export const KEYS_PER_PROFILE = 20;
// Last activity is written at most once an hour per profile (one row write).
export const ACTIVE_STEP_MS = 60 * 60 * 1000;

// The stores that belong to one person (state.js, store.js).
export const KINDS = SYNCED;
const RECORD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SOUND_ID = /^s-[a-z2-7]{26}$/;
const SHA = /^[0-9a-f]{64}$/;
const SHARE_KINDS = ['sound', 'beat', 'song'];

const newSoundId = () => `s-${randomId(16)}`;
export const pieceCount = (bytes) => Math.max(1, Math.ceil(bytes / CHUNK_BYTES));
// How many bytes piece `n` of a sound of `bytes` holds.
export const pieceSize = (bytes, n) => Math.min(CHUNK_BYTES, bytes - n * CHUNK_BYTES);

// ── keys ──

// `seen` (handleCloud's, for the metrics) learns the new key's hash: the device.
async function newKey(env, profileId, now, session = false, seen = {}) {
  const key = randomId(20);
  const hash = await sha256Hex(key);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO keys (hash, profile_id, created, session, used) VALUES (?, ?, ?, ?, ?)')
      .bind(hash, profileId, now, session ? 1 : 0, now),
    env.DB.prepare(`DELETE FROM keys WHERE profile_id = ? AND hash NOT IN
      (SELECT hash FROM keys WHERE profile_id = ? ORDER BY hash = ? DESC, MAX(used, created) DESC, created DESC LIMIT ?)`)
      .bind(profileId, profileId, hash, KEYS_PER_PROFILE),
  ]);
  seen.device = hash;
  return key;
}

const bearer = (request) => /^Bearer ([a-z2-7]{32})$/.exec(request.headers.get('Authorization') || '')?.[1] ?? null;

// Marks the profile as used now, at most once an hour (`just cloud-prune`
// finds the ones nobody has used in a long time).
const touch = (env, id, now) => env.DB.prepare('UPDATE profiles SET active = ? WHERE id = ? AND active < ?')
  .bind(now, id, now - ACTIVE_STEP_MS);

// What the request's key opens: the profile's id, NO_KEY (no key, or one the
// cloud doesn't know), or NO_PIN (the profile has no PIN, which the cloud
// treats as not there). A key unused for KEY_IDLE_MS is deleted instead; a
// used one is marked, at most once an hour (one row write). `used` is 0 on a
// key an older Worker made: its `created` counts. One SELECT reads the key
// and whether its profile has a PIN.
const NO_KEY = Symbol('no key');
const NO_PIN = Symbol('no PIN');
async function keyProfile(request, env, now) {
  const key = bearer(request);
  if (!key) return NO_KEY;
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare(`SELECT k.profile_id, k.created, k.used, p.pin_hash IS NOT NULL AS has_pin
    FROM keys AS k LEFT JOIN profiles AS p ON p.id = k.profile_id WHERE k.hash = ?`).bind(hash).first();
  if (!row) return NO_KEY;
  const last = Math.max(row.used, row.created);
  if (last < now - KEY_IDLE_MS) {
    await env.DB.prepare('DELETE FROM keys WHERE hash = ?').bind(hash).run();
    return NO_KEY;
  }
  if (!row.has_pin) return NO_PIN;
  if (last < now - ACTIVE_STEP_MS) await env.DB.prepare('UPDATE keys SET used = ? WHERE hash = ?').bind(now, hash).run();
  return row.profile_id;
}

// The id the key opens, or a refusal. A profile with no PIN is not there
// (404 'profile', never 401): it can exist only by hand in D1, and nothing
// serves it. A key that isn't found is 401 'key' while its profile is there
// with a PIN (a PIN change closed it), and 404 'profile' once the profile is
// gone: that is how another device hears someone left the cloud. The extra
// SELECT runs only on this failure path.
async function needKey(request, env, profileId, now) {
  const who = await keyProfile(request, env, now);
  if (who === NO_PIN) throw new Refuse(404, 'profile');
  if (who === NO_KEY) {
    if (profileId && !await env.DB.prepare('SELECT 1 AS x FROM profiles WHERE id = ? AND pin_hash IS NOT NULL').bind(profileId).first()) {
      throw new Refuse(404, 'profile');
    }
    throw new Refuse(401, 'key');
  }
  if (profileId && who !== profileId) throw new Refuse(401, 'key');
  return who;
}

// Only a profile with a PIN is there.
async function getProfile(env, id) {
  const row = await env.DB.prepare('SELECT * FROM profiles WHERE id = ? AND pin_hash IS NOT NULL').bind(id).first();
  if (!row) throw new Refuse(404, 'profile');
  return row;
}

// The PIN rule: right, or 401 {tries} / 429 {wait}. Opening counts its wrong
// tries apart (`fails`) from a request that carries a key (`keyed`:
// `key_fails`), so a stranger's wrong tries at /open never lock Leave,
// Remove PIN, Change PIN or Delete on a device that has the key.
async function needPin(env, profile, pin, now, keyed = false) {
  const r = await checkSecret(env.DB, { id: profile.id, hash: profile.pin_hash, salt: profile.pin_salt }, pin, now, keyed ? KEYED : OPENING);
  if (r.ok) return;
  if (r.wait) throw new Refuse(429, 'wait', { wait: r.wait });
  throw new Refuse(401, 'pin', { tries: r.tries });
}

const looks = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, edited: p.edited, pin: !!p.pin_hash });

function checkLooks(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    if (!isFunName(body.name)) throw new Refuse(400, 'name');
    out.name = body.name;
  }
  if (!partial || body.avatar !== undefined) {
    const avatar = body.avatar ?? '';
    // One emoji from the app's full list (web/emoji-check.js), never free text.
    if (avatar !== '' && !isListedEmoji(avatar)) throw new Refuse(400, 'avatar');
    out.avatar = avatar;
  }
  if (!partial || body.color !== undefined) {
    // Today's colors, or one from before 2026-10-19 an older copy of the app still sends.
    if (!PERSON_COLORS.includes(body.color) && !Object.hasOwn(OLD_PERSON_COLORS, body.color)) throw new Refuse(400, 'color');
    out.color = body.color;
  }
  return out;
}

// ── the list, making and opening ──

// Every person the app makes has an id from newId('p'): "p-" and random
// letters ("p-mv4cyiqj-b8bt"), and only those are made or listed (web/reid.js
// CLOUD_ID). An older device's people had the plain ids an older boards.json
// gave them, which were the kids' names. Nothing renames a profile: the two
// that went up under plain ids were moved by hand (Ben, Q27: "Drop the
// rename code"), and a device still linked to one drops the link and puts
// the person up as new (web/state.js reIdStoredPeople).
export { CLOUD_ID };

// One profile's daily allowance (LIMITS.profile…PerDay), counted in
// `counters` under a name of its own, "profile:<id>:<what>" (one row a day
// each; makeProfile sweeps the days before today). Over it: 429 'busy' with
// `mine`, which the app says is this profile's limit for today.
const PROFILE_COUNTER = 'profile:';
async function withinProfileDaily(env, id, what, limit, now) {
  if (!await withinDaily(env, `${PROFILE_COUNTER}${id}:${what}`, limit, now)) throw new Refuse(429, 'busy', { mine: true });
}
// One address's new profiles a UTC day (LIMITS.newProfilesPerIpPerDay), counted
// in `counters` as "ip:<hash>" (one row a day each). The hash is
// HMAC(HMAC(IP_HASH_KEY, today), address): a key that is new every UTC day, so
// a row cannot be matched to an address without the Worker's secret, and no
// two days' rows to each other. The address itself is never stored, logged or
// answered, and the rows of earlier days are deleted (sweepDailyCounters).
// Without the secret (the deploy puts it in) or the header (Cloudflare always
// sends it), nothing is counted. An IPv6 address counts as its /64, the
// smallest network one home or phone is given, or one person would hold 2^64.
const IP_COUNTER = 'ip:';
export function addressGroup(ip) {
  if (!ip.includes(':') || ip.includes('.')) return ip.toLowerCase();
  const [head, tail] = ip.toLowerCase().split('::');
  const first = head ? head.split(':') : [];
  const last = tail === undefined ? [] : (tail ? tail.split(':') : []);
  const groups = tail === undefined ? first : [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}
// The address's keyed daily hash, without the "ip:" prefix; null when there is
// no secret or no header. Never stored by itself: the daily counters keep it
// under IP_COUNTER, and the open limiter holds it for a minute.
async function addressHash(request, env, now) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!env.IP_HASH_KEY || !ip) return null;
  const todaysKey = await hmacHex(env.IP_HASH_KEY, utcDay(now));
  return hmacHex(todaysKey, addressGroup(ip.trim()));
}
async function ipCounterName(request, env, now) {
  const hash = await addressHash(request, env, now);
  return hash && IP_COUNTER + hash;
}

// The rows of days before today, by the primary key's range (no table scan):
// each profile's allowances and each address's count. Also run when the list
// is read, so no address hash waits a day for the next new profile.
const sweepDailyCounters = (env, now) => env.DB.batch([
  env.DB.prepare('DELETE FROM counters WHERE name >= ? AND name < ? AND day < ?').bind(PROFILE_COUNTER, 'profile;', utcDay(now)),
  env.DB.prepare('DELETE FROM counters WHERE name >= ? AND name < ? AND day < ?').bind(IP_COUNTER, 'ip;', utcDay(now)),
]);

// The deploy checks' throwaway profiles (tools/look-cloud.mjs testId; as
// tools/cloud_admin.py TEST_PREFIXES). Such an id gets caps of its own, just
// big enough for the checks: 100 a day, 64 KB of records, one sound of at
// most 4 MB (cloud-smoke's is 1.9 MB and a little, in two pieces), one share.
// It never shows in the list, and is deleted 10 minutes after it was made (a
// check takes seconds). Only the checks may use one: a request naming such an
// id must carry the Worker secret CHECKS_KEY in CHECKS_HEADER (provenCheck),
// else it is refused as a bad id (400 'id'). The app never makes one (its ids
// are "p-" and the time in base 36).
export const TEST_PROFILE = /^p-(smoke|e2e)-/;
export const CHECKS_HEADER = 'X-Checks-Key';
// The secret, compared in time that does not depend on where it differs
// (events-worker.js allowed). Until the deploy has put CHECKS_KEY in the
// Worker (it does once the GitHub secret is set), the id alone passes, as
// before, so the checks keep working while it is unset.
export const provenCheck = (request, env) => !env.CHECKS_KEY
  || allowed(request, env, { key: { header: CHECKS_HEADER, secret: 'CHECKS_KEY' } });
const needProvenCheck = (request, env, id) => { if (isCheck(id) && !provenCheck(request, env)) throw new Refuse(400, 'id'); };
export const CHECK_LIMITS = { recordBytes: 64 * 1024, soundBytes: 4 * 1024 * 1024, sounds: 1, shares: 1 };
export const CHECK_MS = 10 * 60 * 1000;
const isCheck = (id) => TEST_PROFILE.test(id);
const IS_CHECK = "(id LIKE 'p-smoke-%' OR id LIKE 'p-e2e-%')";
const NOT_CHECK = `NOT ${IS_CHECK}`;

// CLOUD_ID in SQL: "p-" and 1 to 60 of a-z, 0-9 and "-".
const IS_CLOUD_ID = "(id GLOB 'p-?*' AND substr(id, 3) NOT GLOB '*[^0-9a-z-]*' AND length(id) <= 62)";
const DAY_MS = 24 * 60 * 60 * 1000;

async function listProfiles(env) {
  // Check profiles and old plain ids are left out in the SQL, before the
  // LIMIT, so any number of them can't push kids out of the 300. Only profiles
  // with a PIN are listed (one with none, made by hand, is not there). Anyone can
  // read the list, so it says only which day a look last changed.
  const rows = await env.DB.prepare(`SELECT * FROM profiles WHERE pin_hash IS NOT NULL AND ${NOT_CHECK} AND ${IS_CLOUD_ID} ORDER BY created DESC LIMIT ?`).bind(LIMITS.listed).all();
  return json(200, {
    profiles: rows.results.filter((r) => CLOUD_ID.test(r.id) && !isCheck(r.id))
      .map((r) => ({ ...looks(r), edited: Math.floor((Number(r.edited) || 0) / DAY_MS) * DAY_MS })),
  });
}

// Everything of a profile, gone: its shares and sounds, records, keys, the
// profile and its metrics.
async function wipeProfile(env, id) {
  await env.DB.batch([
    ...dropProfileData(env, id),
    env.DB.prepare('DELETE FROM records WHERE profile_id = ?').bind(id),
    env.DB.prepare('DELETE FROM keys WHERE profile_id = ?').bind(id),
    env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id),
  ]);
  await forgetProfile(env, id);
}

// Deletes every check profile older than CHECK_MS (a check killed midway,
// or someone using such an id to keep a profile): when a profile is made,
// and when a sound starts.
async function dropOldChecks(env, now) {
  const old = (await env.DB.prepare(`SELECT id FROM profiles WHERE ${IS_CHECK} AND created < ?`)
    .bind(now - CHECK_MS).all()).results;
  for (const { id } of old) await wipeProfile(env, id);
}

async function makeProfile(request, env, now, seen) {
  const body = await readJson(request);
  if (typeof body.id !== 'string' || !CLOUD_ID.test(body.id)) throw new Refuse(400, 'id');
  needProvenCheck(request, env, body.id);
  const look = checkLooks(body);
  // A profile needs a PIN: any `pin` that is not four digits is refused.
  if (!isPin(body.pin)) throw new Refuse(400, 'needs pin');
  await dropOldChecks(env, now);
  await sweepDailyCounters(env, now);
  if (await env.DB.prepare('SELECT 1 AS x FROM profiles WHERE id = ?').bind(body.id).first()) throw new Refuse(409, 'exists');
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first();
  if (n >= LIMITS.profiles) throw new Refuse(507, 'full');
  // The deploy checks' throwaway profiles have a daily cap of their own, so
  // they never use up kids' new profiles. A deleted profile gives no place
  // back: making and deleting can't get round either cap.
  const checks = isCheck(body.id);
  // This address's three first, so a refused address spends none of the site's.
  const ipName = checks ? null : await ipCounterName(request, env, now);
  if (ipName && !await withinDaily(env, ipName, LIMITS.newProfilesPerIpPerDay, now)) throw new Refuse(429, 'busy', { network: true });
  if (!await withinDaily(env, checks ? 'check-profiles' : 'profiles', checks ? LIMITS.checkProfilesPerDay : LIMITS.newProfilesPerDay, now)) {
    throw new Refuse(429, 'busy');
  }
  const salt = newSalt();
  const hash = await hashSecret(body.pin, salt);
  const edited = Number.isFinite(body.edited) ? Math.min(body.edited, now) : now;
  await env.DB.prepare(`INSERT INTO profiles (id, name, avatar, color, pin_hash, pin_salt, rev, edited, created, active, bytes_counted)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`).bind(body.id, look.name, look.avatar, look.color, hash, salt, edited, now, now).run();
  Object.assign(seen, { kind: 'make', profile: body.id });
  return json(201, { key: await newKey(env, body.id, now, false, seen), rev: 0 });
}

// Opens a profile on a device: {pin?, remember?} -> a key. `remember: false`
// makes a session key, which the device keeps in memory only.
async function openProfile(request, env, id, now, seen) {
  const body = await readJson(request);
  const p = await getProfile(env, id);
  // A wrong PIN is noted too (handleCloud): someone else trying the profile.
  Object.assign(seen, { kind: 'open', profile: id });
  await needPin(env, p, body.pin, now);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM keys WHERE profile_id = ? AND ((session = 1 AND created < ?) OR MAX(used, created) < ?)')
      .bind(id, now - SESSION_KEY_MS, now - KEY_IDLE_MS),
    touch(env, id, now),
  ]);
  return json(200, { key: await newKey(env, id, now, body.remember === false, seen), rev: p.rev, ...looks(p) });
}

// "Forget on this device": the key the request carries is deleted.
async function forgetKey(request, env, id, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  await env.DB.prepare('DELETE FROM keys WHERE hash = ?').bind(await sha256Hex(bearer(request))).run();
  return json(200, { ok: true });
}

// How many devices remember this profile: the lasting keys (a session key is
// one visit's), not idle for KEY_IDLE_MS. This device counts when it holds one.
async function countKeys(request, env, id, now) {
  await needKey(request, env, id, now);
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM keys WHERE profile_id = ? AND session = 0 AND MAX(used, created) >= ?')
    .bind(id, now - KEY_IDLE_MS).first();
  return json(200, { count: row?.n ?? 0 });
}

// "Forget all devices": every key of the profile is deleted, this request's
// too, so every device asks the PIN next time. The PIN is asked like Leave's
// and Delete's (a request with a key: `key_fails`), so a stranger's tries at
// /open never lock it, and a key alone can't cut the other devices off.
async function forgetAllKeys(request, env, id, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  const body = await readJson(request);
  const p = await getProfile(env, id);
  await needPin(env, p, body.pin, now, true);
  await env.DB.prepare('DELETE FROM keys WHERE profile_id = ?').bind(id).run();
  return json(200, { ok: true });
}

async function changeProfile(request, env, id, now, seen) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  const body = await readJson(request);
  const p = await getProfile(env, id);
  const out = { ok: true };
  // Remove PIN through the API is refused: leaving is a DELETE, which needs the
  // key and the PIN. Checked before anything changes.
  if (body.newPin === null) throw new Refuse(400, 'needs pin');
  if (body.newPin !== undefined && !isPin(body.newPin)) throw new Refuse(400, 'pin');
  const look = checkLooks(body, { partial: true });
  if (Object.keys(look).length) {
    const edited = Number.isFinite(body.edited) ? Math.min(body.edited, now) : now;
    if (edited >= p.edited) {
      await env.DB.prepare('UPDATE profiles SET name = ?, avatar = ?, color = ?, edited = ? WHERE id = ?')
        .bind(look.name ?? p.name, look.avatar ?? p.avatar, look.color ?? p.color, edited, id).run();
    }
  }
  if (body.newPin !== undefined) {
    await needPin(env, p, body.pin, now, true);
    const salt = newSalt();
    const hash = await hashSecret(body.newPin, salt);
    // A new PIN closes the profile on every device; this one gets a new key.
    // One UPDATE from one hash to the next: a profile with a PIN never reads as gone mid-change.
    await env.DB.batch([
      env.DB.prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ?, fails = 0, locked_until = 0, key_fails = 0, key_locked_until = 0 WHERE id = ?').bind(hash, salt, id),
      env.DB.prepare('DELETE FROM keys WHERE profile_id = ?').bind(id),
    ]);
    // The same device, under its new key.
    Object.assign(seen, { kind: 'pin', profile: id, was: await sha256Hex(bearer(request)) });
    out.key = await newKey(env, id, now, false, seen);
  }
  return json(200, out);
}

// A sound no share uses (SQL, on the table `sounds`).
const UNSHARED = 'NOT EXISTS (SELECT 1 FROM share_sounds WHERE share_sounds.sound_id = sounds.id)';

// Deleting a profile deletes its shares and every sound of its own (a share
// names only its sharer's sounds: ownSounds). Unshare needs the profile's key,
// so a share left behind could never be ended. A remix someone made is their
// own record with its own copy of the audio, under their profile, so it stays.
// (Sounds with profile_id '' are the shares' of profiles deleted before
// 2026-10-26, which kept them.)
const dropProfileData = (env, id) => [
  env.DB.prepare('DELETE FROM share_sounds WHERE code IN (SELECT code FROM shares WHERE profile_id = ?)').bind(id),
  env.DB.prepare('DELETE FROM shares WHERE profile_id = ?').bind(id),
  env.DB.prepare('DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE profile_id = ?)').bind(id),
  env.DB.prepare('DELETE FROM sounds WHERE profile_id = ?').bind(id),
];

async function deleteProfile(request, env, id, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  const body = await readJson(request);
  const p = await getProfile(env, id);
  await needPin(env, p, body.pin, now, true);
  await wipeProfile(env, id);
  return json(200, { ok: true });
}

// ── records ──

async function pull(request, url, env, id, now, seen) {
  await needKey(request, env, id, now);
  await slowDown(env, LIMITERS.pull, id);
  Object.assign(seen, { kind: 'pull', profile: id });
  await touch(env, id, now).run();
  const since = Math.max(0, Number.parseInt(url.searchParams.get('since') || '0', 10) || 0);
  // The profile's rev first: a push that lands while this reads is left for next time.
  const p = await getProfile(env, id);
  const { rev } = p;
  const rows = (await env.DB.prepare(`SELECT kind, id, body, rev, deleted FROM records
    WHERE profile_id = ? AND rev > ? AND rev <= ? ORDER BY rev, kind, id LIMIT ?`)
    .bind(id, since, rev, LIMITS.pullPage + 1).all()).results;
  let page = rows;
  let more = false;
  if (rows.length > LIMITS.pullPage) {
    // A page ends between two pushes, never inside one.
    const last = rows[LIMITS.pullPage - 1].rev;
    page = rows.filter((r) => r.rev < last);
    if (!page.length) page = rows.filter((r) => r.rev === last);
    more = true;
  }
  return json(200, {
    records: page.map((r) => (r.deleted ? { kind: r.kind, id: r.id, deleted: true } : { kind: r.kind, id: r.id, body: JSON.parse(r.body) })),
    rev: more ? page.at(-1).rev : rev,
    profile: { ...looks(p), created: p.created },
    more,
  });
}

function checkRecordKey(r) {
  if (!r || !KINDS.includes(r.kind) || typeof r.id !== 'string' || !RECORD_ID.test(r.id)) throw new Refuse(400, 'record');
}

// A profile's bytes counted from what it holds (its records and shares).
const COUNT = `(SELECT COALESCE(SUM(${SIZE}), 0) FROM records WHERE records.profile_id = profiles.id)
  + (SELECT COALESCE(SUM(${SHARE_SIZE}), 0) FROM shares WHERE shares.profile_id = profiles.id)`;
const recount = (env, id) => env.DB.prepare(`UPDATE profiles SET record_bytes = ${COUNT}, bytes_counted = 1 WHERE id = ? RETURNING record_bytes`)
  .bind(id).first();
// Counts the profiles this Worker hasn't counted yet (bytes_counted 0): a
// push from the Worker before this one, after migration 006, left its count
// low. The writer first, then up to 5 more each time, so every count is
// exact soon after the deploy; then it writes nothing.
const countUncounted = (env, id) => env.DB.prepare(`UPDATE profiles SET record_bytes = ${COUNT}, bytes_counted = 1
  WHERE bytes_counted = 0 AND (id = ? OR id IN (SELECT id FROM profiles WHERE bytes_counted = 0 AND id <> ? LIMIT 5))`).bind(id, id).run();

// Room taken by writes not yet written is kept apart, in
// profiles.reserved_bytes, so a recount (of what is written) never wipes it.
// A reservation older than RESERVE_MS belongs to a write that died between
// taking and settling (a Worker past its CPU limit): it no longer counts.
export const RESERVE_MS = 60 * 1000;
const RESERVED = (at) => `(CASE WHEN reserved_at < ${at} THEN 0 ELSE reserved_bytes END)`;

// Takes `growth` more bytes for profile `id`, or a 507: its own cap
// ('records full'), else everyone's ('cloud full'). One UPDATE checks both
// caps, counting what is written and what other writes have reserved, and
// adds to the reservations, so writes sent at once can't all pass on the
// same count. The write settles it (`settle`), or `release` gives it back.
// Before refusing, the profile's written bytes are counted again, in case
// that count drifted high; reservations are left as they are.
async function reserve(env, id, growth, now) {
  if (growth <= 0) return 0;
  const cap = isCheck(id) ? CHECK_LIMITS.recordBytes : LIMITS.profileRecordBytes;
  await countUncounted(env, id);
  const old = now - RESERVE_MS;
  const take = () => env.DB.prepare(`UPDATE profiles SET reserved_bytes = ${RESERVED('?')} + ?, reserved_at = ?
    WHERE id = ? AND record_bytes + ${RESERVED('?')} + ? <= ?
    AND (SELECT SUM(p.record_bytes + CASE WHEN p.reserved_at < ? THEN 0 ELSE p.reserved_bytes END) FROM profiles AS p) + ? <= ? RETURNING record_bytes`)
    .bind(old, growth, now, id, old, growth, cap, old, growth, LIMITS.totalRecordBytes).first();
  if (await take()) return growth;
  await recount(env, id);
  if (await take()) return growth;
  throw await overWhich(env, id, growth, cap, now);
}

// Which cap `growth` more bytes would pass: the profile's or everyone's.
async function overWhich(env, id, growth, cap, now) {
  const mine = await env.DB.prepare(`SELECT record_bytes + ${RESERVED('?')} AS b FROM profiles WHERE id = ?`).bind(now - RESERVE_MS, id).first();
  return new Refuse(507, (mine?.b ?? 0) + Math.max(growth, 1) > cap ? 'records full' : 'cloud full');
}
// The text the in-batch cap check hands json() to stop a batch.
const OVER = 'over a cap';

// The statement that ends a reservation, in the write's own batch.
const settle = (env, id, bytes) => env.DB.prepare('UPDATE profiles SET reserved_bytes = MAX(0, reserved_bytes - ?) WHERE id = ?').bind(bytes, id);

// Gives back a reservation whose write failed (best effort: one left behind
// stops counting after RESERVE_MS).
const release = (env, id, bytes) => (bytes ? settle(env, id, bytes).run().catch((err) => console.error('cloud: release', err)) : null);

// A push puts and deletes records, all in one rev. With `since` (the rev the
// device has pulled up to), a record another device wrote after that is left
// as it is and named in `stale`: the device pulls it, merges, and pushes
// again, so two devices pushing the same record at once never lose one
// edit. Without `since` (an older copy of the app), every record is written.
async function push(request, env, id, now, seen) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  await slowDown(env, LIMITERS.records, id);
  const body = await readJson(request, LIMITS.pushBytes);
  Object.assign(seen, { kind: 'push', profile: id });
  const put = Array.isArray(body.put) ? body.put : [];
  const del = Array.isArray(body.del) ? body.del : [];
  const since = Number.isSafeInteger(body.since) && body.since >= 0 ? body.since : null;
  if (put.length + del.length > LIMITS.perPush) throw new Refuse(413, 'too many');
  if (!put.length && !del.length) {
    const { rev } = await getProfile(env, id);
    return json(200, { rev, was: rev });
  }
  const texts = put.map((r) => {
    checkRecordKey(r);
    if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body)) throw new Refuse(400, 'record');
    const text = JSON.stringify(r.body);
    if (text.length > LIMITS.recordBytes) throw new Refuse(413, 'record size', { id: r.id });
    return text;
  });
  for (const r of del) checkRecordKey(r);
  // A sound's record names audio this profile has, all of it.
  const sounds = [...new Set(put.filter((r) => r.kind === 'clips').map((r) => r.body.sound))];
  for (const s of sounds) if (typeof s !== 'string' || !SOUND_ID.test(s)) throw new Refuse(400, 'sound');
  // Two reads for the whole push, whatever its size (D1 caps the queries in
  // one call): the sounds it names, and the sound each of its clips held.
  const clips = [...del, ...put].filter((r) => r.kind === 'clips');
  const [have, held] = await env.DB.batch([
    env.DB.prepare('SELECT id, got, chunks FROM sounds WHERE profile_id = ? AND id IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(sounds)),
    env.DB.prepare("SELECT id, sound_id FROM records WHERE profile_id = ? AND kind = 'clips' AND id IN (SELECT value FROM json_each(?))").bind(id, JSON.stringify(clips.map((r) => r.id))),
  ]);
  const whole = new Map(have.results.map((row) => [row.id, row.got >= row.chunks]));
  for (const s of sounds) if (!whole.get(s)) throw new Refuse(409, 'sound', { sound: s });
  await getProfile(env, id);
  const cap = isCheck(id) ? CHECK_LIMITS.recordBytes : LIMITS.profileRecordBytes;
  // What the push adds to the profile's bytes, if every record lands: the
  // last word on each record (a put, or a delete's tombstone) less what it
  // holds now. A push that adds nothing is never refused, so a full profile
  // can still delete and edit.
  const after = new Map();
  put.forEach((r, i) => after.set(`${r.kind}:${r.id}`, { kind: r.kind, id: r.id, size: byteLength(texts[i]) + ROW_BYTES }));
  for (const r of del) after.set(`${r.kind}:${r.id}`, { kind: r.kind, id: r.id, size: ROW_BYTES });
  const touched = JSON.stringify([...after.values()].map((r) => [r.kind, r.id, r.size]));
  const before = (await env.DB.prepare(`SELECT ${SIZE} AS size FROM ${TOUCHED}`).bind(touched, id).all()).results;
  const growth = [...after.values()].reduce((sum, r) => sum + r.size, 0) - before.reduce((sum, r) => sum + r.size, 0);
  await withinProfileDaily(env, id, 'pushes', LIMITS.profilePushesPerDay, now);
  if (!await withinDaily(env, 'pushes', LIMITS.pushesPerDay, now)) throw new Refuse(429, 'busy');
  // The sounds deleted clips held, to delete once nothing names them. So do
  // the sounds a clip held before new audio (a made sound changed).
  const heldBy = new Map(held.results.map((row) => [row.id, row.sound_id]));
  const orphans = [];
  for (const r of clips) {
    const was = heldBy.get(r.id);
    if (was && was !== r.body?.sound) orphans.push(was);
  }
  const revNow = '(SELECT rev FROM profiles WHERE id = ?)';
  // Only a record nobody wrote since the device's pull, when it says which.
  const unseen = since === null ? '' : ' WHERE records.rev <= ?';
  const guard = since === null ? [] : [since];
  const reserved = await reserve(env, id, growth, now);
  const statements = [env.DB.prepare('UPDATE profiles SET rev = rev + 1 WHERE id = ?').bind(id), touch(env, id, now), settle(env, id, reserved)];
  // The last word on the caps, inside the write itself: what the push adds,
  // from what its records hold at this moment (another push may have
  // deleted or filled them since `growth` was read). Over a cap it stops the
  // whole batch (json() of a bad text is SQLite's way to throw), and nothing lands.
  const old = now - RESERVE_MS;
  statements.push(env.DB.prepare(`SELECT CASE WHEN d.delta > 0 AND (p.record_bytes + ${RESERVED('?')} + d.delta > ?
      OR (SELECT SUM(q.record_bytes + CASE WHEN q.reserved_at < ? THEN 0 ELSE q.reserved_bytes END) FROM profiles AS q) + d.delta > ?)
    THEN json('${OVER}') END AS over
    FROM profiles AS p, (SELECT COALESCE(SUM(json_extract(j.value, '$[2]') - CASE WHEN r.profile_id IS NULL THEN 0 ELSE ${SIZE.replaceAll('records.', 'r.')} END), 0) AS delta
      FROM json_each(?) AS j LEFT JOIN records AS r ON r.profile_id = ?
        AND r.kind = json_extract(j.value, '$[0]') AND r.id = json_extract(j.value, '$[1]')
      ${since === null ? '' : 'WHERE r.profile_id IS NULL OR r.rev <= ?'}) AS d
    WHERE p.id = ?`)
    .bind(old, cap, old, LIMITS.totalRecordBytes, touched, id, ...guard, id));
  // The profile's bytes: less what the records about to be written hold now…
  statements.push(env.DB.prepare(`UPDATE profiles SET record_bytes = record_bytes - (SELECT COALESCE(SUM(${SIZE}), 0) FROM ${TOUCHED}${unseen})
    WHERE id = ?`).bind(touched, id, ...guard, id));
  put.forEach((r, i) => statements.push(env.DB.prepare(`INSERT INTO records (profile_id, kind, id, body, sound_id, rev, deleted)
    VALUES (?, ?, ?, ?, ?, ${revNow}, 0)
    ON CONFLICT (profile_id, kind, id) DO UPDATE SET body = excluded.body, sound_id = excluded.sound_id, rev = excluded.rev, deleted = 0${unseen}`)
    .bind(id, r.kind, r.id, texts[i], r.kind === 'clips' ? r.body.sound : null, id, ...guard)));
  for (const r of del) {
    statements.push(env.DB.prepare(`INSERT INTO records (profile_id, kind, id, body, sound_id, rev, deleted)
      VALUES (?, ?, ?, NULL, NULL, ${revNow}, 1)
      ON CONFLICT (profile_id, kind, id) DO UPDATE SET body = NULL, sound_id = NULL, rev = excluded.rev, deleted = 1${unseen}`)
      .bind(id, r.kind, r.id, id, ...guard));
  }
  // Those orphans go once no record and no share names them: one pair of
  // statements for all of them.
  if (orphans.length) {
    const unused = `profile_id = ? AND id IN (SELECT value FROM json_each(?))
      AND NOT EXISTS (SELECT 1 FROM records WHERE sound_id = sounds.id AND deleted = 0) AND ${UNSHARED}`;
    const unusedArgs = [id, JSON.stringify([...new Set(orphans)])];
    statements.push(env.DB.prepare(`DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE ${unused})`).bind(...unusedArgs));
    statements.push(env.DB.prepare(`DELETE FROM sounds WHERE ${unused}`).bind(...unusedArgs));
  }
  // …plus what the ones that landed (this rev) hold now.
  statements.push(env.DB.prepare(`UPDATE profiles SET record_bytes = record_bytes + (SELECT COALESCE(SUM(${SIZE}), 0) FROM ${TOUCHED}
    AND records.rev = profiles.rev) WHERE id = ?`).bind(touched, id, id));
  try {
    await env.DB.batch(statements);
  } catch (err) {
    await release(env, id, reserved);
    // Stopped by the in-batch check: its records may be gone, so it may add all it puts.
    if (/malformed JSON/i.test(String(err?.message))) throw await overWhich(env, id, [...after.values()].reduce((sum, r) => sum + r.size, 0), cap, now);
    throw err;
  }
  const { rev } = await getProfile(env, id);
  if (since === null) return json(200, { rev, was: rev - 1 });
  // What did not land: written by someone else since the device's pull.
  const landed = new Set((await env.DB.prepare('SELECT kind, id FROM records WHERE profile_id = ? AND rev = ?').bind(id, rev).all())
    .results.map((r) => `${r.kind}:${r.id}`));
  const stale = [...put, ...del].filter((r) => !landed.has(`${r.kind}:${r.id}`)).map((r) => ({ kind: r.kind, id: r.id }));
  return json(200, { rev, was: rev - 1, stale });
}

// ── sounds ──

// A sound not whole an hour after it started is given up: it counts for
// nothing, takes no more pieces, and goes at the next start. An hour is many
// times what 14 pieces take on a slow phone; its device starts it again.
export const PENDING_MS = 60 * 60 * 1000;
const WHOLE = 'sounds.got >= sounds.chunks';

// Sound bytes stored: `mine` counts the profile's unfinished sounds whole,
// as declared, so it can't start more than it may keep; `all` counts the
// pieces others' unfinished sounds have received, so a start that never
// uploads can't make the cloud full for everyone.
// Sound sums (SQL): MINE_SOUNDS binds the profile's id and `fresh`; ALL_SOUNDS `fresh` and CHUNK_BYTES.
const MINE_SOUNDS = `FROM sounds WHERE profile_id = ? AND (${WHOLE} OR created >= ?)`;
const ALL_SOUNDS = `SELECT COALESCE(SUM(CASE WHEN ${WHOLE} THEN bytes WHEN created >= ? THEN MIN(bytes, got * ?) ELSE 0 END), 0) FROM sounds`;

async function storedBytes(env, profileId, now) {
  const fresh = now - PENDING_MS;
  const mine = await env.DB.prepare(`SELECT COALESCE(SUM(bytes), 0) AS b, COUNT(*) AS n ${MINE_SOUNDS}`).bind(profileId, fresh).first();
  const all = await env.DB.prepare(`SELECT (${ALL_SOUNDS}) AS b`).bind(fresh, CHUNK_BYTES).first();
  return { mine: mine.b, count: mine.n, all: all.b };
}

// Deletes every unfinished sound older than PENDING_MS, and its pieces.
const dropStale = (env, now) => env.DB.batch([
  env.DB.prepare(`DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE NOT (${WHOLE}) AND created < ?)`).bind(now - PENDING_MS),
  env.DB.prepare(`DELETE FROM sounds WHERE NOT (${WHOLE}) AND created < ?`).bind(now - PENDING_MS),
]);

async function need(env, soundId, chunks) {
  const got = new Set((await env.DB.prepare('SELECT n FROM sound_chunks WHERE sound_id = ?').bind(soundId).all()).results.map((r) => r.n));
  return Array.from({ length: chunks }, (_, n) => n).filter((n) => !got.has(n));
}

async function startSound(request, env, id, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  await slowDown(env, LIMITERS.sounds, id);
  const body = await readJson(request);
  const { sha256, bytes, mime } = body;
  if (!SHA.test(sha256 ?? '')) throw new Refuse(400, 'sha256');
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_SOUND_BYTES) throw new Refuse(413, 'size');
  if (typeof mime !== 'string' || !/^audio\/[a-z0-9.+-]{1,40}(;[ a-z0-9=.-]{0,40})?$/i.test(mime)) throw new Refuse(400, 'mime');
  await dropStale(env, now);
  await dropOldChecks(env, now);
  await getProfile(env, id);   // an old check profile starting one has just gone
  const have = await env.DB.prepare('SELECT id, chunks FROM sounds WHERE profile_id = ? AND sha256 = ? AND bytes = ?')
    .bind(id, sha256, bytes).first();
  if (have) return json(200, { id: have.id, need: await need(env, have.id, have.chunks) });
  // Only a new sound counts: asking again about one it has writes nothing.
  await withinProfileDaily(env, id, 'sounds', LIMITS.profileSoundsPerDay, now);
  const cap = isCheck(id) ? CHECK_LIMITS.soundBytes : LIMITS.profileBytes;
  const most = isCheck(id) ? CHECK_LIMITS.sounds : Number.MAX_SAFE_INTEGER;
  const soundId = newSoundId();
  const chunks = pieceCount(bytes);
  const fresh = now - PENDING_MS;
  // Checked and made in one statement, so starts sent at once can't all
  // pass on the same sums.
  const made = await env.DB.prepare(`INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created)
    SELECT ?, ?, ?, ?, ?, ?, 0, ?
    WHERE (SELECT COALESCE(SUM(bytes), 0) ${MINE_SOUNDS}) + ? <= ?
    AND (SELECT COUNT(*) ${MINE_SOUNDS}) < ?
    AND (${ALL_SOUNDS}) + ? <= ? RETURNING id`)
    .bind(soundId, id, mime, bytes, chunks, sha256, now, id, fresh, bytes, cap, id, fresh, most, fresh, CHUNK_BYTES, bytes, LIMITS.totalBytes).first();
  if (!made) {
    const used = await storedBytes(env, id, now);
    throw new Refuse(507, used.mine + bytes > cap || used.count >= most ? 'profile full' : 'cloud full');
  }
  return json(201, { id: soundId, need: Array.from({ length: chunks }, (_, n) => n) });
}

// One piece of a sound its start asked for. A piece already stored is
// refused (409 'piece', with what is still needed), never written again: a
// stored sound never changes (its id is made for its audio), and a key that
// rewrote pieces forever would spend D1's daily writes for every family.
// Counted on the sound limiter, as its start is.
async function putPiece(request, env, soundId, n, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  const who = await needKey(request, env, null, now);
  await slowDown(env, LIMITERS.sounds, who);
  const s = await env.DB.prepare('SELECT profile_id, bytes, chunks, got, created FROM sounds WHERE id = ?').bind(soundId).first();
  if (!s || s.profile_id !== who) throw new Refuse(404, 'sound');
  // Given up (PENDING_MS): the device starts it again.
  if (s.got < s.chunks && s.created < now - PENDING_MS) throw new Refuse(404, 'sound');
  if (!Number.isInteger(n) || n < 0 || n >= s.chunks) throw new Refuse(400, 'piece');
  if (await env.DB.prepare('SELECT 1 AS x FROM sound_chunks WHERE sound_id = ? AND n = ?').bind(soundId, n).first()) {
    throw new Refuse(409, 'piece', { need: await need(env, soundId, s.chunks) });
  }
  const data = await readBytes(request, CHUNK_BYTES);
  if (data === null || data.byteLength !== pieceSize(s.bytes, n)) throw new Refuse(400, 'piece size');
  // Two of the same piece sent at once: the second writes nothing.
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sound_chunks (sound_id, n, data) VALUES (?, ?, ?) ON CONFLICT (sound_id, n) DO NOTHING').bind(soundId, n, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    env.DB.prepare('UPDATE sounds SET got = (SELECT COUNT(*) FROM sound_chunks WHERE sound_id = ?) WHERE id = ?').bind(soundId, soundId),
  ]);
  return json(200, { need: await need(env, soundId, s.chunks) });
}

// The audio, piece by piece, so the Worker never holds a whole sound. No key:
// anyone with the id can play it (the disclosure says so). Counted on the
// download limiter by the profile that owns it (a sound a deleted profile
// shared, by its own id), so no one can spend D1's daily reads on it.
async function getSound(env, soundId) {
  const s = await env.DB.prepare('SELECT profile_id, mime, bytes, chunks, got FROM sounds WHERE id = ?').bind(soundId).first();
  if (!s || s.got < s.chunks) return fail(404, 'sound');
  await slowDown(env, LIMITERS.download, s.profile_id || soundId);
  let n = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (n >= s.chunks) { controller.close(); return; }
      const row = await env.DB.prepare('SELECT data FROM sound_chunks WHERE sound_id = ? AND n = ?').bind(soundId, n).first();
      n++;
      if (!row) { controller.error(new Error('missing piece')); return; }
      controller.enqueue(toBytes(row.data));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': s.mime,
      'Content-Length': String(s.bytes),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ── shares ──

// A sound the profile has, whole, or a Refuse.
// Every one of `soundIds` is the profile's own and whole, in one query
// however many a share names (D1 caps the queries in one call).
async function ownSounds(env, profileId, soundIds) {
  for (const s of soundIds) if (typeof s !== 'string' || !SOUND_ID.test(s)) throw new Refuse(400, 'sound');
  if (!soundIds.length) return;
  const rows = (await env.DB.prepare('SELECT id, got, chunks FROM sounds WHERE profile_id = ? AND id IN (SELECT value FROM json_each(?))')
    .bind(profileId, JSON.stringify(soundIds)).all()).results;
  const whole = new Map(rows.map((r) => [r.id, r.got >= r.chunks]));
  for (const s of soundIds) if (!whole.get(s)) throw new Refuse(409, 'sound', { sound: s });
}

// Shares a snapshot: {kind, title, bundle: {clips, beats, songs}, preview?}.
// Every sound it names must be the profile's own, whole. The same snapshot
// shared again gets its code back. -> {code}
async function makeShare(request, env, id, now, seen) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  await slowDown(env, LIMITERS.shares, id);
  const body = await readJson(request, LIMITS.shareBytes + 4096);
  if (!SHARE_KINDS.includes(body.kind)) throw new Refuse(400, 'kind');
  const title = typeof body.title === 'string' ? cutName(body.title.trim()).trim() : '';
  if (!title) throw new Refuse(400, 'title');
  const b = body.bundle;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Refuse(400, 'bundle');
  const bundle = {
    clips: Array.isArray(b.clips) ? b.clips : [],
    beats: Array.isArray(b.beats) ? b.beats : [],
    songs: Array.isArray(b.songs) ? b.songs : [],
  };
  if (bundle.clips.length > 100 || bundle.beats.length > 100 || bundle.songs.length > 20) throw new Refuse(413, 'bundle');
  // A sound share with no sound would play and remix nothing.
  if (body.kind === 'sound' && !bundle.clips.length) throw new Refuse(400, 'empty');
  const sounds = new Set();
  for (const c of bundle.clips) {
    if (!c || typeof c !== 'object') throw new Refuse(400, 'sound');
    sounds.add(c.sound);
  }
  const preview = body.preview ?? null;
  if (preview !== null) sounds.add(preview);
  await ownSounds(env, id, [...sounds]);
  const text = JSON.stringify(bundle);
  if (text.length > LIMITS.shareBytes) throw new Refuse(413, 'bundle');
  const hash = await sha256Hex(JSON.stringify([body.kind, title, text, preview]));
  const same = await env.DB.prepare('SELECT code FROM shares WHERE profile_id = ? AND hash = ?').bind(id, hash).first();
  Object.assign(seen, { kind: 'share', profile: id });
  if (same) return json(200, { code: same.code });
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE profile_id = ?').bind(id).first();
  if (n >= (isCheck(id) ? CHECK_LIMITS.shares : LIMITS.sharesPerProfile)) throw new Refuse(507, 'shares full');
  await withinProfileDaily(env, id, 'shares', LIMITS.profileSharesPerDay, now);
  if (!await withinDaily(env, 'shares', LIMITS.sharesPerDay, now)) throw new Refuse(429, 'busy');
  let code = null;
  for (let i = 0; i < 5 && !code; i++) {
    const c = shareCode();
    if (!await env.DB.prepare('SELECT 1 AS x FROM shares WHERE code = ?').bind(c).first()) code = c;
  }
  if (!code) throw new Refuse(503, 'busy');
  // Its bytes count against the profile's records and everyone's (SHARE_SIZE).
  const size = byteLength(text) + byteLength(title) + ROW_BYTES * (1 + sounds.size);
  const reserved = await reserve(env, id, size, now);
  try {
    await env.DB.batch([
      settle(env, id, reserved),
      env.DB.prepare('UPDATE profiles SET record_bytes = record_bytes + ? WHERE id = ?').bind(size, id),
      env.DB.prepare('INSERT INTO shares (code, profile_id, kind, title, bundle, preview, hash, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(code, id, body.kind, title, text, preview, hash, now),
      ...[...sounds].map((s) => env.DB.prepare('INSERT OR IGNORE INTO share_sounds (code, sound_id) VALUES (?, ?)').bind(code, s)),
    ]);
  } catch (err) {
    await release(env, id, reserved);
    throw err;
  }
  return json(201, { code });
}

// Anyone with the code: what was shared, read-only. No key, no PIN.
async function getShare(env, raw) {
  const code = plainCode(raw);
  const s = isShareCode(code) ? await env.DB.prepare('SELECT * FROM shares WHERE code = ?').bind(code).first() : null;
  if (!s) throw new Refuse(404, 'share');
  // Whose it was never shows (shares made before the app left it out held
  // each record's personId).
  const bundle = JSON.parse(s.bundle);
  for (const k of ['clips', 'beats', 'songs']) {
    if (Array.isArray(bundle[k])) bundle[k] = bundle[k].map((r) => (r && typeof r === 'object' ? (({ personId: _who, ...rest }) => rest)(r) : r));
  }
  return json(200, { code, kind: s.kind, title: s.title, bundle, preview: s.preview, created: s.created });
}

// The profile's own shares, newest first, so its owner can unshare one.
// -> {shares: [{code, kind, title, created}]}
async function myShares(request, env, id, now) {
  await needKey(request, env, id, now);
  const rows = (await env.DB.prepare('SELECT code, kind, title, created FROM shares WHERE profile_id = ? ORDER BY created DESC, code')
    .bind(id).all()).results;
  return json(200, { shares: rows.map((r) => ({ code: r.code, kind: r.kind, title: r.title, created: r.created })) });
}

// 🚫 Unshare (Ben, Q18): the code stops working for everyone. Its audio goes
// too, unless a record or another share still uses it; a remix someone made
// holds its own copy of the audio, so it stays. -> {ok}
async function unshare(request, env, id, raw, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  const code = plainCode(raw);
  const s = isShareCode(code) ? await env.DB.prepare('SELECT code FROM shares WHERE code = ? AND profile_id = ?').bind(code, id).first() : null;
  if (!s) throw new Refuse(404, 'share');
  const used = (await env.DB.prepare('SELECT sound_id FROM share_sounds WHERE code = ?').bind(code).all()).results.map((r) => r.sound_id);
  const unused = `id = ? AND NOT EXISTS (SELECT 1 FROM records WHERE sound_id = sounds.id AND deleted = 0) AND ${UNSHARED}`;
  await env.DB.batch([
    env.DB.prepare(`UPDATE profiles SET record_bytes = MAX(0, record_bytes - (SELECT ${SHARE_SIZE} FROM shares WHERE code = ?)) WHERE id = ?`).bind(code, id),
    env.DB.prepare('DELETE FROM share_sounds WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM shares WHERE code = ?').bind(code),
    ...used.flatMap((sound) => [
      env.DB.prepare(`DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE ${unused})`).bind(sound),
      env.DB.prepare(`DELETE FROM sounds WHERE ${unused}`).bind(sound),
    ]),
  ]);
  return json(200, { ok: true });
}

// ── feature-use counts (retired) ──

// Older copies of the app still send {uses, visits} with a sync (ADR 0016,
// retired by ADR 0027). The Worker checks the key and the size, stores
// nothing, and says yes, so those devices drop what they hold instead of
// retrying for as long as the page stays open. Remove this route (and its
// test) about 2026-11-16, when no copy is left.
async function takeUses(request, env, id, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  await needKey(request, env, id, now);
  await readJson(request, 32_768);
  return json(200, { ok: true });
}

// ── per-profile rate limits ──

// Rate-limit bindings (site/wrangler.toml), one per route that spends a
// shared daily cap or writes or reads a lot, so one profile can't use them up
// for every family: a push (5,000 a day), a sound's start, a share (500 a
// day), an open (it makes a key), and a pull and a sound's download (D1's
// daily reads; generous, as a restore makes many, one at a time). Each counts by the profile id, never by an
// IP address: a push, a start and a share once the key has been checked
// (needKey), so a profile's 20 keys share one count, and a made-up key is
// refused before it counts against anyone; an open (it has no key yet) by
// the profile it opens. The limits are far above what a family meets, a big
// restore included (docs/architecture/cloud.md).
export const LIMITERS = {
  records: 'PUSH_LIMITER', sounds: 'SOUND_LIMITER', shares: 'SHARE_LIMITER', open: 'OPEN_LIMITER',
  pull: 'PULL_LIMITER', download: 'DOWNLOAD_LIMITER',
  // Every open from one address together, counted under its keyed daily hash
  // (addressHash): the per-profile count above can't stop one client trying 5
  // PINs on each listed profile (council, 2026-10-27). One key for the whole
  // site would let any one client shut everyone out. A family opens a few
  // times a day.
  openSite: 'OPEN_SITE_LIMITER',
};

// Throws 429 'slow' when `profileId` is over the binding's limit: a minute's
// wait, apart from the daily caps' 429 'busy' (the app says "busy right
// now" and syncs again in a minute). No binding (the tests' env), or a
// limiter that fails: the call goes on.
async function slowDown(env, binding, profileId) {
  const limiter = env[binding];
  if (!limiter) return;
  let success = true;
  try {
    ({ success } = await limiter.limit({ key: profileId }));
  } catch (err) {
    console.error('cloud: rate limit', err);
  }
  if (!success) throw new Refuse(429, 'slow');
}

// ── routing ──

// Every /api/ path but /api/log. Returns a Response. A route that makes,
// opens, pulls, pushes, shares or changes a PIN fills `seen`, and the event
// goes in the metrics (worker/metrics.js) once it has worked, with `ctx`
// after the answer is sent. A refused PIN writes nothing: anyone can send
// those, and each row is a write against the database's daily limit (the app
// counts a wrong PIN itself, web/cloud.js).
export async function handleCloud(request, env, now = Date.now(), ctx = null) {
  const seen = {};
  const res = await route(request, env, now, seen);
  if (seen.kind && res.ok) {
    const event = seen;
    const done = (async () => {
      if (!event.device) {
        const key = bearer(request);
        if (key) event.device = await sha256Hex(key);
      }
      await noteEvent(env, request, event, now);
    })().catch((err) => console.error('metrics:', err));
    if (ctx?.waitUntil) ctx.waitUntil(done);
    else await done;
  } else if (seen.list) {
    // Anyone looking at the list counts as the site being used.
    const done = Promise.all([expireReports(env, now), sweepDailyCounters(env, now).catch((err) => console.error('counters:', err))]);
    if (ctx?.waitUntil) ctx.waitUntil(done);
    else await done;
  }
  return res;
}

async function route(request, env, now, seen) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').slice(2).map(decodeURIComponent);   // after /api/
  const m = request.method;
  if (!env.DB) return fail(503, 'not set up');
  try {
    const [a, b, c] = parts;
    if (a === 'cloud' && parts.length === 1 && m === 'GET') return json(200, { ok: true, chunk: CHUNK_BYTES, maxSound: MAX_SOUND_BYTES });
    if (a === 'profiles') {
      if (parts.length === 1) {
        if (m === 'GET') { seen.list = true; return await listProfiles(env); }
        if (m === 'POST') return await makeProfile(request, env, now, seen);
      } else if (typeof b === 'string' && PERSON_ID.test(b)) {
        needProvenCheck(request, env, b);
        if (parts.length === 3 && c === 'open' && m === 'POST') {
          // This address's count first, then this profile's; both before the PIN is looked at.
          // Without the address (or the secret) only the profile's count runs.
          const address = await addressHash(request, env, now);
          if (address) await slowDown(env, LIMITERS.openSite, address);
          await slowDown(env, LIMITERS.open, b);
        }
        if (parts.length === 2 && m === 'PATCH') return await changeProfile(request, env, b, now, seen);
        if (parts.length === 2 && m === 'DELETE') return await deleteProfile(request, env, b, now);
        if (parts.length === 3 && c === 'open' && m === 'POST') return await openProfile(request, env, b, now, seen);
        if (parts.length === 3 && c === 'key' && m === 'DELETE') return await forgetKey(request, env, b, now);
        if (parts.length === 3 && c === 'keys' && m === 'GET') return await countKeys(request, env, b, now);
        if (parts.length === 3 && c === 'keys' && m === 'DELETE') return await forgetAllKeys(request, env, b, now);
        if (parts.length === 3 && c === 'records' && m === 'GET') return await pull(request, url, env, b, now, seen);
        if (parts.length === 3 && c === 'records' && m === 'POST') return await push(request, env, b, now, seen);
        if (parts.length === 3 && c === 'sounds' && m === 'POST') return await startSound(request, env, b, now);
        if (parts.length === 3 && c === 'shares' && m === 'POST') return await makeShare(request, env, b, now, seen);
        if (parts.length === 3 && c === 'uses' && m === 'POST') return await takeUses(request, env, b, now);
        if (parts.length === 3 && c === 'shares' && m === 'GET') return await myShares(request, env, b, now);
        if (parts.length === 4 && c === 'shares' && m === 'DELETE') return await unshare(request, env, b, parts[3], now);
      }
    }
    if (a === 'sounds' && SOUND_ID.test(b ?? '')) {
      if (parts.length === 2 && (m === 'GET' || m === 'HEAD')) return await getSound(env, b);
      if (parts.length === 3 && m === 'PUT' && /^\d{1,2}$/.test(c)) return await putPiece(request, env, b, Number(c), now);
    }
    if (a === 'shares' && parts.length === 2 && m === 'GET') return await getShare(env, b);
    return fail(404, 'not found');
  } catch (err) {
    if (err instanceof Refuse) return fail(err.status, err.why, err.more);
    // D1 refuses everything once a daily limit is used up, until 00:00 UTC.
    // Its wording is not documented, so any D1 error is "the cloud is resting".
    console.error('cloud:', err);
    return fail(503, 'cloud', { over: /limit|quota|exceeded|too many/i.test(String(err?.message)) });
  }
}
