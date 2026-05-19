---
ticket_id: T000497
status: staged
domains: [website, scripts]
---

# Plan: webcrawl-local-embed

Add local (bge-m3 via llm-router) embedding support to the web crawler.
Currently `ingest-web.mjs` always calls `callVoyage()`, ignoring the
collection's `embedding_model` field. Users have no way to create a
web_crawl collection backed by local embeddings.

## Context

- `knowledge.collections.embedding_model` already stores `'bge-m3'` or
  `'voyage-multilingual-2'` per collection.
- `createCollection()` in `knowledge-db.ts` already accepts
  `embeddingModel` as optional param and defaults based on `LLM_ENABLED`.
- `embeddings.ts` has a working `callRouter()` for bge-m3 via
  `llm-router.workspace.svc.cluster.local:4000`.
- `lib-knowledge-pg.mjs` (used by ingest scripts) has NO local path.
- `WebCrawlSourceModal.svelte` never sends `embeddingModel` to the API.

## Steps

### 1 — `scripts/knowledge/lib-knowledge-pg.mjs`

Add `callRouter(texts, model)` that mirrors `embeddings.ts`:
```
POST ${LLM_ROUTER_URL}/v1/embeddings
{ model, input: texts }
→ j.data[].embedding
```
Handle bad `LLM_ROUTER_URL` (e.g. unexpanded `${LLM_ROUTER_URL}`):
```js
function getRouterUrl() {
  const u = process.env.LLM_ROUTER_URL;
  try { new URL(u); return u; } catch {
    return 'http://llm-router.workspace.svc.cluster.local:4000';
  }
}
```

Update `embedAll(texts, model = 'voyage-multilingual-2', batch = 128)`:
- If `model === 'bge-m3'`: call `callRouter` in batches of 64
- Else: existing `callVoyage` path (batch 128)

### 2 — `scripts/knowledge/ingest-web.mjs`

The DB query at startup already fetches `crawl_config`; extend it to also
select `embedding_model`:
```js
const { name: colName, crawl_config, embedding_model } = colRes.rows[0];
```
Pass `embedding_model` to `embedAll()`:
```js
const embeddings = await embedAll(rawChunks.map(c => c.text), embedding_model);
```

### 3 — `website/src/components/admin/WebCrawlSourceModal.svelte`

Add state:
```ts
let embeddingModel: 'voyage-multilingual-2' | 'bge-m3' = $state('voyage-multilingual-2');
```

Add a `<label>Einbettungsmodell` select with two options:
- `voyage-multilingual-2` → "Voyage (Cloud)"
- `bge-m3` → "Lokal (bge-m3)"

Include in the `collections` POST body:
```js
body: JSON.stringify({ ..., embeddingModel }),
```

### 4 — `website/src/pages/api/admin/knowledge/collections/index.ts`

Read `embeddingModel` from POST body and pass to `createCollection()`:
```ts
const body = ... as { ...; embeddingModel?: 'voyage-multilingual-2' | 'bge-m3' };
...
const c = await createCollection({
  ...
  embeddingModel: body.embeddingModel,  // undefined → auto-detect in knowledge-db.ts
});
```

## Verification

- `task test:all` green
- `task workspace:validate` green
- `task feature:website` deploys both clusters
- Create a test collection with model=bge-m3, trigger crawl, confirm chunk_count > 0
  (requires GPU host reachable on wg-mesh)
- Existing Voyage crawl still works (Openclaw collection)

## Out of scope

- LLM_ENABLED/LLM_ROUTER_URL envsubst issue (T000493) — separate ticket
- korczewski has no GPU host — bge-m3 option will still appear but fail if
  LLM_ROUTER_URL is unreachable; that is acceptable (fails with clear error)
