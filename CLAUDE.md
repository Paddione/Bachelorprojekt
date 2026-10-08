# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Leading SSOT:** [`AGENTS.md`](AGENTS.md) is the primary architecture SSOT, operational reference, and cross-harness guide for this repository. Detailed topology, environment configurations, and core workflow contracts live in `AGENTS.md`. This file provides Claude-Code-specific harness integration and delegates shared doctrine directly to `AGENTS.md`.

## Interaction Contract

Wie Agenten kommunizieren — Autonomiegrenze, die vier Stop-Trigger, Entscheidungsfragen und Status-Footer — steht vollständig in [`AGENTS.md` → „Interaction Contract"](AGENTS.md). Harness-übergreifender SSOT, hier nicht gespiegelt.

## Agent Routing

Before responding to any request, check these signals and delegate to the named agent. Full signal table + MCP mappings: [`AGENTS.md` → „Agent Routing"](AGENTS.md); agent frontmatter SSOT: `.agents/agents/<name>.md` (symlink to `.claude/agents/`).

| Signals (short) | Agent |
|---------|-------|
| manifest, kustomize, overlay, Taskfile, deploy, environments, SealedSecret, OIDC, DSGVO | `bp-build` |
| pod, logs, kubectl, crash, health, GPU, model, database, PostgreSQL, psql, query | `bp-run` |
| website, Astro, Svelte, UI, frontend, mentolder brand, test, pytest, Playwright, runner.sh | `bp-ship` |

> **Subagent layout:** `.claude/agents/bp-*.md` is canonical (`.agents/agents` is a symlink). Claude Code dispatches via the native `task` tool. MCP servers: `mcp-kubernetes` (localhost:18080, Claude-Code-only), `ticket-mcp` + `mcp-postgres` (:13001, devmesh) — reachability SSOT `docs/agent-guide/registry/mcp.yaml`, usage [`.claude/skills/references/mcp-tool-guide.md`](.claude/skills/references/mcp-tool-guide.md).
> **gh-axi (T004612):** Anzeige via Wrapper; `--json`/`-q`/Polling/Mutationen immer `gh` direkt.

**Before dispatching any agent, inject active plan context & curated toolset** — snippet + fail-closed rules: [`AGENTS.md` → „Agent Routing"](AGENTS.md).

### Session model & delegation (T002153)

Main loop runs on the user's default model. Tiering: `bp-run`/`bp-ship` → `sonnet`; `bp-build` → `opus`. Provisioning: [`.claude/skills/references/subagent-provisioning.md`](.claude/skills/references/subagent-provisioning.md). Compaction rules: [`AGENTS.md` → „Session Model & Delegation"](AGENTS.md).

## Default Workflow

For any work request, invoke **`dev-flow-plan`**, **`dev-flow-chore`**, or **`dev-flow-execute`** — definitions in [`AGENTS.md` → „Workflow Rules"](AGENTS.md). Merge = Abschluss (T001092); Deliverable-Check M10/T002506.

## Project Overview & Architecture

Full topology: [`AGENTS.md` → „Architecture & Cluster Topology"](AGENTS.md). Short version:
- **Workspace MVP**: self-hosted k8s collaboration platform (SSO via Pocket ID OIDC, Nextcloud+Talk, Collabora, Vaultwarden, Brett, Website, shared PostgreSQL 16).
- **Brands**: `mentolder` live on the `fleet` cluster (`workspace` ns); `korczewski` workspace (Nextcloud, Brett, Collabora, own shared-db, jobs) **FROZEN per T002479** (`suspend: true`, 0 replicas — do not deploy). Exception: the Massagepraxis website (BRAND `massage`) and Pocket ID are configured on the korczewski slot, für Go-live vorbereitet durch T901440 (`flux-website-korczewski`, `flux-korczewski-auth`).
- **Contexts**: `fleet` (prod), `devmesh` (dev, ADR-008); all others dead.
- **Deploy**: pull-based FluxCD (`ghcr.io/paddione/fleet-manifests`); `task workspace:deploy` is break-glass only. Base `k3d/`, overlays `prod-fleet/<brand>/`, config `environments/`.

## Running Tasks

Never look up or hardcode task commands. Use the task oracle instead:
```bash
bash scripts/vda.sh oracle '<goal in plain English>'
```
Flags/details: [`AGENTS.md` → „Core Commands & Task Oracle"](AGENTS.md).

## CI/CD & Testing Conventions

`.github/workflows/ci.yml` runs on PRs. Tests verify **command output** + semantics, not source (T002448-M4); inventory check against `test-inventory.json`; release notes via `bash scripts/vda.sh release-notes generate`.

## Image Exclusions

`:latest` permitted for: Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console (`website-sdlc`), MCP-Node (`mcp-node`), Repo-Sync (`repo-sync`), Dev-Shell (`dev-shell`).

## Development Rules

1. Deploy only via k3s/Flux + Kustomize (`k3d/` base); pull-based FluxCD in prod.
2. All changes via PRs — no direct pushes to `main`; squash-merge; CI green before merge.
3. Validate manifests: `task workspace:validate`; after manifest changes run `./tests/runner.sh local <TEST-ID>`.
4. Branches: `feature/*`, `fix/*`, `chore/*`.

## Gotchas & Footguns

Full reference: [`AGENTS.md` → „Critical Footguns"](AGENTS.md) and [`docs/superpowers/references/gotchas-footguns.md`](docs/superpowers/references/gotchas-footguns.md).

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
git grep -F -l 'Taskfile.' "$PRE" -- . ':!docs/superpowers/plans' | wc -l
```

**Redaktioneller Hinweis, kein automatisierter Guard** — dieselbe Klasse wie der Deliverable-Check (M10, T002506). Maschinell geprüft wird ausschließlich, dass diese Regel im Repo steht (`tests/py/spec/native_ported/spec/agent-skills/test_messung_mit_befehl.py`).
