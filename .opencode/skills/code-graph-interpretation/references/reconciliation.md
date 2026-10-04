# K1/K3 Reconciliation — when to trust which index

Defect D8 (`docs/brain/k3-code-graph.md`): K1 (bge-m3 → pgvector embeddings,
post-commit trigger) and K3 (codebase-memory graph, hourly cron) index
independently. They can diverge silently. The reconciliation report makes that
divergence observable.

## The report

```bash
python3 scripts/mcp/cbm-reconcile.py status --repo . [--project NAME]
```

One JSON object, exit 0 with verdict `fresh` or `diverged`, exit 1 with
`unknown` (fail-closed — a failed probe can never look healthy):

- `k3_freshness` — verdict from `scripts/mcp/cbm-freshness.py` receipts
  (index-of-record). Anything but `fresh` forces the overall verdict to
  `unknown`: never interpret graph structure against a stale index.
- `coverage.code_unindexed` — tracked **code** files (symbol-bearing
  extensions) with no K3 node. These are real drift: committed code the graph
  does not know. Asset/doc gaps are intentionally not flagged.
- `coverage.k3_untracked` — K3 files absent from `git ls-files`. Stale graph
  entries: the graph remembers files git no longer has.
- `k1_evidence` — `unavailable` until K1 emits local receipts (pgvector is
  external, the indexer trigger is a machine-local unversioned hook). K1
  divergence is not judgeable from disk; do not guess.

## Workflow for agents

1. Run the report before graph-heavy work. `unknown` → refresh the index
   (`task codebase:index` or let the cron single-flight run) and re-run.
2. `diverged` with `code_unindexed` → the graph is missing committed code:
   re-index before trusting `search_graph`/`trace_path` results for those
   files.
3. `diverged` with `k3_untracked` → stale graph entries: weight graph answers
   about those paths as historical, not current.
4. Cross-lookup: a K1 (semantic) hit names a file or symbol — confirm its
   structural context in K3 (`trace_path` for callers/callees,
   `get_code_snippet` for the body). A K1 hit without K3 coverage is
   unverified context; say so when citing it.
