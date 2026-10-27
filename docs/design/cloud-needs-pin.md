# The cloud needs a PIN

**Status:** a plan and a mockup for Ben's OK (2026-10-26). Nothing here is built. The rule is Ben's (decisions.md, Hosting and data: "The cloud needs a PIN"); this file says how it would work, what it touches, and what is still his to pick.

**Answer first.**

- **Nobody goes to the cloud by themselves any more.** A new person, and everyone already on a device, stays on that device until a grown-up turns their ☁️ on.
- **Turning ☁️ on is three steps:** the grown-up sum, a new PIN (typed twice), and one line on that PIN pad saying what becomes public. Then they are in the cloud, synced, with 🔑 Remember offered.
- **Leaving the cloud is Remove PIN** (or ☁️ off, the same thing): a red second tap asks first, then the PIN; their cloud copy is deleted and this device keeps everything.
- **The Worker makes, lists and opens only profiles with a PIN**, refuses a PIN removed through the API, and treats any profile without one as not there.
- **No migration, no stored-format change, no backup change.** All three live profiles have PINs already.

## 1. What a kid and a grown-up see

The screens below are rough: drawn on a throwaway draft, then the draft was thrown away. Each is at 320, 375 and 1100 px.

### Turning ☁️ on

1. **👥 People → tap someone.** Their profile sheet shows ☁️ In the cloud, switched off: "Only on this device. A grown-up can put them in the cloud with a PIN, to open them on any phone or tablet." The 🔒 PIN part is gone until they are in the cloud: a PIN now means the cloud, so there is nothing to set on its own. ⬇️ Back up stays.

   | 320 | 375 | 1100 |
   |---|---|---|
   | ![off, 320](cloud-needs-pin/1-off-320.png) | ![off, 375](cloud-needs-pin/1-off-375.png) | ![off, 1100](cloud-needs-pin/1-off-1100.png) |

2. **Tap the switch: the grown-up sum** (`grown-up.js askSum`, the same one ⚙️ in 🧸 Kids and Feedback ask), with one new line under its title saying why: "☁️ To put 🔔 Happy Giraffe in the cloud". A wrong answer says so and asks another (`stay: true`, as Feedback does); three wrong in a row start the 30 s wait. ✕ or Esc leaves the switch off and sends nothing.

   | 320 | 375 | 1100 |
   |---|---|---|
   | ![sum, 320](cloud-needs-pin/2-sum-320.png) | ![sum, 375](cloud-needs-pin/2-sum-375.png) | ![sum, 1100](cloud-needs-pin/2-sum-1100.png) |

3. **The PIN pad: "☁️ Pick their PIN"**, with the one line on what becomes public in a box of its own over the dots:

   > Anyone on noodlepads.com can see their fun name and picture, and play a sound of theirs if they have its link.

   Under the title: "Four numbers, asked each time they are opened, on every device." Then **Once more**, as every new PIN is typed twice (decisions.md); a second that doesn't match says so and starts again. ✕ at either pad leaves them on this device and sends nothing: the profile is made only after the second pad.

   | 320 | 375 | 1100 |
   |---|---|---|
   | ![PIN pad, 320](cloud-needs-pin/3-pin-320.png) | ![PIN pad, 375](cloud-needs-pin/3-pin-375.png) | ![PIN pad, 1100](cloud-needs-pin/3-pin-1100.png) |

4. **Done.** The profile is made with the PIN in one request, then synced at once ("Putting them in the cloud…", then "In the cloud ✓ Opens on any phone or tablet, with their PIN."). The PIN pill says "✅ In the cloud, PIN set" for 3 s, then "🔒 PIN on". The PIN part shows Change PIN, Remove PIN and 🔑 Remember on this device, with "Removing it takes them out of the cloud." Then **🔑 Remember them here?** opens, the same offer a PIN open makes (question 3).

   | 320 | 375 | 1100 |
   |---|---|---|
   | ![done, 320](cloud-needs-pin/4-done-320.png) | ![done, 375](cloud-needs-pin/4-done-375.png) | ![done, 1100](cloud-needs-pin/4-done-1100.png) |

What can go wrong on the way, and what it says:

| Case | What happens |
|---|---|
| No network, or the cloud resting | The switch stays off; the line under it says `cloudTrouble`'s sentence ("The cloud isn't reachable from here…"). The PIN typed is not kept: the next try asks the sum and PIN again. |
| They are already in the cloud (restored here from a backup, or the profile is still there from another device) | The Worker answers 409. The app opens it with the PIN just typed; a different PIN there gives 401, and the person is linked locked: "Already in the cloud with a PIN. Type that one to join up." (as today's `putInCloud`). |
| 10 new profiles today, or 1,000 in all | 429 / 507, said as today; the switch stays off. |

### Someone who made things before this ships

They stay on the device. Nothing of theirs is sent, nothing is deleted, and no notice interrupts the kid. Their profile sheet shows the switch off with the line above. A person already in the cloud (all three live profiles, each with a PIN) is unchanged on every device.

### Leaving the cloud

- **Remove PIN** turns red on the first tap: "Leave the cloud?", with the note "Tap again, then type the PIN: their cloud copy is deleted for every device. This device keeps everything." The second tap asks the PIN, then deletes the profile (`DELETE /api/profiles/:id`, key and PIN, as ☁️ off does today), drops the link and the bases, and the sheet shows the switch off.
- **☁️ off** does exactly the same, with the same words, from the switch.
- **Undo:** none (question 1). Everything stays on this device, so a slip costs the sum, a new PIN, and the share codes they had made (deleted with the profile, as today).
- Other devices with them: the next sync gets 404 `profile`, drops the link, and keeps what that device has, as today.

| 320 | 375 | 1100 |
|---|---|---|
| ![leave, 320](cloud-needs-pin/5-remove-320.png) | ![leave, 375](cloud-needs-pin/5-remove-375.png) | ![leave, 1100](cloud-needs-pin/5-remove-1100.png) |

(The leave shots are on a device that remembers the PIN, so their PIN part shows "Forget this device"; the words on the red button and the note are the point.)

**Change PIN** is unchanged: the current PIN, then a new one twice. **🗑️ Delete** in the red box is unchanged: two taps delete them here; then ☁️ Delete their cloud copy too asks "☁️ Tap again to delete their cloud copy" first (`left.asked`, `unaskCloud()` and the `left?.id === id` branch in `people.js onProfileClick`, commit 2962615), and only the tap after it asks the PIN and deletes. That ask stays for everyone (Ben): with every cloud profile now holding a PIN, the PIN pad comes after the "Tap again", never in its place. The plan does not touch that code.

### Opening from the cloud: unchanged

👥 People's ☁️ Open from the cloud, and the welcome's ☁️ Open from the cloud beside Skip, work as now. Every profile listed has a PIN, so every pick asks it; 🔑 Remember is offered after. The 🔒 badge on each line stays (it is true of all of them now).

### On another device: keys and 🔑 Remember

Nothing changes. A PIN is asked on every open on every device unless 🔑 Remember holds (90 days). A device linked before this ships keeps its key. A PIN changed elsewhere still asks here once ("They have a new PIN"), with 🤷 I don't know the PIN.

## 2. The Worker

| Request | Today | After |
|---|---|---|
| `POST /api/profiles` without `pin` | 201 | 400 `{error: 'needs pin'}`. `cloudTrouble`: "A grown-up puts someone in the cloud, with a PIN, in their profile." |
| `POST /api/profiles` with `pin` | 201 | unchanged (the app sends it now; cloud-smoke already does) |
| `GET /api/profiles` | every profile, newest 300 | `AND pin_hash IS NOT NULL` in the same SQL, before the 300 |
| `POST …/open` on a profile with no PIN | a key | 404 `profile`, as if it were not there (`getProfile` filters on `pin_hash IS NOT NULL`) |
| Any keyed route (pull, push, sounds, shares, PATCH, DELETE) for a profile with no PIN | works | 404 `profile`: `keyProfile`'s one `SELECT` joins `profiles` and reads `pin_hash IS NOT NULL`, so it costs no extra query. The app's 404 path drops the link. |
| `PATCH` with `newPin: null` (Remove PIN through the API) | clears the PIN, every key deleted | 400 `{error: 'needs pin'}`. Nothing changes. The app leaves by `DELETE`, which already needs the key and the PIN. |
| `GET /api/sounds/:id`, `GET /api/shares/:code` | public | unchanged |

A profile with no PIN can then exist only by hand (`just cloud-sql`). It is unreachable and unlisted; `just cloud-profiles` marks it "🔓 no PIN", and Ben prunes it.

**`just cloud-reset-pin`** no longer clears a PIN (done, 2026-10-27): it always sets a new random one, shown once for Ben to pass on (Ben: never 1234).

## 3. The deploy checks

- **cloud-smoke** already makes its throwaway profile with a random PIN. Add two steps: a create without a PIN is refused 400 `needs pin`; a `PATCH newPin: null` is refused and the PIN still opens it.
- **cloud-e2e** today relies on a person going up by themselves (`syncAll`), which ends. New steps:
  1. A makes the person and a beat and a sound, runs `syncAll`, and checks the person is **not** in the cloud (no link, `GET /api/profiles/:id/open` 404). This is the rule itself, checked live.
  2. A puts them up with a PIN through the same function the switch calls after the sum and the pads (`cloud.js goUp(personId, pin)`).
  3. B opens them from the ☁️ list with `data-pin="true"`, typing the PIN on the real PIN pad (`#pin-keys`), then says Not now to 🔑 Remember.
  4. Clean-up: the fallback that opened the profile with no PIN opens it with the PIN; the "a device's own first person went to the cloud too" branch goes, since that can't happen now.
- `just taps` is untouched.

## 4. Older copies of the app

The service worker serves the network first, so a reload gets the new app. A tab left open from before:

- its `syncEveryone` tries to put someone up without a PIN and gets 400: that person shows ☁️⚠️ with the sentence above until the tab reloads. The update bar asks for that reload within 10 minutes.
- its Remove PIN gets 400 and says so; nothing is lost.
- its ☁️ switch on gets the same 400.

No device holds a link to a profile without a PIN today: before deploying, check `just cloud-sql "SELECT id FROM profiles WHERE pin_hash IS NULL AND id NOT LIKE 'p-smoke-%' AND id NOT LIKE 'p-e2e-%'"` returns nothing (reads only).

## 5. Every file to touch

| File | Change |
|---|---|
| `worker/cloud.js` | `makeProfile` needs `pin`; `listProfiles`, `getProfile` and `keyProfile` see only profiles with a PIN; `changeProfile` refuses `newPin: null`. |
| `web/cloud.js` | `wantsCloud` goes, and `syncEveryone` puts nobody up. `putUpNow` becomes `goUp(personId, pin)`: `funNamed`, `api.create` with the PIN, the link saved with `pin: true` and `check`, `unlocked` and `pinTyped` set, then `syncNow`. 409 → open with the PIN; 401 → linked locked. `setOffline` becomes `leaveCloud(personId, pin)`: delete, then drop the link. No more `offline` writes; `isOffline` goes (an old record's `offline: true` is ignored and kept). The 404 `profile` path drops the link only. `setPin(…, null)` goes. |
| `web/cloud-sync.js` | `hasMade` and `MADE` go (their only reader was `wantsCloud`), with their tests. |
| `web/cloud-ui.js` | Switch on: `askSum` with `why`, then `askNewPin` with the public line, then `goUp`, then `offerRemember`. Switch off and Remove PIN: armed "Leave the cloud?", then the PIN, then `leaveCloud`. `askPin` gets `shown` (the boxed line). `cloudText` and `drawPin`: the new lines; the PIN part hidden while not in the cloud; `#cloud-pin` (🔒 Set a PIN) goes. `cloudLabel`: no ☁️ bit for someone only on this device (today a bare ☁️ meant "not yet"), ☁️✓ 🔒 in the cloud. `FORGOT_PIN` unchanged. |
| `web/cloud-api.js` | `cloudTrouble` for `needs pin`. |
| `web/grown-up.js` | `askSum({ why })`: the line under the title, hidden when empty. Its header comment names the third asker. |
| `web/index.html` | `#kids-sum-why`; `#pin-public`; an id on the PIN part; `#cloud-pin` goes; the comments over the sum and the profile sheet. |
| `web/styles.css` | `.kids-sum-why`, `.pin-public` (a chalk box, as in the mockup). Contrast suite stays green: chalk and ink are in it. |
| `web/people.js` | `alone = isOffline(...)` becomes `!inCloud(...)`; the header comment. Delete's "Tap again" on the cloud copy (`left.asked`, `unaskCloud`) stays exactly as it is; `left.pin` is now always true for someone in the cloud, so its key-only branch (`key: pin ? null : keyOf(id)`) only serves a link from before. |
| `web/help.js` | The ☁️ In the cloud line (a grown-up turns it on, with the sum and a PIN; Remove PIN or ☁️ off leaves), the 🔒 Set a PIN line goes, the Change PIN / Remove PIN line says Remove PIN leaves the cloud. |
| `web/log-clean.js`, `web/track-page.js` | `cloud {up: true}` and `cloud {left: true}` in `RULES.cloud`; `appEventOf` maps them (`'up'`, `'leave'`) in place of `put`/`offline`. `put` and `offline` stay readable for old logs. |
| `web/privacy.js`, `README.md` | Section 7. |
| `web/state.js` | The comment naming `wantsCloud`. |
| `tools/look-cloud.mjs` | Section 3. |
| `tools/look.mjs` | Views `cloud-off`, `cloud-sum`, `cloud-pin`, `cloud-leave`; `cloud` and `cloud-in` follow the new sheet. |
| `tools/cloud_admin.py`, `justfile` | `profiles` marks a profile with no PIN (`reset-pin` already never clears one). |
| `docs/adr/0002-…md` | Rewritten: section 6. |
| `docs/decisions.md` | Row "The cloud needs a PIN" loses "(to build)"; the ☁️ switch row (2026-10-19) is replaced by this flow; the forgot-PIN row loses "(or clears it)"; "Profiles live in the cloud" says "people a grown-up put there"; the sprawl row's "Nobody who has made nothing goes to the cloud" goes (moot). Each as Ben's rule already says; no new rule but the three answers in section 9. |
| `docs/architecture/cloud.md` | "Who goes to the cloud", the routes table, "Three meanings of offline" (📴 Offline goes: two meanings left), the privacy-vs-code table, the link's readers. `tests/architecture.test.mjs` with it. |
| `docs/guide.md`, `docs/design/cloud-profiles.md`, `docs/how-to.md`, `docs/state.md`, `CHANGELOG.md`, `TODO.md` | Say what is true after; state.md's "In flight" line and TODO's line go when it lands. |

## 6. ADR 0002, rewritten

Same title and number (Ben: "we don't need historical ADR"). What changes:

- **In short:** "Everyone who makes something is a profile…" becomes "A person goes to the cloud only when a grown-up puts them there, with a PIN; everyone else stays on their device."
- **Decision:** "Offline is the exception" is replaced by **"The device is the default."** New people stay on the device. ☁️ on asks the grown-up sum, a PIN typed twice, and shows one line on what becomes public. Removing the PIN deletes the cloud copy. **PIN:** required, 4 digits; the Worker makes, lists, opens and serves only profiles with one.
- **Options turned down** gains: "Everyone up once they make something, Offline as the way out (2026-10-11 to 2026-10-26): a kid's voice went public with no grown-up step." It loses "Putting people in the cloud by a tap: Ben chose everyone". New: "A PIN optional in the cloud: the list would show profiles anyone could open." "A grown-up account or email: collects what a family toy should not."
- **Consequences** gains: fewer profiles in the list and on the free plan; a grown-up step before a second device works; a person never put up has no cloud backup (⬇️ Back up is the way).
- **Decided by** adds Ben, 2026-10-26.

## 7. Privacy: `web/privacy.js`, README, the shared policy

`tests/privacy.test.mjs` keeps README's list equal to `PRIVACY`. Changes, word for word:

- First line → "Nobody goes to the cloud by themselves. A grown-up puts someone there: ☁️ In the cloud in their profile, a sum, then a PIN for them."
- "A PIN is not security…" → "Everyone in the cloud has a PIN. It is not security: it only stops someone opening or changing a profile in the app."
- "People with ☁️ In the cloud switched off stay on this device only." → "Everyone else stays on this device only. Remove PIN, or switching ☁️ In the cloud off, deletes their cloud copy and keeps this device's."
- The deleting line keeps "then ☁️ Delete their cloud copy too twice" and ends: "…or Remove PIN, or switch ☁️ In the cloud off (tap it twice), to keep this device's own copy. Each asks for their PIN." (no "if it has one").

The shared policy (pdxfixit/privacy) says the same in the same change; TODO's "The privacy site pulls Noodle Pads' policy from this repo" makes that one file once it lands. README's feature line: "each person's board follows them to any device once a grown-up puts them in the cloud with a PIN."

## 8. Migrations, stored formats, backups

- **D1:** none. `pin_hash` already exists; the rule is in the Worker's SQL.
- **IndexedDB:** none. The `offline` field on people records is left as it is (ignored).
- **Backups:** none. A backup carries no link; a restored person stays on the device until a grown-up turns ☁️ on (the 409 path joins the existing profile).

## 9. Tests

Each fails without its change (`just prove`):

| Test file | What it checks |
|---|---|
| `tests/worker-cloud.test.mjs` | create without a PIN → 400; the list leaves out a profile with no PIN (one put in by SQL); open, pull and push on it → 404; `PATCH newPin: null` → 400 and the PIN still opens it. Its helper makes every test profile with a PIN. |
| `tests/cloud-ui.test.mjs` | the switch asks the sum first; a wrong sum leaves it off and sends nothing; ✕ at the sum, the first pad or Once more sends nothing; the right sum and a PIN twice make one `create` carrying the PIN; the first pad shows the public line; Remove PIN arms, then asks the PIN, then deletes, and every record is still here. |
| `tests/delete-cloud.test.mjs` | unchanged and still green: ☁️ Delete their cloud copy too asks "Tap again" before the PIN, for a person who went up through the new flow too. |
| `tests/cloud-sync.test.mjs`, `tests/new-ids.test.mjs`, `tests/pin-new.test.mjs`, `tests/sync-timing.test.mjs` | a person with sounds is not put up by `syncAll`; the tests that relied on it put up with `goUp`. |
| `tests/privacy.test.mjs`, `tests/help.test.mjs`, `tests/architecture.test.mjs`, `tests/log-clean.test.mjs` | the new lines, labels, claims and log fields. |
| `tools/test_cloud_admin.py` | `profiles` marks no PIN. |
| `just look --wide` | the four new views and `cloud-in`; `--height 680` for the PIN pad at 320. |
| live, after the deploy | cloud-smoke and cloud-e2e (section 3). |

## 10. Council

The TODO line asks for the architect, storage-sync, privacy-safety, security, parent and kids-ux seats on this plan, and AGENTS.md asks all seats on a new control at the mockup. Not convened yet: brief them blind with this file and the screenshots.

## 11. Risks

| Risk | Size | Answer |
|---|---|---|
| A kid of 7 or more answers the sum (12 to 39 plus 6 to 9) | medium | The sum is the agreed grown-up step (Kids, Feedback). The PIN then guards the profile anywhere. A harder gate is a new decision, not this change. |
| A grown-up forgets the PIN just set | low | The email path, as now; the device keeps everything either way. |
| A tab from before the deploy shows ☁️⚠️ for someone | low | It reloads on the update bar's 🆕; nothing is lost. |
| Remove PIN by mistake deletes share codes | low | The red second tap and the PIN first; question 1. |
| Fewer kids reach a second device | intended | Ben's rule. The welcome's ☁️ Open from the cloud still works for anyone a grown-up put up. |

## 12. Open questions for Ben

1. **Undo after leaving the cloud?** Recommended: **no Undo**; the red second tap and the PIN ask first, and this device keeps everything. A real Undo would have to hold the delete back (about 8 s) and finish it if the page closes, and could still not bring back share codes made earlier. Option B: that delayed Undo, about 2 hours more.
2. **Two doors to leave: ☁️ off and Remove PIN?** Recommended: **keep both**, saying the same words, since a grown-up looks for "cloud" at the switch and Ben's rule names Remove PIN. Option B: Remove PIN only, the switch shows on but turns off only through it (one door, but a switch that won't switch).
3. **Offer 🔑 Remember right after the grown-up sets the PIN?** Recommended: **yes**, the same offer a PIN open makes: the device where a grown-up sets it up is usually the kid's own, and without it the kid is asked the PIN the next time they open themselves there. Option B: no offer; it stays a button in the PIN part.

Calls made here (say if any is wrong): the sum is asked every time the switch goes on, even just after 🧸 Kids' sum; the public line sits on the first PIN pad, not a sheet of its own; a person only on this device shows no ☁️ in 👥 People; the 🔒 PIN part shows only in the cloud; `just cloud-reset-pin` stops clearing PINs.

## Ben's answers (2026-10-26)

- The flow as shown is approved, to build after the bug sweep's cloud branch lands and the six seats have reviewed this plan.
- No Undo after leaving the cloud: the red second tap and the PIN ask first, and the device keeps everything.
- Both ways out stay, ☁️ off and Remove PIN, with the same words ("Leave the cloud?").
- 🔑 Remember is offered right after the grown-up sets the PIN.
- The "Tap again" ask on ☁️ Delete their cloud copy too (2962615) stays.
