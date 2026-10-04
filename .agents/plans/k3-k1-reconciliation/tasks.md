---
title: "K1/K3 reconciliation — shared drift oracle (defect D8)"
ticket_id: T002430
domains: [scripts, brain, tests]
status: active
file_locks: [scripts/mcp/cbm-reconcile.py, tests/spec/cbm-reconcile.bats, docs/brain/k3-code-graph.md]
shared_changes: true
batch_id: null
parent_feature: T002430
depends_on_plans: []
---

# k3-k1-reconciliation — Implementation Plan

**Goal:** Close defect D8 from `docs/brain/k3-code-graph.md`: K1 (bge-m3 →
pgvector embeddings, post-commit trigger) and K3 (codebase-memory graph, hourly
cron) run with no cross-references and no reconciliation, so divergence between
the two indexes goes unnoticed and index ages drift apart. This plan adds one
conservative reconciliation report that makes divergence observable: per-file
coverage of git-tracked files vs K1 chunks vs K3 symbols, plus a unified
freshness verdict built on the existing freshness receipts
(`scripts/mcp/cbm-freshness.py`, landed via T900805).

## File Structure

- `scripts/mcp/cbm-reconcile.py` — new stdlib-only report generator
<!-- vitest: kein neuer Test nötig, weil components/website/src/lib/embeddings.ts nur inventarisiert, nicht geändert wird -->
- `tests/spec/cbm-reconcile.bats` — new BATS suite with stub CLI + Git fixtures
- `docs/brain/k3-code-graph.md` — D8 status update; Auseinanderlauf-Stellen gains the report reference
- `.opencode/skills/code-graph-interpretation/references/reconciliation.md` — new; when to trust K1 vs K3, cross-lookup guidance (K1 hit → `trace_path` on the symbol)
- `.claude/skills/code-graph-interpretation` — mirror of the skill change

## Tasks

- [ ] **1. RED: reconciliation suite fails first.** Create
  `tests/spec/cbm-reconcile.bats` with a temporary HOME, a stub
  `codebase-memory-mcp` CLI and a disposable Git repository (fixtures follow the
  pattern in `tests/spec/cbm-stampede-guard.bats`). Assert `cbm-reconcile.py
  status` emits one JSON object with `k3_freshness`, `k1_evidence`, per-file
  divergence arrays and a `verdict` of fresh/diverged/unknown. Then run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-reconcile.bats
```

  Expected: FAIL — the script does not exist. Record the failure in the ticket.

- [ ] **2. Inventory K1 evidence surfaces.** Locate the K1 post-commit hook and
  the embeddings write/read path (`components/website/src/lib/embeddings.ts`,
  pgvector schema) and document what per-file evidence K1 can expose without new
  dependencies (chunk rows per source file, last index timestamp). If K1 cannot
  expose per-file evidence yet, the report states `k1_evidence: unavailable` with
  the reason instead of guessing — fail-closed, same contract as freshness.

- [ ] **3. Implement `scripts/mcp/cbm-reconcile.py`.** Stdlib-only, no network.
  Inputs: repo path, project name, optional timeout. Side: K3 evidence via the
  existing CLI surface (`index_status`, graph metadata) using the freshness
  receipt as index-of-record; K1 evidence per task 2; git-tracked files via
  NUL-delimited `git ls-files`. Output: single JSON object — coverage lists
  (tracked-but-unindexed, indexed-but-deleted, K3-symbol-count per file),
  index-age delta between K1 and K3 receipts, and the unified verdict. A failed,
  missing or malformed probe yields `unknown`, never fresh.

- [ ] **4. Wire guidance and docs.** Update the interpretation skill (both
  mirrors) with the reconciliation workflow and the cross-lookup rule; update
  `docs/brain/k3-code-graph.md` (D8 row now "beobachtbar via
  cbm-reconcile.py", Auseinanderlauf-Stellen cites the report). Commit as
  `feat(T002430): reconcile K1 embedding index and K3 code graph drift`.

- [ ] **5. Final verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-reconcile.bats
bash scripts/plan-lint.sh .agents/plans/k3-k1-reconciliation/tasks.md
task test:changed; task freshness:regenerate; task freshness:check;
```
