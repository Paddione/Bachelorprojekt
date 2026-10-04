---
id: P3
title: "S3 Embed-Reste nach T900993-Merge"
role: bp-build
ticket: T900998
depends_on: T900993-merge
target_files:
  - scripts/mcp/
  - docs/brain/
---

# P3 — S3 Embed-Reste (NACH T900993-Merge)

## Vorbedingung (hart)

- [ ] T900993 merge-first abgeschlossen: Branch
  `feature/k3-symbol-embed-rerank-T900993` per PR nach `main`
  gemergt, Ticket T900993 auf shipped.
- Dieses Partial erst DANACH auf frischem `main` exekutieren.

## Ziel

- Offene Embed-Reste aus T900993-Plan (Tasks 5+6) schliessen:
  Sync/Rerank verfestigen, Store-Driftvertrag + Eval-Docs fertig.

## Betroffene Dateien (nur)

- `scripts/mcp/cbm-embed-store.py`
- `scripts/mcp/cbm-embed-sync.py`
- `scripts/mcp/cbm-graph-rerank.py`
- `docs/brain/embed-store.md`
- `docs/brain/embed-rerank-eval.md`
- `docs/brain/k3-code-graph.md`

## Concrete-Steps

- [ ] `main`-Stand nach Merge pruefen: Store/Sync/Rerank-Skripte
  vorhanden, `cbm-embed-sync.py status` ohne Netz laeuft.
- [ ] Offene Luecken aus T900993-Task 5 schliessen: Eval gegen
  P0-min-Holdout fahren, Zahlen in `embed-rerank-eval.md` festhalten.
- [ ] `embed-store.md` (Format, Inkrementalitaet, Receipt-Drift),
  `k3-code-graph.md` (K1/K3-Symbol-Layer) vervollstaendigen.
- [ ] Fail-closed-Vertrag halten: kein Sync bei freshness
  `unknown` ohne `--allow-stale`, korrupte Artefakte non-zero.

## Gate

- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` gruen
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/cbm-embed-store.bats tests/spec/cbm-graph-rerank.bats` gruen
