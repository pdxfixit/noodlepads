-- 005 (2026-10-16, Ben: retire the ADR 0016 feature-use counts and visit
-- summaries now the shared telemetry events are live; ADR 0027): the `uses`
-- and `visits` tables go. `devices` and `activity` stay (a profile used from
-- several devices or countries, a wrong PIN: nothing in the shared events
-- says them).
--
-- Apply with `just cloud-migrate --yes` ONLY after the Worker that no longer
-- writes them is live AND the telemetry runner has harvested `uses` and
-- `visits` once since (check `telemetry.py pull`: noodlepads__uses and
-- noodlepads__visits are filled). A drop cannot be undone, and D1 is the only
-- copy of what was not harvested. Dropping before the new Worker is live is
-- harmful too: the old Worker's sweep shares a batch with the activity
-- insert, so a missing `uses` table makes it lose those writes.

DROP TABLE IF EXISTS uses;
DROP TABLE IF EXISTS visits;

INSERT INTO migrations (name, applied) VALUES ('005-drop-uses-visits', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
