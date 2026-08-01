---
title: "K1 visualisieren: Vektorspeicher (pgvector in shared-db)"
domains: [infra, database]
ticket_id: T002431
status: active
---

# K1: Vektorspeicher visualisieren

**Ticket:** T002431

## Aufgabe

Die pgvector-Komponente in der shared-db analysieren und als Diagramm darstellen:
- Welche Tabellen existieren (code_embeddings, knowledge.chunks, Coaching-Knowledge, OpenSpec-Embeddings)?
- Wer schreibt (SCS-Indexer, openspec-embed.mjs, post-commit-Hook, ingest-json-core.ts)?
- Wer liest (/api/codesearch, /api/openspec/search, search-similar.mjs)?
- Welche Vektorräume (bge-m3, voyage-multilingual-2) pro Tabelle?
- Welche Tabellen sind leer, welche gemischt (MixedEmbeddingModelError)?

## Ergebnis

Diagramm mit beschrifteten Ein-/Ausgangskanten + Liste toter Kanten.
