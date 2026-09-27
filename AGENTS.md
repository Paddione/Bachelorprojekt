# AGENTS.md — Leading Agent Reference & Architecture SSOT

> **SSOT:** This file is the primary repository guidance, architecture SSOT, and operational reference for all agent sessions (Claude Code, OpenCode, Antigravity). Tool-specific guidance and mirrors (such as `CLAUDE.md` and `GEMINI.md`) reference this document as the leading authority.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md` and `CLAUDE.md`. Maschinenlesbarer Einstiegsindex: [`llms.txt`](llms.txt).

## Agent Routing

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md` (`.agents/agents` symlink).

### OpenCode / Orchestrator Runtimes

| Agent | Model | Use case |
|-------|-------|----------|
| `orchestrator` | `llamacpp-local/Muse-Glimmer-30B` (131k ctx, RTX 5070 Ti, primary, write) | Primary — dispatches `qwen35-mtp` on RTX 3060 Ti + exe-muse/2-rail cloud escalation |
| `local` | `llamacpp-local/Muse-Glimmer-30B` (131k served KV, DFlash2) | Higher-capability local subagent; `write=deny`, `edit=allow`; sequential, `budget_tokens` per packet |
| `qwen35-mtp` | `llamacpp-qwen35/Qwen3.5-4B-MTP` (128k served KV, RTX 3060 Ti) | Text-only single-slot MTP subagent; Q4_K_XL weights and Q4 KV |
| `exe-muse` | `opencode-go-oai/muse-spark-1.3-contributor` (1M ctx, subagent, write; Responses API) | Execution worker (M2 after 2× local); dispatched by `orchestrator`/`big-pickle`/`glimmer-primary` |
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
| `plan-worker-4b` | `llamacpp-qwen35/Qwen3.5-4B-MTP` (primary, write; 3 Slots :1920) | plan-runner-Worker: führt ein OpenSpec-Partial aus; via `scripts/llm/plan-runner.mjs`, nicht interaktiv [T900504] |
| `plan-worker-self` | `llamacpp-local/Muse-Glimmer-30B` (primary, write; :1919) | plan-runner-Fallback wenn alle 4B-Slots belegt; ein Partial in einem Lauf [T900504] |
| `explore` / `general` | built-in | Read-only exploration / research |

Dispatch: `task local` für lokale Implementation + deepseek-Rails (Go zuerst). Lokale: `write=deny` → Orchestrator erzeugt. SSOT `.opencode/agent-models.jsonc`; Historie `docs/agent-guide/registry/retired.md`.

### Domain Agents & MCP Mappings (Claude Code & Shared)

| Signals | Agent | MCP-Primär (Claude Code) |
|---------|-------|--------------------------|
| `components/website/`, Astro, Svelte, component, homepage, kore, mentolder brand, CSS, UI, frontend, design | `bachelorprojekt-website` | — |
| pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running", `llm:`, GPU, Ollama, model | `bachelorprojekt-ops` | `mcp-kubernetes` (localhost:18080) — Claude-Code-only SSE server, see `mcp-tool-guide.md` |
| `fleet/`, `prod*/`, manifest, kustomize, overlay, Taskfile, `ENV=`, `environments/`, deploy, `workspace:setup` | `bachelorprojekt-infra` | `mcp-kubernetes` (localhost:18080) — nur Status-Checks (Claude-Code-only) |
| test, `FA-*`, `SA-*`, `NFA-*`, `AK-*`, BATS, Playwright, `runner.sh`, "test failing", "test case", "write a test" | `bachelorprojekt-test` | `ticket-mcp` (Go-Adapter) — Ticket-Reads/Lifecycle; `mcp-postgres` (:13001, devmesh seit T900191, nur mentolder) für Nicht-Ticket-Tabellen |
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, **devmesh**-DB seit T900191, nur mentolder-Brand-Daten) — Ticket-Reads → `ticket-mcp` mit `brand` |
| SealedSecret, Pocket ID, OIDC client, DSGVO, credentials, rotate, certificate, secret | `bachelorprojekt-security` | — |

> **MCP-Registry ist SSOT (T002300/T002592):** `docs/agent-guide/registry/mcp.yaml` ist SSOT für Erreichbarkeit; `task mcp:sync` regeneriert `.mcp.json`, `.opencode/opencode.jsonc`, `mcp_config.json`. The opencode runtime registers: `bge-mcp`, `codebase-memory-mcp`, `context7`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`, `playwright`, `ticket-mcp-node`, `warden`. `docs/agent-guide/registry/capabilities.yaml` ist SSOT für Auswahl/Nutzung. Siehe [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md).
> **gh-axi (T004612):** Bevorzugt für Anzeige. Für maschinelles Parsen (`--json`, `-q`, `--jq`), Polling (`pr checks`) und Mutationen (`pr merge`, `gh api`) immer `gh` direkt verwenden. Siehe [`.claude/skills/references/gh-axi.md`](.claude/skills/references/gh-axi.md).

**Before dispatching any domain agent, inject active plan context & curated toolset:**
```bash
context=$(bash scripts/plan-context.sh <full-role-name> --with-openspec)
[ -n "$context" ] && prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"

tools=$(bash scripts/toolset-context.sh <full-role-name>)
[ -n "$tools" ] && prompt="<toolset>\n${tools}\n</toolset>\n\n${prompt}"
```
`<role>` muss ein voller Rollenname sein (`bachelorprojekt-*` / `orchestrator`); `toolset-context.sh` ist fail-closed (Exit ≠ 0 bei ungültiger Rolle). Nach Planerstellung: `bash scripts/vda.sh frontmatter <plan-file>`. Cross-cutting requests verbleiben beim Haupt-Orchestrator.

### Session Model & Delegation (T002153)

The main loop runs on the user's default model (or Opus in Claude Code). Model tiering:
- **Domain agents**: `bachelorprojekt-ops/-db/-test/-website` → `sonnet` (mechanical recon, queries, tests, UI); `bachelorprojekt-infra`/`-security` → `opus` (cross-system, risky, irreversible).
- **Ad-hoc subagents**: explicit model per dispatch. See [`subagent-provisioning.md`](.claude/skills/references/subagent-provisioning.md).
- **Context Budget**: 1M context is a budget, not a license. Bulk reads (CI logs, research sweeps, multi-file recon) belong in a condensing subagent. When compacted, preserve: objective, active plan/ticket, changed files, test results, decisions, blockers, error signatures, next concrete action. Discard stale reconnaissance and raw tool outputs.

## Core Commands & Task Oracle

Never look up or hardcode task commands. Use the task oracle instead:
```bash
bash scripts/vda.sh oracle '<goal in plain English>'
```

**Flags for automation/scripts:**
- `--dry-run` / `-n` — resolve and print task command without executing.
- `--json` — outputs `{"task":"...","env":"...","cmd":"..."}`.
- `--quiet` / `-q` — suppress diagnostic stderr lines.

Routes: local Ollama (`localhost:11434`) → Opencode `task-runner` fallback → `task --list` error hint.

```bash
task workspace:deploy ENV=mentolder              # Prod deploy (mentolder live; korczewski frozen per T002479)
task test:changed                                # Smart test selection (pre-commit gate)
task workspace:validate                          # Kustomize dry-run
```

## Workflow Rules

- **Branching & PRs**: Branches `feature/*`, `fix/*`, `chore/*`, `docs/*`; PRs → squash-merge, never push directly to `main` (`preflight-pr-scope.sh` enforces worktrees).
- **dev-flow**: `dev-flow-plan` → `dev-flow-execute` (Chores: `dev-flow-chore`); a staged plan is executed by `dev-flow-execute` (locally optional: `scripts/llm/plan-runner.mjs`).
- **CI Gate vor PR**: `task test:changed` + `task freshness:check` + `task workspace:validate`.
- **Merge = Abschluss (T001092)**: Ticket closes on green auto-merge to `main` (`done · resolution=shipped`). Prod deploy is decoupled push-based and does NOT change ticket status.
- **Deliverable-Check vor manuellem done/shipped (M10, T002506)**: Bei manuellen Closures (Epics über mehrere PRs) vor dem Setzen auf done/shipped prüfen, dass alle Deliverable-Dateien auf `origin/main` existieren (`git ls-tree -r --name-only origin/main | grep -qxF <pfad>`).
- **Bug-Triage-Konvention (CFR-Gate G-DORA03)**: Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst (`bash scripts/ticket.sh create --type bug --title "..." --description "..."`) — kein stiller `fix()`-Commit ohne Ticket-Referenz. CFR wird gemessen via `bash scripts/vda.sh cfr` (Ziel ≤ 15 % über 8 Wochen).
- **Mess-Konvention (T002717)**: Wer eine Messung als Entscheidungsgrundlage in ein Ticket schreibt, notiert den ausführbaren Befehl mit Suchmuster und Commit-Stand (`PRE=<sha>`) im Code-Block. Redaktioneller Hinweis.
- **PowerShell-Skripte (.ps1, T002495-M7)**: ASCII-Pflicht (kein BOM), Parser-Check vor Commit, `-Encoding ASCII` für generierte `.conf`-Dateien. Siehe [`scripts/llm/CLAUDE.md`](scripts/llm/CLAUDE.md).

## Project Overview

**Workspace MVP** — Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates:
- Traefik: Built-in k3s ingress.
- Pocket ID: SSO & OIDC provider (`k3d/pocket-id.yaml`) for ~20 clients via `pocket-id-client-seed` Job.
- Nextcloud + Talk: Files, groupware, and video calls with Talk-HPB + coturn + Janus.
- Collabora: Office suite.
- Vaultwarden: Password management.
- Whiteboard: Collaborative whiteboard server (`k3d/whiteboard/`).
- Brett: Node.js 3D systemic-constellation board (`k3d/brett.yaml`).
- Mailpit: Local SMTP/email inbox.
- DocuSeal: Document signing.
- Tracking & Timeline: DB-backed analytics in shared DB.
- Website: Astro/Svelte platform frontend (`website` namespace).
- Database: Shared PostgreSQL 16 (`shared-db`) in `workspace` namespace. (LiveKit and auto-docs removed).

Prerequisites: Docker, kubectl, `task` (go-task). `k3d` binary is no longer needed/used (T900120).

## Architecture & Cluster Topology (Fleet Stage 3)

- **mentolder (BRAND)**: Live production brand. DNS for `mentolder.de` routes to the **`fleet`** cluster. Use `ENV=mentolder` (or alias `fleet-mentolder`), context `fleet`, namespace `workspace`.
- **korczewski (BRAND — FROZEN per T002479)**: Standalone cluster torn down; hosts joined `fleet`. DNS routes to fleet. **Brand is FROZEN since 2026-07-23:** `flux/clusters/fleet/ks-korczewski.yaml` is `suspend: true`, deployments in `workspace-korczewski` and `website-korczewski` scaled to 0 replicas. Do not accidentally deploy or scale up.
- **`fleet` Cluster**: Unified production k3s cluster — 3 control-plane nodes (`pk-hetzner-4/6/8`) plus worker nodes from the `gekko-hetzner-*` pool.
- **Kubeconfig Contexts**: Exactly two active contexts exist:
  - `fleet`: Production cluster.
  - `devmesh`: Local development mesh (ADR-008).
  - Dead contexts: `mentolder`, `korczewski`, `k3s-1`, `hetzner`, and `k3d-*` point to decommissioned hardware.

### Key Components & Manifests

- **`k3d/`**: Base Kubernetes manifests (Kustomize). Applied by pull-based FluxCD pipeline and break-glass deploy.
- **`prod/`**: Shared production patches (TLS, replicas, resource limits).
- **`prod-fleet/mentolder/`, `prod-fleet/korczewski/`**: Overlays applied in prod, referenced by `ENV_OVERLAY` in `environments/<brand>.yaml`. Wraps base overlay with `fleet-common` and node affinity.
- **`prod-fleet/mentolder-jobs/`, `prod-fleet/korczewski-jobs/` (T002207)**: Isolated bootstrap/seed Job overlays (`flux-<brand>-jobs` Kustomizations in `flux/clusters/fleet/ks-jobs-*.yaml`) with `dependsOn`, `force: true`, `wait: false`.
- **`prod-fleet/staging/`, `prod-fleet/website-staging/` (T015004)**: Staging stack wired into Flux (`workspace-staging`, `website-staging`). Env profile: `environments/staging.yaml`. CronJobs target `${WEBSITE_NAMESPACE}`.
- **Flux GitOps Pipeline**: Pull-based deployment. `.github/workflows/render-fleet-artifact.yml` renders the OCI artifact `ghcr.io/paddione/fleet-manifests` on `main` push, reconciled by Flux (`flux/clusters/fleet/`). `task workspace:deploy` is break-glass fallback.
- **`environments/` Config & Secrets Registry**:
  - `environments/<env>.yaml`: Per-environment configuration, read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml`: Plaintext secrets (git-crypt-encrypted at-rest, tracked in git; input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml`: Committed SealedSecret resources applied before manifests.
  - `environments/schema.yaml`: Authoritative environment variable schema; validated by `env:validate`.
  - `environments/certs/`: Cluster public sealing certificates (`env:fetch-cert`).

## CI/CD, Testing Standards & Image Exclusions

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs:
- **Test- und BATS-Konventionen (T002448-M4)**: Tests verify **command output** and semantics (`output verification`), not static implementation source code. Runner: `tests/unit/lib/bats-core/bin/bats`.
- **Test Inventory Check**: Re-runs `task test:inventory` and asserts `components/website/src/data/test-inventory.json` matches committed state.
- **Release Notes**: Generate with `bash scripts/vda.sh release-notes generate` or `task release:notes`; publish with `publish-github` or prepend to `CHANGELOG.md` with `publish-changelog`.
- **Image Exclusions (`:latest` permitted)**:
  Exempt from digest pinning: Website, Brett, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console (`website-sdlc`), Factory-Runner (`factory-runner`), MCP-Node (`mcp-node`), Repo-Sync (`repo-sync`), Dev-Shell (`dev-shell`). (Auto-docs retired in T900452).

## Critical Footguns (must-know)

- Full reference: [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).
- `scripts/env-resolve.sh` must be sourced, never executed directly.
- `task-oracle.sh` is DEPRECATED → use `bash scripts/vda.sh oracle`.
- Never run `SELECT *` from `tickets.ticket_plans` (large content bloats memory).
- OpenSpec changes must be staged in a worktree, never directly in the main checkout.
- Pre-commit hooks block main checkout when another agent holds a lock → use worktrees.
- `components/website/` is strictly `pnpm` (never `npm install` there); Root and `components/brett/` use `npm`.
- `git-crypt` unlock without keyfile uses `gpg.program`; under WSL point to Windows `gpg.exe`. See `docs/runbooks/git-crypt-key-distribution.md`.
- After modifying manifests, run `./tests/runner.sh local <TEST-ID>`.

## Agent Coordination & Locks

```bash
bash scripts/agent-lock.sh reap                  # Clean stale locks (start of session)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
bash scripts/agent-lock.sh list
bash scripts/agent-msg.sh read --unread          # Session messaging
bash scripts/worktree-list.sh [--json] [--all]   # Active worktrees (including factory-runner pod)
```
Worktree convention: `.worktrees/<slug>`; query active worktrees via `bash scripts/worktree-list.sh`.

## Escalation (when subagent is stuck)

```bash
bash scripts/agent-escalate.sh --agent "bachelorprojekt-<role>" --reason "<what>" --tried "<attempt>" --needs "<unblock>"
```

## Code Discovery

Route recall by query type ([recall-routing](docs/brain/recall-routing.md)):
- **Known symbol**: K3 graph first (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`, `search_code`).
- **Semantic question**: K1 embeddings first.
- **Doctrine / process**: Authored `docs/` first.
- Fallback order: K1 → K3 → K4. Grep/glob only for string literals, error messages, and config values.

## OpenSpec Conventions & Dev Experience

- Specifications reside under `openspec/`. Lifecycle: `/opsx:propose <slug>` → `/opsx:apply <slug>` → `/opsx:archive <slug>`.
- Language: Purpose in German; Requirements/Scenarios in English (`GIVEN` / `WHEN` / `THEN`).
- Delta files in `openspec/changes/<slug>/specs/` are named after the **parent SSOT slug**, not the change slug (`openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`). New components use `archive --create-new`.
- Shell completion: `openspec completion install`.

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
NEXT: <next concrete action or "none">
```

**Footer self-check (PFLICHT):** the footer is a decision, not a decoration —
analyze the four values immediately after writing them:
- `BLOCKED` non-none → propose the recommended fix PLUS 3 alternatives as
  clickable multiple choice (one-keystroke tools above, recommendation first);
  no response within 2 min → execute the recommendation.
- `BLOCKED` none and `NEXT` a clear single direction → announce the
  recommendation, wait 10 s for objection, then auto-run it.

## Reference Sections (read on-demand, do not frontload)

The following sections contain detailed reference material. **Do not load them into context at session start.** Read them only when the current task requires it.

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Claude Code: Skill mit `agent:` → `background-agents.ts` (`delegate` read-only, `task` write-capable); ohne `agent:` inline. Map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`/`web-audit`→website.
- opencode: `dev-flow-*` = Shared Sources wie Claude Code (T014086, ex-T013724-Dualnamen); Domain-Skills via Agent-Routing (`deny` in `opencode.jsonc`); `sdlc-autopilot` (opencode-only): ticket-triage → dev-flow-plan → dev-flow-execute. `ticket-ops` bleibt der kompatible Router; agy folgt dem opencode-Pfad.
</details>

<details>
<summary>Quality Gates (read when verifying before merge)</summary>

- `task test:changed` (smart selection, vitest-Fallback) · `task freshness:check` (Artefakte committet) · `task test:code-quality` (file-size/import-cycle/hostname).
- Brett: `npm run typecheck && npm test && npm run build --prefix components/brett` · Website: `pnpm test:unit` in `components/website` (vitest) · PR-Titel: Conventional Commits + `[T000XXX]` (advisory).
</details>

<details>
<summary>Other References</summary>

- `CLAUDE.md` — Claude Code environment harness guidance
- `llms.txt` — machine-readable entry index
- `.agents/docs/` — agent working dossiers (convention + index in `README.md`)
- `.agents/memory/learnings.md` — session learning loop (read at start, append after tasks)
- `.agents/docs/reorg-phase2/` — repo reorg plan dossier (T900560)
- `components/website/CLAUDE.md` — Astro/Svelte quick-start
- `docs/agent-guide/README.md` — agent operating guide
</details>
