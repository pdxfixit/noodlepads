// Cloud profiles (docs/design/cloud-profiles.md): the shared list, each
// profile's records and sounds, its keys, and share codes. Everything is in the one D1 database (binding DB,
// worker/schema.sql). The device keeps the working copy; this only stores
// and hands back, and checks everything it is sent.

import { PERSON_ID, PERSON_COLORS, OLD_PERSON_COLORS } from '../web/model.js';
import { isListedEmoji } from '../web/emoji-check.js';
import { isFunName } from '../web/names.js';
import { CLOUD_ID } from '../web/reid.js';
import { ORIGIN, json, fail, Refuse, readJson, readBytes, randomId, sha256Hex, toBytes, withinDaily } from './http.js';
import { isPin, newSalt, hashSecret, checkSecret, shareCode, isShareCode, plainCode } from './pin.js';
import { noteEvent, forgetProfile } from './metrics.js';

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
  newProfilesPerDay: 10,             // across the site (Ben, 2026-10-26)
  checkProfilesPerDay: 100,          // the deploy checks' (TEST_PROFILE): two a deploy
  pushesPerDay: 5000,
  sharesPerDay: 500,
  perPush: 200,                      // records in one push
  recordBytes: 512 * 1024,           // one record's JSON (a long take is about 400 KB)
  pushBytes: 4 * 1024 * 1024,        // one push's body
  profileRecordBytes: 10 * 1024 * 1024, // one profile's records (ROW_BYTES each, plus its JSON)
  totalRecordBytes: 60 * 1024 * 1024,   // every profile's records: with every sound, under the 500 MB
  pullPage: 500,                     // records in one pull
  sharesPerProfile: 200,
  shareBytes: 1024 * 1024,           // one share's bundle
};

// What a record costs in the database: its JSON, plus about 100 bytes for its
// ids, rev and index entries, so a tombstone (no body) costs something too.
// profiles.record_bytes keeps each profile's total (migration 006 counts it
// the same way).
export const ROW_BYTES = 100;
const SIZE = `COALESCE(LENGTH(CAST(records.body AS BLOB)), 0) + ${ROW_BYTES}`;
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
export const KINDS = ['clips', 'overrides', 'orders', 'patterns', 'beats', 'decks', 'takes', 'songs', 'songbook', 'prefs', 'layouts', 'voices', 'touchLayouts'];
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

// The profile the request's key opens, or null. A key unused for
// KEY_IDLE_MS is deleted instead; a used one is marked, at most once an hour
// (one row write). `used` is 0 on a key an older Worker made: its `created` counts.
async function keyProfile(request, env, now) {
  const key = bearer(request);
  if (!key) return null;
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare('SELECT profile_id, created, used FROM keys WHERE hash = ?').bind(hash).first();
  if (!row) return null;
  const last = Math.max(row.used, row.created);
  if (last < now - KEY_IDLE_MS) {
    await env.DB.prepare('DELETE FROM keys WHERE hash = ?').bind(hash).run();
    return null;
  }
  if (last < now - ACTIVE_STEP_MS) await env.DB.prepare('UPDATE keys SET used = ? WHERE hash = ?').bind(now, hash).run();
  return row.profile_id;
}

async function needKey(request, env, profileId, now) {
  const who = await keyProfile(request, env, now);
  if (!who || (profileId && who !== profileId)) throw new Refuse(401, 'key');
  return who;
}

async function getProfile(env, id) {
  const row = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first();
  if (!row) throw new Refuse(404, 'profile');
  return row;
}

// The PIN rule for a profile that has one: right, or 401 {tries} / 429 {wait}.
async function needPin(env, profile, pin, now) {
  if (!profile.pin_hash) return;
  const r = await checkSecret(env.DB, { id: profile.id, hash: profile.pin_hash, salt: profile.pin_salt }, pin, now);
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

// The deploy checks' throwaway profiles (tools/look-cloud.mjs testId; as
// tools/cloud_admin.py TEST_PREFIXES). Anyone could pick such an id, so it
// earns nothing but a cap of its own.
export const TEST_PROFILE = /^p-(smoke|e2e)-/;

async function listProfiles(env) {
  const rows = await env.DB.prepare('SELECT * FROM profiles ORDER BY created DESC LIMIT ?').bind(LIMITS.listed).all();
  return json(200, { profiles: rows.results.filter((r) => CLOUD_ID.test(r.id)).map(looks) });
}

async function makeProfile(request, env, now, seen) {
  const body = await readJson(request);
  if (typeof body.id !== 'string' || !CLOUD_ID.test(body.id)) throw new Refuse(400, 'id');
  const look = checkLooks(body);
  if (body.pin !== undefined && body.pin !== null && !isPin(body.pin)) throw new Refuse(400, 'pin');
  if (await env.DB.prepare('SELECT 1 AS x FROM profiles WHERE id = ?').bind(body.id).first()) throw new Refuse(409, 'exists');
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first();
  if (n >= LIMITS.profiles) throw new Refuse(507, 'full');
  // The deploy checks' throwaway profiles have a daily cap of their own, so
  // they never use up kids' new profiles. A deleted profile gives no place
  // back: making and deleting can't get round either cap.
  const checks = TEST_PROFILE.test(body.id);
  if (!await withinDaily(env, checks ? 'check-profiles' : 'profiles', checks ? LIMITS.checkProfilesPerDay : LIMITS.newProfilesPerDay, now)) {
    throw new Refuse(429, 'busy');
  }
  const salt = body.pin ? newSalt() : null;
  const hash = body.pin ? await hashSecret(body.pin, salt) : null;
  const edited = Number.isFinite(body.edited) ? Math.min(body.edited, now) : now;
  await env.DB.prepare(`INSERT INTO profiles (id, name, avatar, color, pin_hash, pin_salt, rev, edited, created, active)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(body.id, look.name, look.avatar, look.color, hash, salt, edited, now, now).run();
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

async function changeProfile(request, env, id, now, seen) {
  const body = await readJson(request);
  await needKey(request, env, id, now);
  const p = await getProfile(env, id);
  const out = { ok: true };
  const look = checkLooks(body, { partial: true });
  if (Object.keys(look).length) {
    const edited = Number.isFinite(body.edited) ? Math.min(body.edited, now) : now;
    if (edited >= p.edited) {
      await env.DB.prepare('UPDATE profiles SET name = ?, avatar = ?, color = ?, edited = ? WHERE id = ?')
        .bind(look.name ?? p.name, look.avatar ?? p.avatar, look.color ?? p.color, edited, id).run();
    }
  }
  if (body.newPin !== undefined) {
    if (body.newPin !== null && !isPin(body.newPin)) throw new Refuse(400, 'pin');
    await needPin(env, p, body.pin, now);
    const salt = body.newPin ? newSalt() : null;
    const hash = body.newPin ? await hashSecret(body.newPin, salt) : null;
    // A new PIN closes the profile on every device; this one gets a new key.
    await env.DB.batch([
      env.DB.prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ?, fails = 0, locked_until = 0 WHERE id = ?').bind(hash, salt, id),
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
// names only its sharer's sounds: ownSound). Unshare needs the profile's key,
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
  const body = await readJson(request);
  await needKey(request, env, id, now);
  const p = await getProfile(env, id);
  await needPin(env, p, body.pin, now);
  await env.DB.batch([
    ...dropProfileData(env, id),
    env.DB.prepare('DELETE FROM records WHERE profile_id = ?').bind(id),
    env.DB.prepare('DELETE FROM keys WHERE profile_id = ?').bind(id),
    env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id),
  ]);
  await forgetProfile(env, id);
  return json(200, { ok: true });
}

// ── records ──

async function pull(request, url, env, id, now, seen) {
  await needKey(request, env, id, now);
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

// A profile's bytes counted again from what it holds (its records).
const recount = (env, id) => env.DB.prepare(`UPDATE profiles SET record_bytes = (SELECT COALESCE(SUM(${SIZE}), 0) FROM records WHERE records.profile_id = ?)
  WHERE id = ? RETURNING record_bytes`).bind(id, id).first();

// Takes `growth` more bytes for profile `id`, or a 507: its own cap
// ('records full'), else everyone's ('cloud full'). One UPDATE checks both
// caps and adds, so writes sent at once can't all pass on the same count;
// the write that follows settles the difference (or `release` gives it
// back). Before refusing, the profile is counted again from what it holds,
// in case its count drifted high. (A recount while another write holds a
// reservation leaves the count that much low until that write settles:
// rare, and only ever generous.)
async function reserve(env, id, growth) {
  if (growth <= 0) return 0;
  const take = () => env.DB.prepare(`UPDATE profiles SET record_bytes = record_bytes + ?
    WHERE id = ? AND record_bytes + ? <= ? AND (SELECT SUM(record_bytes) FROM profiles) + ? <= ? RETURNING record_bytes`)
    .bind(growth, id, growth, LIMITS.profileRecordBytes, growth, LIMITS.totalRecordBytes).first();
  if (await take()) return growth;
  const mine = (await recount(env, id))?.record_bytes ?? 0;
  if (await take()) return growth;
  throw new Refuse(507, mine + growth > LIMITS.profileRecordBytes ? 'records full' : 'cloud full');
}

// Gives back a reservation whose write failed (best effort: a count left
// high is counted again before it refuses anyone).
const release = (env, id, bytes) => (bytes ? env.DB.prepare('UPDATE profiles SET record_bytes = record_bytes - ? WHERE id = ?').bind(bytes, id).run()
  .catch((err) => console.error('cloud: release', err)) : null);

// A push puts and deletes records, all in one rev. With `since` (the rev the
// device has pulled up to), a record another device wrote after that is left
// as it is and named in `stale`: the device pulls it, merges, and pushes
// again, so two devices pushing the same record at once never lose one
// edit. Without `since` (an older copy of the app), every record is written.
async function push(request, env, id, now, seen) {
  const body = await readJson(request, LIMITS.pushBytes);
  await needKey(request, env, id, now);
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
  for (const s of sounds) {
    if (typeof s !== 'string' || !SOUND_ID.test(s)) throw new Refuse(400, 'sound');
    const row = await env.DB.prepare('SELECT got, chunks FROM sounds WHERE id = ? AND profile_id = ?').bind(s, id).first();
    if (!row || row.got < row.chunks) throw new Refuse(409, 'sound', { sound: s });
  }
  await getProfile(env, id);
  // What the push adds to the profile's bytes, if every record lands: the
  // last word on each record (a put, or a delete's tombstone) less what it
  // holds now. A push that adds nothing is never refused, so a full profile
  // can still delete and edit.
  const after = new Map();
  put.forEach((r, i) => after.set(`${r.kind}:${r.id}`, { kind: r.kind, id: r.id, size: new TextEncoder().encode(texts[i]).length + ROW_BYTES }));
  for (const r of del) after.set(`${r.kind}:${r.id}`, { kind: r.kind, id: r.id, size: ROW_BYTES });
  const touched = JSON.stringify([...after.values()].map((r) => [r.kind, r.id]));
  const before = (await env.DB.prepare(`SELECT ${SIZE} AS size FROM ${TOUCHED}`).bind(touched, id).all()).results;
  const growth = [...after.values()].reduce((sum, r) => sum + r.size, 0) - before.reduce((sum, r) => sum + r.size, 0);
  if (!await withinDaily(env, 'pushes', LIMITS.pushesPerDay, now)) throw new Refuse(429, 'busy');
  // The sounds deleted clips held, to delete once nothing names them.
  const goneClips = del.filter((r) => r.kind === 'clips').map((r) => r.id);
  const orphans = [];
  for (const clipId of goneClips) {
    const row = await env.DB.prepare("SELECT sound_id FROM records WHERE profile_id = ? AND kind = 'clips' AND id = ?").bind(id, clipId).first();
    if (row?.sound_id) orphans.push(row.sound_id);
  }
  // And the audio a sound held before its new audio (a made sound changed).
  // D1 binds at most 100 values to one query.
  const putClips = put.filter((r) => r.kind === 'clips');
  for (let i = 0; i < putClips.length; i += 90) {
    const part = putClips.slice(i, i + 90);
    const soundNow = new Map(part.map((r) => [r.id, r.body.sound]));
    const rows = (await env.DB.prepare(`SELECT id, sound_id FROM records WHERE profile_id = ? AND kind = 'clips' AND id IN (${part.map(() => '?').join(', ')})`)
      .bind(id, ...part.map((r) => r.id)).all()).results;
    for (const row of rows) if (row.sound_id && row.sound_id !== soundNow.get(row.id)) orphans.push(row.sound_id);
  }
  const revNow = '(SELECT rev FROM profiles WHERE id = ?)';
  // Only a record nobody wrote since the device's pull, when it says which.
  const unseen = since === null ? '' : ' WHERE records.rev <= ?';
  const guard = since === null ? [] : [since];
  const reserved = await reserve(env, id, growth);
  const statements = [env.DB.prepare('UPDATE profiles SET rev = rev + 1 WHERE id = ?').bind(id), touch(env, id, now)];
  // The profile's bytes: less the room reserved and what the records about
  // to be written hold now…
  statements.push(env.DB.prepare(`UPDATE profiles SET record_bytes = record_bytes - ? - (SELECT COALESCE(SUM(${SIZE}), 0) FROM ${TOUCHED}${unseen})
    WHERE id = ?`).bind(reserved, touched, id, ...guard, id));
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
  for (const s of new Set(orphans)) {
    const unused = `id = ? AND NOT EXISTS (SELECT 1 FROM records WHERE sound_id = sounds.id AND deleted = 0) AND ${UNSHARED}`;
    statements.push(env.DB.prepare(`DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE ${unused})`).bind(s));
    statements.push(env.DB.prepare(`DELETE FROM sounds WHERE ${unused}`).bind(s));
  }
  // …plus what the ones that landed (this rev) hold now.
  statements.push(env.DB.prepare(`UPDATE profiles SET record_bytes = record_bytes + (SELECT COALESCE(SUM(${SIZE}), 0) FROM ${TOUCHED}
    AND records.rev = profiles.rev) WHERE id = ?`).bind(touched, id, id));
  try {
    await env.DB.batch(statements);
  } catch (err) {
    await release(env, id, reserved);
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
async function storedBytes(env, profileId, now) {
  const fresh = now - PENDING_MS;
  const mine = await env.DB.prepare(`SELECT COALESCE(SUM(bytes), 0) AS b FROM sounds WHERE profile_id = ? AND (${WHOLE} OR created >= ?)`)
    .bind(profileId, fresh).first();
  const all = await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN ${WHOLE} THEN bytes WHEN created >= ? THEN MIN(bytes, got * ?) ELSE 0 END), 0) AS b FROM sounds`)
    .bind(fresh, CHUNK_BYTES).first();
  return { mine: mine.b, all: all.b };
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
  const body = await readJson(request);
  await needKey(request, env, id, now);
  const { sha256, bytes, mime } = body;
  if (!SHA.test(sha256 ?? '')) throw new Refuse(400, 'sha256');
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_SOUND_BYTES) throw new Refuse(413, 'size');
  if (typeof mime !== 'string' || !/^audio\/[a-z0-9.+-]{1,40}(;[ a-z0-9=.-]{0,40})?$/i.test(mime)) throw new Refuse(400, 'mime');
  await dropStale(env, now);
  const have = await env.DB.prepare('SELECT id, chunks FROM sounds WHERE profile_id = ? AND sha256 = ? AND bytes = ?')
    .bind(id, sha256, bytes).first();
  if (have) return json(200, { id: have.id, need: await need(env, have.id, have.chunks) });
  const used = await storedBytes(env, id, now);
  if (used.mine + bytes > LIMITS.profileBytes) throw new Refuse(507, 'profile full');
  if (used.all + bytes > LIMITS.totalBytes) throw new Refuse(507, 'cloud full');
  const soundId = newSoundId();
  const chunks = pieceCount(bytes);
  await env.DB.prepare('INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(soundId, id, mime, bytes, chunks, sha256, now).run();
  return json(201, { id: soundId, need: Array.from({ length: chunks }, (_, n) => n) });
}

async function putPiece(request, env, soundId, n, now) {
  if (request.headers.get('Origin') !== ORIGIN) throw new Refuse(403, 'origin');
  const who = await needKey(request, env, null, now);
  const s = await env.DB.prepare('SELECT profile_id, bytes, chunks, got, created FROM sounds WHERE id = ?').bind(soundId).first();
  if (!s || s.profile_id !== who) throw new Refuse(404, 'sound');
  // Given up (PENDING_MS): the device starts it again.
  if (s.got < s.chunks && s.created < now - PENDING_MS) throw new Refuse(404, 'sound');
  if (!Number.isInteger(n) || n < 0 || n >= s.chunks) throw new Refuse(400, 'piece');
  const data = await readBytes(request, CHUNK_BYTES);
  if (data === null || data.byteLength !== pieceSize(s.bytes, n)) throw new Refuse(400, 'piece size');
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO sound_chunks (sound_id, n, data) VALUES (?, ?, ?)').bind(soundId, n, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    env.DB.prepare('UPDATE sounds SET got = (SELECT COUNT(*) FROM sound_chunks WHERE sound_id = ?) WHERE id = ?').bind(soundId, soundId),
  ]);
  return json(200, { need: await need(env, soundId, s.chunks) });
}

// The audio, piece by piece, so the Worker never holds a whole sound. No key:
// anyone with the id can play it (the disclosure says so).
async function getSound(env, soundId) {
  const s = await env.DB.prepare('SELECT mime, bytes, chunks, got FROM sounds WHERE id = ?').bind(soundId).first();
  if (!s || s.got < s.chunks) return fail(404, 'sound');
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
async function ownSound(env, profileId, soundId) {
  if (typeof soundId !== 'string' || !SOUND_ID.test(soundId)) throw new Refuse(400, 'sound');
  const s = await env.DB.prepare('SELECT got, chunks FROM sounds WHERE id = ? AND profile_id = ?').bind(soundId, profileId).first();
  if (!s || s.got < s.chunks) throw new Refuse(409, 'sound', { sound: soundId });
}

// Shares a snapshot: {kind, title, bundle: {clips, beats, songs}, preview?}.
// Every sound it names must be the profile's own, whole. The same snapshot
// shared again gets its code back. -> {code}
async function makeShare(request, env, id, now, seen) {
  const body = await readJson(request, LIMITS.shareBytes + 4096);
  await needKey(request, env, id, now);
  if (!SHARE_KINDS.includes(body.kind)) throw new Refuse(400, 'kind');
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 24) : '';
  if (!title) throw new Refuse(400, 'title');
  const b = body.bundle;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Refuse(400, 'bundle');
  const bundle = {
    clips: Array.isArray(b.clips) ? b.clips : [],
    beats: Array.isArray(b.beats) ? b.beats : [],
    songs: Array.isArray(b.songs) ? b.songs : [],
  };
  if (bundle.clips.length > 100 || bundle.beats.length > 100 || bundle.songs.length > 20) throw new Refuse(413, 'bundle');
  const sounds = new Set();
  for (const c of bundle.clips) {
    if (!c || typeof c !== 'object') throw new Refuse(400, 'sound');
    await ownSound(env, id, c.sound);
    sounds.add(c.sound);
  }
  const preview = body.preview ?? null;
  if (preview !== null) { await ownSound(env, id, preview); sounds.add(preview); }
  const text = JSON.stringify(bundle);
  if (text.length > LIMITS.shareBytes) throw new Refuse(413, 'bundle');
  const hash = await sha256Hex(JSON.stringify([body.kind, title, text, preview]));
  const same = await env.DB.prepare('SELECT code FROM shares WHERE profile_id = ? AND hash = ?').bind(id, hash).first();
  Object.assign(seen, { kind: 'share', profile: id });
  if (same) return json(200, { code: same.code });
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE profile_id = ?').bind(id).first();
  if (n >= LIMITS.sharesPerProfile) throw new Refuse(507, 'shares full');
  if (!await withinDaily(env, 'shares', LIMITS.sharesPerDay, now)) throw new Refuse(429, 'busy');
  let code = null;
  for (let i = 0; i < 5 && !code; i++) {
    const c = shareCode();
    if (!await env.DB.prepare('SELECT 1 AS x FROM shares WHERE code = ?').bind(c).first()) code = c;
  }
  if (!code) throw new Refuse(503, 'busy');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO shares (code, profile_id, kind, title, bundle, preview, hash, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(code, id, body.kind, title, text, preview, hash, now),
    ...[...sounds].map((s) => env.DB.prepare('INSERT OR IGNORE INTO share_sounds (code, sound_id) VALUES (?, ?)').bind(code, s)),
  ]);
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
  await readJson(request, 32_768);
  await needKey(request, env, id, now);
  return json(200, { ok: true });
}

// ── routing ──

// Every /api/ path but /api/log. Returns a Response. A route that makes,
// opens, pulls, pushes, shares or changes a PIN fills `seen`, and the event
// goes in the metrics (worker/metrics.js) once it has worked, or when a PIN
// was wrong; with `ctx`, after the answer is sent.
export async function handleCloud(request, env, now = Date.now(), ctx = null) {
  const seen = {};
  const res = await route(request, env, now, seen);
  const pinWrong = res.status === 401 || res.status === 429;
  if (seen.kind && (res.ok || (seen.kind === 'open' && pinWrong))) {
    const event = res.ok ? seen : { kind: 'pin-wrong', profile: seen.profile };
    const done = (async () => {
      if (res.ok && !event.device) {
        const key = bearer(request);
        if (key) event.device = await sha256Hex(key);
      }
      await noteEvent(env, request, event, now);
    })().catch((err) => console.error('metrics:', err));
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
        if (m === 'GET') return await listProfiles(env);
        if (m === 'POST') return await makeProfile(request, env, now, seen);
      } else if (typeof b === 'string' && PERSON_ID.test(b)) {
        if (parts.length === 2 && m === 'PATCH') return await changeProfile(request, env, b, now, seen);
        if (parts.length === 2 && m === 'DELETE') return await deleteProfile(request, env, b, now);
        if (parts.length === 3 && c === 'open' && m === 'POST') return await openProfile(request, env, b, now, seen);
        if (parts.length === 3 && c === 'key' && m === 'DELETE') return await forgetKey(request, env, b, now);
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
