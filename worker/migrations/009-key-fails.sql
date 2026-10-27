-- 009 (2026-10-27, docs/design/cloud-needs-pin.md): a person goes to the
-- cloud only with a PIN, and Leave, Remove PIN, Change PIN and Delete type
-- that PIN on a request that carries a key. Their wrong tries are counted in
-- columns of their own, apart from `fails` / `locked_until` (which only
-- /open fills), so a stranger's five wrong tries at /open never lock a family
-- out of leaving on a device that has the key. Same rule: 5 wrong, then 10
-- minutes.
--
-- Safe to apply before the Worker that reads it is live: two columns with
-- defaults, which the older Worker never names. The deploy applies it before
-- the upload (deploy.yml runs `just cloud-migrate --yes`).

ALTER TABLE profiles ADD COLUMN key_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN key_locked_until INTEGER NOT NULL DEFAULT 0;

INSERT INTO migrations (name, applied) VALUES ('009-key-fails', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
