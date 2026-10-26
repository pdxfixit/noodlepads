# 0025. GitHub deploys every push to main; agents hold no Cloudflare credentials

- **Status:** Accepted
- **Date:** 2026-10-15
- **Decided by:** Ben, 2026-10-15: "move towards a GHA focused deploy, so an agent / ide isn't in the mix"; push to main deploys; the site's config moves into this repo with its IDs as GitHub secrets; `just deploy` stays as his fallback; one Cloudflare token per repo; flarepress becomes a public code repo with fresh history. Rows in [decisions.md](../decisions.md) (Working).

**In short.** `.github/workflows/deploy.yml` deploys every push to `main`: `just test`, the public `pdxfixit/flarepress` action (check, gate, stamp, `wrangler deploy`, verify), then the live checks. The site folder is `site/` in this repo; the D1 id is `${D1_DATABASE_ID}` there, filled from a secret. This repo's own token (Workers, its zone, D1 edit) lives only in GitHub, seen only by the migrate and upload steps. Agents push `main`; they never deploy.

## Context

- Deploys ran from Ben's Mac (`just deploy`, through the private flarepress with a Keychain token). An agent that could deploy held that token, which can change every site in the account.
- Trying deploys from a cloud session: a token in the environment is readable by every agent there. As a network secret it stays out, but the agent proxy then replaces the upload key wrangler sends for changed files, and the deploy fails with 401 (2026-10-15).
- This repo is public, and the old flarepress held private notes beside the deploy code.

## Decision

- **GitHub deploys, on every push to `main`.** One run at a time, in push order. `just ship` and `just land` push; they no longer deploy.
- **The site folder lives here:** `site/wrangler.toml` (assets `../web`, Worker `../worker/index.js`), `site/site.conf`, `site/harvest.conf`. `committed=web worker site`, so a dirty config never ships.
- **No IDs in the repo.** `database_id = "${D1_DATABASE_ID}"`; flarepress fills it from the environment into a throwaway copy. GitHub has it as a secret; the Mac exports it from `~/.config/noodlepads/cloud.json` (`tools/cloud_config.py --exports`).
- **The token is this repo's own:** Account → Workers Scripts: Edit, D1: Read; noodlepads.com → Workers Routes: Edit, DNS: Edit, Zone: Read. D1 Read, not Write: whoever can push `main` can change the workflow, so the token is the real limit, and migrating stays Ben's.
- **The deploy migrates.** Before the upload it applies any migration D1 lacks with `just cloud-migrate --yes` (Ben, 2026-10-26, when the council's reliability seat found a Worker could ship ahead of its table). A migration that drops rows the telemetry mirror lacks stops it; that drop stays Ben's.
- **Ben's fallback:** `just deploy` from the Mac, the same steps with the Keychain token, through a clone of the public flarepress at `~/src/flarepress`.
- **flarepress is public code only** (`github.com/pdxfixit/flarepress`; workflows use its rolling `v1` tag, which Ben moves to release); the private repo with its history is archived as `flarepress-archive`.

## Options turned down

- **A token in the cloud session's environment:** every agent there could read it, and it reaches every Worker.
- **A network secret:** keeps the token out, but breaks uploads (above).
- **An approval click per deploy:** "every commit on main is live" would lag Ben's attention.
- **flarepress made public with its history:** the history holds private notes; a force-push leaves old commits reachable on GitHub.

## Consequences

- Agents never see a Cloudflare credential. An agent can still push `main`, and a push deploys, so a reviewer for `.github/workflows/` is the next step if that ever matters.
- The deploy checks' cleanup (`cloud_admin.py prune --smoke --yes`) writes to D1, which the read-only token cannot: on GitHub it warns, and the checks' test shares are cleared from the Mac (`just cloud-prune --smoke --yes`).
- A commit from before `site/` existed cannot be redeployed by flarepress's rollback; this site rolls back by reverting anyway.
