---
ticket_id: T000479
title: Context7 Knowledge Ingest — Implementation Plan
domains: []
status: active
pr_number: null
---

# Context7 Knowledge Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index documentation for 10 key project libraries (from the context7 MCP) into the pgvector knowledge system, so coding agents can RAG-query up-to-date library docs alongside existing PR history, specs, and bug tickets.

**Architecture:**
- New `source` value `context7_docs` added to the `knowledge.collections` CHECK constraint
- New `scripts/knowledge/ingest-context7.mjs` that fetches markdown from `https://context7.com/api/v1/{libraryId}?tokens=20000` and ingests it with a markdown-aware chunker (split at `##`/`###` headers, not plain text)
- New `knowledge:seed-context7` Taskfile task: port-forwards shared-db, creates the 10 collections (idempotent), runs ingest for each
- `CollectionSource` TypeScript type updated in `website/src/lib/knowledge-db.ts`

**Why markdown chunking matters:** context7 returns structured markdown with H2/H3 section headers. Splitting at header boundaries keeps each chunk topically coherent (e.g. "Room.connect() options" stays together), producing far better RAG recall than the existing `chunkPlain` (which cuts at arbitrary character boundaries).

---

## Library Seed List

| Library | context7 ID | Benchmark | Snippets |
|---------|-------------|-----------|---------|
| Astro | `/withastro/docs` | 85.67 | 2711 |
| Svelte | `/sveltejs/svelte` | — | — |
| Playwright | `/microsoft/playwright` | — | — |
| Keycloak | `/keycloak/keycloak-documentation` | — | — |
| LiveKit | `/websites/livekit_io` | 80.92 | 39K |
| Kubernetes | `/kubernetes/website` | — | — |
| SealedSecrets | `/bitnami-labs/sealed-secrets` | 82.25 | 626 |
| Anthropic SDK (TS) | `/anthropic-ai/anthropic-sdk-typescript` | — | — |
| pgvector | `/pgvector/pgvector` | — | — |
| Taskfile (go-task) | `/go-task/task` | — | — |

> IDs that show `—` are well-known slugs; the ingest script validates at runtime (404 → skip + warn).

---

## File Map

| Action | Path |
|--------|------|
| Create | `scripts/one-shot/20260519-context7-source.sql` |
| Create | `scripts/knowledge/ingest-context7.mjs` |
| Modify | `website/src/lib/knowledge-db.ts` |
| Modify | `Taskfile.yml` |

---

## Implementation Steps

- [x] **Step 1 — SQL migration** (`scripts/one-shot/20260519-context7-source.sql`)
  - Drop `collections_source_check` and re-add with `context7_docs` appended
  - Also add `crawl_config` idempotently (may already exist)
  - Header comment: run on BOTH clusters after deploy

- [x] **Step 2 — TypeScript type** (`website/src/lib/knowledge-db.ts`)
  - Add `'context7_docs'` to the `CollectionSource` union type
  - No other changes needed (the type flows into `createCollection` / `listCollections` automatically)

- [x] **Step 3 — Ingest script** (`scripts/knowledge/ingest-context7.mjs`)

  Required env vars:
  - `COLLECTION_ID` — UUID of target collection
  - `LIBRARY_ID` — context7 library ID (e.g. `/withastro/docs`)
  - `PGURL` — full postgres connection string
  - `VOYAGE_API_KEY` or `LLM_ENABLED=true` for embeddings

  Algorithm:
  1. `GET https://context7.com/api/v1${LIBRARY_ID}?tokens=20000` — raw markdown response
  2. `chunkMarkdown(text)` — split at `\n## ` and `\n### ` boundaries; if a section > 1200 chars, sub-chunk at paragraph breaks; prepend the section header to each sub-chunk for context
  3. Embed all chunks via existing `embedAll()` from `lib-knowledge-pg.mjs`
  4. `upsertDocumentAndChunks()` — one document per library, `source_uri = https://context7.com${LIBRARY_ID}`
  5. `bumpCollectionStats()`

  Error handling:
  - 404 from context7 API → exit 0 with warning (don't fail the seed loop)
  - Empty response (<200 chars) → same
  - Embed failure → exit 1 (propagate so caller can retry)

- [x] **Step 4 — Taskfile tasks** (add to `Taskfile.yml` after `knowledge:crawl`)

  ```
  knowledge:seed-context7:
    desc: "Create + ingest all 10 context7 library collections (ENV=mentolder|korczewski)"
  ```

  The task:
  1. Port-forwards `shared-db` to `localhost:5432` (same pattern as `knowledge:crawl`)
  2. Runs the SQL migration (idempotent)
  3. For each of the 10 libraries: INSERT collection ON CONFLICT DO NOTHING, then calls `ingest-context7.mjs`
  4. Prints a summary table of chunk counts on completion

  Also add:
  ```
  knowledge:ingest-context7:
    desc: "Ingest a single context7 library (LIBRARY_ID=/org/repo COLLECTION_ID=<uuid> ENV=...)"
  ```
  For ad-hoc re-ingestion of a single library without recreating all 10.

- [x] **Step 5 — Verification**
  - `task test:all` → green (TS type change is additive; no test touches `CollectionSource` enum)
  - `task knowledge:seed-context7 ENV=mentolder` — dry-run check: confirm port-forward connects, SQL runs, at least one ingest succeeds (Astro or SealedSecrets as smoke test)

---

## Post-Deploy

Apply the SQL migration to both clusters:
```bash
task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260519-context7-source.sql
task workspace:psql ENV=korczewski -- website < scripts/one-shot/20260519-context7-source.sql
```

Then seed:
```bash
task knowledge:seed-context7 ENV=mentolder
task knowledge:seed-context7 ENV=korczewski
```

No rollout needed — the ingest runs locally via port-forward.

---

## Not In Scope

- A scheduled CronJob for weekly re-ingestion (future work; can be added once the collections exist)
- A UI toggle in `/admin/knowledge` for context7 collections (collections are visible there already via `listCollections`)
- Ingesting context7 docs directly from within the cluster (no Ingress for context7 → keep it as a local-run script)
