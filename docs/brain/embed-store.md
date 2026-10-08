# Embed-Store: Format, Inkrementalitaet, Drift (T900993/T900998)

Der Embed-Store hebt den K3-Symbol-Layer (Routen + Funktionen mit
Docstring, spaeter Sections/Klassen, A2) in einen dauerhaften,
driftfesten Artefakt statt /tmp-Checkpoints. Skripte:
`scripts/mcp/cbm-embed-store.py` (Store, stdlib-only),
`scripts/mcp/cbm-embed-sync.py` (Sync-CLI), Specs
`tests/py/spec/native_ported/spec/test_cbm_embed_store.py` / `tests/py/spec/test_cbm_graph_rerank_and_hybrid.py`.

## Artefakt-Paar (`.codebase-memory/`, gitignoriert)

| Datei | Inhalt |
|---|---|
| `embed-index.jsonl` | ein JSON-Objekt je Zeile: `{key, hash, model, dim, vector}` |
| `embed-manifest.json` | Sidecar: `corpus_sha256`, `receipt_id` + `receipt_timestamp`, `model`, `dim`, Counts |

- **Key-Schema:** `repo@commit:path:symbol` (identisch zum Frozen Corpus
  `docs/brain/embed-index.json`).
- **Content-Hash:** `sha256(model + "\\0" + embedding_input_text)` — ein
  Modellwechsel invalidiert per Konstruktion alle Vektoren.
- **Atomar:** Writes via Temp+Rename; Leser fail-closed (kaputte Zeile,
  Duplikat-Key oder unlesbare Datei => `EmbedStoreError`, nie Teildaten).

## Inkrementalitaet (Receipt-keyed)

`cbm-embed-sync.py sync` zieht Kandidaten per `query_graph` (Routen,
Funktions-Full-Rows, Methoden, Klassen/Interfaces, Sections), difft per
Content-Hash (`diff_by_hash` => `to_embed`/`unchanged`), bettet nur Deltas
ueber das LLM-Gateway ein (`LLM_EMBED_URL[S]`, Retry mit Backoff,
Checkpointing, Multi-Endpoint-Fan-out), prunt stale Keys und stempelt das
Manifest mit der aktuellen Freshness-Receipt.

`cbm-embed-sync.py status` berichtet Coverage (Kandidaten vs. Store,
`model_mismatch`, `receipt_drift`) ohne zu schreiben.

## Drift-Vertrag (fail-closed)

- Kein Sync bei Freshness `unknown`/nicht-`fresh` ohne `--allow-stale`
  (`guard_stale`): Vektoren duerfen nie still vom Graphen abweichen.
- Manifest ohne `receipt_id` => fail-closed.
- Korrupte Artefakte => Non-Zero-Exit (`verify` benennt die Ursache).

## Kennzahlen (live, 2026-10-04)

22.336 Vektoren, `bge-m3`, dim 1024, Corpus-SHA `785f3257...`,
Receipt `2026-10-04T10:32:20Z`, `verify -> ok`. Eval: `embed-rerank-eval.md`.
