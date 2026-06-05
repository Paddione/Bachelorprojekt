---
title: Software Factory — Phase 1 (Foundation) Implementation Plan
ticket_id: T000420
domains: [website, infra, db, test, ops]
status: active
pr_number: null
---

# Software Factory — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Software Factory Phase-1 "Augmented Single-Feature" foundation actually runnable: pin the already-merged tickets DB schema live on both brands, wire the ticket-embedding semantic-search layer that is currently empty, register the factory tests in CI, make the conflict gate brand-aware, and write the missing runnable 6-phase pipeline Workflow script.

**Architecture:** The tickets schema is **app-managed TypeScript DDL** (`website/src/lib/tickets-db.ts` → `initTicketsSchema()`), applied idempotently at website-pod boot — there is no SQL migration runner. The factory DB objects (`touched_files`, `pipeline_slot`, `tickets.ticket_embeddings` + HNSW, `fn_find_similar`, `v_factory_metrics`, `v_active_features`) already exist in code (PR #1309) but are **not verified live** and the embedding table is **never populated or queried**. Phase 1 adds: a model-isolation column + writer + search wrapper + backfill (reusing the `website/src/lib/embeddings.ts` + `knowledge-db.ts` patterns), test registration, a brand-aware `conflict-check.sh`, and a runnable `scripts/factory/pipeline.js` Claude Code Workflow script that orchestrates the existing templates/review-prompts/conflict-check/dev-flow-execute commands. Each brand (mentolder = ns `workspace`/`website`, korczewski = ns `workspace-korczewski`/`website-korczewski`) has its own independent `shared-db`, so every schema change and backfill must reach **both**.

**Tech Stack:** TypeScript (Astro/Node ≥22.13), `pg`, pgvector 0.8.0 (HNSW `vector_cosine_ops`), bge-m3 via TEI (`llm-gateway-embed:8081`, prod) / Voyage `voyage-multilingual-2` (dev fallback), vitest (`website/src/lib/*.test.ts`), BATS (`tests/local/*.bats`, live-cluster), Claude Code Workflow tool (harness globals `agent`/`parallel`/`pipeline`/`phase`), `task` (go-task), `kubectl --context fleet`.

**Decisions locked in (from planning):**
- **Merge gate:** Full Auto-Pilot per spec — the Deploy phase auto-squash-merges on green CI and runs `task feature:*` for **both brands**; human only on escalation. Safety guards (merge from MAIN_REPO, explicit `ENV=`, escalation on HIGH/CRITICAL review findings) are mandatory.
- **Embeddings:** Full layer in scope (Tasks 2–5): model-isolation column + writer + search wrapper + backfill.
- **Brand scope:** Both brands (mentolder + korczewski) for conflict-check and the pipeline Deploy phase.

**Out of scope (Phase 2/3):** the cron/event Dispatcher (Tier 1), queue polling, watchdog/slot manager, Layer-4 canary smoke + auto-rollback automation, the directory-level conflict heuristic, and a live-cluster CI execution job. Do **not** build these here.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `website/src/lib/tickets-db.ts` | App-managed tickets DDL + ticket-embedding writer/search helpers | T1, T2, T3, T4 |
| `website/src/lib/tickets-embed.ts` (**new**) | `embedTicket()` writer + `findSimilarTickets()` search wrapper (keeps tickets-db.ts focused) | T3, T4 |
| `website/src/lib/tickets-embed.test.ts` (**new**) | vitest unit tests for the writer + search wrapper (pg + embeddings mocked) | T3, T4 |
| `website/scripts/backfill-ticket-embeddings.mjs` (**new**) | thin tsx CLI: batched, idempotent, restore-safe backfill | T5 |
| `website/scripts/find-similar-tickets.mjs` (**new**) | thin tsx CLI the pipeline's Scout phase shells | T4 |
| `tests/local/FA-SF-01-conflict-check.bats` (rename) | conflict-check contract tests, brand-aware | T6, T7 |
| `tests/local/FA-SF-04-db-schema.bats` (rename) | live-cluster schema assertions (both namespaces, vector ext, embedding_model) | T1, T2, T6 |
| `scripts/build-test-inventory.sh` | inventory scanner — extend to recognize `FA-SF-NN` filenames | T6 |
| `website/src/data/test-inventory.json` | regenerated inventory (CI diff-checked) | T6 |
| `scripts/factory/conflict-check.sh` | brand-aware file-overlap gate | T7 |
| `scripts/factory/pipeline.js` (**new**) | the runnable 6-phase Workflow script | T8 |
| `Taskfile.factory.yml` (**new**) + `Taskfile.yml` | `task factory:run` wrapper + include | T9 |
| `scripts/factory/README.md`, `docs/superpowers/references/factory-usage.md` | doc cleanup, fix broken plan ref, honest status badges | T9 |

**Dependency order:** T1 → T2 → T3 → T4 → T5 (strictly sequential: all touch `tickets-db.ts`/embedding rows). T6 depends on T1+T2. T7 depends on T1. T8 depends on T4+T6+T7. T9 depends on T8.

---

## Conventions for every task

- **Worktree:** all work happens in the current feature worktree (`/tmp/wt-software-factory`, branch `feature/software-factory`). Never use `.claude/worktrees/`.
- **Run a single vitest file:** `cd website && npx vitest run src/lib/<name>.test.ts`
- **Run a live BATS test:** `./tests/runner.sh local <FA-SF-ID>` (needs a reachable cluster; default ctx is set inside each bats file).
- **Verify schema on a brand** (substitute the namespace):
  - mentolder: `kubectl --context fleet exec -n workspace deployment/shared-db -- psql -U postgres -d website -c "<SQL>"`
  - korczewski: `kubectl --context fleet exec -n workspace-korczewski deployment/shared-db -- psql -U postgres -d website -c "<SQL>"`
- **Commit after every green step group.** Conventional commits, tagged `[T000413]`.

---

### Task 1: Pin + verify the factory DB schema live on BOTH brands

**Why:** All four schema additions already exist in `tickets-db.ts` (PR #1309), but a live query shows they are **absent in ns `workspace`** — the website deployment has not been rolled out with the schema, or the eager init failed. Every downstream task asserts against this schema, so it must be proven live on **both** brands before anything builds on it. This is a **verify/deploy** task — do **not** add or rewrite DDL unless a genuine missing object is found.

**Files:**
- Read-only: `website/src/lib/tickets-db.ts` (L94-95 columns, L273-294 table+HNSW, L299-322 `fn_find_similar`, L483 `v_factory_metrics`, L497 `v_active_features`)
- Read-only: `website/src/lib/website-db.ts:63` (eager `initTicketsSchema()` boot trigger)
- Reference: `.github/workflows/build-website.yml:76-77` (dual `rollout restart`)
- Test (extended in T6): `tests/local/factory-db-schema.bats`

- [ ] **Step 1: Snapshot the current live state on both brands (expect gaps)**

Run (mentolder):
```bash
kubectl --context fleet exec -n workspace deployment/shared-db -- psql -U postgres -d website -t -c "
SELECT 'cols=' || count(*) FROM information_schema.columns
  WHERE table_schema='tickets' AND table_name='tickets' AND column_name IN ('touched_files','pipeline_slot');
SELECT 'embeddings=' || (to_regclass('tickets.ticket_embeddings') IS NOT NULL)::text;
SELECT 'hnsw=' || (EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='ticket_embeddings_hnsw_idx'))::text;
SELECT 'fn=' || (to_regprocedure('tickets.fn_find_similar(vector,integer)') IS NOT NULL)::text;
SELECT 'v_metrics=' || (to_regclass('tickets.v_factory_metrics') IS NOT NULL)::text;
SELECT 'v_active=' || (to_regclass('tickets.v_active_features') IS NOT NULL)::text;
SELECT 'vector_ext=' || (EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector'))::text;
"
```
Repeat with `-n workspace-korczewski`.
Expected: at least `cols=0` / `embeddings=false` on the lagging brand(s) — confirming the schema is not yet live. **Record which objects are missing on which brand.**

- [ ] **Step 2: Confirm the `vector` extension is present (hard dependency)**

If `vector_ext=false` on a brand, the `ticket_embeddings VECTOR(1024)` creation will fail. The extension is enabled by the **superuser** path (shared-db postStart → `ensure-knowledge-schema.sh` from `k3d/website-schema.yaml`), not by the website app role. Trigger it if missing:
```bash
# Only if vector_ext=false on a brand — restart shared-db to re-run the postStart hook:
kubectl --context fleet rollout restart deployment/shared-db -n <namespace>
kubectl --context fleet rollout status deployment/shared-db -n <namespace> --timeout=180s
```
Re-run Step 1's `vector_ext` check. Expected: `vector_ext=true` on both brands.

- [ ] **Step 3: Apply the schema by rolling out the website deployment on both brands**

The fresh website pod runs `initTicketsSchema()` on boot (website-db.ts:63), applying all idempotent DDL.
```bash
kubectl --context fleet rollout restart deployment/website -n website
kubectl --context fleet rollout restart deployment/website -n website-korczewski
kubectl --context fleet rollout status deployment/website -n website --timeout=300s
kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
```

- [ ] **Step 4: Verify boot-time schema init did not error**

Run:
```bash
kubectl --context fleet logs -n website deployment/website --tail=200 | grep -iE "initTicketsSchema|tickets schema|vector|error" | head
kubectl --context fleet logs -n website-korczewski deployment/website --tail=200 | grep -iE "initTicketsSchema|tickets schema|vector|error" | head
```
Expected: no `error` lines referencing the tickets schema / `type vector does not exist`. (Idempotency is proven here: this is a re-run of `initTicketsSchema()` on boot.)

- [ ] **Step 5: Re-run the Step-1 assertions — everything present on BOTH brands**

Re-run the Step-1 block for `-n workspace` AND `-n workspace-korczewski`.
Expected on each: `cols=2`, `embeddings=true`, `hnsw=true`, `fn=true`, `v_metrics=true`, `v_active=true`, `vector_ext=true`. If a brand still lags, repeat Steps 2-4 for that brand only.

- [ ] **Step 6: Commit the verification evidence (no code change expected)**

If no DDL change was needed, there is nothing to commit yet — record the verified state in the task ticket via a comment instead:
```bash
./scripts/ticket.sh add-comment --id T000413 --body "Phase1 T1: factory schema verified live on both brands (workspace + workspace-korczewski): cols=2, ticket_embeddings+HNSW+fn_find_similar+v_factory_metrics+v_active_features present, vector ext enabled."
```
If a genuine missing object forced a DDL fix in `tickets-db.ts`, commit it:
```bash
git add website/src/lib/tickets-db.ts
git commit -m "fix(factory): harden tickets schema init for live parity [T000413]"
```

---

### Task 2: Add `embedding_model` column + model-isolation helper

**Why:** `tickets.ticket_embeddings` has **no `embedding_model` column** (confirmed: columns are `id, ticket_id, chunk, chunk_type, embedding, created_at`), unlike `knowledge.collections`. Prod writes bge-m3 vectors, dev writes Voyage vectors — both 1024-dim but **incompatible vector spaces**. Without per-row model tagging, `fn_find_similar`'s `<=>` compares across spaces and returns garbage that *looks* valid. This column and the env-derived model helper must land **before** any writer (T3) so every row is tagged from the first insert.

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (add one `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `initTicketsSchema()`, near L284 after the table; add exported helper near top exports)
- Reuse: `website/src/lib/knowledge-db.ts:5` (`MixedEmbeddingModelError`)
- Test: `website/src/lib/tickets-embed.test.ts` (**new** — created here, extended in T3/T4)

- [ ] **Step 1: Write the failing test for the env-derived model helper**

Create `website/src/lib/tickets-embed.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { ticketEmbeddingModel } from './tickets-db';

describe('ticketEmbeddingModel', () => {
  const prev = process.env.LLM_ENABLED;
  afterEach(() => { process.env.LLM_ENABLED = prev; });

  it('returns bge-m3 when LLM is enabled', () => {
    process.env.LLM_ENABLED = 'true';
    expect(ticketEmbeddingModel()).toBe('bge-m3');
  });

  it('falls back to voyage-multilingual-2 when LLM is disabled', () => {
    process.env.LLM_ENABLED = 'false';
    expect(ticketEmbeddingModel()).toBe('voyage-multilingual-2');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: FAIL — `ticketEmbeddingModel` is not exported from `./tickets-db`.

- [ ] **Step 3: Add the column DDL + the helper**

In `website/src/lib/tickets-db.ts`, inside `initTicketsSchema()` immediately **after** the `ticket_embeddings_chunk_type_idx` index creation (around L284), add:
```ts
  // Phase 1 Software Factory: tag each embedding row with the model that
  // produced it. bge-m3 (prod) and voyage-multilingual-2 (dev) are both
  // 1024-dim but their vector spaces are NOT interchangeable — search MUST
  // never compare across models (see findSimilarTickets / MixedEmbeddingModelError).
  await pool.query(`ALTER TABLE tickets.ticket_embeddings ADD COLUMN IF NOT EXISTS embedding_model TEXT`);
```
At the **top** of the file's exports (after the existing imports), add the helper and re-export the guard error so the ticket embedding code has a single import surface:
```ts
import { MixedEmbeddingModelError } from './knowledge-db';
import type { EmbeddingModel } from './embeddings';

export { MixedEmbeddingModelError };

/** The embedding model this environment writes/queries with. bge-m3 in prod
 *  (LLM_ENABLED=true), voyage-multilingual-2 in dev. Mirrors knowledge-db.ts. */
export function ticketEmbeddingModel(): EmbeddingModel {
  return process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
}
```
> If `tickets-db.ts` already imports from `./knowledge-db` or `./embeddings`, merge into the existing import line instead of duplicating.

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Deploy + verify the column live on both brands**

```bash
kubectl --context fleet rollout restart deployment/website -n website
kubectl --context fleet rollout restart deployment/website -n website-korczewski
kubectl --context fleet rollout status deployment/website -n website --timeout=300s
kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
```
Then for each namespace (`workspace`, `workspace-korczewski`):
```bash
kubectl --context fleet exec -n <namespace> deployment/shared-db -- psql -U postgres -d website -t -c "
SELECT 'embedding_model=' || (EXISTS(SELECT 1 FROM information_schema.columns
  WHERE table_schema='tickets' AND table_name='ticket_embeddings' AND column_name='embedding_model'))::text;"
```
Expected: `embedding_model=true` on both.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/tickets-db.ts website/src/lib/tickets-embed.test.ts
git commit -m "feat(factory): add embedding_model column + model-isolation helper to tickets schema [T000413]"
```

---

### Task 3: Build the ticket-embedding writer (`embedTicket`)

**Why:** `tickets.ticket_embeddings` is provisioned but **never written** (grep finds zero callers). Create the missing glue: chunk ticket text, embed via `embedBatch`, insert tagged rows. Embedding must be **best-effort** — a GPU-host outage must never block ticket creation. The bash `ticket.sh` cannot import TS, so this lives in the app layer.

**Files:**
- Create: `website/src/lib/tickets-embed.ts`
- Extend: `website/src/lib/tickets-embed.test.ts`
- Reuse: `website/src/lib/embeddings.ts` (`embedBatch`, `EmbeddingIndexError`), `website/src/lib/chunking.ts` (`chunkText`), `website/src/lib/website-db.ts` (`pool`), `website/src/lib/tickets-db.ts` (`ticketEmbeddingModel`)
- Pattern reference: `website/src/lib/ingest-json-core.ts:31,77-88`, `website/src/lib/knowledge-db.ts:157` (`vecLiteral`)

- [ ] **Step 1: Write the failing test for `embedTicket`**

Add to `website/src/lib/tickets-embed.test.ts` (top-of-file `pg` + embeddings mocks, mirroring `website-db.content-store.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let poolQuery: ReturnType<typeof vi.fn>;
vi.mock('pg', () => {
  const _poolQuery = vi.fn();
  function Pool(this: any) { this.query = _poolQuery; this.connect = async () => ({ query: _poolQuery, release: vi.fn() }); }
  (globalThis as any).__pgMock = { poolQuery: _poolQuery };
  return { default: { Pool }, Pool };
});

const embedBatch = vi.fn();
vi.mock('./embeddings', async (orig) => {
  const actual = await orig<typeof import('./embeddings')>();
  return { ...actual, embedBatch };
});

import { embedTicket } from './tickets-embed';

beforeEach(() => {
  poolQuery = (globalThis as any).__pgMock.poolQuery;
  poolQuery.mockReset();
  embedBatch.mockReset();
  process.env.LLM_ENABLED = 'true';
});

describe('embedTicket', () => {
  it('chunks, embeds and inserts one row per chunk tagged with model + chunk_type', async () => {
    embedBatch.mockResolvedValueOnce({ embeddings: [Array(1024).fill(0.1)], tokens: 5 });
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const n = await embedTicket('uuid-1', { title: 'Add X', description: 'Body of the ticket' });

    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(n).toBeGreaterThanOrEqual(1);
    const insert = poolQuery.mock.calls.find(c => /INSERT INTO tickets\.ticket_embeddings/.test(c[0]));
    expect(insert).toBeTruthy();
    expect(insert![0]).toMatch(/embedding_model/);
    // bound params include chunk_type 'summary' and model 'bge-m3'
    expect(insert![1]).toEqual(expect.arrayContaining(['uuid-1', 'summary', 'bge-m3']));
  });

  it('is best-effort: an EmbeddingIndexError does not throw to the caller', async () => {
    const { EmbeddingIndexError } = await import('./embeddings');
    embedBatch.mockRejectedValueOnce(new EmbeddingIndexError('gpu down'));
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(embedTicket('uuid-2', { title: 'T', description: 'D' })).resolves.toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: FAIL — `embedTicket` is not exported from `./tickets-embed` (module not found).

- [ ] **Step 3: Implement `embedTicket`**

Create/extend `website/src/lib/tickets-embed.ts`:
```ts
import { pool } from './website-db';
import { embedBatch } from './embeddings';
import { chunkText } from './chunking';
import { ticketEmbeddingModel } from './tickets-db';

/** Bound a number[] into a VECTOR(1024) literal — mirrors knowledge-db.ts:157. */
function vecLiteral(v: number[]): string { return `[${v.join(',')}]`; }

const SYNC_CHUNK_CAP = 200; // mirror documents.ts — bound synchronous embed work

export interface TicketTextParts {
  title: string;
  description?: string | null;
  spec?: string | null;
  lesson?: string | null;
}

type ChunkType = 'summary' | 'spec' | 'decision' | 'lesson';

/**
 * Embed a ticket's text into tickets.ticket_embeddings, tagged with the
 * env-derived model. BEST-EFFORT: any embedding/insert failure is swallowed
 * (logged) and returns the number of rows actually written — ticket
 * creation must never be coupled to GPU-host uptime.
 */
export async function embedTicket(ticketId: string, parts: TicketTextParts): Promise<number> {
  const model = ticketEmbeddingModel();
  // Build (text, chunk_type) pairs. summary = title + description.
  const pairs: Array<{ text: string; type: ChunkType }> = [];
  const summary = [parts.title, parts.description ?? ''].filter(Boolean).join('\n\n').trim();
  if (summary) for (const c of chunkText(summary, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'summary' });
  if (parts.spec) for (const c of chunkText(parts.spec, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'spec' });
  if (parts.lesson) for (const c of chunkText(parts.lesson, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'lesson' });

  const bounded = pairs.slice(0, SYNC_CHUNK_CAP);
  if (bounded.length === 0) return 0;

  try {
    const { embeddings } = await embedBatch(bounded.map(p => p.text), { model, purpose: 'index' });
    let written = 0;
    for (let i = 0; i < bounded.length; i++) {
      await pool.query(
        `INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type, embedding, embedding_model)
         VALUES ($1, $2, $3, $4::vector(1024), $5)`,
        [ticketId, bounded[i].text, bounded[i].type, vecLiteral(embeddings[i]), model],
      );
      written++;
    }
    return written;
  } catch (err) {
    // BEST-EFFORT: never propagate to the caller (e.g. ticket create).
    console.error(`[embedTicket] best-effort embed failed for ${ticketId}:`, err instanceof Error ? err.message : err);
    return 0;
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: PASS (helper tests from T2 + both `embedTicket` tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets-embed.ts website/src/lib/tickets-embed.test.ts
git commit -m "feat(factory): add best-effort ticket-embedding writer embedTicket [T000413]"
```

---

### Task 4: Build the similar-ticket search wrapper (`findSimilarTickets`) + CLI

**Why:** `fn_find_similar` exists but has **zero query callers** and **no model awareness**, so Scout's "similar tickets" lookup silently returns nothing/garbage. Add a typed wrapper that embeds the query with the **same** model, asserts a single `embedding_model` (fail-closed via `MixedEmbeddingModelError`), and returns ranked results. Expose a thin CLI the pipeline's Scout phase shells.

**Files:**
- Extend: `website/src/lib/tickets-embed.ts`
- Extend: `website/src/lib/tickets-embed.test.ts`
- Create: `website/scripts/find-similar-tickets.mjs`
- Reuse: `website/src/lib/embeddings.ts` (`embedQuery`, `EmbeddingQueryError`), `website/src/lib/tickets-db.ts` (`MixedEmbeddingModelError`, `ticketEmbeddingModel`)
- Pattern reference: `website/src/lib/knowledge-db.ts:194-243` (`queryNearest`)

- [ ] **Step 1: Write the failing tests for `findSimilarTickets`**

Add to `website/src/lib/tickets-embed.test.ts`:
```ts
import { findSimilarTickets } from './tickets-embed';
import { MixedEmbeddingModelError } from './tickets-db';

// extend the embeddings mock to also stub embedQuery
const embedQuery = vi.fn();
vi.mock('./embeddings', async (orig) => {
  const actual = await orig<typeof import('./embeddings')>();
  return { ...actual, embedBatch, embedQuery };
});

describe('findSimilarTickets', () => {
  beforeEach(() => { embedQuery.mockReset(); });

  it('embeds the query and returns rows ranked by fn_find_similar', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ embedding_model: 'bge-m3' }] });       // DISTINCT model
    embedQuery.mockResolvedValueOnce({ embedding: Array(1024).fill(0.2), tokens: 3 });
    poolQuery.mockResolvedValueOnce({ rows: [
      { ticket_id: 'u1', external_id: 'T000100', chunk: 'x', chunk_type: 'summary', similarity: 0.91 },
    ] });

    const res = await findSimilarTickets('add feature X', 5);
    expect(embedQuery).toHaveBeenCalledWith('add feature X', expect.objectContaining({ purpose: 'query', model: 'bge-m3' }));
    expect(res[0].external_id).toBe('T000100');
  });

  it('throws MixedEmbeddingModelError when rows span >1 model', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ embedding_model: 'bge-m3' }, { embedding_model: 'voyage-multilingual-2' }] });
    await expect(findSimilarTickets('q', 5)).rejects.toBeInstanceOf(MixedEmbeddingModelError);
  });

  it('returns [] when there are no embeddings yet (fail-soft for Scout)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(findSimilarTickets('q', 5)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: FAIL — `findSimilarTickets` not exported.

- [ ] **Step 3: Implement `findSimilarTickets`**

Append to `website/src/lib/tickets-embed.ts`:
```ts
import { embedQuery } from './embeddings';
import { MixedEmbeddingModelError } from './tickets-db';

export interface SimilarTicket {
  ticket_id: string;
  external_id: string;
  chunk: string;
  chunk_type: string;
  similarity: number;
}

/**
 * Semantic similar-ticket search for the Scout phase. Embeds the query with
 * the SAME model the rows were written with, fails closed across vector
 * spaces, and returns ranked tickets. Returns [] when nothing is embedded yet.
 */
export async function findSimilarTickets(queryText: string, k = 5): Promise<SimilarTicket[]> {
  const distinct = await pool.query<{ embedding_model: string | null }>(
    `SELECT DISTINCT embedding_model FROM tickets.ticket_embeddings`,
  );
  const models = distinct.rows.map(r => r.embedding_model).filter((m): m is string => !!m);
  if (models.length === 0) return []; // nothing embedded yet — Scout treats as "no similar tickets"
  if (models.length > 1) throw new MixedEmbeddingModelError(models);

  const model = models[0] as import('./embeddings').EmbeddingModel;
  const { embedding } = await embedQuery(queryText, { model, purpose: 'query' });
  const res = await pool.query<SimilarTicket>(
    `SELECT * FROM tickets.fn_find_similar($1::vector(1024), $2)`,
    [vecLiteral(embedding), k],
  );
  return res.rows;
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: PASS (all writer + search tests).

- [ ] **Step 5: Add the thin CLI the pipeline shells**

Create `website/scripts/find-similar-tickets.mjs`:
```js
#!/usr/bin/env node
// Usage: SESSIONS_DATABASE_URL=... npx tsx website/scripts/find-similar-tickets.mjs "<query text>" [k]
// Prints a JSON array of similar tickets to stdout. Fail-soft: prints [] on no embeddings.
import { findSimilarTickets } from '../src/lib/tickets-embed.ts';

const query = process.argv[2];
const k = Number(process.argv[3] ?? 5);
if (!query) { console.error('usage: find-similar-tickets <query> [k]'); process.exit(2); }

try {
  const rows = await findSimilarTickets(query, k);
  process.stdout.write(JSON.stringify(rows));
  process.exit(0);
} catch (err) {
  // Fail-closed across vector spaces or LLM down: Scout treats stderr+exit1 as "no similar tickets".
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 6: Smoke-test the CLI syntax (offline)**

Run: `cd website && node --check scripts/find-similar-tickets.mjs && echo OK`
Expected: `OK` (syntax valid). A full run requires `SESSIONS_DATABASE_URL` + a reachable shared-db and is exercised in T8.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/tickets-embed.ts website/src/lib/tickets-embed.test.ts website/scripts/find-similar-tickets.mjs
git commit -m "feat(factory): add findSimilarTickets search wrapper + Scout CLI [T000413]"
```

---

### Task 5: Restore-safe, idempotent backfill for existing tickets

**Why:** ~400 historical tickets have no embeddings, so `findSimilarTickets` returns nothing until backfilled. Provide a batched, idempotent, GPU-friendly backfill that skips already-embedded tickets and is safe to re-run after a DB restore (embeddings are re-derivable, never authoritative — must not touch `tickets.external_id_seq`). Must run against **both** brands.

**Files:**
- Create: `website/scripts/backfill-ticket-embeddings.mjs`
- Extend: `website/src/lib/tickets-embed.ts` (add `backfillTicketEmbeddings()`)
- Extend: `website/src/lib/tickets-embed.test.ts`
- Pattern reference: `website/src/lib/ingest-json-core.ts` (batch + progress loop)

- [ ] **Step 1: Write the failing test for `backfillTicketEmbeddings`**

Add to `website/src/lib/tickets-embed.test.ts`:
```ts
import { backfillTicketEmbeddings } from './tickets-embed';

describe('backfillTicketEmbeddings', () => {
  it('embeds only tickets lacking rows for the current model, idempotent on re-run', async () => {
    process.env.LLM_ENABLED = 'true';
    // 1st query: the candidate tickets (no embeddings yet)
    poolQuery.mockResolvedValueOnce({ rows: [
      { id: 'u1', title: 'A', description: 'a' },
      { id: 'u2', title: 'B', description: 'b' },
    ] });
    embedBatch.mockResolvedValue({ embeddings: [Array(1024).fill(0.1)], tokens: 1 });
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // inserts

    const first = await backfillTicketEmbeddings({ batchSize: 50 });
    expect(first.embedded).toBe(2);

    // 2nd run: candidate query returns none (all already embedded)
    poolQuery.mockReset(); embedBatch.mockReset();
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const second = await backfillTicketEmbeddings({ batchSize: 50 });
    expect(second.embedded).toBe(0);
    expect(embedBatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: FAIL — `backfillTicketEmbeddings` not exported.

- [ ] **Step 3: Implement `backfillTicketEmbeddings`**

Append to `website/src/lib/tickets-embed.ts`:
```ts
export interface BackfillResult { scanned: number; embedded: number; failed: number; }

/**
 * Backfill embeddings for tickets that have no rows for the CURRENT model.
 * Idempotent (skips already-embedded), batched (protects the single GPU host),
 * restore-safe (re-derivable; never touches external_id_seq). Best-effort per
 * ticket — a failure is counted, not fatal, so a re-run resumes.
 */
export async function backfillTicketEmbeddings(opts: { batchSize?: number; onProgress?: (r: BackfillResult) => void } = {}): Promise<BackfillResult> {
  const model = ticketEmbeddingModel();
  const batchSize = opts.batchSize ?? 50;
  const result: BackfillResult = { scanned: 0, embedded: 0, failed: 0 };

  // Candidates: tickets with NO embedding row for THIS model. Sequential pages.
  for (;;) {
    const { rows } = await pool.query<{ id: string; title: string; description: string | null }>(
      `SELECT t.id, t.title, t.description
         FROM tickets.tickets t
        WHERE NOT EXISTS (
          SELECT 1 FROM tickets.ticket_embeddings te
           WHERE te.ticket_id = t.id AND te.embedding_model = $1)
        ORDER BY t.created_at
        LIMIT $2`,
      [model, batchSize],
    );
    if (rows.length === 0) break;

    for (const t of rows) {
      result.scanned++;
      const n = await embedTicket(t.id, { title: t.title, description: t.description }); // best-effort
      if (n > 0) result.embedded++; else result.failed++;
      opts.onProgress?.(result);
    }
    // If the whole page failed (e.g. GPU down) stop to avoid a hot spin; a re-run resumes.
    if (result.embedded === 0 && result.failed >= rows.length) break;
  }
  return result;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the thin CLI**

Create `website/scripts/backfill-ticket-embeddings.mjs`:
```js
#!/usr/bin/env node
// Usage (run once PER BRAND, pointing at that brand's shared-db):
//   SESSIONS_DATABASE_URL=postgresql://website:...@<host>:5432/website \
//   LLM_ENABLED=true LLM_EMBED_URL=... npx tsx website/scripts/backfill-ticket-embeddings.mjs
import { backfillTicketEmbeddings } from '../src/lib/tickets-embed.ts';

const res = await backfillTicketEmbeddings({
  batchSize: Number(process.env.BACKFILL_BATCH ?? 50),
  onProgress: (r) => process.stderr.write(`\r scanned=${r.scanned} embedded=${r.embedded} failed=${r.failed}`),
});
process.stderr.write('\n');
console.log(JSON.stringify(res));
process.exit(res.scanned > 0 && res.embedded === 0 ? 1 : 0);
```

- [ ] **Step 6: Syntax-check the CLI (offline)**

Run: `cd website && node --check scripts/backfill-ticket-embeddings.mjs && echo OK`
Expected: `OK`. (The actual backfill run against each brand's DB is an execution-time deploy step, documented in the PR description; it is not part of the offline test gate.)

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/tickets-embed.ts website/src/lib/tickets-embed.test.ts website/scripts/backfill-ticket-embeddings.mjs
git commit -m "feat(factory): add idempotent restore-safe ticket-embedding backfill [T000413]"
```

---

### Task 6: Register the factory BATS tests in the CI inventory

**Why:** `tests/local/factory-db-schema.bats` and `factory-conflict-check.bats` are **invisible to CI**: `build-test-inventory.sh` derives IDs via `sed -E 's/^(FA|SA|NFA|AK)-([0-9]+).*/\1-\2/'` on the **filename**, and files starting with `factory-` are skipped. The CI `test:inventory` diff therefore never tracks them, and the schema↔conflict-check contract can drift silently. Rename to an inventory-recognized prefix (and extend the scanner to accept the `FA-SF-NN` alpha-tag form), regenerate the inventory, and add the new schema assertions from T1/T2.

**Files:**
- Modify: `scripts/build-test-inventory.sh` (extend the regex to accept `FA-SF-NN`)
- Rename: `tests/local/factory-db-schema.bats` → `tests/local/FA-SF-04-db-schema.bats`
- Rename: `tests/local/factory-conflict-check.bats` → `tests/local/FA-SF-01-conflict-check.bats`
- Modify: the renamed db-schema bats — add `embedding_model` + `vector` extension + both-namespaces assertions
- Regenerate: `website/src/data/test-inventory.json`

- [ ] **Step 1: Confirm the gap (failing-first)**

Run:
```bash
task test:inventory && grep -c "FA-SF" website/src/data/test-inventory.json || echo "0 (absent)"
```
Expected: `0 (absent)` — the factory tests are not registered.

- [ ] **Step 2: Extend the inventory scanner to recognize `FA-SF-NN`**

In `scripts/build-test-inventory.sh`, change the bats ID extraction (around L15) so an optional uppercase sub-tag between the prefix and the number is accepted:
```bash
    # was: id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)-([0-9]+).*/\1-\2/')"
    id="$(echo "$base" | sed -E 's/^(FA|SA|NFA|AK)(-[A-Z]+)?-([0-9]+).*/\1\2-\3/')"
```
This maps `FA-SF-04-db-schema.bats` → id `FA-SF-04` while leaving `FA-123-foo.bats` → `FA-123` unchanged.

- [ ] **Step 3: Rename the two bats files**

```bash
git mv tests/local/factory-conflict-check.bats tests/local/FA-SF-01-conflict-check.bats
git mv tests/local/factory-db-schema.bats     tests/local/FA-SF-04-db-schema.bats
grep -rln "factory-db-schema.bats\|factory-conflict-check.bats" docs tests scripts website 2>/dev/null
```
Fix any references the grep surfaces (docs/runner mentions) to the new filenames.

- [ ] **Step 4: Add the new schema assertions to the db-schema bats**

In `tests/local/FA-SF-04-db-schema.bats`, add tests mirroring the existing FA-SF-04..11 style (kubectl exec into shared-db, `FACTORY_NS` overridable). Add:
```bash
@test "FA-SF-12: embedding_model column exists on tickets.ticket_embeddings" {
  run kubectl --context "${FACTORY_CTX:-fleet}" exec -n "${FACTORY_NS:-workspace}" deployment/shared-db -- \
    psql -U postgres -d website -tAc \
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='tickets' AND table_name='ticket_embeddings' AND column_name='embedding_model')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "FA-SF-13: vector extension is enabled (ticket_embeddings hard dependency)" {
  run kubectl --context "${FACTORY_CTX:-fleet}" exec -n "${FACTORY_NS:-workspace}" deployment/shared-db -- \
    psql -U postgres -d website -tAc "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}
```
> Both-namespaces coverage is achieved by re-running the suite with `FACTORY_NS=workspace-korczewski` — document this in the file header; do not hardcode a single namespace.

- [ ] **Step 5: Regenerate the inventory and confirm registration**

Run:
```bash
task test:inventory
grep -o '"FA-SF-[0-9]*"' website/src/data/test-inventory.json | sort -u
```
Expected: `FA-SF-01` … `FA-SF-13` now listed. No duplicate-ID error from the scanner.

- [ ] **Step 6: Confirm the CI inventory-diff would pass**

Run: `git diff --stat website/src/data/test-inventory.json` — the file changed and is committed alongside the bats files (CI fails if the committed JSON differs from a fresh `task test:inventory`).

- [ ] **Step 7: Commit**

```bash
git add scripts/build-test-inventory.sh tests/local/FA-SF-01-conflict-check.bats tests/local/FA-SF-04-db-schema.bats website/src/data/test-inventory.json
git commit -m "test(factory): register FA-SF tests in CI inventory + add embedding_model/vector assertions [T000413]"
```

---

### Task 7: Make `conflict-check.sh` brand-aware

**Why:** `conflict-check.sh` defaults `FACTORY_NS=workspace`, which silently targets **prod mentolder** on a bare run; korczewski lives in `workspace-korczewski`. The pipeline's Plan gate shells out to it for **both brands**, so it must resolve brand → namespace explicitly and refuse to guess.

**Files:**
- Modify: `scripts/factory/conflict-check.sh`
- Modify: `tests/local/FA-SF-01-conflict-check.bats` (add brand-resolution assertion)
- Reference: `environments/mentolder.yaml`, `environments/korczewski.yaml` (namespace mapping)

- [ ] **Step 1: Add a failing bats assertion for brand resolution**

In `tests/local/FA-SF-01-conflict-check.bats`, add:
```bash
@test "FA-SF-03b: BRAND=korczewski resolves namespace to workspace-korczewski" {
  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh T000001
  [ "$status" -eq 0 ]
  [[ "$output" == *"workspace-korczewski"* ]]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-01`
Expected: FAIL — `BRAND` is not honored / no `FACTORY_DRY_RESOLVE` path.

- [ ] **Step 3: Implement brand-aware namespace resolution**

In `scripts/factory/conflict-check.sh`, near the top where `FACTORY_NS` is defaulted, replace the bare default with a brand map and a dry-resolve escape hatch:
```bash
# Brand → namespace map. BRAND wins over a bare FACTORY_NS default so a
# pipeline/human cannot silently hit prod-mentolder when targeting korczewski.
case "${BRAND:-}" in
  mentolder)   FACTORY_NS="workspace" ;;
  korczewski)  FACTORY_NS="workspace-korczewski" ;;
  "")          : ;;  # no BRAND given — fall through to explicit FACTORY_NS
  *)           echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
esac

if [[ -z "${BRAND:-}" && -z "${FACTORY_NS_EXPLICIT:-}" ]]; then
  echo "WARN: no BRAND set; defaulting FACTORY_NS=${FACTORY_NS:-workspace} (mentolder/prod). Set BRAND=mentolder|korczewski to be explicit." >&2
fi
FACTORY_NS="${FACTORY_NS:-workspace}"
FACTORY_CTX="${FACTORY_CTX:-fleet}"

# Dry-resolve: print the resolved namespace and exit (used by tests).
if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"
  exit 0
fi
```
Update the script header comment block to document `BRAND`, `FACTORY_NS`, `FACTORY_CTX`, and the dry-resolve flag.

- [ ] **Step 4: Run the bats — verify it passes**

Run: `./tests/runner.sh local FA-SF-01`
Expected: PASS — FA-SF-01..03 (existing contract) + FA-SF-03b (brand resolution). The unknown-args/unknown-ticket exit-2 behavior is unchanged.

- [ ] **Step 5: Re-confirm the SQL enum contract is still valid**

Run:
```bash
grep -nE "type *= *'feature'|status IN \('backlog','in_progress','in_review'\)" scripts/factory/conflict-check.sh
grep -nE "type IN \('bug','feature','task','project'\)|status" website/src/lib/tickets-db.ts | head
```
Expected: the `feature` type and `backlog/in_progress/in_review` statuses in the script still match the CHECK constraints in `tickets-db.ts`. The script remains read-only (selects `external_id`/`touched_files` only — never `ticket_plans.content`).

- [ ] **Step 6: Commit**

```bash
git add scripts/factory/conflict-check.sh tests/local/FA-SF-01-conflict-check.bats
git commit -m "feat(factory): make conflict-check.sh brand-aware (mentolder|korczewski) [T000413]"
```

---

### Task 8: Write the runnable Phase-1 pipeline Workflow script

**Why:** The single missing Phase-1 deliverable. `pipeline-pattern.md` is **doc only** — no `export const meta` script exists. Translate the 6-phase blueprint into an executable Claude Code Workflow script that wires the existing parts: `findSimilarTickets` (Scout), the templates, brand-aware `conflict-check.sh` (Plan gate), the three `review-*.prompt.md` (Verify panel), and the dev-flow-execute command set (Implement/Deploy). It implements a **single feature with N parallel tasks** — no queue, no cron (Phase 2). Per the locked decision, the Deploy phase auto-squash-merges on green CI and runs `task feature:*` for **both brands**.

**Files:**
- Create: `scripts/factory/pipeline.js`
- Reuse: `scripts/factory/conflict-check.sh`, `scripts/factory/review-bug-hunter.prompt.md`, `scripts/factory/review-security-auditor.prompt.md`, `scripts/factory/review-pattern-enforcer.prompt.md`, `scripts/factory/templates/scout-template.md`, `website/scripts/find-similar-tickets.mjs`, `scripts/ticket.sh`, `scripts/plan-frontmatter-hook.sh`
- Reference (mirror commands): `.claude/skills/dev-flow-execute/SKILL.md`
- Test: `tests/local/FA-SF-20-pipeline-contract.bats` (**new**, structural/grep contract)

> **Critical:** the `agent`/`parallel`/`pipeline`/`phase` globals are **harness-injected**. The script is run by the Claude Code **Workflow tool**, NOT `node scripts/factory/pipeline.js`. Use `args.timestamp` (never `Date.now()`) and avoid `Math.random()` so Workflow **resume** works. CI can only `node --check` it.

- [ ] **Step 1: Write the failing structural contract test**

Create `tests/local/FA-SF-20-pipeline-contract.bats`:
```bash
#!/usr/bin/env bats
# FA-SF-20: structural contract for the runnable factory pipeline (offline, no cluster).
SCRIPT="scripts/factory/pipeline.js"

@test "FA-SF-20: pipeline.js exists and is syntactically valid JS" {
  [ -f "$SCRIPT" ]
  run node --check "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-20: exports meta with the six expected phases" {
  for p in Scout Design Plan Implement Verify Deploy; do
    run grep -q "phase('$p')" "$SCRIPT"; [ "$status" -eq 0 ]
  done
  run grep -Eq "export const meta" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: wires the existing factory parts (conflict-check, review prompts, ticket.sh)" {
  run grep -q "conflict-check.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-bug-hunter.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-security-auditor.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "review-pattern-enforcer.prompt.md" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "scripts/ticket.sh" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -q "find-similar-tickets.mjs" "$SCRIPT"; [ "$status" -eq 0 ]
}

@test "FA-SF-20: uses args.timestamp and not Date.now()/Math.random() (resume-safe)" {
  run grep -q "args.timestamp" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "Date\.now\(\)|Math\.random\(\)" "$SCRIPT"; [ "$status" -ne 0 ]
}

@test "FA-SF-20: Deploy phase merges from MAIN repo and deploys BOTH brands with explicit ENV" {
  run grep -q "feature:" "$SCRIPT"; [ "$status" -eq 0 ]
  run grep -Eq "ENV=mentolder|ENV=korczewski|ENV=fleet-" "$SCRIPT"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `./tests/runner.sh local FA-SF-20`
Expected: FAIL — `scripts/factory/pipeline.js` does not exist.

- [ ] **Step 3: Implement the pipeline script**

Create `scripts/factory/pipeline.js`. Implement all six phases; the skeleton below is complete and must be filled with the real agent prompts (load the existing template/prompt files via the Read tool inside the agents, by path). Keep the structure exactly as shown:
```js
export const meta = {
  name: 'software-factory-pipeline',
  description: 'Phase-1 single-feature pipeline: Scout → Design → Plan → Implement → Verify → Deploy',
  phases: [
    { title: 'Scout' }, { title: 'Design' }, { title: 'Plan' },
    { title: 'Implement' }, { title: 'Verify' }, { title: 'Deploy' },
  ],
}

// args = { title, description, slug, ticket_id, brand, timestamp }
const A = args ?? {}
const slug = A.slug
const brand = A.brand ?? 'mentolder'
const ENV = brand === 'korczewski' ? 'korczewski' : 'mentolder'
const REPO = '/home/patrick/Bachelorprojekt'
const WT = `/tmp/wt-${slug}`

const SCOUT_SCHEMA = { type:'object', required:['complexity','touched_files','risk_areas','similar_tickets','estimated_slots'],
  properties:{ complexity:{enum:['simple','medium','complex']}, touched_files:{type:'array',items:{type:'string'}},
    risk_areas:{type:'array',items:{type:'string'}}, similar_tickets:{type:'array',items:{type:'string'}}, estimated_slots:{type:'integer'} } }
const REVIEW_SCHEMA = { type:'object', required:['findings'], properties:{ findings:{type:'array',items:{type:'object',
  required:['severity','file','description'], properties:{ severity:{enum:['low','medium','high','critical']},
  file:{type:'string'}, line:{type:'integer'}, description:{type:'string'}, suggested_fix:{type:'string'} }}}, summary:{type:'string'} } }

// ── ① Scout ───────────────────────────────────────────────────────────────
phase('Scout')
const scout = await agent(
  `Scout the feature "${A.title}" against the codebase at ${REPO}. Description: ${A.description}.
   Fill the format in scripts/factory/templates/scout-template.md. For similar past tickets, run:
   \`cd ${REPO}/website && npx tsx scripts/find-similar-tickets.mjs "${A.title} ${A.description}" 5\` (fail-soft: [] is fine).
   Return touched_files (the files this feature will edit), complexity, risk_areas, similar_tickets (external_ids), estimated_slots.`,
  { label:'scout', phase:'Scout', schema: SCOUT_SCHEMA })

// Persist touched_files back onto the ticket via ticket.sh (NO raw SQL).
log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
await agent(
  `Run: bash ${REPO}/scripts/ticket.sh set-touched-files --id ${A.ticket_id} --files ${JSON.stringify(scout.touched_files.join(','))}
   (if that subcommand is absent, update tickets.tickets.touched_files for external_id ${A.ticket_id} via the ticket.sh update path). Report the command output.`,
  { label:'scout:persist', phase:'Scout' })

// SIMPLE features skip Design/Plan/Implement and go straight to Verify→Deploy.
const isSimple = scout.complexity === 'simple'

// ── ② Design ──────────────────────────────────────────────────────────────
let specPath = null
if (!isSimple) {
  phase('Design')
  const design = await agent(
    `Write a design spec for "${A.title}" using scripts/factory/templates/design-template.md, saved to
     ${REPO}/docs/superpowers/specs/${A.timestamp}-${slug}-design.md. For medium/complex, include an adversarial
     "try to refute this design" section. Attach it to the ticket: bash ${REPO}/scripts/ticket-attach.sh <uuid> <specfile>.
     Return the spec file path.`,
    { label:'design', phase:'Design' })
  specPath = design.trim()
}

// ── ③ Plan (with conflict gate) ───────────────────────────────────────────
let tasks = []
if (!isSimple) {
  phase('Plan')
  // Brand-aware disjoint-files gate BEFORE fanning tasks.
  const conflict = await agent(
    `Run: BRAND=${brand} bash ${REPO}/scripts/factory/conflict-check.sh ${A.ticket_id} ${scout.touched_files.join(' ')}
     Report its stdout JSON and exit code. Exit 1 (conflict) means another active feature touches these files — STOP and report.`,
    { label:'plan:conflict', phase:'Plan' })
  if (/"T0/.test(conflict)) { log(`Conflict detected: ${conflict}`); return { status:'blocked', reason:'file-overlap', conflict } }

  const plan = await agent(
    `Decompose the spec ${specPath} into independent tasks (no two tasks touch the same file). For each task give:
     id, target_files, acceptance_criteria. Write the plan to ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md,
     then run: bash ${REPO}/scripts/plan-frontmatter-hook.sh that file. Return a JSON array of task objects.`,
    { label:'plan:decompose', phase:'Plan',
      schema:{ type:'object', required:['tasks'], properties:{ tasks:{type:'array',items:{type:'object',
        required:['id','target_files','acceptance_criteria'], properties:{ id:{type:'string'},
        target_files:{type:'array',items:{type:'string'}}, acceptance_criteria:{type:'array',items:{type:'string'}} }}} } })
  tasks = plan.tasks
}

// ── ④ Implement (N parallel tasks, isolated worktrees) ────────────────────
let implemented = []
if (!isSimple && tasks.length) {
  phase('Implement')
  implemented = (await pipeline(
    tasks,
    (t) => agent(
      `Implement task ${t.id} on branch feature/${slug} in an isolated worktree. Target files: ${t.target_files.join(', ')}.
       Follow TDD. Acceptance: ${t.acceptance_criteria.join('; ')}. Then run locally: cd ${WT} && task workspace:validate && task test:all.
       Return a summary of the diff and the local test result.`,
      { label:`impl:${t.id}`, phase:'Implement', isolation:'worktree' }),
    (res, t) => agent(
      `Verify task ${t.id} self-consistently: re-read the diff and confirm acceptance criteria ${t.acceptance_criteria.join('; ')} are met. Report pass/fail.`,
      { label:`impl-verify:${t.id}`, phase:'Implement' }),
  )).filter(Boolean)
}

// ── ⑤ Verify (adversarial review panel) ───────────────────────────────────
phase('Verify')
const lenses = [
  { key:'bug',      file:'scripts/factory/review-bug-hunter.prompt.md' },
  { key:'security', file:'scripts/factory/review-security-auditor.prompt.md' },
  { key:'pattern',  file:'scripts/factory/review-pattern-enforcer.prompt.md' },
]
const reviews = (await parallel(lenses.map(l => () => agent(
  `Read ${REPO}/${l.file} and apply that review prompt to the diff of branch feature/${slug} (git diff origin/main...HEAD in ${REPO}).
   Return findings per its JSON schema.`,
  { label:`review:${l.key}`, phase:'Verify', schema: REVIEW_SCHEMA })))).filter(Boolean)

const blocking = reviews.flatMap(r => r.findings).filter(f => f.severity === 'high' || f.severity === 'critical')
if (blocking.length) {
  await agent(`Run: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked &&
    bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory Verify blocked: ' + JSON.stringify(blocking))}`,
    { label:'verify:escalate', phase:'Verify' })
  return { status:'blocked', reason:'review-findings', blocking }
}

// ── ⑥ Deploy (auto-merge on green CI + both-brand deploy) ─────────────────
phase('Deploy')
const deploy = await agent(
  `From the MAIN repo working copy at ${REPO} (NOT the worktree — see dev-flow-execute Schritt 6 / T000342):
   1. Push branch feature/${slug}, open a PR, wait for CI green.
   2. Squash-merge with --delete-branch (gh pr merge --squash --delete-branch).
   3. Close the ticket: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done; archive the plan via ticket.sh archive-plan.
   4. Deploy BOTH brands explicitly (push-based fleet, no reconciler): the appropriate task feature:* umbrella, or
      'task workspace:deploy ENV=mentolder' AND 'ENV=korczewski'. Website-only changes auto-roll-out; everything else needs this.
   Report the merged PR number and the deploy command outputs. If CI is red after 2 fix attempts, set the ticket to blocked and STOP.`,
  { label:'deploy', phase:'Deploy' })

return { status:'done', pr: deploy, reviews: reviews.length, tasks: tasks.length }
```
> Fill each `agent(...)` prompt with the concrete instructions above; the agents Read the template/prompt files by path at run time. Do not add a queue/cron — that is Phase 2.

- [ ] **Step 4: Run `node --check` + the contract bats — verify they pass**

Run:
```bash
node --check scripts/factory/pipeline.js && echo SYNTAX_OK
./tests/runner.sh local FA-SF-20
```
Expected: `SYNTAX_OK` and all FA-SF-20 assertions PASS.

- [ ] **Step 5: Register FA-SF-20 in the inventory**

Run: `task test:inventory && grep -q "FA-SF-20" website/src/data/test-inventory.json && echo REGISTERED`
Expected: `REGISTERED`.

- [ ] **Step 6: Documented manual dry-run (no merge)**

Add a short note to `scripts/factory/README.md` describing how to invoke the pipeline via the Workflow tool with `args={title,description,slug,ticket_id,brand,timestamp}` and that a throwaway/no-op feature should reach the Plan→conflict gate without merging. (No automated step — this is the human verification recipe.)

- [ ] **Step 7: Commit**

```bash
git add scripts/factory/pipeline.js tests/local/FA-SF-20-pipeline-contract.bats website/src/data/test-inventory.json scripts/factory/README.md
git commit -m "feat(factory): add runnable Phase-1 pipeline Workflow script (Scout→Deploy) [T000413]"
```

---

### Task 9: `task factory:run` wrapper + factory doc cleanup

**Why:** Provide a standardized, documented invocation surface and make the factory docs reflect reality. There is no `factory:` namespace in `Taskfile.yml`; `README.md` cites a non-existent plan file (`docs/superpowers/plans/2026-06-01-software-factory-polish.md`); and the README status badges overstate readiness (pipeline-pattern.md marked green though it was doc-only until T8).

**Files:**
- Create: `Taskfile.factory.yml`
- Modify: `Taskfile.yml` (add to `includes:`)
- Modify: `scripts/factory/README.md`, `docs/superpowers/references/factory-usage.md`

- [ ] **Step 1: Add a failing check for the broken doc reference**

Run:
```bash
ref=$(grep -o "docs/superpowers/plans/[0-9-]*software-factory[a-z-]*\.md" scripts/factory/README.md | head -1)
echo "referenced: $ref"; test -f "$ref" && echo EXISTS || echo "MISSING (bug)"
```
Expected: `MISSING (bug)`.

- [ ] **Step 2: Create the factory Taskfile**

Create `Taskfile.factory.yml`:
```yaml
version: '3'

tasks:
  run:
    desc: |
      Print how to invoke the Phase-1 Software Factory pipeline.
      The pipeline is a Claude Code Workflow script run by the harness Workflow
      tool — NOT `node scripts/factory/pipeline.js` (agent/parallel/pipeline are
      harness globals). This target only documents the invocation.
    silent: true
    cmds:
      - |
        echo "Software Factory — Phase 1 pipeline"
        echo "Invoke via the Claude Code Workflow tool with scripts/factory/pipeline.js and args:"
        echo '  { title, description, slug, ticket_id, brand: mentolder|korczewski, timestamp }'
        echo "Offline lint: node --check scripts/factory/pipeline.js"
        echo "Contract tests: ./tests/runner.sh local FA-SF-20"
```

- [ ] **Step 3: Wire it into the root Taskfile**

In `Taskfile.yml` under `includes:` (around L4), add following the existing pattern:
```yaml
  factory:
    taskfile: ./Taskfile.factory.yml
```

- [ ] **Step 4: Fix the broken plan reference + status badges**

In `scripts/factory/README.md`:
- Replace the broken `...software-factory-polish.md` reference with `docs/superpowers/plans/2026-06-05-software-factory-phase1.md`.
- In the component table, change the pipeline row to point at `scripts/factory/pipeline.js` (✅ runnable as of this work) and keep Dispatcher/Workflow-Runner-cron as 🔜 Phase 2.

In `docs/superpowers/references/factory-usage.md`: update the ✅/🔜 markers so Scout semantic search (now real after T3-T5) and the runnable pipeline (T8) are ✅; keep the cron Dispatcher 🔜.

- [ ] **Step 5: Verify the Taskfile parses and the reference resolves**

Run:
```bash
task --list 2>/dev/null | grep factory:run && echo TASK_OK
ref=$(grep -o "docs/superpowers/plans/[0-9-]*software-factory[a-z-]*\.md" scripts/factory/README.md | head -1)
test -f "$ref" && echo REF_OK
```
Expected: `TASK_OK` and `REF_OK`. (The Taskfile dry-run gate in `task test:all` must still pass.)

- [ ] **Step 6: Commit**

```bash
git add Taskfile.factory.yml Taskfile.yml scripts/factory/README.md docs/superpowers/references/factory-usage.md
git commit -m "docs(factory): add task factory:run wrapper + fix broken plan ref & status badges [T000413]"
```

---

## Final verification (run before opening the PR)

- [ ] Offline gate green: `task test:all`
- [ ] Manifests valid: `task workspace:validate`
- [ ] Inventory in sync: `task test:inventory && git diff --quiet website/src/data/test-inventory.json && echo INVENTORY_CLEAN`
- [ ] Website unit tests green: `cd website && npx vitest run src/lib/tickets-embed.test.ts`
- [ ] Pipeline syntax: `node --check scripts/factory/pipeline.js && echo PIPELINE_OK`
- [ ] Live schema parity (both brands), per Task 1 Step 5 — re-run on `workspace` and `workspace-korczewski`.
- [ ] Run the backfill once per brand (execution-time, document outputs in the PR): point `SESSIONS_DATABASE_URL` at each brand's shared-db and run `website/scripts/backfill-ticket-embeddings.mjs`, then confirm `findSimilarTickets` returns rows.

---

## Self-Review notes (spec coverage)

- Spec §5 (Context Pool: `touched_files`, `pipeline_slot`, `ticket_embeddings`, `fn_find_similar`, `v_factory_metrics`, `v_active_features`) → T1 (verify live) + T2 (model isolation) + T3/T4/T5 (populate + query + backfill).
- Spec §6 (Quality Gates: Layer-3 adversarial panel) → T8 Verify phase loads the three `review-*.prompt.md`; HIGH/CRITICAL → ticket blocked + escalate. Layer-1/2 (local `task test:all`/`workspace:validate`) → T8 Implement phase. Layer-4 canary is explicitly out of Phase-1 scope.
- Spec §7 (Phase 1 = Workflow script, single feature, N parallel tasks; manual dispatcher) → T8 (`pipeline.js`) + T9 (`task factory:run`). Cron Dispatcher (Tier 1) deferred to Phase 2.
- Spec §8 (Scope) → all "In Scope" items covered; all "Out of Scope (Phase 3)" items excluded.
- Decisions: auto-merge + both-brand deploy → T8 Deploy phase; full embeddings → T2-T5; both brands → T7 + T8.
