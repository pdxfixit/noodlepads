-- 010 (2026-10-27, security review): guessing a PIN through the site slows
-- down with every window. Five wrong tries still lock for 10 minutes; each
-- full window without a right PIN now doubles the next lock, up to a day
-- (worker/pin.js checkSecret). `strikes` counts the windows locked at /open,
-- `key_strikes` those on requests that carry a key, apart as their tries are.
-- A right PIN, a new PIN or a reset sets them back to 0.
--
-- Safe to apply before the Worker that reads it is live: two columns with
-- defaults, which the older Worker never names. The deploy applies it before
-- the upload (deploy.yml runs `just cloud-migrate --yes`).

ALTER TABLE profiles ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN key_strikes INTEGER NOT NULL DEFAULT 0;

INSERT INTO migrations (name, applied) VALUES ('010-pin-strikes', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
