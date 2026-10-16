-- 004 (2026-10-16, Ben: "country only, in every app"; Arrow-Rama #151):
-- the activity log keeps the country alone. City, region, network name and
-- ASN go, with what they held. Apply with `just cloud-migrate --yes` right
-- before the deploy that needs it (the deploy waits for it). In the minute
-- between the two, the Worker still live writes those columns, so its event
-- rows fail quietly (worker/metrics.js never fails a request).

ALTER TABLE activity DROP COLUMN city;
ALTER TABLE activity DROP COLUMN region;
ALTER TABLE activity DROP COLUMN network;
ALTER TABLE activity DROP COLUMN asn;

INSERT INTO migrations (name, applied) VALUES ('004-country-only', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
