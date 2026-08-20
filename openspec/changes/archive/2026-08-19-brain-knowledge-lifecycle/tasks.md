---
title: "brain-knowledge-lifecycle — Implementation Plan"
ticket_id: T012913
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-knowledge-lifecycle — Implementation Plan

_Ticket: T012913_

## File Structure

| Path | Owner | Change |
|---|---|---|
| `scripts/brain-page-metadata.py` | p1 | new deterministic provenance helper |
| `scripts/brain-lifecycle-audit.py` | p1 | new report-only temporal/claim audit |
| `scripts/brain-ingest.sh` | p1 | inject source-derived lifecycle metadata |
| `templates/brain/SCHEMA.md` | p1 | document optional lifecycle fields and claims |
| `scripts/brain-index.py` | p2 | extracted reusable metadata-aware Brain index |
| `scripts/brain-mcp-server.py` | p2 | compatible filtered search surface |
| `scripts/brain-expertise.py` | p3 | explicit fetch, stage, redact, approve workflow |
| `scripts/brain/ingest-sources.yaml` | p3 | approved-only expertise source group |
| `docs/brain-expertise/approved/source-policy.md` | p3 | review and provenance policy seed |
| `scripts/brain-retrieval-eval.py` | p4 | deterministic offline retrieval evaluator |
| `taskfiles/Taskfile.brain.yaml` | p4 | audit, expertise, and evaluation entrypoints |
| `tests/fixtures/brain/retrieval-eval.jsonl` | p5 | versioned relevance fixture |
| `tests/spec/brain-foundation/knowledge-lifecycle.bats` | p5 | lifecycle and expertise behavior tests |
| `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats` | p5 | retrieval compatibility/filter tests |
| `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats` | p5 | deterministic metric tests |
| `components/website/src/data/test-inventory.json` | p5 | regenerated test inventory |

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-metadata-audit.md` | impl | `scripts/brain-page-metadata.py`, `scripts/brain-lifecycle-audit.py`, `scripts/brain-ingest.sh`, `templates/brain/SCHEMA.md` | |
| p2 | `tasks.d/p2-retrieval.md` | impl | `scripts/brain-index.py`, `scripts/brain-mcp-server.py` | |
| p3 | `tasks.d/p3-expertise.md` | impl | `scripts/brain-expertise.py`, `scripts/brain/ingest-sources.yaml`, `docs/brain-expertise/approved/source-policy.md` | |
| p4 | `tasks.d/p4-eval.md` | impl | `scripts/brain-retrieval-eval.py`, `taskfiles/Taskfile.brain.yaml` | p1, p2, p3 |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/fixtures/brain/retrieval-eval.jsonl`, `tests/spec/brain-foundation/knowledge-lifecycle.bats`, `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats`, `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats`, `components/website/src/data/test-inventory.json` | p1, p2, p3, p4 |

The tests partial is authored last but executed RED-first. Its BATS cases must report
`expected: FAIL` against the scaffold branch before the production partials turn them green.

## Final Verification

- [ ] Run the focused Brain suites, validate OpenSpec, regenerate the test inventory, and run
      all mandatory repository gates:

```bash
bash scripts/openspec.sh validate
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/knowledge-lifecycle.bats
tests/unit/lib/bats-core/bin/bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
tests/unit/lib/bats-core/bin/bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```
