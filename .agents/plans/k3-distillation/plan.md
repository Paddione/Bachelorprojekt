# K3-Supervision: Cross-Encoder-Distillation statt Triplets (Recall@10 als Ziel)

Stand 2026-10-26. Kontext: run1–run4 saturieren alle bei 0.989 Triplett-Accuracy
(synthetische Easy-Negatives, Margin flach). Die Triplett-Quelle
(`handled-by-map` + deterministische Off-Slice-Negatives) ist erschöpft —
selbst geminte Hard-Negatives rankt run1 bereits mit 0.996.

## Idee

Bi-Encoder direkt auf Ranking-Verhalten trainieren statt auf Triplett-Separation:
Query → Top-50-Kandidaten aus der laufenden Pipeline → Relevanz-Scores vom
laufenden Cross-Encoder (`llm-gateway-rerank`, bge-reranker-v2-m3) als Soft-Labels →
`CosineSimilarityLoss` (ST, gradierte Paare). Eval über die bestehende
`cbm-eval.py`-Harness (Recall@10/MRR@10, 32 hand-labelte Queries) statt
Triplett-Accuracy. Ziel: `dense-only` von bge-m3-Basis (0.562/0.512) in Richtung
`+cross-encoder`-Zeile (0.828/0.734) bewegen.

## P0 — Ehrliche Retrieval-Eval für Embedding-Modelle (kein Training)

Neuer Ranker-Adapter `scripts/mcp/cbm-embed-rank.py` für den `--ranker-cmd`-Seam:
Query per ST-Modell einbetten → Kosinus Top-K über Chunk-Texte aus
`docs/brain/embed-index.json` (frozen, 22k Chunks ≈ 68 MB @768d, numpy reicht,
kein Store-Rebuild nötig) → Pfade (Key-Schema `repo@commit:path:symbol`
normalisieren wie `extract_paths`).
Dann `cbm-eval.py run --stages dense-only` für: bge-m3 (Repro ~0.56 erwartet),
stock-EmbeddingGemma, run1. Akzeptanz: bge-m3-Zahl reproduziert den
0.562/0.512-Pin — erst dann ist die Harness vertrauenswürdig.

## P0b — Gemma-Full-Coverage-Receipt (Store, kein Bypass)

P0 misst in-memory über den Frozen-Corpus — vergleichbar, aber kein Beweis dass
der lebende Graph-Store vollständig auf Gemma läuft. Deshalb zusätzlich:
`cbm-embed-sync.py` mit Gemma-Endpunkt (stock-Gemma, lokal via ST oder
llama-server-GGUF) über `LLM_EMBED_URL[S]`; der Content-Hash enthält das Modell,
also Full-Re-Embed der ~22k Chunks (Minuten auf 5070 Ti, Dim-Wechsel 1024→768
wird gleich mit getestet). Akzeptanz: `sync status` meldet volle Coverage ohne
`model_mismatch`/`receipt_drift` + `verify → ok`, Manifest pinnt Gemma-Modell/Dim.
Macht P3 (Store-Swap) zum reinen Umschalten. Quelle: `docs/brain/embed-store.md`.

## P1 — Teacher-Mining (Distillations-Korpus)

`scripts/finetune/build_distillation_corpus.py`:
- Queries: 349 Routen × 2 Formulierungen (Keyword + natürlichsprachlich) +
  32 K3-Queries + Doc-Fragen aus den 10 Doc-Zeilen der K3-Eval (~750 Queries v1).
- Kandidaten: je Query Top-30 über `cbm-hybrid.py` (BM25+dense RRF, heutige Pipeline).
- Teacher: Scores lokal per ST-`CrossEncoder` (bge-reranker-v2-m3) auf 5070 Ti —
  nicht via Gateway (HTTP-Overhead bei ~22k Paaren v1).
- Output: `(query, doc, score)`-JSONL, Scores min-max-normiert je Query
  (Listeneffekte raus, Vergleichbarkeit rein). K3-Queries NICHT ins Training
  (held-out Eval), Rest stratifiziert nach kind (code/route/doc).

## P2 — Training (Code-Änderung nötig)

`train_embedding.py` erwartet Triplets → `--pairs`-Modus mit Score-Spalte +
`CosineSimilarityLoss` (+ optional `MatryoshkaLoss` wie bisher), Warm-Start ab
run1, 2–3 Epochs, 5070 Ti. Eval-Callback + Prompt-Parity aus `306469594`
wiederverwenden (Callback auf gradierte Paare umstellen: Spearman statt Accuracy).
Fallback bei Underperformance: ListNet/RankNet-Listwise-Loss statt pointwise Cosine.

## P3 — Entscheidung

Gleiche Harness wie P0 für das getunte Modell + Triplett-Eval + per-dim.
Ship-Kriterium: `dense-only` Recall@10/MRR@10 schlägt bge-m3 signifikant UND
Triplett-Margin hält run1-Niveau. Dann: GGUF Q8_0-Export (bewährter Pfad,
`tokenizer.ggml.pre=default`) + Store-Re-Embed (22k Chunks, Minuten auf 5070 Ti).

## Risiken (explizit)

- **32 Queries, hohe Varianz**: per-kind berichten, keine Nachkommastellen-Mikrooptik;
  bei Bedarf Doc-/Route-Queries aus K4-Docs nachlabeln (billig, Handarbeit).
- **Teacher-Ceiling**: Distillation nähert dense dem Reranker an, überholt ihn selten —
  Gewinn liegt im Latenzpfad (dense statt rerank), nicht über der Top-Zeile.
- **Dense-doc 0.000 ist Content, nicht Embedding**: Section-Vektoren ohne Prosa (A2-Limit).
  Kein Training fixt fehlenden Text — ggf. P1-Doc-Queries streichen statt schönrechnen.
- **Template-Bias**: synthetische Queries ≠ echte User-Queries; K3-Hand-Set als
  held-out ist die einzige ehrliche Bremse — nie ins Training mischen.
