# Questions

Open questions for Ben only, one short card each (80 words at most, detail linked). Recommendation first.

When Ben answers, record the answer in [decisions.md](decisions.md) (and an ADR if it is significant), and delete the card, in the same commit. Smaller calls an agent makes are not logged here: the agent makes them and says so in its report (Ben, 2026-10-12).

## Open

From the council's first round (2026-10-26, `docs/council.md`), asked in the chat one at a time; a card is deleted when its answer is recorded. Cards marked ⛔ are blocks against one of your rules: the seat stopped the work, and only you can uphold or overrule it.

### Q65. Save a beat or song as an audio file (WAV), with no cloud needed?

**Recommend:** yes, as ⬇️ Save as audio file beside 🔊 Save as a sound.
The amateur and producer seats' biggest gap: "send my sister what I made" today needs a cloud share code. The render and the download already exist. New scope, so it's yours. A MIDI export for real studios could follow later.
**Answer:**

### Q66. Swing for everyone, and on the eighths?

**Recommend:** yes: Swing moves to Regular, swings eighth notes (most grooves' hats), and Lo-fi and Boom bap carry it.
Now Swing is Advanced only, swings only sixteenths, so it does nothing audible on most grooves, and a beat saved with Shuffle plays straight for a Regular person. The producer and amateur seats both raised it.
**Answer:**

### Q67. 🧸 Kids' first impressions: startle sounds, and an empty first beat?

**Recommend:** move 💥 siren, alarm, airhorn, 😈 and buzzer to the last Kids page; start the first Kids beat with a simple kick and snare lit.
The child psychologist: startle sounds frighten some 3-year-olds. The music educator: the first ▶️ plays silence; a lit groove teaches pattern first. The second changes "the scratch starts empty" for Kids only.
**Answer:**

### Q68. Do a kid's own sounds, beats and songs carry over to v2?

**Recommend:** yes, so I write the formats down now (a format spec, plus fixed sample files every version must load).
ADR 0001 carries only `boards.json` and the clips. The Android and architect seats: everything a family made lives only in JS's meaning of it, with no spec. Also: does v2 use the same cloud, and what is its lowest Android version?
**Answer:**

### Q69. Names of real products: 808, Motown, Chrome and Edge.

**Recommend:** rename "808" to "Boom bass" and "Motown" to "Detroit soul"; keep "Chrome or Edge", which says where 🎧 From a song works.
The mission keeper blocked "Spotify, YouTube" in 🎧 From a song's text; I reword that now either way. 808 is a drum machine, Motown a record label. Naming a browser is a technical requirement.
**Answer:**

### Q70. Add one Cloudflare rate-limit rule on `/api/*`, per IP at the edge?

**Recommend:** yes. The app still never sees or stores an IP.
The security seat: one client can drain the shared daily caps (50 profiles, 5,000 pushes, 500 shares) and stop every family's sync until midnight UTC. The edge rule is the only fix that needs no IP in the app. It's a zone setting, so it's yours to add.
**Answer:**

Ben's own open decision (how v2 does the voices) is in `TODO.md` "Ben does".

## Card template

```markdown
### Q<n>. <The question>

**Recommend:** <option>, because <reason>.
<What it is and where it shows. What each option changes, costs and risks.>
**Answer:** <Ben types here>
```
