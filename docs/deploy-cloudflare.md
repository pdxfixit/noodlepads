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

**GitHub deploys every push to `main`** ([ADR 0025](adr/0025-github-deploys.md)),
in `.github/workflows/deploy.yml`, one run at a time in push order:

1. `just test`.
2. The release checks: `tools/version_bumped.sh` (no `web/` change since the
   last `just version`) and `python3 tools/bump_version.py --check` (PATCH is
   the commit count). A push that fails either stops here, before anything is
   uploaded.
3. The public **flarepress** action (`pdxfixit/flarepress@v1`, its rolling tag) on `site/`:
   check (the run is for `main`; `web/`, `worker/` and `site/` committed;
   `index.html` there), gate, stamp `web/version.json`, `wrangler deploy`, then
   verify: wait until the live site serves that version.
4. `just deploy-checks` (below).

Before step 3 the deploy runs `just cloud-migrate --yes` (Ben, 2026-10-26):
any `worker/migrations/*.sql` D1 lacks is applied, so a new Worker never
meets the old tables. Up to date, it only reads. A migration that drops a
table D1 holds rows of stops the deploy (CI has no telemetry mirror to
prove they were copied); Ben runs that one from the Mac after `just pull`.
Only this step and the upload hold the token, which has D1 edit.

The pieces:

- `site/wrangler.toml`: one Worker (`../worker/index.js`), static assets from
  `../web`, the D1 binding `DB`, a Custom Domain for `noodlepads.com` (apex
  only). The database id is written `${D1_DATABASE_ID}` (the repo is public);
  flarepress fills it from the environment into a throwaway copy.
- `site/site.conf` configures flarepress's shared `tools/site.sh`
  (`committed=web worker site`, `rollback=revert`). `stamp` and verify agree on
  the version by construction: verify reads the stamp back. Until 2026-10-13
  they did not, and an edited `TODO.md` made a deploy fail at verify.
- `site/harvest.conf`: what the harvest copies.
- Secrets in GitHub (Settings → Secrets and variables → Actions):
  `CLOUDFLARE_API_TOKEN` (this repo's own token: Account → Workers Scripts:
  Edit, D1: Read; noodlepads.com → Workers Routes: Edit, DNS: Edit, Zone:
  Read), `D1_DATABASE_ID`, `CLOUDFLARE_ACCOUNT_ID`.
- `web/_headers`: `Cache-Control: no-cache` so devices pick up a new deploy on
  their next load, the microphone allowed for this site only, two hardening
  headers, and a Content-Security-Policy (own scripts, styles and fonts,
  blob: and data: images; no outside origin, no inline code). Adding an outside origin means
  editing that line. `web/.assetsignore` keeps `.DS_Store` out of uploads.
  Neither file is served.

Agents push `main` (`just ship`, `just land`) and read the deploy run; they
never deploy and hold no Cloudflare token. **Ben's fallback** is the same steps
from his Mac, through a clone of the public flarepress at `~/src/flarepress`,
with his Keychain token and the ids from `~/.config/noodlepads/cloud.json`:

```
just deploy-check     # read-only pre-flight: flarepress's check (main, committed, pushed), then the tests
just deploy-plan      # deploy-check, then wrangler's dry run: validates, lists files, sends nothing
just deploy           # deploy-check, stamp, wrangler deploy (asks to confirm), verify, live checks
just live             # what is live now, and whether it is main's web/ and worker/ (read-only)
just rollback         # prints the revert steps for a bad deploy (below)
```

### Checks after a deploy

GitHub's deploy is the pipeline. GitHub also runs `just test` on every push
(`.github/workflows/test.yml`) and one daily read-only check,
`just live-check` (`.github/workflows/live.yml`): the site answers and `/api/cloud`
says ok; which commit is live is the deploy run's job. Once `deploy-verify` sees
the new version live, `just deploy-checks` runs two checks against
https://noodlepads.com, both even if one fails, in about 8 s together:

| Check | What it proves |
|---|---|
| `just cloud-smoke` | The API, from Node through `web/cloud-api.js`: make a profile with a fun name, picture, color and PIN; a wrong PIN is 401; open with the PIN; push a record and pull it back; a sound over 1.9 MB goes up in two pieces, is never sent twice, and reads back byte for byte; a share code reads back with no key, PIN or Origin; the public list has the profile; delete it; it is gone from the list, opens 404, its sound and its share code 404. |
| `just cloud-e2e` | Two devices: two browser contexts (separate IndexedDB) in headless Chrome on the live site. A makes a person, a beat and a small WAV sound and syncs; B opens the profile from ⚙️ → People → ☁️ list and gets the person, the beat and the sound (byte for byte); B rerolls the name (🎲) and renames the beat, and syncs; A syncs and has both, the beat edited in place (Q7). |

- Every request carries `Origin: https://noodlepads.com`: the Worker refuses
  writes from anywhere else.
- Each check makes one throwaway profile (`p-smoke-<time>-<random>`,
  `p-e2e-…`) and deletes it in a `finally`, whatever failed. For about 4 s it
  shows in the public list under a fun name. Their ids (`worker/cloud.js
  TEST_PROFILE`) count on a daily cap of their own, 100 a UTC day, so the
  checks never use up kids' 50 new profiles a day. Deleting the profile
  deletes its share code too.
- On GitHub the checks' cleanup (`cloud-prune --smoke --yes`, a D1 write)
  warns instead: the deploy token reads D1 only. Share codes from checks
  before 2026-10-26 (when a share outlived its profile) stay until Ben runs
  `just cloud-prune --smoke --yes` from the Mac.
- A run killed mid-way (Ctrl-C, a crash) can leave its profile. `just
  cloud-prune --smoke` lists those (over 10 minutes old, so a running check is
  safe) and the checks' share codes; `--yes` deletes them. `just
  cloud-profiles` shows any left.
- A failure prints ❌ with the step, and the run ends with "Deployed,
  but the live check failed". The new version is live by then: fix forward,
  or roll back below. e2e also prints each device's `/api/` calls and cloud log.
- They run on their own too, against any copy with `--url`.
- Over a daily D1 limit (503 "resting") both fail until 00:00 UTC: that is
  the live site's state, not a bug in the check.

Auth, through flarepress's `tools/wrangler.sh`: `CLOUDFLARE_API_TOKEN` on
GitHub; on the Mac a Keychain token under service `cloudflare-www-deploy`,
else wrangler's own login (Ben runs `npx wrangler login` when it expires).

## How noodlepads.com was set up (flarepress)

A record: these steps used the private flarepress of the time
(`~/src/flarepress/noodlepads.com/`, now archived as `flarepress-archive`).
The site folder is `site/` in this repo since 2026-10-15 (ADR 0025).

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
- **The Worker has no secrets.** The player metrics keep nothing of the IP
  ([ADR 0016](adr/0016-player-metrics.md)). If an `IP_KEY` secret was ever
  set, nothing reads it: `npx wrangler secret delete IP_KEY` from
  `~/src/flarepress/noodlepads.com` removes it.
- **Deploys do not harvest.** The telemetry runner (pdxfixit/telemetry) is the only
  harvester: daily, flarepress's `tools/harvest.py` on `site/`, with its own
  read-only token and the D1 id from its own secrets.
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
     after the telemetry runner's next run and `telemetry.py pull`, `just logs`
     shows the upload.

Static files are still served before the script runs; only paths with no file
reach it, and it hands everything but `/api/…` back to the assets.

**Unverified until the first deploy** (no local wrangler or Miniflare was used
to build this; the tests run the real SQL on Node's own SQLite): that D1 returns
BLOBs in a shape `toBytes` reads (it handles ArrayBuffer, typed arrays and
number arrays), that 20,000 PBKDF2 rounds stay within the free plan's 10 ms of
CPU per request, and D1's wording once a daily limit is reached (any D1 error
is answered 503, so the app says "resting until tomorrow").

### Rollback

Both are Ben's calls.

- **Turn the cloud off, keep the data:** remove `main`, the `[assets]`
  `binding` line and the binding tables (`[[d1_databases]]`, `[[r2_buckets]]`,
  `[[ratelimits]]`) from `site/wrangler.toml`, and push that to `main`: GitHub
  deploys it like any push. The site is static again; devices keep
  everything on the device and say the cloud isn't reachable. Put the lines
  back to turn it on again.
- **Delete everything in the cloud:** after the step above, from the Mac,
  `just cloud-db delete noodle-pads`, and revoke the read-only token. This
  deletes every profile, sound and report there; devices keep their own copies.
- The telemetry runner's copies (pdxfixit/telemetry) are untouched by any of
  this.

## Rollback

**A bad deploy is rolled back by a revert pushed to `main`.** The live site
is always a commit on `main`, and GitHub deploys every push, so the revert is
the deploy. Nobody deploys an old checkout or runs `just deploy` for it.

1. **Check the IndexedDB version first.** `git diff <good sha> main -- web/store.js`:
   if a commit since then added a line to `SCHEMA` (which raises `DB_VERSION`),
   do not revert across it. Devices that loaded the newer copy have upgraded
   their database, and the older code asks for a lower version, which
   IndexedDB refuses: their sounds and beats would not open. Fix forward
   instead.
2. In a worktree: `git revert --no-commit <sha>…` (newest first), then
   `just version` when the revert touches `web/` (it puts back an old
   release, which the deploy's release check refuses), `just test`, and
   commit with a `fix:` message.
3. Land it from the main checkout: `just land <sha>`. (A cloud session pushes
   its branch, then fast-forwards `main`, as AGENTS.md says.) Never
   force-push `main`.
4. Read the deploy run (`gh run list --limit 3`), then `just live`.

`just rollback` prints flarepress's revert steps for the previous release
(`rollback=revert` in `site/site.conf`: never an old checkout); here the push
in step 3 is the deploy. A revert does not undo a D1 migration: the Worker
must work with the newer tables (it skips what it can't use, as
`worker/metrics.js` does).

**Removing noodlepads.com** (Ben's call): first remove the deploy job from
`.github/workflows/deploy.yml`, or the next push deploys it again; then, from
the Mac, wrangler's `delete` through flarepress's `tools/wrangler.sh` on
`site/` (as `just cloud-db` runs `d1`) removes the Worker. Check the zone's DNS tab
afterwards in case the Custom Domain record outlives it. Sounds stay in those
browsers at noodlepads.com.
