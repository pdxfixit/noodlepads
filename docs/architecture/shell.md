# The app shell: screens, page-wide UI and a new person's first steps

`app.js` is the only composition root. It builds every screen, hands each one
the state and callbacks it needs, and owns what spans screens: who is showing,
which screen shows, the bottom bar's 🎉 Play and 🛠️ Make, ✏️ Edit sounds,
🧸 Kids on or off, the page keys and the footer. Everything page-wide that is
not a screen lives in small modules that app.js and the screens import:
`ui.js` (the banner, the announcer, fading, the slim header), `dialogs.js`
(opening and closing every `<dialog>`), `tooltips.js`, `help.js`, the first
steps (`firsts.js`, `welcome.js`, `tips.js`, `nudge.js`), `who-now.js`,
`skins.js`, `backdrop.js` and `emoji-more.js`. `styles.css` keys off a
handful of classes and `data-*` attributes that JS sets on `<body>` and
`<html>`; they are listed in [one table](#markers-on-body-and-html-that-css-keys-off).

## Files and their wiring

| File | Owns (state) | Called by | Calls / hears |
|---|---|---|---|
| `app.js` | `el` (page elements), `seq`, `song`, `dj`, `telemetry`, `page`; `keysOn`, `sides`, `grownUp`, `kidsVisit`, `closedSections`; writes `state.personId`, `state.screen`, `state.editing` | `index.html` (the only module `<script>`); tests import `ready`, `SCREENS`, `MODES`, `modeOf`, `sideOf`, `startScreen`, `screenHint`, `spaceStops`, `groupsForChooser` | every `create*`/`init*` (see [the composition root](#the-composition-root)); `onSetting` for `level`, `padSkin`, `advancedBeats`, the instrument picks, `sendUsage`; `onCloud` |
| `ui.js` | `showing` (the one banner), `lastNotice`, `home` (the banner's place in `index.html`), the `fading` WeakMap | almost every screen (`showNotice`, `announce`, `showBanner`, `fadeAway`) | `log.js logEvent` (every notice is logged) |
| `dialogs.js` | `openers`, `returns` (focus to hand back), `openWatchers` | every module with a `<dialog>` (`setupDialog`, `openDialog`) | the watchers: `tips.js`, `nudge.js`, `track-page.js` (via `onDialogOpen`) |
| `tooltips.js` | nothing but a queued set | `app.js watchTips`; `track-page.js` imports `CONTROLS` and `tipFor` | a `MutationObserver` on `<body>` |
| `help.js` | `el` | `app.js initHelp` | `state.screen` (which tab opens), `voices.js` `VOICES`, `contact.js` `PIN_RESET_EMAIL` |
| `firsts.js` | nothing (pure; imports nothing) | `tips.js`, `nudge.js`, `welcome.js`, `settings.js` (`cleanSeen`, `cleanReaches`), `merge3.js` (`unionSeen`), `app.js` (`beatHasHits`) | `globalThis.noodleFirstSteps` |
| `tips.js` | `deps`, `tipThisVisit`, `padTaps`, `lastTip` | `app.js` (`initTips`, `tipsScreen`), `kids.js` (`kidsHint`, `markSeen`), `nudge.js` (`markSeen`), `welcome.js` (`showTipsAgain`) | settings `seen`, `level`; `ui.js showBanner`, `bannerShowing`; `dialogs.js onDialogOpen`; capture-phase clicks on `<body>` |
| `nudge.js` | `el`, `showing`, `waiting` (a 2 s `setInterval`), `VISIT` (this load's id) | `app.js initNudge` | settings `level`, `seen`, `reaches`; `onDialogOpen`; clicks on `#layer-add`; reads `#update-bar` |
| `welcome.js` | `fresh` (Map of people made this visit, not yet welcomed), `now` (the open welcome) | `app.js` (`initWelcome`, `markNew`, `offerWelcome`), `people.js addPerson` | `deps.play`, `deps.edit` (= `people.js editLook`), `deps.pictures` (= `people.js openPictures`); `cloud-ui.js openCloudList`, `avatarBadge`; `pads.js makePad`; `setSetting('level')` |
| `who-now.js` | `el`, `hooks` | `app.js` (`initWhoNow`, `openWhoNow`, `closeWhoNow`, `whoNowOpen`), `people.js refreshPeople` | `hooks.pick` (= `app.js pickWhoNow`), `hooks.someoneNew` (= `people.js addPerson`); `cloud.js linkOf`; `pads.js makePad` |
| `skins.js` | nothing (imports nothing) | `app.js` (`showSkin`), `settings.js` (`SKIN_IDS`), `settings-ui.js`, `kids.js` (`nextSkin`, `SKINS`) | sets `data-skin` on `<html>` |
| `too-old.js` | nothing (a classic script; `TOO_OLD_NEEDS`, `tooOldMissing`, `tooOldCheck`) | `index.html` (deferred, before `app.js`); `tests/too-old.test.mjs` runs it on stand-ins | `CSS.supports` and a few globals; when one is missing, sets `data-too-old` on `<html>` and adds the notice to `<body>` |
| `backdrop.js` | nothing | `app.js start` | sets `data-bg` and `--backdrop` on `<html>` |
| `emoji-more.js` | per chooser: its panel, `groups`, folds; module-wide `loading` (the one import of `emoji-all.js`) | `sheet.js`, `bulk.js`, `cloud-ui.js`, `dj.js`, `song.js` | `emoji-all.js` (dynamic `import()`, first tap of …) |
| `emoji-check.js` | nothing | `backup.js` (a backup's avatars), `worker/cloud.js` | nothing (generated) |
| `contrast.js` | nothing (pure math) | `model.js` (`isHex`, `whiteReadsOn`: a person's color must carry white text), `backup.js` (`whiteReadsOn`), and the contrast suite (`tests/colors.test.mjs`, `tests/contrast.test.mjs`) | nothing |
| `settings-ui.js` | `el`, `openSettings` | `app.js` (`initSettingsUI`, `showSettings`) | `settings.js`; `onSetting` for every key in `SETTINGS`; `skins.js`; `log-send.js` (`deviceCode`) |
| `cloud-ui.js` | the PIN pad (`pinDone`, `pinDigits`), `asking` (one PIN ask per person), the avatar picker, the share and shared dialogs | `app.js` (`initCloudUI`, `askToOpen`, `shareSounds`), `people.js`, `backup-ui.js`, `welcome.js`, `bulk.js` | `cloud.js` (all the work), `emoji-more.js`, `audio.js` (share previews) |
| `version.js` | `RELEASE` | `tools/bump_version.py`, the deploy (site.conf `release=`) | the page never loads it |

## Startup: from module load to first paint

`index.html` loads `web/fonts/fonts.css`, `styles.css`, the browser floor
check `too-old.js` (a deferred classic script, so it runs first) and one
module script, `app.js`. When `<html>` has `data-too-old`, `start()` returns
at once and draws nothing. `app.js` ends with `export const ready = start()`. Tests await
`ready` before their first tap (`tests/app-ready.test.mjs` checks every test
that starts the app does).

**At module load** (before `start()` runs), app.js reads localStorage:
`sides` (`play-side`, `make-side`) and `keysOn` (`beat-keys`). `nudge.js`
stamps `VISIT` (this load's id, for counting reaches). No module draws
anything at import (`tests/modules.test.mjs`: every module but app.js loads
outside a browser).

**`app.js start`, in order:**

| # | Step | Waits on |
|---|---|---|
| 1 | `installErrorLog`; fill `el` | nothing |
| 2 | `showBackdrop(el.root, pickBackdrop(location.search))`: the page's pattern | nothing |
| 3 | `startUsage`: `createTelemetry`, `learnLabels(document.body)` (before any kid's words are drawn), `trackPage(...)` | nothing |
| 4 | `buildGrille` for `#grille` (15 dots) and `#rec-grille` (24) | nothing |
| 5 | `loadManifest`: fetch boards.json, `model.js validateManifest` | **network**. On failure: `showNotice(err.message)` and `start()` returns; nothing else is wired |
| 6 | `state.js loadStorage({ onLateOpen })`: IndexedDB opens and is read into `state` | **storage**, at most `STORAGE_WAIT_MS`; past that it goes ahead with a notice and `onLateOpen` redraws later |
| 7 | `settlePeople`: adopt old boards.json people, re-id plain ids (`followRenames`), give "Me" a fun name, and make a device's first person (`model.js soloPerson`, then `welcome.js markNew(id, { device: true })`) | storage writes |
| 8 | `followUsage`: the usage switch from settings, and on change | settings loaded |
| 9 | Meter wiring: `meter.grille`, `meter.setProgress = pads.js setProgress`, `audio.on.started = meter.run`, `meter.onLevel` → `dj.level` | nothing |
| 10 | Every `init*`/`create*` call ([below](#the-composition-root)), screens first, then `seq`, `song`, `dj`, 🎧, 🧸 | nothing |
| 11 | `onSetting('level', applyKids)`; `showSkin(el.root, getSetting('padSkin'))` and `onSetting('padSkin', …)` | nothing |
| 12 | `bindEvents` (page keys, toolbar, hashchange, the first-gesture `audio.wake`); `watchTips(document.body)` | nothing |
| 13 | `setPerson(hash or remembered person, else the first)`: the first draw of the board; `started = true` | a PIN may hold it (see [who is showing](#who-is-showing)) |
| 14 | `loadVersion()` (not awaited); `registerOffline()` (the service worker, after `load`) | network, in the background |
| 15 | `initUpdate`, `initNudge`, `onSetting('advancedBeats', …)`, one `onSetting` per `instruments.js` `PLAYED` group | nothing |
| 16 | `fitLines`; the fading `MutationObserver`s (`#dj-done`, every `.lib-note` and `.set-note`) | nothing |
| 17 | `startScreen(recall('screen') …)` then `setScreen(first.screen)`; `applyKids()` | nothing |
| 18 | `page.level(getSetting('level'))`; `offerWelcome(state.personId)` (only a device's brand-new first person) | nothing |
| 19 | `initLeftover`; `initCloud({ storeLoaded, whatIsHere, renderShare })`: the first sync starts | network, in the background |

**What waits on storage:** everything from step 7 on. Before it, only the
pattern, telemetry and the grilles exist. The board is first drawn at step
13, the screen chosen at step 17. Between 13 and 17 the page shows the
`state.screen` default (`'pads'`) with the static markup's `.mode.open` on 🎉
Play.

**Storage arriving late** (another tab held the database): `loadStorage`
resolves after its wait with the notice `WAITING`; when the database opens,
`onLateOpen` runs `settlePeople` again and, once `started`, `setPerson` on the
same person (or the first). `tests/storage-wait.test.mjs` covers both paths.

## The composition root

Only `app.js` calls these (checked below). Each line is what it hands over.

| Call | What it gets |
|---|---|
| `initPads` | `openSheet` (sheet.js), `onPerson: setPerson`, `onLooping` → `dj.looping` |
| `initSheet()` | nothing |
| `initBulk` | `share: cloud-ui.js shareSounds` |
| `initPeople` | `showPerson: setPerson`, `startOver` |
| `initWhoNow` | `pick: pickWhoNow`, `someoneNew: people.js addPerson` |
| `initThings` | `lists: storedLists`, `anyone`, `preset`, `clipById`, `sampleClips`, `render` (`share-render.js renderAudio` with `seq` and a lookup bag for beats, songs, takes), `backup: savePersonBackup` |
| `initWelcome` | `play(kitId)` (the person's copy of that preset, through `audio.play`), `edit: editLook`, `pictures: openPictures` |
| `initTips` | `keysOn: () => keysOn`, `beatHasHits: () => firsts.js beatHasHits(seq.beat())` |
| `initCloudUI` | `refresh` (`renderPeople` + `refreshPeople`), `addPerson`, `dropPerson: dropLockedPerson`, `backup: savePersonBackup` |
| `onCloud(fn)` | a PIN new to this device on the person showing: `setPerson(id, { again: true })` |
| `initBackups()` | nothing |
| `initSettingsUI` | `gate` (🧸 Kids showing: ask the grown-up sum, `kids.js askGrownUp`), `onKids` (clear `grownUp` and `kidsVisit`, `applyKids`) |
| `initFeedback()`, `trackSlimHead()`, `initMiniDeck()`, `initHelp()`, `initLogSend()` | nothing |
| `makeSequencer` → `createSequencer` | ~45 elements; `audio`, `meter`; `clips`, `ready`; hooks `onTempo`, `onHit`, `onSteps`, `onBeatChange`, `onPlay`, `onGroovesOpen` (`listen-ui.js showCard`), `onStop`; the chooser's `groups: groupsForChooser`, `isGroupOpen`, `toggleGroup`; `clipById`, `colorOf`, `makePad`, `makeAddPad`; names `beatName`, `keptName`, `remixName`; `addClip` (`addMadeSound`, 🥁); `announce`; the open beat `opened`/`setOpen` (`state.patterns`); `kitIds`; `library: beatLibrary` |
| `setBeatTempo` (sheet.js) | `() => seq.beat()?.bpm` (Echo's 🥁 On the beat) |
| `makeSong` → `createSong` | its elements; `audio`, `meter`, `seq`; `beats` (saved beats minus the scratch, `scratch.js isHiddenBeat`); the open song `load`/`save`/`close` (`state.songs`); `songs: songBook`; `songName`, `soundLabel`, `addClip` (🎼), `beatColor`, `onHit`, `announce`. Also: `#library` closing re-renders the song |
| `audio.grid` | `() => seq.grid()`: loops started while a beat plays keep its bars |
| `createDJ` | its elements, including the `keysEdit` and `touchEdit` dialogs' parts; ~35 deps: the person, clips, `tap` (`pads.js tapPad`), `loop`, `playOnce`, `stopClip`, the audio clock (`now`, `latency`, `sampleRate`), `seq`, the store writers for takes, key layouts, touch layouts and the deck (`saveDeck` drops an old `beatId`), `setEmoji: setClipEmoji`, `notice: showNotice`, `inputChanged: showHint`, `ownGroups` (`groups.js groupOwn`) |
| `initListen` | `audio`, `seq`, `song`, `personId`, `clipById`, `library: beatLibrary`, `songs: songBook`, `showScreen: setScreen`, `stopAll: stopEverything`, `refresh`, `announce` |
| `initKids` | `personId`, `clips`, `colorOf`, `nextColor`, `saveClip` (pushes to `state.userClips`, `persist('clips')`), `ownClip`, `beats`, `saveBeat` (its own copy of `beatLibrary.put`), `grownUp` (the right sum: lets a grown-up out, opens Settings) |
| `initUpdate` | `#update-bar`, its buttons, `loaded: () => state.version`, `busy` (recording, any open dialog, beat, song, keys, Kids busy, or a looping pad) |
| `initNudge()` | nothing (finds its own elements) |
| `initLeftover()` | nothing |
| `initCloud` | `storeLoaded`, `whatIsHere` (backup-ui.js), `renderShare` (`share-render.js renderPreview` with `seq` and a lookup bag) |

**Shared objects app.js builds and hands to several modules:**

| Object | What it is | Handed to |
|---|---|---|
| `beatLibrary` | `{ list, put, remove }` over `state.savedBeats` and the `beats` store | `createSequencer`, `initListen` |
| `songBook` | the same over `state.songbook` and `songbook` | `createSong`, `initListen` |
| `addMadeSound` | a made sound (a bounced beat, a song, a take) as a new pad: a fresh emoji from `MADE_EMOJI` not on this board (`freshEmoji`), `exact: true`, `persist('clips')` | sequencer (🥁), song (🎼), dj (🎛️) |
| `setClipEmoji` | a sound's picture: on the record (own sound) or an override (preset); then redraws pads, `seq` and `dj` | dj (`setEmoji`) |
| `groupsForChooser` | the beat sound chooser's sections: kit groups once, then each person's own sounds, this board first, leaving out anyone whose PIN is not typed (`cloud.js pinGuards`) | sequencer (`groups`) |
| `closedPeople` | person sections closed in that chooser (localStorage `chooser-closed`) | sequencer (`isGroupOpen`, `toggleGroup`); `followRenames` renames its ids |

## Concepts

### Who is showing

The person on show is `state.personId`. Only app.js changes it.

| Function | Does |
|---|---|
| `app.js setPerson(id, { checked, again })` | The one way in. A person with a PIN not typed this visit (`cloud.js needsPin`) is asked first through `cloud-ui.js askToOpen`. Meanwhile someone without a PIN shows; if everyone has one, `startOver`. `again`: a sync found a new PIN on the person showing |
| `app.js showPerson(p, { behind })` | Draws them: closes 👋 Who's playing now? (unless `behind`), drops `body[data-locked]`, `cloud.js leftPerson` on whoever showed (their PIN is asked again next time), sets `state.personId`, `settings.js followPerson` (their settings fire their `onSetting` listeners), `--board` on `<html>`, `<meta name="theme-color">`, the title, `location.hash` (replaceState), localStorage `person`; then `renderPeople`, `renderPads`, `adoptKidsBeat`, `seq.setPerson`, `song.setPerson`, `dj.render` (if the keys show), `applyKids`, `refreshKids`, and loads every clip's audio |
| `app.js startOver(note)` | Nobody on show: `state.personId = null`. Nobody left: `addPerson`. One left with no PIN: show them. Otherwise draw the first person `behind`, set `body[data-locked]`, `openWhoNow(note)` |
| `app.js pickWhoNow(id)` | A pick in 👋 Who's playing now?: their PIN first, if any |
| `app.js dropLockedPerson(id)` | 🤷 I don't know the PIN: `people.js deleteHere`, then `startOver` if they were on show |
| `app.js stepPerson(±1)` | ← → on the page |
| `app.js followRenames(pairs)` | After `reIdStoredPeople`: the remembered person, the chooser's closed sections and the person on show follow the new ids |
| hashchange | `setPerson(renamedId(hash))` |

`people.js refreshPeople` is the other caller: after any person change it
shows the same person again, or `startOver` when they are gone. While 👋 Who's
playing now? is open (`whoNowOpen()`), nobody counts as showing: the `onCloud`
handler and `refreshPeople` both check it.

**The locked board:** `body[data-locked]` hides `<main>` (`visibility:
hidden`, styles.css "Cloud"). Set by `setPerson` (a PIN asked at start or
again) and `startOver`; removed by every `showPerson`. The toolbar stays
drawn, but the PIN pad and the chooser are modal, so it is inert.

Two PIN notions meet here (cloud area): `cloud.js needsPin` (to open, cleared
by `leftPerson`) and `cloud.js pinGuards` (to read or change their things,
held for the visit). `groupsForChooser` uses `pinGuards`.

### Screens and views

| Name | Where | Meaning |
|---|---|---|
| `SCREENS` | `app.js` | `['pads', 'beats', 'song', 'live']`. Anything else is `pads` |
| `state.screen` | `state.js`, written by `app.js setScreen` | the screen showing. Read by `help.js` (which tab opens) and app.js |
| `keysOn` | `app.js` (localStorage `beat-keys`) | ⌨️ Keys on Beats |
| `keysShow()` | `app.js` | the keys panel is on screen: 🎤 Live, or 🥁 Beats with `keysOn` |
| `beatView()` | `app.js` | the view the beat maker draws the open beat in: `'live'`, `'dj'` (Beats with Keys) or `'beats'` |

`app.js setScreen(name)`:

1. Leaves ✏️ Edit sounds off any screen but Pads.
2. Leaving the keys: `dj.leave()` (a recording ends with the screen).
3. Leaving Beats: `seq.stop()`, then `seq.endLock()` (⇆ unlocks). Leaving
   Song: `song.stop()`.
4. Sets `state.screen`.
5. Toggles `body.screen-<name>`, `aria-pressed` on every `[data-screen]`,
   `.open` on the `[data-mode]` holding the screen; remembers the mode's side
   (`sides`, localStorage `play-side`/`make-side`).
6. `showView()`, then shows `#song` (and `song.render()`), `#pads`,
   `#pads-bar`; localStorage `screen`.
7. `page.screen(name)` unless 🧸 Kids shows; `tips.js tipsScreen(name)`.

`app.js showView()` decides between Beats' rows and the keys panel:
`seq.show(beatView())` on Beats or Live, `dj.setMode('free' | 'beat')` when
the keys show, `body.keys-on` on Beats with Keys, `aria-pressed` on every
`[data-beat-keys]`, `#seq` and `#dj` hidden or shown, `#dj`'s `aria-label`,
`dj.render()` and `dj.renderGrid()`, the footer hint, `dj.shown(keys && !kidsShowing())`.

`app.js setKeys(on)` flips `keysOn` (not while `dj.recording()`), remembers
it and re-runs `showView` on Beats. `[data-move-open]` (⇆) calls
`seq.toggleLock()`, also not while recording.

**Old remembered screens:** `app.js startScreen(screen, djMode)` maps `dj` to
Live, or to Beats with Keys when `dj-mode` was `beat`; an older copy's
`beats` key reads as Beats (`tests/four-tabs.test.mjs`).

### The bottom bar: 🎉 Play and 🛠️ Make (ADR 0033)

`app.js MODES = { play: ['pads', 'live'], make: ['beats', 'song'] }`.
`modeOf(screen)` names a screen's mode; `sideOf(mode, remembered)` is the
screen a closed mode's button opens (the remembered one if it belongs, else
the first). In `index.html` each mode is a `.mode[data-mode]` group: a
`[data-mode-open]` button (shown only while the mode is closed), a
`.mode-cap` label and its two `[data-screen]` tabs. A click on
`.screens` goes to `setScreen` (a tab) or `setScreen(sideOf(mode,
sides[mode]))` (a closed mode). CSS hides the closed mode's tabs and the open
mode's own button (`.mode:not(.open) > :not(.mode-open), .mode.open >
.mode-open`). ⏹️ `#stop-all` is `stopEverything`. The toolbar is one line
through `lines.js fitLine` (`fit-tight`, `fit-short`, `fit-stack`).
`tests/four-tabs.test.mjs` guards the bar.

### The tempo key (phones)

`tempo-key.js tempoKey(key, box, bpm)` is the one tempo key every control
bar has on a phone: `#seq-tempo-key` (Beats, `sequencer.js`, box
`#seq-tempo`), `#dj-tempo-key` and `#dj-click-key` (⌨️ Keys and 🎤 Live,
`dj.js`, boxes `#dj-tempo` and `#dj-click-tempo`) and `#song-tempo-key`
(`song.js`, box `#song-tempo-box`). It only opens and closes: the key's
`aria-expanded`, the box's `.tempo-open`, Esc. Each screen keeps its own
slider, ⌄ ⌃ and typed number inside the box, and calls `show()` from its
tempo redraw (`showTempo`, `showSetup`, `renderTempoOpen`) so the key reads
the tempo. CSS (`styles.css`, "The tempo key") shows the key and folds the
box only at 600 px and under; the open box is the bar's last line. Words
on ▶ / ● / 🎬 give way by `@container panel` width, showing `data-icon`
(set beside each label in `sequencer.js showPlayKeys` and `dj.js`).
`tests/tempo-key.test.mjs` guards it.

### ✏️ Edit sounds (the shell's part)

`app.js setEditing(on)`: goes to Pads first, sets `state.editing`,
`pads.js cancelDrag`, toggles `body.editing`, redraws
`#edit-toggle` (✏️ Edit sounds ↔ ✅ Done, words in `.edit-word` and
`.edit-more` spans the slim header can drop), the footer hint,
`audio.stopAll()` when turning on, `renderPads`. Everything else of Edit
sounds is `pads.js` and `bulk.js` (`body.choosing` while sounds are chosen).

### Levels: 🧸 Kids, Regular, Advanced (ADR 0019)

One person setting, `level` (`settings.js LEVELS`), stored beside the older
`advancedBeats` switch (`settings.js storedPair`: setting either sets both).
Changing person changes the level (`followPerson`).

| Reader | Reads | What changes |
|---|---|---|
| `app.js applyKids` | `level`, plus `grownUp`, `kidsVisit` | 🧸 Kids' screens replace the app |
| `tips.js guided` | `level !== 'kids'` | tips and hint dots only off Kids |
| `tips.js kidsHint` | `level === 'kids'` | Kids' 👆 hand and mic wiggle |
| `nudge.js` | `level === 'regular'` | the nudge counts and offers |
| `listen-ui.js` | `level === 'kids'` | no 🎧 card |
| `settings-ui.js` | `level` | the three keys, `LEVEL_HINTS`, the heading chip |
| `board.js clipsFor`, `sequencer.js`, `sheet.js`, `chop.js`, `song.js` | `advancedBeats` | Advanced's extra tools and the sharps and flats |
| `app.js` (`onSetting('advancedBeats')`) | `advancedBeats` | redraws pads, the keys, refits lines |

No CSS rule reads the level; Advanced shows only through what JS draws.

**🧸 Kids showing is a second, separate state** (`kids.js kidsShowing`). It
is on when `kidsVisit || (level === 'kids' && !grownUp)`:

- `grownUp` (app.js): the grown-up sum let someone out; lasts until reload,
  across every person (questions.md Q63, provisional).
- `kidsVisit` (app.js): 🧸 `#kids-open` or 🧸 Kids mode in the person menu
  (`[data-kids-open]`) showed Kids to a Regular or Advanced person
  (`enterKids`); their level is unchanged.
- The right sum (`initKids` `grownUp` hook) clears `kidsVisit`, sets
  `grownUp` only for a Kids-level person, and opens Settings.
- 🧸 Kids in Settings' Level keys clears both (`initSettingsUI` `onKids`).

`app.js applyKids` turning Kids on: ends Edit sounds, `dj.leave`,
`seq.stop`, `song.stop`, `audio.stopAll`, closes **every open dialog**, then
`body.kids`, `kids.js showKids(on)`, `page.screen('kids' | state.screen)`;
turning off, `lines.js refitLines` (lines measured while hidden). It returns
early before `seq` exists or with nobody on show. `body.kids` hides `<main>`
(the banner and update bar with it), the toolbar, the title, 🧸, ❓, the
person menu and ⬆️; ⚙️ stays and asks the sum (`settings-ui.js` `gate`).

### The banner, notices and Undo; the announcer

One element, `#banner` (in `<main>`, `popover="manual"`), shows one line at a
time over the top of the screen. `ui.js` owns it.

- `ui.js showBanner(text, { action, ms, onClose, focusBack })` returns a
  handle `{ close(), focus(), open }`. A new banner replaces the one showing
  (`onClose('replaced')`). `action` is the yellow button (↩️ Undo): a tap runs
  `fn`, then the banner closes. It fades by `fadeAway` after `ms`
  (`BANNER_MS` 8 s); a finger, the mouse or focus holds it.
- `ui.js showNotice(text)`: a notice (`NOTICE_MS` 10 s), always logged
  (`logEvent('notice')`). The same words again within `REPEAT_MS` (60 s)
  never replace a banner with an Undo. `showNotice('')` closes the last notice.
- `ui.js placeBanner`: while a modal dialog is open the rest of the page is
  inert, so the banner moves into the open dialog (the one with focus, else
  the last opened) and goes home when it closes.
- `ui.js bannerShowing()`: tips wait for a notice or an Undo to go.

| Who shows a banner | Undo? |
|---|---|
| `bulk.js` (Edit sounds: delete, move…) | yes, focus back to `#edit-toggle` |
| `chop.js` (🔊 Even it out) | yes |
| `sequencer.js` (removed row, groove…; "Kept as …") | yes / no |
| `dj.js` (a groove behind the keys) | yes |
| `song.js` (tempo change removed; notes) | yes / no |
| `nudge.js` (Advanced is on) | yes |
| `tips.js` (each tip; 💡 Show tips again) | no |
| `showNotice` callers: `app.js`, `audio.js`, `backup-ui.js`, `chop.js`, `leftover.js`, `people.js`, `sheet.js`, `state.js` | no |

Other ↩️ Undo buttons sit in their own screens (`#ke-undo`, `#te-undo`,
`#song-step-undo`, `#dj-done-undo`, the roll's) and never use the banner.

**Fading elsewhere:** `ui.js fadeAway(el, ms, { clear, then })` and
`stopFade`. app.js puts a `MutationObserver` on `#dj-done` (the take card,
10 s) and on every `.lib-note` and `.set-note` in the page at start (6 s,
emptied). `dj.js` fades its name flash; `nudge.js` fades its bar.

**The announcer:** `ui.js announce(text)` writes into `#announce` (a
`role="status"` outside `<main>`, so it still speaks in Kids and on a locked
board), cleared then refilled 50 ms later so the same words are read again.
Screens get it as a `deps.announce` from app.js or import it.

### The update bar and the nudge bar

Both float over the bottom (`.update-bar`, styles.css), never fade by
default, and both poll every 2 s for a quiet moment:

| | `update.js initUpdate` | `nudge.js` |
|---|---|---|
| Element | `#update-bar` | `#nudge-bar` (class `update-bar nudge-bar`) |
| Shows when | version.json names a newer version than `state.version` | `firsts.js nudgeDue` (Regular, 3 reaches over 2 visits, not seen) |
| Waits while | `busy()` from app.js: recording, any dialog open, beat, song, keys or Kids busy, a looping pad | the update bar shows, or any dialog is open |
| Ends | Reload; ✕ until the next check | ✕, Try Advanced, or a 12 s fade (`NUDGE_MS`): `markSeen('nudge')` for good |

`state.version` is `'dev'` until `app.js loadVersion` resolves; a dev copy
never asks.

### Dialogs and sheets

`index.html` has 33 `<dialog>`s. Every one is wired by `dialogs.js
setupDialog` (✕ `[data-close]`, a backdrop click that also started on the
backdrop, Esc; `beforeClose()` returning false keeps it open) and opened by
`dialogs.js openDialog(dialog, { focus, returnTo, opener })`, the only
`showModal()` in the app. Closing hands focus back to the opener, or to
`returnTo()` when the opener was redrawn. `onDialogOpen(fn)` tells watchers
just before a dialog opens: `tips.js` (the sound sheet's tip), `nudge.js`
(🎚️ Mixer and 🎹 roll count as reaches), `track-page.js` (usage).

| Dialog id | Owner (wires it) | Found by |
|---|---|---|
| `settings-dialog` | `settings-ui.js` | also `welcome.js` (closes it) |
| `help` | `help.js` | |
| `welcome` | `welcome.js` | |
| `who-now` | `who-now.js` (`beforeClose: () => false`: only a pick closes it) | |
| `kids-sum` | `grown-up.js` | used by `kids.js`, `feedback.js` |
| `feedback-dialog` | `feedback.js` | |
| `people-dialog`, `profile-dialog`, `names-dialog` | `people.js` | |
| `things-dialog` | `things.js` | |
| `load-who` | `backup-ui.js` | |
| `pin-dialog`, `avatar-dialog`, `cloud-list`, `share-dialog`, `shared-dialog` | `cloud-ui.js` | `welcome.js` listens to `avatar-dialog` and `cloud-list` closing; `cloud-list` can't be closed while someone comes down or after a stop (`beforeClose`), and ▶ Play as them closes it then calls `app.js playAs` |
| `bulk-dialog` | `bulk.js` | |
| `sheet`, `sheet-warn` | `sheet.js` | |
| `library`, `chooser`, `tune-who`, `grooves`, `mixer`, `roll` | `sequencer.js` (`mixer.js`, `roll.js` inside) | app.js looks them up for `createSequencer`; `listen-ui.js` also finds `grooves` |
| `listen` | `listen-ui.js` | |
| `lane-sheet`, `tempo-sheet`, `songs` | `song.js` | app.js looks them up |
| `pictures`, `takes` | `dj.js` | app.js looks them up |
| `keys-edit`, `touch-edit` | `dj-keys.js`, `dj-touch.js` | app.js looks them up |

Page-wide rules that read "a dialog is open" (`document.querySelector('dialog[open]')`):
the page keys stand down, `tips.js showTip` waits (except the sheet's own tip),
the nudge waits, the update bar waits, and the banner moves inside.

### Tooltips

`tooltips.js watchTips(document.body)` runs once at start (after
`bindEvents`): `addTips` gives every control (`CONTROLS`: buttons,
`role="button|switch|tab"`, links, inputs, selects, summaries,
`output[for]`) a `title` from `tipFor` (its `aria-label`, else its text, cut
at 120), marked `data-auto-tip`. A hand-written `title` (no `data-auto-tip`)
is left alone. A `MutationObserver` collects only the controls a batch of
changes touched (`touched`) and re-tips them in one microtask. `track-page.js`
uses the same `CONTROLS` and `tipFor` to name the control a click hit.
Guarded by `tests/tooltips.test.mjs`.

### ❓ Help and its test

`help.js HELP` is six parts (`pads`, `sounds`, `live`, `beats`, `song`,
`settings`), each with `items` of `{ pic, text, adv?, soon? }`. A `pic` is a
list of drawn pieces: `tool`, `lit`, `add`, `play`, `rec`, `chip`, `toolbar`,
`addPad`, `mic`, `slider`, `seg`, `voice` carry a real label; `pad`, `key`,
`pills`, `word`, `eg`, `person`, `count` are examples. `initHelp` draws every
part once; `#help-open` opens the part for `state.screen`
(`helpSectionFor`). `soon` items stay hidden (`shownItems`); `adv` items get
a "⚙️ Advanced" tag. 💡 Show tips again (`#help-tips`) sits in Help's head but
is wired by `tips.js initTips`.

`tests/help.test.mjs` checks: every `[data-screen]` in `index.html` has a
part, in toolbar order; every labelled piece's text appears in the app
(`index.html` or the code); `MUST_MENTION` labels are both in the app and in
Help; no `soon` item shows; some items are marked Advanced. `word(...)`
pieces and the sentences are not checked.

### A new person's first steps (ADR 0028)

| Step | Who | When | Kept as |
|---|---|---|---|
| 👋 Who's playing? → Pick your stage name | `welcome.js` | a person made this visit: a device's first (`app.js settlePeople`, `device: true`, so ☁️ Open from the cloud shows) or ➕ (`people.js addPerson`) | nothing stored: `fresh` is in memory; a reload skips it |
| One-time tips in the banner | `tips.js` | `tipsScreen` on each `setScreen`; 3 pad taps; the sound sheet opening | `seen` ids `tip-*` |
| Hint dots on ⌨️ Keys, 💃 Grooves, 🎚️ Mixer | `tips.js showDots` → `body[data-hints]`, drawn by CSS `::before` | until the first tap of each | `seen` ids `dot-*` |
| 🧸 Kids' 👆 hand and mic wiggle | `kids.js`, asking `tips.js kidsHint` | Kids level only | `seen` ids `kids-pad`, `kids-mic` |
| 🎛️ Want more knobs? | `nudge.js` | Regular; `reach()` on Mixer, roll, + Add a layer | `reaches` (visit ids); `seen` id `nudge` |

**The two person settings** (`settings.js`, `scope: 'person'`, `quiet`, so
not logged): `seen`, a sorted comma list cleaned by `firsts.js cleanSeen` (at
most `SEEN_MAX`); `reaches`, cleaned by `cleanReaches` (last `REACH_KEEP`).
They travel with the person (backups, cloud). A sync unions `seen`
(`merge3.js` uses `firsts.js unionSeen`), so a tip never shows twice.
`withoutTips` (💡 Show tips again, `tips.js showTipsAgain`) clears `tip-*`
and `dot-*` and keeps the rest.

**Tip rules** (`tips.js showTip`): `guided()` (first steps on, level not
Kids); at most one per screen visit (`tipThisVisit`); not seen; no dialog
open unless `inDialog`; no notice or Undo in the banner (a tip may replace
the last tip).

**The welcome:** `offerWelcome(id)` opens it once for a `fresh` id (`app.js
start` at the end; `people.js addPerson`). A card plays its preset (a real
gesture, so audio may start), and for Regular and Advanced sets `level` at
once; Kids is set in `finish()` as the dialog closes, because Kids' screens
close every dialog (`applyKids`). Step 2 changes the name, picture and color
through `people.js editLook` (so the PIN guard, sync and fun-name rules hold);
Skip puts back what the app gave (`putBack`). ☁️ Open from the cloud opens
`cloud-ui.js openCloudList` over it; anyone new after that list closes ends
the welcome (`cloudClosed`). ⚙️ Settings → About → Show the welcome again
(`#welcome-again`) runs `replayWelcome` (also `showTipsAgain`).

**The test hook:** `firsts.js firstStepsOn()` is false only when
`globalThis.noodleFirstSteps === false`. `tests/fake-dom.mjs installPage`
sets it from `firstSteps` (default false), and `tools/look.mjs` sets it per
view (on for `welcome`, `welcome-stage`, `welcome-kids-stage`, `tip-beats`,
`hint-dots`, `kids-hand`, `nudge`). Every first step checks it: `offerWelcome`,
`guided`, `kidsHint`, `nudge.js due` and `reach`. `replayWelcome` does not.

### 👋 Who's playing now?

`who-now.js` is the chooser the board starts over on, opened only by `app.js
startOver` (and redrawn by `people.js refreshPeople`). Each person is a
`pads.js makePad` card (🔒 when `cloud.js linkOf(id).pin`), so it takes the
pad skin. Only a pick closes it (`showPerson` calls `closeWhoNow`).

### Pad skins and the backdrop

- **Skins:** the person setting `padSkin` (values `skins.js SKIN_IDS`).
  `app.js` calls `skins.js showSkin(el.root, …)` at start and on every
  change (which includes a person switch, a backup and a sync, through
  `followPerson`/`notifyAllSettings`). Tiles removes `data-skin`.
  styles.css "Pad skins" draws each skin under an `@scope` that stops at a
  nearer `[data-skin]`, so 🎨 Look's samples (`settings-ui.js drawSkinPicks`,
  `label[data-skin]`) and 🧸 Kids' 🎨 button (`kids.js`, the next skin) show
  their own. Every `.pad` takes it: Pads, the chooser, Help's small pads,
  the welcome and who-now cards, Kids. `tests/skins.test.mjs`.
- **Backdrop:** `backdrop.js pickBackdrop(location.search)` picks one of
  `BACKDROPS` at random per load (`?bg=name` or `?bg=none`); `showBackdrop`
  sets `data-bg` and `--backdrop: url("bg/<name>.svg")` on `<html>`.
  Nothing is remembered. CSS draws it as a mask in `--backdrop-ink` behind
  `body`, `.kids` and the toolbar. `tests/backdrop.test.mjs`.

### Emoji pickers

`emoji-more.js emojiMore({ grid, onPick, stateOf })` adds "…" (All emoji)
to a short picture list: a panel after the grid with search, folding group
headings (buttons drawn a `CHUNK` of 160 at a time), arrow-key roving, and a
pick through the chooser's own `onPick`. `withCurrent(short, current)` puts
a picture chosen from the full list at the end of the short one.

| Chooser | Module | Short list |
|---|---|---|
| A sound's picture (sound sheet) | `sheet.js` | its `EMOJI` |
| Color · picture for chosen sounds | `bulk.js` | `EMOJI` |
| A person's picture (`#avatar-dialog`, also from the welcome's …) | `cloud-ui.js` | `model.js PICTURES` |
| A row's picture with ⌨️ Keys (`#pictures`) | `dj.js` | `PICTURES` |
| A song lane's picture | `song.js` | `LANE_EMOJI` |

`emoji-all.js` (about 12 KB gzipped) loads on the first tap of … anywhere,
once per page (`loading`). `emoji-check.js isListedEmoji` is the same list as
code point ranges, for `backup.js` and the Worker. Both are generated by
`tools/make_emoji.py`. `tests/emoji-more.test.mjs`.

### The page footer: how-to and version

- `#screen-hint`: `app.js showHint` → `screenHint(name, editing, fine)` from
  `SCREEN_HINTS` (touch or mouse, chosen by `(hover: hover) and (pointer:
  fine)`); `keys` for Beats with Keys, `tiles-*` with 👆 Pads
  (`dj.touching()`). Redrawn by `setEditing`, `showView`, `dj`'s
  `inputChanged`. `tests/settings-menu.test.mjs` checks the wording.
- `#version`: `app.js loadVersion` reads version.json (`util.js
  versionLabel`), sets `state.version` and `telemetry.setVersion`, and draws
  `versionParts`: in the corner a `[data-about]` button ("Updated …"), which
  `settings-ui.js` opens at About; in `#about-version` the date, the release
  and the commit link. `version.js RELEASE` reaches the page only through
  that label.

### The header, slim header and mini deck

`ui.js trackSlimHead` toggles `body.head-slim` past `SLIM_AFTER` (12 px)
scrolled and wires ⬆️ (`#to-top`, smooth unless reduced motion, focus to
`#board-title`). `mini-deck.js initMiniDeck` reads `body.screen-beats`,
`body.keys-on` and `body.head-slim`, sets `deck-tucked`, `deck-open` and the
`tuck-no*` steps (`mini-deck.js STEPS`).

### Markers on `<body>` and `<html>` that CSS keys off

| Marker | Set by | Meaning | Read by |
|---|---|---|---|
| `html` `--board` | `app.js showPerson` | the person's color (the casing) | every color token in styles.css `:root` |
| `html[data-bg]`, `--backdrop` | `backdrop.js showBackdrop` | the page's pattern | styles.css (7 rules) |
| `html[data-too-old]` | `too-old.js tooOldCheck` (the features missing) | too old a browser; app.js does not start | styles.css: every `<body>` child but the notice hidden |
| `html[data-skin]` | `skins.js showSkin` (from app.js) | the pad skin; absent = Tiles | styles.css "Pad skins" |
| `body.screen-pads/-beats/-song/-live` | `app.js setScreen` | the screen showing | CSS uses `screen-pads`, `screen-live`; `mini-deck.js` reads `screen-beats`; nothing reads `screen-song` but tests |
| `body.keys-on` | `app.js showView` | Beats with ⌨️ Keys | CSS, `mini-deck.js` |
| `body.editing` | `app.js setEditing` | ✏️ Edit sounds | CSS, `tips.js` (no pad-tap count) |
| `body.kids` | `app.js applyKids` | 🧸 Kids shows | CSS hides the regular app |
| `body[data-locked]` | `app.js setPerson`, `startOver` | a PIN is owed | CSS hides `<main>` |
| `body[data-hints]` | `tips.js showDots` | `"keys grooves mixer"` still to tap | CSS `[data-hints~=…]` dots |
| `body.head-slim` | `ui.js trackSlimHead` | scrolled past the title row | CSS, `mini-deck.js` |
| `body.deck-tucked`, `deck-open`, `tuck-no*` | `mini-deck.js` | Beats' play bar in the slim band | CSS |
| `body.choosing` | `bulk.js` | sounds chosen in Edit sounds | CSS |
| `body.reordering` | `pads.js` | a pad is being dragged | CSS |
| `body.pills-locked` | `sequencer.js` (⇆) | the pills are locked | CSS |

### Keyboard

| Key | Where | Handler |
|---|---|---|
| Any first key or pointer | page | `audio.wake()` (capture, once) |
| Number row, letters | 🎤 Live, Beats with ⌨️ Keys | `dj.keydown` / `dj.keyup` (first in `bindEvents`' keydown) |
| Esc | page | `dj.escape()` when the keys show; else clear chosen sounds (`pads.js clearChosen`); else `audio.stopAll()` |
| Space | page, not on a control, not in a field, not repeated, not Shift | `stopEverything` (`app.js spaceStops`; `tests/space-stops.test.mjs`) |
| ← → | page | `stepPerson` |
| 1–9 | 🔊 Pads, not editing | `tapPad` on that pad, with `flash` |
| Kids' keys (Esc, Space, ← → pages, letter keys) | 🧸 Kids | `kids.js kidsKeydown`, `kidsKeyup` |
| Digits, Backspace | the PIN pad | `cloud-ui.js` |
| Arrows, Home, End, Enter, Esc | All emoji | `emoji-more.js` |
| Esc | any dialog | the browser's `cancel` → `setupDialog` |

The page keydown stands down when `defaultPrevented`, with Meta, Ctrl or Alt,
behind any open dialog, and in a text field. 🧸 Kids gets its own keys and
none of the regular ones. Screen-level keys (pads' Alt+← →, pill picks,
song lanes, the roll) live in their own modules.

### Remembered per device (this area)

localStorage, through `util.js remember`/`recall`/`forget` (each wrapped in
try): `person`, `screen`, `play-side`, `make-side`, `beat-keys`,
`chooser-closed` (app.js); `settings-open` (settings-ui.js). Read once and
dropped: `beats`, `dj-mode` (old screens), `uses`, `visits` (ADR 0027).
`tests/startup-remembered.test.mjs` starts the app with them set.

## styles.css map

5,600 lines, one file, in sections headed `/* ── Name ── */`. Order:

| Section | What it holds |
|---|---|
| (top) `:root` tokens | `--board` (set per person by JS) and colors mixed from it: `--board-deep`, `--bed`, `--bed-edge`, `--deck`; fixed `--ink`, `--paper`, `--chalk`, `--line`, `--muted`, `--record`, `--led`; fonts `--font-display` (Anybody), `--font-ui` (Atkinson Hyperlegible Next); `--gutter` 16px, `--max` 2400px, `--toolbar-h` 76px. `[hidden] { display: none !important }` |
| The page's pattern | `:root[data-bg]` masks behind `body`, `.kids`, the toolbar |
| Header | title row, grille, ❓ ⚙️, the person button |
| Pad bed | the banner, update and nudge bars, `#pads-bar`, the footer, pads, groups, edit badges, drag |
| Beat maker | the deck, tempo, bars/signature/swing (`fit-*`), rows, pills, ruler, the beat bar, chips |
| 🎹 The piano roll | |
| Song | lanes, blocks, tempo marks, 🎼 Tempo |
| Toolbar | `.screens`, `.mode`, ⏹️ |
| Sheet | the sound sheet, the chooser, 👥 People, profile, 🗂️ See all, Settings, libraries, the recorder, the wave |
| Layers, DJ mode, Help, Cloud profiles, ⇆ locked | each its screen |
| **Wide screens: fill, then split** | `@media (min-width: 1400px)`: two natural parts side by side (not Beats), Help in two columns, limits |
| All emoji, shares, sheet headings, **the header slims**, counts, emoji folds, ✏️ Edit sounds, DJ ✏️ Layout (⌨️ and 👆), voices, the sheet's folds, sheet-warn, Feedback, pad badges, row tools, 🎚️ Mixer, 🎧 From a song | later additions, each a section |
| **🧸 Kids** | `body.kids` hides the regular app; `.kids` is one fixed frame |
| ⋯ menus, **👋 The welcome** | |
| **Pad skins** (last) | one `@scope ([data-skin=…]) to (:scope [data-skin])` block per skin; pads written `.pad.pad.pad` to outweigh size rules |

**Conventions:** flat fills and hard edges only (no blur or gradients), so the
Android app can copy it. Breakpoints are written per rule: `max-width: 600px`
(phone) most, then 559, 480, 420, 359; `min-width: 700`, `900`, `1400`.
`(hover: hover) and (pointer: fine)` for a mouse; `prefers-reduced-motion`
blocks beside each animation. Pads size by container queries (`@container`,
`container-type: inline-size` on `.pads .pad`). State is styled through
`aria-pressed="true"`, `aria-expanded`, `.armed` (a two-tap button waiting),
`.fading` (`ui.js fadeAway`), `.playing`/`.looping`/`.hit` on pads, and the
`fit-*` classes `lines.js` adds. Per-element custom properties set by JS:
`--pad` (a pad's color), `--c` (a badge or the welcome's color), `--sw`
(a color swatch), `--progress`, `--head-h` and `--deck-h` (sticky offsets).

## Seams

| Seam | Where | What a fix in one place misses |
|---|---|---|
| Esc and Space stop different things | `app.js bindEvents`: Esc → `audio.stopAll()` (pads and loops only); Space → `stopEverything` (also the beat, the song, both ⏲️ clicks) | Help's Pads line and the comment in `bindEvents` say "Space (or Esc) stops everything"; a beat keeps playing after Esc (by reading the code; no test) |
| Two "a quiet moment" checks, two 2 s polls | `app.js` `busy` for `initUpdate`; `nudge.js quiet` | a new busy state (a new recorder, a new player) must go into `busy`; the nudge only checks dialogs and the update bar |
| Kids showing vs the Kids level | `app.js applyKids` uses `kidsVisit`/`grownUp`; `tips.js guided`, `kidsHint` and `nudge.js` read only `level` | on a 🧸 visit by a Regular person, tips count as "guided" and no 👆 hand shows; a fix to "is Kids on" must touch all of them |
| Saving a beat, three copies | `beatLibrary.put`, `initKids` `saveBeat`, `adoptKidsBeat` (`db.batch`) | a change to how a beat is stored (cloning, a new index) |
| A new clip enters `state.userClips` three ways | `app.js addMadeSound`, `initKids` `saveClip`, the sound sheet's own save | the redraw (`renderPads`) and any new field |
| The store-writer pattern repeated | `createDJ` deps for takes, key layouts, touch layouts, the deck; `makeSong` `save`/`close`; `makeSequencer` `setOpen` | each replaces the record in `state` and calls `persist` or `db.remove`; error handling differs (some `console.error`, `beatLibrary.remove` a notice) |
| Two lookup bags for playing saved things | `initThings` `render` and `initCloud` `renderShare` | `initThings`' `songById` also finds an open song in `state.songs`; `renderShare`'s doesn't. A new kind must go in both |
| `setClipEmoji` redraws by hand | pads, `seq`, `dj` | a new screen that shows a sound's picture must be added there |
| Two words for one control | `SCREEN_HINTS` (footer) and `help.js HELP` describe the same controls | a rename must change both; Help's labels are tested, the hints only by `tests/settings-menu.test.mjs` |
| Skin names written twice | `skins.js SKINS` labels and Help's 🎨 Look sentence | no test ties the sentence to `SKINS` |
| Help's 💡 button wired elsewhere | `#help-tips` is in Help's dialog, wired by `tips.js initTips` | moving or redrawing Help's head must keep the id |
| The welcome reaches into other dialogs | `welcome.js` closes `#settings-dialog`, listens to `#cloud-list` and `#avatar-dialog` closing | renaming those ids, or their owners closing them a different way |
| `mini-deck.js` reads app state from body classes | `screen-beats`, `keys-on`, `head-slim` | renaming a class in app.js or ui.js breaks the tucked deck silently |
| The level is read in two shapes | `level` and `advancedBeats` (`settings.js storedPair`) | new code should read `level` (or `advancedBeats` for "Advanced on"); both stay in step only through `setSetting` |

**Stale bits found:**

- `dialogs.js` opening comment: "the app's four `<dialog>`s"; there are 33.
- `app.js` header comment lists "help.js, sequencer.js (screens)" as the
  module list; long out of date.

## Invariants and gotchas

| Rule | Why | Guard |
|---|---|---|
| Open every dialog with `dialogs.js openDialog`, never `showModal()` | `onDialogOpen` watchers (the sheet's tip, nudge reaches, usage) and focus return depend on it | machine check below; no test today |
| Wire every dialog with `setupDialog` once | one closing behavior, focus handed back | none |
| Only app.js builds screens | one composition root; modules never import app.js | `tests/modules.test.mjs` (no cycles); machine check below |
| Every `#id` the code looks up exists in `index.html` | app.js passes elements by id | `tests/modules.test.mjs` |
| A notice line that should fade needs `.lib-note` or `.set-note` **in `index.html`** | app.js observes only lines present at start | none. Note `#pin-note` and `#cloud-list-note` fade after 6 s too |
| Kids level is set at the welcome's end | `applyKids` closes every dialog, the welcome included | `tests/welcome.test.mjs` |
| A first step must check `firstStepsOn()` | the stand-in page and `just look` must open as a plain device | `tests/welcome-existing.test.mjs` |
| Only `markNew` makes someone "new" | people from storage, the cloud or a backup are never welcomed | `tests/welcome-existing.test.mjs`, `tests/welcome.test.mjs` |
| A new toolbar screen needs: `SCREENS`, `MODES`, a `[data-screen]` button, a `HELP` part with `screen`, `SCREEN_HINTS` for touch and mouse, a `body.screen-*` rule if styled | the bar, Help and the footer each list screens | `tests/help.test.mjs`, `tests/four-tabs.test.mjs` |
| Every localStorage key read at start goes in `tests/startup-remembered.test.mjs` | a remembered choice once stopped the app starting | that test |
| A control without visible text needs `aria-label` | its tooltip and its usage name come from it | `tests/tooltips.test.mjs` |
| Help's labels must be real labels | Help never lies | `tests/help.test.mjs` |
| `applyKids` returns before `seq` exists | settings that fire during init must not switch screens | none |
| `onSetting` remembers the value at registration | `followPerson` tells only changed settings; a listener registered late hears only later changes | `tests/levels.test.mjs`, `tests/skins.test.mjs` |
| `grownUp` lasts for the page, across people | a grown-up let out stays out for every Kids-level person until reload | provisional (questions.md Q63) |
| `body[data-locked]` hides `<main>` only | the toolbar is drawn but inert behind the modal PIN pad or chooser | `tests/who-now.test.mjs` (the attribute); nothing checks the toolbar |
| The banner lives in `<main>` | `body.kids` hides it with `<main>`; notices raised in 🧸 Kids are not seen unless a dialog is open to host it | by design (styles.css comment) |
| Wait for `ready` | tests that start the app | `tests/app-ready.test.mjs` |

## Recipes

**Add a toolbar screen.** `app.js` `SCREENS`, `MODES` and `SCREEN_HINTS`
(both devices); `index.html` a `[data-screen]` button in a `.mode`, and its
`<section>`; `setScreen` (show or hide it; stop what plays on leaving);
`help.js HELP` a part with `screen`; `tips.js tipsScreen` and `firsts.js
TIPS` if it gets a tip; styles.css (Toolbar, the section, Wide screens);
`tests/four-tabs.test.mjs`, `tests/help.test.mjs`.

**Add a dialog or sheet.** `index.html` `<dialog id>` with a `[data-close]`
✕; in its module `setupDialog` once and `openDialog` to open; a line in ❓
Help; check `just look` at every width. If it should count as a reach or
show a tip, use `onDialogOpen`.

**Add a notice or an Undo.** `showNotice(text)` for a fact;
`showBanner(text, { action: { label: '↩️ Undo', fn }, onClose })` for an
Undo, forgetting the undo state in `onClose`. Tests ask `tests/banner.mjs
hasUndo`.

**Add a one-time tip.** A `tip-…` id and its line in `firsts.js TIPS`; a
call to `tips.js showTip(id)` at the moment it matters (or in `tipsScreen`
for a screen's first visit); `tests/tips.test.mjs`. 💡 Show tips again
brings it back by its `tip-` prefix. A hint dot: a `DOTS` entry and a CSS
`[data-hints~="…"]` rule.

**Add something a level changes.** Read `getSetting('level')` (or
`advancedBeats` for Advanced) and redraw in `onSetting('level', …)`; mark the
Help line `adv: true`; update `settings-ui.js LEVEL_HINTS`. For "Kids is on
screen" use `kids.js kidsShowing`, not the level.

**Add a pad skin.** `skins.js SKINS`; a `@scope` block in styles.css "Pad
skins"; Help's 🎨 Look sentence; `tests/skins.test.mjs` (the list), the
contrast suite.

**Add a backdrop.** A tile `web/bg/<name>.svg`, its name in `backdrop.js
BACKDROPS`, the file in `sw.js` `SHELL`; `tests/backdrop.test.mjs`.

**Add an emoji chooser.** A short grid plus `emojiMore({ grid, onPick,
stateOf })`; draw `withCurrent(short, current)` and end the grid with the
returned `button`; call `reset()` when the chooser opens.

**Add a page key.** `app.js bindEvents`' keydown, after the dialog and
text-field checks; Help's Pads keyboard line; for 🧸 Kids,
`kids.js kidsKeydown`.

**Add a remembered choice.** `util.js remember`/`recall`, read with a
default; a line in `tests/startup-remembered.test.mjs`.

## ✅ Checked by tests

The claims above marked as checked are tests in `tests/architecture.test.mjs`. When one fails, change this file and the test in the same commit as the code.
