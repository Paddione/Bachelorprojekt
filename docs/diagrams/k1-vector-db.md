<!-- Extrahiert aus docs/superpowers/specs/2026-07-28-sdlc-cockpit-design.md [T002521].
     Urspruenglich dort abgelegt, gehoert aber zu Epic T002430 (Brain-Architektur),
     nicht zu T002458 (SDLC-Cockpit). Beide nummerieren ihre Kinder mit K. -->
# K1 — Vektorspeicher (pgvector in shared-db)

> Erhoben 2026-07-29. Analyse der pgvector-Tabellen in der `shared-db`:
> welche existieren, wer schreibt, wer liest, welches Modell und welche Dimension,
> und welche Kanten heute ins Leere laufen.

## Übersicht

Drei Vektor-Tabellen plus eine Metadaten-Tabelle, die das Embedding-Modell pro
Collection festhält. Alle nutzen pgvector 0.8.0 mit HNSW-Indizes und Cosine-Distanz,
alle Vektoren sind 1024-dimensional.

| Tabelle | Zeilen | Dims | Modell (Quelle) | Index | Status |
|---|---|---|---|---|---|
| `knowledge.chunks` | 18.405 | 1024 | `voyage-multilingual-2` (61 Collections), `bge-m3` (1 Collection: `KI_pgvector`) | HNSW, cosine | **aktiv** |
| `public.code_embeddings` | 18.549 | 1024 | `bge-m3` (implizit, kein Modell-Feld) | HNSW, cosine (m=16, ef=64) | **aktiv** |
| `tickets.ticket_embeddings` | **0** | 1024 | `bge-m3` (LLM_ENABLED) / `voyage` (dev) — Spalte `embedding_model` vorhanden | HNSW, cosine (m=16, ef=64) | **leer** 🔴 |
| `knowledge.collections` | 62 | — | `embedding_model` pro Collection | — | Metadaten |

## Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SCHREIBER (Writer)                           │
│                                                                     │
│  scripts/index-repo.ts ───bge-m3──► code_embeddings (18.549 rows)  │
│  (SCS-Indexer, post-commit hook)                                    │
│                                                                     │
│  scripts/openspec-embed.mjs ───bge-m3/voyage──► knowledge.chunks   │
│  scripts/knowledge/lib-knowledge-pg.mjs ───voyage──►   (18.405)    │
│  website/src/lib/ingest-json-core.ts ───router──►                   │
│  website/src/lib/knowledge-db.ts ───router──►                       │
│  scripts/knowledge/ingest-web.mjs ───router──►                      │
│                                                                     │
│  website/src/lib/tickets-embed.ts ───bge-m3──► ticket_embeddings    │
│  (⚠ NOCH NIE AUFGERUFEN — 0 rows)                    🔴 LEER       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LESER (Reader)                              │
│                                                                     │
│  website/src/lib/codesearch-db.ts ◄── code_embeddings              │
│  → /api/codesearch                                                   │
│                                                                     │
│  website/src/lib/knowledge-db.ts ◄── knowledge.chunks               │
│  → /api/openspec/search, queryNearest()                             │
│                                                                     │
│  website/src/lib/coaching-db.ts ◄── knowledge.chunks               │
│  → Coaching Semantic Search                                          │
│                                                                     │
│  scripts/knowledge/search-similar.mjs ◄── knowledge.chunks         │
│  → CLI Knowledge Search                                              │
│                                                                     │
│  website/src/lib/tickets-embed.ts ◄── ticket_embeddings             │
│  → searchSimilarTickets() — 🔴 Tabelle leer, kein Aufrufer          │
└─────────────────────────────────────────────────────────────────────┘
```

## Kanten, die heute ins Leere laufen

| Kante | Tabelle | Grund |
|---|---|---|
| `tickets-embed.ts` → `ticket_embeddings` | `tickets.ticket_embeddings` | Code existiert (embed + search), aber **kein Aufrufer** in Produktion. `embedTicket()` und `searchSimilarTickets()` sind implementiert, aber keine Route, kein Cron, kein Hook ruft sie auf. Tabelle hat 0 Zeilen. |
| `tickets-embed.ts` → `ticket_embeddings` (search) | Leser ohne Daten | `searchSimilarTickets()` würde funktionieren, aber die Tabelle ist leer — die Suche liefert immer 0 Ergebnisse. |
| Coaching `snippets` / `snippet_clusters` | `coaching.*` | Ticket-Beschreibung nennt „Coaching-Knowledge", aber **keine** Tabelle im Schema `coaching` hat eine Vektor-Spalte. Embeddings laufen ausschließlich über `knowledge.chunks`. |

## Mixed-Embedding-Model-Check

**Guard:** `website/src/lib/knowledge-db.ts` — `MixedEmbeddingModelError`

```typescript
// queryNearest() prüft vor der Suche:
SELECT DISTINCT embedding_model FROM knowledge.collections
WHERE id = ANY($1)  // $1 = collection IDs

// Wenn >1 Modell → Error:
throw new MixedEmbeddingModelError(models)
```

**Heutiger Zustand:**
- `knowledge.chunks` enthält Embeddings von **zwei Modellen**: `bge-m3` (1 Collection: `KI_pgvector`) und `voyage-multilingual-2` (61 Collections).
- **ABER:** die Abfrage im Guard filtert nach `collection_id`, nicht nach Chunk-Inhalt. Da jede Collection genau ein Modell hat, schlägt der Guard nur an, wenn eine Query mehrere Collections mit **unterschiedlichen** Modellen gleichzeitig durchsuchen will.
- Derzeit gibt es **keine** Cross-Collection-Query, die beide Modelle einschließt — der Guard ist also wirksam, aber nie getriggert.
- `code_embeddings` hat **kein** `embedding_model`-Feld → implizit immer `bge-m3`. Ein späteres Hinzufügen eines zweiten Modells würde alle bestehenden Zeilen ohne Modell-Tag lassen und den Guard unmöglich machen.
- `tickets.ticket_embeddings` hat das `embedding_model`-Feld (Phase-1-Migration in `tickets/tables/tickets.ts`), aber 0 Zeilen — die Modell-Trennung ist vorbereitet, aber mangels Daten ungetestet.

## Schreiber-Detail: Welcher läuft wirklich?

| Schreiber | Läuft? | Beweis |
|---|---|---|
| `scripts/index-repo.ts` | ✅ Ja | 18.549 Zeilen in `code_embeddings`; läuft als post-commit-Hook |
| `scripts/openspec-embed.mjs` | ✅ Ja | Hat `knowledge.chunks`-Einträge erzeugt |
| `website/src/lib/knowledge-db.ts` (ingest) | ✅ Ja | Collections mit `source=custom` haben Chunks |
| `scripts/knowledge/ingest-web.mjs` | ✅ Ja | Collections mit `source=web_crawl` haben Chunks |
| `scripts/knowledge/lib-knowledge-pg.mjs` | ✅ Ja | CLI-Ingest-Pfad |
| `website/src/lib/tickets-embed.ts` | ❌ Nein | `ticket_embeddings` hat 0 Zeilen — toter Code |

## Modell-Routing

Der zentrale Embedding-Router (`website/src/lib/embeddings.ts`) lenkt alle Aufrufe:

```
embedQuery/embedBatch(model, purpose)
  ├── bge-m3 ──► LLM_EMBED_URL (bge-mcp auf llama.cpp)
  └── voyage-multilingual-2 ──► LLM_EMBED_URL (router) → fallback: api.voyageai.com
```

Der Router (`llm-proxy`) leitet `voyage`-Aufrufe an die VoyageAI-API weiter (mit API-Key).
`bge-m3` läuft ausschließlich lokal auf dem llama.cpp-Server (port 8090 via bge-mcp).
`scripts/index-repo.ts` umgeht den Router und geht direkt zum bge-mcp.

## Fazit

1. **Zwei von drei Vektor-Tabellen sind aktiv** — `code_embeddings` und `knowledge.chunks` werden regelmäßig beschrieben und gelesen.
2. **`ticket_embeddings` ist toter Code** — vollständig implementiert, aber kein Aufrufer. Entweder aktivieren (Route/Hook bauen) oder als technische Schuld dokumentieren.
3. **Keine Mixed-Model-Collision heute** — der Guard funktioniert, aber jede Collection hat genau ein Modell. Das Risiko entsteht erst, wenn jemand `bge-m3`-Chunks in eine `voyage`-Collection schreibt (oder umgekehrt).
4. **Coaching hat keine eigenen Embeddings** — das im Ticket genannte „Coaching-Knowledge" läuft über `knowledge.chunks`, nicht über `coaching.*`.
