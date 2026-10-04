---
id: P2
title: "S2 devflow-mcp-Delta (T900985-Basis)"
role: bp-build
ticket: T900998
depends_on: keine
target_files:
  - scripts/devflow-mcp/
---

# P2 — S2 devflow-mcp-Delta

## Ziel

- devflow-mcp-Delta aus staged Plan T900985 uebernehmen: `context_for_task`, `recommend_tools`, `plan_stage`, bge-Rerank, Code-Graph-Corpus.

## Betroffene Dateien (nur)

- `scripts/devflow-mcp/server.mjs`
- `scripts/devflow-mcp/graph-index.mjs`
- `scripts/devflow-mcp/sync-db.mjs`
- `scripts/devflow-mcp/lib/retrieve.mjs`
- `scripts/devflow-mcp/lib/tools-corpus.mjs`
- `scripts/devflow-mcp/lib/plan-stage.mjs`
- `scripts/devflow-mcp/lib/graph-cache.mjs`
- `scripts/devflow-mcp/lib/symbols.mjs`
- `scripts/devflow-mcp/lib/backends.mjs`
- `scripts/devflow-mcp/lib/run.mjs`

## Hinweis (nur lesend, nicht anfassen)

- `.opencode/skills/references/mcp-tool-guide.md`, `dev-flow-plan/SKILL.md`, `implementer-handoff.md` und `docs/agent-guide/registry/*` gehoeren zu P1/P4 — hier nur als Referenz lesen.

## Concrete-Steps

- [ ] `lib/backends.mjs` + `lib/run.mjs`: bge/pg/cbm-Backends mit Timeout anbinden
- [ ] `lib/symbols.mjs`: Graph-Export mit Cursor-Paging, Chunk-Texte aufbereiten
- [ ] `lib/graph-cache.mjs`: atomarer Cache, Kosinus-Top-k fuer bge-Rerank
- [ ] `graph-index.mjs --repo`: inkrementell ueber `text_hash` indexieren
- [ ] `sync-db.mjs`: Cache nach `knowledge.chunks` (Collection Code Graph) schreiben
- [ ] `lib/retrieve.mjs`: `searchCode`/`searchKnowledge`, Rerank mit Kuerzung auf 4500 Zeichen, `degraded` statt Fehler
- [ ] `lib/tools-corpus.mjs`: Tool-Dokumente mit Rollen-/Tier-Filter fuer `recommend_tools`
- [ ] `lib/plan-stage.mjs` + `server.mjs`: `context_for_task`, `recommend_tools`, `plan_stage` (Abbruch bei rotem Lint)

## Gate

- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` gruen
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/devflow-mcp/graph-index.bats tests/spec/devflow-mcp/plan-stage.bats tests/spec/devflow-mcp/retrieval.bats` gruen
