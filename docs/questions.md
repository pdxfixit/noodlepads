# Questions

Open questions for Ben only, one short card each (80 words at most, detail linked). Recommendation first.

When Ben answers, record the answer in [decisions.md](decisions.md) (and an ADR if it is significant), and delete the card, in the same commit. Smaller calls an agent makes are not logged here: the agent makes them and says so in its report (Ben, 2026-10-12).

## Open

### Q1. Hold a sound to open its editing?

**Recommend:** keep a held pad as a loop, and in ✏️ Edit sounds let a hold open the sound's sheet only if it is a long hold that never moved (a drag still moves it), because a held pad looping is the app's first promise.
Ben, 2026-11-18: "on sounds we can hold it to open the editing". A held pad loops (decisions.md "hold to loop"), and in ✏️ Edit sounds a hold starts a drag to reorder. Other ways: a double-tap opens it; or the ✏️ already on each pad in Edit sounds (and on hover) stays the way in.
**Answer:**

Ben's own open decision (how v2 does the voices) is in `TODO.md` "Ben does".

## Card template

```markdown
### Q<n>. <The question>

**Recommend:** <option>, because <reason>.
<What it is and where it shows. What each option changes, costs and risks.>
**Answer:** <Ben types here>
```
