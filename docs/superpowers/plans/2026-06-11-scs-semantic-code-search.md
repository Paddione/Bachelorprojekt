---
title: Plan: T000628 — Semantic Code Search (SCS)
ticket_id: T000628
domains: [website, db, infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: T000628 — Semantic Code Search (SCS)

**Ticket:** T000628  
**Branch:** feature/scs-semantic-code-search  
**Datum:** 2026-06-11  
**Status:** staged

---

## Ziel

pgvector-basierter Code-Index mit bge-m3 (GPU-Host bereits live), Semantic-Search-API, Graph-Augmented Retrieval (semantisch + Dependency-Hop), automatische Scout-Injektion in die Factory-Pipeline, und inkrementeller Git-Hook für Sub-2s-Reindexierung.

---

## Voraussetzung: pgvector-Check

Vor SCS-1 sicherstellen dass `pgvector` in `shared-db` aktiv ist:

```bash
kubectl exec -n workspace deployment/shared-db -- \
  psql -U postgres -d website -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Falls fehlschlägt: `pgvector` muss als initdb-Script oder Postgres-Image-Flag nachgerüstet werden (Taskfile-Task `db:enable-pgvector`).

---

## Design-Injektion (Industrial/Loft)

SCS ist primär Backend. Die einzige Admin-UI ist das Suchergebnis-Panel in `DetailPanel.svelte` (T000598) — dort werden `suggested_files` aus SCS-4 angezeigt:

| Token | Verwendung |
|-------|-----------|
| `--ff-surface` | Suchergebnis-Card Hintergrund in DetailPanel |
| `--ff-amber` | Score-Indikator (> 0.85 = amber, hohe Relevanz) |
| `--ff-green` | Score > 0.9 (sehr hohe Relevanz) |
| `--ff-muted` | Score < 0.7 (niedrige Relevanz, gedimmt) |
| `--ff-border` | Separator zwischen Suchergebnissen |
| Monospace | Dateipfade, Snippet-Preview, Score-Badge |

**Suchergebnis-Rendering in `DetailPanel.svelte` (SCS-4 Integration):**
```svelte
{#if detail.suggested_files?.length}
  <section class="suggested-files">
    <h4 style="font-family: monospace; color: var(--ff-muted)">Semantisch verwandte Dateien</h4>
    {#each detail.suggested_files as f}
      <div class="file-result" style="background: var(--ff-surface); border-left: 3px solid {scoreColor(f.score)}">
        <code style="color: var(--ff-amber)">{f.path}</code>
        <span class="score-badge" style="color: var(--ff-muted)">{(f.score * 100).toFixed(0)}%</span>
        <pre style="font-size: 11px; color: var(--ff-muted)">{f.snippet}</pre>
      </div>
    {/each}
  </section>
{/if}
```

---

## Architektur

### Neue Dateien

```
scripts/index-repo.ts                            # Code-Chunker + Embedding-Indexer
scripts/index-repo-incremental.sh               # post-commit Hook (git diff → nur geänderte Dateien)
website/src/pages/api/codesearch.ts             # GET /api/codesearch?q=<query> (Admin)
website/src/lib/codesearch-db.ts                # pgvector-Queries, Graph-Augmented-Hop
.githooks/post-commit-index                     # Inkrementeller Re-Index nach Commit
```

### Geänderte Dateien

```
scripts/factory/pipeline.js                     # SCS-4: Scout injiziert suggested_files
website/src/components/factory/DetailPanel.svelte  # SCS-4: suggested_files anzeigen
website/src/lib/factory-floor.ts                # HallItem + TicketDetail um suggested_files erweitern
Taskfile.yml                                    # task scs:index, task scs:search
```

### Nicht geändert

- `k3d/` Manifeste (GPU-Host bereits live, kein neues Deployment nötig)
- `environments/schema.yaml` (kein neuer Env-Var nötig, `LLM_GATEWAY_EMBED` bereits vorhanden)

---

## Sub-Ticket-Breakdown

### SCS-1: Code-Embedding-Index — bge-m3 Chunking + pgvector (T000637)

**Depends on:** —

**Ziel:** `scripts/index-repo.ts` chunked TS/Svelte/Astro/YAML-Dateien, embeddet via GPU-Host (`llm-gateway-embed:8081` / `LLM_GATEWAY_EMBED`), speichert Chunks + Embeddings in Postgres `pgvector`. Inkrementell per Datei-Hash.

**DB-Schema:**
```sql
CREATE TABLE IF NOT EXISTS code_embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path    TEXT NOT NULL,
  chunk_index  INT NOT NULL,
  content      TEXT NOT NULL,
  file_hash    TEXT NOT NULL,       -- SHA256 des Datei-Inhalts
  embedding    vector(1024),        -- bge-m3 Dimension
  indexed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(file_path, chunk_index)
);
CREATE INDEX ON code_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Chunking-Strategie:**
- TS/Svelte/Astro: je Funktion/Komponente (max 512 Tokens), Overlap 64 Tokens
- YAML: je Top-Level-Key (Manifest-Ressource)
- Ignoriert: `node_modules/`, `dist/`, `k3d/docs-content-built/`, `*.lock`

**Tasks:**
- [ ] `pgvector`-Extension sicherstellen (siehe Voraussetzung oben)
- [ ] `scripts/index-repo.ts` schreiben: `glob` + chunking + `fetch(LLM_GATEWAY_EMBED/embed)` + `upsert` per `file_hash`
- [ ] `task scs:index` in `Taskfile.yml` (ruft `npx tsx scripts/index-repo.ts`)
- [ ] Smoke-Test: nach Ausführen min. 500 Rows in `code_embeddings`
- [ ] BATS-Test: `tests/unit/scs-index.bats` — prüft Schema + Row-Count + Vektor-Dimension

---

### SCS-2: Semantic-Search-API — `/api/codesearch` (T000638)

**Depends on:** SCS-1 (T000637)

**Ziel:** `GET /api/codesearch?q=<query>&limit=5` nimmt natürlichsprachige Query, embeddet sie via bge-m3, führt pgvector-Ähnlichkeitssuche durch, gibt Top-K Dateipfade + Snippets + Score zurück. Auth: Admin.

**Response-Format:**
```json
{
  "query": "authentication middleware",
  "results": [
    {
      "path": "website/src/lib/auth.ts",
      "score": 0.91,
      "snippet": "export async function requireAuth(request: Request) { ...",
      "chunk_index": 0
    }
  ]
}
```

**Tasks:**
- [ ] `website/src/lib/codesearch-db.ts`: `searchCode(query: string, limit: number)` — embed query → `SELECT ... ORDER BY embedding <=> $1 LIMIT $2`
- [ ] `GET /api/codesearch.ts`: Query-Param `q` validieren, `requireAdmin` guard, `searchCode` aufrufen
- [ ] Error-Handling: GPU-Host down → 503 mit `{"error": "embedding service unavailable"}` (kein silent fallback)
- [ ] BATS-Test: `tests/unit/scs-search.bats` — mockt pgvector-Query, prüft Response-Format

---

### SCS-3: Graph-Augmented Retrieval — semantisch + Dependency-Hop (T000639)

**Depends on:** SCS-2 (T000638)

**Ziel:** Erweitert SCS-2 um 1-Hop im Import/Dependency-Graph: nach initialem Embedding-Match werden direkte Importer und Importees des gefundenen Files einbezogen. `?q=authentication+flow` findet auch alle Auth-Helper die von `auth.ts` importiert werden.

**Dependency-Graph (statisch):**
```ts
// In scripts/index-repo.ts beim Indexieren mitbauen:
// import/export-Analyse via esbuild-Metafile oder Regex
// Speichern in: file_dependencies (from_path, to_path)
```

**DB-Ergänzung:**
```sql
CREATE TABLE IF NOT EXISTS file_dependencies (
  from_path TEXT NOT NULL,
  to_path   TEXT NOT NULL,
  PRIMARY KEY (from_path, to_path)
);
```

**Augmented-Query:**
```ts
const initial = await searchCode(query, 5);
const neighbors = await db.query(
  `SELECT DISTINCT to_path FROM file_dependencies WHERE from_path = ANY($1)
   UNION SELECT from_path FROM file_dependencies WHERE to_path = ANY($1)`,
  [initial.map(r => r.path)]
);
// neighbors ohne Score werden mit score=0.7 angehängt (suboptimal aber relevant)
```

**Tasks:**
- [ ] Import-Analyse in `scripts/index-repo.ts` ergänzen → `file_dependencies` befüllen
- [ ] `codesearch-db.ts`: `searchCodeAugmented()` mit 1-Hop-Nachbarn
- [ ] `GET /api/codesearch?augmented=true` — Default: `false` (rückwärtskompatibel)
- [ ] BATS-Test: prüft dass Augmented-Query mehr Results zurückgibt als einfache Query

---

### SCS-4: Scout-Phase-Injektion — Factory konsultiert Code-Index automatisch (T000640)

**Depends on:** SCS-1 (T000637), SCS-2 (T000638)

**Ziel:** Factory's Scout-Phase in `scripts/factory/pipeline.js` ruft `GET /api/codesearch?q=<ticket-title>&limit=5` auf und injiziert die Top-5 Dateipfade als `suggested_files` in den Scout-Output. Löst das `touched_files: 0`-Problem bei schwachen Modellen.

**Pipeline-Integration:**
```js
// In Scout-Phase, nach ticket-fetch:
let suggestedFiles = [];
try {
  const res = await fetch(`${BASE_URL}/api/codesearch?q=${encodeURIComponent(ticket.title)}&limit=5`, 
    { headers: { Cookie: adminCookie } });
  if (res.ok) suggestedFiles = (await res.json()).results;
} catch { /* SCS down → graceful degradation, Scout läuft trotzdem */ }

const scoutPrompt = `... Ticket: ${ticket.title}
${suggestedFiles.length ? `\nRelevante Dateien (semantisch):\n${suggestedFiles.map(f => `- ${f.path} (${(f.score*100).toFixed(0)}%)`).join('\n')}` : ''}`;
```

**Hinweis:** SCS ist der einzige Ort wo ein `try/catch`-Fallback sinnvoll ist — Scout soll funktionieren auch wenn GPU-Host kurz down ist. Der Fallback ist kein stilles Scheitern, sondern explizit dokumentiert im Scout-Output.

**DetailPanel-Integration (Design):**
- `suggested_files` in `TicketDetail` Interface ergänzen
- `DetailPanel.svelte`: Sektion „Semantisch verwandte Dateien" mit factory-token Styling (siehe oben)
- Score-Farbskala: ≥ 0.9 → `--ff-green`, ≥ 0.75 → `--ff-amber`, < 0.75 → `--ff-muted`

**Tasks:**
- [ ] `pipeline.js`: SCS-Query vor Scout-Prompt einbauen (try/catch mit log)
- [ ] `website/src/lib/factory-floor.ts`: `TicketDetail.suggested_files?: Array<{path, score, snippet}>` ergänzen
- [ ] `website/src/pages/api/factory-floor/[id].ts` (Detail-API): SCS-Query einbauen
- [ ] `DetailPanel.svelte`: suggested_files Sektion hinzufügen
- [ ] E2E-Test: `tests/e2e/fa-scs-scout.spec.ts` — öffnet Detail-Panel eines Tickets, prüft `suggested-files`-Sektion

---

### SCS-5: Freshness-Invalidierung — inkrementeller Git-Hook (T000641)

**Depends on:** SCS-1 (T000637)

**Ziel:** `post-commit` Hook ruft `scripts/index-repo-incremental.sh` nur für `git diff --name-only HEAD` auf. Ziel: < 2 s Reindexierungszeit pro Commit.

**Hook-Script:**
```bash
#!/bin/bash
# .githooks/post-commit-index
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -E '\.(ts|svelte|astro|yaml|yml)$')
if [[ -n "$CHANGED" ]]; then
  echo "[SCS] Reindexing ${#CHANGED[@]} changed files..."
  echo "$CHANGED" | xargs -I{} npx tsx scripts/index-repo.ts --file {} 2>/dev/null &
  # Async — blockiert den Commit nicht
fi
```

**Tasks:**
- [ ] `scripts/index-repo.ts`: `--file <path>` Flag für Single-File-Reindex
- [ ] `scripts/index-repo-incremental.sh` schreiben
- [ ] `task secrets:install-hooks` erweitern um Post-Commit-Index-Hook (neben existierendem pre-commit)
- [ ] Performance-Test: Single-File-Reindex < 2 s (bge-m3 Latenz ~300 ms + DB-Upsert)
- [ ] BATS-Test: prüft dass Hook nur geänderte Dateien reindexiert

---

## Implementierungs-Reihenfolge

```
SCS-1 → SCS-2 → SCS-3
SCS-1 + SCS-2 → SCS-4
SCS-1 → SCS-5
```

SCS-3, SCS-4, SCS-5 können parallel nach SCS-1+2.

---

## Verifikation

### Lokal

```bash
# pgvector prüfen
kubectl exec -n workspace deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT extname FROM pg_extension WHERE extname='vector';"

# Index aufbauen
task scs:index
kubectl exec -n workspace deployment/shared-db -- \
  psql -U postgres -d website -c "SELECT COUNT(*) FROM code_embeddings;"  # > 500

# Search testen
curl "http://localhost:4321/api/codesearch?q=authentication+middleware" | jq '.results[0]'

# Factory Scout mit SCS
# → Detail-Panel öffnen → "Semantisch verwandte Dateien" Sektion sichtbar

task test:all
```

### CI

```bash
task test:all           # BATS + Vitest
task workspace:validate
```

### Akzeptanzkriterien

- [ ] `pgvector`-Extension aktiv in `shared-db`
- [ ] `code_embeddings` > 500 Rows nach `task scs:index`
- [ ] `GET /api/codesearch?q=auth` gibt mind. 3 relevante Dateien zurück (Score > 0.7)
- [ ] Augmented-Query liefert mehr Results als einfache Query für denselben Term
- [ ] Factory Scout-Output enthält `suggested_files` für bekannte Tickets
- [ ] `DetailPanel.svelte`: suggested_files Sektion mit Dark-Background + Score-Farben
- [ ] Post-Commit-Hook reindexiert geänderte Dateien in < 2 s
- [ ] GPU-Host down → Scout läuft weiter (kein Absturz), log-Hinweis im Scout-Output
- [ ] `task test:all` grün
