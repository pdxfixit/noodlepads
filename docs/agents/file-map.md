# Where things are

The map of the repo: every doc and folder, with what each holds. Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

## Where things are

| File | What it holds |
|---|---|
| [README.md](../../README.md) | The public front page: what it is, the live link, screenshots, run and test it, every `just` recipe ("Running it yourself"), the privacy statement. |
| [docs/privacy-policy.md](../privacy-policy.md) | The public privacy policy: this app's own sections, with the shared `@include` blocks. The privacy site (pdxfixit/privacy) keeps a copy: `just policy` puts it there once a change is on main. `web/privacy.js` and README's statement say the same, held by `tests/privacy.test.mjs`. |
| [docs/guide.md](../guide.md) | How the app works: every screen, how things are stored, cloud profiles, keyboard use, limits on what comes in. |
| [docs/layout.md](../layout.md) | The file map: one line per file in `web/`, `worker/` and `tools/`. |
| [docs/architecture/](../architecture/README.md) | How the code is wired: the shared engines, who calls whom, the record shapes that cross modules, the known seams, and "to change X, touch …". One file per area. |
| [docs/formats.md](../formats.md) | The backup format, field by field, for v2 (Android) to read with no JavaScript. Kept true with `web/backup.js` (`tests/formats-doc.test.mjs`). |
| [docs/state.md](../state.md) | Where things stand now. Present tense only. |
| [docs/decisions.md](../decisions.md) | Current rules, by topic: Rule · Why · Since. |
| [docs/council.md](../council.md) | The council: its 22 seats, when each convenes, how a round runs, its authority, the drift guards. The seats are `.claude/agents/council-*.md`. |
| [docs/adr/](../adr/README.md) | Why the biggest decisions were made. |
| [docs/questions.md](../questions.md) | Open questions for Ben, one card each. |
| [docs/design/give-way.md](../design/give-way.md) | The one order every bar gives way in as room runs out (tight, compact, words, doubles, fold). Read it before a bar gets a new key. |
| [docs/how-to.md](../how-to.md) | Step by step: where to run what, a bug fix, a stored-format change (every place to touch), docs, landing, deploy and rollback, logs, metrics, cloud admin. |
| [docs/deploy-cloudflare.md](../deploy-cloudflare.md) | Hosting: flarepress, the Worker, headers, rollback. |
| [CHANGELOG.md](../../CHANGELOG.md) | What each release has, for kids and parents. |
| [TODO.md](../../TODO.md) | The one to-do list: "Agents do" (approved work, in order, then work offered but not approved) and "Ben does" (decisions, recordings, steps only Ben can run). |
| `web/` | The app. Each module opens with a comment saying what it owns. |
| `tests/` | `node --test` suites. `fake-dom.mjs` builds the page from `index.html` so `app.test.mjs` runs the real app. |
| `tools/` | One line each in [docs/layout.md](../layout.md): `doctor.sh` (`just doctor`), `serve.py` (dev server, sends the live headers), `look.mjs` (`just look`, and the live checks), `cloud_admin.py` and `logs.py` (the cloud database and problem reports). `just --list` says what every recipe does. |
