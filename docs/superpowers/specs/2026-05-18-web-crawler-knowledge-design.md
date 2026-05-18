# Web-Crawler Knowledge Integration — Design Spec

**Date:** 2026-05-18  
**Branch:** feature/web-crawler-knowledge  
**Status:** approved

---

## Overview

Extend the knowledge RAG pipeline to ingest external documentation websites as vectorized knowledge collections. Users configure a start URL (with optional path prefix), trigger crawling manually from the admin UI, and the crawled pages are stored in the existing `knowledge.documents`/`chunks`/`collections` schema — queryable identically to built-in sources.

Simultaneously, the `knowledge-reindex` skill is updated to document the web crawl workflow.

---

## 1. Data Model Changes

### 1a. `knowledge.collections.source` constraint

Add `'web_crawl'` to the existing CHECK constraint:

```sql
ALTER TABLE knowledge.collections
  DROP CONSTRAINT collections_source_check;

ALTER TABLE knowledge.collections
  ADD CONSTRAINT collections_source_check
    CHECK (source = ANY (ARRAY[
      'pr_history', 'specs_plans', 'claude_md', 'bug_tickets', 'custom', 'web_crawl'
    ]));
```

### 1b. `crawl_config` JSONB column

```sql
ALTER TABLE knowledge.collections
  ADD COLUMN crawl_config JSONB;
```

Only populated when `source = 'web_crawl'`. Shape:

```json
{
  "start_url": "https://docs.langchain.com/",
  "path_prefix": "/api/",
  "max_pages": 500
}
```

- `start_url` — required, absolute URL
- `path_prefix` — optional, restricts crawling to URLs starting with this path
- `max_pages` — optional, default 500, safety cap

### 1c. TypeScript type

Add `'web_crawl'` to `CollectionSource` in `website/src/lib/knowledge-db.ts`:

```ts
export type CollectionSource = 'pr_history' | 'specs_plans' | 'claude_md' | 'bug_tickets' | 'custom' | 'web_crawl';
```

`createCollection()` accepts an optional `crawlConfig` parameter that is stored in `crawl_config`. `listCollections()` and `getCollection()` return the new column.

---

## 2. Crawler Script

**File:** `scripts/knowledge/ingest-web.mjs`

**Invocation:**
```bash
COLLECTION_ID=<uuid> PGURL=postgres://... node scripts/knowledge/ingest-web.mjs
```

**Dependencies (added to repo-level package.json or as inline imports):**
- `cheerio` — HTML parsing and text extraction
- `node-fetch` (or native `fetch` in Node 18+) — HTTP
- Existing `lib-knowledge-pg.mjs` for DB operations and embedding

**Algorithm:**

1. Load `crawl_config` for `COLLECTION_ID` from DB. Fail fast if missing or `start_url` empty.
2. **Sitemap-first discovery:**
   - Fetch `<start_url>/sitemap.xml` (and `<start_url>/sitemap_index.xml`)
   - Parse `<loc>` entries, filter by `path_prefix` if set
   - If sitemap yields ≥1 URL → use that list
3. **Fallback — recursive link-following:**
   - Start queue with `[start_url]`
   - Fetch each URL, extract `<a href>` links on the same origin matching `path_prefix`
   - Max depth 4, max `max_pages` unique URLs
4. **Per page:**
   - HTTP GET with `User-Agent: mentolder-knowledge-bot/1.0`
   - Parse with cheerio
   - Extract main content: try selectors `main`, `article`, `[role=main]`, `.content`, `.docs-content`, `.md-content` in priority order; fall back to `body`
   - Strip `nav`, `header`, `footer`, `aside`, `.sidebar`, `script`, `style`
   - `rawText` = extracted text
   - `title` = `<title>` tag or first `<h1>`
   - `sourceUri` = absolute page URL
   - Skip pages with < 100 characters of extracted text
   - Respect `robots.txt` — parse once at crawl start, skip disallowed URLs
5. Chunk via `chunkPlain()`, embed, `upsertDocumentAndChunks()` — identical to existing ingest scripts
6. `bumpCollectionStats()` after all pages done

**Error handling:**
- Timeout 10s per page, skip on timeout
- HTTP 4xx/5xx → skip page, log warning
- 0 pages successfully crawled → exit code 1 (prevents empty collection)

---

## 3. Taskfile Task

```yaml
knowledge:crawl:
  desc: "Crawl a web knowledge source. Args: -- <collection_id> [ENV=mentolder]"
  vars:
    ENV: '{{.ENV | default "dev"}}'
  cmds:
    - |
      source scripts/env-resolve.sh "{{.ENV}}"
      COLLECTION_ID="{{.CLI_ARGS}}"
      # port-forward shared-db identical to knowledge:reindex
      kubectl ... port-forward svc/shared-db 5432:5432 &
      PF=$!; trap 'kill $PF' EXIT; sleep 3
      PGURL="postgres://website:${WEBSITE_DB_PASSWORD}@localhost:5432/website" \
        COLLECTION_ID="$COLLECTION_ID" \
        node scripts/knowledge/ingest-web.mjs
```

---

## 4. API Endpoints

### `POST /api/admin/knowledge/collections` (extended)

Existing endpoint now accepts `source: 'web_crawl'` and `crawlConfig: { startUrl, pathPrefix?, maxPages? }`. Stores in `crawl_config` column.

### `POST /api/admin/knowledge/collections/[id]/crawl`

Triggers crawl for a `web_crawl` collection:

```ts
// Auth: admin only
// Returns 403 if collection.source !== 'web_crawl'
// Returns 409 if crawl already running (tracked via in-memory Set per process)
// Spawns: child_process.spawn('node', ['scripts/knowledge/ingest-web.mjs'], { env: { COLLECTION_ID, PGURL } })
// Returns 202 immediately
```

Fire-and-forget: the API responds immediately, the crawl runs in background. The admin UI polls `chunk_count` / `last_indexed_at` to detect completion (or the user manually refreshes).

### `DELETE /api/admin/knowledge/collections/[id]` (extended)

Currently only allows `source === 'custom'`. Extend to also allow `source === 'web_crawl'`.

### `PATCH /api/admin/knowledge/collections/[id]/crawl-config`

Updates `crawl_config` (start_url, path_prefix, max_pages) for a `web_crawl` collection.

---

## 5. Admin UI (`/admin/wissensquellen`)

**Changes to `website/src/pages/admin/wissensquellen.astro`:**

- Header area: two buttons — **„+ Neue Web-Quelle"** (green-tinted) and **„+ Neue Wissensquelle"** (existing grey)
- „Eigene Sammlungen" table gains a **Typ** column with badges:
  - `web` — green badge for `web_crawl` collections
  - `manuell` — grey badge for `custom` collections
- `web_crawl` rows show:
  - Start-URL displayed as short hostname (full URL on hover/title)
  - **„▶ Crawl starten"** button (green) → `POST .../crawl`
  - **„Löschen"** button (red)
  - No „Re-index" (only built-in collections have that)
- `custom` rows unchanged

**New modal component `WebCrawlSourceModal.svelte`:**

Fields:
- **Name** (text, required)
- **Start-URL** (url input, required, placeholder `https://docs.example.com/`)
- **Pfad-Präfix** (text, optional, placeholder `/docs/`)
- **Max. Seiten** (number, optional, default 500)

On submit: `POST /api/admin/knowledge/collections` with `source: 'web_crawl'` + `crawlConfig`.

**„▶ Crawl starten" UX:**
- Button shows spinner while `POST .../crawl` is in-flight (202 response)
- After 202: button text becomes „Läuft…" and is disabled
- Simple polling every 5s on `chunk_count` to detect when crawl finishes (or user refreshes manually)

---

## 6. Skill Update (`knowledge-reindex`)

Add new section **„Web-Quellen crawlen"** before the existing „Phase 1: Pre-checks":

```markdown
## Web-Quellen (web_crawl collections)

Web-Sammlungen werden über die Admin-UI angelegt und manuell gecrawlt.

### Anlegen
1. `/admin/wissensquellen` → „+ Neue Web-Quelle"
2. Name, Start-URL, optionaler Pfad-Präfix eingeben
3. „Erstellen" → Collection mit `source=web_crawl` wird angelegt

### Crawl anstoßen
- Admin-UI: „▶ Crawl starten" in der Tabelle
- CLI-Fallback: `task knowledge:crawl -- <collection_id> ENV=mentolder`

### Pre-checks vor Crawl
- Start-URL erreichbar: `curl -I <start_url>`
- Embedding-Service verfügbar (wie Phase 1 der bestehenden Skill-Doku)
- `robots.txt` konsultieren: crawler respektiert Disallow-Regeln automatisch

### Failure handling
| Symptom | Ursache | Behebung |
|---|---|---|
| 0 Seiten gecrawlt | Start-URL nicht erreichbar oder robots.txt blockiert alles | URL prüfen, ggf. path_prefix anpassen |
| Chunk-Anzahl sehr niedrig | Hauptinhalt-Selektor trifft nicht | sourceUri in documents prüfen, raw_text kontrollieren |
| Crawl hängt | Viele langsame Seiten, 10s-Timeout pro Seite | max_pages reduzieren |
```

---

## 7. Files to Create / Modify

| File | Change |
|---|---|
| `scripts/knowledge/ingest-web.mjs` | **New** — sitemap-first web crawler |
| `scripts/knowledge/reindex.sh` | Extend with `web` source case |
| `website/src/lib/knowledge-db.ts` | Add `'web_crawl'` to type + `crawlConfig` to createCollection/listCollections |
| `website/src/pages/admin/wissensquellen.astro` | Extend with Typ-column, two create buttons, crawl triggers |
| `website/src/components/admin/WebCrawlSourceModal.svelte` | **New** — modal for web source creation |
| `website/src/pages/api/admin/knowledge/collections/index.ts` | Accept `web_crawl` + `crawlConfig` on POST |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl.ts` | **New** — fire-and-forget crawl trigger |
| `website/src/pages/api/admin/knowledge/collections/[id]/crawl-config.ts` | **New** — PATCH crawl config |
| `website/src/pages/api/admin/knowledge/collections/[id]/index.ts` | Extend DELETE to allow `web_crawl` |
| `Taskfile.yml` | Add `knowledge:crawl` task |
| `db/migrations/` | Migration: add `web_crawl` to source CHECK + `crawl_config` column |
| `.claude/skills/knowledge-reindex/SKILL.md` | Add web crawl section |

---

## 8. Out of Scope

- Scheduled/automatic crawling (manual only)
- JavaScript-rendered docs (no Playwright — covers 99% of SSG doc sites)
- Per-page recrawl delta detection (full recrawl each time, dedup via sha256)
- Cross-cluster crawl fan-out (run manually per cluster)
