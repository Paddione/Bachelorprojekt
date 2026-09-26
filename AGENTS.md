# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 160 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md`.

## Agent Routing

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md`.

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `opencode-zen/muse-spark-1.3-contributor-free` (1M ctx, 131k out, primary, write) + Go fallback `opencode-go/muse-spark-1.3-contributor` via `planner-muse` | Primary — dispatches `local` (budgeted) + planner-muse/2-rail cloud escalation |
| `local` | `llamacpp-local/Muse-Glimmer-30B` (131k served KV, DFlash2) | Sole local subagent; `write=deny`, `edit=allow`; sequential, `budget_tokens` per packet |
| `planner-muse` | `opencode-go/muse-spark-1.3-contributor` (1M ctx, primary, write) | Planning fallback (M2 after 2× local); dispatched by `orchestrator`/`big-pickle`/`glimmer-primary` |
| `glimmer-primary` | `llamacpp-local/Muse-Glimmer-30B` (131k, primary, write) | Plan-primary (Muse Glimmer, Spark-Familie); autonomer Ticket-Worker |
| `big-pickle` | `opencode-zen/big-pickle` (~260k ctx, primary, write) | Zen-Singleagent bis Free-Quota verbraucht |
| `ox-alpha-free` | `opencode-zen/laguna-s-2.1-free` (primary, write) | Free-Tier-Primary; dispatcht nur `ox-alpha` |
| `ox-alpha` | `opencode-zen/laguna-s-2.1-free` (subagent, write) | Subagent-Zwilling von `ox-alpha-free` |
| `deepseek-helper-go` | `opencode-go/deepseek-v4-flash` (write) | Eskalation Rail 1 (Go-Abo) wenn lokal stuck/ctx-leer |
| `deepseek-helper` | `deepseek/deepseek-v4-flash` (write) | Eskalation Rail 2 (direkte API) bei Go-Ausfall |
| `deepseek-pro` | `opencode-go/deepseek-v4-pro` (all, write) | Tiefe Analyse/harte Refactors |
| `deepseek-pro-direct` | `deepseek/deepseek-v4-pro` (direct API, all, write) | Direkte API (bypass Go gateway) |
| `deepseek-flash` | `opencode-go/deepseek-v4-flash` (all, write) | Parallel-Throughput bis 3 |
| `deepseek-flash-direct` | `deepseek/deepseek-v4-flash` (direct API, all, write) | Direkte API (bypass Go gateway) |
| `reviewer` | `llamacpp-local/Muse-Glimmer-30B` (subagent, read-only) | Review-Rolle (read/grep/tests); Edits wendet der Orchestrator an [T900074] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task local` für lokale Implementation + deepseek-Rails (Go zuerst). Lokale: `write=deny` → Orchestrator erzeugt. SSOT `.opencode/agent-models.jsonc`; Historie `docs/agent-guide/registry/retired.md`.
## Core Commands

```bash
bash scripts/vda.sh oracle '<goal>'              # Task oracle — primary CLI
task workspace:deploy ENV=mentolder              # Prod deploy (or korczewski)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- Branches `feature/*`, `fix/*`, `chore/*`, `docs/*`; PRs → squash-merge, nie direkt auf `main` (`preflight-pr-scope.sh` erzwingt Worktrees).
- dev flow: `dev-flow-plan` → `dev-flow-execute` (Chores: `dev-flow-chore`); Planner enqueuen Partials einzeln, Factory arbeitet parallel (Pipeline-Prinzip).
- CI gate vor PR: `task test:changed` + `task freshness:check` + `task workspace:validate`. **Merge = closure** (T001092); Prod-Deploy entkoppelt.

## Architecture (30-second view)

- Fleet (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski` (ctx `fleet`); Pull-Deploy via FluxCD-OCI-Artefakt (`render-fleet-artifact.yml`, `flux/clusters/fleet/`); `workspace:deploy` nur Break-Glass.
- k3d/ = Base-Kustomize; Overlays `prod-fleet/mentolder|korczewski`; Domains zentral in `k3d/configmap-domains.yaml` (nie hardcoden).

## Critical Footguns (must-know)

- `scripts/env-resolve.sh` sourcen (nie executen); `task-oracle.sh` DEPRECATED → `bash scripts/vda.sh oracle`; nie `SELECT *` aus `tickets.ticket_plans`.
- OpenSpec-Archiv nur im Worktree; Images `:latest` ok (keine Digests "fixen"); Pre-commit blockt Main-Checkout bei fremdem Lock → Worktrees.
- `components/website/` pnpm-only (nie `npm install` dort); Root + `components/brett/` npm.
- git-crypt ohne Keyfile: `git-crypt unlock` nutzt `gpg.program`; unter WSL auf Windows-`gpg.exe` zeigen. Wege je Umgebung: `docs/runbooks/git-crypt-key-distribution.md` → „Unlock ohne Keyfile".

## Agent Coordination

```bash
bash scripts/agent-lock.sh reap                  # Clean stale locks (start of session)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list
bash scripts/agent-msg.sh read --unread          # Session messaging
bash scripts/worktree-list.sh [--json] [--all]   # Welche Worktrees existieren gerade (--all: + factory-runner-Pod)
```

Worktree-*Ort* Konvention (`.worktrees/<slug>`), reale Liste via `git worktree list` — `worktree-list.sh` ist die gemeinsame Abfrage.

## Escalation (when subagent is stuck)

```bash
bash scripts/agent-escalate.sh --agent "bachelorprojekt-<role>" --reason "<what>" --tried "<attempt>" --needs "<unblock>"
```

## Code Discovery

Use `codebase-memory-mcp` tools first (before grep/glob): `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`.

## OpenSpec conventions

- Proposals/specs under `openspec/`. Lifecycle: `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`.
- Language: Purpose in German; Requirements/Scenarios in English (GIVEN/WHEN/THEN).
- Delta files in `openspec/changes/<slug>/specs/` are named after the **parent SSOT slug**, not the change slug (`openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`). A genuinely new component needs `archive --create-new`.

## Dev experience

OpenSpec CLI completion: `openspec completion install`.

## Interaction Contract

**Run the assignment to its end.** Carry the assigned task through to its own
logical completion — including verification, commit and pull request where the
assignment covers them — and only then return control. Never make continuation
conditional on user confirmation for a step you recommended yourself. Never
start a new task or pull a new ticket without being asked.

**Stop only on these four triggers:**
1. **Destructive or irreversible** — force-push, prod deploy, secret rotation, DB drop.
2. **Genuine fork** — two viable designs change outcome, no prior art (T002829).
3. **Blocked** — missing creds, unreachable service. Follow `.claude/lib/behaviors/escalation-protocol.md`.
4. **Cost above threshold** — long GPU jobs, large subagent fan-outs.

Everything else is reversible: act — deliver the divisible part regardless,
return only the blocked remainder.

**Ask so the answer is one keystroke.** Finite-answer questions go through
`AskUserQuestion` (Claude Code) or `question` (opencode, agy); otherwise
numbered Markdown options with the recommendation first, never free prose.

**Status footer** — once, at end of finished thread:

```
STATUS: <what happened>
RUNNING: <background work or "none">
BLOCKED: <blockers or "none">
```

## Reference Sections (read on-demand, do not frontload)

The following sections contain detailed reference material. **Do not load them into context at session start.** Read them only when the current task requires it.

<details>
<summary>Domain Agents (read when dispatching)</summary>

| Signals | Agent |
|---------|-------|
| `components/website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", llm:, GPU, Ollama, model | `bachelorprojekt-ops` |
| fleet/, prod*/, manifest, kustomize, overlay, Taskfile, ENV=, environments/, deploy, workspace:setup | `bachelorprojekt-infra` |
| test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh, "test failing", "test case", "write a test", factory:, autopilot, FA-SF | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, bachelorprojekt.features, v_timeline | `bachelorprojekt-db` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Dispatch: `bash scripts/plan-context.sh <role> --with-openspec` → `<active-plans>`, `bash scripts/toolset-context.sh <role>` → `<toolset>` (fail-closed auf unbekannte Rolle, T002322). Curation: `toolset-curate`; Gate: `task agents:toolset:check`. Registry: `mcp.yaml` = reachability, `capabilities.yaml` = selection/usage.
</details>

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Claude Code: Skill mit `agent:` → `background-agents.ts` (`delegate` read-only, `task` write-capable); ohne `agent:` inline. Map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`/`web-audit`→website.
- opencode: `dev-flow-*` = Shared Sources wie Claude Code (T014086, ex-T013724-Dualnamen); Domain-Skills via Agent-Routing (`deny` in `opencode.jsonc`); `sdlc-autopilot` (opencode-only): ticket-triage → dev-flow-plan → Factory. `ticket-ops` bleibt der kompatible Router; agy folgt dem opencode-Pfad.
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task test:changed` (smart selection, vitest-Fallback) · `task freshness:check` (Artefakte committet) · `task test:code-quality` (file-size/import-cycle/hostname) · `task factory:eval:replay` (agent-setup, CI advisory).
- Brett: `npm run typecheck && npm test && npm run build --prefix components/brett` · Website: `pnpm test:unit` in `components/website` (vitest) · PR-Titel: Conventional Commits + `[T000XXX]` (advisory).
</details>

<details>
<summary>Other References (read when needed — all in CLAUDE.md)</summary>

- `CLAUDE.md` — authoritative comprehensive reference (task lists, topology, all footguns, package managers, health baseline updates, etc.)
- `components/website/CLAUDE.md` — Astro/Svelte quick-start
- `docs/agent-guide/README.md` — agent operating guide
</details>
