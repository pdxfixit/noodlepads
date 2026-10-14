-- 001 (2026-10-11, Ben's answers Q10–Q13): share codes replace gifts,
-- families and their reset codes go, profiles keep their last activity, and
-- keys say whether their device remembers them.
--
-- Apply with `just cloud-migrate`, which runs only files not yet listed in
-- `migrations`. Run by hand a second time, the first statement below fails
-- (gift_id is gone) before anything changes, so a rerun is refused, not
-- half-done. tests/migrations.test.mjs runs this on the schema the live
-- database had (tests/schema-before-001.sql) and checks the result equals
-- worker/schema.sql.

-- Sounds waiting in gifts nobody took go with the gifts.
DELETE FROM sound_chunks WHERE sound_id IN (SELECT id FROM sounds WHERE gift_id IS NOT NULL);
DELETE FROM sounds WHERE gift_id IS NOT NULL;
DROP TABLE IF EXISTS gifts;
DROP TABLE IF EXISTS families;
DROP INDEX IF EXISTS sounds_gift;
DROP INDEX IF EXISTS profiles_family;
ALTER TABLE sounds DROP COLUMN gift_id;
ALTER TABLE profiles DROP COLUMN family_id;

ALTER TABLE profiles ADD COLUMN active INTEGER NOT NULL DEFAULT 0;
UPDATE profiles SET active = MAX(created, edited);
ALTER TABLE keys ADD COLUMN session INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS shares (
  code       TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  bundle     TEXT NOT NULL,
  preview    TEXT,
  hash       TEXT NOT NULL,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_profile ON shares (profile_id, hash);
CREATE TABLE IF NOT EXISTS share_sounds (
  code     TEXT NOT NULL,
  sound_id TEXT NOT NULL,
  PRIMARY KEY (code, sound_id)
);
CREATE INDEX IF NOT EXISTS share_sounds_sound ON share_sounds (sound_id);

CREATE TABLE IF NOT EXISTS migrations (
  name    TEXT PRIMARY KEY,
  applied INTEGER NOT NULL
);
INSERT INTO migrations (name, applied) VALUES ('001-shares-not-gifts-or-families', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
