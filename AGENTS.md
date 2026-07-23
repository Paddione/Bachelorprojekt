# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 120 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Loaded via `.opencode/opencode.jsonc` → `"instructions": ["AGENTS.md"]`.

## Agent Routing (opencode local LLM)

opencode uses `agent-models.jsonc` — NOT `.agents/agents/`. Domain subagents below are Claude Code only.

| Agent | Model | Use case |
|-------|-------|----------|
| `bonsai-8b` | Ternary-Bonsai-8B (Q2_0, 65k ctx/slot, 4 parallel slots, port 8093) | **Preferred** for all write-capable delegation (max 4 parallel) |
| `deepseek-helper` | DeepSeek V4 Flash (OpenCode Go, 1M ctx) | Escalation: local agent stuck or context exhausted |
| `explore` | built-in | Read-only codebase exploration |
| `general` | built-in | Read-only general research |

Dispatch: `delegate(prompt, agent)` for read-only. `task` for write-capable (bonsai-8b, deepseek-helper).
Agent definitions live in `.opencode/agent-models.jsonc` → sync via `bash scripts/opencode-sync-agents.sh`.

## Core Commands

```bash
bash scripts/vda.sh oracle '<goal>'              # Task oracle — primary CLI
task workspace:deploy ENV=mentolder              # Prod deploy (or korczewski)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- Branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`. All changes via PRs → squash-merge. No direct pushes to `main`.
- `dev-flow-plan` (brainstorm→spec→plan→push) then `dev-flow-execute` (implement→PR→deploy).
- CI gate: `task test:changed` + `task freshness:check` + `task workspace:validate`.
- **Merge = closure** (T001092): ticket closes on green auto-merge. Prod deploy is decoupled (push-based).

## Architecture (30-second view)

- **Fleet cluster** (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski`. Context: `fleet`.
- Push-based deploy. Only website auto-deploys via GH Actions.
- k3d/ = base Kustomize. Prod overlays: `prod-fleet/mentolder/`, `prod-fleet/korczewski/`.
- Centralized domains: `k3d/configmap-domains.yaml` — never hardcode hostnames.

## Critical Footguns (must-know)

- `scripts/env-resolve.sh` must be **sourced**, not executed.
- `scripts/task-oracle.sh` is **DEPRECATED** → use `bash scripts/vda.sh oracle`.
- Never `SELECT *` from `tickets.ticket_plans` (multi-MB `content` column).
- OpenSpec archival ONLY in worktree — main-checkout commits leave orphaned files.
- Website/Brett/Docs/etc. images use `:latest` intentionally — do not "fix" to digests.
- Pre-commit blocks main-checkout when another session holds the lock. Use worktrees.

## Agent Coordination

```bash
bash scripts/agent-lock.sh reap                  # Clean stale locks (start of session)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list
bash scripts/agent-msg.sh read --unread          # Session messaging
```

## Escalation (when subagent is stuck)

```bash
bash scripts/agent-escalate.sh --agent "bachelorprojekt-<role>" --reason "<what>" --tried "<attempt>" --needs "<unblock>"
```

## Code Discovery

Use `codebase-memory-mcp` tools first (before grep/glob):
- `search_graph(name_pattern=…)`, `trace_path(function_name=…)`, `get_code_snippet(qualified_name=…)`, `query_graph(query=…)`, `get_architecture(aspects=…)`, `search_code(pattern=…)`

## OpenSpec

- Proposals/specs under `openspec/`. Lifecycle: `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`.
- Language: Purpose in German; Requirements/Scenarios in English (GIVEN/WHEN/THEN).

---

## Reference Sections (read on-demand, do not frontload)

The following sections contain detailed reference material. **Do not load them into context at session start.** Read them only when the current task requires it.

<details>
<summary>Claude Code Domain Agents (read when dispatching domain-specific subagents)</summary>

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, CSS, UI, frontend | `bachelorprojekt-website` |
| pod, logs, crash, kubectl, GPU, Ollama, LiveKit | `bachelorprojekt-ops` |
| k3d/, manifest, kustomize, overlay, Taskfile, deploy | `bachelorprojekt-infra` |
| test, FA-*, SA-*, NFA-*, BATS, Playwright, factory | `bachelorprojekt-test` |
| database, PostgreSQL, schema, query, backup | `bachelorprojekt-db` |
| SealedSecret, Keycloak, OIDC, DSGVO, credentials | `bachelorprojekt-security` |

Dispatch: `bash scripts/plan-context.sh <role> --with-openspec` → prepend as `<active-plans>`.
</details>

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Skill HAS `agent:` → dispatch via `background-agents.ts` (read-only → `delegate`, write-capable → `task`).
- Skill has NO `agent:` → loaded inline in main session.
- Skill → agent map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`→website.
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task factory:eval:replay` — after agent-setup changes (local eval, CI advisory-only).
- `task test:changed` — smart selection, falls back to vitest if no domain detected.
- `task freshness:check` — generated artifacts must be committed.
- `task test:code-quality` — file-size caps, import-cycle detection, hardcoded-hostname scan.
- Brett: `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- Website: `npm --prefix website run test:unit` (vitest)
- PR titles: Conventional Commits with `[T000XXX]` tag (advisory only, not blocking).
</details>

<details>
<summary>Health Baseline Updates (read when updating goals.md)</summary>

- `bash scripts/health-goals-check.sh` measures ~40 goals (G-* IDs).
- Never renumber G-RH01–G-RH07.
- Ticket creation is NOT automatic — use `--suggest-tickets` flag explicitly.
- See `goals.md` for full baseline. Convention: redaktionell, no Feature-Ticket needed.
</details>

<details>
<summary>Package Managers</summary>

| Area | Manager | Lockfile |
|------|---------|----------|
| Root | `npm` | `package-lock.json` |
| `website/` | `pnpm` | `website/pnpm-lock.yaml` |
| `brett/` | `npm` | `brett/package-lock.json` |
</details>

<details>
<summary>Important References (read when you need deeper context)</summary>

- `CLAUDE.md` — authoritative comprehensive reference (task lists, topology, all footguns)
- `website/CLAUDE.md` — Astro/Svelte quick-start
- `docs/agent-guide/README.md` — agent operating guide
- `.agents/skills/OVERVIEW.md` — skill layering contract
</details>
