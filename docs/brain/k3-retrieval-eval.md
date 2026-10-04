# K3 retrieval eval — hand-labeled set + per-stage ablation (T900993/A6)

32 queries (10 route, 12 code, 10 doc) in `docs/brain/k3-retrieval-eval.jsonl`,
one JSON object per line: `{id, query, kind, expected_paths, notes}`.
Runner: `scripts/mcp/cbm-eval.py` (stdlib-only). Spec: `tests/spec/cbm-eval.bats`.

## Why a new set (circularity disclaimer)

The old P0-min set (`docs/brain/embed-index.json`, 3 queries) derives its
labels from import relations — the same HANDLES/CALLS/IMPORTS structure the
graph-boost reranker exploits. Scoring graph-boost on those labels is
circular: the boost wins by construction and the number proves nothing.

This set replaces that methodology, it does not extend it:

- Every `expected_paths` entry was hand-judged by reading the actual route
  handler or lib file and is justified in the row's `notes` as
  `path:Symbol` (e.g. `lib/native-billing.ts:createInvoice`).
- Judgment sometimes contradicts the naive graph answer on purpose: e.g.
  `k3eval-02` (create-invoice) expects `native-billing.ts`, not
  `stripe-billing.ts`; `k3eval-09` (drafts) pairs a website-db route with the
  `stripe-billing.ts:getDraftInvoices` domain accessor as a relevance
  judgment, not an import edge.
- Doc/spec questions (10 rows: ADR/runbook/brain/superpowers) cover corpora
  the old set never touched (A5 adds docs to K1, A2 adds Sections to K3).

## Metrics

Per stage — `fts-only, dense-only, fused, +cross-encoder, +graph-boost` —
the runner reports mean **Recall@10** (fraction of expected paths in top-10)
and **MRR@10** (1/rank of first expected hit, 0 when absent from top-10),
overall plus per-kind (`code|doc|route`) breakdown. The ablation row is
`+graph-boost` minus `fused`; when either side is unscored the verdict is
`INCONCLUSIVE`, never a fabricated 0.0.

## Ranker adapter seam

`cbm-eval.py` embeds no live ranker (metric code must stay independent of the
rankers under test). Two adapters:

- `--results FILE.json` — replay `{query_id: {stage: [paths...]}}`
  (fixtures, CI, offline scoring).
- `--ranker-cmd CMD` — shell out per (query, stage) with
  `CBM_EVAL_STAGE / CBM_EVAL_QUERY / CBM_EVAL_QUERY_ID / CBM_EVAL_K` in env;
  CMD prints `{"results": [{"path": ..., "score": ...}]}` (`key`/`file`
  accepted; `repo@commit:path:symbol` keys normalized). Nonzero exit fails
  the stage closed (exit 2); exit 3 marks it SKIPPED.

The current `scripts/mcp/cbm-graph-rerank.py rerank` CLI and the future A3
hybrid CLI both plug in via `--ranker-cmd` unchanged.

## Status: live numbers PENDING

As of 2026-10-04 in this worktree the live run is blocked on three
independent prerequisites (checked, not assumed):

1. No `.codebase-memory/` store exists (sync never ran here).
2. `python3 scripts/mcp/cbm-embed-sync.py status` →
   `cli-missing:codebase-memory-mcp` (no graph candidates/features).
3. Embed gateway `http://localhost:8081` unreachable (empty reply).

No bulk embedding was performed for this task. Exact re-run once the
prerequisites hold (port-forward `svc/llm-gateway-embed` first):

```bash
python3 scripts/mcp/cbm-embed-sync.py sync --allow-stale   # or without flag once freshness is green
python3 scripts/mcp/cbm-eval.py run \
  --eval docs/brain/k3-retrieval-eval.jsonl \
  --ranker-cmd 'python3 scripts/mcp/cbm-graph-rerank.py rerank --query "$CBM_EVAL_QUERY"' \
  --md docs/brain/k3-retrieval-ablation.md --json docs/brain/k3-retrieval-ablation.json
```

Fixture-verified instead: `tests/spec/cbm-eval.bats` (7/7 green) plus an
identity-replay smoke run over all 32 rows (exit 0, all stages 1.000 as
expected when expected paths rank first).

## Ablation conclusion (preliminary)

No live per-stage table exists yet, so **no claim about graph-boost is made
from this set**. The harness is built so the conclusion, once measurable,
cannot be circular: hand labels fixed before any ranking is observed,
INCONCLUSIVE-by-default deltas, fail-closed ranker errors. Update this
section with the `docs/brain/k3-retrieval-ablation.md` table after the live
run above.
