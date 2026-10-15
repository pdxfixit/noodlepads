-- 003 (2026-10-15, Ben: more telemetry, D1 pruned often, strip what is not
-- needed): a `visits` table, and the IP hash column goes. Apply with
-- `just cloud-migrate --yes` right before the deploy that uses it. Between the
-- two, the Worker still live writes `ip_hash`, so its event rows fail quietly
-- (worker/metrics.js never fails a request) for that minute or so. The
-- column was always empty: the IP_KEY secret was never set.

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

ALTER TABLE activity DROP COLUMN ip_hash;

INSERT INTO migrations (name, applied) VALUES ('003-visits-no-ip-hash', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
