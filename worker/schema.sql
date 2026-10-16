-- Noodle Pads' one D1 database, `noodle-pads` (binding DB): the full schema
-- as it stands. A new, empty database gets it with `just cloud-schema`; the
-- live one is brought here by the files in worker/migrations/, applied by
-- `just cloud-migrate`, which records each one in `migrations`.
-- tests/migrations.test.mjs checks that the two roads end at the same tables.
-- Every statement here is IF NOT EXISTS (or OR IGNORE), so running it again
-- changes nothing. Design: docs/design/cloud-profiles.md.
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
  pin_hash     TEXT,                      -- PBKDF2-SHA-256 of the PIN, hex; NULL: no PIN
  pin_salt     TEXT,                      -- 16 random bytes, hex, one per profile
  fails        INTEGER NOT NULL DEFAULT 0,-- wrong PINs since the last right one or wait
  locked_until INTEGER NOT NULL DEFAULT 0,-- no PIN is checked before this time
  rev          INTEGER NOT NULL DEFAULT 0,-- bumped by every change to its records
  edited       INTEGER NOT NULL,          -- when name, avatar or color last changed
  created      INTEGER NOT NULL,
  active       INTEGER NOT NULL DEFAULT 0 -- last open, pull or push, to the hour (`just cloud-prune`)
);

-- A device that opened a profile (with its PIN, if it has one) keeps a key.
-- Only the key's SHA-256 is stored. A new PIN, a PIN reset or deleting the
-- profile deletes every key, so every device must open it again. A session
-- key belongs to a device that did not tick "Remember on this device": it
-- lives in that page's memory only, and keys like it older than a week are
-- deleted the next time the profile is opened.
CREATE TABLE IF NOT EXISTS keys (
  hash       TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  created    INTEGER NOT NULL,
  session    INTEGER NOT NULL DEFAULT 0  -- 1: not remembered on its device
);
CREATE INDEX IF NOT EXISTS keys_profile ON keys (profile_id);

-- Everything in a profile but its audio: sounds (clips), kit edits
-- (overrides), pad order, open beats, saved beats, DJ keys and layouts, takes, open song,
-- saved songs, the person's settings (prefs) and their own voices (voices). `body` is the record as the
-- app stores it, as JSON, without audio. A deleted record stays as a
-- tombstone (deleted = 1, body NULL) so other devices learn of the delete.
CREATE TABLE IF NOT EXISTS records (
  profile_id TEXT NOT NULL,
  kind       TEXT NOT NULL,     -- clips overrides orders patterns beats decks takes songs songbook prefs layouts voices
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
-- has it can play the sound (no PIN). A sound a share uses outlives its
-- profile: deleting the profile sets profile_id to '' and keeps it.
CREATE TABLE IF NOT EXISTS sounds (
  id         TEXT PRIMARY KEY,  -- s-<26 base32 characters>
  profile_id TEXT NOT NULL,     -- '' once its profile is gone and only shares use it
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  chunks     INTEGER NOT NULL,  -- ceil(bytes / 1,900,000)
  sha256     TEXT NOT NULL,     -- as the device reported it, for "already uploaded"
  got        INTEGER NOT NULL DEFAULT 0,  -- chunks received; playable when got = chunks
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sounds_profile ON sounds (profile_id, sha256);

-- A D1 row holds at most 2,000,000 bytes, so audio is kept in pieces of at
-- most 1,900,000 bytes, numbered from 0.
CREATE TABLE IF NOT EXISTS sound_chunks (
  sound_id TEXT NOT NULL,
  n        INTEGER NOT NULL,
  data     BLOB NOT NULL,
  PRIMARY KEY (sound_id, n)
);

-- A share: a snapshot of one sound, beat or song, read-only, for anyone who
-- has its code, until its sharer unshares it. `bundle` is JSON {clips, beats, songs}, each clip
-- naming its sound; `preview` is a sound of it as it plays. The same thing
-- shared again unchanged gets the same code (`hash`).
CREATE TABLE IF NOT EXISTS shares (
  code       TEXT PRIMARY KEY,  -- 8 characters, no 0/O or 1/I (worker/pin.js code)
  profile_id TEXT NOT NULL,     -- who shared it (the profile may be gone since)
  kind       TEXT NOT NULL,     -- sound, beat or song
  title      TEXT NOT NULL,     -- its name when it was shared
  bundle     TEXT NOT NULL,
  preview    TEXT,              -- sounds.id, or NULL
  hash       TEXT NOT NULL,     -- SHA-256 of kind, title, bundle and preview
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_profile ON shares (profile_id, hash);

-- Which sounds each share uses, so deleting a sound or a profile keeps them.
CREATE TABLE IF NOT EXISTS share_sounds (
  code     TEXT NOT NULL,
  sound_id TEXT NOT NULL,
  PRIMARY KEY (code, sound_id)
);
CREATE INDEX IF NOT EXISTS share_sounds_sound ON share_sounds (sound_id);

-- Opt-in problem reports (ADR 0009): kept 14 days, then deleted by the next
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
-- reports, new profiles, pushes and shares per UTC day.
CREATE TABLE IF NOT EXISTS counters (
  name TEXT NOT NULL,
  day  TEXT NOT NULL,         -- YYYY-MM-DD, UTC
  n    INTEGER NOT NULL,
  PRIMARY KEY (name, day)
);

-- Player metrics (ADR 0016): which devices use each profile, from where
-- (the country only, never the IP), when, which parts of the app, and how
-- each visit went. Events, counts and visits are kept 14 days and a device's
-- row 90: the Worker deletes older rows as it goes (worker/metrics.js), and
-- `just harvest` copies them into a local archive first. Every write is
-- skipped, never a failure, while these tables are missing.

-- One row per device on a profile: a device is a key (keys.hash), so a
-- device that does not tick "Remember on this device" is a new device each
-- open. Browser, OS and type are families read from the User-Agent; the
-- User-Agent itself is not kept.
CREATE TABLE IF NOT EXISTS devices (
  hash       TEXT PRIMARY KEY,          -- keys.hash: the SHA-256 of the device's key
  profile_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  syncs      INTEGER NOT NULL DEFAULT 0,-- pulls (every sync starts with one)
  app        TEXT,                      -- the app's version (version.json), as the device said
  browser    TEXT,                      -- Chrome Safari Firefox Edge Samsung Opera Other
  os         TEXT,                      -- iOS Android Windows macOS ChromeOS Linux Other
  type       TEXT,                      -- phone tablet desktop
  width      INTEGER                    -- the screen's width, rounded down to a bucket (web/uses.js WIDTHS)
);
CREATE INDEX IF NOT EXISTS devices_profile ON devices (profile_id);
CREATE INDEX IF NOT EXISTS devices_seen ON devices (last_seen);

-- One row per make, open, pull, push, share, PIN change or wrong PIN, with
-- where it came from (Cloudflare's request.cf). Nothing of the IP.
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- never reused, so the archive copies by id
  at         INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  device     TEXT,                      -- devices.hash; NULL for a wrong PIN (no key yet)
  kind       TEXT NOT NULL,             -- make open pull push share pin pin-wrong
  country    TEXT                       -- two letters: the finest place kept (Ben, 2026-10-16)
);
CREATE INDEX IF NOT EXISTS activity_at ON activity (at);
CREATE INDEX IF NOT EXISTS activity_profile ON activity (profile_id, at);

-- How often each part of the app was used, counted on the device and sent
-- with a sync (POST /api/profiles/:id/uses): counts only, per UTC day.
CREATE TABLE IF NOT EXISTS uses (
  profile_id TEXT NOT NULL,
  feature    TEXT NOT NULL,             -- web/uses.js USES
  day        TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  n          INTEGER NOT NULL,
  PRIMARY KEY (profile_id, feature, day)
);
CREATE INDEX IF NOT EXISTS uses_day ON uses (day);

-- One row per visit (the page in view, from showing to hiding), sent with a
-- sync (POST /api/profiles/:id/uses, web/visits.js): how long, which screens,
-- the level, the page's load time, the sound's delay, and where errors came
-- from as file:line. Never what was made, said or typed.
CREATE TABLE IF NOT EXISTS visits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- never reused, so the archive copies by id
  at         INTEGER NOT NULL,          -- when it started
  profile_id TEXT NOT NULL,
  device     TEXT,                      -- devices.hash
  app        TEXT,                      -- the app version that sent it
  secs       INTEGER NOT NULL,          -- seconds in view
  first      TEXT,                      -- the first screen shown (web/visits.js VISIT_SCREENS)
  screens    TEXT,                      -- every screen shown, comma-separated
  level      TEXT,                      -- kids regular advanced
  load_ms    INTEGER,                   -- the page's load time, first visit of a page only
  latency_ms INTEGER,                   -- the sound's delay, when a sound played
  errors     INTEGER NOT NULL DEFAULT 0,-- errors in the visit
  error_sigs TEXT                       -- JSON {"file.js:line": n}
);
CREATE INDEX IF NOT EXISTS visits_at ON visits (at);
CREATE INDEX IF NOT EXISTS visits_profile ON visits (profile_id, at);

-- Migrations applied (worker/migrations/, `just cloud-migrate`). A database
-- made from this file already has every change they make, so each is listed
-- as applied; `applied` 0 means "made from schema.sql".
CREATE TABLE IF NOT EXISTS migrations (
  name    TEXT PRIMARY KEY,   -- the file's name, without .sql
  applied INTEGER NOT NULL
);
INSERT OR IGNORE INTO migrations (name, applied) VALUES ('001-shares-not-gifts-or-families', 0), ('002-player-metrics', 0), ('003-visits-no-ip-hash', 0), ('004-country-only', 0);
