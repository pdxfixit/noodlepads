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
