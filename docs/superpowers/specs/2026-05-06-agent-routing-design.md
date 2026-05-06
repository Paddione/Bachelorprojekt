# Agent Routing Design

**Date:** 2026-05-06
**Status:** Approved

## Goal

Automatically route Claude Code requests to domain-specialist subagents based on subject matter, eliminating the need for the user to name an agent. Main Claude acts as orchestrator and dispatcher; specialists execute with full domain knowledge and no context pollution from other domains.

## Approach

Option A — CLAUDE.md dispatch table. A routing section in `CLAUDE.md` maps signal patterns (keywords + file paths) to agent names. Main Claude reads the table on every request and delegates before doing anything itself. Transparent, debuggable, one line to change.

## Agent Roster

Six agents, installed globally at `~/.claude/agents/` (prefixed `bachelorprojekt-` for project scoping):

| File | Domain |
|------|--------|
| `bachelorprojekt-infra.md` | k3d/ manifests, Kustomize overlays, Taskfile, ArgoCD, environments/ |
| `bachelorprojekt-website.md` | website/src/ Astro+Svelte, both brands (mentolder + korczewski) |
| `bachelorprojekt-ops.md` | Live cluster: pod status, logs, restarts, kubectl — read-only filesystem |
| `bachelorprojekt-test.md` | BATS, Playwright, manifest validation, test IDs |
| `bachelorprojekt-db.md` | PostgreSQL, psql, backup/restore, tracking/timeline schema |
| `bachelorprojekt-security.md` | SealedSecrets lifecycle, Keycloak realm, DSGVO, secret rotation |

Main Claude (the orchestrator) handles cross-cutting requests and coordinates multiple agents in sequence when a task spans domains.

## Routing Table (goes into CLAUDE.md)

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing" | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, ArgoCD, Taskfile, `ENV=`, `environments/`, deploy | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, BATS, Playwright, `runner.sh`, test case | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate | `bachelorprojekt-security` |

**Tie-break rule:** when signals overlap (e.g. "deploy the website" hits both website + infra), prefer the domain of the files being changed — `bachelorprojekt-website` for `website/src/` changes, `bachelorprojekt-infra` for manifest/overlay changes.

## Agent System Prompt Focus (per agent)

### bachelorprojekt-infra
- Kustomize layer cake: `k3d/` (base) → `prod/` (shared patches) → `prod-mentolder/` / `prod-korczewski/` (env overlays)
- Never apply `prod/` directly; always the env-specific overlay
- Never remove the `$patch: delete` block in `prod/kustomization.yaml`
- ENV= targeting; `WORKSPACE_NAMESPACE` pattern for korczewski
- `envsubst` var lists must be kept in sync per task
- `task workspace:validate` before committing any manifest change
- `scripts/env-resolve.sh` must be sourced, never executed directly

### bachelorprojekt-website
- Astro + Svelte; two-brand split via `BRAND_ID ?? BRAND ?? 'mentolder'`
- korczewski brand renders `website/src/components/kore/` components
- `/api/timeline` reads `bachelorprojekt.v_timeline` for the PR-driven homepage
- Every `website/src/` change requires `task website:deploy ENV=mentolder && task website:deploy ENV=korczewski` from clean main branch

### bachelorprojekt-ops
- Unified 12-node mentolder cluster: 6 Hetzner CPs + 6 home workers via WireGuard
- korczewski workloads live in `workspace-korczewski` namespace on the same cluster
- `task workspace:logs/status/restart ENV=<env>` patterns; `task livekit:status/logs ENV=<env>`
- **No file edits** — Bash and Read only
- Autonomous: execute kubectl/task commands without asking for confirmation

### bachelorprojekt-test
- Test IDs: `FA-01`–`FA-29`, `SA-01`–`SA-10`, `NFA-01`–`NFA-09`, `AK-03`, `AK-04`
- `./tests/runner.sh local <ID>` for single tests; `./tests/runner.sh local` for all
- `task test:unit` (BATS), `task test:manifests`, `task test:all`
- FA-01..FA-08, FA-09, FA-22, SA-06, SA-09 permanently skipped (Mattermost/InvoiceNinja removed)

### bachelorprojekt-db
- Shared PostgreSQL 16 (`shared-db`) in `workspace` namespace
- Databases: keycloak, nextcloud, vaultwarden, website, docuseal
- Access: `task workspace:psql ENV=<env> -- <db>` or port-forward to localhost:5432
- Tracking schema: `bachelorprojekt.features`, `bachelorprojekt.v_timeline`, `bugs.bug_tickets`
- Backup/restore: `task workspace:restore -- <db> <timestamp>`

### bachelorprojekt-security
- SealedSecrets lifecycle: `env:generate ENV=<env>` → `env:seal ENV=<env>` → deploy
- `scripts/env-resolve.sh` must be sourced, never executed
- Keycloak realm files: `k3d/realm-workspace-dev.json`, per-env `realm-workspace-<env>.json` in overlays
- DSGVO check: `task workspace:dsgvo-check`
- After rotating a secret: `ALTER ROLE <user> PASSWORD '<new>'` on shared-db to prevent drift

## Permissions

All agents run autonomously — no confirmation prompts for destructive operations. This is the initial setting; add confirmation gates if live outages occur.

## File Locations

- Agent definitions: `~/.claude/agents/bachelorprojekt-*.md`
- Routing rules: prepended to `CLAUDE.md` as `## Agent Routing` section
