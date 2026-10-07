---
title: "devflow-mcp — Implementation Plan"
ticket_id: T900985
domains: [agent-skills, dev-tooling, scripts, devflow]
status: superseded
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

> **SUPERSEDED durch T900998** (`.agents/plans/knowledge-mcp-consol/`, 2026-10-04): Inhalte wanderten in den Konsolidierungs-Plan, hier nichts mehr pflegen.

# devflow-mcp — Implementation Plan

Neuer stdio-MCP-Server `scripts/devflow-mcp` für bp-* und den Orchestrator: Kontext, Code-Symbole
und Werkzeuge per bge-Rerank in einem Aufruf, Plan-Staging als ein strukturierter Schritt, dazu
Wrapper um die Devflow-Skripte. Der Code-Korpus kommt aus dem frisch erzeugten
codebase-memory-Graphen (lokaler Cache + SSOT in `knowledge.chunks`). Messung, Architektur und
Entscheidungen D1–D10: `design.md`.

_Ticket: T900985_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/devflow-mcp/server.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/graph-index.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/backends.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/graph-cache.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/symbols.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/tools-corpus.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/plan-stage.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/run.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/lib/retrieve.mjs` | 0 (neu) | 800 |
| `scripts/devflow-mcp/sync-db.mjs` | 0 (neu) | 800 |
| `scripts/toolset/probe.mjs` | 120 | 680 |
| `scripts/toolset/check.mjs` | 296 | 504 |
| `scripts/toolset/sync.mjs` | 142 | 658 |
| `scripts/toolset-context.sh` | 149 | 651 |
| `scripts/toolset/lib/tools.mjs` | 68 | 732 |
| `scripts/toolset/lib/adapters/claude.mjs` | 24 | 776 |
| `scripts/nightly-update.sh` | 161 | 639 |
| `.githooks/post-merge` | 50 | n/a (S1-ungated) |
| `docs/agent-guide/registry/mcp.yaml` | 390 | n/a (S1-ungated) |
| `docs/agent-guide/registry/capabilities.yaml` | 989 | n/a (S1-ungated) |
| `docs/agent-guide/registry/toolset.lock.yaml` | generiert | n/a (S1-ungated) |
| `taskfiles/Taskfile.agents.yml` | 471 | n/a (S1-ungated) |
| `.claude/settings.json` | generiert (sync) | n/a (S1-ungated) |
| `.opencode/skills/dev-flow-execute/references/implementer-handoff.md` | 51 | n/a (S1-ungated) |
| `.opencode/skills/dev-flow-plan/SKILL.md` | 262 | n/a (S1-ungated) |
| `.opencode/skills/references/mcp-tool-guide.md` | 336 | n/a (S1-ungated) |
| `AGENTS.md` | 154 | n/a (S1-ungated) |
| `tests/spec/devflow-mcp/graph-index.bats` | 60 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/devflow-mcp/retrieval.bats` | 90 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/devflow-mcp/plan-stage.bats` | 80 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/devflow-mcp/helpers.bash` | 100 (neu) | n/a (S1-ungated) |
| `tests/spec/devflow-mcp/fixtures/*.mjs` | 4 Dateien (neu) | n/a (S1-ungated) |
| `tests/spec/toolset-registry/tools-suppressed.bats` | 80 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/toolset-registry/lock-summary.bats` | 35 (neu, Failing Test) | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <datei>`.

<!-- vitest: kein neuer Test nötig, weil keine Website-Datei berührt wird; die Regression decken tests/spec/devflow-mcp/*.bats und tests/spec/toolset-registry/{tools-suppressed,lock-summary}.bats über Server-, Indexer- und Sync-Ausgabe ab -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.md#task-2 | impl | scripts/toolset/probe.mjs, scripts/toolset/check.mjs, scripts/toolset/sync.mjs, scripts/toolset-context.sh, scripts/toolset/lib/tools.mjs, scripts/toolset/lib/adapters/claude.mjs | | sonnet | 40000 |
| p2 | tasks.md#task-3 | impl | scripts/devflow-mcp/lib/backends.mjs, scripts/devflow-mcp/lib/run.mjs, scripts/devflow-mcp/lib/symbols.mjs, scripts/devflow-mcp/lib/graph-cache.mjs, scripts/devflow-mcp/graph-index.mjs, scripts/devflow-mcp/sync-db.mjs | | sonnet | 60000 |
| p3 | tasks.md#task-4 | impl | scripts/devflow-mcp/lib/retrieve.mjs, scripts/devflow-mcp/lib/tools-corpus.mjs, scripts/devflow-mcp/lib/plan-stage.mjs, scripts/devflow-mcp/server.mjs | p1, p2 | sonnet | 60000 |
| p4 | tasks.md#task-5 | impl | docs/agent-guide/registry/mcp.yaml, docs/agent-guide/registry/capabilities.yaml, docs/agent-guide/registry/toolset.lock.yaml, .claude/settings.json, taskfiles/Taskfile.agents.yml, .githooks/post-merge, scripts/nightly-update.sh | p3 | sonnet | 30000 |
| p5 | tasks.md#task-6 | docs | .opencode/skills/dev-flow-execute/references/implementer-handoff.md, .opencode/skills/dev-flow-plan/SKILL.md, .opencode/skills/references/mcp-tool-guide.md, AGENTS.md | p3 | haiku | 20000 |

## Task 1: Failing Test bestätigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/devflow-mcp/ tests/spec/toolset-registry/tools-suppressed.bats tests/spec/toolset-registry/lock-summary.bats
```

expected: FAIL. Alle 21 Tests schlagen fehl: `scripts/devflow-mcp/` existiert nicht, der Lock
kennt kein `summary`, die Toolset-Kette kennt `tools_suppressed` nicht.

## Task 2: Toolset-Kette (p1)

- [x] `probe.mjs`: `summary` je Tool (erste Beschreibungszeile, ≤ 200 Zeichen).
- [x] `lib/tools.mjs`: `suppressedTools(instKey, cfg, lock)`; `toolsForInstance` lässt sie weg.
- [x] `check.mjs`: `tools_suppressed` nur an `mcp:`, Glob ohne Treffer → Fehler; Drift der
      verwalteten `permissions.deny`-Einträge (Claude) → Fehler.
- [x] `sync.mjs` + `adapters/claude.mjs`: `permissions.deny` mit `mcp__<server>__<tool>`
      verwalten, fremde Regeln und Server ohne Registry-Eintrag unangetastet (D6).

## Task 3: Indexer (p2)

- [x] `lib/run.mjs` (Skriptaufruf mit Timeout), `lib/backends.mjs` (bge/pg/cbm nach D1).
- [x] `lib/symbols.mjs`: Graph-Export mit Cursor-Paging, Chunk-Text nach D2.
- [x] `lib/graph-cache.mjs`: Cache lesen/schreiben (atomar), Kosinus-Top-k (D3).
- [x] `graph-index.mjs`: `--repo`, inkrementell über `text_hash`, Exit 0 ohne Backends.
- [x] `sync-db.mjs`: Cache → `knowledge.*` (Collection „Code Graph", `source = code_graph`) per `PGURL`.

## Task 4: Server (p3)

- [x] `lib/retrieve.mjs`: `searchCode`, `searchKnowledge` (mcp-postgres-Vektorabfrage), Rerank
      mit Kürzung auf 4500 Zeichen, `degraded` statt Fehler (D4).
- [x] `lib/tools-corpus.mjs`: Tool-Dokumente, Filter Rolle/Unterdrückung/Tier (D5).
- [x] `lib/plan-stage.mjs`: Ablauf nach D7, Abbruch bei rotem Lint.
- [x] `server.mjs`: zehn Tools (`context_for_task`, `recommend_tools`, `search_code`,
      `graph_status`, `plan_stage`, `plan_lint`, `lock`, `collision_check`, `ci_status`,
      `task_oracle`), Aufruferfehler als `isError`.

## Task 5: Registrierung und Automatik (p4)

- [x] `mcp.yaml`: Client `devflow-mcp` für alle Harnesses; `capabilities.yaml`: Fähigkeit
      `devflow-kontext` und `tools_suppressed: [stage_plan]` an `mcp:ticket-mcp-node`.
- [x] `node scripts/toolset/sync.mjs`, `probe.mjs --ack devflow-mcp --ack ticket-mcp-node`.
- [x] Taskfile: `agents:devflow:graph:index` (mit Port-Forward für `--sync-db`), `agents:devflow:graph:status`.
- [x] `.githooks/post-merge` und `scripts/nightly-update.sh` nach D9.

## Task 6: Skills und Doku (p5)

- [x] `implementer-handoff.md`: `context_for_task` vor dem Spawn, Ergebnis in den Prompt.
- [x] `dev-flow-plan/SKILL.md` Schritt 5: `plan_stage` als Weg; `mcp-tool-guide.md`: Abschnitt devflow-mcp.
- [x] `AGENTS.md` Agent Routing: Verweis auf devflow-mcp.

## Task 7: Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/devflow-mcp/ tests/spec/toolset-registry/
node --test scripts/toolset/*.test.mjs
node scripts/toolset/check.mjs
task test:evals
task test:changed
task freshness:regenerate
task freshness:check
```
