-- The live database's schema before migration 001: worker/schema.sql as it
-- was applied on 2026-10-11 (commit d5e443d). tests/migrations.test.mjs
-- builds a database from this, runs worker/migrations/*.sql in order, and
-- checks the result has exactly the tables, columns and indexes of
-- worker/schema.sql. Never edit it: it is what the live database had.

-- Noodle Pads' one D1 database, `noodle-pads` (binding DB). Applied once with
--   npx wrangler d1 execute noodle-pads --remote --file worker/schema.sql
-- (docs/deploy-cloudflare.md). Every statement is IF NOT EXISTS, so running it
-- again changes nothing. Design: docs/design/cloud-profiles.md.
--
-- Times are milliseconds since 1970 (JavaScript's Date.now()).

-- One row per profile: a person in the shared list. `name` is always a
-- generated fun name (the Worker refuses anything else) and `avatar` an emoji
-- from the app's own list, so nothing a person typed is in this table.
CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY,          -- the person's id on every device (p-…)
  name         TEXT NOT NULL,             -- a fun name (web/names.js isFunName)
  avatar       TEXT NOT NULL DEFAULT '',  -- an emoji (web/model.js PICTURES)
  color        TEXT NOT NULL,             -- a person color (web/model.js PERSON_COLORS)
  family_id    TEXT,                      -- families.id, or NULL
  pin_hash     TEXT,                      -- PBKDF2-SHA-256 of the PIN, hex; NULL: no PIN
  pin_salt     TEXT,                      -- 16 random bytes, hex, one per profile
  fails        INTEGER NOT NULL DEFAULT 0,-- wrong PINs since the last right one or wait
  locked_until INTEGER NOT NULL DEFAULT 0,-- no PIN is checked before this time
  rev          INTEGER NOT NULL DEFAULT 0,-- bumped by every change to its records
  edited       INTEGER NOT NULL,          -- when name, avatar or color last changed
  created      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_family ON profiles (family_id);

-- A device that opened a profile (with its PIN, if it has one) keeps a key.
-- Only the key's SHA-256 is stored. A new PIN, a PIN reset or deleting the
-- profile deletes every key, so every device must open it again.
CREATE TABLE IF NOT EXISTS keys (
  hash       TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS keys_profile ON keys (profile_id);

-- Everything in a profile but its audio: sounds (clips), kit edits
-- (overrides), pad order, open beats, saved beats, DJ keys, takes, open song,
-- saved songs. `body` is the record as the app stores it, as JSON, without
-- audio. A deleted record stays as a tombstone (deleted = 1, body NULL) so
-- other devices learn of the delete.
CREATE TABLE IF NOT EXISTS records (
  profile_id TEXT NOT NULL,
  kind       TEXT NOT NULL,     -- clips overrides orders patterns beats decks takes songs songbook
  id         TEXT NOT NULL,     -- the record's id (personId for one-per-person kinds)
  body       TEXT,              -- JSON; NULL when deleted
  sound_id   TEXT,              -- clips only: the sound holding its audio
  rev        INTEGER NOT NULL,  -- profiles.rev when it was written
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, kind, id)
);
CREATE INDEX IF NOT EXISTS records_rev ON records (profile_id, rev);
CREATE INDEX IF NOT EXISTS records_sound ON records (sound_id);

-- Audio. The id is 128 random bits, so it can't be guessed, and anyone who
-- has it can play the sound (no PIN). A sound waiting as a gift belongs to
-- its receiver with gift_id set; accepting clears it.
CREATE TABLE IF NOT EXISTS sounds (
  id         TEXT PRIMARY KEY,  -- s-<26 base32 characters>
  profile_id TEXT NOT NULL,
  gift_id    TEXT,
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  chunks     INTEGER NOT NULL,  -- ceil(bytes / 1,900,000)
  sha256     TEXT NOT NULL,     -- as the device reported it, for "already uploaded"
  got        INTEGER NOT NULL DEFAULT 0,  -- chunks received; playable when got = chunks
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sounds_profile ON sounds (profile_id, sha256);
CREATE INDEX IF NOT EXISTS sounds_gift ON sounds (gift_id);

-- A D1 row holds at most 2,000,000 bytes, so audio is kept in pieces of at
-- most 1,900,000 bytes, numbered from 0.
CREATE TABLE IF NOT EXISTS sound_chunks (
  sound_id TEXT NOT NULL,
  n        INTEGER NOT NULL,
  data     BLOB NOT NULL,
  PRIMARY KEY (sound_id, n)
);

-- A copy of a sound, beat or song one profile sent another, waiting until
-- the receiver accepts or says no. `bundle` is JSON: {clips, beats, songs},
-- each clip naming its (copied) sound.
CREATE TABLE IF NOT EXISTS gifts (
  id           TEXT PRIMARY KEY,
  to_profile   TEXT NOT NULL,
  from_profile TEXT NOT NULL,
  kind         TEXT NOT NULL,   -- sound, beat or song
  title        TEXT NOT NULL,   -- what it is called, as the sender named it
  bundle       TEXT NOT NULL,
  created      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gifts_to ON gifts (to_profile);

-- A family: a short code that devices use to show only its profiles (a
-- filter, not protection), and a grown-up reset code, stored only as a hash,
-- that clears a PIN on any profile in the family.
CREATE TABLE IF NOT EXISTS families (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,  -- e.g. PLUM-7K3Q
  reset_hash   TEXT NOT NULL,         -- PBKDF2 of the reset code, hex
  reset_salt   TEXT NOT NULL,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL
);

-- Opt-in problem reports (ADR 0009): kept 30 days, then deleted by the next
-- report that arrives. No IP is stored.
CREATE TABLE IF NOT EXISTS reports (
  key     TEXT PRIMARY KEY,   -- <ISO time>_<device>_<random>
  device  TEXT NOT NULL,
  app     TEXT NOT NULL,
  errors  INTEGER NOT NULL,
  body    TEXT NOT NULL,      -- the cleaned upload, JSON
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_expires ON reports (expires);
CREATE INDEX IF NOT EXISTS reports_device ON reports (device, created);

-- Daily counters that keep the whole site inside the free plan: problem
-- reports, new profiles and new families per UTC day.
CREATE TABLE IF NOT EXISTS counters (
  name TEXT NOT NULL,
  day  TEXT NOT NULL,         -- YYYY-MM-DD, UTC
  n    INTEGER NOT NULL,
  PRIMARY KEY (name, day)
);
