-- 007 (2026-10-26, the council's security review): every open made a key
-- that lasted forever, with no cap on a profile. Now a key unused for 180
-- days stops working and a profile keeps its 20 most recently used
-- (worker/cloud.js KEY_IDLE_MS, KEYS_PER_PROFILE). `used` is when a key was
-- last used, to the hour. Every key here counts as used now, so none
-- expires before a half-year of its own.
--
-- Safe to apply before the Worker that reads it is live: the older Worker
-- names its columns and never touches this one (a key it makes has used 0,
-- and the newer Worker counts its `created` then). Apply with
-- `just cloud-migrate --yes` BEFORE that Worker deploys: it reads the column
-- on every request with a key.

ALTER TABLE keys ADD COLUMN used INTEGER NOT NULL DEFAULT 0;
UPDATE keys SET used = CAST(strftime('%s', 'now') AS INTEGER) * 1000;

INSERT INTO migrations (name, applied) VALUES ('007-key-used', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
