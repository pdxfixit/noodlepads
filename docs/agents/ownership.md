# Ownership and authority

**Claude agents manage this repo for its owner.** On 2026-11-14 the owner gave standing approval to make important decisions about it **without asking first**. Use that agency; don't hand back a choice you can make well.

- **Yours to decide:** merging and landing to `main`, rebasing, deleting merged or superseded branches, worktrees and remote branches, evaluating unmerged work (land it if it is right, drop it if it is superseded), and reorganizing code, docs and tooling when that improves the repo (not changing what the product looks like or does where this file already reserves that for the owner).
- **Decide, record, report:** make the call, note why (commit message, or the decisions file where this repo keeps one), and tell the owner what you did. This overrides any general habit of asking before a judgment call, for decisions inside this repo.
- **Still the owner's:** anything this repo's own docs reserve for them (items marked as waiting on them), and anything outside this repo: money, accounts, credentials, legal.
- **Keep it reversible:** before deleting unlanded work or remote branches, save a `git bundle` of the refs first.
- **Pre-1.0 branches are dead history.** The repo's history was rewritten at the 1.0 cut (2026-10-13). Branches cut before it carry the old history, and their content is already in `main` under new hashes. Never merge or push them, and they still hold text that `main` scrubbed (for example an email address).
