---
title: P0min Freeze Embed
ticket_id: T900986
domains: [infra]
status: active
---

# p0min-freeze-embed — Implementation Plan

**Goal:** Freeze the K3 route corpus (Route 462 vs HANDLES 69), map every slice to its HANDLED_BY handler, and pin the bge-m3 embedding with a recorded corpus hash plus held-out retrieval checks — gates G0 (freeze), G1 (handled-by), G2 (embed).

## File Structure

New snapshot and evidence files produced by the three partials (disjoint per partial):

- `docs/brain/corpus-freeze.json`
- `docs/brain/slice-taxonomy.md`
- `docs/brain/handled-by-map.json`
- `docs/brain/route-handledby-sample.md`
- `tests/spec/p0min-freeze-embed.bats`
- `docs/brain/embed-eval-report.md`

## Partials

| # | File | Role | Description | depends_on | min_tier | ctx_tokens |
|---|------|------|-------------|------------|----------|------------|
| p1 | tasks.d/p1-freeze.md | impl | docs/brain/corpus-freeze.json, docs/brain/slice-taxonomy.md | | 27b-local | 64000 |
| p2 | tasks.d/p2-handledby.md | impl | docs/brain/handled-by-map.json, docs/brain/route-handledby-sample.md | p1 | 27b-local | 64000 |
| p3 | tasks.d/p3-embed.md | tests | tests/spec/p0min-freeze-embed.bats, docs/brain/embed-eval-report.md | p1, p2 | 4b-local | 32000 |

## Task 1: Confirm the freeze snapshot exists

**Files:** `docs/brain/corpus-freeze.json`

- Confirm `corpus-freeze.json` records every route with ID `repo@commit:path:symbol` after partial p1.

## Task 2: Confirm the handled-by map exists

**Files:** `docs/brain/handled-by-map.json`

- Confirm `handled-by-map.json` covers every slice after partial p2.

## Task 3: Final verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
