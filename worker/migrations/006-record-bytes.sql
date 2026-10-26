-- 006 (2026-10-26, the council's security review): a profile's records and
-- shares are capped in bytes, and so are everyone's together, so one device
-- can't fill the 500 MB database and stop every family's sync.
-- `record_bytes` keeps each profile's total, counted as worker/cloud.js
-- counts it: each record's JSON plus 100 bytes (ROW_BYTES), a tombstone 100;
-- each share's bundle and title plus 100 for it and for each sound it names.
--
-- Safe to apply before the Worker that reads it is live: the older Worker
-- names its columns and never touches this one. Apply with
-- `just cloud-migrate --yes` BEFORE that Worker deploys: it reads the column
-- on every push.

ALTER TABLE profiles ADD COLUMN record_bytes INTEGER NOT NULL DEFAULT 0;
UPDATE profiles SET record_bytes = (SELECT COALESCE(SUM(COALESCE(LENGTH(CAST(body AS BLOB)), 0) + 100), 0) FROM records WHERE records.profile_id = profiles.id)
  + (SELECT COALESCE(SUM(LENGTH(CAST(bundle AS BLOB)) + LENGTH(CAST(title AS BLOB)) + 100 * (1 + (SELECT COUNT(*) FROM share_sounds WHERE share_sounds.code = shares.code))), 0)
     FROM shares WHERE shares.profile_id = profiles.id);

INSERT INTO migrations (name, applied) VALUES ('006-record-bytes', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
