# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 160 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md`.

## Agent Routing (opencode local LLM)

opencode reads its agents from `.opencode/agent-models.jsonc` — NOT `.agents/agents/`. The `.claude/agents/*.md` domain agents below are Claude Code only.

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `alibaba-intl/qwen3.8-max` (131k ctx, primary, write) | Primary — dispatches local + cloud escalation [T013360] |
| `gptoss` `devstral` `gemma` `gemma12` `qwen38` | `freetoken-local/active` (FreeToken :1919, modellagnostisch) | Local work (qwen38 text-only, sequenziell); `write=deny`, `edit=allow`; via `task` |
| `qwen-cloud` | `alibaba-intl/qwen3.8-max` (131k ctx, subagent, write) | Cloud-Eskalation Stufe 1 |
| `freetoken-primary` | `freetoken-local/active` (primary) | Tab-selectable lokaler Primary, text-only [T014105] |
| `freetoken-thinking` | `freetoken-local/active-thinking` (all) | 200k-Reasoning, Thinking request-dynamisch |
| `freetoken-fast-1` `freetoken-fast-2` `freetoken-fast-3` | `freetoken-local/active-fast` (all) | Non-thinking 85k-Worker, sequenziell, shared Engine/KV-Pool |
| `big-pickle` | `opencode-zen/big-pickle` (primary, write) | Zen-Singleagent bis Free-Quota verbraucht |
| `ox-alpha-free` | `opencode-zen/laguna-s-2.1-free` (primary, write) | Free-Tier-Primary; dispatcht nur `ox-alpha` |
| `ox-alpha` | `opencode-zen/laguna-s-2.1-free` (subagent, write) | Subagent-Zwilling von `ox-alpha-free` |
| `deepseek-helper` `deepseek-helper-go` `deepseek-helper-alibaba` | `deepseek-v4-flash` (write) | Eskalation wenn lokal stuck/ctx-leer; 3 Rails |
| `deepseek-pro` `deepseek-pro-direct` `deepseek-pro-alibaba` | `deepseek-v4-pro` (all, write) | Tiefe Analyse/harte Refactors; 3 Rails |
| `deepseek-flash` `deepseek-flash-direct` | `deepseek-v4-flash` (all, write) | Parallel-Throughput bis 3; 2 Rails |
| `alibaba-primary` | `alibaba-intl/qwen3.8-max` (primary) | PRIMARY via Alibaba-Plan [T004396] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task` für local family + deepseek (Namen aus Tabelle, keine Wildcards, T002298). Lokale: `write=deny` → Orchestrator erzeugt Dateien; read-only via `delegate`. SSOT `.opencode/agent-models.jsonc` (Mirror `docs/agent-guide/registry/agents.yaml`, Sync `scripts/opencode-sync-agents.sh`, Guard `tests/spec/agent-roster.bats`).
- FreeToken (:1919, Daemon :1900, Checkpoints unter `C:\Users\PatrickKorczewski\models`, Limit via Plugin — Details im `freetoken-setup`-Skill). GGUF-Rückfallebene via `llamacpp-local`; dichte Modelle passen nicht ins VRAM-Budget (T016419).

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

- `scripts/env-resolve.sh` sourcen (nie executen); `scripts/task-oracle.sh` DEPRECATED → `bash scripts/vda.sh oracle`; nie `SELECT *` aus `tickets.ticket_plans`.
- OpenSpec-Archiv nur im Worktree; Images `:latest` ok (keine Digests "fixen"); Pre-commit blockt Main-Checkout bei fremdem Lock → Worktrees.
- `components/website/` pnpm-only (nie `npm install` dort); Root + `components/brett/` npm.

## Agent Coordination

```bash
bash scripts/agent-lock.sh reap                  # Clean stale locks (start of session)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list
bash scripts/agent-msg.sh read --unread          # Session messaging
bash scripts/worktree-list.sh [--json] [--all]   # Welche Worktrees existieren gerade (--all: + factory-runner-Pod)
```

Der Worktree-*Ort* ist Konvention (`.worktrees/<slug>`), die *aktuelle Liste* steht in der
git-Registrierung: erfragen statt konfigurieren — `worktree-list.sh` ist die gemeinsame Abfrage
für alle Harnesses.

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

- After installing the OpenSpec CLI, run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell).

---

## Status Protocol (every reply, non-negotiable)

Reply footer (fenced): `STATUS` (what happened) | `RUNNING` (background work or "none") | `BLOCKED` (blockers or "none") | `NEXT` (top value-vs-effort objective from `factory_status`/`queue`/tickets — one word overrides) | `CONF` (high|medium|low). Risk-based autonomy: reversible/low-risk = act; destructive/costly/ambiguous = ask first.

## Reference Sections (read on-demand, do not frontload)

The following sections contain detailed reference material. **Do not load them into context at session start.** Read them only when the current task requires it.

<details>
<summary>Claude Code Domain Agents (read when dispatching domain-specific subagents)</summary>

| Signals | Agent |
|---------|-------|
| `components/website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", llm:, GPU, Ollama, model | `bachelorprojekt-ops` |
| k3d/, prod*/, manifest, kustomize, overlay, Taskfile, ENV=, environments/, deploy, workspace:setup | `bachelorprojekt-infra` |
| test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh, "test failing", "test case", "write a test", factory:, autopilot, FA-SF | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, bachelorprojekt.features, v_timeline | `bachelorprojekt-db` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Dispatch: `bash scripts/plan-context.sh <role> --with-openspec` → `<active-plans>`, `bash scripts/toolset-context.sh <role>` → `<toolset>` (fail-closed auf unbekannte Rolle, T002322). Curation: `toolset-curate`; Gate: `task agents:toolset:check`. Registry: `mcp.yaml` = reachability, `capabilities.yaml` = selection/usage.
</details>

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Claude Code: Skill mit `agent:` → `background-agents.ts` (`delegate` read-only, `task` write-capable); ohne `agent:` inline. Map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`/`web-audit`→website.
- opencode: `dev-flow-*` = Shared Sources wie Claude Code (T014086, ex-T013724-Dualnamen); Domain-Skills via Agent-Routing (`deny` in `opencode.jsonc`); `sdlc-autopilot` (opencode-only): ticket-ops → dev-flow-plan → Factory.
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task test:changed` (smart selection, vitest-Fallback) · `task freshness:check` (Artefakte committet) · `task test:code-quality` (file-size/import-cycle/hostname) · `task factory:eval:replay` (agent-setup, CI advisory).
- Brett: `npm run typecheck && npm test && npm run build --prefix components/brett` · Website: `pnpm test:unit` in `components/website` (vitest) · PR-Titel: Conventional Commits + `[T000XXX]` (advisory).
</details>

<details>
<summary>Health Baseline Updates (read when updating .claude/lib/goals.md)</summary>

- `bash scripts/health-goals-check.sh` (~40 G-*-Goals, nie G-RH01–G-RH07 umnummerieren; SSOT `.claude/lib/goals.md`, redaktionell). Tickets nur mit `--suggest-tickets`.
</details>

<details>
<summary>Package Managers</summary>

| Area | Manager | Lockfile |
|------|---------|----------|
| Root | `npm` | `package-lock.json` |
| `components/website/` | `pnpm` | `components/website/pnpm-lock.yaml` |
| `components/brett/` | `npm` | `components/brett/package-lock.json` |
</details>

<details>
<summary>Important References (read when you need deeper context)</summary>

- `CLAUDE.md` — authoritative comprehensive reference (task lists, topology, all footguns)
- `components/website/CLAUDE.md` — Astro/Svelte quick-start
- `docs/agent-guide/README.md` — agent operating guide
- `.agents/skills/OVERVIEW.md` — skill layering contract
</details>
