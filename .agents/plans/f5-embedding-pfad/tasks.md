---
title: F5 Embedding-Pfad — Router-Fehlerkante und Modell-Mix sind belegt
domains: [website, knowledge]
status: staged
branch: fix/f5-embedding-pfad-20261021
---

# f5-embedding-pfad — Implementation Plan

Ziel: Die Vektor-Doku zeigt den vollständigen Embedding-Pfad inklusive
Fail-Closed-Ästen und Modell-Mix-Guard.

## File Structure

| Datei | Änderung (Worker-Output, unstaged) |
|---|---|
| `docs/diagrams/k1-vector-db.md` | Router-Kette mit path:line, Retry/Fail-Closed-Ästen, Mixed-Model-Guard |

Verbrauchte Schnittstellen: `embedQuery`/`embedBatch` (`embeddings.ts:85-126`),
`resolveEndpoint` (`bge-router.ts:40-48`), `queryNearest`/`mergeCollections`
(`knowledge-db.ts:219-231`, `:294-295`). Produziert: Doku-Abschnitte.

## Tasks

- [x] 1. Modell-Routing mit Zeilen belegen (bge-m3 only, T016562).
- [x] 2. Retry- und Fail-Closed-Äste belegen (`embeddings.ts:71-82`, `:92-94`, `:112-114`).
- [x] 3. Mixed-Model-Guard belegen (`knowledge-db.ts:6-11`, `:219-231`, `:294-295`).
- [x] 4. Verifikation im Worktree: `grep -n "resolveEndpoint" components/website/src/lib/embeddings.ts`, `grep -n "MixedEmbeddingModelError" components/website/src/lib/knowledge-db.ts` und `grep -n "BgeRoutingError" components/website/src/lib/bge-router.ts` liefern Treffer (Exit 0).
- [ ] 5. Finale Gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.

## Abnahme

Kein offener Router-Ast ohne Beleg; Doku nennt ausschließlich bge-m3.
