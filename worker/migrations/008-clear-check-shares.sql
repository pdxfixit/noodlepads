-- 008 (2026-10-26, Ben: "have the tests clean up after themselves"): every
-- deploy's cloud-smoke made a share code, and until 2026-10-26 a share outlived
-- its profile, so the checks left one a deploy, forever. The deploy's own
-- cleanup (`cloud-prune --smoke`) needed a database token the live checks don't
-- hold, so it never ran. Since the Worker caps (2026-10-26) deleting a profile
-- ends its shares, and old check profiles are swept, so nothing new is left.
-- This clears what was: share codes of the deploy checks' profiles
-- (`p-smoke-…`, `p-e2e-…`) that no longer exist, then sounds no record and no
-- share uses (nor previews) that belong to no profile (`profile_id ''`). A family's share or
-- sound is never touched: only check ids, and only audio nothing names.

DELETE FROM share_sounds WHERE code IN (
  SELECT code FROM shares
  WHERE (profile_id LIKE 'p-smoke-%' OR profile_id LIKE 'p-e2e-%')
    AND profile_id NOT IN (SELECT id FROM profiles));
DELETE FROM shares
  WHERE (profile_id LIKE 'p-smoke-%' OR profile_id LIKE 'p-e2e-%')
    AND profile_id NOT IN (SELECT id FROM profiles);
DELETE FROM sound_chunks WHERE sound_id IN (
  SELECT id FROM sounds WHERE profile_id = ''
    AND NOT EXISTS (SELECT 1 FROM share_sounds WHERE share_sounds.sound_id = sounds.id)
    AND NOT EXISTS (SELECT 1 FROM shares WHERE shares.preview = sounds.id)
    AND NOT EXISTS (SELECT 1 FROM records WHERE records.sound_id = sounds.id));
DELETE FROM sounds WHERE profile_id = ''
  AND NOT EXISTS (SELECT 1 FROM share_sounds WHERE share_sounds.sound_id = sounds.id)
  AND NOT EXISTS (SELECT 1 FROM shares WHERE shares.preview = sounds.id)
  AND NOT EXISTS (SELECT 1 FROM records WHERE records.sound_id = sounds.id);

INSERT INTO migrations (name, applied) VALUES ('008-clear-check-shares', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
