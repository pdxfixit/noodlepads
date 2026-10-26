# 0002. A public site on one Worker and one D1 database, with profiles in the cloud and the device as the working copy

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decided by:** Ben, 2026-10-11: profiles live in the cloud; "keep our dependency on cloudflare to a minimum so that we don't abuse the free privileges"; kids no longer type names, and nobody is "Me"; an optional 4-digit PIN, asked each time a person is opened; sound files may be readable; everyone syncs unless set offline; settings travel with the profile; sharing is a share code; no families; a forgotten PIN is emailed; "login sprawl is a concern"; "Update the ADRs so that that's the native decision; we don't need historical ADR"; "i was thinking transitions focus/blur, as well as every 5?m while active. ensure reconciliation of save data is robust and prepared for 3-way merging"

**In short.** Noodle Pads is static files and one Worker on Cloudflare's free plan at `noodlepads.com`, with one D1 database. Everyone who makes something is a profile in one shared, public list, unless set Offline: their sounds, beats, songs and settings follow them to any device. Each device keeps its own full copy in IndexedDB, works offline, and syncs by a three-way merge against each record's last-synced copy, so edits made on two devices both stay. One thing can be shared with a code, read-only, forever. The cost: the kids' sounds and the names they give things sit on Cloudflare, and the list, every sound link and every share code are public. The app says so plainly.

## Context

- Kids use several devices (tablets, phones, a laptop) and want their own board on each, without a grown-up moving a backup file.
- Recording needs https, which the site has. Every Sandberg domain is set up by flarepress (`~/src/flarepress`), on one Cloudflare account, on the free plan.
- Ben wants the smallest Cloudflare footprint and no card on file: no R2, no KV, nothing that could bill.
- Kids type names that could be their own. A list anyone can open must hold no typed name.
- The backup merge (`web/merge.js`, [ADR 0011](0011-backups-1-0-merge.md)) already gathers one person's data from several devices without loss or doubles.

## Decision

- **Hosting:** one Worker, set up by flarepress for `noodlepads.com`: its static assets are this repo's `web/`, its script is `worker/index.js`. Static files are served first; the script owns `/api/…` only. Details in [deploy-cloudflare.md](../deploy-cloudflare.md).
- **One D1 database**, `noodle-pads` (schema `worker/schema.sql`, brought up to date on the live database by `worker/migrations/` and `just cloud-migrate`): profiles, their records, audio in pieces of at most 1.9 MB (a D1 row holds 2 MB), keys, shares, problem reports ([ADR 0009](0009-opt-in-problem-reports.md)) and daily counters. Nothing else on Cloudflare.
- **The device is the working copy.** IndexedDB `noodle-pads` holds everything, and the app never waits on the network. Everyone who has made something syncs on open, 20 s after a change, on every focus and blur, and every 5 minutes while the page is shown and focused; never on a timer while hidden (`web/sync-timing.js`). A sync is a pull, a merge, then a push.
- **Three-way merge.** Each device keeps every synced record as it was at its last sync (IndexedDB `bases`), and merges against it (`web/merge3.js`): a record unchanged on one side takes the other side's; changed on both, it merges field by field, a beat pill by pill and row by row, and the newer edit (each record's `changed` stamp) wins a setting both changed; where no merge is safe, both are kept, as a backup does. Deleted on one side and edited on the other keeps the edit. A push names the rev it pulled, and the Worker leaves any record written since, so one device's push never overwrites an edit it hasn't seen. Backups and the one-tap move keep the backup merge (`web/merge.js`), which has no base.
- **Offline is the exception.** A person set 📴 Offline (this device only) stays on the device, and setting it deletes their cloud copy. Someone who has made nothing never goes up, so a visitor's empty board never fills the list.
- **Settings travel with the person** (Advanced, time signature, pad size, DJ keyboard); problem reports and the device code stay with the device.
- **Profiles are made up.** A profile's name comes from a generator in the code ("Friendly Sloth", "Captain Cranberries") and its avatar from the app's emoji list; the Worker refuses anything else. Nobody types a person's name, and nobody is "Me".
- **Profile ids are random.** A person's id is `p-` and random letters (`newId('p')`), on the device and as the profile's id; the Worker makes, lists and syncs no other (`web/reid.js` `CLOUD_ID`). Older devices kept the plain ids an older boards.json gave, which were the kids' names: on start, each such person gets a random id, and every record, link, remembered choice and address that names the old one follows, in one IndexedDB transaction (`state.js` `reIdStoredPeople`). The cloud renames nothing (Ben, 2026-10-11, Q27: "Drop the rename code"): the two profiles that went up under plain ids were moved while a rename route existed, and checked in D1. A device still linked to a plain-id profile drops the link, and the person goes up as new under their random id.
- **PIN:** optional, 4 digits, a salted PBKDF2 hash; asked each time the person is opened on a device, unless that device remembers it: offered after the PIN, for 90 days or until Forget this device (Ben, 2026-10-26). Five wrong tries, then a 10-minute wait. A forgotten PIN is emailed to the PIN-reset address, and Ben clears it by hand.
- **Sharing is a share code:** 8 characters for a snapshot of one sound, beat or song with a recording of it, read-only for anyone who has the code, forever; the receiver may copy it to their own board, and removing it from their list touches nothing else. No gifts, no families.
- **Public by design:** the list (the newest 300 profiles' fun names, avatars, colors, whether each has a PIN, and when its look last changed), a sound from its unguessable link and a share from its code need no PIN.
- **Free-plan guards** in the Worker: caps on storage (400 MB of sound, 40 MB a profile, 25 MB a sound), on new profiles, pushes, shares and reports a day, and on request sizes; no polling. Sprawl is watched by hand: last activity per profile, `just cloud-profiles` and `just cloud-prune`. The budget is in [the design](../design/cloud-profiles.md) § 2.
- **Backups stay**: a zip still moves everything ([ADR 0010](0010-move-to-noodlepads-com.md)).
- **Headers:** a strict Content-Security-Policy (`connect-src 'self'`), the microphone for this site only, `Cache-Control: no-cache` (`web/_headers`).

## Options turned down

- **R2 for audio, KV for records:** a second and third product, and R2 needs a card on file.
- **Supabase or another backend:** another account and another company holding the kids' sounds.
- **Accounts with email:** collects what a family toy should not.
- **Cloud as the only copy:** the app would stop working offline or when the free plan's daily limit is reached.
- **Last write wins:** loses a kid's edit when two devices change the same beat.
- **The backup merge alone (two-way: fast-forward, else keep both):** every edit made on two devices became a second copy of the beat, and a delete on one device dropped an edit made on the other.
- **Per-field timestamps:** finer than one stamp per record, but every stored format would carry a clock per field; field-by-field merging against a base gets the same result for edits that don't clash.
- **Polling while hidden:** requests with nobody looking; a sync on focus catches up instead.
- **Family-only access (Cloudflare Access), or family codes that filter the list:** accounts, or a filter that reads like protection; Ben chose a public site with honest disclosure.
- **Gifts waiting in another profile:** a share code reaches anyone, with no inbox to manage.
- **Putting people in the cloud by a tap:** Ben chose everyone, with Offline as the way out.
- **A grown-up reset code:** one more secret to lose; an email to Ben is simpler for a family.
- **Typed names with a filter:** no filter catches every real name.
- **Keeping plain ids, only hidden from the list:** the id still reaches the address, kit copy ids, share bundles and every request.
- **Making a new profile for a renamed person:** the PIN can't be copied from a device, and every other device would be left on the old one.
- **A forwarding row from the old id to the new:** it would keep the name in the database.

## Consequences

- The site has a backend to keep healthy: one script, one database, tested with a fake D1 on Node's own SQLite (`tests/fake-d1.mjs`).
- On a day the free plan's limit is reached, D1 refuses work until 00:00 UTC; the app keeps working on the device and catches up later.
- Anyone can see the list, play a sound whose link they have, and play a share whose code they have, forever; the PIN is not security. The disclosure in Settings, Help and README must stay true (`tests/privacy.test.mjs`).
- A schema change is a migration file plus the full `schema.sql`, tested against the live schema (`tests/migrations.test.mjs`).
- A stored-format change needs an upgrade in `store.js`, a backup must still load, and the Worker must accept records from the app in use.
- Each device holds a second copy of every synced record (`bases`, no audio), about the size of the records themselves. A change to a record's shape needs a rule in `merge3.js` if a new field is a list.
- Syncing on focus, blur and every 5 minutes costs about 100 requests an active hour per person on a device: a few percent of the free plan for the family (the design's § 2).
- A device still linked to a plain-id profile (none are live) loses that profile's PIN and its place in it: the person goes up as a new profile, and the old one waits, unlisted, for `just cloud-prune`.
- Revisit if the family wants privacy beyond a PIN, or if usage nears a free limit.
