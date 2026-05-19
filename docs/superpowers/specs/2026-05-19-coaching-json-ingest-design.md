# Design: JSON als generische Wissensquelle (pgvector-Import)

**Datum:** 2026-05-19
**Branch:** feature/coaching-json-ingest
**Scope:** CLI + Admin-UI für direkten Import von pre-chunked JSON-Dateien in `knowledge.collections`

---

## Kontext

Die bestehende Coaching-Pipeline (`scripts/coaching/ingest-book.mts`) verarbeitet nur PDF/EPUB: Text extrahieren → chunken → embedden → pgvector. Für bereits vorbereitete Quellen (z.B. `KI_pgvector.json` mit 39 Coaching-Chunks von Brückenschlag e.V.) ist dieser Weg unnötig aufwendig. Das JSON-Format enthält fertige Chunks mit `id`, `content` und strukturierten `metadata`-Feldern.

**Ziel:** JSON-Dateien im Format `[{id, content, metadata}]` direkt als generische `knowledge.collection` einspielen — sowohl per CLI als auch per Admin-UI mit Live-Fortschritt.

---

## JSON-Eingabeformat

```json
[
  {
    "id": "ki1-block1-uebersicht",
    "content": "Coachingausbildung für MediatorInnen …",
    "metadata": {
      "source_file": "KI.docx",
      "document": "KI1",
      "block": "Block 1",
      "title": "Kursübersicht Block 1",
      "type": "kursinhalt",
      "tags": ["coaching", "ausbildung"],
      "language": "de",
      "institution": "Brückenschlag e.V."
    }
  }
]
```

Pflichtfelder pro Eintrag: `id` (string), `content` (string, nicht leer). `metadata` ist optional aber erhalten wenn vorhanden.

---

## Architektur

```
JSON-Datei
    │
    ├── CLI: task coaching:ingest-json -- file.json <slug> [--brand=mentolder]
    │         └── scripts/coaching/ingest-json.mts
    │               └── ingestJsonChunks(pool, {filePath, slug, brand, onProgress})
    │
    └── Admin UI: /admin/knowledge → "JSON importieren"-Panel
                  └── KnowledgeJsonImport.svelte
                        └── POST /api/admin/knowledge/import/json (multipart/form-data)
                              └── SSE-Stream → ingestJsonChunks(..., onProgress)
```

**Shared Core:** `website/src/lib/ingest-json-core.ts` exportiert `ingestJsonChunks` — einzige Implementierung, zwei Einstiegspunkte. Gleiche Platzierung wie `embeddings.ts` und `chunking.ts`; CLI importiert via `../../website/src/lib/ingest-json-core.ts`, API-Route via `../../../lib/ingest-json-core.ts`.

---

## Datenbank-Mapping

| JSON | DB-Feld |
|---|---|
| `slug` (vom User) | `knowledge.collections.name` |
| `'custom'` | `knowledge.collections.source` |
| `BRAND`-Env-Var (Server-seitig, kein UI-Feld) | `knowledge.collections.brand` |
| Alle Einträge zusammen | 1 × `knowledge.documents` pro Datei |
| `file://<filename>` | `documents.source_uri` |
| `sha256(JSON-String)` | `documents.sha256` |
| `entry.content` | `chunks.text` |
| Array-Index | `chunks.position` |
| `{source_id: entry.id, ...entry.metadata}` | `chunks.metadata` (JSONB) |
| `embedBatch(entry.content)` | `chunks.embedding` (1536-dim Voyage / 1024-dim bge-m3) |

**Idempotenz:** `ON CONFLICT (collection_id, source_uri)` aktualisiert das Dokument, löscht alte Chunks, schreibt neue. Re-Import mit gleicher Datei ist sicher.

---

## CLI

```bash
# Neu in Taskfile.yml:
task coaching:ingest-json -- /pfad/zur/datei.json ki-brueckenschlag [--brand=mentolder]

# Intern:
# scripts/coaching/ingest-json.mts
# → ingestJsonChunks mit console.log-onProgress
# Gleiche THROTTLE=1-Logik + Voyage-429-Retry (70s Backoff) wie ingest-book.mts
```

---

## API-Endpunkt

**`POST /api/admin/knowledge/import/json`**

- Auth: bestehende Admin-Session-Prüfung (wie alle `/api/admin/*`-Routen)
- Body: `multipart/form-data` mit Feldern `file` (JSON-Datei) und `slug` (String)
- Response: `Content-Type: text/event-stream`

**SSE-Events:**

```
data: {"type":"start","total":39}

data: {"type":"progress","done":8,"total":39}
data: {"type":"progress","done":16,"total":39}
...
data: {"type":"done","collectionId":"<uuid>","chunkCount":39,"slug":"ki-brueckenschlag"}

data: {"type":"error","message":"Ungültiges JSON: …"}
```

**Batch-Größe:** 8 Chunks pro `embedBatch`-Aufruf (Voyage-kompatibel).

---

## Admin UI

**Datei:** `website/src/components/admin/KnowledgeJsonImport.svelte`
**Eingebunden auf:** `/admin/knowledge` (bestehende Seite)

```
┌─────────────────────────────────────────────┐
│  JSON-Wissensquelle importieren             │
│                                             │
│  Collection-Name  [ki-brueckenschlag      ] │
│  JSON-Datei       [Datei wählen…  KI_pg…] │
│                                             │
│  [  Importieren  ]                          │
│                                             │
│  ████████████░░░░░░  12 / 39 Chunks         │
│  ✓ Fertig — 39 Chunks in "ki-brueckenschlag"│
└─────────────────────────────────────────────┘
```

**States:**
- `idle` → Button aktiv, kein Fortschrittsbalken
- `uploading` → Button disabled, Progressbar erscheint
- `done` → Erfolgsmeldung + Collection-Link
- `error` → Fehlermeldung in rot, Button wieder aktiv (Retry möglich)

---

## Fehlerbehandlung

| Fehler | Verhalten |
|---|---|
| Ungültiges JSON | Validierung vor Embedding → SSE `{type:'error'}` sofort |
| Fehlende Pflichtfelder | Validierung pro Eintrag → SSE `{type:'error', entry:'ki1-..'}` |
| Voyage 429 | Automatischer Retry nach 70s Backoff, SSE-Progress pausiert |
| Netzwerkabbruch | SSE bricht ab, letzter Stand bleibt sichtbar, Re-Import ist idempotent |
| Slug-Konflikt | `ON CONFLICT` → Update statt Error; bestehendes Dokument wird ersetzt |

---

## Testing

- **BATS-Unit-Test** (`tests/unit/coaching-json-ingest.bats`): `task coaching:ingest-json` mit einer 3-Einträge-Mini-JSON gegen `ENV=dev` — prüft Collection + Chunks in der DB
- `task test:all` bleibt grün (kein Breaking Change in bestehenden Tests)
- Kein Playwright-E2E-Test (Admin-Upload liegt außerhalb des User-E2E-Scope)

---

## Out of Scope

- Kein Eintrag in `coaching.books` (generische Collection, nicht Coaching-Pipeline-spezifisch)
- Kein Job-Polling-Endpunkt (`/status/[jobId]`) — SSE reicht für die kurze Laufzeit
- Keine Import-History / Job-Tabelle in der DB
- Kein EPUB/DOCX-Support in diesem Ticket
