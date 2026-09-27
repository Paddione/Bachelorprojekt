# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Leading SSOT:** [`AGENTS.md`](AGENTS.md) is the primary architecture SSOT, operational reference, and cross-harness guide for this repository. Detailed topology, environment configurations, and core workflow contracts live in `AGENTS.md`. This file provides Claude-Code-specific harness integration and delegates shared doctrine directly to `AGENTS.md`.

## Interaction Contract

Wie Agenten mit dir kommunizieren — Autonomiegrenze, die vier Stop-Trigger, die Form von
Entscheidungsfragen und der Status-Footer — steht vollständig in
[`AGENTS.md` → „Interaction Contract"](AGENTS.md). Das ist der harness-übergreifende SSOT;
hier wird er nicht gespiegelt.

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent. The signal lists below mirror the routing table in [`AGENTS.md`](AGENTS.md) (the single source of truth matching each agent's frontmatter in `.agents/agents/<name>.md`).

> **Subagent layout:** `.claude/agents/bachelorprojekt-*.md` is the canonical source (`.agents/agents` is a symlink). **Claude Code only** reads these via native `task` tool dispatch. **opencode** uses `.opencode/agent-models.jsonc` (local runtimes `orchestrator`, `local`, `qwen35-mtp`, plus cloud rails). Full map in `docs/agent-guide/maps/agents-map.md` and [`AGENTS.md`](AGENTS.md).

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

**Before dispatching any agent, inject active plan context & curated toolset:**
See full execution snippet and fail-closed rules in [`AGENTS.md` → „Agent Routing"](AGENTS.md).
Cross-cutting requests stay with the main orchestrator, coordinating multiple domain agents in sequence.

### Session model & delegation (T002153)

The main loop runs on the **user's default model** (`/model`, currently Opus 5, 1M context). Model tiering:
- **Domain agents**: `bachelorprojekt-ops/-db/-test/-website` → `sonnet` (mechanical recon, queries, tests, UI); `bachelorprojekt-infra`/`-security` → `opus` (cross-system, risky, irreversible).
- **Ad-hoc subagents**: explicit model per dispatch. See [`subagent-provisioning.md`](.claude/skills/references/subagent-provisioning.md).
- **Context Window Budget**: Full condensation and compaction retention rules live in [`AGENTS.md` → „Session Model & Delegation"](AGENTS.md).

## Default Workflow & OpenSpec

For any work request, invoke **`dev-flow-plan`**, **`dev-flow-chore`**, or **`dev-flow-execute`**.
Full workflow definitions, lifecycle steps, and conventions live in [`AGENTS.md` → „Workflow Rules" & „OpenSpec Conventions"](AGENTS.md):
- **OpenSpec Change Lifecycle**: `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`.
- **Delta-Spec-Konvention (T001304)**: Delta files named after parent SSOT slug.
- **Merge = Abschluss (T001092)**: Ticket closure on auto-merge to `main`.
- **Deliverable-Check vor manuellem done/shipped (M10, T002506)**: Validation via `git ls-tree -r --name-only origin/main | grep -qxF <pfad>` before setting done.

## Project Overview & Architecture

Full architecture, cluster topology, service inventory, and configuration patterns live in [`AGENTS.md` → „Architecture & Cluster Topology"](AGENTS.md).

Summary for Claude sessions:
- **Workspace MVP**: Kubernetes-based self-hosted platform (Traefik, Pocket ID OIDC, Nextcloud+Talk, Collabora, Vaultwarden, Whiteboard, Brett, Mailpit, DocuSeal, Tracking, Website, Shared PostgreSQL 16 `shared-db`).
- **Cluster Topology**:
  - `mentolder` (Brand): Production brand routed to unified **`fleet`** cluster (`workspace` namespace).
  - `korczewski` (Brand — **FROZEN per T002479**): `flux/clusters/fleet/ks-korczewski.yaml` is `suspend: true`, scaled to 0 replicas. Do not deploy or scale up.
  - Active contexts: `fleet` (Prod) and `devmesh` (Dev, ADR-008). All other contexts are dead.
- **Key Components**:
  - `k3d/`: Base Kubernetes manifests (Kustomize).
  - Flux CD GitOps pull-based pipeline via OCI artifact (`render-fleet-artifact.yml` → `ghcr.io/paddione/fleet-manifests` → Flux on fleet). `task workspace:deploy ENV=mentolder` is break-glass only.
  - Overlays: `prod-fleet/mentolder/`, `prod-fleet/korczewski/`, isolated jobs overlays `prod-fleet/*-jobs/` (T002207), staging stack `prod-fleet/staging/` & `prod-fleet/website-staging/` (T015004).
  - Secrets: Plaintext in `environments/.secrets/<env>.yaml` (git-crypt-tracked) → sealed to `environments/sealed-secrets/<env>.yaml`.

## Running Tasks

Never look up or hardcode task commands. Use the task oracle instead:
```bash
bash scripts/vda.sh oracle '<goal in plain English>'
```
For flags (`--dry-run`, `--json`, `--quiet`) and task details, see [`AGENTS.md` → „Core Commands & Task Oracle"](AGENTS.md).

## CI/CD & Testing Conventions

GitHub Actions runs offline tests, manifest validation, and inventory checks on every PR:
- **Test- und BATS-Konventionen (tests/CLAUDE.md, T002448-M4)**: Tests pruefen **command output** und Resultate (**output verification**) statt der Implementierungsquelle, und die Zusicherung haengt an der Semantik des Outputs (Exit-Code, Vorhandensein eines Werts), nicht an dessen Darstellung.
- **Inventory Check**: Re-runs `task test:inventory` and fails if `components/website/src/data/test-inventory.json` differs.
- **Release Notes**: Generate via `bash scripts/vda.sh release-notes generate` or `task release:notes`.

## Image Exclusions

The following components intentionally use `:latest` images and are excluded from standard pinning requirements: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console (`website-sdlc`), Factory-Runner (`factory-runner`), MCP-Node (`mcp-node`), Repo-Sync (`repo-sync`), Dev-Shell (`dev-shell`).

## Development Rules

1. Only deploy via k3s/Flux with Kustomize (`k3d/` is the base; see [`AGENTS.md`](AGENTS.md)). Prod is deployed pull-based via FluxCD GitOps.
2. All changes via Pull Requests — no direct pushes to `main`.
3. Use **squash-and-merge** to keep `main` history clean.
4. CI must be green before merge.
5. Validate manifests before committing: `task workspace:validate`.
6. After modifying Kubernetes manifests, run the relevant test(s): `./tests/runner.sh local <TEST-ID>`.
7. Branch naming: feature/*, fix/*, chore/*.

## Gotchas & Footguns

Non-obvious repo behaviors are documented in full in [`AGENTS.md` → „Critical Footguns"](AGENTS.md) and [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).

### PowerShell-Skripte (.ps1) [T002495-M7]

ASCII-Pflicht (kein BOM), Parser-Check vor dem Commit und `-Encoding ASCII` fuer generierte `.conf`-Dateien -> [`scripts/llm/CLAUDE.md`](scripts/llm/CLAUDE.md).

### Bug-Triage-Konvention (CFR-Gate G-DORA03)

Jeder nach-Merge entdeckte Fehler wird als `type=bug`-Ticket erfasst (`bash scripts/ticket.sh create --type bug --title "..." --description "..."`). CFR-Ziel ≤ 15 % über 8 Wochen via `bash scripts/vda.sh cfr`. Siehe [`AGENTS.md`](AGENTS.md).

### Mess-Konvention [T002717]

**Wer eine Messung als Entscheidungsgrundlage in ein Ticket schreibt, notiert den ausführbaren Befehl mit, der sie erzeugt hat.** Ohne ihn ist die Zahl kein Beleg, sondern eine Behauptung — und der Zweck des Festhaltens („damit die Analyse nicht wiederholt werden muss") ist verfehlt, weil genau die Wiederholung unmöglich wird.

**Das fehlende Stück ist das Suchmuster, nicht die Methode.** Ein Metadaten-Block ohne das konkrete Suchmuster dokumentiert die Sorgfalt, nicht die reproduzierbare Messung. Konkret gehört in die Beschreibung ein Code-Block mit dem ausführbaren Befehl und dem Commit-Stand:

```bash
# Stand, gegen den gemessen wurde — sonst ist die Zahl später nicht nachstellbar
PRE=6a6d4c302c1afcb4a12a6c0b7c2401505f5fd602
git grep -F -l 'Taskfile.' "$PRE" -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' | wc -l
```

**Redaktioneller Hinweis, kein automatisierter Guard** — dieselbe Klasse wie der Deliverable-Check (M10, T002506). Maschinell geprüft wird ausschließlich, dass diese Regel im Repo steht (`tests/spec/agent-skills/messung-mit-befehl.bats`).
