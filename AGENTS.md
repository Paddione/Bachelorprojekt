# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 160 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Loaded via `.opencode/opencode.jsonc` → `"instructions": ["AGENTS.md"]`.

## Agent Routing (opencode local LLM)

opencode uses `agent-models.jsonc` — NOT `.agents/agents/`. Domain subagents below are Claude Code only.

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | DeepSeek V4 Flash (OpenCode Go), `mode: primary`, `write_capable: true` | Primary orchestrator — dispatches `gemma26-1`/`gemma26-2` sequentially |
| `gemma26-1` | Gemma4 26B A4B QAT (UD-Q4_K_XL, ~99840 ctx, port 8091, 3 Slots via -kvu) | Local bulk work (slot 1 of 3). `write_capable: false` |
| `gemma26-2` | same model, same server, slot 2 of 3 | Same as gemma26-1 — dispatch sequentially |
| `gemma26-primary` | same model, `mode: primary` (Tab-selectable, not summonable via `task`) | Slot 3 of 3, ~99840 ctx shared pool via -kvu. `write_capable: false` |
| `deepseek-helper` | DeepSeek V4 Flash (OpenCode Go, 1M ctx), `write_capable: true` | Escalation: local agent stuck or context exhausted |
| `explore` | built-in | Read-only codebase exploration |
| `general` | built-in | Read-only general research |

Dispatch: `delegate(prompt, agent)` for read-only. `task` for write-capable — per registry that is `orchestrator` and `deepseek-helper`, **not** the gemma agents.
Agent definitions live in `.opencode/agent-models.jsonc`; the `write_capable` flags above are SSOT in `docs/agent-guide/registry/agents.yaml` (K5/T002304) → sync via `bash scripts/opencode-sync-agents.sh`.

## Core Commands

```bash
bash scripts/vda.sh oracle '<goal>'              # Task oracle — primary CLI
task workspace:deploy ENV=mentolder              # Prod deploy (or korczewski)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- Branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`. All changes via PRs → squash-merge. No direct pushes to `main`. (CLAUDE.md Rule 7 lists only the first three; `scripts/preflight-pr-scope.sh` enforces worktrees for `feature/*` and `fix/*` and forbids neither list — the divergence is open, see T002305 design.md.)
- **Pipeline-Prinzip:** Planning-Agents (opencode-flow-plan) legen Worktree + Branch sofort an und enqueuen jedes Partial-Plan einzeln in die Factory, sobald es geschrieben ist. Die Factory beginnt mit der Ausführung, während der Planner das nächste Partial schreibt. Siehe `opencode-flow-plan` SKILL.md Phase B/C.
- `dev-flow-plan` (brainstorm→spec→partial-plan→stage→enqueue→factory-executes→next-partial) dann `dev-flow-execute` (PR→deploy).
- CI gate: `task test:changed` + `task freshness:check` + `task workspace:validate` — **vor** PR-Create lokal laufen lassen, nicht erst in CI.
- **Merge = closure** (T001092): ticket closes on green auto-merge. The prod deploy is decoupled from that — it does **not** change the ticket status.

## Architecture (30-second view)

- **Fleet cluster** (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski`. Context: `fleet`.
- **Pull-based deploy via FluxCD** (T002083): `.github/workflows/render-fleet-artifact.yml` renders the OCI artifact `ghcr.io/paddione/fleet-manifests` on every `main` push; Flux reconciles it on the fleet cluster (`flux/clusters/fleet/`). `task workspace:deploy` is break-glass fallback only.
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

## OpenSpec conventions

- Proposals/specs under `openspec/`. Lifecycle: `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`.
- Language: Purpose in German; Requirements/Scenarios in English (GIVEN/WHEN/THEN).
- Delta files in `openspec/changes/<slug>/specs/` are named after the **parent SSOT slug**, not the change slug (`openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`). A genuinely new component needs `archive --create-new`.

## Dev experience

- After installing the OpenSpec CLI, run `openspec completion install` once to enable shell completions (bash/zsh/fish/powershell).

---

## Reference Sections (read on-demand, do not frontload)

The following sections contain detailed reference material. **Do not load them into context at session start.** Read them only when the current task requires it.

<details>
<summary>Claude Code Domain Agents (read when dispatching domain-specific subagents)</summary>

| Signals | Agent |
|---------|-------|
| `website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", llm:, GPU, Ollama, model | `bachelorprojekt-ops` |
| k3d/, prod*/, manifest, kustomize, overlay, Taskfile, ENV=, environments/, deploy, workspace:setup | `bachelorprojekt-infra` |
| test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh, "test failing", "test case", "write a test", factory:, autopilot, FA-SF | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, bachelorprojekt.features, v_timeline | `bachelorprojekt-db` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

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
