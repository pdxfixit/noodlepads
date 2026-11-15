# Working with the owner

How to report, when to ask, and how to work while the owner is away. Moved out of [AGENTS.md](../../AGENTS.md) unchanged.

## Working with Ben

**Answers and reports**
- Lead with the answer or the next action. Number multi-step work, give estimates in minutes, keep lists to 5 items, and end with the one next step Ben can take.
- Verify before you assert: check the file, the test output, the live `version.json`. Say "likely cause" until a cause is proven.
- Call agents agents, never people.
- State errors plainly: the cause and the fix.

**Questions**
- For a real judgement call (layout, naming, what a control does), name the options, recommend one, and ask. For a change across several files, give a numbered plan and wait for Ben's OK.
- **Mockups first for a new screen, a new layout or a moved control** (Ben, 2026-10-12): show them (an HTML widget or `just look` screenshots of a draft) and get his OK before building. Fixes and restyles inside an agreed design don't need one.
- **While Ben is in the chat, ask each question as it comes up**, one at a time, and act on the answer (Ben, 2026-10-26: "so that we can solve them instead of a whole bunch at once"). **Before a long build he won't watch, ask every decision up front, in one batch** (Ben, 2026-10-10: "ask questions up front so that you're able to run autonomously longer"). Then run; make the smaller calls yourself and name them in your report, without logging them anywhere (Ben, 2026-10-12: "no need for them to be logged").
- Every question explains itself: what the thing is, where it shows, and what each option changes and costs.
- Ben often answers mid-task. Fold the answer in and say how.

**Doing the work**
- **Use the cheapest model that does the job** (Ben, 2026-10-27): Haiku for searches, docs and small reviews; Sonnet for code and council seats; the strongest model only for design or a hard bug. Pass `model` when starting an agent.
- **Delegate independent work to background agents** in their own worktrees (Ben prefers it: he keeps talking while work runs). Brief each with what to read and what not to touch, then land their commits with `just land` from the main checkout and archive their branches.
- **Record every request the moment it arrives:** a line in [TODO.md](../../TODO.md) "Agents do", or in [docs/state.md](../state.md) "In flight" if you start at once. A request said only in chat is lost when the session ends. Delete the line when the work lands.
- When your task is done, work down "Agents do", quickest first, one commit each.
- Commit and push to `main` without asking; GitHub deploys every push. Ben asked for a deploy after every commit.
- **A cloud session told to work on a `claude/…` branch pushes to `main` too** (Ben, 2026-10-19: "merge to main going forward too"). This line is his explicit permission. Push the branch, then, once `just test` is green, fast-forward `main` to it (`git fetch origin main`, rebase onto it if `main` moved, test again, `git push origin HEAD:main`). Never force-push. Then read the deploy run.
- **Medium- or high-confidence work goes ahead without asking** (Ben, 2026-10-26): fixes, a council seat's asked-for changes and its "beyond this change" findings. Ask only on low confidence, a clash with `docs/decisions.md`, or a new screen or control (mockup first). Name the calls you made in your report.
- Make obvious non-breaking fixes (dead code, a stale comment, a missing label) rather than listing them. Propose instead when it changes what a kid sees.

**Working while Ben is away**
- Do not stop to ask. Pick the option closest to [docs/decisions.md](../decisions.md), name the call in your report, and keep going. [docs/questions.md](../questions.md) is only for questions that need Ben's answer before work can go on.
- Keep [TODO.md](../../TODO.md) fresh in the same commit: delete Ben's items that are done (never tick them: Ben, 2026-10-26) and moot ones, and add new things only Ben can do under "Ben does".
- **Wrangler first, Ben last** (Ben, 2026-10-26): before asking Ben to do anything in Cloudflare, do it with wrangler through the deploy: a binding, rate limiter, Worker secret, route or cron in `site/wrangler.toml`, or a `wrangler` step in `.github/workflows/deploy.yml` (it holds the token; agents never do). Ask Ben only for what wrangler can't reach: the token's own permissions, zone WAF rules, GitHub secrets. Say why when you ask.
- **Keep human-run tests to a minimum** (Ben, 2026-10-16): verify it yourself with tests, `just look` and the live checks. Add no device tries to "Ben does"; what only a person can judge (sound, real touch) stays as "not yet tried on a phone" in [docs/state.md](../state.md), and Ben reports tries as he goes.
