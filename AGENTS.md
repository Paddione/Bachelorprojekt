# AGENTS.md — High-Signal Reference for OpenCode Sessions

Loaded via `.opencode/opencode.jsonc` (and its alias `.agents/settings.json`, which is a symlink to it) → `"instructions": ["AGENTS.md"]`. Comprehensive reference: `CLAUDE.md`.

> **Subagent file layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source. `.agents/agents` is a directory symlink to `../.claude/agents` — **Claude Code only** reads these via its native `task` tool dispatch. **opencode does NOT read `.agents/agents/`** — it uses its own agent definitions in `.opencode/agent-models.jsonc` (local LLM subagents: `bonsai-8b`). Edit domain agents at `.claude/agents/<name>.md` (or its `.agents/agents/<name>.md` alias).

## Agent Routing

### Claude Code (domain agents)

Delegates to domain sub-agents via the native `task` tool when signals match. Tie-break: prefer domain of files being changed. The signal lists below are the authoritative routing table; they match each agent's `description:` frontmatter in `.agents/agents/<name>.md`.

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model, LiveKit | `bachelorprojekt-ops` |
| `k3d/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, `FA-SF`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test", `factory:`, autopilot | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` |
| SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Before dispatching: `bash scripts/plan-context.sh <role> --with-openspec` → prepend output as `<active-plans>`. Cross-cutting requests stay with orchestrator. The `--with-openspec` flag auto-loads the SSOT spec(s) for any files changed vs `main` — omit only when explicitly told to skip OpenSpec context.

### opencode (local LLM subagents)

opencode uses the `background-agents.ts` plugin which reads agents from `agent-models.jsonc`, not from `.agents/agents/`. Available subagent types:

| Agent | Model | Permissions | Use case |
|-------|-------|-------------|----------|
| `bonsai-8b` | Ternary-Bonsai-8B (Q2_0, 65k ctx/slot, 4 parallel slots, combined KV) | write-capable | **Preferred single choice** for delegation (max 4 parallel, port 8093) |
| `explore` | built-in | read-only | Fast codebase exploration |
| `general` | built-in | read-only | General research tasks |

Read-only agents use `delegate(prompt, agent)`. Write-capable work (e.g. `bonsai-8b`) uses `task` with the agent name.

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
- **OpenSpec Native Workflow**: Specifications are written in the OpenSpec format under `openspec/`. Drive the lifecycle with the upstream **`/opsx:*` commands** (canonical):
  - `/opsx:propose <slug>` — create a new proposal skeleton (status: `planning`).
  - `/opsx:apply <slug>` — mark proposal as implementable (status: `plan_staged`).
  - `/opsx:archive <slug>` — archive a completed change + merge its delta into the SSOT spec.
  - `/opsx:explore` — think-through / requirements clarification (no implementation).
  - The `task openspec:propose|apply|archive` wrappers are **equivalent fallbacks** for environments without the OpenSpec CLI; `task openspec:validate` is the fail-closed CI gate. Authoring conventions are SSOT in `openspec/config.yaml` — see [OpenSpec conventions](#openspec-conventions) below.
- **Merge = closure (T001092)**: Tickets close directly on green auto-merge to `main` (`done · resolution=shipped`). The prod deploy is **decoupled** (push-based) and does NOT change ticket status. `awaiting_deploy`/`qa_review` are **removed from the happy-path** but stay valid enum values for historical rows, manual holds, and the watchdog safety net (`awaiting_deploy > 24h`); the cockpit hides the `awaiting_deploy` lane unless a ticket is manually held. Source: CLAUDE.md → "Domain conventions: Merge = Abschluss".
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

- **`task factory:eval:replay`** — nach jeder Änderung am Agenten-Setup
  (`.opencode/agent-models.jsonc`, `scripts/factory/review-*.prompt.md`,
  `scripts/factory/provider-router.js`, `AGENTS.md`) lokal ausführen und die
  Scorecard (`docs/factory-eval/latest.json`) vor dem Merge dokumentieren. CI
  warnt nur advisory (`::warning::`), weil CI-Runner keine GPU/LM-Studio haben.
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
- **Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, and Talk-Transcriber images use `:latest` intentionally** — CI warns, do not "fix" to digests.
- **`env:generate ENV=<target>` must run before `env:seal`** — talk-hpb-setup.sh aborts on placeholder values.
- **Cluster reset order**: sealed-secrets:install → env:fetch-cert → env:seal → cert:install → cert:secret → workspace:deploy.
- **`docs:sync` does NOT work** — container rootfs is read-only. Deploy via `task docs:deploy`.
- **OpenSpec-Archivierung NUR via Worktree [T001972, T001880].** `task openspec:archive` und `scripts/openspec.sh archive` erzeugen Datei-Mutationen (`openspec/specs/*.md`, `openspec-status.json`), die bei Ausführung im main-Checkout unkommittiert liegen bleiben. Immer in einem `.worktrees/*`-Worktree auf einem `chore/*`-Branch ausführen.
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

- **Skill HAS `agent:`** → dispatch it as a sub-agent through the `background-agents.ts`
  plugin. Read-only sub-agents (edit/write/bash denied) run via the `delegate(prompt, agent)`
  tool (async background session; retrieve the result with `delegation_read(id)`).
  Write-capable sub-agents run via opencode's native write-capable delegation (preserves
  undo/branching). The agent body (`.agents/agents/<role>.md` → `.claude/agents/<role>.md`)
  becomes the sub-agent's system prompt; the skill body + the user's request its task.
- **Skill has NO `agent:`** → workflow/orchestrator skill, loaded inline in the main session.

### Dispatch recipe (opencode)

1. Read the agent body: `.agents/agents/bachelorprojekt-<role>.md` (strip frontmatter).
2. Read the skill body: `.claude/skills/<name>/SKILL.md` (strip frontmatter).
3. For a read-only sub-agent: `delegate(prompt: "<skill body>\n\n---\n\n<request>", agent: "<role>")`.
   For a write-capable sub-agent: opencode's native write-capable delegation, selecting the
   agent by name. If `background-agents.ts` is unavailable, run the sub-step inline.

### agy compatibility

agy is **not explicitly covered** in most skill files. The rule of thumb: **treat the opencode path as authoritative**. All CLI tools (`gh`, `git`, `kubectl`, `task`, `bash scripts/`), MCP tool calls, and git workflows are framework-agnostic. The only gaps are framework-native subagent spawning (`delegate()`, `Agent`/`Task` tool) and Claude Code built-in superpowers — for those, execute the steps inline or manually. The 6 superpower stubs under `.claude/skills/superpowers-*/` and `.claude/skills/{test-driven-development,verification-before-completion,requesting-code-review}/` have framework mapping tables that include agy guidance.

### Current skill → agent map

Only skills with an explicit `agent:` field in their SKILL.md frontmatter are dispatched as subagents. The rest are coordination skills loaded inline. As of 2026-07-23, six skills declare an `agent:` field:

| Skill | Agent | Why subagent |
|-------|-------|--------------|
| `dev-flow-e2e` | `bachelorprojekt-test` | FA-/SA-/NFA- test IDs, runner.sh, permanently-skipped set |
| `incident-response` | `bachelorprojekt-ops` | Diagnose-first, fail-loud output-trust rules |
| `infra-ops` | `bachelorprojekt-infra` | `fleet`-only context, k3d base, overlay cake — consolidates the archived `cluster-deployment`, `database-ops`, `host-node-networking`, `keycloak-realm-sync`, `llm-ops`, `secret-rotation`, `workspace-deploy` skills (see `infra-ops` for the umbrella runbook) |
| `database-specialist` | `bachelorprojekt-db` | Schema migrations, backup/restore, index/query tuning — `mcp-postgres` access |
| `security-specialist` | `bachelorprojekt-security` | SealedSecrets/Keycloak/OIDC/DSGVO — credential-handling isolation |
| `website-specialist` | `bachelorprojekt-website` | Astro/Svelte frontend work, brand-specific components |

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

## Updating the Health Baseline (`.claude/lib/goals.md`)

~40 quantified health goals (G-* IDs) are tracked in the file. When a goal's measured value
changes (via `bash scripts/health-goals-check.sh`), update the baseline:

1. **Check:** `bash scripts/health-goals-check.sh --only=G-XXXX` — get the current value.
2. **Edit `.claude/lib/goals.md`:**
   - Inline description text (current value, what changed, why).
   - **Baseline** meta-line: `**A · Baseline:** <alt> → <neu>`.
   - Goal reached target → move from Prio A/B → Prio C table.
   - Goal regressed → move from Prio C → Prio A.
3. **Append `Baseline-Update` entry** at the bottom (section above Mess-Werkzeug):
   `**Baseline-Update YYYY-MM-DD:** G-XXXX <alt>→<neu> (Begründung); ...`
4. **Update Sprint-Highlights** with notable changes (target hits, priority changes).
5. **Never renumber** G-RH01–G-RH07 (externally referenced anchors).
6. **Verify:** `bash scripts/health-goals-check.sh` still works and shows correct status.

**Convention:** redaktionell, kein Feature-Ticket/OpenSpec-Change nötig.

**Ticket-Erstellung ist NICHT automatisch.** `scripts/health-goals-update.sh` listet offene Ziele
per Default nur auf — es druckt keine Ticket-Create-Befehle mehr. Erst mit dem expliziten Flag
`--suggest-tickets` zeigt es Vorschläge an, und auch dann nur für G-IDs, die noch nicht als Titel
in einem offenen (nicht-`done`) Ticket auftauchen (Dedup gegen `scripts/ticket.sh list`). Grund:
wiederholte Läufe erzeugten sonst pro Zyklus ein neues Ticket für dasselbe rote Ziel, selbst wenn
das Vorgänger-Ticket nur `done` geschlossen wurde ohne den Messwert zu fixen (siehe die
T001280→T001347/T001320→T001348/T001276→T001349-Kette in `goals.md`). Ob ein rotes Ziel ein Ticket
bekommt, ist eine bewusste, manuelle Entscheidung — nicht Teil des Standard-Update-Laufs.

## OpenSpec conventions

Proposal and task files (`openspec/changes/<slug>/proposal.md`, `tasks.md`, `specs/*.md`) may include YAML frontmatter parsed by `scripts/openspec-embed.mjs` (used to index changes in pgvector for `plan-context.sh --semantic`). Language convention: **Purpose sections in German; Requirements and Scenarios in English** (GIVEN/WHEN/THEN). Rule source: `openspec/config.yaml` (keys: `proposal`, `tasks`, `specs`, `design`).

## Dev experience

After installing the OpenSpec CLI (`npm i -g @fission-ai/openspec@1.3.1`), run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell). The upstream workflow commands are canonical (in preference to the `task openspec:*` wrappers, which remain a CLI-absent fallback). Invoke them as `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore` in Claude Code (`/opsx-propose`, `/opsx-apply`, … in opencode). The command definitions live under `.claude/commands/opsx/*.md` and `.opencode/commands/opsx-*.md`; the equivalent **skill-form** is SSOT in `.claude/skills/openspec-*/SKILL.md` and mirrored to `.opencode/skills/` via symlink.
