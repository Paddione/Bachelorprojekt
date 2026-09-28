# AGENTS.md — Leading Agent Reference & Architecture SSOT

> **SSOT:** This file is the primary repository guidance, architecture SSOT, and operational reference for all agent sessions (Claude Code, OpenCode, Antigravity). Tool-specific guidance and mirrors (such as `CLAUDE.md` and `GEMINI.md`) reference this document as the leading authority.

Auto-loaded by opencode from the repo root; referenced by `.opencode/prompts/orchestrator.md` and `CLAUDE.md`. Maschinenlesbarer Einstiegsindex: [`llms.txt`](llms.txt). On-demand reference: [`docs/agent-guide/reference.md`](docs/agent-guide/reference.md) (quality gates, services, manifests); runtimes: [`docs/agent-guide/registry/runtimes.md`](docs/agent-guide/registry/runtimes.md).

## Agent Routing

SSOT `.opencode/agent-models.jsonc`; Claude Code domain agents: `.claude/agents/*.md` (`.agents/agents` symlink).

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

Main loop: user's default model (or Opus in Claude Code). `bachelorprojekt-ops/-db/-test/-website` → `sonnet`; `bachelorprojekt-infra`/`-security` → `opus`; ad-hoc subagents: explicit model ([provisioning](.claude/skills/references/subagent-provisioning.md)). Context budget: bulk reads → condensing subagent; on compact preserve objective/plan/files/tests/decisions/blockers/next action.

## Core Commands & Task Oracle

Never look up or hardcode task commands:
```bash
bash scripts/vda.sh oracle '<goal in plain English>'   # --dry-run/-n, --json, --quiet/-q for scripts
```

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

**Workspace MVP** — Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Services: [`docs/agent-guide/reference.md`](docs/agent-guide/reference.md). Prerequisites: Docker, kubectl, `task` (go-task). `k3d` binary is no longer needed/used (T900120).

## Architecture & Cluster Topology (Fleet Stage 3)

- **mentolder (BRAND)**: Live production brand. DNS for `mentolder.de` routes to the **`fleet`** cluster. `ENV=mentolder` (alias `fleet-mentolder`), context `fleet`, namespace `workspace`.
- **korczewski (BRAND — FROZEN per T002479)**: Standalone cluster torn down; hosts joined `fleet`. **FROZEN since 2026-07-23** (`ks-korczewski.yaml` `suspend: true`, brand namespaces scaled to 0). Do not deploy or scale up.
- **Contexts**: exactly two — `fleet` (prod), `devmesh` (local mesh, ADR-008). Dead: `mentolder`, `korczewski`, `k3s-1`, `hetzner`, `k3d-*`.
- Manifests/overlays/GitOps: [`docs/agent-guide/reference.md`](docs/agent-guide/reference.md).

## CI/CD, Testing Standards & Image Exclusions

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs. Tests verify **command output** (T002448-M4); runner `tests/unit/lib/bats-core/bin/bats`. Inventory check re-runs `task test:inventory`. Release notes: `bash scripts/vda.sh release-notes generate` (publish `publish-github` / `publish-changelog`).
`:latest` digest-pinning exemptions: Website, Brett, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console, Factory-Runner, MCP-Node, Repo-Sync, Dev-Shell.

## Critical Footguns (must-know)

- Full reference: [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).
- `scripts/env-resolve.sh` must be sourced, never executed directly.
- Never run `SELECT *` from `tickets.ticket_plans` (large content bloats memory).
- OpenSpec changes must be staged in a worktree, never directly in the main checkout.
- Pre-commit hooks block main checkout when another agent holds a lock → use worktrees.
- `components/website/` is strictly `pnpm` (never `npm install` there); Root and `components/brett/` use `npm`.
- `git-crypt` unlock without keyfile uses `gpg.program`; under WSL point to Windows `gpg.exe`. See `docs/runbooks/git-crypt-key-distribution.md`.
- Missing credential: follow `docs/runbooks/credentials-finden.md` (fixed lookup order, never print or invent values, stop and ask if nothing is found).
- After modifying manifests, run `./tests/runner.sh local <TEST-ID>`.

## Agent Coordination & Locks

```bash
bash scripts/agent-lock.sh reap                  # Clean stale locks (start of session)
bash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>
bash scripts/agent-lock.sh release ticket <id>
```
Session messaging: `bash scripts/agent-msg.sh read --unread`. Worktrees (`.worktrees/<slug>`): `bash scripts/worktree-list.sh [--json]`.

## Escalation (when subagent is stuck)

```bash
bash scripts/agent-escalate.sh --agent "bachelorprojekt-<role>" --reason "<what>" --tried "<attempt>" --needs "<unblock>"
```

## Code Discovery

Route recall by query type ([recall-routing](docs/brain/recall-routing.md)): known symbol → K3 graph; semantic question → K1 embeddings; doctrine/process → authored `docs/`. Fallback K1 → K3 → K4; grep/glob only for literals, errors, config values.

## Staged Plans & Dev Experience

Plans live in `.agents/plans/<slug>/` (`tasks.md` + `tasks.d/` partials): staged by `dev-flow-plan`, tracked on the ticket, executed by `dev-flow-execute`. Purpose in German; tasks as checklists with gates. Merged plans are deleted (record survives in `tickets.ticket_plans`).

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

<details>
<summary>Skill Dispatch Protocol (read when routing skills to agents)</summary>

- Claude Code: Skill mit `agent:` → `background-agents.ts` (`delegate` read-only, `task` write-capable); ohne `agent:` inline. Map: `dev-flow-e2e`→test, `incident-response`→ops, `infra-ops`→infra, `database-specialist`→db, `security-specialist`→security, `website-specialist`/`web-audit`→website.
- opencode: `dev-flow-*` = Shared Sources wie Claude Code (T014086, ex-T013724-Dualnamen); Domain-Skills via Agent-Routing (`deny` in `opencode.jsonc`); `sdlc-autopilot` (opencode-only): ticket-triage → dev-flow-plan → dev-flow-execute. `ticket-ops` bleibt der kompatible Router; agy folgt dem opencode-Pfad.
</details>
