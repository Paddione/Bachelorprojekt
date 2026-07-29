---
title: "Plan-Partials als Factory-Slot-Einheit in pgvector embedden"
ticket_id: T002453
domains: [scripts, infra, test]
status: planning
---

# Implementation Plan

**Ticket:** T002453
**Branch:** `feature/plan-partials-embedding-T002453`
**Spec:** `openspec/changes/plan-partials-embedding/design.md`

## File Structure

```
scripts/
├── openspec-embed.mjs       # [CHANGED] buildChunks() + embedSlug() + single write path
└── plan-lint.sh              # [CHANGED] Größen-Gate >7000 Token

tests/
└── spec/plan-partials-embedding/
    ├── build-chunks.bats     # [NEW] tasks.d → partial chunks, no-tasks.d unchanged
    ├── manifest-parser.bats  # [NEW] depends_on parsing, empty cell handling
    ├── size-gate.bats        # [NEW] >7000 fail, 6999 pass
    └── coverage-gate.bats    # [NEW] indexed vs local count mismatch → rot
```

## Partials

| p1 | tasks.d/p1-openspec-embed.md | implementation | scripts/openspec-embed.mjs |
| p2 | tasks.d/p2-plan-lint.md | implementation | scripts/plan-lint.sh |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/plan-partials-embedding/*.bats |

**Disjunktheit:** Keine Datei in mehr als einem Partial.

## Verify Task (STRUCT3)

```bash
task test:changed          # Relevante Tests
task freshness:regenerate  # test-inventory.json aktualisieren
task freshness:check
task test:code-quality
```
