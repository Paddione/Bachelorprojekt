---
id: P5
title: "Tests/Guards je Stream"
role: bp-run
ticket: T900998
depends_on: P1,P2,P3
target_files:
  - tests/spec/devflow-mcp/
  - tests/spec/toolset-registry/
  - tests/spec/cbm/
---

# P5 — Tests/Guards je Stream

## Ziel

- BATS je Stream als gruene Gates: devflow-mcp + toolset-registry bestehen, cbm-Suite nach T900993-Merge uebernehmen/erweitern, plan-lint hartes Gate, Kollisions-Check ohne geteilte Dateien, CI-Gate `task test:changed` + `freshness:check` + `workspace:validate`.

## Betroffene Dateien (nur)

- `tests/spec/devflow-mcp/graph-index.bats`
- `tests/spec/devflow-mcp/plan-stage.bats`
- `tests/spec/devflow-mcp/retrieval.bats`
- `tests/spec/devflow-mcp/helpers.bash`
- `tests/spec/toolset-registry/*.bats`
- `tests/spec/cbm/rerank.bats` (neu, erst nach T900993-Merge)
- `tests/spec/cbm/embed-store.bats` (neu, erst nach T900993-Merge)

## Concrete-Steps

- [ ] Failing-Test zuerst: neue/geaenderte BATS schreiben, `bats tests/spec/devflow-mcp/ tests/spec/toolset-registry/` laufen lassen und expected FAIL verifizieren, erst dann implementieren
- [ ] devflow-mcp-Suite gruen halten: `graph-index`, `plan-stage`, `retrieval` je Stream-Aenderung nachziehen
- [ ] toolset-registry-Suite (10 bats) gruen halten: Drift-, Schema- und Sync-Guards bei P1-Aenderungen erweitern
- [ ] Nach T900993-Merge: cbm-Suite aus Feature-Branch uebernehmen, fehlende Faelle (rerank, embed-store) ergaenzen
- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` als hartes Gate je Partial laufen lassen
- [ ] Kollisions-Check: keine zwei Partials teilen eine Datei (`target_files` disjunkt pruefen)
- [ ] CI-Gate: `task test:changed`, `task freshness:check`, `task workspace:validate` gruen

## Gate

- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` gruen
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/devflow-mcp/ tests/spec/toolset-registry/` gruen
- [ ] `task test:changed && task freshness:check && task workspace:validate` gruen
