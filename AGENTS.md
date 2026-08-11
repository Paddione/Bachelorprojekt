# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 160 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md`.

## Agent Routing (opencode local LLM)

opencode reads its agents from `.opencode/agent-models.jsonc` — NOT `.agents/agents/`. The `.claude/agents/*.md` domain agents below are Claude Code only.

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | DeepSeek V4 Flash (OpenCode Go, 1M ctx), `mode: primary`, write-capable | Primary orchestrator — dispatches the local family subagents (`gptoss`/`devstral`/`gemma`/`gemma12`) sequentially (llm-proxy serializes at max_inflight=1) |
| `gptoss` | `llamacpp-local/gemma26-throughput` (Gemma 4 26B A4B QAT, :8092) | Local bulk work. **Der Name lügt über das Modell seit T003204** — `gptoss-context` ist abgeschaltet, der Name bleibt als Dispatch-Schnittstelle. `write=deny`, `edit=allow` |
| `devstral` | `llamacpp-local/gemma26-factory` (Gemma 4 26B A4B IQ4_XS, :8091) | Local work. **Name lügt über das Modell seit T003204** — `devstral-quality` war in allen Dimensionen dominiert und ist abgeschaltet |
| `gemma` | `llamacpp-local/gemma26-factory` (Gemma 4 26B A4B IQ4_XS, :8091) | Local work, gemma family |
| `gemma12` | `llamacpp-local/gemma12-vision` (Gemma 4 12B QAT + mmproj-F16, :8089) | Local work, 262144 ctx — größter lokaler Kontext und einziges vision-fähiges Loadout. Seit T003204 per `task` dispatchbar |
| `gemma26-primary` | `llamacpp-local/gemma26-factory`, `mode: primary` | Fully-local tab-selectable agent; NOT summonable via `task` |
| `gemma26-vision` | `llamacpp-local/gemma26-factory`, `mode: primary` | Max local context (161024, measured), no subagent dispatch. **No vision** — gemma26-factory loads no mmproj (loadouts.json); vision is on `gemma12-vision` only |
| `gptoss-primary` | `llamacpp-local/gemma26-throughput`, `mode: primary` | Tab-selectable primary, 118016 ctx (:8092) — seit T003204 |
| `devstral-primary` | `llamacpp-local/gemma26-factory`, `mode: primary` | Tab-selectable primary, 177920 ctx, code-quality review (:8091) — seit T003204 |
| `gemma12-primary` | `llamacpp-local/gemma12-vision`, `mode: primary` | Tab-selectable primary, 262144 ctx measured. **Vision-capable** via mmproj-F16 (:8089) |
| `gemma26-throughput-primary` | `llamacpp-local/gemma26-throughput`, `mode: primary` | Tab-selectable primary, 118016 ctx measured, 159-169 tok/s (:8092) |
| `big-pickle` | `opencode-zen/big-pickle`, `mode: primary`, write-capable | Tab-selectable singleagent on OpenCode Zen — use while the free quota lasts, then switch to the deepseek primaries |
| `deepseek-helper` | `deepseek/deepseek-v4-flash` (direct API), write-capable | Escalation when a local agent is stuck or context-exhausted |
| `deepseek-pro` | `opencode-go/deepseek-v4-pro`, `mode: all`, write-capable | Deep analysis, complex debugging, hard refactors; tab-selectable AND task-dispatchable |
| `deepseek-flash` | `opencode-go/deepseek-v4-flash`, `mode: all`, write-capable | Parallel throughput, up to 3 at a time; tab-selectable AND task-dispatchable |
| `deepseek-pro-direct` | `deepseek/deepseek-v4-pro` (direct API), `mode: all`, write-capable | Same model as `deepseek-pro`, bypassing the OpenCode Go gateway when that gateway is the problem |
| `deepseek-flash-direct` | `deepseek/deepseek-v4-flash` (direct API), `mode: all`, write-capable | Same model as `deepseek-flash`, bypassing the OpenCode Go gateway when that gateway is the problem |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch:
- `task` for the local family subagents (`gptoss`, `devstral`, `gemma`, `gemma12`) and the deepseek agents — the `orchestrator` permission block lists exactly those names, no wildcards (T002298).
- Local family agents `edit` but cannot `write` new files (`write=deny`) — the orchestrator creates new files from their output. Read-only work uses `delegate` (explore/general).
- SSOT is `.opencode/agent-models.jsonc` — the only source of truth for agent→model mapping. `docs/agent-guide/registry/agents.yaml` mirrors it for the agent-guide docs; `tests/spec/agent-roster.bats` (P4.3b) fails on any model-string drift, so the mirror cannot lag silently. Global config sync: `bash scripts/opencode-sync-agents.sh`.
- **Local subagents are named by model FAMILY since 2026-08-04** (`gptoss`/`devstral`/`gemma`/`gemma12`), each serving its own loadout through the llm-proxy. The old `gemma26-1/2`, `gemma9-1/2` names all pointed at gptoss-context — the name lied about the model. Every GPU loadout shares `exclusiveGroup "chat-gpu"`: only one runs at a time (all of `loadouts.json` except the two CPU bge loadouts). The weightless loadouts (`gemma-factory`, `gemma-multiagent`, `gemma9-factory`) were removed on 2026-08-09 (T002753); `gemma`/`gemma26-primary`/`gemma26-vision` serve `gemma26-factory` (Gemma 4 26B A4B UD-IQ4_XS, 161024 ctx measured). T003204: die Familie `qwen` ist abgeschaltet (Loadout `qwen3-coder-30b` `enabled: false`).

## Core Commands

```bash
bash scripts/vda.sh oracle '<goal>'              # Task oracle — primary CLI
task workspace:deploy ENV=mentolder              # Prod deploy (or korczewski)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- Branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`. All changes via PRs → squash-merge. No direct pushes to `main`. `scripts/preflight-pr-scope.sh` enforces worktrees for `feature/*`/`fix/*`.
- opencode dev flow: `opencode-flow-plan` → `opencode-flow-execute`; chores via `opencode-flow-chore`. The Claude Code `dev-flow-*` skills are **denied** in opencode — use the opencode-native skills.
- **Pipeline-Prinzip:** Planning-Agents (opencode-flow-plan) legen Worktree + Branch sofort an und enqueuen jedes Partial-Plan einzeln in die Factory, sobald es geschrieben ist. Die Factory beginnt mit der Ausführung, während der Planner das nächste Partial schreibt. Siehe `opencode-flow-plan` SKILL.md Phase B/C.
- CI gate — **vor** PR-Create lokal laufen lassen: `task test:changed` + `task freshness:check` + `task workspace:validate`.
- **Merge = closure** (T001092): ticket closes on green auto-merge. Prod deploy is decoupled — it does **not** change the ticket status.

## Architecture (30-second view)

- **Fleet cluster** (single k3s): mentolder → ns `workspace`, korczewski → ns `workspace-korczewski`. Context: `fleet`.
- **Pull-based deploy via FluxCD** (T002083): `.github/workflows/render-fleet-artifact.yml` renders the OCI artifact `ghcr.io/paddione/fleet-manifests` on every `main` push; Flux reconciles it (`flux/clusters/fleet/`). `task workspace:deploy` is break-glass fallback only.
- k3d/ = base Kustomize. Prod overlays: `prod-fleet/mentolder/`, `prod-fleet/korczewski/`.
- Centralized domains: `k3d/configmap-domains.yaml` — never hardcode hostnames.

## Critical Footguns (must-know)

- `scripts/env-resolve.sh` must be **sourced**, not executed.
- `scripts/task-oracle.sh` is **DEPRECATED** → use `bash scripts/vda.sh oracle`.
- Never `SELECT *` from `tickets.ticket_plans` (multi-MB `content` column).
- OpenSpec archival ONLY in worktree — main-checkout commits leave orphaned files.
- Website/Brett/Docs/etc. images use `:latest` intentionally — do not "fix" to digests.
- Pre-commit blocks main-checkout when another session holds the lock. Use worktrees.
- `website/` is pnpm-only (its package-lock.json was deleted, T001224); root and `brett/` use npm. Never `npm install` inside `website/`.

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

Use `codebase-memory-mcp` tools first (before grep/glob): `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`.

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

Also prepend the curated toolset: `bash scripts/toolset-context.sh <role>` → wrap as `<toolset>`.
It renders every tool the role may use from `docs/agent-guide/registry/capabilities.yaml`, with
`use_when` / `avoid_when` / `fallback` / deep reference, so a subagent reaches for the canonical
path (`gh-axi`, not `gh`) instead of guessing. Harness-neutral — plain bash plus `node -e`.

> ⚠ `toolset-context.sh` is **fail-closed** on an unknown role: non-zero exit, no output. It
> deliberately differs from `plan-context.sh`, whose silent `__ALL__` fallback disables the role
> filter without failing (T002322) — for a toolset block that would inject the whole arsenal into
> every prompt. Same role names, plus the wildcard `all`. Curation: skill `toolset-curate`; gate:
> `task agents:toolset:check`.

Registry split: `mcp.yaml` owns *reachability* (transport, endpoint, credentials);
`capabilities.yaml` owns *selection and usage*.
</details>

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Claude Code only: a skill with `agent:` dispatches via `background-agents.ts` (read-only → `delegate`, write-capable → `task`); without `agent:` it loads inline. Skill → agent map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`→website.
- opencode: the `dev-flow-*` and domain skills are **denied** in `.opencode/opencode.jsonc`. Use the opencode-native skills instead: `opencode-flow-plan`, `opencode-flow-execute`, `opencode-flow-chore`, `openspec-*`, `git-workflow`.
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task factory:eval:replay` — after agent-setup changes (local eval, CI advisory-only).
- `task test:changed` — smart selection, falls back to vitest if no domain detected.
- `task freshness:check` — generated artifacts must be committed.
- `task test:code-quality` — file-size caps, import-cycle detection, hardcoded-hostname scan.
- Brett: `npm run typecheck --prefix brett && npm test --prefix brett && npm run build --prefix brett`
- Website: `(cd website && pnpm test:unit)` (vitest)
- PR titles: Conventional Commits with `[T000XXX]` tag (advisory only, not blocking).
</details>

<details>
<summary>Health Baseline Updates (read when updating .claude/lib/goals.md)</summary>

- `bash scripts/health-goals-check.sh` measures ~40 goals (G-* IDs).
- Never renumber G-RH01–G-RH07.
- Ticket creation is NOT automatic — use `--suggest-tickets` flag explicitly.
- Full baseline lives in `.claude/lib/goals.md`. Convention: redaktionell, no Feature-Ticket needed.
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
