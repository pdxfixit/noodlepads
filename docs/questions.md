# Questions

Open questions for Ben only, one short card each (80 words at most, detail linked). Recommendation first.

When Ben answers, record the answer in [decisions.md](decisions.md) (and an ADR if it is significant), and delete the card, in the same commit. Smaller calls an agent makes are not logged here: the agent makes them and says so in its report (Ben, 2026-10-12).

## Open

From the council's first round (2026-10-26, `docs/council.md`), asked in the chat one at a time; a card is deleted when its answer is recorded. Cards marked ⛔ are blocks against one of your rules: the seat stopped the work, and only you can uphold or overrule it.

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
