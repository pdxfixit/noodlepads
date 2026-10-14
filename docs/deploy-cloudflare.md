# Hosting: noodlepads.com

**The app is served at https://noodlepads.com/**, public by Ben's choice:
anyone with the address can use the board and play every file under `web/`.
`boards.json` lists no people, so no one's name is in those files. Sounds
recorded in the app stay in the browser that made them until their person is
put in the cloud ([ADR 0002](adr/0002-cloud-profiles-on-one-worker.md),
[the design](design/cloud-profiles.md)).

**The old address** (the subdomain the app was first deployed on, 2026-10-10)
is retired (Ben, 2026-10-13; [ADR 0010](adr/0010-move-to-noodlepads-com.md)):
its one-tap move page and the app's receiving end are gone from this repo;
its Worker and flarepress folder were deleted on 2026-10-13 (a leftover DNS record is in TODO.md "Ben does"). Its name is not written
in this repo: it has a kid's name in it.

**Status:** noodlepads.com is live and serves `main` (its `version.json` names
the commit), with the Worker and the D1 database behind `/api/`. The setup
steps below are kept as the record of how it was built, and for rebuilding it.

## How it is deployed

Through **flarepress** (`~/src/flarepress`, GitHub `pdxfixit/flarepress`), the
toolchain that owns every Sandberg domain in the "Sandberg Family Domains"
Cloudflare account. Its `AGENTS.md` is the authority on that account; read it
before changing anything there.

- `flarepress/noodlepads.com/public` is a symlink to this repo's `web/`, the
  same pattern as pdxfixit.com (whose `public` links to `~/src/website/public`).
  So a deploy always ships **the main checkout's** `web/`
  (`~/src/noodlepads/web`) as it is on disk, whichever folder you run
  `just deploy` from. `worker` links to its `worker/` the same way. Deploy,
  ship and land only from the main checkout; from a worktree, commit on your
  branch and have it landed (`docs/how-to.md`). `just deploy-check`, which
  `just deploy` runs first, refuses uncommitted edits in `web/` or `worker/`,
  a commit that is off `main` or not pushed, a run from any checkout
  but the one flarepress links to, and failing tests.
- `flarepress/noodlepads.com/site.conf` configures flarepress's shared
  `tools/site.sh` (the same tool isogrid deploys with): `just deploy-check`,
  `just stamp`, `just deploy-verify`, `just live` and `just rollback` call it.
  `stamp` and `deploy-verify` agree on the version by construction: verify reads
  the stamp back. Until 2026-10-13 they did not, and an edited `TODO.md` made a
  deploy fail at `deploy-verify`.
- `flarepress/noodlepads.com/wrangler.toml`: one Worker, static assets from
  `./public`, a Custom Domain for `noodlepads.com`. The Worker's name and
  whether `www` is added are flarepress's call.
- `web/_headers`: `Cache-Control: no-cache` so devices pick up a new deploy on
  their next load, the microphone allowed for this site only, two hardening
  headers, and a Content-Security-Policy (own scripts and styles, Google Fonts,
  blob: and data: images; no inline code). Adding an outside origin means
  editing that line. `web/.assetsignore` keeps `.DS_Store` out of uploads.
  Neither file is served.

From this repo:

```
just deploy-check   # read-only pre-flight: main, committed, pushed, linked here, tests pass
just deploy-plan    # deploy-check, then flarepress `plan noodlepads.com`: validates, lists files, sends nothing
just deploy         # deploy-check, stamp, flarepress `push noodlepads.com` (asks to confirm), then waits for the live version
just live           # what is live now, and whether it is main's web/ and worker/ (read-only)
just rollback       # prints the revert steps for a bad deploy (below)
```

`just deploy` then runs the checks after a deploy (below).

### Checks after a deploy

`just deploy` is the pipeline. GitHub runs `just test` on every push
(`.github/workflows/test.yml`) and one daily read-only check,
`just live-check` (`.github/workflows/live.yml`): the site answers, `/api/cloud`
says ok, and live serves `main` (an hour's grace for a deploy in flight). Once `deploy-verify` sees
the new version live, `just deploy-checks` runs two checks against
https://noodlepads.com, both even if one fails, in about 8 s together:

| Check | What it proves |
|---|---|
| `just cloud-smoke` | The API, from Node through `web/cloud-api.js`: make a profile with a fun name, picture, color and PIN; a wrong PIN is 401; open with the PIN; push a record and pull it back; a sound over 1.9 MB goes up in two pieces, is never sent twice, and reads back byte for byte; a share code reads back with no key, PIN or Origin; the public list has the profile; delete it; it is gone from the list, opens 404, its sound 404s, and the share stays. |
| `just cloud-e2e` | Two devices: two browser contexts (separate IndexedDB) in headless Chrome on the live site. A makes a person, a beat and a small WAV sound and syncs; B opens the profile from ⚙️ → People → ☁️ list and gets the person, the beat and the sound (byte for byte); B rerolls the name (🎲) and renames the beat, and syncs; A syncs and has both, the beat edited in place (Q7). |

- Every request carries `Origin: https://noodlepads.com`: the Worker refuses
  writes from anywhere else.
- Each check makes one throwaway profile (`p-smoke-<time>-<random>`,
  `p-e2e-…`) and deletes it in a `finally`, whatever failed. For about 4 s it
  shows in the public list under a fun name. A profile made and deleted the
  same UTC day gives its place in the 50-a-day cap back (provisional, Q24), so
  the checks never use up kids' new profiles. Each smoke run leaves one share
  code (a beat with no sound: a few hundred bytes) because shares are forever.
- A run killed mid-way (Ctrl-C, a crash) can leave its profile. `just
  cloud-prune --smoke` lists those (over 10 minutes old, so a running check is
  safe) and the checks' share codes; `--yes` deletes them. `just
  cloud-profiles` shows any left.
- A failure prints ❌ with the step, and `just deploy` ends with "Deployed,
  but the live check failed". The new version is live by then: fix forward,
  or roll back below. e2e also prints each device's `/api/` calls and cloud log.
- They run on their own too, against any copy with `--url`.
- Over a daily D1 limit (503 "resting") both fail until 00:00 UTC: that is
  the live site's state, not a bug in the check.

Auth is flarepress's: a Keychain token under service `cloudflare-www-deploy` if
present, else wrangler's own login. When that login expires, an agent can't
renew it; Ben runs `npx wrangler login` in a terminal.

## How noodlepads.com was set up (flarepress)

1. **New site folder `noodlepads.com/`**, with `public` → this repo's `web/`, a
   Custom Domain for `noodlepads.com`, and the Worker script and bindings.
2. Deploy, then check: noodlepads.com serves the app with this commit's
   `version.json`.

## Things to know

- **HTTPS means recording works on tablets and phones directly.** `just phone`
  (adb port-forwarding to localhost) is only needed for the local dev server.
- **Each address has its own storage.** Sounds made at `localhost:8765`, the
  Wi-Fi address do not appear at noodlepads.com by themselves: a backup
  brings them.
- **Devices share through the cloud** only for people put there (cloud profiles,
  below); everyone else stays on their device.
- **Before real voice recordings go into `web/clips/`**, remember they become
  public on the next deploy.
- **The Worker has one secret, `IP_KEY`** ([ADR 0016](adr/0016-player-metrics.md)):
  the key for the scrambled IP code in the player metrics. Without it the
  metrics keep everything but that code. Set it once, from flarepress's site
  folder, so nobody ever sees it:
  `cd ~/src/flarepress/noodlepads.com && openssl rand -hex 32 | npx wrangler secret put IP_KEY`
  (wrangler's own login, or `CLOUDFLARE_API_TOKEN` from the Keychain as
  flarepress's recipes set it). A secret stays through every deploy. Changing
  it later starts every IP code over: visits before and after no longer match.

## Cloud profiles and problem reports: one D1 database (live)

[ADR 0002](adr/0002-cloud-profiles-on-one-worker.md), [ADR 0009](adr/0009-opt-in-problem-reports.md),
[the design](design/cloud-profiles.md). This repo has the Worker script
(`worker/index.js` and the files beside it), the schema (`worker/schema.sql`)
and the reader (`tools/logs.py`). All of it is live since 2026-10-11: the
steps below are how it was set up, kept for rebuilding it. Without the Worker
the site would be assets only: the app says "The cloud isn't reachable from
here" and problem reports are not stored.

The whole Cloudflare footprint is **one Worker** (the site's own) and **one
D1 database**, on the free plan. No KV, no R2, no Cron Triggers, no
rate-limit binding. One secret, `IP_KEY` (below). Nothing here asks for a card.

### Ben, once (about 15 minutes; please approve each step)

1. **Make the database**, from `~/src/flarepress/noodlepads.com` with your own
   `npx wrangler login` (the flarepress token may lack D1; if `wrangler` says
   so, that is why):

   ```
   npx wrangler d1 create noodle-pads
   ```

   It prints a `database_id`. Note it.
2. **Make the tables**, on a new, empty database only: `just cloud-schema --yes`
   (it refuses a database that already has tables). The live database is
   kept up to date by `just cloud-migrate` instead, which applies the files
   in `worker/migrations/` not yet listed in its `migrations` table (a dry
   run unless `--yes`).

   Check: `just cloud-sql "SELECT name FROM sqlite_master WHERE type = 'table'"`
   lists profiles, keys, records, sounds, sound_chunks, shares, share_sounds, reports, counters, migrations.
3. **A read-only token for `just logs`**: dashboard → Manage Account → API Tokens →
   Create Custom Token: **Account → D1 → Read**, for the Sandberg Family Domains
   account only. Nothing else.
4. **Keep it in the Keychain** (`-w` last makes it prompt, so the token stays out of shell history):

   ```
   security add-generic-password -s noodlepads-logs -a cloudflare -w
   ```

5. **Fill `~/.config/noodlepads/cloud.json`** (on this Mac, never in the repo,
   which is public): `mkdir -p ~/.config/noodlepads && cp tools/cloud.example.json
   ~/.config/noodlepads/cloud.json`, then fill in `account_id` (`npx wrangler
   whoami` lists it) and `database_id` (step 1). `just doctor` says if it is missing.

### The flarepress change (an agent, after step 2; for Ben to approve)

In `~/src/flarepress/noodlepads.com/`:

- `ln -s ~/src/noodlepads/worker worker` (beside `public`, the same pattern).
- `wrangler.toml` becomes (the `name`, routes and comments stay as they are):

```toml
name = "noodlepads-com"
compatibility_date = "2026-10-11"
main = "worker/index.js"

routes = [
  { pattern = "noodlepads.com", custom_domain = true }
]

[assets]
directory = "./public"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "noodle-pads"
database_id = "<id from step 1>"
```

- A line in flarepress `AGENTS.md` under the site: the first site with a Worker
  script and a binding (one D1 database).
- `just deploy-check` here (wrangler's dry run bundles the script, which
  imports a few files from `web/`, and checks the binding), then `just deploy`.
- **Check it live:**
  1. `curl -s https://noodlepads.com/api/cloud` says `{"ok":true,…}`.
  2. On a phone: 👥 People → ☁️ by someone → ☁️ Put in the cloud. On a second
     device: ☁️ Open from the cloud, pick them; their sounds play.
  3. ⚙️ Settings → 📮 Send problem reports on, use the app, switch away; then
     `just logs --sync && just logs` shows the upload.

Static files are still served before the script runs; only paths with no file
reach it, and it hands everything but `/api/…` back to the assets.

**Unverified until the first deploy** (no local wrangler or Miniflare was used
to build this; the tests run the real SQL on Node's own SQLite): that D1 returns
BLOBs in a shape `toBytes` reads (it handles ArrayBuffer, typed arrays and
number arrays), that 20,000 PBKDF2 rounds stay within the free plan's 10 ms of
CPU per request, and D1's wording once a daily limit is reached (any D1 error
is answered 503, so the app says "resting until tomorrow").

### Rollback

- **Turn the cloud off, keep the data:** remove `main`, the `[assets] binding`
  line and `[[d1_databases]]` from flarepress's `wrangler.toml`, delete its
  `worker` symlink, and deploy. The site is static again; devices keep
  everything on the device and say the cloud isn't reachable. Put the lines
  back to turn it on again.
- **Delete everything in the cloud:** after the step above,
  `npx wrangler d1 delete noodle-pads`, and revoke the read-only token. This
  deletes every profile, sound and report there; devices keep their own copies.
- The local report archive (`~/.local/state/noodlepads/logs.sqlite3`) is
  untouched by any of this.

## Rollback

- **A bad deploy:** the live site is always a commit on `main`, so revert, in
  the main checkout: `git revert --no-edit <sha>…`, `just test`,
  `git push origin main`, `just --yes deploy`. `just rollback` prints exactly
  these steps for the previous release (it never deploys an old checkout:
  `rollback=revert` in flarepress's `site.conf`). Never force-push `main`. A
  revert does not undo a D1 migration: the Worker must work with the newer
  tables (it skips what it can't use, as `worker/metrics.js` does).
- **noodlepads.com:** from `~/src/flarepress/noodlepads.com`, `npx wrangler
  delete` removes the Worker; check the zone's DNS tab afterwards in case the
  Custom Domain record outlives it. Then remove the folder from flarepress and
  its line in flarepress `AGENTS.md`. Sounds stay in those browsers at
  noodlepads.com.
