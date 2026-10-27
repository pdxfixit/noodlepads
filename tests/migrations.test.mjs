// The live database is brought up to date by worker/migrations/*.sql; a new
// one is made from worker/schema.sql. Both roads must end at the same tables,
// columns and indexes, and the migrations must keep the live data that stays.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { ROW_BYTES } from '../worker/cloud.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MIGRATIONS = readdirSync(new URL('../worker/migrations/', import.meta.url)).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();

// Every table's columns (name, type, not null, default, primary key) and every index.
function shape(db) {
  const out = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of tables) {
    out[name] = db.prepare(`PRAGMA table_info(${name})`).all().map((c) => `${c.name} ${c.type} ${c.notnull} ${c.dflt_value} ${c.pk}`);
  }
  out['(indexes)'] = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map((i) => `${i.tbl_name}.${i.name}`);
  return out;
}

function migrated() {
  const db = new DatabaseSync(':memory:');
  db.exec(read('./schema-before-001.sql'));
  return db;
}

test('the migrations take the live schema to exactly worker/schema.sql', () => {
  const db = migrated();
  for (const f of MIGRATIONS) db.exec(read(`../worker/migrations/${f}`));
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(read('../worker/schema.sql'));
  assert.deepEqual(shape(db), shape(fresh));
  const names = (d) => d.prepare('SELECT name FROM migrations ORDER BY name').all().map((r) => r.name);
  assert.deepEqual(names(db), MIGRATIONS.map((f) => f.slice(0, -4)), 'each migration records itself');
  assert.deepEqual(names(fresh), names(db), 'schema.sql lists every migration as applied, so none runs on a fresh database');
});

test('migration 001 keeps profiles, records and sounds, and drops gifts, families and their sounds', () => {
  const db = migrated();
  db.exec(`
    INSERT INTO families (id, code, reset_hash, reset_salt, created) VALUES ('f-1', 'PLUM-7K3Q', 'h', 's', 1);
    INSERT INTO profiles (id, name, avatar, color, family_id, rev, edited, created) VALUES ('p-a', 'Admiral Acorn', '', '#1F3FA8', 'f-1', 2, 50, 10);
    INSERT INTO keys (hash, profile_id, created) VALUES ('k', 'p-a', 10);
    INSERT INTO records (profile_id, kind, id, body, sound_id, rev) VALUES ('p-a', 'clips', 'user-1', '{}', 's-mine', 1);
    INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-mine', 'p-a', 'audio/wav', 2, 1, 'x', 1, 1);
    INSERT INTO sounds (id, profile_id, gift_id, mime, bytes, chunks, sha256, got, created) VALUES ('s-gift', 'p-a', 'g-1', 'audio/wav', 2, 1, 'y', 1, 1);
    INSERT INTO sound_chunks (sound_id, n, data) VALUES ('s-mine', 0, x'0102'), ('s-gift', 0, x'0304');
    INSERT INTO gifts (id, to_profile, from_profile, kind, title, bundle, created) VALUES ('g-1', 'p-a', 'p-b', 'sound', 'Burp', '{}', 1);
  `);
  db.exec(read(`../worker/migrations/${MIGRATIONS[0]}`));
  assert.deepEqual(db.prepare('SELECT id, active FROM profiles').all().map((r) => ({ ...r })), [{ id: 'p-a', active: 50 }]);
  assert.deepEqual(db.prepare('SELECT hash, session FROM keys').all().map((r) => ({ ...r })), [{ hash: 'k', session: 0 }], 'devices stay opened');
  assert.deepEqual(db.prepare('SELECT id FROM sounds').all().map((r) => r.id), ['s-mine']);
  assert.deepEqual(db.prepare('SELECT sound_id FROM sound_chunks').all().map((r) => r.sound_id), ['s-mine']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1);
  assert.throws(() => db.exec(read(`../worker/migrations/${MIGRATIONS[0]}`)), /gift_id/, 'run again, it refuses at its first line');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sounds').get().n, 1, 'and changes nothing');
});

// 006: each profile's records' bytes, counted as the Worker counts them
// (worker/cloud.js ROW_BYTES), so the caps hold from the first push after it.
test('migration 006 counts each profile\'s record bytes as the Worker does', () => {
  const db = migrated();
  for (const f of MIGRATIONS.filter((m) => m < '006')) db.exec(read(`../worker/migrations/${f}`));
  db.exec(`
    INSERT INTO profiles (id, name, avatar, color, rev, edited, created) VALUES ('p-a', 'Admiral Acorn', '', '#1F3FA8', 2, 1, 1), ('p-b', 'Sir Squid', '', '#1F3FA8', 0, 1, 1);
    INSERT INTO records (profile_id, kind, id, body, rev, deleted) VALUES ('p-a', 'beats', 'b-1', '{"name":"Ünï"}', 1, 0), ('p-a', 'beats', 'b-2', NULL, 2, 1);
    INSERT INTO shares (code, profile_id, kind, title, bundle, hash, created) VALUES ('ABCD2345', 'p-b', 'sound', 'Burp', '{"clips":[]}', 'h', 1);
    INSERT INTO share_sounds (code, sound_id) VALUES ('ABCD2345', 's-1'), ('ABCD2345', 's-2');
  `);
  db.exec(read(`../worker/migrations/${MIGRATIONS.find((m) => m.startsWith('006'))}`));
  const bytes = Object.fromEntries(db.prepare('SELECT id, record_bytes FROM profiles').all().map((r) => [r.id, r.record_bytes]));
  assert.deepEqual(bytes, {
    'p-a': Buffer.byteLength('{"name":"Ünï"}') + ROW_BYTES + ROW_BYTES,
    'p-b': Buffer.byteLength('{"clips":[]}') + Buffer.byteLength('Burp') + 3 * ROW_BYTES,
  }, 'bytes, not characters; a tombstone costs a row; a share its bundle, title and rows');
  assert.deepEqual(db.prepare('SELECT DISTINCT bytes_counted AS c FROM profiles').all().map((r) => r.c), [0], 'the newer Worker counts each again itself');
});

// 007: every key there counts as used now, so none expires before 180 days of its own.
test('migration 007 marks every key as used now', () => {
  const db = migrated();
  for (const f of MIGRATIONS.filter((m) => m < '007')) db.exec(read(`../worker/migrations/${f}`));
  db.exec("INSERT INTO keys (hash, profile_id, created, session) VALUES ('k', 'p-a', 1, 0)");
  const before = Date.now() - 1000;
  const file = MIGRATIONS.find((m) => m.startsWith('007'));
  assert.ok(file, 'migration 007 is there');
  db.exec(read(`../worker/migrations/${file}`));
  const { used } = db.prepare("SELECT used FROM keys WHERE hash = 'k'").get();
  assert.ok(used >= before && used <= Date.now() + 1000, `used ${used}`);
});

// 008 clears what the deploy checks left before a share went with its profile
// (Ben, 2026-10-26: "have the tests clean up after themselves"): only check
// profiles' shares whose profile is gone, and sounds nothing uses that belong
// to no one. A family's share, a family's sound, and a live check's share stay.
test('008 clears the deploy checks\' old shares and the audio nothing uses, and nothing of a family\'s', () => {
  const db = migrated();
  for (const f of MIGRATIONS.filter((m) => m < '008')) db.exec(read(`../worker/migrations/${f}`));
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  run("INSERT INTO profiles (id, name, color, edited, created) VALUES ('p-family', 'Funky Moose', 'teal', 0, 0), ('p-smoke-live', 'Chef Cactus', 'teal', 0, 0)");
  const share = (code, owner, preview = null) => run('INSERT INTO shares (code, profile_id, kind, title, bundle, preview, hash, created) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', code, owner, 'sound', 't', '{}', preview, 'h');
  const sound = (id, owner) => run('INSERT INTO sounds (id, profile_id, mime, bytes, chunks, sha256, got, created) VALUES (?, ?, ?, 1, 1, ?, 1, 0)', id, owner, 'audio/wav', id);
  share('OLDSMOKE', 'p-smoke-gone'); share('OLDE2EXX', 'p-e2e-gone'); share('LIVESMOK', 'p-smoke-live'); share('FAMILYSH', 'p-family');
  share('GONEFAMI', 'p-family-deleted');   // a family's share whose profile went before 2026-10-26: not the checks'
  sound('s-checkold', ''); run("INSERT INTO share_sounds (code, sound_id) VALUES ('OLDSMOKE', 's-checkold')");
  sound('s-preview', ''); share('PREVIEWS', 'p-family-deleted', 's-preview');
  sound('s-family', 'p-family'); sound('s-familyshared', ''); run("INSERT INTO share_sounds (code, sound_id) VALUES ('GONEFAMI', 's-familyshared')");
  sound('s-loose', '');
  db.exec(read('../worker/migrations/008-clear-check-shares.sql'));
  const codes = db.prepare('SELECT code FROM shares ORDER BY code').all().map((r) => r.code);
  assert.deepEqual(codes, ['FAMILYSH', 'GONEFAMI', 'LIVESMOK', 'PREVIEWS']);
  const sounds = db.prepare('SELECT id FROM sounds ORDER BY id').all().map((r) => r.id);
  assert.deepEqual(sounds, ['s-family', 's-familyshared', 's-preview'], 'the check share\'s audio and the loose one go; a family\'s and a preview stay');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM share_sounds WHERE code = 'OLDSMOKE'").get().n, 0);
});

// 009 gives the keyed requests (Change PIN, Delete) a wrong-PIN count of their
// own, apart from /open's (docs/design/cloud-needs-pin.md). Additive: every
// profile, its PIN and its /open count stay, and the new count starts at 0.
test('009 adds the keyed wrong-PIN count at 0 and keeps every profile, PIN and /open count', () => {
  const db = migrated();
  for (const f of MIGRATIONS.filter((m) => m < '009')) db.exec(read(`../worker/migrations/${f}`));
  db.exec("INSERT INTO profiles (id, name, color, pin_hash, pin_salt, fails, locked_until, edited, created) VALUES ('p-a', 'Funky Moose', 'teal', 'h', 's', 3, 99, 0, 0)");
  db.exec(read('../worker/migrations/009-key-fails.sql'));
  const row = { ...db.prepare('SELECT id, pin_hash, pin_salt, fails, locked_until, key_fails, key_locked_until FROM profiles').get() };
  assert.deepEqual(row, { id: 'p-a', pin_hash: 'h', pin_salt: 's', fails: 3, locked_until: 99, key_fails: 0, key_locked_until: 0 });
});

// 010 adds the strikes that double a PIN's wait for each full window of wrong
// tries (worker/pin.js). Additive: every profile and count stays; both start at 0.
test('010 adds the strike counts at 0 and keeps every profile, PIN and count', () => {
  const db = migrated();
  for (const f of MIGRATIONS.filter((m) => m < '010')) db.exec(read(`../worker/migrations/${f}`));
  db.exec("INSERT INTO profiles (id, name, color, pin_hash, pin_salt, fails, locked_until, key_fails, key_locked_until, edited, created) VALUES ('p-a', 'Funky Moose', 'teal', 'h', 's', 3, 99, 2, 88, 0, 0)");
  db.exec(read('../worker/migrations/010-pin-strikes.sql'));
  const row = { ...db.prepare('SELECT id, pin_hash, fails, locked_until, key_fails, key_locked_until, strikes, key_strikes FROM profiles').get() };
  assert.deepEqual(row, { id: 'p-a', pin_hash: 'h', fails: 3, locked_until: 99, key_fails: 2, key_locked_until: 88, strikes: 0, key_strikes: 0 });
});
