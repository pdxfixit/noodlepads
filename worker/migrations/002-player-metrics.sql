-- 002 (2026-10-12, Ben: gather player metrics): three new tables, nothing
-- else changes. Apply with `just cloud-migrate --yes` before the deploy that
-- uses them; the Worker skips metrics while they are missing, so either
-- order works. Every table is IF NOT EXISTS: run again by hand, only the
-- last line fails (it is recorded already), and nothing changes.

-- Player metrics (ADR 0016): which devices use each profile, from where
-- (city and network, never the IP), when, and which parts of the app. Kept
-- 90 days: the Worker deletes older rows as it goes (worker/metrics.js), and
-- `just cloud-stats` copies them into a local archive first. Every write is
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
-- where it came from (Cloudflare's request.cf). `ip_hash` is an HMAC of the
-- IP with the Worker secret IP_KEY, so the same address matches without the
-- address being kept; NULL when the secret is not set.
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- never reused, so the archive copies by id
  at         INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  device     TEXT,                      -- devices.hash; NULL for a wrong PIN (no key yet)
  kind       TEXT NOT NULL,             -- make open pull push share pin pin-wrong
  city       TEXT,
  region     TEXT,
  country    TEXT,                      -- two letters
  network    TEXT,                      -- the network's name (asOrganization)
  asn        INTEGER,
  ip_hash    TEXT                       -- 16 hex characters
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

INSERT INTO migrations (name, applied) VALUES ('002-player-metrics', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
