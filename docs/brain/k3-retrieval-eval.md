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

## Status: live gemessen 2026-10-04

Store: 22.336 Vektoren (`bge-m3`, dim 1024, Corpus-SHA
`785f3257…`, Receipt `2026-10-04T10:32:20Z`, `verify → ok`).
Hybrid: BM25 (`nodes_fts`) + Dense parallel, RRF k=60, Pool 50,
Cross-Encoder `bge-reranker-v2-m3`, Graph-Boost cap 0,14.
Rohdaten: `docs/brain/k3-retrieval-ablation.json`
(Runner-Tabelle: `/tmp/opencode/eval-table.md`, per-call-Adapter durch
Batch-Adapter mit identischen Codepfaden ersetzt — Store/Features 1×
geladen, Dense per numpy float64, siehe Fußnote).

| Konfiguration | Recall@10 | MRR@10 |
|---|---|---|
| RRF, kein Rerank, kein Boost (`fts-only`) | 0,719 | 0,652 |
| RRF + Boost, kein Rerank (`fused`) | 0,469 | 0,311 |
| Dense allein (`dense-only`) | 0,562 | 0,512 |
| RRF + Rerank, kein Boost (`+cross-encoder`) | 0,828 | 0,734 |
| RRF + Rerank + Boost (`+graph-boost`) | 0,828 | 0,734 |

Per-kind (Recall): code 0,958 / doc 0,650 / route 0,850 auf der
Top-Zeile; Dense-doc 0,000 (Section-Vektoren ohne Prosa, A2-Limit).

## Ablation conclusion (live)

- **Graph-Boost schadet prä-Rerank (−0,250 Recall, MRR 0,652→0,311)**
  und ist post-Rerank exakt neutral (±0,000). Der Runner-Verdict
  „HELPS +0,422“ ist irreführend: er vergleicht `+graph-boost` gegen
  `fused` und schreibt damit den Cross-Encoder-Gewinn dem Boost gut.
  Ehrlich: Boost-an/aus bei fixiertem Rerank = 0,000.
- **Mechanismus (verifiziert, k3eval-01):** RRF-Scores liegen bei
  ~0,016–0,030, der Boost-Cap 0,14 ist ~50× größer — der Boost
  dominiert statt zu feinjustieren. `HANDLES +0,10` feuert
  query-blind auf Symbol-Ebene: `VideoVault/server/routes.ts` und
  `brett/.../auth.ts` (falsche Auth!) ranken über
  `website/.../auth.ts`. Cap relativ zur Score-Skala wählen oder
  HANDLES an Query-Überlappung binden (Follow-up).
- **Cross-Encoder trägt +0,359 Recall** (0,469→0,828) und rettet Doc
  (0,050→0,650) trotz schwacher Stufe 1.
- **D1-Stütze:** Dense-doc 0,000 bestätigt „K1 behalten“ — K3-Sections
  haben keine Prosa (Graph liefert keinen Body-Text).

Fußnoten: Batch-Adapter `/tmp/opencode/batch_rank.py` (kein Repo-Artefakt)
ruft dieselben Funktionen in derselben Reihenfolge (`fts_search`,
`dense_search`-äquivalent per numpy float64, `rrf_fuse`,
`rerank_cross`, `apply_final_scores`); Store/Features einmal geladen,
Rerank-Scores zwischen `+cross-encoder`/`+graph-boost` geteilt.
CLI-Gegenprobe k3eval-01 mit korrektem `PATH` reproduziert die
Batch-Rankings exakt (ohne `codebase-memory-mcp` im `PATH` degradieren
die Features still zu Boost 0 — per Design, `warnings` beachten).
