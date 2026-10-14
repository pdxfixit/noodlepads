# 0012. A sound's knobs are stored as `tweaks`, and a voice is knob settings

- **Status:** Accepted
- **Date:** 2026-10-11 (Tweaks); rewritten 2026-10-11 for Knobs, for own voices that travel, and for Layers (Knobs and Shape it merged, with mute)
- **Decided by:** Ben, 2026-10-11: basic tweaks on the plain sound sheet, so a kid can make their voice deeper "without the full monster effect". Then: "the tweaks are basically the same as some of the voice buttons. maybe those are presets of their own" — he approved Design 1 of `docs/design/unified-sound-shaping.md` ("Voices are knob settings"), with "close is fine" for the built-in voices. Then (Q42c) Knobs and Shape it "permanently merged if it makes sense… The shape it layer bit is great; I'd like to have an interface similar to beats". The storage shape is the agent's call.

**In short.** A sound's simple changes are ten **knobs**, stored as `tweaks` (the field keeps its first name), only what moved from normal. A voice is a set of knob positions: tapping one moves the knobs, and a sound stores only the positions, never which voice. Sounds saved with old voices (`voice`, `amount`, `fx`) keep them and sound exactly the same. Backups and the cloud carry `tweaks` with no format change; an older app drops the knobs it doesn't know. A kid's own voices travel with the person. On the sheet, the knobs and the kid's own steps are one list of **Layers**, in the order they play, each one mutable: a muted layer keeps its setting and doesn't play (`muted`, `off`).

## Context

- The sheet stored a sound's voices and Shape it steps as a chain (`voice`, `amount`, `fx`), and Tweaks beside it. The two overlapped: Backwards twice played forwards, Stadium plus Echo was mush, Chipmunk plus Deeper stretched twice (the design doc's §1.4).
- Stored formats are kept by users (AGENTS.md "The code").

## Decision

- **`tweaks`** on a recorded sound and on an edit of a kit sound, each key one fixed slot: `pitch` (−24 to 24 notes, length kept), `speed` (−4.3 to 3 doublings: about ¹⁄₂₀× to 8×, pitch kept), `echo` (0 Off, 1 Room, 2 Hall, 3 Echo), `volume` (−2 to 2), `warble` (0 to 2), `backwards: true`, `tone` (−2 Muffled to 2 Bright), `robot` (0 Off, 1 Robot, 2 Metal), `crunch` (0 to 2), `stutter` (0 Off, then 2, 3 or 4 repeats). Missing means normal; all normal stores no `tweaks`.
- **`special`**: `clones`, `walkie` or `boom`, the ✦ part of Clones, Walkie-talkie and Monster that no knob makes (Ben, Q5). One slot.
- **`first: true`**: the knobs play before the chain. The sheet sets it on sounds with knobs and a chain, unless the sound was saved with old voices and tweaks (they keep playing after it, as they did).
- **`muted`**: the knob keys (and `special`) whose layer is muted, in play order, only for knobs that are set. A muted step in the chain has `off: true` (`cleanStep`), and a single muted voice is stored as `fx` so the flag stays. Both are additive: an older app drops them and plays the layer.
- **Cleaning:** `cleanTweaks` in `web/tweaks.js`, used by the sheet, `model.overrideFor` and `backup.js` `cleanBackup` (so backups, older sounds found and cloud pulls). Numbers are clamped and rounded; anything else is dropped.
- **Playing:** `tweakSteps` turns the knobs that play (`playingTweaks`: muted ones left out) into existing steps (stretch, pitch, repeat, reverse, tone, ring, crunch, wobble, squash, echo, room) plus a `special` step `voices.js` renders; `renderPlan` puts them before or after the chain; Quiet and Quietest turn the finished sound down. The render cache key adds `~…` only when there are knobs; the first five knobs key as they did.
- **Voices** (`web/voice-knobs.js`): each built-in voice is the knobs it uses (Chipmunk = pitch +9, speed 1.74×). A second voice adds on top; the last tap wins a shared knob. ⤢ Turn into knobs changes an old sound's voices into knobs when the kid taps it.
- **A kid's own voices:** IndexedDB `voices` (database version 13): `{id, personId, name, emoji, knobs, created, used, edited?}`, per person with a random `voice-` id. They are a cloud record kind (`voices`, in `CLOUD_KINDS` and the Worker's `KINDS`; the records table takes any kind, so no migration) and a backup store (format stays 1.1: an older 1.x copy skips it). Cleaned by `cleanMyVoice`. Merged by id with no second copy: when two devices changed one voice, the newer `edited` (a rename) wins and the latest `used` stays. Their names are blanked in problem reports. The one-tap move carries none: the old address never had them.
- **Layers:** the sheet's one section of rows, styled like Beats' rows, in the order they play (`layerRows`): the five main knobs always, other knobs once set, added (+ Add a layer) or moved by hand, a ✦ special part where it plays, then (Advanced) the chain's steps, before the knobs where the knobs play after the chain. Knob rows edit `tweaks`, step rows edit `fx`. `renderPlan` and `recipeKey` leave muted steps out (`playingChain`), so a muted layer sounds and caches like none. The live loop renders knobs that play first into its head, and puts knobs that play after into its live tail when each can play live (`livePlan`); a muted step never plays live.

## Options turned down

- **Knobs as more steps in `fx`.** No new field, but an older app would play them as steps it can't place, and the sheet could not tell knobs from Shape it's own steps.
- **Converting old sounds on load.** The knobs make the built-in voices close, not the same: a saved sound would change without anyone touching it.
- **Storing which voice made a sound.** Deleting a kid's voice would then change sounds, and a shared sound would need the voice too.

## Consequences

- An older copy of the app plays the five first knobs and Backwards (clamped to its ranges) and drops the rest, and plays them after the chain.
- The live loop (a slider held on a live step) plays the knobs too. For a sound whose knobs play after its steps and include one that can't play live (pitch, speed), a held slider renders on release instead.
- A voice used on two devices between syncs is still one voice; a voice renamed on both keeps the newer name.
- Very wide knob combinations clamp in the one stretch (¹⁄₂₀× and 8× are its limits).
- An older copy of the app plays a muted layer: it drops `muted` and `off`.
