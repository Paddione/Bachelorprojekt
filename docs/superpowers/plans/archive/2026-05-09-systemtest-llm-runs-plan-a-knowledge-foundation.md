---
title: Knowledge Foundation — Implementation Plan (Plan A of 3)
domains: [db, website, test, ops]
status: active
pr_number: null
---

# Knowledge Foundation — Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a pgvector-backed knowledge layer with four built-in collections (PR history, specs+plans, CLAUDE.md, bug tickets) and a CRUD UI for user-defined custom collections, ready to feed Plan B's LLM walker.

**Architecture:** New `knowledge.{collections,documents,chunks}` schema in shared-db (already on the pgvector image). Voyage-multilingual-2 embeddings client and a markdown-aware chunker live in `website/src/lib/`. Four Kubernetes CronJobs ingest the built-ins on a schedule; one Astro admin page (`/admin/wissensquellen`) plus a Svelte modal (`KnowledgeSourceModal`) handles custom-collection CRUD. Plans B and C will reuse `knowledge-db.ts` + `embeddings.ts` directly.

**Tech Stack:** PostgreSQL 16 + pgvector 0.8.0 (in-place); Astro 4 + Svelte 5 + TypeScript; Voyage AI HTTP API; Node 20 ingestion scripts; Kubernetes CronJobs; vitest for unit; Playwright for E2E.

**Reference spec:** `docs/superpowers/specs/2026-05-09-systemtest-llm-runs-design.md` (sections 4, 6.4, 6.5, 7, 8.1, 9, 10).

**Out of scope (Plan A):** Anything walker-related, run model, parent-run page. Those land in Plans B and C.

---

## File Structure

**Created:**
- `website/src/lib/embeddings.ts` — voyage-multilingual-2 client (one query at a time + batch); retry/backoff; cost accounting helper
- `website/src/lib/embeddings.test.ts` — vitest unit tests
- `website/src/lib/chunking.ts` — markdown-aware splitter (~600 tokens, 100 overlap, H2/H3 boundary preference)
- `website/src/lib/chunking.test.ts` — vitest unit tests
- `website/src/lib/knowledge-db.ts` — typed helpers: `listCollections`, `getCollection`, `createCollection`, `deleteCollection`, `addDocument`, `upsertChunks`, `queryNearest`, `recountChunks`
- `website/src/lib/knowledge-db.test.ts` — vitest unit tests (uses pg-mem)
- `website/src/pages/api/admin/knowledge/collections/index.ts` — `GET` (list) + `POST` (create custom)
- `website/src/pages/api/admin/knowledge/collections/[id]/index.ts` — `GET` (read) + `DELETE` (custom only)
- `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts` — `POST` (add document, inline chunk + embed)
- `website/src/pages/api/admin/knowledge/collections/[id]/reindex.ts` — `POST` (admin-trigger re-index for built-in collections)
- `website/src/pages/admin/wissensquellen.astro` — list page (built-in shown read-only; custom rows editable)
- `website/src/components/admin/KnowledgeSourceModal.svelte` — "+ Neue Wissensquelle" modal, shared by wizard (Plan C) and management page
- `scripts/knowledge/lib-knowledge-pg.mjs` — shared `pg` Pool + chunk-upsert helper for the three ingestion scripts
- `scripts/knowledge/ingest-prs.mjs` — pulls new rows from `bachelorprojekt.features`
- `scripts/knowledge/ingest-markdown.mjs` — walks `docs/superpowers/{specs,plans}/*.md` + `CLAUDE.md`; SHA-256 dedupe
- `scripts/knowledge/ingest-bug-tickets.mjs` — pulls new rows from `bugs.bug_tickets`, brand-scoped
- `scripts/knowledge/reindex.sh` — wrapper that picks the right script and runs it via `kubectl exec` against shared-db
- `k3d/knowledge-ingest-cronjob.yaml` — four `CronJob` resources, all pinned to Hetzner nodes
- `tests/e2e/specs/wissensquellen.spec.ts` — happy-path admin E2E (create custom collection → upload doc → see chunk count)

**Modified:**
- `k3d/website-schema.yaml` — add `init-knowledge-schema.sh` + `ensure-knowledge-schema.sh` blocks
- `k3d/shared-db.yaml` — mount the new ensure-script and run it from `postStart`; mount the init-script under `docker-entrypoint-initdb.d`
- `k3d/kustomization.yaml` — include the new CronJob manifest
- `environments/schema.yaml` — add `voyage_api_key` (required) + `anthropic_api_key` (required) entries
- `environments/.secrets/mentolder.yaml` — add real key values (gitignored)
- `environments/.secrets/korczewski.yaml` — add real key values (gitignored)
- `environments/sealed-secrets/mentolder.yaml` — re-sealed via `task env:seal`
- `environments/sealed-secrets/korczewski.yaml` — re-sealed via `task env:seal`
- `Taskfile.yml` — add `knowledge:reindex` task
- `website/package.json` — add `voyageai` (or `@voyageai/sdk` if available; otherwise direct `fetch`); add `pg-mem` as devDep for knowledge-db.test.ts

---

## Task 0 — Branch off main

- [ ] **Step 1: Create feature branch from a clean main**

```bash
cd /home/patrick/Bachelorprojekt
git checkout main
git pull origin main
git checkout -b feature/knowledge-foundation
git status
```

Expected: `On branch feature/knowledge-foundation` · `nothing to commit, working tree clean` (the untracked `docs/drift-reports/2026-05-09-systemtest-mentolder.md` is fine to leave in place — it's evidence from a prior run and unrelated).

---

## Task 1 — Schema: knowledge.* + pgvector extension

**Files:**
- Modify: `k3d/website-schema.yaml`
- Modify: `k3d/shared-db.yaml`

- [ ] **Step 1: Append `init-knowledge-schema.sh` to the ConfigMap**

Open `k3d/website-schema.yaml`. After the closing `EOSQL` of `ensure-bachelorprojekt-schema.sh` (around line 899), add:

```yaml
  init-knowledge-schema.sh: |
    #!/bin/bash
    set -e
    echo "Initializing knowledge schema..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname website <<-'EOSQL'
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE SCHEMA IF NOT EXISTS knowledge AUTHORIZATION website;

      CREATE TABLE IF NOT EXISTS knowledge.collections (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT NOT NULL UNIQUE,
        description     TEXT,
        source          TEXT NOT NULL CHECK (source IN
                          ('pr_history','specs_plans','claude_md','bug_tickets','custom')),
        brand           TEXT,
        chunk_count     INT NOT NULL DEFAULT 0,
        last_indexed_at TIMESTAMPTZ,
        embedding_model TEXT NOT NULL DEFAULT 'voyage-multilingual-2',
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS knowledge.documents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        source_uri    TEXT,
        raw_text      TEXT NOT NULL,
        sha256        TEXT,
        metadata      JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT now(),
        UNIQUE (collection_id, source_uri)
      );

      CREATE TABLE IF NOT EXISTS knowledge.chunks (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id   UUID NOT NULL REFERENCES knowledge.documents(id) ON DELETE CASCADE,
        collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
        position      INT  NOT NULL,
        text          TEXT NOT NULL,
        embedding     VECTOR(1024),
        metadata      JSONB DEFAULT '{}',
        UNIQUE (document_id, position)
      );

      CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON knowledge.chunks
        USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS chunks_collection ON knowledge.chunks (collection_id);
      CREATE INDEX IF NOT EXISTS documents_collection ON knowledge.documents (collection_id);
    EOSQL
    echo "Knowledge schema initialized."
```

- [ ] **Step 2: Append `ensure-knowledge-schema.sh` to the ConfigMap**

Directly after the init block, add the ensure variant — same DDL, `--username "postgres"` (matches the ensure-* convention used by the meetings/bachelorprojekt blocks):

```yaml
  ensure-knowledge-schema.sh: |
    #!/bin/bash
    set -e
    psql -v ON_ERROR_STOP=1 --username "postgres" --dbname website <<-'EOSQL'
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE SCHEMA IF NOT EXISTS knowledge AUTHORIZATION website;

      CREATE TABLE IF NOT EXISTS knowledge.collections (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT NOT NULL UNIQUE,
        description     TEXT,
        source          TEXT NOT NULL CHECK (source IN
                          ('pr_history','specs_plans','claude_md','bug_tickets','custom')),
        brand           TEXT,
        chunk_count     INT NOT NULL DEFAULT 0,
        last_indexed_at TIMESTAMPTZ,
        embedding_model TEXT NOT NULL DEFAULT 'voyage-multilingual-2',
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS knowledge.documents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        source_uri    TEXT,
        raw_text      TEXT NOT NULL,
        sha256        TEXT,
        metadata      JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT now(),
        UNIQUE (collection_id, source_uri)
      );

      CREATE TABLE IF NOT EXISTS knowledge.chunks (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id   UUID NOT NULL REFERENCES knowledge.documents(id) ON DELETE CASCADE,
        collection_id UUID NOT NULL REFERENCES knowledge.collections(id) ON DELETE CASCADE,
        position      INT  NOT NULL,
        text          TEXT NOT NULL,
        embedding     VECTOR(1024),
        metadata      JSONB DEFAULT '{}',
        UNIQUE (document_id, position)
      );

      CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON knowledge.chunks
        USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS chunks_collection ON knowledge.chunks (collection_id);
      CREATE INDEX IF NOT EXISTS documents_collection ON knowledge.documents (collection_id);
    EOSQL
```

- [ ] **Step 3: Wire the ensure-script into `shared-db.yaml` postStart**

Open `k3d/shared-db.yaml`. Find the `postStart` block (around line 187). After the existing line `bash /scripts/ensure-bachelorprojekt-schema.sh || true` (around line 200), add a new line:

```yaml
                    bash /scripts/ensure-knowledge-schema.sh || true
```

- [ ] **Step 4: Mount both new scripts as `subPath` volumes**

In the same file, find the existing volumeMounts block (after `subPath: ensure-bachelorprojekt-schema.sh`, around line 219). Append:

```yaml
            - name: website-schema
              mountPath: /scripts/ensure-knowledge-schema.sh
              subPath: ensure-knowledge-schema.sh
            - name: website-schema
              mountPath: /docker-entrypoint-initdb.d/03-init-knowledge-schema.sh
              subPath: init-knowledge-schema.sh
```

- [ ] **Step 5: Validate kustomize output**

```bash
cd /home/patrick/Bachelorprojekt
kubectl kustomize k3d/ > /tmp/k.out
grep -c 'init-knowledge-schema\|ensure-knowledge-schema' /tmp/k.out
```

Expected: `5` or higher (2 ConfigMap data keys + 2 mountPath entries + 1 postStart command line).

- [ ] **Step 6: Commit**

```bash
git add k3d/website-schema.yaml k3d/shared-db.yaml
git commit -m "feat(db): add knowledge schema + enable pgvector extension"
```

---

## Task 2 — Add VOYAGE + ANTHROPIC API keys to env schema and seal them

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/.secrets/mentolder.yaml`
- Modify: `environments/.secrets/korczewski.yaml`
- Modify: `environments/sealed-secrets/mentolder.yaml` (regenerated)
- Modify: `environments/sealed-secrets/korczewski.yaml` (regenerated)

- [ ] **Step 1: Add the two keys to the schema**

Open `environments/schema.yaml`. Under the `secrets:` map, add (alphabetical order — match existing style):

```yaml
  anthropic_api_key:
    description: "Anthropic API key (Claude Sonnet for systemtest LLM walker, Plan B+)"
    required: true
    pattern: '^sk-ant-[A-Za-z0-9_-]{20,}$'
  voyage_api_key:
    description: "Voyage AI API key (voyage-multilingual-2 embeddings for knowledge collections)"
    required: true
    pattern: '^pa-[A-Za-z0-9_-]{20,}$'
```

- [ ] **Step 2: Add the actual values to both `.secrets/<env>.yaml`**

The user provides these out-of-band (Anthropic console + Voyage dashboard). Place them under the existing `secrets:` block in each env file.

For mentolder (`environments/.secrets/mentolder.yaml`):

```yaml
  anthropic_api_key: "sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  voyage_api_key:    "pa-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

Same shape for `environments/.secrets/korczewski.yaml`. **Do not commit these files** — they are gitignored. Stop and ask the user for the real key values if they are not already on disk.

- [ ] **Step 3: Validate the env files**

```bash
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```

Expected: both pass with the new keys present.

- [ ] **Step 4: Re-seal both envs**

```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

Expected: each updates `environments/sealed-secrets/<env>.yaml` with the two new entries inside the encrypted `data` block.

- [ ] **Step 5: Commit (sealed only)**

```bash
git add environments/schema.yaml environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "feat(secrets): add anthropic + voyage api keys (sealed)"
```

(`environments/.secrets/*` stays gitignored.)

---

## Task 3 — Embeddings client (TDD)

**Files:**
- Create: `website/src/lib/embeddings.ts`
- Create: `website/src/lib/embeddings.test.ts`
- Modify: `website/package.json`

- [ ] **Step 1: Add `pg-mem` as devDep (used by Task 5 too)**

```bash
cd /home/patrick/Bachelorprojekt/website
bun add -D pg-mem
```

- [ ] **Step 2: Write the failing test**

Create `website/src/lib/embeddings.test.ts`:

```ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { embedQuery, embedBatch, costCentsForTokens, ANTHROPIC_FALLBACK_MODEL_DIM } from './embeddings';

const ORIGINAL_FETCH = global.fetch;

describe('embeddings client', () => {
  beforeEach(() => { global.fetch = ORIGINAL_FETCH; });

  test('embedQuery returns a 1024-dim float array on happy path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.01) }], usage: { total_tokens: 12 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const r = await embedQuery('hello world');
    expect(r.embedding).toHaveLength(1024);
    expect(r.tokens).toBe(12);
  });

  test('embedBatch chunks at 128 inputs per request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: Array(128).fill({ embedding: Array(1024).fill(0) }), usage: { total_tokens: 1280 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    const inputs = Array(300).fill('x');
    const out = await embedBatch(inputs);
    expect(out.embeddings).toHaveLength(300);
    expect(fetchMock).toHaveBeenCalledTimes(3);   // 128 + 128 + 44
  });

  test('embedQuery retries on 429 with backoff and finally throws after 4 attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate', { status: 429 }));
    global.fetch = fetchMock;
    await expect(embedQuery('x', { maxAttempts: 4, baseDelayMs: 1 })).rejects.toThrow(/voyage.*429/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('costCentsForTokens uses voyage tariff (~$0.06/M)', () => {
    expect(costCentsForTokens(1_000_000)).toBeCloseTo(6, 0);
  });

  test('ANTHROPIC_FALLBACK_MODEL_DIM is 1024 for voyage-multilingual-2', () => {
    expect(ANTHROPIC_FALLBACK_MODEL_DIM).toBe(1024);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx vitest run src/lib/embeddings.test.ts
```

Expected: all five tests fail with `Cannot find module './embeddings'`.

- [ ] **Step 4: Implement the module**

Create `website/src/lib/embeddings.ts`:

```ts
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export interface EmbedResult { embedding: number[]; tokens: number; }
export interface BatchResult  { embeddings: number[][]; tokens: number; }
export interface EmbedOpts    { maxAttempts?: number; baseDelayMs?: number; signal?: AbortSignal; }

const apiKey = () => {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY is unset');
  return k;
};

async function callVoyage(inputs: string[], inputType: 'query' | 'document', opts: EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.json() as { data: Array<{ embedding: number[] }>; usage: { total_tokens: number } };
      return { embeddings: j.data.map(d => d.embedding), tokens: j.usage.total_tokens };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`voyage ${r.status} ${await r.text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`voyage ${r.status} ${await r.text().catch(() => '')}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('voyage retry exhausted');
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const r = await callVoyage([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    const r = await callVoyage(slice, 'document', opts);
    out.push(...r.embeddings);
    totalTokens += r.tokens;
  }
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bunx vitest run src/lib/embeddings.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/embeddings.ts website/src/lib/embeddings.test.ts website/package.json website/bun.lockb
git commit -m "feat(embeddings): voyage-multilingual-2 client with retry + cost helper"
```

---

## Task 4 — Markdown-aware chunker (TDD)

**Files:**
- Create: `website/src/lib/chunking.ts`
- Create: `website/src/lib/chunking.test.ts`

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/chunking.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { chunkText, approxTokens } from './chunking';

describe('chunkText', () => {
  test('short text → one chunk', () => {
    const out = chunkText('hello world', { targetTokens: 600, overlapTokens: 100 });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('hello world');
    expect(out[0].position).toBe(0);
  });

  test('text longer than target → multiple chunks with overlap', () => {
    const big = ('paragraph. ').repeat(2000);  // ~4000 tokens
    const out = chunkText(big, { targetTokens: 600, overlapTokens: 100 });
    expect(out.length).toBeGreaterThan(5);
    // Adjacent chunks share suffix/prefix
    const tail = out[0].text.split(/\s+/).slice(-20).join(' ');
    expect(out[1].text.startsWith(tail.slice(0, 20))).toBe(true);
  });

  test('markdown with H2 boundaries → splits on heading first', () => {
    const md = '## A\n' + 'foo '.repeat(400) + '\n\n## B\n' + 'bar '.repeat(400);
    const out = chunkText(md, { targetTokens: 600, overlapTokens: 100, mode: 'markdown' });
    // First chunk should contain "## A" but not "## B"
    expect(out[0].text).toContain('## A');
    expect(out[0].text).not.toContain('## B');
    expect(out.some(c => c.text.startsWith('## B'))).toBe(true);
  });

  test('approxTokens ≈ length / 4', () => {
    expect(approxTokens('hello world')).toBeCloseTo(3, 0);
    expect(approxTokens('x'.repeat(400))).toBeCloseTo(100, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx vitest run src/lib/chunking.test.ts
```

Expected: 4/4 fail with `Cannot find module './chunking'`.

- [ ] **Step 3: Implement the chunker**

Create `website/src/lib/chunking.ts`:

```ts
export interface ChunkOpts {
  targetTokens?: number;
  overlapTokens?: number;
  mode?: 'plain' | 'markdown';
}

export interface Chunk { position: number; text: string; }

export function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitOnHeadings(md: string): string[] {
  // Split before each H2/H3, keeping the heading with the following block.
  const parts: string[] = [];
  let buf = '';
  for (const line of md.split('\n')) {
    if (/^##{1,2}\s/.test(line) && buf.length > 0) {
      parts.push(buf);
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.length > 0) parts.push(buf);
  return parts;
}

function splitByTokenBudget(text: string, target: number, overlap: number): Chunk[] {
  const tokens = text.split(/(\s+)/);                // keep whitespace
  const charPerTok = 4;
  const targetChars  = target  * charPerTok;
  const overlapChars = overlap * charPerTok;
  const out: Chunk[] = [];
  let pos = 0;
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    // try to break on whitespace within the last 100 chars
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push({ position: pos++, text: text.slice(cursor, end).trim() });
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}

export function chunkText(text: string, opts: ChunkOpts = {}): Chunk[] {
  const target  = opts.targetTokens  ?? 600;
  const overlap = opts.overlapTokens ?? 100;
  const mode    = opts.mode          ?? 'plain';

  if (approxTokens(text) <= target) {
    return [{ position: 0, text }];
  }

  if (mode === 'markdown') {
    const parts = splitOnHeadings(text);
    const out: Chunk[] = [];
    let pos = 0;
    for (const p of parts) {
      if (approxTokens(p) <= target) {
        out.push({ position: pos++, text: p.trim() });
      } else {
        for (const c of splitByTokenBudget(p, target, overlap)) {
          out.push({ position: pos++, text: c.text });
        }
      }
    }
    return out;
  }

  return splitByTokenBudget(text, target, overlap);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run src/lib/chunking.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/chunking.ts website/src/lib/chunking.test.ts
git commit -m "feat(chunking): markdown-aware splitter with overlap"
```

---

## Task 5 — Knowledge DB helpers (TDD)

**Files:**
- Create: `website/src/lib/knowledge-db.ts`
- Create: `website/src/lib/knowledge-db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `website/src/lib/knowledge-db.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import * as kdb from './knowledge-db';

let pgmem: ReturnType<typeof newDb>;
let pool: any;

beforeAll(async () => {
  pgmem = newDb();
  pgmem.public.none(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.collections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text, source text NOT NULL, brand text,
      chunk_count int NOT NULL DEFAULT 0,
      last_indexed_at timestamptz,
      embedding_model text NOT NULL DEFAULT 'voyage-multilingual-2',
      created_by uuid, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE knowledge.documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id uuid NOT NULL,
      title text NOT NULL, source_uri text, raw_text text NOT NULL,
      sha256 text, metadata jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      UNIQUE (collection_id, source_uri)
    );
    CREATE TABLE knowledge.chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL,
      collection_id uuid NOT NULL,
      position int NOT NULL,
      text text NOT NULL,
      embedding text,        -- pg-mem doesn't have vector; store as serialized string for the test
      metadata jsonb DEFAULT '{}',
      UNIQUE (document_id, position)
    );
  `);
  const { Pool } = pgmem.adapters.createPg();
  pool = new Pool();
  kdb.__setPoolForTests(pool);
});

afterAll(() => pool.end());

beforeEach(async () => {
  await pool.query('TRUNCATE knowledge.chunks, knowledge.documents, knowledge.collections CASCADE');
});

describe('knowledge-db', () => {
  test('createCollection + listCollections round-trip', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'custom', description: 'x' });
    const list = await kdb.listCollections();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(c.id);
  });

  test('addDocument + upsertChunks updates chunk_count', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'custom' });
    const d = await kdb.addDocument({ collectionId: c.id, title: 't', sourceUri: 'paste:1', rawText: 'hi' });
    await kdb.upsertChunks(c.id, d.id, [
      { position: 0, text: 'hi', embedding: Array(1024).fill(0) },
      { position: 1, text: 'ho', embedding: Array(1024).fill(0) },
    ]);
    await kdb.recountChunks(c.id);
    const list = await kdb.listCollections();
    expect(list[0].chunk_count).toBe(2);
  });

  test('deleteCollection refuses non-custom', async () => {
    const c = await kdb.createCollection({ name: 'test', source: 'pr_history' });
    await expect(kdb.deleteCollection(c.id)).rejects.toThrow(/custom/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run src/lib/knowledge-db.test.ts
```

Expected: 3/3 fail.

- [ ] **Step 3: Implement**

Create `website/src/lib/knowledge-db.ts`:

```ts
import { Pool } from 'pg';

let pool: Pool | null = null;
function p(): Pool {
  if (!pool) {
    pool = new Pool({
      host:     process.env.PGHOST     ?? 'shared-db',
      port:     Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'website',
      user:     process.env.PGUSER     ?? 'website',
      password: process.env.PGPASSWORD,
    });
  }
  return pool;
}

export function __setPoolForTests(p: Pool): void { pool = p; }

export type CollectionSource = 'pr_history' | 'specs_plans' | 'claude_md' | 'bug_tickets' | 'custom';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  source: CollectionSource;
  brand: string | null;
  chunk_count: number;
  last_indexed_at: Date | null;
  embedding_model: string;
  created_at: Date;
}

export interface Document {
  id: string;
  collection_id: string;
  title: string;
  source_uri: string | null;
  raw_text: string;
  sha256: string | null;
}

export interface ChunkInput { position: number; text: string; embedding: number[]; }

export async function listCollections(): Promise<Collection[]> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at
       FROM knowledge.collections
      ORDER BY source, name`,
  );
  return r.rows;
}

export async function getCollection(id: string): Promise<Collection | null> {
  const r = await p().query(
    `SELECT id, name, description, source, brand, chunk_count,
            last_indexed_at, embedding_model, created_at
       FROM knowledge.collections WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createCollection(args: {
  name: string; source: CollectionSource; description?: string; brand?: string | null;
  createdBy?: string | null;
}): Promise<Collection> {
  const r = await p().query(
    `INSERT INTO knowledge.collections (name, source, description, brand, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, source, brand, chunk_count,
               last_indexed_at, embedding_model, created_at`,
    [args.name, args.source, args.description ?? null, args.brand ?? null, args.createdBy ?? null],
  );
  return r.rows[0];
}

export async function deleteCollection(id: string): Promise<void> {
  const c = await getCollection(id);
  if (!c) throw new Error('not_found');
  if (c.source !== 'custom') throw new Error('cannot delete non-custom collection');
  await p().query('DELETE FROM knowledge.collections WHERE id = $1', [id]);
}

export async function addDocument(args: {
  collectionId: string; title: string; sourceUri: string | null; rawText: string; sha256?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Document> {
  const r = await p().query(
    `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (collection_id, source_uri) DO UPDATE
       SET title = EXCLUDED.title,
           raw_text = EXCLUDED.raw_text,
           sha256 = EXCLUDED.sha256,
           metadata = EXCLUDED.metadata
     RETURNING id, collection_id, title, source_uri, raw_text, sha256`,
    [args.collectionId, args.title, args.sourceUri, args.rawText, args.sha256 ?? null,
     JSON.stringify(args.metadata ?? {})],
  );
  return r.rows[0];
}

function vecLiteral(v: number[]): string {
  // pgvector accepts the text form '[0.1,0.2,…]'
  return `[${v.join(',')}]`;
}

export async function upsertChunks(collectionId: string, documentId: string, chunks: ChunkInput[]): Promise<void> {
  // Delete then insert: simpler than ON CONFLICT for vector data, and chunks are doc-scoped.
  const c = p();
  await c.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [documentId]);
  for (const ch of chunks) {
    await c.query(
      `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, collectionId, ch.position, ch.text, vecLiteral(ch.embedding)],
    );
  }
}

export async function recountChunks(collectionId: string): Promise<void> {
  await p().query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
            last_indexed_at = now()
      WHERE id = $1`,
    [collectionId],
  );
}

export async function queryNearest(args: {
  collectionIds: string[]; queryEmbedding: number[]; limit?: number; threshold?: number;
}): Promise<Array<{ id: string; text: string; collection_id: string; document_id: string; score: number }>> {
  const limit  = args.limit     ?? 6;
  const thresh = args.threshold ?? 0.65;
  const r = await p().query(
    `SELECT id, text, collection_id, document_id,
            1 - (embedding <=> $1) AS score
       FROM knowledge.chunks
      WHERE collection_id = ANY($2::uuid[])
      ORDER BY embedding <=> $1
      LIMIT $3`,
    [vecLiteral(args.queryEmbedding), args.collectionIds, limit],
  );
  return r.rows.filter((row: { score: number }) => row.score >= thresh);
}
```

- [ ] **Step 4: Run to verify pass**

```bash
bunx vitest run src/lib/knowledge-db.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/knowledge-db.ts website/src/lib/knowledge-db.test.ts
git commit -m "feat(knowledge-db): collections/documents/chunks helpers + nearest-query"
```

---

## Task 6 — Shared PG helper for ingestion scripts

**Files:**
- Create: `scripts/knowledge/lib-knowledge-pg.mjs`

- [ ] **Step 1: Create the helper**

```bash
mkdir -p /home/patrick/Bachelorprojekt/scripts/knowledge
```

Create `scripts/knowledge/lib-knowledge-pg.mjs`:

```js
// Shared helpers used by ingest-prs.mjs / ingest-markdown.mjs / ingest-bug-tickets.mjs.
// Usage: PGHOST=shared-db PGPASSWORD=… node scripts/knowledge/ingest-*.mjs
import pg from 'pg';
import { createHash } from 'node:crypto';

const { Pool } = pg;

export function makePool() {
  return new Pool({
    host:     process.env.PGHOST     ?? 'shared-db',
    port:     Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'website',
    user:     process.env.PGUSER     ?? 'website',
    password: process.env.PGPASSWORD,
  });
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export async function ensureCollection(pool, { name, source, brand = null, description = null }) {
  const r = await pool.query(
    `INSERT INTO knowledge.collections (name, source, brand, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, knowledge.collections.description)
     RETURNING id`,
    [name, source, brand, description],
  );
  return r.rows[0].id;
}

export async function upsertDocumentAndChunks(pool, {
  collectionId, title, sourceUri, rawText, hash, metadata = {}, chunks,
}) {
  const docRes = await pool.query(
    `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (collection_id, source_uri) DO UPDATE
       SET title = EXCLUDED.title,
           raw_text = EXCLUDED.raw_text,
           sha256 = EXCLUDED.sha256,
           metadata = EXCLUDED.metadata
     RETURNING id, sha256`,
    [collectionId, title, sourceUri, rawText, hash, JSON.stringify(metadata)],
  );
  const docId = docRes.rows[0].id;

  // Skip re-embedding if hash unchanged
  const prevHash = docRes.rows[0].sha256;
  if (prevHash === hash && chunks === null) return { docId, reused: true };

  await pool.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [docId]);
  for (const c of chunks) {
    await pool.query(
      `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [docId, collectionId, c.position, c.text, `[${c.embedding.join(',')}]`],
    );
  }
  return { docId, reused: false };
}

export async function bumpCollectionStats(pool, collectionId) {
  await pool.query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
            last_indexed_at = now()
      WHERE id = $1`,
    [collectionId],
  );
}

export async function callVoyage(inputs, inputType = 'document') {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY unset');
  const r = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: inputs, model: 'voyage-multilingual-2', input_type: inputType }),
  });
  if (!r.ok) throw new Error(`voyage ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { embeddings: j.data.map(d => d.embedding), tokens: j.usage.total_tokens };
}

export async function embedAll(texts, batch = 128) {
  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const r = await callVoyage(texts.slice(i, i + batch), 'document');
    out.push(...r.embeddings);
  }
  return out;
}

export function chunkPlain(text, target = 600, overlap = 100) {
  // Coarse port of website/src/lib/chunking.ts (plain mode) — duplicated so this script has no website deps.
  const charPerTok = 4;
  const targetChars  = target  * charPerTok;
  const overlapChars = overlap * charPerTok;
  if (text.length <= targetChars) return [{ position: 0, text }];
  const out = [];
  let pos = 0; let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push({ position: pos++, text: text.slice(cursor, end).trim() });
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}
```

- [ ] **Step 2: Smoke-test the helper imports cleanly**

```bash
cd /home/patrick/Bachelorprojekt
node --input-type=module -e "await import('./scripts/knowledge/lib-knowledge-pg.mjs'); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge/lib-knowledge-pg.mjs
git commit -m "feat(knowledge): shared pg + voyage helper for ingestion scripts"
```

---

## Task 7 — Ingestion script: PR history

**Files:**
- Create: `scripts/knowledge/ingest-prs.mjs`

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
// scripts/knowledge/ingest-prs.mjs — pull new rows from bachelorprojekt.features
// into the 'pr_history' knowledge collection.
//
// Env: PGHOST PGPASSWORD VOYAGE_API_KEY [PGDATABASE=website]
import {
  makePool, ensureCollection, upsertDocumentAndChunks,
  bumpCollectionStats, embedAll, chunkPlain, sha256,
} from './lib-knowledge-pg.mjs';

const COLLECTION_NAME = 'PR-Historie';
const SOURCE = 'pr_history';

async function main() {
  const pool = makePool();
  const collectionId = await ensureCollection(pool, {
    name: COLLECTION_NAME, source: SOURCE,
    description: 'Alle gemergten PRs aus bachelorprojekt.features',
  });

  const since = (await pool.query(
    'SELECT last_indexed_at FROM knowledge.collections WHERE id = $1',
    [collectionId],
  )).rows[0].last_indexed_at ?? new Date(0);

  const prs = (await pool.query(
    `SELECT pr_number, title, description, requirement_id, scope, category, merged_at
       FROM bachelorprojekt.features
      WHERE merged_at > $1
      ORDER BY merged_at ASC`,
    [since],
  )).rows;

  console.log(`[ingest-prs] ${prs.length} new PRs since ${since.toISOString()}`);

  let totalChunks = 0;
  for (const pr of prs) {
    const text = `# PR #${pr.pr_number} — ${pr.title}\n\nrequirement_id: ${pr.requirement_id || '—'}\nscope: ${pr.scope || '—'}\ncategory: ${pr.category || '—'}\nmerged_at: ${pr.merged_at?.toISOString?.() ?? pr.merged_at}\n\n${pr.description || ''}`;
    const hash = sha256(text);
    const chunkTexts = chunkPlain(text);
    const embeds = await embedAll(chunkTexts.map(c => c.text));
    const chunks = chunkTexts.map((c, i) => ({ ...c, embedding: embeds[i] }));
    await upsertDocumentAndChunks(pool, {
      collectionId,
      title: `PR #${pr.pr_number}: ${pr.title}`,
      sourceUri: `pr://${pr.pr_number}`,
      rawText: text,
      hash,
      metadata: { pr_number: pr.pr_number, requirement_id: pr.requirement_id, merged_at: pr.merged_at },
      chunks,
    });
    totalChunks += chunks.length;
  }

  await bumpCollectionStats(pool, collectionId);
  console.log(`[ingest-prs] done · ${prs.length} docs · ${totalChunks} chunks`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Smoke-test syntax + dry-run**

```bash
cd /home/patrick/Bachelorprojekt
node --check scripts/knowledge/ingest-prs.mjs
```

Expected: no output (success). Real run is gated on cluster connectivity and is exercised in Task 11.

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge/ingest-prs.mjs
git commit -m "feat(knowledge): ingest-prs script (bachelorprojekt.features → knowledge)"
```

---

## Task 8 — Ingestion script: markdown (specs + plans + CLAUDE.md)

**Files:**
- Create: `scripts/knowledge/ingest-markdown.mjs`

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
// scripts/knowledge/ingest-markdown.mjs — walk docs/superpowers/{specs,plans}/*.md and CLAUDE.md;
// hash-deduped, two collections: 'specs_plans' and 'claude_md'.
//
// Env: PGHOST PGPASSWORD VOYAGE_API_KEY REPO_ROOT (defaults to /repo at job runtime, $PWD locally)
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  makePool, ensureCollection, upsertDocumentAndChunks,
  bumpCollectionStats, embedAll, chunkPlain, sha256,
} from './lib-knowledge-pg.mjs';

const REPO = process.env.REPO_ROOT ?? process.cwd();

async function listMarkdown(dir) {
  let out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(await listMarkdown(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

async function ingest(pool, { collectionName, source, files, sourceUriPrefix }) {
  const collectionId = await ensureCollection(pool, {
    name: collectionName, source, description: `${source} markdown corpus`,
  });
  let totalChunks = 0;
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    const hash = sha256(text);
    // Skip if hash matches existing doc
    const sourceUri = `${sourceUriPrefix}${path.relative(REPO, f)}`;
    const existing = await pool.query(
      'SELECT sha256 FROM knowledge.documents WHERE collection_id = $1 AND source_uri = $2',
      [collectionId, sourceUri],
    );
    if (existing.rows[0]?.sha256 === hash) {
      console.log(`[ingest-markdown] unchanged: ${sourceUri}`);
      continue;
    }
    const chunkTexts = chunkPlain(text);
    const embeds = await embedAll(chunkTexts.map(c => c.text));
    const chunks = chunkTexts.map((c, i) => ({ ...c, embedding: embeds[i] }));
    await upsertDocumentAndChunks(pool, {
      collectionId, title: path.basename(f), sourceUri, rawText: text, hash, chunks,
    });
    totalChunks += chunks.length;
    console.log(`[ingest-markdown] indexed: ${sourceUri} (${chunks.length} chunks)`);
  }
  await bumpCollectionStats(pool, collectionId);
  return totalChunks;
}

async function main() {
  const pool = makePool();

  const specs = await listMarkdown(path.join(REPO, 'docs/superpowers/specs'));
  const plans = await listMarkdown(path.join(REPO, 'docs/superpowers/plans'));
  const c1 = await ingest(pool, {
    collectionName: 'Specs + Plans', source: 'specs_plans',
    files: [...specs, ...plans], sourceUriPrefix: 'file:///',
  });

  const claudeMd = path.join(REPO, 'CLAUDE.md');
  const c2 = await ingest(pool, {
    collectionName: 'CLAUDE.md', source: 'claude_md',
    files: [claudeMd], sourceUriPrefix: 'file:///',
  });

  console.log(`[ingest-markdown] done · specs+plans:${c1} chunks · claude_md:${c2} chunks`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Smoke-check**

```bash
node --check scripts/knowledge/ingest-markdown.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge/ingest-markdown.mjs
git commit -m "feat(knowledge): ingest-markdown script (specs+plans + CLAUDE.md)"
```

---

## Task 9 — Ingestion script: bug tickets

**Files:**
- Create: `scripts/knowledge/ingest-bug-tickets.mjs`

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
// scripts/knowledge/ingest-bug-tickets.mjs — pull rows from bugs.bug_tickets,
// brand-scoped (one collection per brand). Env: PGHOST PGPASSWORD VOYAGE_API_KEY BRAND
import {
  makePool, ensureCollection, upsertDocumentAndChunks,
  bumpCollectionStats, embedAll, chunkPlain, sha256,
} from './lib-knowledge-pg.mjs';

const BRAND = process.env.BRAND;
if (!BRAND || !['mentolder', 'korczewski'].includes(BRAND)) {
  console.error('BRAND must be mentolder|korczewski');
  process.exit(2);
}

const COLLECTION_NAME = `Bug-Tickets · ${BRAND}`;
const SOURCE = 'bug_tickets';

async function main() {
  const pool = makePool();
  const collectionId = await ensureCollection(pool, {
    name: COLLECTION_NAME, source: SOURCE, brand: BRAND,
    description: `Public bug reports from /api/bug-report (${BRAND})`,
  });

  const tickets = (await pool.query(
    `SELECT external_id, title, description, severity, status, fixed_in_pr, created_at
       FROM bugs.bug_tickets
      WHERE brand = $1
      ORDER BY created_at ASC`,
    [BRAND],
  )).rows;

  console.log(`[ingest-bug-tickets] ${BRAND}: ${tickets.length} tickets`);

  let totalChunks = 0;
  for (const t of tickets) {
    const text = `# ${t.external_id} — ${t.title}\n\nseverity: ${t.severity}\nstatus: ${t.status}\nfixed_in_pr: ${t.fixed_in_pr || '—'}\ncreated_at: ${t.created_at?.toISOString?.() ?? t.created_at}\n\n${t.description || ''}`;
    const hash = sha256(text);
    const chunkTexts = chunkPlain(text);
    const embeds = await embedAll(chunkTexts.map(c => c.text));
    const chunks = chunkTexts.map((c, i) => ({ ...c, embedding: embeds[i] }));
    await upsertDocumentAndChunks(pool, {
      collectionId, title: `${t.external_id}: ${t.title}`,
      sourceUri: `bug://${BRAND}/${t.external_id}`,
      rawText: text, hash,
      metadata: { brand: BRAND, severity: t.severity, status: t.status, fixed_in_pr: t.fixed_in_pr },
      chunks,
    });
    totalChunks += chunks.length;
  }

  await bumpCollectionStats(pool, collectionId);
  console.log(`[ingest-bug-tickets] done · ${tickets.length} docs · ${totalChunks} chunks`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Smoke-check**

```bash
node --check scripts/knowledge/ingest-bug-tickets.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge/ingest-bug-tickets.mjs
git commit -m "feat(knowledge): ingest-bug-tickets script (brand-scoped)"
```

---

## Task 10 — `reindex.sh` wrapper + Taskfile entry

**Files:**
- Create: `scripts/knowledge/reindex.sh`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Create the wrapper**

```bash
#!/usr/bin/env bash
# scripts/knowledge/reindex.sh — run an ingestion script in-cluster, against the
# given env's shared-db, fetching the VOYAGE_API_KEY from workspace-secrets.
#
# Usage:
#   bash scripts/knowledge/reindex.sh <env> <collection>
#     env:        mentolder | korczewski
#     collection: pr_history | specs_plans | claude_md | bug_tickets

set -euo pipefail
ENV="${1:?Usage: $0 <env> <collection>}"
COLLECTION="${2:?Usage: $0 <env> <collection>}"
case "$ENV"        in mentolder|korczewski) ;; *) echo "bad env: $ENV"; exit 2;; esac
case "$COLLECTION" in pr_history|specs_plans|claude_md|bug_tickets) ;; *) echo "bad collection: $COLLECTION"; exit 2;; esac

source scripts/env-resolve.sh "$ENV"
NS="${WORKSPACE_NAMESPACE:-workspace}"
CTX="${ENV_CONTEXT:-$ENV}"

case "$COLLECTION" in
  pr_history)   SCRIPT="ingest-prs.mjs";          BRAND="" ;;
  specs_plans)  SCRIPT="ingest-markdown.mjs";     BRAND="" ;;
  claude_md)    SCRIPT="ingest-markdown.mjs";     BRAND="" ;;
  bug_tickets)  SCRIPT="ingest-bug-tickets.mjs";  BRAND="$ENV" ;;
esac

echo "→ reindex $COLLECTION on $ENV (ns=$NS ctx=$CTX brand=${BRAND:-—})"

# Copy the helper + script into a throwaway pod that has node + the repo root mounted
# (we use a one-shot kubectl-debug pattern — kubectl exec into the website pod which
# has the repo via initContainer or PVC).
WEBSITE_POD=$(kubectl --context "$CTX" -n "$NS" get pod -l app=website -o jsonpath='{.items[0].metadata.name}')
kubectl --context "$CTX" -n "$NS" cp scripts/knowledge "$WEBSITE_POD:/tmp/knowledge"
kubectl --context "$CTX" -n "$NS" exec "$WEBSITE_POD" -- env \
  PGHOST=shared-db PGDATABASE=website PGUSER=website \
  PGPASSWORD="$(kubectl --context "$CTX" -n "$NS" get secret workspace-secrets -o jsonpath='{.data.postgres_password}' | base64 -d)" \
  VOYAGE_API_KEY="$(kubectl --context "$CTX" -n "$NS" get secret workspace-secrets -o jsonpath='{.data.voyage_api_key}' | base64 -d)" \
  REPO_ROOT=/repo BRAND="$BRAND" \
  node "/tmp/knowledge/$SCRIPT"
echo "✓ reindex $COLLECTION on $ENV done"
```

```bash
chmod +x /home/patrick/Bachelorprojekt/scripts/knowledge/reindex.sh
```

- [ ] **Step 2: Add the Taskfile entry**

In `Taskfile.yml`, find a logical home (next to `workspace:psql` or in a new top-level `knowledge:*` block — match existing layout). Add:

```yaml
  knowledge:reindex:
    desc: "Force re-index of a built-in knowledge collection (ENV=mentolder|korczewski, COLLECTION=pr_history|specs_plans|claude_md|bug_tickets)"
    vars:
      ENV:        '{{.ENV | default "mentolder"}}'
      COLLECTION: '{{.COLLECTION}}'
    preconditions:
      - sh: '[ -n "{{.COLLECTION}}" ]'
        msg: "COLLECTION is required (pr_history|specs_plans|claude_md|bug_tickets)"
    cmds:
      - bash scripts/knowledge/reindex.sh "{{.ENV}}" "{{.COLLECTION}}"
```

- [ ] **Step 3: Validate Taskfile parses**

```bash
task --list-all | grep -E '^\* knowledge:reindex'
```

Expected: one matching line.

- [ ] **Step 4: Commit**

```bash
git add scripts/knowledge/reindex.sh Taskfile.yml
git commit -m "feat(knowledge): reindex.sh wrapper + task knowledge:reindex"
```

---

## Task 11 — CronJob manifest + apply

**Files:**
- Create: `k3d/knowledge-ingest-cronjob.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Create the manifest**

```yaml
# k3d/knowledge-ingest-cronjob.yaml — one CronJob per built-in collection source.
# All pinned to Hetzner nodes (CNI partition rule from CLAUDE.md).
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: knowledge-ingest-prs
  namespace: workspace
spec:
  schedule: "0 3 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                  - matchExpressions:
                      - key: hetzner-node
                        operator: In
                        values: ["true"]
          containers:
            - name: ingest
              image: node:20-alpine
              workingDir: /repo
              command: ["sh", "-c"]
              args:
                - |
                  apk add --no-cache git
                  cd /tmp
                  git clone --depth=1 https://github.com/Paddione/Bachelorprojekt.git repo
                  cd repo
                  cd website && npm i pg --no-save && cd ..
                  node scripts/knowledge/ingest-prs.mjs
              env:
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: postgres_password } }
                - name: VOYAGE_API_KEY
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: voyage_api_key } }
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: knowledge-ingest-markdown
  namespace: workspace
spec:
  schedule: "15 3 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                  - matchExpressions:
                      - key: hetzner-node
                        operator: In
                        values: ["true"]
          containers:
            - name: ingest
              image: node:20-alpine
              command: ["sh", "-c"]
              args:
                - |
                  apk add --no-cache git
                  cd /tmp && git clone --depth=1 https://github.com/Paddione/Bachelorprojekt.git repo
                  cd repo && npm i pg --no-save --prefix website
                  REPO_ROOT=/tmp/repo node scripts/knowledge/ingest-markdown.mjs
              env:
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: postgres_password } }
                - name: VOYAGE_API_KEY
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: voyage_api_key } }
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: knowledge-ingest-bug-tickets-mentolder
  namespace: workspace
spec:
  schedule: "30 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                  - matchExpressions:
                      - key: hetzner-node
                        operator: In
                        values: ["true"]
          containers:
            - name: ingest
              image: node:20-alpine
              command: ["sh", "-c"]
              args:
                - |
                  apk add --no-cache git
                  cd /tmp && git clone --depth=1 https://github.com/Paddione/Bachelorprojekt.git repo
                  cd repo && npm i pg --no-save --prefix website
                  BRAND=mentolder node scripts/knowledge/ingest-bug-tickets.mjs
              env:
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: postgres_password } }
                - name: VOYAGE_API_KEY
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: voyage_api_key } }
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: knowledge-ingest-bug-tickets-korczewski
  namespace: workspace-korczewski
spec:
  schedule: "45 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          affinity:
            nodeAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                nodeSelectorTerms:
                  - matchExpressions:
                      - key: hetzner-node
                        operator: In
                        values: ["true"]
          containers:
            - name: ingest
              image: node:20-alpine
              command: ["sh", "-c"]
              args:
                - |
                  apk add --no-cache git
                  cd /tmp && git clone --depth=1 https://github.com/Paddione/Bachelorprojekt.git repo
                  cd repo && npm i pg --no-save --prefix website
                  BRAND=korczewski node scripts/knowledge/ingest-bug-tickets.mjs
              env:
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: postgres_password } }
                - name: VOYAGE_API_KEY
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: voyage_api_key } }
```

- [ ] **Step 2: Add to base kustomization**

In `k3d/kustomization.yaml`, add to the `resources:` list (alphabetical):

```yaml
  - knowledge-ingest-cronjob.yaml
```

- [ ] **Step 3: Validate**

```bash
kubectl kustomize k3d/ | grep -c '^kind: CronJob'
```

Expected count goes up by 4.

- [ ] **Step 4: Commit**

```bash
git add k3d/knowledge-ingest-cronjob.yaml k3d/kustomization.yaml
git commit -m "feat(knowledge): cronjobs for prs/markdown/bug-tickets ingestion"
```

---

## Task 12 — API endpoints: collections (list/create/delete) (TDD on the handlers' wiring)

**Files:**
- Create: `website/src/pages/api/admin/knowledge/collections/index.ts`
- Create: `website/src/pages/api/admin/knowledge/collections/[id]/index.ts`

- [ ] **Step 1: Implement `index.ts` (GET + POST)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createCollection, listCollections } from '../../../../../lib/knowledge-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const cols = await listCollections();
  return new Response(JSON.stringify(cols), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as {
    name?: string; description?: string; brand?: string | null;
  };
  if (!body.name?.trim()) {
    return new Response(JSON.stringify({ error: 'name erforderlich' }), { status: 400 });
  }
  try {
    const c = await createCollection({
      name: body.name.trim(),
      source: 'custom',
      description: body.description?.trim(),
      brand: body.brand ?? null,
    });
    return new Response(JSON.stringify(c), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('duplicate key')) {
      return new Response(JSON.stringify({ error: 'name bereits vergeben' }), { status: 409 });
    }
    throw err;
  }
};
```

- [ ] **Step 2: Implement `[id]/index.ts` (GET + DELETE)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection, deleteCollection } from '../../../../../../lib/knowledge-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const c = await getCollection(params.id!);
  if (!c) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  return new Response(JSON.stringify(c), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    await deleteCollection(params.id!);
    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    if (err instanceof Error && /custom/i.test(err.message))
      return new Response(JSON.stringify({ error: err.message }), { status: 403 });
    if (err instanceof Error && err.message === 'not_found')
      return new Response(JSON.stringify({ error: err.message }), { status: 404 });
    throw err;
  }
};
```

- [ ] **Step 3: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep -E 'admin/knowledge' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/knowledge/collections/
git commit -m "feat(api): admin knowledge collections CRUD endpoints"
```

---

## Task 13 — API endpoint: add document (chunk + embed inline)

**Files:**
- Create: `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts`
- Create: `website/src/pages/api/admin/knowledge/collections/[id]/reindex.ts`

- [ ] **Step 1: Implement `documents.ts` (POST)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import {
  addDocument, getCollection, recountChunks, upsertChunks,
} from '../../../../../../lib/knowledge-db';
import { embedBatch } from '../../../../../../lib/embeddings';
import { chunkText } from '../../../../../../lib/chunking';
import { createHash } from 'node:crypto';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const collection = await getCollection(params.id!);
  if (!collection) return new Response(JSON.stringify({ error: 'collection not found' }), { status: 404 });
  if (collection.source !== 'custom') {
    return new Response(JSON.stringify({ error: 'inline document add only allowed on custom collections' }), { status: 403 });
  }

  const body = await request.json() as {
    title?: string; sourceUri?: string | null; rawText?: string;
  };
  if (!body.title?.trim() || !body.rawText?.trim()) {
    return new Response(JSON.stringify({ error: 'title und rawText erforderlich' }), { status: 400 });
  }

  const sha256 = createHash('sha256').update(body.rawText).digest('hex');
  const doc = await addDocument({
    collectionId: collection.id,
    title: body.title.trim(),
    sourceUri: body.sourceUri ?? `paste:${sha256.slice(0, 12)}`,
    rawText: body.rawText,
    sha256,
  });

  const chunkTexts = chunkText(body.rawText, { mode: 'markdown' });
  if (chunkTexts.length > 50) {
    // schedule for cron — leave chunks empty, mark in metadata; v1 just returns 202 here.
    return new Response(JSON.stringify({ doc, scheduled: true, chunkCount: chunkTexts.length }), { status: 202 });
  }

  const { embeddings } = await embedBatch(chunkTexts.map(c => c.text));
  await upsertChunks(collection.id, doc.id, chunkTexts.map((c, i) => ({
    position: c.position, text: c.text, embedding: embeddings[i],
  })));
  await recountChunks(collection.id);

  return new Response(JSON.stringify({ doc, chunkCount: chunkTexts.length }), { status: 201 });
};
```

- [ ] **Step 2: Implement `reindex.ts` (POST — admin trigger for built-ins)**

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCollection } from '../../../../../../lib/knowledge-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const collection = await getCollection(params.id!);
  if (!collection) return new Response(JSON.stringify({ error: 'collection not found' }), { status: 404 });
  if (collection.source === 'custom') {
    return new Response(JSON.stringify({ error: 'reindex only for built-in collections' }), { status: 403 });
  }

  // v1: respond with the equivalent CLI command for the operator to run.
  // (Triggering the cron via Kubernetes Job from inside Astro requires the in-cluster
  // ServiceAccount and adds a Kubernetes client dep. Out of scope for Plan A.)
  const env = (process.env.BRAND ?? 'mentolder');
  const cmd = `task knowledge:reindex ENV=${env} COLLECTION=${collection.source}`;
  return new Response(JSON.stringify({ message: 'run this command', cmd }), { status: 202 });
};
```

- [ ] **Step 3: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep -E 'admin/knowledge' || echo 'no errors'
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/knowledge/collections/
git commit -m "feat(api): add-document + reindex endpoints for knowledge collections"
```

---

## Task 14 — UI: `/admin/wissensquellen` page + `KnowledgeSourceModal`

**Files:**
- Create: `website/src/pages/admin/wissensquellen.astro`
- Create: `website/src/components/admin/KnowledgeSourceModal.svelte`

- [ ] **Step 1: Build the modal Svelte component**

```svelte
<script lang="ts">
  // KnowledgeSourceModal.svelte — used by /admin/wissensquellen and (later) by the systemtest wizard.
  let { open = $bindable(false), onCreated }: {
    open: boolean;
    onCreated?: (id: string) => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let brand: 'mentolder' | 'korczewski' | 'beide' = $state('beide');
  let pasted = $state('');
  let title = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit() {
    busy = true; error = null;
    try {
      // 1. create the collection
      const colRes = await fetch('/api/admin/knowledge/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, brand: brand === 'beide' ? null : brand }),
      });
      if (!colRes.ok) { error = (await colRes.json()).error ?? 'Fehler'; return; }
      const col = await colRes.json();
      // 2. add document if pasted text present
      if (pasted.trim()) {
        const docRes = await fetch(`/api/admin/knowledge/collections/${col.id}/documents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title || name, rawText: pasted }),
        });
        if (!docRes.ok) { error = (await docRes.json()).error ?? 'Doc-Upload fehlgeschlagen'; return; }
      }
      onCreated?.(col.id);
      open = false; name = ''; description = ''; pasted = ''; title = '';
    } finally { busy = false; }
  }
</script>

{#if open}
<div class="modal-bg" onclick={() => open = false}>
  <div class="modal" onclick={(e: Event) => e.stopPropagation()}>
    <h3>Neue Wissensquelle</h3>
    {#if error}<p class="err">{error}</p>{/if}
    <label>Name<input bind:value={name} required /></label>
    <label>Beschreibung<textarea bind:value={description} rows="2" /></label>
    <label>Marke
      <select bind:value={brand}>
        <option value="beide">beide</option>
        <option value="mentolder">mentolder</option>
        <option value="korczewski">korczewski</option>
      </select>
    </label>
    <label>Dokument-Titel (optional)<input bind:value={title} /></label>
    <label>Inhalt (Markdown / Klartext)<textarea bind:value={pasted} rows="10" placeholder="Hier einfügen…" /></label>
    <div class="actions">
      <button onclick={() => open = false} disabled={busy}>Abbrechen</button>
      <button onclick={submit} disabled={busy || !name.trim()}>{busy ? '…' : 'Anlegen'}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal { background: var(--ink-800); border: 1px solid var(--ink-750); padding: 1.25rem; border-radius: 10px; min-width: 480px; max-width: 640px; display: flex; flex-direction: column; gap: 0.6rem; color: var(--fg); }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 12px; color: var(--fg-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  input, textarea, select { background: var(--ink-900); border: 1px solid var(--ink-750); color: var(--fg); border-radius: 6px; padding: 0.5rem; font-family: inherit; font-size: 13px; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { color: #c96e6e; }
</style>
```

- [ ] **Step 2: Build the Astro page**

```astro
---
// website/src/pages/admin/wissensquellen.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import KnowledgeSourceModal from '../../components/admin/KnowledgeSourceModal.svelte';
import { listCollections } from '../../lib/knowledge-db';
import { getSession, isAdmin } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) {
  return Astro.redirect('/');
}

const collections = await listCollections();
const builtins = collections.filter(c => c.source !== 'custom');
const customs  = collections.filter(c => c.source === 'custom');
---
<AdminLayout title="Wissensquellen">
  <header class="page-head">
    <h1>Wissensquellen</h1>
    <button id="new-btn" class="primary">+ Neue Wissensquelle</button>
  </header>

  <h2>Eingebaut</h2>
  <table class="table">
    <thead><tr><th>Name</th><th>Quelle</th><th>Marke</th><th>Chunks</th><th>Letzter Index</th><th></th></tr></thead>
    <tbody>
      {builtins.map(c => (
        <tr>
          <td>{c.name}</td>
          <td><code>{c.source}</code></td>
          <td>{c.brand ?? '—'}</td>
          <td>{c.chunk_count}</td>
          <td>{c.last_indexed_at ? new Date(c.last_indexed_at).toLocaleString('de-DE') : '—'}</td>
          <td><button data-reindex={c.id}>Re-index</button></td>
        </tr>
      ))}
    </tbody>
  </table>

  <h2>Eigene Sammlungen</h2>
  {customs.length === 0 ? <p class="muted">Noch keine eigenen Sammlungen.</p> : (
    <table class="table">
      <thead><tr><th>Name</th><th>Marke</th><th>Chunks</th><th>Erstellt</th><th></th></tr></thead>
      <tbody>
        {customs.map(c => (
          <tr>
            <td>{c.name}</td>
            <td>{c.brand ?? 'beide'}</td>
            <td>{c.chunk_count}</td>
            <td>{new Date(c.created_at).toLocaleDateString('de-DE')}</td>
            <td><button data-delete={c.id} class="danger">Löschen</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )}

  <KnowledgeSourceModal client:load id="modal" onCreated={() => location.reload()} />

  <script is:inline>
    document.getElementById('new-btn').addEventListener('click', () => {
      // Svelte 5 modal opens via a custom event on the wrapper element.
      window.dispatchEvent(new CustomEvent('open-knowledge-modal'));
    });
    document.querySelectorAll('[data-reindex]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.reindex;
        const r = await fetch(`/api/admin/knowledge/collections/${id}/reindex`, { method: 'POST' });
        const j = await r.json().catch(() => ({}));
        alert(j.cmd ? `Bitte ausführen:\n${j.cmd}` : (j.error ?? 'Fehler'));
      });
    });
    document.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Wirklich löschen?')) return;
        const id = btn.dataset.delete;
        const r = await fetch(`/api/admin/knowledge/collections/${id}`, { method: 'DELETE' });
        if (r.ok) location.reload();
        else alert('Fehler beim Löschen');
      });
    });
  </script>

  <style>
    .page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 1.5rem; }
    .table th, .table td { padding: 0.5rem; border-bottom: 1px solid var(--ink-750); text-align: left; }
    .primary { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .danger { background: transparent; color: #c96e6e; border: 1px solid #c96e6e; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; }
    .muted { color: var(--fg-soft); font-style: italic; }
  </style>
</AdminLayout>
```

Note: the `open-knowledge-modal` event-bridge is one option. If a `bind:open` pattern reads more naturally in Astro, mirror what `CreateInvoiceModal.svelte` does in this repo (it's the closest reference modal — same admin context, same Svelte 5 runes). The exact mount pattern is not load-bearing for this plan; what matters is that clicking `+ Neue Wissensquelle` makes `<KnowledgeSourceModal>` visible and that `onCreated` triggers `location.reload()`.

- [ ] **Step 3: Smoke-test page renders in dev**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep -E 'wissensquellen|KnowledgeSource' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/wissensquellen.astro website/src/components/admin/KnowledgeSourceModal.svelte
git commit -m "feat(ui): /admin/wissensquellen page + KnowledgeSourceModal"
```

---

## Task 15 — Playwright E2E happy path

**Files:**
- Create: `tests/e2e/specs/wissensquellen.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

test.describe('Wissensquellen admin', () => {
  test.beforeEach(({}, info) => {
    if (!ADMIN_PASS) info.skip(true, 'E2E_ADMIN_PASS unset');
  });
  test.setTimeout(120_000);

  test('create custom collection with pasted text', async ({ page }) => {
    // log in as admin
    await page.goto(`${BASE}/api/auth/login?returnTo=/admin/wissensquellen`);
    await page.waitForURL(/realms\/workspace/);
    await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
    await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
    await page.locator('#kc-login, input[type="submit"]').first().click();
    await page.waitForURL(/admin\/wissensquellen/, { timeout: 60_000 });

    await page.getByRole('button', { name: '+ Neue Wissensquelle' }).click();
    const stamp = `e2e-${Date.now()}`;
    await page.getByLabel('Name').fill(stamp);
    await page.getByLabel('Inhalt (Markdown / Klartext)').fill(
      '## Test-Eintrag\n\nDies ist ein Testdokument für die E2E-Suite.',
    );
    await page.getByRole('button', { name: 'Anlegen' }).click();

    // After reload, the new row should be visible in the customs table with chunk_count > 0
    await page.waitForURL(/admin\/wissensquellen/);
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const chunkCell = row.locator('td').nth(2);
    await expect(chunkCell).toHaveText(/[1-9]\d*/);

    // Cleanup: delete the test collection
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Smoke-syntax-check (don't run; needs cluster)**

```bash
cd /home/patrick/Bachelorprojekt
bunx tsc --noEmit tests/e2e/specs/wissensquellen.spec.ts 2>&1 | head -10 || true
```

Expected: zero or only "is not under 'rootDir'" warnings (those are tsconfig artifacts, not real errors).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/wissensquellen.spec.ts
git commit -m "test(e2e): wissensquellen happy path"
```

---

## Task 16 — Apply schema to mentolder, verify, then korczewski

- [ ] **Step 1: Deploy to mentolder**

```bash
cd /home/patrick/Bachelorprojekt
task workspace:deploy ENV=mentolder
```

Expected: kustomize apply succeeds; new ConfigMap version rolled out.

- [ ] **Step 2: Restart shared-db postStart so the ensure-script runs**

```bash
kubectl --context mentolder -n workspace rollout restart statefulset/shared-db
kubectl --context mentolder -n workspace rollout status  statefulset/shared-db --timeout=180s
```

- [ ] **Step 3: Verify schemas + extension are present**

```bash
kubectl --context mentolder -n workspace exec statefulset/shared-db -- \
  psql -U postgres -d website -c "\dn knowledge" \
  -c "\dt knowledge.*" \
  -c "SELECT extname FROM pg_extension WHERE extname='vector';"
```

Expected: `knowledge` schema listed; 3 tables (collections, documents, chunks); `vector` extension row.

- [ ] **Step 4: Repeat for korczewski**

```bash
task workspace:deploy ENV=korczewski
kubectl --context korczewski -n workspace-korczewski rollout restart statefulset/shared-db
kubectl --context korczewski -n workspace-korczewski rollout status statefulset/shared-db --timeout=180s
kubectl --context korczewski -n workspace-korczewski exec statefulset/shared-db -- \
  psql -U postgres -d website -c "\dn knowledge"
```

(`workspace-korczewski` is the namespace in the unified cluster — see CLAUDE.md cluster-merge note.)

- [ ] **Step 5: Trigger first ingest manually for PR history (mentolder)**

```bash
task knowledge:reindex ENV=mentolder COLLECTION=pr_history
```

Expected: script logs "[ingest-prs] N new PRs" and "[ingest-prs] done".

- [ ] **Step 6: Verify rows arrived**

```bash
kubectl --context mentolder -n workspace exec statefulset/shared-db -- \
  psql -U postgres -d website -c \
  "SELECT name, chunk_count, last_indexed_at FROM knowledge.collections;"
```

Expected: at least one row for `PR-Historie` with `chunk_count > 0`.

- [ ] **Step 7: Push branch + open PR + merge**

```bash
git push -u origin feature/knowledge-foundation
gh pr create --title "feat(knowledge): pgvector foundation + admin UI (Plan A)" --body "$(cat <<'EOF'
## Summary
- New `knowledge.{collections,documents,chunks}` schema in shared-db (pgvector image already deployed; just enables the extension)
- voyage-multilingual-2 embeddings client + markdown-aware chunker
- Four ingestion CronJobs (PR history daily, markdown daily, bug-tickets hourly per brand)
- `/admin/wissensquellen` admin UI + "+ Neue Wissensquelle" modal for custom collections
- `task knowledge:reindex` for on-demand re-index
- Plan A of 3 — sets up the corpus that Plans B (LLM walker) and C (run UI) consume

## Test plan
- [x] vitest unit (embeddings, chunking, knowledge-db)
- [x] Schema visible in mentolder + korczewski (verified manually)
- [x] First PR-history ingest run produced chunk_count > 0 on mentolder
- [ ] Playwright `wissensquellen.spec.ts` runs against mentolder (requires E2E_ADMIN_PASS)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

User merges (per their auto-merge convention).

- [ ] **Step 8: Final verification post-merge**

```bash
git checkout main && git pull origin main
task knowledge:reindex ENV=mentolder COLLECTION=specs_plans
task knowledge:reindex ENV=mentolder COLLECTION=claude_md
task knowledge:reindex ENV=mentolder COLLECTION=bug_tickets
task knowledge:reindex ENV=korczewski COLLECTION=bug_tickets
```

Expected: each prints `done` and the corresponding row in `knowledge.collections` shows `chunk_count > 0` and a recent `last_indexed_at`.

---

## Done with Plan A

After Task 16 lands, this layer ships value on its own: an admin can browse `/admin/wissensquellen`, see four ingested built-in collections, create custom collections, and the corpus is queryable via `knowledge-db.queryNearest`. Plan B (LLM walker + run model) is now unblocked and consumes `knowledge-db.ts` + `embeddings.ts` directly.
