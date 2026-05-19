---
ticket_id: T000053
status: active
domains: [website, scripts]
---

# Plan: Wire context7_docs as first-class pgvector ingest source

## Context

`scripts/knowledge/ingest-context7.mjs` and the `context7_docs` CollectionSource type already
exist. What's missing is the admin surface to use them:
- No API trigger endpoint (like crawl.ts does for web_crawl)
- No way to store the libraryId config on the collection
- `deleteCollection` guards against context7_docs
- `reindex.sh` has no context7 case

The `crawl_config` JSONB column is reused to store `{ libraryId, tokens }` for
context7_docs collections — no migration needed.

## Tasks

### 1. knowledge-db.ts — Context7Config type + updateContext7Config + deleteCollection fix

File: `website/src/lib/knowledge-db.ts`

- Add `Context7Config` interface: `{ libraryId: string; tokens?: number }`
- Extend `Collection` type: `context7_config: Context7Config | null` (read from `crawl_config`
  when source is `context7_docs` — same DB column, different shape)
- Add `updateContext7Config(id: string, config: Context7Config): Promise<void>` — writes to
  `crawl_config` column
- Fix `deleteCollection`: add `'context7_docs'` to the allowed sources guard

### 2. New API endpoint: context7-config.ts (PATCH)

File: `website/src/pages/api/admin/knowledge/collections/[id]/context7-config.ts`

Mirrors `crawl-config.ts` but for `context7_docs` source:
- Validates `source === 'context7_docs'`
- Requires `libraryId` (non-empty string, must start with `/`)
- Optional `tokens` (positive int, default 20000)
- Calls `updateContext7Config`

### 3. New API endpoint: context7.ts (POST + GET)

File: `website/src/pages/api/admin/knowledge/collections/[id]/context7.ts`

Mirrors `crawl.ts` exactly, but:
- Validates `source === 'context7_docs'`
- Reads `libraryId` + `tokens` from `crawl_config` (via getCollection)
- Spawns `node scripts/knowledge/ingest-context7.mjs` with env:
  `COLLECTION_ID`, `LIBRARY_ID`, `TOKENS`, `PGURL`, `VOYAGE_API_KEY`, `LLM_ENABLED`, etc.
- Module-level `activeIngests` Set for deduplication
- GET returns `{ running: boolean }`

### 4. reindex.sh — add context7 case

File: `scripts/knowledge/reindex.sh`

Add `context7` case: query DB for all `context7_docs` collections, loop and run
`ingest-context7.mjs` per collection with `COLLECTION_ID` + `LIBRARY_ID` + `TOKENS` from
`crawl_config`. Update `all` case to include `run_context7`.

### 5. Taskfile.yml — update knowledge:reindex desc

Add `context7` to the `SOURCE=` doc string on the `knowledge:reindex` task.

## Verification

```bash
task test:all                        # offline tests must stay green
task workspace:validate              # no manifest changes, should pass trivially
# Manual smoke:
# POST /api/admin/knowledge/collections/<uuid>/context7-config { libraryId: '/withastro/docs' }
# POST /api/admin/knowledge/collections/<uuid>/context7
# Check collection chunk_count increases in admin UI
```

## Out of scope

- Admin UI changes (the existing collections page already has a "Crawl" trigger button
  pattern; a follow-up can add a "Sync" button for context7_docs in the same pass)
- context7 MCP `query-docs` integration (separate concern)
