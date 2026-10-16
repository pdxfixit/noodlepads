# Noodle Pads 🔊

A soundboard for kids: tap a pad to play a sound, record your own, make it
silly with a voice, and build beats and songs. Everyone in the family gets a
board of their own.

**Play it at https://noodlepads.com**, on a phone, a tablet or a computer.
Nothing to install, no accounts.

<p>
  <img src="docs/images/pads-phone.png" alt="The Pads screen on a phone: a New sound button, then the Drums presets as big colored pads" width="220">
  <img src="docs/images/beats-phone.png" alt="Beats on a phone: a groove loaded, with Play, the tempo and rows of pills" width="220">
</p>
<img src="docs/images/beats-wide.png" alt="Beats on a laptop screen: the Pop groove across four bars, one row per drum" width="700">

## What you can do

- **🔊 Pads:** tap to play, hold to loop (several at once); a scroll never plays one. Record a sound or add a file, then trim it, chop it into pads, or give it a voice: Chipmunk, Monster, Robot, Underwater and more, stacked and tweaked with knobs.
- **🥁 Beats:** tap pills on a grid. ⌨️ Keys plays sounds like a keyboard and records into the beat, 💃 Grooves gives 33 ready-made beats, 🎹 the piano roll writes tunes, and 🎚️ the mixer sets each row's loudness and effect.
- **🎼 Song:** line beats up in lanes, like a playlist, and play the whole song.
- **🎤 Live:** play the keys over a click track and keep each take.
- **🧸 Kids:** four picture screens for a five-year-old: big pads, a hold-to-record mic, a simple beat and toy keys.
- **☁️ The cloud:** each person's board follows them to any device, with an optional PIN. Share a sound, beat or song with a code.
- **💾 Backups:** save everything to one file and load it on any device.

Every part in detail: [docs/guide.md](docs/guide.md). What each release added: [CHANGELOG.md](CHANGELOG.md).

## Run it

Plain HTML, CSS and JavaScript modules: no build step and no dependencies.
You need [just](https://github.com/casey/just) and Python 3 to run it, and
Node.js for the tests.

```
git clone https://github.com/pdxfixit/noodlepads.git
cd noodlepads
just serve
```

Then open http://localhost:8765/. Run `just` in the repo's folder: from
anywhere else it finds a different justfile. `just serve` prints a Wi-Fi
address too, for a phone or tablet on the same network. Recording needs
https or `localhost` (browsers only allow the microphone there); the live
site is https, and `just phone <serial>` forwards the dev server to an
Android phone on adb (not yet tried on a real device).

Without a cloud behind it, the app says "The cloud isn't reachable from
here" and everything else works.

## Test

```
just test
```

A syntax check, then Node's built-in test runner; nothing to install. Judge
it by the exit code. The tests have no browser: `just look` checks every
screen width in a headless Chrome and saves screenshots.

## Running it yourself

Everything needed to keep Noodle Pads going has a `just` recipe, no agent
required. Run them in this repo's folder; `just` lists them all, and
`just doctor` checks this Mac first. Recipes that change the live site or
the cloud database show what they would do, or ask, before they do it.

| Task | Recipe |
|---|---|
| Is this Mac ready? | `just doctor` (tools, flarepress at `~/src/flarepress`, `~/.config/noodlepads/cloud.json`, the Keychain token) |
| Run it here | `just serve`; on an Android phone `just phone <serial>`, undone by `just phone-off <serial>` |
| Test | `just test` (judge by the exit code); `just stress` for a test that fails only sometimes |
| Look at every screen width | `just look` (`--wide` adds the big screens; `just look --help` lists views) |
| Deploy | GitHub deploys every push to `main` (`.github/workflows/deploy.yml`); from the Mac, `just deploy` (asks first). `just deploy-check`, `just deploy-plan` and `just deploy-migrated` change nothing |
| What is live, and roll back | `just live`; `just rollback` prints the steps; `just live-check` is the daily check |
| Check the live cloud | `just deploy-checks` runs `just cloud-smoke` and `just cloud-e2e` (each makes and deletes its own test profile) |
| Back up the cloud database | `just cloud-backup` (a `.sql` file in `~/.local/state/noodlepads/backups/`) |
| Look in the cloud database | `just cloud-profiles`, `just cloud-stats`, `just cloud-sql "SELECT …"`, or any wrangler command with `just cloud-db …` |
| Change the cloud database | `just cloud-migrate` (then `--yes`) before a deploy that needs it; `just cloud-prune` (then `--yes`); `just cloud-reset-pin <profile id>`; `just cloud-schema` for a new, empty database only |
| Bring problem reports and metrics home | `python3 ~/src/telemetry/telemetry.py pull`: the telemetry runner (pdxfixit/telemetry) harvests them, and this copies its store to `~/.local/state/telemetry/telemetry.sqlite3` |
| Problem reports | `just logs`, `--errors`, `--digest` read them from that copy |
| Move the old Mac archives into the runner (once) | `just runner-export all LOGS METRICS OUT` (both in the one file to import), `just runner-export check FILE` (docs/how-to.md, "Retire the old Mac archives") |
| Make sounds and emoji lists | `just placeholders`, `just emoji` |

Agents use the rest: `just ship`, `just land`, `just land-continue`,
`just archive-agent`, `just prove`, and the steps a deploy runs itself
(`just stamp`, `just deploy-verify`).

Deploying uses [flarepress](https://github.com/pdxfixit/flarepress) and the site
folder `site/`: [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

## Docs

| Doc | What it holds |
|---|---|
| [docs/guide.md](docs/guide.md) | How the app works: every screen, and how sounds, beats and songs are stored |
| [docs/layout.md](docs/layout.md) | The file map |
| [AGENTS.md](AGENTS.md) | How to work on this repo, for people and coding agents: start, verify, ship, the rules |
| [docs/how-to.md](docs/how-to.md) | Step by step: a bug fix, a stored-format change, landing, deploy and rollback |
| [docs/decisions.md](docs/decisions.md) | Every rule decided so far, and why |
| [docs/adr/](docs/adr/README.md) | Why the biggest decisions were made |
| [CHANGELOG.md](CHANGELOG.md) | What each release has |

## Privacy

The same words are first in ⚙️ Settings and in Help
(`web/privacy.js`; `tests/privacy.test.mjs` keeps all three the same and ties
the claims to the code).

**🔓 What's private (not much)**

- Everyone on this device goes to the cloud once they make something, unless they are set 📴 Offline (this device only).
- In the cloud, Cloudflare stores for noodlepads.com: each profile's fun name, avatar and color, their sounds, beats, songs and settings, and the names you give them.
- Anyone who opens noodlepads.com sees the list of profiles (fun names and avatars only). Everyone in the cloud is in that list.
- Anyone who has a sound's link can play it. The links are long and random, but they are not secret.
- Anyone with a share code can see and play what was shared, even after its profile is deleted, until the sharer taps 🚫 Unshare. Remixes others made of it stay theirs. Removing it from Shared with me only takes it off your list.
- A PIN is not security. It only stops someone opening or changing a profile in the app.
- The app collects no real names, emails or accounts. Profile names are made up by the app; nobody types one.
- To see how the app is used, the cloud also keeps for 14 days, for people in the cloud: when and how often each profile is opened and synced; how often each part of the app is used (counts only); how long each visit lasts, which screens it shows, how fast the app loaded, the sound's delay, and where in the app any error happened; and the country each visit came from, and no finer place. Each device's type, browser and app version are kept 90 days. The internet address is not kept. All of it is copied to the app maker's own computer first, and kept there.
- Each device where someone is in the cloud also sends noodlepads.com how the app is used: which screens, buttons and settings are used, when beats, songs and takes start and stop, errors, and how fast the app loads, with a random number for this device (not a profile), the app version and the kind of device. Never sounds, names or anything typed. It is copied to the app maker's own computer and kept there.
- People set 📴 Offline stay on this device only.
- Problem reports, if you turn them on, send this device's cleaned event log (no sounds and no names), its settings, how many sounds, beats and songs it has, its browser, system and device type (never the full browser string), its screen size, time zone and sound timing, and a random code for this device. They are deleted from the cloud after 14 days.
- To delete a profile and everything in it: 👥 People, tap them, ☁️ Cloud, then 📴 Offline (this device only), and its PIN if it has one. It is gone from the cloud at once, except what it shared; this device keeps its own copy.

The full policy, shared by every pdxfixit app: [Privacy policy](https://privacy.pdxfixit.com/noodlepads/).

## License

[MIT](LICENSE).
