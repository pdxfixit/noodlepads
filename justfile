# Noodle Pads. `just` lists the recipes.

# Same private adb server Arrow-Rama uses for Ben's devices; a caller that
# already set ANDROID_ADB_SERVER_PORT (every agent has its own) keeps it.
export ANDROID_ADB_SERVER_PORT := env("ANDROID_ADB_SERVER_PORT", "5039")

[private]
default:
    @just --list --unsorted

# Serve the web app on this Mac and the LAN
serve port="8765":
    python3 tools/serve.py {{port}}

# Start here: this checkout (worktree or main), just, node, python, Chrome, flarepress, live against main; then the reading order
doctor:
    @sh tools/doctor.sh

# (one file per `node --check`: given several, it checks only the first)
[doc("Check syntax, then run the tests (Node's built-in runner, then the tools' and the noodlepads-logs skill's unittest; no install step). Judge by the exit code")]
test:
    @for f in web/*.js worker/*.js; do node --check "$f" || exit 1; done
    node --test --test-force-exit
    python3 -m unittest discover -s tools -p 'test_*.py'
    python3 -m unittest discover -s skills/noodlepads-logs -p 'test_*.py'

#   just stress                   the whole suite 10 times with 6 cores kept busy
#   just stress 20 8 tests/cloud-ui.test.mjs   one file, 20 times, 8 cores busy
[doc("Run the Node tests again and again with cores kept busy, to catch a test that fails only under load (docs/how-to.md Flaky tests)")]
[positional-arguments]
stress *args:
    @sh tools/stress.sh "$@"

#   just look                     the Pads screen at 320, 375, 700, 900 and 1100 px
#   just look live                one screen or view (several are fine: just look pads beats song live settings help)
#   just look --help              every view's name (the VIEWS table in tools/look.mjs says what each opens)
#   just look beats --advanced    with the Advanced switch on, so every control shows (song always has it)
#   just look beats --js 'document.querySelector("#seq-grooves").click()'   runs JS on the screen first
#   just look --url http://localhost:8765/ --widths 375 --out shots
#   just look pads --wide           adds the wide screens: 1366, 1920, 2560 and 3440 px
#   just look beats --top 500      keeps only the top 500 px of each screenshot
#   just look edit --scroll 700    one 800 px window scrolled down 700 px (an open sheet too), to see what sticks
#   just look beat-groove --scroll-to '.seq-row'   the same, with that element near the top
[doc("Check every width in a private headless Chrome: sideways scroll, errors, CSP, controls under 44 px; saves screenshots. just look --help lists the views")]
[positional-arguments]
look *args:
    @node tools/look.mjs "$@"

#   just cloud-db info noodle-pads
#   just cloud-db export noodle-pads --remote --output backup.sql
[doc("The cloud database (D1 noodle-pads), through flarepress's auth: any wrangler d1 command. Ben's; agents never touch the live database")]
[positional-arguments]
cloud-db *args:
    #!/usr/bin/env bash
    set -euo pipefail
    {{ids}}
    "{{flarepress}}/tools/wrangler.sh" "{{site}}" d1 "$@"

# A NEW, empty database only: worker/schema.sql. Refuses a database that has tables (use cloud-migrate). --yes applies
[positional-arguments]
cloud-schema *args:
    @python3 tools/cloud_admin.py schema "$@"

# Bring the live database up to date: lists worker/migrations/*.sql not yet applied (table `migrations`); --yes applies them in order
[positional-arguments]
cloud-migrate *args:
    @python3 tools/cloud_admin.py migrate "$@"

# Run one SQL statement on the live database: just cloud-sql "SELECT count(*) FROM profiles"
[positional-arguments]
cloud-sql sql:
    just cloud-db execute noodle-pads --remote --yes --command "$1"

# Every cloud profile: id, fun name, made, last active, records, sound bytes, keys, shares
cloud-profiles:
    @python3 tools/cloud_admin.py profiles

# The players in the cloud: what each has made (🔊 sounds 🥁 beats 🎼 songs 🎬 takes ⭐ voices ⌨️ layouts), sound size, PIN, devices, shares;
# then `just harvest`, and the player metrics (ADR 0016) from ~/.local/state/noodlepads/metrics.sqlite3 (kept forever): devices,
# places (⚠️ more than one), activity by day (--days N, default 14) and hour, feature use, visits, errors
[doc("Player report: what each player made, then harvest and the metrics (ADR 0016) from ~/.local/state/noodlepads/metrics.sqlite3. --days N")]
[positional-arguments]
cloud-stats *args:
    @just harvest || echo "⚠️ the harvest did not fully work (above); reporting from the archive as it is"
    @python3 tools/cloud_admin.py stats "$@"

# D1 keeps metrics 14 days (a device's row 90) and problem reports 14 days, and
# Cloudflare its own stats about a month: this copies all of it into the
# archives on this Mac, kept forever. flarepress's tools/harvest.py
# (site/harvest.conf says how) does the metrics and Cloudflare's stats into
# ~/.local/state/noodlepads/metrics.sqlite3; `just logs --sync` the problem
# reports. `just deploy` and `just cloud-stats` run it first, and the daily
# noodlepads-logs leg runs it (skills/noodlepads-logs). Read-only against the
# cloud; safe to run again. Exit 1 when any part failed (what worked is kept).
[doc("Copy the cloud's metrics, Cloudflare's stats and new problem reports into the local archives (read-only; deploy and cloud-stats run it first)")]
harvest:
    #!/usr/bin/env bash
    set -uo pipefail
    bad=0
    {{ids}}
    python3 "{{flarepress}}/tools/harvest.py" "{{site}}" || bad=1
    python3 tools/logs.py --sync || bad=1
    exit $bad

#   just cloud-prune --days 90 --empty          what would go
#   just cloud-prune --days 90 --empty --yes    delete them (shared sounds stay: a share is forever)
#   just cloud-prune --smoke --yes              what the deploy checks left (p-smoke-…, p-e2e-…, their share codes)
[doc("Profile sprawl: lists profiles idle --days N (default 180) and, with --empty, ones with nothing in them, plus loose sounds. Dry run; --yes deletes")]
[positional-arguments]
cloud-prune *args:
    @python3 tools/cloud_admin.py prune "$@"

# The live cloud API end to end: a throwaway profile (p-smoke-…) made, PIN, push, pull, a 2-piece sound, a share, deleted. just deploy runs it
[positional-arguments]
cloud-smoke *args:
    @node tools/look.mjs cloud-smoke "$@"

# Two devices syncing on the live site in headless Chrome: a throwaway profile (p-e2e-…) made on A, opened on B, renamed on B, back on A, deleted. just deploy runs it
[positional-arguments]
cloud-e2e *args:
    @node tools/look.mjs cloud-e2e "$@"

# Clear a profile's forgotten PIN (from an email to [old address removed]): shows the profile, asks, then runs it and checks
[positional-arguments]
cloud-reset-pin id:
    @python3 tools/cloud_admin.py reset-pin "$1"

#   just cloud-backup                       ~/.local/state/noodlepads/backups/d1-<date>-<time>.sql
#   just cloud-backup ~/Desktop/cloud.sql   anywhere else (a relative path is from where you run it)
# Restoring one is a new database plus `wrangler d1 execute <db> --remote --file <it>`
# (docs/deploy-cloudflare.md), never over the live one.
[doc("Save the whole cloud database (D1 noodle-pads) to a local .sql file. Reads only; the file holds every profile, sound and metric, so keep it off the repo")]
cloud-backup file="":
    #!/usr/bin/env bash
    set -euo pipefail
    out="{{file}}"
    if [ -z "$out" ]; then
      dir="$HOME/.local/state/noodlepads/backups"; mkdir -p "$dir"
      out="$dir/d1-$(date +%Y-%m-%d-%H%M).sql"
    fi
    # cloud-db runs in site/, so a relative path is made whole first.
    case "$out" in /*) ;; *) out="{{invocation_directory()}}/$out" ;; esac
    case "$out" in "{{justfile_directory()}}"/*) echo "🛑 not inside the repo (it is public): $out" >&2; exit 1 ;; esac
    just cloud-db export noodle-pads --remote --output "$out"
    [ -s "$out" ] || { echo "🛑 nothing was written to $out" >&2; exit 1; }
    echo "✅ cloud database saved: $out ($(wc -c < "$out" | tr -d ' ') bytes)"

# Problem reports (docs/design/automatic-logs.md § 6), from the local archive
#   just logs                     the last 20 uploads, newest first
#   just logs --errors            only uploads with errors
#   just logs K7Q4-M2XD           one device's uploads, each with its event log
#   just logs --json <key>        one upload as raw JSON
#   just logs --grep 'text'       errors and notices containing the text
#   just logs --sql 'SELECT …'    a query (read-only); tables uploads, events
#   just logs --sync              copy new uploads from D1 into the archive
#   just logs --digest            errors and notices since the last marked digest
[doc("Problem reports from the local archive: just logs, --errors, <device code>, --json, --grep, --sql, --sync (from D1), --digest")]
[positional-arguments]
logs *args:
    @python3 tools/logs.py "$@"

# (--test-force-exit, as in `just test`: app.test.mjs otherwise never exits and the proof hangs)
[doc("Prove a test needs your change: it must fail on the committed copies of the files and pass on yours (PROVE_BASE=main for a branch's commits). A tools/test_*.py runs under unittest")]
prove test +files:
    #!/usr/bin/env bash
    set -euo pipefail
    keep=$(mktemp -d)
    files=({{files}})
    for f in "${files[@]}"; do mkdir -p "$keep/$(dirname "$f")"; cp "$f" "$keep/$f"; done
    trap 'for f in "${files[@]}"; do cp "$keep/$f" "$f"; done; rm -rf "$keep"' EXIT
    # A file new in your change is taken away for the run (it has no committed copy).
    # PROVE_BASE=main proves a change already committed on a branch (default HEAD).
    base="${PROVE_BASE:-HEAD}"
    for f in "${files[@]}"; do
      if git cat-file -e "$base:$f" 2>/dev/null; then git show "$base:$f" > "$f"; else rm "$f"; fi
    done
    # A Python test (tools/test_*.py) runs under unittest from its own folder, as `just test` runs it.
    case "{{test}}" in
      *.py) run() { (cd "$(dirname "{{test}}")" && python3 -m unittest "$(basename "{{test}}" .py)"); } ;;
      *) run() { node --test --test-force-exit {{test}}; } ;;
    esac
    if run > "$keep/out" 2>&1; then
      echo "❌ {{test}} passes without your change to {{files}}" >&2
      exit 1
    fi
    grep -E '^not ok|^✖|^(FAIL|ERROR):' "$keep/out" | head -5 || true
    # And it must pass with your change: a test broken on its own fails both
    # ways, and once looked proven (2026-10-12).
    for f in "${files[@]}"; do cp "$keep/$f" "$f"; done
    if ! run > "$keep/out" 2>&1; then
      grep -E '^not ok|^✖|^(FAIL|ERROR):' "$keep/out" | head -5 || true
      echo "❌ {{test}} fails with your change too: the test itself is broken" >&2
      exit 1
    fi
    echo "✅ {{test}} fails without your change to {{files}}, and passes with it"

# Let one Android device open the app as http://localhost (recording needs that). Serial from `adb devices`.
phone serial port="8765":
    adb -s {{serial}} reverse tcp:{{port}} tcp:{{port}}
    @echo "📱 On that device, open http://localhost:{{port}}/ in Chrome"

# Undo `just phone` on that device
phone-off serial port="8765":
    adb -s {{serial}} reverse --remove tcp:{{port}}

# Make preset clips in web/clips/kit/: just placeholders moo quack (only those; a kid's sounds use the rest, keep them byte-identical). No names: all of them
[positional-arguments]
placeholders *names:
    python3 tools/make_placeholders.py "$@"

# Remake web/emoji-all.js and web/emoji-check.js (every emoji behind the pickers' "…") from this Python's Unicode data; prints sizes
emoji:
    python3 tools/make_emoji.py


# Deploys: every push to main is deployed by GitHub (.github/workflows/deploy.yml,
# the pdxfixit/flarepress action, this repo's own Cloudflare token). site/ is the
# site folder: wrangler.toml, site.conf (the shared steps' settings) and
# harvest.conf. The recipes below are the same steps from Ben's Mac, through a
# clone of the public flarepress at ~/src/flarepress (FLAREPRESS=/path for
# another). Agents never deploy, from anywhere (Ben, 2026-10-15).
flarepress := env("FLAREPRESS", env("HOME") / "src/flarepress")
export FLAREPRESS := flarepress
site := justfile_directory() / "site"
# site/wrangler.toml names the database id as ${D1_DATABASE_ID}: a GitHub secret
# on CI, ~/.config/noodlepads/cloud.json on the Mac. Recipes that run wrangler
# start with this line.
ids := '[ -n "${D1_DATABASE_ID:-}" ] || eval "$(python3 tools/cloud_config.py --exports)"'

[doc("Read-only pre-flight: main checkout on main, web/ worker/ site/ committed (ALLOW_DIRTY=1 overrides), HEAD pushed, every migration applied, tests pass")]
deploy-check:
    #!/usr/bin/env bash
    set -euo pipefail
    "{{flarepress}}/tools/site.sh" "{{site}}" check --from "{{justfile_directory()}}"
    just deploy-migrated
    if out=$(just test 2>&1); then echo "✅ tests pass"
    else echo "$out" >&2; echo "🛑 tests fail; nothing to deploy" >&2; exit 1; fi

# The Worker in a commit may need tables a migration adds, and migrating is
# Ben's: GitHub's deploy and Ben's both stop here until D1 has every migration.
[doc("Exit 1 while any worker/migrations/*.sql is not applied to D1 (read-only). Every deploy runs it first")]
deploy-migrated:
    #!/usr/bin/env bash
    set -euo pipefail
    {{ids}}
    python3 tools/cloud_admin.py pending

[doc("Dry run: deploy-check, then wrangler validates, bundles the Worker and lists the files; sends nothing")]
deploy-plan: deploy-check
    #!/usr/bin/env bash
    set -euo pipefail
    {{ids}}
    "{{flarepress}}/tools/wrangler.sh" "{{site}}" deploy --dry-run

# deploy-verify reads this stamp back, so the two can never disagree about -dirty.
[doc("Write web/version.json (shown in the app's corner): git describe, plus -dirty for uncommitted edits in web/ or worker/. just deploy runs it")]
stamp:
    @"{{flarepress}}/tools/site.sh" "{{site}}" stamp

# Ben's fallback when GitHub cannot deploy: the same steps from this Mac, with
# the Keychain token. Agents never run it. Each deploy starts with a harvest
# (Ben, 2026-10-15), so nothing waiting in the cloud is lost to a change; a
# failed harvest warns and the deploy goes on.
[doc("Ben's fallback: deploy main to noodlepads.com from this Mac (GitHub deploys every push by itself). Agents never run it")]
[confirm("Deploy the soundboard to noodlepads.com (public) from this Mac? GitHub deploys every push to main by itself. (y/N)")]
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    just harvest || echo "⚠️ the harvest did not fully work (above); deploying anyway"
    just deploy-check
    "{{flarepress}}/tools/site.sh" "{{site}}" gate
    just stamp
    {{ids}}
    "{{flarepress}}/tools/wrangler.sh" "{{site}}" deploy
    just deploy-verify
    just deploy-checks

# Cherry-picks in a throwaway worktree (TODO.md conflicts resolved by
# tools/resolve_todo.py; any other conflict stops), tests the result, moves
# main, brings this checkout's copies of the touched files up to date and
# pushes; GitHub deploys the push. On 2026-10-12 a hand-run landing left this
# checkout's files stale.
[doc("Land an agent's commits on main and push (GitHub deploys): just land <sha>... Run it from the main checkout")]
land +commits:
    @bash tools/land.sh start {{commits}}

[doc("Finish a landing that stopped on a conflict, once it is resolved in its worktree: just land-continue <worktree>")]
land-continue worktree:
    @bash tools/land.sh continue {{worktree}}

# Removes a finished agent's worktree and branch once its work is on main:
# refuses a dirty worktree or a commit main lacks (by patch, as cherry-picks
# land), tags the tip archive/<branch>, then removes both. On 2026-10-12 a
# cleanup chained after a failed land deleted a branch whose work was not on
# main yet; only its archive tag kept it.
[doc("Archive and remove a finished agent's worktree: just archive-agent <agent-id or branch>")]
archive-agent id:
    #!/usr/bin/env bash
    set -euo pipefail
    b="{{id}}"; case "$b" in worktree-agent-*) ;; *) b="worktree-agent-$b" ;; esac
    w=".claude/worktrees/${b#worktree-}"
    git rev-parse -q --verify "refs/heads/$b" > /dev/null || { echo "🛑 no branch $b" >&2; exit 1; }
    if [ -d "$w" ] && [ -n "$(git -C "$w" status --porcelain)" ]; then echo "🛑 $w has uncommitted work; nothing removed" >&2; exit 1; fi
    missing=$(git cherry main "$b" | grep '^+' || true)
    if [ -n "$missing" ]; then
      # A patch changed while landing (a resolved conflict) shows as +: match by subject instead.
      for c in $(echo "$missing" | cut -c3-); do
        subj=$(git log -1 --format=%s "$c")
        # Not grep -q: it exits early, git log dies of SIGPIPE, and pipefail
        # calls the match a failure.
        git log main --format=%s | grep -cxF "$subj" > /dev/null || { echo "🛑 $c ($subj) is not on main; land it first" >&2; exit 1; }
      done
    fi
    # Tagged already (a cleanup that stopped halfway): fine if it is this tip.
    if git rev-parse -q --verify "refs/tags/archive/$b" > /dev/null; then
      [ "$(git rev-parse "archive/$b^{commit}")" = "$(git rev-parse "$b")" ] || { echo "🛑 archive/$b exists at another commit; nothing removed" >&2; exit 1; }
    else
      git tag -m "Archived branch $b (work landed on main)" "archive/$b" "$(git rev-parse "$b")"
    fi
    # The agent tool locks its worktree; the pid in the lock is the whole
    # session's (agents run inside it), so it can't tell a live agent from a
    # finished one. Run this only once the agent's report has arrived.
    if [ -d "$w" ]; then
      git worktree unlock "$w" 2>/dev/null || true
      git worktree remove "$w"
    fi
    git branch -D "$b"
    echo "✅ archived $b as archive/$b"

# The message comes from a file. Stops at the first failure: tests red,
# main moved under you, or a file that changed while committing.
[doc("Commit the named files to main through a throwaway worktree and push (GitHub deploys): just ship <message-file> <files...>. Run it from the main checkout")]
ship msgfile +files:
    #!/usr/bin/env bash
    set -euo pipefail
    files=({{files}})
    # A rerun after a ship that committed but failed later: say so plainly,
    # instead of git's "nothing to commit" and a bare failure (2026-10-12).
    if git diff --quiet main -- "${files[@]}" && [ -z "$(git ls-files --others --exclude-standard -- "${files[@]}")" ]; then
      echo "✅ these files are already on main ($(git log --oneline -1 main | cut -c1-60)); live: $(curl -s https://noodlepads.com/version.json)"; exit 0
    fi
    just test > /dev/null || { echo "🛑 tests fail; nothing committed" >&2; exit 1; }
    old=$(git rev-parse main)
    wt=.worktrees/ship-$(date +%s)-$$
    git worktree add -q --detach "$wt" main
    trap 'git worktree remove --force "$wt" 2>/dev/null || true' EXIT
    # A file gone from here is deleted in the commit (a rename lists both names).
    for f in "${files[@]}"; do
      if [ -e "$f" ]; then mkdir -p "$wt/$(dirname "$f")"; cp "$f" "$wt/$f"; else git -C "$wt" rm -q --ignore-unmatch -- "$f"; fi
    done
    kept=(); for f in "${files[@]}"; do [ -e "$wt/$f" ] && kept+=("$f"); done
    [ ${#kept[@]} -eq 0 ] || git -C "$wt" add -A -- "${kept[@]}"   # deletions are staged by git rm above
    git -C "$wt" commit -q -F "$(cd "$(dirname '{{msgfile}}')" && pwd)/$(basename '{{msgfile}}')"
    for f in "${files[@]}"; do [ ! -e "$f" ] || cmp -s "$f" "$wt/$f" || { echo "🛑 $f changed while committing" >&2; exit 1; }; done
    # Test the commit itself too: checks that read `git ls-files` (no-names,
    # conflict markers) see a new file only once it is tracked. On 2026-10-11
    # an untracked test file passed here and then failed on main.
    (cd "$wt" && just test > /dev/null) || { echo "🛑 tests fail on the commit; main unchanged" >&2; exit 1; }
    git update-ref refs/heads/main "$(git -C "$wt" rev-parse HEAD)" "$old"
    git reset -q
    git push -q origin main
    git log --oneline -1 | cat
    echo "🚀 pushed: GitHub deploys it (.github/workflows/deploy.yml); read that run, then just live"

# (The new version is live by then, so a failure says that plainly.)
[doc("After a deploy: just cloud-smoke and just cloud-e2e against the live site; both run, even if one fails. just deploy runs it")]
deploy-checks:
    #!/usr/bin/env bash
    set -uo pipefail
    failed=""
    node tools/look.mjs cloud-smoke || failed="$failed cloud-smoke"
    # The two-device check sometimes times out loading the app right after a
    # deploy (twice on 2026-10-11, both passing on a rerun): one retry after a
    # pause, said out loud. A real fault fails both times.
    if ! node tools/look.mjs cloud-e2e; then
      echo "↻ cloud-e2e failed once; trying again in 15 s"
      sleep 15
      node tools/look.mjs cloud-e2e || failed="$failed cloud-e2e"
    fi
    if [ -n "$failed" ]; then
      echo "🛑 Deployed, but the live check failed:$failed. The new version is live; read the ❌ lines above (docs/deploy-cloudflare.md, \"Checks after a deploy\")." >&2
      exit 1
    fi
    # Each smoke run leaves a test share (shares are forever); clear them so
    # they don't pile up (24 had by 2026-10-11). Only p-smoke-/p-e2e- data.
    python3 tools/cloud_admin.py prune --smoke --yes > /dev/null 2>&1 || echo "⚠️ couldn't clear the checks' test shares; run: just cloud-prune --smoke --yes"
    echo "✅ live: cloud-smoke and cloud-e2e passed"

[doc("Wait until the live site serves the stamped web/version.json (Cloudflare's edge can lag an upload; 90 s), then check / answers. just deploy runs it")]
deploy-verify *flags:
    @"{{flarepress}}/tools/site.sh" "{{site}}" verify {{flags}}

[doc("What is live now: status, cache headers, the version, and whether it serves main's web/ and worker/ (read-only)")]
live:
    @"{{flarepress}}/tools/site.sh" "{{site}}" live

[doc("Roll back a bad deploy: prints the revert steps (never an old checkout: the Worker must match the live D1 tables)")]
rollback:
    @"{{flarepress}}/tools/site.sh" "{{site}}" rollback

[doc("The daily live check, here: /, /version.json and /api/cloud answer, and live serves main's web/ and worker/ (an hour's grace for a deploy in flight). GitHub runs it daily (.github/workflows/live.yml)")]
live-check *args:
    python3 tools/live_check.py {{args}}
