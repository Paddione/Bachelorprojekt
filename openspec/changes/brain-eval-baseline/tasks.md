---
title: Brain-Eval-Baseline + Node-Parität
ticket_id: T900448
domains: [brain, eval, mcp]
status: active
---

# brain-eval-baseline — Implementation Plan

## File Structure

- `tests/fixtures/brain/retrieval-eval.jsonl` (p1, erweitern)
- `tests/fixtures/brain/retrieval-baseline.json` (p1, neu)
- `docs/adr/ADR-009-brain-3layer-architektur.md` (p1, aufnehmen)
- p2/p3-Dateien folgen mit ihren Partials.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-evalset.md | impl | tests/fixtures/brain/retrieval-eval.jsonl, tests/fixtures/brain/retrieval-baseline.json, docs/adr/ADR-009-brain-3layer-architektur.md | |

## Verify (final, wächst mit den Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
