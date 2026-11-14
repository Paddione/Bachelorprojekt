# Embed / Graph-Rerank Eval (T900993 A6, festgehalten T900998)

Methodik und Rohdaten: `docs/brain/k3-retrieval-eval.md`,
`docs/brain/k3-retrieval-ablation.json` (32 Queries: 10 route, 12 code,
10 doc; Runner `scripts/mcp/cbm-eval.py`; handgelabelt, alte P0-min-Labels
waren zirkulaer weil aus Import-Relationen abgeleitet).

## Ergebnis (live gemessen 2026-10-04)

Store: 22.336 Vektoren (`bge-m3`, dim 1024). Pipeline: BM25 (`nodes_fts`)
+ Dense parallel, RRF k=60, Pool 50, Cross-Encoder `bge-reranker-v2-m3`,
Graph-Boost-Cap 0,14.

| Stufe | Recall@10 | MRR@10 |
|---|---|---|
| fused (ohne Rerank) | 0,469 | — |
| +cross-encoder | 0,828 (+0,359) | — |
| +graph-boost (post-Rerank) | 0,828 (+-0,000) | — |

Per-kind Recall auf der Top-Zeile: code 0,958 / doc 0,650 / route 0,850
(Dense-doc 0,000: K3-Sections ohne Prosa — D1-Stuetze fuer "K1 behalten").

## Befund

- **Graph-Boost schadet prae-Rerank** (-0,250 Recall, MRR 0,652->0,311)
  und ist **post-Rerank exakt neutral** (+-0,000). Der Runner-Verdict
  "HELPS +0,422" vergleicht gegen `fused` und schreibt den
  Cross-Encoder-Gewinn dem Boost gut — irrefuehrend.
- **Mechanismus (k3eval-01, verifiziert):** RRF-Scores ~0,016-0,030,
  Boost-Cap 0,14 ~50x groesser — der Boost dominiert statt
  feinjustieren; `HANDLES +0,10` feuert query-blind auf Symbol-Ebene.
- **Cross-Encoder traegt +0,359 Recall** und rettet Doc (0,050->0,650).
- Follow-up (offen): Cap relativ zur Score-Skala waehlen oder HANDLES an
  Query-Ueberlappung binden; `--no-boost` Flag fuer An/Aus-Ablation
  existiert bereits in `cbm-graph-rerank.py`.

## Demo-Baseline (2026-10-04)

1.866 Graph-Kandidaten mit bge-m3 (~6-7 Texte/s) eingebettet, mit
bge-reranker-v2-m3 rerankt; sinnvolle Hits auf ticket-grill /
talk-transcriber / purgeOneFixture — Anlass, den Store zu verstetigen.

## Pool-Trim (2026-11-14, Qwen3-Reranker-0.6B Q8_0, CPU)

Backend: llama-server `--rerank` auf 127.0.0.1:18340, Query ueber
`cbm-graph-rerank.py hybrid --pool N --top-k 10`, 9-Query-Subset
(je 3 route/code/doc aus `k3-retrieval-eval.jsonl`), Recall@10/MRR@10:

| Pool | Recall@10 | MRR@10 | s/Query | Rerank-ms |
|---|---|---|---|---|
| 50 | 0,889 | 0,660 | 38,4 | 22548 |
| 40 | 0,889 | 0,633 | 36,6 | 19690 |
| 30 | 0,778 | 0,520 | 29,6 | 14007 |
| 20 | 0,778 | 0,548 | 23,4 | 8852 |
| 10 | 0,556 | 0,481 | 19,1 | 4559 |

Entscheid: Default-Pool 50 → 40 (`DEFAULT_POOL`, `RERANK_MAX_CANDIDATES`).
Pool 40 haelt Recall (8/9, eine Query kippt Rang 2→4: MRR -0,027) und spart
~13 % Rerank-Zeit. Pools ≤30 verlieren ganze Queries (24, 25 fallen raus;
23 kippt unsystematisch — Rauschen bei n=9, Trend eindeutig).
CPU kostet ~0,5 s/Paar (kurze Prompts); kein GPU-Headroom (`:1919` peak-nah).
