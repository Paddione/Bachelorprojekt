---
ticket_id: T001008
plan_ref: openspec/changes/openspec-pgvector/tasks.md
status: active
date: 2026-06-20
---

# Design: OpenSpec pgvector Indexierung

**Datum:** 2026-06-20
**Slug:** openspec-pgvector
**Status:** design_approved
**Ticket:** TBD

---

## Kontext & Motivation

OpenSpec-Dokumente (`proposal.md`, `tasks.md`, `specs/<slug>.md`) werden aktuell
ausschließlich grep-basiert von `plan-context.sh` gelesen. Bei wachsender Spec-Anzahl
sinkt die Retrieval-Qualität: grep findet exakte Strings, aber keine semantisch
ähnlichen Konzepte. Agents müssen alle Dateien lesen um Relevanz zu bestimmen.

**Ziel:** Semantische Suche über OpenSpec-Dokumente via pgvector — Agents finden
relevante Specs/Pläne ohne vollständiges Datei-Scanning. `knowledge.collections`
hat bereits `source='specs_plans'` (bisher ungenutzt).

---

## Architektur: Hybrid Write-CLI / Read-API

Zwei getrennte Codepfade mit klarer Verantwortungstrennung:

```
openspec.sh (apply/archive)
    └─► scripts/openspec-embed.mjs   ──► PostgreSQL (knowledge.chunks)
                                     └─► TEI (bge-m3, llm-gateway-embed:8081)

plan-context.sh --semantic <q>
    └─► GET /api/openspec/search     ──► PostgreSQL (pgvector <=>)
                                     └─► TEI (embed query)

MCP: openspec_find_similar(query)
    └─► GET /api/openspec/search
```

**Write-Pfad als CLI:** Kein laufender Website-Pod nötig. Embedding-Sync läuft auch
beim initialen Cluster-Deploy und in Worktrees. DB-Zugangsdaten bleiben in
`DATABASE_URL` (Env), nicht in der Website-API.

**Read-Pfad über API:** Wiederverwendung von `embeddings.ts`, `knowledge-db.ts`.
Kein Duplikat der Embedding-Logik.

---

## Datenbank

Kein neues Schema — bestehende Tabellen:

**`knowledge.collections`** (eine Zeile, shared):
```sql
INSERT INTO knowledge.collections (name, source, brand, embedding_model)
VALUES ('OpenSpec Specs & Plans', 'specs_plans', NULL, 'bge-m3')
ON CONFLICT (name) DO NOTHING;
```

**`knowledge.documents`** (ein Row pro Slug):
```
id            UUID PRIMARY KEY
collection_id UUID (FK knowledge.collections)
title         TEXT  -- slug als Titel
source_url    TEXT  -- z.B. "openspec/changes/<slug>/proposal.md"
metadata      JSONB: { slug, ticket_id, status }
```

**`knowledge.chunks`** — bestehende Spalten + JSONB metadata:
```
id            UUID PRIMARY KEY
document_id   UUID (FK knowledge.documents, ON DELETE CASCADE)
collection_id UUID (FK knowledge.collections)
position      INT
text          TEXT
embedding     VECTOR(1024)
metadata      JSONB: {
  slug:          string,   -- openspec change slug
  ticket_id:     string,   -- z.B. "T000987"
  status:        string,   -- planning | plan_staged | archived
  file_type:     'proposal' | 'task_section' | 'spec_section',
  section_title: string,
  char_offset:   number
}
```

HNSW-Index auf `embedding` existiert bereits (`vector_cosine_ops`).

---

## Write-Pfad: `scripts/openspec-embed.mjs`

Standalone Node.js ESM-Script. Keine Website-Abhängigkeit.

### Aufruf
```bash
node scripts/openspec-embed.mjs --slug <slug> [--dry-run]
```

### Chunking-Strategie

| Datei | Chunking | Chunk-Typ |
|-------|----------|-----------|
| `proposal.md` | Ganzes Dokument (atomisch nach Frontmatter-Strip) | `proposal` |
| `tasks.md` | Section-Split an `##`, max 400 Tokens, 50-Token-Overlap | `task_section` |
| `specs/<slug>.md` | Section-Split an `##`, max 400 Tokens, 50-Token-Overlap | `spec_section` |

YAML-Frontmatter wird vor Embedding gestripped, aber in `metadata` gespeichert.

### Upsert-Logik (idempotent)
1. Lese `proposal.md`, `tasks.md`, `openspec/specs/<slug>.md` (letzte optional)
2. Strip Frontmatter, extrahiere `ticket_id` + `status`
3. Chunk nach Strategie oben
4. `DELETE FROM knowledge.documents WHERE metadata->>'slug' = $1` — CASCADE löscht Chunks
5. `INSERT INTO knowledge.documents (collection_id, title, metadata)` → `document_id`
6. Batch-Embed via TEI `llm-gateway-embed:8081` (bge-m3, 1024-dim)
7. `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)`
8. `UPDATE knowledge.collections SET last_indexed_at = now() WHERE source = 'specs_plans'`

### Fehlerverhalten
Best-effort: Script loggt Fehler (GPU-Host down, TEI-Timeout, DB unreachable)
und beendet mit **Exit 0** — `openspec.sh` wird nicht unterbrochen. Embedding-Failure
blockiert den Lifecycle nicht.

### Integration in `scripts/openspec.sh`
```bash
# Nach cmd_apply:
node scripts/openspec-embed.mjs --slug "$SLUG" || true

# Nach cmd_archive:
node scripts/openspec-embed.mjs --slug "$SLUG" || true
```

### Backfill
```bash
task openspec:embed:backfill
# Iteriert alle openspec/changes/ mit status=planning|plan_staged
# Ruft openspec-embed.mjs sequenziell auf
# --dry-run zeigt was indexiert würde ohne DB-Writes
```

---

## Read-Pfad: `GET /api/openspec/search`

### Request
```
GET /api/openspec/search?q=<text>&limit=5&status=plan_staged
```

Parameter:
- `q` — Query-Text (required)
- `limit` — Anzahl Ergebnisse (default 5, max 20)
- `status` — Filter auf OpenSpec-Status (optional; filtert via metadata JSONB)

### Response
```json
[
  {
    "slug": "openspec-pgvector",
    "ticket_id": "T001010",
    "section_title": "Write-Pfad: scripts/openspec-embed.mjs",
    "file_type": "task_section",
    "snippet": "Standalone Node.js ESM-Script. Keine Website-Abhängigkeit...",
    "similarity": 0.91
  }
]
```

### Implementierung
- `website/src/pages/api/openspec/search.ts`
- Embed Query via `embeddings.ts` → pgvector `<=>` cosine distance
- WHERE: `collection.source = 'specs_plans'`
- Auth: interne API (gleiche Middleware wie andere `/api/`-Routes)

---

## `plan-context.sh` Integration

Neuer optionaler Flag `--semantic <query>`:

```bash
bash scripts/plan-context.sh <role> --with-openspec --semantic "pgvector embedding"
```

- Ruft `/api/openspec/search` auf (Top-3)
- Gibt semantisch ähnliche Changes als zusätzliche Section aus
- **Fallback auf grep-only** wenn API nicht erreichbar (kein harter Fehler)
- Bestehende grep-basierte Logik bleibt unverändert als Basis

---

## MCP-Tool: `openspec_find_similar`

Neues Tool im bestehenden OpenSpec-MCP-Server:

```typescript
// Tool-Definition
{
  name: "openspec_find_similar",
  description: "Findet semantisch ähnliche OpenSpec Changes zu einer Suchanfrage",
  inputSchema: {
    query: string,      // Suchanfrage
    limit?: number,     // Default 5
    status?: string     // Filter: planning | plan_staged | archived
  }
}
```

Wraps `GET /api/openspec/search`. Agents können direkt fragen:
- "Welche Specs behandeln ähnliche Themen wie Embedding-Indexierung?"
- "Gibt es bereits einen Plan für pgvector-Migration?"

---

## Testing

| Ebene | Was | Datei |
|-------|-----|-------|
| Unit | Chunking: Frontmatter-Strip, Section-Split, Overlap | `website/src/lib/openspec-embed.test.ts` |
| Unit | Upsert-Idempotenz: 2× selber Slug → gleiche Chunk-Anzahl | `scripts/openspec-embed.test.mjs` |
| Unit | Dry-Run: `--dry-run` loggt, schreibt nichts | `scripts/openspec-embed.test.mjs` |
| Integration | Search-Endpoint: Fixture-Chunk → Query → Top-1 korrekt | `website/src/lib/openspec-search.test.ts` |
| BATS | `openspec:apply` → Chunks in DB vorhanden | `tests/spec/openspec-embedding.bats` |

CI-Gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check`
Nach Test-Änderungen zusätzlich: `task test:inventory` + Commit des Inventars.

---

## Wichtige Constraints

- **Kein Mixed-Model-Error:** Collection `specs_plans` muss konsistent `bge-m3` verwenden.
  Im Dev-Modus (Voyage-Fallback) wird Voyage genutzt — `embedding_model` in der Collection
  muss beim Backfill mit dem tatsächlich genutzten Modell übereinstimmen.
- **Keine Brand-Isolation:** OpenSpec ist shared (brand=NULL). Queries über beide Brands.
- **Token-Kosten:** Voyage-Fallback im Dev ist kostenpflichtig — Backfill nur explizit
  triggern, nicht automatisch bei jedem Commit.
- **tasks.md-Größe:** Große Pläne (>50 Tasks) können viele Chunks erzeugen — HNSW-Index
  bleibt performant bis ~100k Chunks (weit unter Grenze).
