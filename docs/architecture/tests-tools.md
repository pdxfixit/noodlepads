# Tests, tools and shipping

How the tests start the real app, what the stand-ins fake and where they lie,
which tests guard the whole repo, how `just look` and the live checks drive a
real Chrome, and how a commit becomes a labelled deploy. AGENTS.md "Verify"
and "Ship" give the rules; this is the wiring under them.

**In one paragraph.** `just test` runs `node --check` on `web/`, `worker/` and `tools/*.mjs`,
then `node --test` (every `*.test.mjs`, one process per file), then the
Python tools' unittest. 71 test files start the real `app.js` on a stand-in
page built from `index.html` (`fake-dom.mjs installPage`), with no browser,
no sound, no layout and, unless a test seeds one, no IndexedDB. Cloud tests
route `fetch('/api/…')` straight into the real Worker (`worker/index.js`) on
Node's own SQLite (`fake-d1.mjs FakeD1`). `just look` is the only place the
app runs in a browser before it ships: a private headless Chrome per run, on
its own `serve.py` port. GitHub runs `just test` and the release checks on
every push, and deploys every push to `main` through flarepress, which stamps
version.json as `v<RELEASE>-<short commit>` from `web/version.js`.

## The layers

| Layer | Files | Runs on | Checks |
|---|---|---|---|
| Pure modules | most `tests/*.test.mjs` | Node, imports `web/*.js` directly | logic, data shapes, cleaners |
| The real app on a stand-in page | 71 test files (`installPage` + `import('../web/app.js')`) | Node + `fake-dom.mjs` | wiring, rendering, flows, stored records |
| The real Worker | `worker*.test.mjs`, `metrics`, `events-route`, `feedback-route`, `privacy`, cloud app tests | Node + `fake-d1.mjs`, `new Request` | routes, SQL against `worker/schema.sql` |
| Whole-repo guards | `no-names`, `docs`, `offline`, `modules`, `help`, `log-clean`, `migrations`… (below) | Node, reading files or `git ls-files` | rules every change must keep |
| Tools | `tools/test_*.py`, `skills/noodlepads-logs/test_gate.py` | `python3 -m unittest` | the tools, and generated files in `web/` |
| A real browser | `look.mjs` (`just look`) | headless Chrome + `serve.py` | widths, errors, CSP, 44 px, overlaps, screenshots |
| The live site | `look-cloud.mjs` (`just cloud-smoke`, `just cloud-e2e`), `live_check.py` | noodlepads.com | after a deploy; daily |

## How a test starts the real app

Every app test follows the same four steps (see `tooltips.test.mjs` for the
shortest, `delete-shown.test.mjs` for the fullest):

1. Optional: `globalThis.indexedDB = fakeIndexedDB()` seeded with
   `idb.seed(DB_NAME, DB_VERSION, SCHEMA, {store: [records]})` (all three from
   `store.js`), for "a device that already has data".
2. `page = installPage({ manifest: testManifest() })`. This sets every page
   global (below) and builds the DOM from `web/index.html`.
3. Optional: replace `globalThis.fetch` with a router that sends `/api/…` to
   `worker.fetch(new Request('https://noodlepads.com' + url, …), env)` with
   `env = { DB: new FakeD1(), ASSETS: … }` and the `Origin` header set to
   `http.js ORIGIN`, and everything else to the page's own fetch.
4. `await (await import('../web/app.js')).ready`, then `await page.settle()`.
   `app.js ready` is the promise of `start()`: the manifest loaded, storage
   opened (or failed), every screen built and wired.
   `app-ready.test.mjs` fails any file that imports `app.js` without awaiting
   `ready` (a bare `settle()` lost the race under load, 2026-10-12).

After that a test drives the page by `el.dispatch('click')`, `page.key(…)`
(a keydown to the document's listeners), `page.docEvent`, `page.winEvent`,
and reads `$(selector)` and the app's own module state (`state.js state`,
`settings.js getSetting`, `audio.js audio`).

**One app per file.** Node's test runner runs each file in its own process,
so `app.js` starts once per file. Every test in a file shares that app and
runs in order: a test inherits the screen, the person, the open beat and
the remembered keys the previous test left. `app.test.mjs` (72 tests) is one
long session. A test that turns something on that is remembered (⌨️ Keys,
a level) turns it off before it ends (`new-beat.mjs keysOff`; the Kids test in
`startup-remembered.test.mjs` sets the level back to regular).

### `installPage` options

| Option | Default | What it does | Used by |
|---|---|---|---|
| `manifest` | the real `web/boards.json` | served as `boards.json` | `testManifest()` in most files; the real one (no people: a new device) in `fresh-start`, `welcome`, `welcome-cloud`, `tips`, `nudge`, `kids-hints` and a few more |
| `storage` | none | becomes `globalThis.localStorage` (a test's own `getItem`/`setItem`/`removeItem` map) | `startup-remembered`, `backdrop`, `touch-play`, `touch-edit`, `touch-grid-edit` |
| `hash` | `''` | `location.hash`, the person the address names | tests with a person on show by id |
| `firstSteps` | `false` | sets `globalThis.noodleFirstSteps`, the hook `firsts.js firstStepsOn` reads; off means no welcome, tips, hint dots, 🧸 hand or nudge (ADR 0028) | `welcome`, `welcome-existing`, `welcome-cloud`, `tips`, `nudge`, `kids-hints` |

`installPage` returns `$`, `body`, `fetched` (every URL the page's own fetch
saw), `key`, `docEvent`, `winEvent` and `settle`.

### The stand-in page (`fake-dom.mjs`)

What it provides, and how it differs from a browser. AGENTS.md "Verify"
lists the traps agents hit; this table is the whole surface.

| Global | The stand-in | Not there, or different |
|---|---|---|
| `document` | `FakeElement` tree parsed from `index.html` (comments, `<script>` and `<noscript>` dropped); `createElement`, `querySelector(All)`, `addEventListener` | no `removeEventListener` on `document`; no `MutationObserver`, `ResizeObserver`, `IntersectionObserver` (every `web/` use is guarded by `typeof`; `tooltips.test.mjs` calls `tooltips.js addTips` by hand) |
| Selectors | tag, `#id`, `.class`, `[attr]`, `[attr="v"]`, `:not(…)`, descendant (space), lists (`a, b`) | `[attr$=…]`, `[attr^=…]`, `:has()`, `>` and other pseudo-classes are silently ignored or mis-read: `[data-id$="-kick"]` matches the first element of the scope; `>` acts as a descendant; `:has(x)` demands the element itself match `x` |
| `querySelectorAll` | a `nodeList` that throws on array methods (`map`, `filter`, `indexOf`…) when called from a `web/` file, as a real NodeList would | tests may still use array methods on the result |
| Elements | attributes, `dataset` (synced both ways), `classList`, `hidden`/`disabled`/`open` as attributes, `style.props` via `setProperty` | no layout: `getBoundingClientRect` is all zeros, `clientWidth` undefined unless a test sets it; `textContent` is a plain field (a parent's is not its children's text; nested spans on one line of `index.html` read `''`); `removeEventListener` does nothing, so removed handlers still fire |
| Events | `dispatch(type, props)` runs the element's listeners, then its ancestors' (bubbling, `stopPropagation`); no capture phase | `el.click()` sends `detail: 0` (a keyboard click), `el.dispatch('click')` sends `detail: 1` (a pointer click). `pads.js`, `dj.js`, `chop.js`, `pill-select.js`, `sequencer.js` and `track-page.js` branch on `e.detail === 0`, so the two are not the same tap |
| Dialogs | `showModal()` sets `open`; `close()` clears it and fires `close` at once | a browser fires `close` later, as its own task (AGENTS.md: patch `close` to dispatch in a `setTimeout`, as `profile-sheet.test.mjs` does) |
| `window` | `isSecureContext`, a silent `AudioContext` (gain, compressor, analyser, oscillator, `currentTime` a test may set), `addEventListener`/`removeEventListener` | no `createBufferSource`, no `decodeAudioData`: a clip never decodes, so tests that play replace `audio.start`, `audio.stop` or `audio.decode` |
| `fetch` | `boards.json` from `manifest`; everything else 404 (version.json too, so the app is a "dev copy"; `tests/test-board.mjs` sounds point at `clips/test/*.wav`, which never load) | `console.error` is silenced by most app tests for those failures, so an app error is silent too |
| `navigator` | `{}` | no `mediaDevices` (Record off), no `serviceWorker`, no `sendBeacon` |
| `location` | `{ hash }` | no `hostname`: `log-send.js` and `feedback.js` never send (they check for the live host); `log-send-app.test.mjs` sets one to pretend |
| Others | `matchMedia` always `{ matches: false }`; `requestAnimationFrame` returns 1 and never calls back; `CSS.escape`, `CSS.supports` (colors only); `history.replaceState` writes the hash | rAF work never runs: `beat-bar-refit.test.mjs` runs the frames by hand |

### `settle()`: work in flight

`settle()` waits for "nothing in flight for 20 ms", polled every 4 ms, and
fails after 10 s naming what was still pending. `installPage` wraps the
globals to count work (the "Work in flight" comment in `fake-dom.mjs`):

| Counted (waited for) | Not counted (the test waits itself) |
|---|---|
| every `fetch` until it settles, whatever function a test puts in `globalThis.fetch` later (a setter wraps it) | `setInterval` work: the sequencer's tick, update checks, the recording count |
| `crypto.subtle` calls (a PIN's PBKDF2) | any timer set while an interval's callback runs |
| one-shot timers due within 20 ms | the app's own timers due later than 20 ms: a hold, a fade, an Undo offer, a notice hiding |
| any timer set from a `tests/fake-*.mjs` file, whatever its delay | a timer set by a stand-in written inside a test file |

So a new stand-in with slow timers belongs in a `tests/fake-*.mjs` file, or
`settle()` will not wait for it. A new kind of off-thread work in the app (a
Worker, a decode) needs its own line in the wrapper. docs/how-to.md "Flaky
tests" has the reproduce-under-load steps (`just stress`).

### Fake IndexedDB (`fake-idb.mjs`)

`fakeIndexedDB()` gives `open(name, version)` (an `onupgradeneeded` with
`oldVersion`, then `onsuccess`), `transaction(names, mode)`, and on a store
only `put`, `delete` and `getAll`. Requests run when the transaction commits,
on a `setTimeout`, all or nothing. Test helpers: `seed`, `rows(name, store)`,
`failCommit(n)` (the next n commits abort, as a full disk would) and
`databases()`. Not there: `get`, `count`, `clear`, cursors, indexes,
`deleteDatabase` (throws). `store.js` uses only what is there; a new store.js
call outside that list breaks every seeded test until the fake learns it.

Three more IndexedDB stand-ins live inside test files: `store.test.mjs`
(records the stores an upgrade creates; an open finished by hand),
`storage-wait.test.mjs` (`slowIndexedDB`, a database another tab holds) and
`holds.test.mjs` (an older copy's databases for 💾 Save everything).

### Fake D1 (`fake-d1.mjs`)

`new FakeD1()` is an in-memory `node:sqlite` database built from
`worker/schema.sql`, with D1's `prepare().bind().first()/all()/run()`,
`batch()` (one transaction) and `exec()`. It refuses `undefined` as a bound
value (as D1 does), turns booleans into 0/1, and `fail = 'message'` makes
every query throw (a used-up daily limit). `queries` lists every SQL run;
`rows(sql)` reads one straight. It needs Node with `node:sqlite` (CI pins
Node 26.11.1). `migrations.test.mjs` does not use it: it builds two raw
`DatabaseSync`s, one from `tests/schema-before-001.sql` plus every migration,
one from `schema.sql`, and compares their shape.

### The other helpers

| File | What it gives | Used for |
|---|---|---|
| `test-board.mjs` | `TEST_PEOPLE` (Pip, Juno, Toby, Wren, made up, four sounds each) and `testManifest()`, a fresh copy of the real kit and palette plus them | almost every app test; the real `boards.json` lists no people |
| `new-beat.mjs` | `newBeatWithRow` (🆕 New, + Add a row, 💾 Keep), `keysOn`/`keysOff`, `newBuilderBeatWithRow` (records one key on ⌨️ Keys by moving `audio.context().currentTime` past the count-in, then puts it back) | any test that needs a named beat with a row |
| `song-ui.mjs` | the 🎼 Song strip and lanes: `pickBeat`, `dropBeat`, `blocksOn` (reads `--at`/`--len` from `style.props`) | `app.test.mjs`, Song tests |
| `banner.mjs` | `bannerShown`, `hasUndo` (the banner shows and its action is not hidden), `stubBanner` for a module run without a page | Undo checks; `settings.test.mjs` |
| `helpers.mjs` | `buildZip` (zips our own `zip.js` would never write: deflated, lying sizes), `fakeBuffer`, `FakeAudioBuffer`, `FakeOfflineAudioContext` (renders silence of the right length; checks wiring), `failure` | backups, voices, chop, sheet |
| `listen-synth.mjs` | seeded made-up songs (drums, bass, pad, hiss) with their true hits, and `feedAll` | `listen.test.mjs` |
| `schema-before-001.sql` | the live D1 schema before migration 001 | `migrations.test.mjs` |

## Whole-repo guards

These tests fail on changes far from the code they sit beside. Each row says
what it forces an agent to do.

| Guard | What it checks | When it fails, do this |
|---|---|---|
| `offline.test.mjs` | every file under `web/` (dot files skipped) is in `sw.js SHELL` or in its own `NOT_LOADED` map, and nothing in `SHELL` is missing; then runs `sw.js` in a `vm` on stand-in caches | add a new `web/` file to `SHELL`, or to `NOT_LOADED` with why |
| `modules.test.mjs` | every `web/*.js` but `app.js` and `sw.js` imports in Node with no page; every named import exists in its file; no import cycles; no `https:` imports; every `$('#id')`/`querySelector('#id')` id is in `index.html`; `index.html` loads only `app.js` and has no inline handlers or styles | keep module tops free of `document`/`window`; add the id to `index.html`; break the cycle |
| `app-ready.test.mjs` | no test imports `app.js` without awaiting `ready` | write `await (await import('../web/app.js')).ready` |
| `help.test.mjs` | every toolbar `data-screen` has a Help part in order; every label in its hand list `MUST_MENTION` is in the app's text (`index.html` and every `web/*.js` but `help.js`) and in Help; every label `help.js HELP` draws is in the app's text | add the control's label to `MUST_MENTION` and a Help line; rename both when a label changes |
| `tooltips.test.mjs` | every button in the started app has a `title` once `addTips` runs | give an icon-only control an `aria-label` |
| `log-clean.test.mjs` | every `logEvent('kind', { … })` in `web/` has a rule in `log-clean.js RULES` for the kind and each top-level field; the report's fixed lists equal `VOICES`, `KINDS`, `SIGNATURES` and every listed setting (a setting with no `values` must be `quiet`) | add the rule (free text only through `text`) |
| `worker-clean.test.mjs` | `worker/clean.js` (which imports `log-clean.js cleanPayload`) stores a report the app builds unchanged; its kit ids are `boards.json`'s | nothing by hand: the Worker shares the app's rules |
| `telemetry.test.mjs` | the shared client's record shape; and, only when `../telemetry/events.toml` sits beside the checkout, every `telemetry.js EVENTS` event and key is listed there for `noodlepads` | add the event to `EVENTS` and to pdxfixit/telemetry; run `just test` in the main checkout (a worktree skips it) |
| `track-page.test.mjs` | where usage events come from, and that a kid's own words never reach one | a new `content.finish` kind or control name |
| `migrations.test.mjs` | `schema-before-001.sql` + every `worker/migrations/NNN-*.sql` equals `worker/schema.sql` (tables, columns, indexes), each migration records itself in `migrations`, and `schema.sql` lists them all as applied | a schema change is a new migration plus the full `schema.sql`, in one commit |
| `startup-remembered.test.mjs` | the app starts, on the right screen, with every remembered `localStorage` key set (old and junk values too) | add the new key to its `remembered` map (by convention: nothing checks the map is complete) |
| `no-names.test.mjs` | no tracked file or path holds a kid's name (known only as SHA-256 hashes; one is an everyday word caught only when capitalized or written as an id) | use Pip, Juno, Toby, Wren or "a kid" |
| `no-plain-email.test.mjs` | no tracked file holds a plain email address (a GitHub no-reply and the co-author line are allowed); the PIN-reset address comes from `contact.js` | never write an address out |
| `conflict-markers.test.mjs` | no tracked text file holds `<<<<`, `>>>>` or `\|\|\|\|\|\|\|` at a line start | finish the merge |
| `docs.test.mjs` | every relative Markdown link in AGENTS.md, CLAUDE.md, README.md, TODO.md, `docs/*.md`, `docs/adr`, `docs/design`, `docs/architecture` and `docs/architecture` resolves; every backticked file AGENTS.md and how-to name exists (bar the deploy's `version.json` and flarepress's tools); every ADR is in the index, with a number of its own; CLAUDE.md starts `@AGENTS.md`; the problem-report design doc matches `worker/reports.js` | renumber a clashing ADR; fix the link |
| `architecture.test.mjs` | (since `22b41aa`; the first test is TODO until the area files land) every `web/` and `worker/` module is named in `docs/architecture/`; every backticked file and every backticked "file.js name" pair it cites exists; the ✅ claims (one AudioContext, the offline renders, the recorders, the schedulers) | update `docs/architecture/` in the same commit |
| `question-cards.test.mjs` | every card in docs/questions.md has its own number | renumber |
| `justfile.test.mjs` | every public recipe has a `just --list` line that does not start mid-sentence; every recipe is named in AGENTS.md, README.md, how-to, deploy-cloudflare or layout; every `just <recipe>` that AGENTS.md, README.md, TODO.md, `docs/*.md` and `docs/architecture/` name exists (`ELSEWHERE` lists other repos' recipes); every tool in `tools/` is named there; deploy runs flarepress's check, stamp and verify; `site.conf committed=` holds web, worker and site; `wrangler.toml` holds no ids; deploy.yml runs the tests and the release checks before the action and the live checks after | document the recipe or tool; fix a doc that names a gone recipe |
| `tools/test_justfile.py` | every recipe has a doc; README "Running it yourself" names exactly the recipes; `test-quiet` prints only the failures and keeps the log | add the recipe to README |
| `tools/test_node_tests.py`, `unended-reporter.test.mjs` | a file a cut run left a test unreported in runs again alone, and fails the run when it fails there; a "▶" with no file named fails | — |
| `headers.test.mjs` | `web/_headers`: the CSP closed by default, no inline or eval, no outside origin but Cloudflare's beacon, fonts only from `web/fonts/`, microphone and screen share for this site | change the CSP line on purpose |
| `colors.test.mjs`, `contrast.test.mjs` | 4.5:1 for the pairs they list, with colors read from `styles.css` tokens, `boards.json` and `model.js` | a new pair needs a new line: a new color nobody lists is not checked |
| `css-braces.test.mjs` | every `{` in `styles.css` has its `}` | fix the brace |
| `privacy.test.mjs` | README carries `privacy.js`'s lines word for word, and each claim against the Worker and the code | change `privacy.js` with any change to what the cloud keeps |
| `tools/test_preset_loudness.py` | `boards.json` `level`s equal what `preset_loudness.py` works out | `just preset-loudness --fix` |
| `tools/test_kit_instruments.py` | `boards.json` holds exactly the instrument presets `kit_instruments.py` writes | rerun the tool |
| `tools/test_make_emoji.py` | `web/emoji-all.js` and `web/emoji-check.js` equal what `make_emoji.py` makes | `just emoji`, never a hand edit |
| `tools/test_make_placeholders.py` | the tool knows every preset in `boards.json` | add the sound to the tool |
| `tools/test_bump_version.py` | the release rules, and the scripts on a throwaway repo | — |

Three guards read `git ls-files` (`no-names`, `no-plain-email`,
`conflict-markers`), so an untracked new file passes them until it is
committed. `just ship` runs the tests a second time on the commit in its
throwaway worktree for that reason.

## Every other test file

Grouped by what they guard. Files marked ▶ start the real app. A few call `installPage` only for its globals and never start the app (`beat-row`, `row-buttons`, `lines`).

| Area | Files |
|---|---|
| Pads and Edit sounds | `model` (60: people, clip order, edits, presets), ▶`app` (people, Edit sounds, Beats, Live, Song, the open beat: one long session), ▶`bulk` (several sounds chosen), ▶`finger` (a scroll never plays; `finger.js`), ▶`pad-group-head`, `pad-badges` (CSS as text), `pad-size`, `groups`, `kinds` (`model.js KIND_EMOJI`, counts), ▶`people-menu`, `person-colors`, ▶`skins`, ▶`shift-holds`, ▶`space-stops`, ▶`stop-clicks` |
| The sound sheet | ▶`sound-sheet` (52: Plain, the chain, Surprise me), ▶`recording` (a stand-in microphone), ▶`chop`, `cuts`, `wave-edits`, `loudness`, `tweaks`, `layers`, `voice-knobs`, `voices`, `steps`, `stretch`, `mix`, `pitch`, `synth`, `sheet-folds`, ▶`emoji-more` |
| 🥁 Beats | `sequencer` (`cleanPattern`), `beat-edit`, `row-tempo` (the hit timetable), `overlap`, `tune-rows`, `notes`, `slide`, `grooves`, `beat-row`, ▶`beat-rows-left`, `row-buttons`, ▶`row-handle`, ▶`row-volume`, ▶`add-rows`, ▶`beat-chips`, `beat-pins`, ▶`beat-bar`, ▶`beat-bar-refit`, ▶`mini-deck`, `edge-scroll`, ▶`pill-select`, ▶`mixer`, ▶`roll`, `follow`, ▶`new-scratch`, ▶`scratch`, ▶`dj-grooves`, `overflow`, `lines` |
| ⌨️ Keys and 🎤 Live | `rhythm`, `keyset`, `beat-builder` (tempo and bars while recording, pure), ▶`keys-playhead`, ▶`rec-empty-rows`, ▶`beat-rec-stop`, `key-stagger`, `dj-footer`, ▶`touch-play`, ▶`touch-edit`, `touch`, `touch-grid`, ▶`touch-grid-edit`, ▶`slim-edit`, `slim-head` |
| 🎹 Instruments | `instruments` (notes checked by `pitch.js findNote`), ▶`inst-picker`, ▶`inst-everywhere` |
| 🎼 Song | `song`, `playlist`, `tempo-marks`, ▶`song-tempo-ui` |
| 🎧 From a song | `listen` (on `listen-synth.mjs`), `listen-make`, `listen-input` (stand-in capture, decoder and worklet scope), ▶`listen-ui` (through `listen-ui.js listenEnv`) |
| 🧸 Kids and levels | ▶`kids` (37), ▶`kids-hints`, `levels` |
| First steps (ADR 0028) | ▶`welcome`, ▶`welcome-existing`, ▶`welcome-cloud`, ▶`tips`, ▶`nudge`, ▶`who-now` |
| Storage and backups | `store`, `storage-wait`, `backup` (54), `zip`, `merge`, `merge3`, `holds`, ▶`leftover`, `old-device`, ▶`older-stores`, `adopt-people`, ▶`new-ids`, ▶`load-who`, ▶`delete-leftover`, ▶`fresh-start` (the real `boards.json`) |
| ☁️ Cloud and PINs | `cloud-sync` (two or three devices of plain arrays, through the real Worker), `sync-timing`, ▶`cloud-ui`, ▶`pin-gate`, ▶`pin-new`, `pin-wrong`, ▶`profile-sheet`, ▶`delete-cloud`, ▶`delete-shown`, ▶`delete-third-wait`, ▶`see-all` |
| The Worker | `worker` (routing, `/api/log`), `worker-cloud`, `metrics`, `events-route` (also: the vendored `events-worker.js` still hashes to its recorded sha256), `feedback-route` |
| Reports, usage, feedback | `log`, `log-send`, ▶`log-send-app`, `agent`, ▶`telemetry-app`, ▶`feedback` |
| Page chrome | `audio` (trim, loops), `util`, `names`, ▶`backdrop`, ▶`banner`, ▶`four-tabs`, ▶`settings-menu`, `settings`, `update`, ▶`update-app`, `help-narrow`, `wide-screens` (CSS as text), ▶`help`, ▶`tooltips` |

## The justfile

Three kinds of recipe. AGENTS.md says who may run which; README "Running it
yourself" lists them all.

| Kind | Recipes | Runs |
|---|---|---|
| Dev | `test`, `test-quiet` (private), `stress`, `prove`, `look`, `serve`, `doctor`, `phone`, `phone-off`, `version`, `emoji`, `placeholders`, `preset-loudness` | local tools only |
| Landing | `ship`, `land`, `land-continue`, `archive-agent` | git; `land` execs flarepress's land.sh, found at `$FLAREPRESS`, the checkout beside this one, or a clone in `~/.cache/flarepress` |
| Cloud and deploy (Ben's) | `cloud-db` (any wrangler d1 command), `cloud-sql`, `cloud-schema`, `cloud-migrate`, `cloud-profiles`, `cloud-stats`, `cloud-prune`, `cloud-reset-pin`, `cloud-backup`, `logs`, `runner-export`, `deploy-check`, `deploy-plan`, `stamp`, `deploy`, `deploy-verify`, `live`, `rollback`; plus `cloud-smoke`, `cloud-e2e`, `deploy-checks`, `live-check`, which need no token | `flarepress := $FLAREPRESS or ~/src/flarepress`; the `ids` line fills `D1_DATABASE_ID` from `cloud_config.py --exports` when it is not set |

`just test` checks the syntax of `web/*.js`, `worker/*.js` and `tools/*.mjs`.
No test imports `look.mjs`, `chrome.mjs` or `look-cloud.mjs`
(`overflow.test.mjs` only reads `look.mjs` as text), so a `look.mjs` that
parses but breaks shows first when someone runs it.

The Node tests run through `node_tests.sh`: the spec reporter to the screen,
and `tests/unended-reporter.mjs` to a file, listing the test files with a
started test whose end never came (`--test-force-exit` cut it). Each such
file runs again alone, and its exit code counts; a "▶" with no file named
fails the run.

## `just look`

`look.mjs` (the CLI), `chrome.mjs` (Chrome and the DevTools protocol over
Node's own WebSocket) and `look-cloud.mjs` (the live checks) are the only
Node tools. `look.mjs` imports `backdrop.js BACKDROPS` and `skins.js SKIN_IDS`
to check `--bg` and `--skin`.

**A run, step by step.**

1. Parse options; with no view, `pads`. No Chrome at `chrome.mjs CHROME`
   ($CHROME, the Mac's, else a cloud session's `/opt/pw-browsers/chromium`)
   stops it.
2. Start `serve.py` on a free port (unless `--url`) and wait for it.
3. `launchChrome`: headless, a throwaway profile, `--no-sandbox` as root.
   One profile for the whole run, so every width and view shares
   `localStorage` and IndexedDB.
4. For each view × width × `--bg` × `--skin` (`lookOnce`): set the window
   (`mobile` under 768 px), add `noodleFirstSteps` before the page's scripts
   (true only for a view with `firstSteps`), navigate (with `?bg=`), wait
   400 ms; set the level back to Regular unless the view is a Kids one; set
   `padSkin` and `advancedBeats` if asked; click the view's screen tab; on
   Beats set ⌨️ Keys to the view's `keys`; wait 150 ms, run the view's `js`,
   then `--js`; wait 400 ms; run `MEASURE`; scroll or grow the window to the
   page's height (up to 8000 px); screenshot.
5. A width whose errors were a load failure (`net::ERR_`, "Failed to load
   resource") is retried once, and the report says so.
6. Print the table, then each failing row's reasons and every `console.log`
   (📝); exit 1 on any failure.

**What `MEASURE` fails.** Page wider than the width asked; an open dialog
wider than itself; controls (`button`, `[role=button]`, `summary`, `select`,
range, checkbox and radio, a checkbox measured by its label) under 44 px
tall **or wide**; two controls in the same fixed or sticky layer overlapping
by more than 2 px both ways; console errors and exceptions; CSP blocks; and
zero controls found ("the page did not render"). Only the top modal dialog is
measured when one is open. Exempt by design: the `exempt` selector in
`MEASURE` (pills, piano roll cells and notes, the keys view's row tools,
`.ke-key`). A new control that is small on purpose needs its selector there,
with the decision it rests on.

**A view** is one entry in `look.mjs VIEWS`:

| Field | Meaning |
|---|---|
| `screen` | `pads`, `beats`, `song` or `live`: the tab clicked first |
| `js` | an async script run in the page; it may `await import('/state.js')` and the other modules, the same instances the app uses |
| `keys` | on Beats: ⌨️ Keys on (`true`) or off; set before `js` |
| `firstSteps` | the welcome, tips, dots and nudge on |
| `kids` | keep the 🧸 Kids level (others reset it to Regular) |
| `from` | the narrowest width it exists at (`keys`, `keys-inst`, `keys-layout`, `keys-picked` from 700); narrower widths are skipped and said |
| `still` | screenshot the 800 px window as the script left it (a popover a scroll would close) |
| `page` | open that page of the site instead of the app (no view uses it today) |

Built after the table: `kids-pads`, `kids-record`, `kids-beats`,
`kids-keys`, `kids-mine`, `kids-sum`, `kids-hand`; one view per screen
(`pads`, `beats`, `song`, `live`); `keys-on`; `help-pads` … `help-settings`;
the aliases `dj` (Live) and `beat`.

**To add a view:** add the entry with a comment above it saying what it
shows; write `js` to set a state, never to toggle one (each width reloads
the page but keeps storage: open a group only if `aria-expanded` is not
`"true"`); use the shared snippets (`q`, `nap`, `OPEN_KIT`,
`GROOVE_GROUPS_OPEN`, `MINE`, `OWN_SOUND`, `PLAYLIST`, `LISTEN_FAKE`,
`PIN_LINK`); run `just look <view> --wide`. Nothing tests the views, and no
test checks that the view names the docs cite still exist.

**What a view reaches into.** Views and `look-cloud.mjs` call app internals
by string: module exports (`pads.js renderPads`, `pads.js ownClosed`,
`welcome.js offerWelcome`, `nudge.js nudgeTick`, `people.js addPerson`,
`who-now.js openWhoNow`, `cloud-ui.js askPin`, `listen-ui.js listenEnv`,
`cloud.js syncAll`, `cloud.js syncNow`, `cloud.js statusOf`, `store.js db`…),
`state.js state` fields (`userClips`, `orders`, `savedBeats`, `peopleEdits`,
`cloud`, `takes`, `layouts`, `songbook`) and dozens of ids and `data-`
attributes. `modules.test.mjs` checks only `web/*.js`, so a rename in `web/`
breaks a view (as "script failed: …") or the live e2e check without any test
going red.

## The live checks (`look-cloud.mjs`)

Both make one throwaway profile and delete it in a `finally`; a run killed
before that leaves it for `just cloud-prune --smoke --yes`.

- **`cloud-smoke`** (Node only): through `cloud-api.js createCloudApi` with
  the site's `Origin`, against the live `/api`: hello, create with a PIN,
  a wrong PIN refused (401), open, push a beat record, pull it, upload a
  sound over one piece (`cloud-sync.js uploadAudio`, `CHUNK_BYTES` + 54321
  bytes, so two pieces) and ask again (nothing needed), read it back byte for
  byte, share, read the share with no key or Origin, the list shows it,
  delete (wrong PIN refused first), then gone: not listed, 404 on open and on
  its sound, the share still there.
- **`cloud-e2e`**: two browser contexts (separate IndexedDB) in one headless
  Chrome on the live site. Each waits for `state.manifest`, `store.js db`
  handle and a drawn pad, then runs the start-up `syncAll`. A makes a person,
  a beat and a WAV sound and syncs; B opens the profile from the ☁️ list
  (`#settings-open` → `#people-open` → `#cloud-browse`) and must have the name,
  the beat and the sound's exact bytes; B rerolls the name through the
  profile's 🎲 and renames the beat; A syncs and must have both, the beat
  edited in place. Cleanup deletes every profile either device put in the
  cloud. On a failure it prints each device's `/api/` calls and its log's
  cloud, error and warn entries.

`just deploy-checks` runs smoke, then e2e with one retry after 15 s, then
`cloud_admin.py prune --smoke --yes` with its output thrown away (on CI the
token is D1 read only by docs/deploy-cloudflare.md, so that prune likely
cannot delete there: unverified).

## Version stamping

**The release** is `web/version.js RELEASE`, `MAJOR.MINOR.PATCH`, where PATCH
is the commit count of the commit that set it. The page never loads this
file (`offline.test.mjs NOT_LOADED`); the deploy reads it.

| Step | Who | What |
|---|---|---|
| 1. Bump | `just version` → `bump_version.py` | PATCH = `git rev-list --count HEAD` + 1 (in a merge, HEAD and MERGE_HEAD), so it is right for the next commit; `minor`/`major` bump those; refuses a shallow clone and a release that would go down |
| 2. Commit | the agent | `web/version.js` in the same commit as the `web/` change |
| 3. Ship | `just ship` | in its worktree, after the commit: `version_bumped.sh` (no `web/` change since the last commit that touched `web/version.js`) and `bump_version.py --check` (the committed PATCH equals that commit's count) |
| 4. Land | `just land` (land.conf) | `test=just test-quiet && tools/version_bumped.sh`; `after_pick=python3 tools/bump_version.py --restamp`: for a picked commit that sets `web/version.js`, PATCH becomes its new count on the newer main, amended into the commit |
| 5. CI | `test.yml` | `just test`, then `version_bumped.sh`, then `bump_version.py --check` |
| 6. Stamp | flarepress's site.sh `stamp` in the deploy | writes version.json into `web/`: `{"version":"v<release>-<short sha>","commit":"<short sha>","date":"YYYY-MM-DD HH:MM UTC"}`, `-dirty` added when `web/`, `worker/` or `site/` have uncommitted edits. The release is the first quoted `X.Y.Z` in `web/version.js` (`site/site.conf` `release=`) |
| 7. Verify | site.sh `verify` | waits up to `version_wait=90` s for the live version.json to equal the stamp |
| 8. The app | `app.js loadVersion` | fetches version.json (`no-cache`); `util.js versionLabel` parses it; sets `state.version`, `telemetry.setVersion`, the corner ("Updated …") and About (release · commit link). No file or a 404: "dev copy", version `dev` |

Who reads the label after that:

| Reader | Rule | Note |
|---|---|---|
| `update.js` | compares the live version.json with the loaded one; `dev` never asks | the 🆕 bar |
| `sw.js` | version.json network only; the cache is marked with the version it was filled for (`MARK`) and refilled when a page load finds another | offline copy |
| `device-meta.js appMeta` | keeps `[A-Za-z0-9._-]`, 40 characters | `X-Noodle-App` on cloud calls |
| `feedback.js appVersion` | `^[0-9A-Za-z.+_]{1,32}$`, else `dev` | the deployed label holds `-`, so live feedback is filed as `dev` (likely unintended; the Worker's `events-worker.js` rule allows no `-` either) |
| `backup.js makeBackup` | stored as given | in every backup |
| `doctor.sh` | compares live with `git describe --tags --always main` | never equal since the `v<release>-` label: always warns (below) |
| `serve.py` | answers `{"version":"dev"}` when web/version.json is absent, and `/api/cloud` with `ok:false` | a dev copy under `just serve` and `just look` |

## CI and deploy

**On every push and pull request**, `.github/workflows/test.yml` (Ubuntu
24.04, Node 26.11.1, just 1.58.0, full history): `just test`, then
`tools/version_bumped.sh`, then `bump_version.py --check`. No secrets.

**On every push to `main`**, `.github/workflows/deploy.yml`, one at a time in
push order (a newer push waits): checkout with full history; flarepress at
`v1` into `.flarepress/` (for the recipes); Node and just; `just test`;
`version_bumped.sh` and `bump_version.py --check`; the
`pdxfixit/flarepress@v1` action on `site/` (check, gate, stamp, wrangler
deploy, verify); `just deploy-checks` with `CHROME=/usr/bin/google-chrome`.

The action's steps, from flarepress (its site.sh and wrangler.sh):

1. **check**: the run is for `refs/heads/main` and HEAD is the pushed sha;
   `site.conf committed=` paths clean; `web/index.html` there.
2. **gate**: the site answers (a first publish needs `FIRST_PUBLISH=1`).
3. **stamp**: version.json (above).
4. **deploy**: `wrangler deploy` with `site/wrangler.toml`; `${D1_DATABASE_ID}`
   filled into a throwaway copy from the environment.
5. **verify**: waits for the stamp to be live.

A red run after step 4 means the new version is live: fix forward or roll
back (docs/deploy-cloudflare.md). `test.yml` and `deploy.yml` run side by
side on a push to `main`, so the deploy runs the release checks itself
before the action (`justfile.test.mjs` pins the order).

**Daily**, `.github/workflows/live.yml` runs `live_check.py`: `/`,
version.json and `/api/cloud` answer, `/api/cloud` says ok; 3 retries, 20 s
apart. It does not check which commit is live.

**From an agent's side:** `just ship` (main checkout) and `just land` push
`main`; a cloud session pushes its branch, then fast-forwards `main`
(AGENTS.md). Both local paths run the release checks; a direct
`git push origin HEAD:main` runs only what CI runs.

## `just doctor` and `just serve`

`doctor.sh` (read-only): main checkout or worktree, commits behind `main`,
uncommitted files; `just`, Node (with WebSocket for `just look`), Python
3.8+, Chrome; flarepress at `$FLAREPRESS` or `~/src/flarepress`;
`cloud_config.py`; the telemetry mirror; the retired Mac archives; then the
live version against `main`. Exit 1 only when something is ❌.

`serve.py`: `web/` on every interface, port 8765 by default (Ben's), a
`ThreadingHTTPServer` with a queue of 128; `Cache-Control: no-store`, plus
every header of `web/_headers`'s `/*` rule (the CSP included, so a CSP break
shows in `just look`); `.webmanifest` typed; the two dev answers above.

## Concepts

### The dev copy

A page with no version.json is a dev copy: the corner says "dev copy",
`state.version` is `dev`, `update.js` never asks, and `log-send.js` and
`feedback.js` never send (they also need the live hostname). The stand-in
page answers version.json 404 (`fake-dom.mjs` never serves one, so a
checkout that once deployed cannot change a test); `serve.py` answers
`{"version":"dev"}`. `app.test.mjs` asserts the dev copy's corner.

### First steps off unless asked

`firsts.js firstStepsOn` is true unless `globalThis.noodleFirstSteps === false`.
`installPage` sets it from `firstSteps` (default false); `look.mjs` sets it
before each load from the view's `firstSteps`. A pure module test that never
calls `installPage` leaves it undefined, so first steps count as on there.

### The audio clock in tests

The stand-in `AudioContext` never advances. Timing tests set
`audio.context().currentTime` by hand (`new-beat.mjs newBuilderBeatWithRow`
moves it past a 100 BPM count-in, then puts it back) and let the 25 ms
`setInterval` tick run in real time; `settle()` does not wait for that tick.

### One device's remembered state

`localStorage` keys the app remembers (screen, ⌨️ Keys, layouts, open
groups, device code…) live per browser. In a test they exist only when
`installPage({ storage })` is given a map; in `just look` every width and
view of one run share them; in `cloud-e2e` each device has its own context.

### Throwaway cloud profiles

`p-smoke-…` and `p-e2e-…` are the only profiles agents' tools make on the
live database; `cloud_admin.py TEST_PREFIXES` and `smoke_plan` select only
them, once older than `TEST_GRACE_MS`, for `cloud-prune --smoke`.

## Seams

| Seam | Kept in step by | What a fix in one place misses |
|---|---|---|
| `look.mjs` views and `look-cloud.mjs` call `web/` exports, `state` fields, ids and `data-` attributes by string | nothing | a rename in `web/` passes `just test`; a view fails at `just look`, the e2e check fails after the deploy is live |
| `cloud-sync.test.mjs` `KEYS` lists every synced store's key path by hand | by hand | a new store in `store.js SCHEMA` is not synced by the test's devices until added (today: all but `cloud` and `bases`) |
| Four IndexedDB stand-ins (`fake-idb.mjs`, and inline ones in `store`, `storage-wait`, `holds` tests) | by hand | a new store.js call works in one and throws in another |
| Two justfile guards: `tests/justfile.test.mjs` (docs name every recipe and tool) and `tools/test_justfile.py` (README "Running it yourself" names exactly the recipes) | both | a new recipe must be named in both places |
| `help.test.mjs MUST_MENTION` is a hand list of labels | by hand | a new control without a line there is not required in Help |
| `startup-remembered.test.mjs` `remembered` map | by hand | a new `localStorage` key is not started with unless added |
| `colors.test.mjs` pairs | by hand | a new text/background pair is not checked |
| The version label's shape (`v<release>-<sha>`) and its readers' rules | none | `feedback.js appVersion` and the Worker refuse `-`; `doctor.sh` compares with `git describe` |
| `test.yml` and `deploy.yml` each list `just test` and the two release checks | `justfile.test.mjs` (deploy.yml's order) | a new check added to one workflow only runs there |
| `test.yml` and `deploy.yml` both pin Node 26.11.1 and just 1.58.0 | by hand | a bump in one runs the tests on another Node |
| `serve.py` and the stand-in page both fake version.json and `/api/cloud`, differently (`dev` vs 404; `ok:false` vs whatever a test routes) | none | — |
| The 44 px exemptions live in `look.mjs MEASURE` `exempt`, the decisions behind them in docs/decisions.md | by hand | — |

## Invariants and gotchas

| Rule | Guard |
|---|---|
| No `web/` module but `app.js` and `sw.js` touches the page at import time | `modules.test.mjs` |
| `MutationObserver` and `ResizeObserver` are always behind a `typeof` check | the app tests crash at start without it |
| A test that starts the app awaits `app.js ready` | `app-ready.test.mjs` |
| Compare stand-in elements with `assert.ok(a === b)`; a failing `assert.equal` prints the whole page and dies by SIGKILL | none (AGENTS.md) |
| `el.click()` is a keyboard click (`detail: 0`); `el.dispatch('click')` is a pointer click | none |
| Removed listeners still fire on the stand-in (`removeEventListener` is a no-op on elements) | none |
| A stand-in that sets long timers lives in `tests/fake-*.mjs`, or `settle()` will not wait for it | none |
| `web/version.js` holds exactly one quoted `X.Y.Z`; the deploy reads the first | site.sh stops on none |
| A shallow clone cannot bump, check or restamp: `git fetch --unshallow` first (a cloud session's clone is shallow) | `bump_version.py refuse_shallow`, `version_bumped.sh` |
| `--test-force-exit` is needed for app files (their intervals never end); it can cut the last reports of a parallel run | `just test` prints ⚠️ for a started test with no end and reruns its file alone (`node_tests.sh`) |
| Every `web/` file is in `sw.js SHELL` or `NOT_LOADED` | `offline.test.mjs` |
| `just look --js` sets state, never toggles it: widths share storage | none |
| A view named `beat` is defined in `VIEWS` and then replaced by `VIEWS.beat = VIEWS.beats`, so its 🆕 New script never runs | none |
| `tests/telemetry.test.mjs` checks `events.toml` only beside the telemetry repo: a worktree and CI skip it | none |

## To change X, touch …

| Change | Touch |
|---|---|
| Add a test that drives the app | the four steps above; `testManifest()`; helpers from `new-beat.mjs`, `song-ui.mjs`, `banner.mjs`; `node --test --test-force-exit tests/<file>`; `just prove` |
| A test on a device with data | `fakeIndexedDB().seed(DB_NAME, DB_VERSION, SCHEMA, …)` before `installPage` |
| A test through the cloud | `FakeD1`, `worker/index.js` default export, `http.js ORIGIN`, a `globalThis.fetch` router after `installPage` |
| Teach the stand-in page something | `fake-dom.mjs` (`FakeElement`, `matcher`, `installPage`'s globals); run the whole suite, since 71 files start the app on it |
| Teach the fake IndexedDB a call | `fake-idb.mjs`, and the inline stand-ins if that call reaches them |
| A new file in `web/` | `sw.js SHELL` (or `NOT_LOADED` in `offline.test.mjs`), docs/layout.md, `docs/architecture/` |
| A new control | its `aria-label`, `help.js` and `MUST_MENTION`, 44 px or a `MEASURE` exemption, `just look` |
| A new `just look` view | `look.mjs VIEWS` (and AGENTS.md if agents should know its name) |
| A new recipe | `justfile` with a one-line comment or `[doc()]`, README "Running it yourself", and a mention in AGENTS.md, how-to or layout |
| A new tool | `tools/`, a `tools/test_*.py`, docs/layout.md; a Node tool needs Ben's OK |
| The release rule | `bump_version.py`, `version_bumped.sh`, `test.yml`, `land.conf`, the `ship` recipe, `test_bump_version.py` |
| What the deploy runs | `deploy.yml` (and `justfile.test.mjs`, which pins its order), `site/site.conf`, `site/wrangler.toml` |
| A live check | `look-cloud.mjs` (and `cloud_admin.py TEST_PREFIXES` for a new throwaway prefix) |

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
