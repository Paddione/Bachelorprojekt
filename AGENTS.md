# AGENTS.md — High-Signal Reference for OpenCode Sessions

Loaded via `.opencode/opencode.jsonc` and `.agents/settings.json` → `"instructions": ["AGENTS.md"]`. Comprehensive reference: `CLAUDE.md`.

## Agent Routing

Delegates to sub-agents when signals match. Tie-break: prefer domain of files being changed.

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, CSS, UI, frontend, design, kore, brand | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, LLM, GPU, Ollama, LiveKit | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
| test, BATS, Playwright, `runner.sh`, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, autopilot | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore | `bachelorprojekt-db` |
| SealedSecret, Keycloak, OIDC, DSGVO, credential, certificate, secret | `bachelorprojekt-security` |

Before dispatching: `bash scripts/plan-context.sh <role>` → prepend output as `<active-plans>`. Cross-cutting requests stay with orchestrator.

## Core Commands

```bash
# Task oracle — primary CLI. Never hardcode task paths.
bash scripts/vda.sh oracle '<goal in plain English>'

# Dev cluster (k3d, default ENV=dev)
task cluster:create && task workspace:deploy && task workspace:office:deploy && task workspace:post-setup

# Pre-commit gate
task test:changed   # smart selection: only tests relevant to changed files. Also gated by `.githooks/pre-commit`
task workspace:validate  # kustomize dry-run

# Prod — ENV= is always explicit
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
task feature:deploy  # fan-out to both brands
```

## Workflow

- Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*`
- All changes via PRs → squash-and-merge. No direct pushes to `main`.
- Use `dev-flow-plan` (brainstorm → spec → plan → push) then `dev-flow-execute` (implement → PR → deploy). Chores use `dev-flow-chore` (inline execute + merge).
- **OpenSpec Native Workflow**: Specifications are written in the OpenSpec format under `openspec/`.
  - `task openspec:propose -- <slug> --ticket <ext-id>`: Create a new proposal skeleton (status: planning).
  - `task openspec:apply -- <slug>`: Mark proposal as implementable (status: plan_staged).
  - `task openspec:archive -- <slug>`: Archive a completed proposal and merge its delta into the SSOT.
  - `task openspec:validate`: Dry-run validation of the `openspec/` change tree (runs in CI).
- **awaiting_deploy status**: A transition state for tickets that are merged to `main` but not yet deployed to production (the "merge ≠ prod" lane on the dashboard cockpit).
- CI gate: `task test:changed` (smart selection) + `task freshness:check` + `task workspace:validate`.
- Pre-commit hook (`.githooks/pre-commit`) auto-runs freshness regeneration, secret scanning, agent-lock guard. Install with `git config core.hooksPath .githooks`.

## Architecture

- **Fleet cluster** (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski`. Both on `fleet` context. No other contexts are alive.
- **k3d/ is base** for all Kustomize manifests. Prod overlays: `prod-fleet/mentolder/` and `prod-fleet/korczewski/`.
- **No GitOps** — push-based deploy. Only website auto-deploys via GH Actions.
- **Centralized domains**: `k3d/configmap-domains.yaml` — never hardcode hostnames.
- **Secrets flow**: plaintext `environments/.secrets/<env>.yaml` → `task env:seal ENV=<env>` → committed SealedSecret.
- Cross-cutting DB/OIDC changes apply to **both** namespaces.
- **Website uses `pnpm`**; root, brett, arena-server use `npm`. The website has its own Postgres dependency (via `DATABASE_URL`).

## Package Managers & Lockfiles

| Area | Manager | Lockfile |
|------|---------|----------|
| Root (scripts, docs-gen) | `npm` | `package-lock.json` |
| `website/` | `pnpm` | `website/pnpm-lock.yaml` |
| `brett/` | `npm` | `brett/package-lock.json` |
| `arena-server/` | `npm` | `arena-server/package-lock.json` |

## Quality Gates

- **`task test:changed`** — smart selection based on `git diff` against `origin/main`. Falls back to vitest run if no domain detected.
- **`task freshness:check`** — all generated artifacts (test-inventory, route-manifest, learning-assets, quality-index, agent-guide maps) must be committed. Pre-commit hook auto-regenerates via `task freshness:regenerate`.
- **`task test:code-quality`** — file-size caps, import-cycle detection (`madge`), hardcoded-hostname scan, orphan-asset check.
- **`task test:unit`** — all BATS unit tests (root scripts) + factory bats.
- **Brett**: `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- **Website**: `npm --prefix website run test:unit` (vitest)
- **Arena**: `npm --prefix arena-server test` (vitest)
- **Arena proto-drift guard**: `arena-server/src/proto/messages.ts` and `website/src/components/arena/shared/lobbyTypes.ts` must be byte-identical.
- PR titles: Conventional Commits with `[T000XXX]` tag. Scopes defined in `ci.yml`.

## Critical Footguns

- **`scripts/env-resolve.sh` must be sourced, not executed.** `bash scripts/env-resolve.sh` exits the parent shell.
- **`scripts/task-oracle.sh` is DEPRECATED.** Use `bash scripts/vda.sh oracle` instead. The old script is a thin shim.
- **Adding `${VAR}` to a manifest?** Register in `environments/schema.yaml` AND `envsubst` list in every Taskfile task that builds that manifest.
- **Never SELECT * from `tickets.ticket_plans`** — `content` column is multi-MB markdown.
- **Website, Brett, Docs, Videovault, Mediaviewer-Widget images use `:latest` intentionally** — CI warns, do not "fix" to digests.
- **`env:generate ENV=<target>` must run before `env:seal`** — talk-hpb-setup.sh aborts on placeholder values.
- **Cluster reset order**: sealed-secrets:install → env:fetch-cert → env:seal → cert:install → cert:secret → workspace:deploy.
- **`docs:sync` does NOT work** — container rootfs is read-only. Deploy via `task docs:deploy`.
- **Task collision on Ubuntu**: `apt install task` installs taskwarrior, not go-task. Use `snap install task --classic`.
- **Pre-commit blocks main-checkout commits** when another session holds the `main-checkout` lock. Use worktrees (`scripts/worktree-create.sh`) for isolation.

## Agent Coordination

Multiple agent sessions share one checkout:

```bash
bash scripts/agent-lock.sh reap    # start of every session (cleans stale locks)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list    # see who is doing what
```

Session messaging: `bash scripts/agent-msg.sh read --unread` (incoming), `bash scripts/agent-msg.sh post "msg"` (broadcast to live sessions).

## Important References

- `CLAUDE.md` — authoritative comprehensive reference (task lists, topology details, all footguns)
- `website/CLAUDE.md` — Astro/Svelte quick-start, content model, adding service pages
- `docs/agent-guide/README.md` — agent operating guide registry (taxonomy, guardrails, tools, goals)
- `CONTRIBUTING.md` — human-readable dev workflow
- `.agents/skills/OVERVIEW.md` — skill layering contract (dev-flow → superpowers)
