# AGENTS.md — High-Signal Reference for OpenCode Sessions

Loaded via `.opencode/opencode.jsonc` (and its alias `.agents/settings.json`, which is a symlink to it) → `"instructions": ["AGENTS.md"]`. Comprehensive reference: `CLAUDE.md`.

> **Subagent file layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source. `.agents/agents` is a directory symlink to `../.claude/agents` — both Claude Code and opencode read the same content via the symlink. Edit files at `.claude/agents/<name>.md` (or its `.agents/agents/<name>.md` alias).

## Agent Routing

Delegates to sub-agents when signals match. Tie-break: prefer domain of files being changed. The signal lists below are the authoritative routing table; they match each agent's `description:` frontmatter in `.agents/agents/<name>.md`.

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, korczewski, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model, LiveKit | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test", `factory:`, autopilot | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Before dispatching: `bash scripts/plan-context.sh <role> --with-openspec` → prepend output as `<active-plans>`. Cross-cutting requests stay with orchestrator. The `--with-openspec` flag auto-loads the SSOT spec(s) for any files changed vs `main` — omit only when explicitly told to skip OpenSpec context.

## Core Commands

```bash
# Task oracle — primary CLI. Never hardcode task paths.
bash scripts/vda.sh oracle '<goal in plain English>'

# Dev cluster (k3d, default ENV=dev)
task cluster:create && task workspace:deploy && task workspace:office:deploy && task workspace:post-setup

# Full prod-style deploy (umbrella — includes preflight + talk/recording/transcriber)
task workspace:setup ENV=dev   # or ENV=mentolder / ENV=korczewski

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
- **Website uses `pnpm`**; root and brett use `npm` for install/CI. The website has its own Postgres dependency (via `DATABASE_URL`). Note: `brett/` also ships a `pnpm-lock.yaml` + `pnpm-workspace.yaml`; these are **not** used at runtime but are read by Renovate's pnpm manager for dependency update checks.

## Package Managers & Lockfiles

| Area | Manager | Lockfile |
|------|---------|----------|
| Root (scripts, docs-gen) | `npm` | `package-lock.json` |
| `website/` | `pnpm` | `website/pnpm-lock.yaml` |
| `brett/` | `npm` | `brett/package-lock.json` (+ `pnpm-lock.yaml` + `pnpm-workspace.yaml` for Renovate) |


## Quality Gates

- **`task test:changed`** — smart selection based on `git diff` against `origin/main`. Falls back to vitest run if no domain detected.
- **`task freshness:check`** — all generated artifacts (test-inventory, route-manifest, learning-assets, quality-index, agent-guide maps) must be committed. Pre-commit hook auto-regenerates via `task freshness:regenerate`.
- **`task test:code-quality`** — file-size caps, import-cycle detection (`madge`), hardcoded-hostname scan, orphan-asset check.
- **`task test:unit`** — all BATS unit tests (root scripts) + factory bats.
- **Brett**: `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- **Website**: `npm --prefix website run test:unit` (vitest)

- PR titles: Conventional Commits with `[T000XXX]` tag. Scopes defined in `ci.yml`. The `[T000XXX]` check is **advisory only** (`ci.yml:229`) — it logs a `⚠️` but never blocks the merge; the OpenSpec spec `openspec/specs/ci-cd.md:62` documents this contract.
- **release-please PRs are exempt from the `[T000XXX]` rule.** They aggregate multiple features/fixes and have no single owning ticket; the per-package ticket refs are listed in the PR body. The branch ref always starts with `release-please--` (e.g. `release-please--branches--main`), so if the tag check is ever hardened to a hard fail, gate it on `if: github.event.pull_request.head.ref !~ '^release-please--'`. If the release-please branch diverges from main (e.g. because chore commits merged after the release branch was created), auto-merge stalls with `mergeStateStatus: UNKNOWN` — resolve by merging main into the release-please branch in a worktree (`git merge origin/main`) and pushing; the release commit applies cleanly because chore commits don't touch the version files.

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
- **Commit signing (G-SEC05).** Every new dev host must run `bash scripts/setup-dev-env.sh` once — it generates (or reuses) `~/.ssh/id_ed25519`, sets `commit.gpgsign=true` + `gpg.format=ssh` + `gpg.ssh.allowedSignersFile`, and writes a sanity-check commit. Re-run is idempotent; pass `--check` to verify. Upload the public key to GitHub as a *Signing Key* (https://github.com/settings/keys) so the "Verified" badge renders. The Software Factory dispatcher's `~/.config/factory/autopilot.env` host must also have run this script — otherwise the dispatcher's `git commit` calls land unsigned and the `G-SEC05` health gate (`scripts/health-goals-check.sh`) regresses by one N per commit.

## Agent Coordination

Multiple agent sessions share one checkout:

```bash
bash scripts/agent-lock.sh reap    # start of every session (cleans stale locks)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list    # see who is doing what
```

Session messaging: `bash scripts/agent-msg.sh read --unread` (incoming), `bash scripts/agent-msg.sh post "msg"` (broadcast to live sessions).

## Escalation Protocol (when stuck)

If a subagent cannot continue — missing context, ambiguous target, unresolvable error, or unsafe action without confirmation:

```bash
bash scripts/agent-escalate.sh \
  --agent "bachelorprojekt-<role>" \
  --reason "<what is blocking you>" \
  --tried  "<what you attempted>" \
  --needs  "<what would unblock you>"
```

The script posts to the session-message channel and emits a structured `=== AGENT ESCALATION ===` block. **Orchestrators** that see this block should re-dispatch with the missing context in `<active-plans>` tags or ask the user before retrying. Never guess ambiguous `ENV=` targets, secret values, or destructive operations.

## Skill Dispatch Protocol

Every skill in `.claude/skills/<name>/SKILL.md` declares its dispatch target in the YAML frontmatter:

```yaml
---
name: <skill-name>
description: ...
agent: bachelorprojekt-<role>     # optional — see below
category: devflow                  # optional — existing field
---
```

- **Skill HAS `agent:`** → orchestrator MUST dispatch as a subagent. Load `.claude/agents/<agent>.md`, splice its body as the system prompt, append the skill body + the user's request, and spawn `task` with `subagent_type: "general"`. The subagent owns the work in an isolated context window.
- **Skill has NO `agent:`** → workflow/orchestrator skill. Load inline in the main session (current behavior). These are coordination skills (`dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`, `operations-management`, `ticket-ops`, `update-dependencies`, `lavish`, `mishap-tracker`, `using-git-worktrees`) that need to span multiple agents or hold persistent state across handoffs. `feature-intake` ist seit 2026-06-21 ein opencode-Command (`/feature-intake`), nicht mehr ein Skill.

### Dispatch recipe

```bash
# 1. Read the agent config (system prompt for the subagent)
AGENT_BODY=$(cat .claude/agents/bachelorprojekt-<role>.md)   # strip YAML frontmatter
SKILL_BODY=$(cat .claude/skills/<name>/SKILL.md | tail -n +5)   # strip frontmatter

# 2. Orchestrator spawns a `task` call with subagent_type="general" and:
#    system:  <AGENT_BODY>            ← domain knowledge, commands, gotchas
#    prompt:  <SKILL_BODY>\n\n---\n\n<user request>
```

The subagent returns its result; the orchestrator relays it back. The subagent sees only its agent instructions + the skill + the request — no orchestrator noise.

### Current skill → agent map

Only skills with an explicit `agent:` field in their SKILL.md frontmatter are dispatched as subagents. The rest are coordination skills loaded inline. As of 2026-06-22, exactly three skills declare an `agent:` field:

| Skill | Agent | Why subagent |
|-------|-------|--------------|
| `dev-flow-e2e` | `bachelorprojekt-test` | FA-/SA-/NFA- test IDs, runner.sh, permanently-skipped set |
| `incident-response` | `bachelorprojekt-ops` | Diagnose-first, fail-loud output-trust rules |
| `infra-ops` | `bachelorprojekt-infra` | `fleet`-only context, k3d base, overlay cake — consolidates the archived `cluster-deployment`, `database-ops`, `host-node-networking`, `keycloak-realm-sync`, `llm-ops`, `secret-rotation`, `workspace-deploy` skills (see `infra-ops` for the umbrella runbook) |

When a new skill is added: pick an agent from the routing table, add `agent: bachelorprojekt-<role>` to frontmatter, and add a row to this table. (Optional follow-up: add a `task skills:validate` that asserts every `agent:` value resolves to an existing `.claude/agents/<name>.md` and that every agent has at least one skill referring to it — currently no such gate exists.)

## Code Discovery (codebase-memory-mcp)

Use `codebase-memory-mcp` tools **first** for any code exploration — before grepping or reading files:

| Goal | Tool |
|------|------|
| Find a function / class / route by name | `search_graph(name_pattern=…)` |
| Trace call chain or data flow | `trace_path(function_name=…, mode=calls\|data_flow\|cross_service)` |
| Get exact source for a symbol | `get_code_snippet(qualified_name=…)` |
| Complex Cypher query across the graph | `query_graph(query=…)` |
| Project structure / architecture overview | `get_architecture(aspects=…)` |
| Text search (graph-augmented grep) | `search_code(pattern=…)` |

The graph is auto-indexed after every `git merge`/`git pull` (`.githooks/post-merge`). If you suspect the graph is stale (e.g. after a rebase or manual file edit), re-index with mode `fast` before querying:

```bash
/home/patrick/.local/bin/codebase-memory-mcp cli index_repository \
  '{"project": "home-patrick-Bachelorprojekt", "mode": "fast"}'
```

Registered as `codebase-memory-mcp` in both `.mcp.json` (Claude Code) and `.opencode/opencode.jsonc` (opencode). Use `search_code` as the fallback when you need plain-text grep behaviour — the graph tools are faster and cross-reference aware for symbol lookups.

## Important References

- `CLAUDE.md` — authoritative comprehensive reference (task lists, topology details, all footguns)
- `website/CLAUDE.md` — Astro/Svelte quick-start, content model, adding service pages
- `docs/agent-guide/README.md` — agent operating guide registry (taxonomy, guardrails, tools, goals)
- `CONTRIBUTING.md` — human-readable dev workflow
- `.agents/skills/OVERVIEW.md` — skill layering contract (dev-flow → superpowers)

## OpenSpec conventions

Proposal and task files (`openspec/changes/<slug>/proposal.md`, `tasks.md`, `specs/*.md`) may include YAML frontmatter parsed by `scripts/openspec-embed.mjs` (used to index changes in pgvector for `plan-context.sh --semantic`). Language convention: **Purpose sections in German; Requirements and Scenarios in English** (GIVEN/WHEN/THEN). Rule source: `openspec/config.yaml` (keys: `proposal`, `tasks`, `specs`, `design`).

## Dev experience

After installing the OpenSpec CLI (`npm i -g @fission-ai/openspec@1.3.1`), run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell). Upstream workflow commands live under `.opencode/commands/opsx-*.md` and `.claude/skills/openspec-*/SKILL.md`; use them via `/opsx:propose`, `/opsx:apply`, `/opsx:archive` instead of the older `task openspec:*` wrappers.
