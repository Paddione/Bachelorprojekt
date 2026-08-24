# AGENTS.md — Quick-Start for Orchestrator Sessions

> **Goal:** Keep this file under 160 lines of must-know content. Reference details live in CLAUDE.md and the linked sections below — read them on-demand, not upfront.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md`.

## Agent Routing (opencode local LLM)

opencode reads its agents from `.opencode/agent-models.jsonc` — NOT `.agents/agents/`. The `.claude/agents/*.md` domain agents below are Claude Code only.

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `alibaba-intl/qwen3.8-max` (Alibaba Cloud, 131k ctx), `mode: primary`, write-capable | Primary orchestrator — dispatches local subagents + cloud escalation (`qwen-cloud`/`deepseek-*`). Eskalationskette: lokal → qwen-cloud → deepseek-helper → deepseek-pro [T013360] |
| `gptoss` | `freetoken-local/active` (FreeToken-native :1919, Alias = residentes Modell) | Local bulk work. **Name lügt** weiterhin (Familien-Handle); seit T014105 modellagnostisch. `write=deny`, `edit=allow` |
| `devstral` | `freetoken-local/active` (FreeToken-native :1919) | Local work. **Name lügt** weiterhin; seit T014105 modellagnostisch |
| `gemma` | `freetoken-local/active` (FreeToken-native :1919) | Local work. **Name lügt** weiterhin; seit T014105 modellagnostisch |
| `gemma12` | `freetoken-local/active` (FreeToken-native :1919) | Local work. **Name lügt** weiterhin; seit T014105 modellagnostisch |
| `qwen38` | `freetoken-local/active` (FreeToken-native :1919) | Local work, text-only. Seit T014105 modellagnostisch; FreeToken serviert ein Modell resident — sequenziell dispatchen |
| `qwen-cloud` | `alibaba-intl/qwen3.8-max` (Alibaba Cloud, 131k ctx), `mode: subagent`, write-capable | Cloud-Eskalation: Qwen 3.8 Max, erste Stufe nach lokal. Selbe Modell-Familie wie Orchestrator [T013360] |
| `freetoken-primary` | `freetoken-local/active`, `mode: primary` | Dedizierter Primary auf dem FreeToken-Alias — tab-selectable, text-only [T014105]. Einziger lokaler Tab-Primary seit T016419 |
| `big-pickle` | `opencode-zen/big-pickle`, `mode: primary`, write-capable | Tab-selectable singleagent on OpenCode Zen — use while the free quota lasts, then switch to the deepseek primaries. Since 2026-08-22 can dispatch the same subagent set as the orchestrator |
| `ox-alpha-free` | `opencode-zen/laguna-s-2.1-free`, `mode: primary`, write-capable | Second free-tier primary next to big-pickle (Poolside agentic coding model, 256k ctx per models.dev, smoke-tested 2026-08-22). Dispatches ONLY `ox-alpha` subagents |
| `ox-alpha` | `opencode-zen/laguna-s-2.1-free`, `mode: subagent`, write-capable | Subagent twin of `ox-alpha-free` — its sole dispatch target [2026-08-23], keeping parallel work in the same free-tier family |
| `deepseek-helper` | `deepseek/deepseek-v4-flash` (direct API), write-capable | Escalation when a local agent is stuck or context-exhausted; twin `deepseek-helper-go` rides OpenCode Go |
| `deepseek-helper-go` | `opencode-go/deepseek-v4-flash`, write-capable | Same escalation tier as `deepseek-helper` via the Go gateway — alternate rail when the direct API is down |
| `deepseek-helper-alibaba` | `alibaba-intl/deepseek-v4-flash-0731`, write-capable | Same escalation tier via the Alibaba Token Plan — third rail after the 2026-08-22 key rotation (note the `-0731` model ID) |
| `deepseek-pro` | `opencode-go/deepseek-v4-pro`, `mode: all`, write-capable | Deep analysis, complex debugging, hard refactors; tab-selectable AND task-dispatchable |
| `deepseek-flash` | `opencode-go/deepseek-v4-flash`, `mode: all`, write-capable | Parallel throughput, up to 3 at a time; tab-selectable AND task-dispatchable |
| `deepseek-pro-direct` | `deepseek/deepseek-v4-pro` (direct API), `mode: all`, write-capable | Same model as `deepseek-pro`, bypassing the OpenCode Go gateway when that gateway is the problem |
| `deepseek-pro-alibaba` | `alibaba-intl/deepseek-v4-pro`, `mode: all`, write-capable | Same model as `deepseek-pro` via the Alibaba Token Plan — third rail (Go, direct, alibaba) |
| `deepseek-flash-direct` | `deepseek/deepseek-v4-flash` (direct API), `mode: all`, write-capable | Same model as `deepseek-flash`, bypassing the OpenCode Go gateway when that gateway is the problem |
| `alibaba-primary` | `alibaba-intl/qwen3.8-max` (Alibaba Cloud Intl Token Plan, 131072 ctx), `mode: primary` | PRIMARY: Qwen3.8 Max via Alibaba Cloud Intl Token Plan — tab-selectable singleagent, replaces deepseek-v4-flash as the default model [T004396] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch:
- `task` for the local family subagents (`gptoss`, `devstral`, `gemma`, `gemma12`) and the deepseek agents — the `orchestrator` permission block lists exactly those names, no wildcards (T002298).
- Local family agents `edit` but cannot `write` new files (`write=deny`) — the orchestrator creates new files from their output. Read-only work uses `delegate` (explore/general).
- SSOT is `.opencode/agent-models.jsonc` — the only source of truth for agent→model mapping. `docs/agent-guide/registry/agents.yaml` mirrors it for the agent-guide docs; `tests/spec/agent-roster.bats` (P4.3b) fails on any model-string drift, so the mirror cannot lag silently. Global config sync: `bash scripts/opencode-sync-agents.sh`.
- **Backend note-down (T016419):** FreeToken-native auf Windows/pk-desktop — Server `:1919`, Daemon `:1900` (`/engine/switch`). Drei viable MoE-FTW-Checkpoints unter `C:\Users\PatrickKorczewski\models`: Qwen3.6-35B-A3B-NVFP4, gpt-oss-20b, Gemma-4-26B-A4B-NVFP4. Der Alias `freetoken-local/active` trifft immer das residente Modell; das Plugin `.opencode/plugin/freetoken-active.ts` setzt Limit + Name beim opencode-Start.
- **Constraint:** dense Modelle passen nicht ins VRAM-Budget — Qwen3.6-27B-NVFP4 wurde deshalb T016419 gelöscht (19 GB), nicht deklariert.
- **Altlasten-Prosa (korrigiert):** Alle GPU-Chat-Loadouts sind seit dem FreeToken-Cutover deaktiviert; drei GGUF-Katalogeinträge (`hauhau-qwen36`, `gemma12-vision`, `qwen38-220k`) bleiben über den `llamacpp-local`-Provider als Rückfallebene deklariert. Die Familien-Subagenten heißen seit 2026-08-04 nach Modell-FAMILIE (`gptoss`/`devstral`/`gemma`/`gemma12`) und sind seit T014105 modellagnostisch auf dem Alias; frühere Loadout-Bindungen, exclusiveGroup-Verdrängung und Slot-Messungen (`scripts/llm/measurements/`) sind Vergangenheit.

## Core Commands

```bash
bash scripts/vda.sh oracle '<goal>'              # Task oracle — primary CLI
task workspace:deploy ENV=mentolder              # Prod deploy (or korczewski)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- Branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`. All changes via PRs → squash-merge. No direct pushes to `main`. `scripts/preflight-pr-scope.sh` enforces worktrees for `feature/*`/`fix/*`.
- opencode dev flow: `dev-flow-plan` → `dev-flow-execute`; chores via `dev-flow-chore`. Seit T014086 lädt opencode die Shared Sources `.claude/skills/dev-flow-*` unter denselben Namen wie Claude Code (Directory-Symlinks, Nachfolger der T013724-Dualbenennung); `dev-flow-e2e` bleibt Claude-seitig.
- **Pipeline-Prinzip:** Planning-Agents (dev-flow-plan) legen Worktree + Branch sofort an und enqueuen jedes Partial-Plan einzeln in die Factory, sobald es geschrieben ist. Die Factory beginnt mit der Ausführung, während der Planner das nächste Partial schreibt. Siehe `dev-flow-plan` SKILL.md Phase B/C.
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
- `components/website/` is pnpm-only (its package-lock.json was deleted, T001224); root and `components/brett/` use npm. Never `npm install` inside `components/website/`.

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
| `components/website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", llm:, GPU, Ollama, model | `bachelorprojekt-ops` |
| k3d/, prod*/, manifest, kustomize, overlay, Taskfile, ENV=, environments/, deploy, workspace:setup | `bachelorprojekt-infra` |
| test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh, "test failing", "test case", "write a test", factory:, autopilot, FA-SF | `bachelorprojekt-test` |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, bachelorprojekt.features, v_timeline | `bachelorprojekt-db` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` |

Dispatch: `bash scripts/plan-context.sh <role> --with-openspec` → prepend as `<active-plans>`.

Also prepend the curated toolset: `bash scripts/toolset-context.sh <role>` → wrap as `<toolset>`.
It renders every tool the role may use from `docs/agent-guide/registry/capabilities.yaml`, with
`use_when` / `avoid_when` / `fallback` / deep reference, so a subagent reaches for the canonical
path (`gh-axi` for display; `gh` for `--json`/polling/mutations — T004612) instead of guessing. Harness-neutral — plain bash plus `node -e`.

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
- opencode: `dev-flow-plan`/`-execute`/`-chore` sind seit T014086 Directory-Symlinks auf dieselben Shared Sources wie bei Claude Code — beide Harnesses nutzen dieselben Namen (Nachfolger der T013724-Dualbenennung `opencode-flow-*`). Domain skills bleiben via agent routing dispatched (`deny` in `.opencode/opencode.jsonc`).
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task factory:eval:replay` — after agent-setup changes (local eval, CI advisory-only).
- `task test:changed` — smart selection, falls back to vitest if no domain detected.
- `task freshness:check` — generated artifacts must be committed.
- `task test:code-quality` — file-size caps, import-cycle detection, hardcoded-hostname scan.
- Brett: `npm run typecheck --prefix components/brett && npm test --prefix components/brett && npm run build --prefix components/brett`
- Website: `(cd components/website && pnpm test:unit)` (vitest)
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
