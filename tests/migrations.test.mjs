// The live database is brought up to date by worker/migrations/*.sql; a new
// one is made from worker/schema.sql. Both roads must end at the same tables,
// columns and indexes, and the migrations must keep the live data that stays.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

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
