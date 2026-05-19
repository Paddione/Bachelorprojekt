---
ticket_id: T000528
title: JSON Knowledge Source Ingest — Implementation Plan
domains: []
status: active
pr_number: null
---

# JSON Knowledge Source Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable ingesting pre-chunked JSON files (`[{id, content, metadata}]`) directly into `knowledge.collections` via CLI and Admin UI with SSE progress.

**Architecture:** Shared core `ingest-json-core.ts` (accepts `pg.Pool`) handles validation + embed loop + DB writes. CLI (`ingest-json.mts`) passes `makePool()` from `lib-knowledge-pg.mjs`. Astro SSE endpoint (`/api/admin/knowledge/import/json.ts`) creates its own pool, streams progress. Svelte component reads SSE via `fetch` + `response.body` stream.

**Tech Stack:** TypeScript/tsx, pg (node-postgres), Voyage AI embeddings, Astro API routes, Svelte 5, BATS

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `website/src/lib/ingest-json-core.ts` | CREATE | Validation + embed loop + DB writes; accepts `pg.Pool` |
| `scripts/coaching/ingest-json.mts` | CREATE | CLI entry point; uses `makePool()` from lib-knowledge-pg |
| `Taskfile.yml` | MODIFY | Add `coaching:ingest-json` task |
| `website/src/pages/api/admin/knowledge/import/json.ts` | CREATE | SSE POST endpoint for browser upload |
| `website/src/components/admin/KnowledgeJsonImport.svelte` | CREATE | Upload form + progress bar (Svelte 5) |
| `website/src/pages/admin/wissensquellen.astro` | MODIFY | Add "+ JSON importieren" button + mount component |
| `tests/unit/coaching-json-ingest.bats` | CREATE | Offline structural + argument-validation tests |

---

### Task 1: Shared Core — `website/src/lib/ingest-json-core.ts`

**Files:**
- Create: `website/src/lib/ingest-json-core.ts`

- [ ] **Step 1: Write the file**

```typescript
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { embedBatch } from './embeddings.js';

export interface JsonKnowledgeEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IngestJsonOpts {
  entries: JsonKnowledgeEntry[];
  slug: string;
  brand?: string | null;
  sourceUri: string;
}

export interface IngestJsonResult {
  collectionId: string;
  chunkCount: number;
}

export function validateJsonEntries(raw: unknown): JsonKnowledgeEntry[] {
  if (!Array.isArray(raw)) throw new Error('JSON muss ein Array sein');
  if (raw.length === 0) throw new Error('Array ist leer');
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null)
      throw new Error(`Eintrag ${i}: kein Objekt`);
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id)
      throw new Error(`Eintrag ${i}: Pflichtfeld "id" fehlt oder leer`);
    if (typeof e.content !== 'string' || !e.content.trim())
      throw new Error(`Eintrag ${i}: Pflichtfeld "content" fehlt oder leer`);
    return {
      id: e.id,
      content: e.content,
      metadata:
        typeof e.metadata === 'object' && e.metadata !== null
          ? (e.metadata as Record<string, unknown>)
          : undefined,
    };
  });
}

export async function ingestJsonChunks(
  pool: Pool,
  opts: IngestJsonOpts,
  onProgress: (done: number, total: number) => void | Promise<void>,
): Promise<IngestJsonResult> {
  const { entries, slug, brand, sourceUri } = opts;

  // Ensure collection
  const colRes = await pool.query<{ id: string }>(
    `INSERT INTO knowledge.collections (name, source, brand, description)
     VALUES ($1, 'custom', $2, $3)
     ON CONFLICT (name) DO UPDATE
       SET description = COALESCE(EXCLUDED.description, knowledge.collections.description)
     RETURNING id`,
    [slug, brand ?? null, slug],
  );
  const collectionId = colRes.rows[0].id;

  // Ensure document (idempotent via ON CONFLICT on source_uri)
  const rawText = JSON.stringify(entries);
  const hash = createHash('sha256').update(rawText).digest('hex');
  const docRes = await pool.query<{ id: string }>(
    `INSERT INTO knowledge.documents
       (collection_id, title, source_uri, raw_text, sha256, metadata)
     VALUES ($1, $2, $3, $4, $5, '{}')
     ON CONFLICT (collection_id, source_uri) DO UPDATE
       SET title    = EXCLUDED.title,
           raw_text = EXCLUDED.raw_text,
           sha256   = EXCLUDED.sha256
     RETURNING id`,
    [collectionId, slug, sourceUri, rawText, hash],
  );
  const documentId = docRes.rows[0].id;

  // Delete old chunks (re-import is idempotent)
  await pool.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [documentId]);

  const BATCH = 8;
  const total = entries.length;
  await onProgress(0, total);

  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const texts = slice.map((e) => e.content);

    const { embeddings } = await embedBatch(texts, { purpose: 'index' });

    for (let j = 0; j < slice.length; j++) {
      const entry = slice[j];
      const chunkMeta = { source_id: entry.id, ...(entry.metadata ?? {}) };
      await pool.query(
        `INSERT INTO knowledge.chunks
           (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          documentId,
          collectionId,
          i + j,
          entry.content,
          `[${embeddings[j].join(',')}]`,
          JSON.stringify(chunkMeta),
        ],
      );
    }

    await onProgress(Math.min(i + BATCH, total), total);
  }

  // Update chunk_count + last_indexed_at
  await pool.query(
    `UPDATE knowledge.collections
        SET chunk_count = $2, last_indexed_at = now()
      WHERE id = $1`,
    [collectionId, total],
  );

  return { collectionId, chunkCount: total };
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/coaching-json-ingest
git add website/src/lib/ingest-json-core.ts
git commit -m "feat(knowledge): add ingest-json-core shared embed+DB logic"
```

---

### Task 2: CLI entry point — `scripts/coaching/ingest-json.mts`

**Files:**
- Create: `scripts/coaching/ingest-json.mts`

- [ ] **Step 1: Write the file**

```typescript
#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
// eslint-disable-next-line import/extensions
import { makePool } from '../knowledge/lib-knowledge-pg.mjs';
import { validateJsonEntries, ingestJsonChunks } from '../../website/src/lib/ingest-json-core.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ingest-json.mts <file.json> <slug> [--brand=mentolder|korczewski]');
    process.exit(2);
  }
  const [filePath, slug, ...rest] = args;
  const brand = rest.find((a) => a.startsWith('--brand='))?.split('=')[1] ?? null;

  console.log(`[ingest-json] reading ${filePath}…`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[ingest-json] JSON parse error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const entries = validateJsonEntries(raw);
  console.log(`[ingest-json] ${entries.length} Einträge validiert`);

  const pool = makePool();
  try {
    const result = await ingestJsonChunks(
      pool,
      {
        entries,
        slug,
        brand,
        sourceUri: `file://${basename(filePath)}`,
      },
      (done, total) => {
        if (total > 0) process.stdout.write(`\r[ingest-json] ${done}/${total} Chunks embedded`);
      },
    );
    console.log(`\n[ingest-json] done. collectionId=${result.collectionId}, chunks=${result.chunkCount}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/coaching/ingest-json.mts
git commit -m "feat(knowledge): add ingest-json CLI entry point"
```

---

### Task 3: Taskfile.yml — `coaching:ingest-json` task

**Files:**
- Modify: `Taskfile.yml` (after the `coaching:ingest` task, around line 3332)

- [ ] **Step 1: Add the task** — insert after the `coaching:ingest` block (after line 3331):

```yaml
  coaching:ingest-json:
    desc: "Ingest a pre-chunked JSON file into a knowledge collection. Args: -- <file.json> <slug> [--brand=mentolder|korczewski]"
    cmds:
      - source scripts/env-resolve.sh "${ENV:-dev}" && cd website && npx tsx ../scripts/coaching/ingest-json.mts {{.CLI_ARGS}}
```

- [ ] **Step 2: Verify task is registered**

```bash
task --list 2>/dev/null | grep "coaching:ingest-json"
```

Expected output includes: `coaching:ingest-json`

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(knowledge): add coaching:ingest-json Taskfile task"
```

---

### Task 4: SSE API endpoint — `website/src/pages/api/admin/knowledge/import/json.ts`

**Files:**
- Create: `website/src/pages/api/admin/knowledge/import/json.ts`
  (Also creates the `import/` directory)

- [ ] **Step 1: Write the file**

```typescript
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { validateJsonEntries, ingestJsonChunks } from '../../../../../lib/ingest-json-core';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Form-Daten' }), { status: 400 });
  }

  const file = formData.get('file');
  const slug = (formData.get('slug') as string | null)?.trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug erforderlich' }), { status: 400 });
  }
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'file erforderlich' }), { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (err) {
    return new Response(JSON.stringify({ error: `JSON-Fehler: ${err instanceof Error ? err.message : err}` }), { status: 422 });
  }

  let entries: ReturnType<typeof validateJsonEntries>;
  try {
    entries = validateJsonEntries(raw);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 422 });
  }

  const pool = new Pool({
    connectionString:
      process.env.SESSIONS_DATABASE_URL
      || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website',
  });

  const encoder = new TextEncoder();
  const sse = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sse({ type: 'start', total: entries.length }));
      try {
        const result = await ingestJsonChunks(
          pool,
          { entries, slug, sourceUri: `file://${file.name}` },
          (done, total) => {
            controller.enqueue(sse({ type: 'progress', done, total }));
          },
        );
        controller.enqueue(sse({ type: 'done', ...result, slug }));
      } catch (err) {
        controller.enqueue(sse({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
      } finally {
        controller.close();
        await pool.end();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/admin/knowledge/import/json.ts
git commit -m "feat(knowledge): add SSE JSON import API endpoint"
```

---

### Task 5: Admin UI — `KnowledgeJsonImport.svelte`

**Files:**
- Create: `website/src/components/admin/KnowledgeJsonImport.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  let open = $state(false);
  let slug = $state('');
  let file = $state<File | null>(null);
  let status: 'idle' | 'uploading' | 'done' | 'error' = $state('idle');
  let done = $state(0);
  let total = $state(0);
  let errorMsg = $state('');
  let collectionId = $state('');

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
    if (file && !slug) slug = file.name.replace(/\.json$/i, '');
  }

  function openModal() {
    open = true;
    slug = '';
    file = null;
    status = 'idle';
    done = 0;
    total = 0;
    errorMsg = '';
    collectionId = '';
  }

  function closeModal() {
    if (status === 'uploading') return;
    open = false;
  }

  async function submit() {
    if (!file || !slug.trim()) return;
    status = 'uploading';
    done = 0;
    total = 0;
    errorMsg = '';

    const fd = new FormData();
    fd.append('file', file);
    fd.append('slug', slug.trim());

    let response: Response;
    try {
      response = await fetch('/api/admin/knowledge/import/json', { method: 'POST', body: fd });
    } catch (err) {
      status = 'error';
      errorMsg = err instanceof Error ? err.message : 'Netzwerkfehler';
      return;
    }

    if (!response.ok || !response.body) {
      status = 'error';
      errorMsg = `HTTP ${response.status}`;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          if (event.type === 'start') total = event.total as number;
          if (event.type === 'progress') done = event.done as number;
          if (event.type === 'done') {
            done = total;
            collectionId = event.collectionId as string;
            status = 'done';
          }
          if (event.type === 'error') {
            status = 'error';
            errorMsg = event.message as string;
          }
        } catch { /* malformed SSE line — ignore */ }
      }
    }

    if (status === 'uploading') {
      status = 'error';
      errorMsg = 'Verbindung unterbrochen. Erneut versuchen (Import ist idempotent).';
    }
  }

  // Listen for open event dispatched from wissensquellen.astro
  if (typeof window !== 'undefined') {
    window.addEventListener('open-json-import-modal', openModal);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={closeModal}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>JSON-Wissensquelle importieren</h2>

      <label>
        Collection-Name (Slug)
        <input type="text" bind:value={slug} placeholder="z.B. ki-brueckenschlag" disabled={status === 'uploading'} />
      </label>

      <label>
        JSON-Datei
        <input type="file" accept=".json" onchange={onFileChange} disabled={status === 'uploading'} />
      </label>

      {#if status === 'uploading' || status === 'done'}
        <div class="progress-wrap">
          <div class="progress-bar" style="width: {total > 0 ? Math.round((done / total) * 100) : 0}%"></div>
        </div>
        <p class="progress-label">{done} / {total} Chunks</p>
      {/if}

      {#if status === 'done'}
        <p class="success">✓ Fertig — {done} Chunks in "{slug}" importiert.</p>
        <button class="primary" onclick={() => { closeModal(); location.reload(); }}>Schließen</button>
      {:else if status === 'error'}
        <p class="error">{errorMsg}</p>
        <div class="actions">
          <button class="primary" onclick={submit} disabled={!file || !slug.trim()}>Erneut versuchen</button>
          <button class="secondary" onclick={closeModal}>Abbrechen</button>
        </div>
      {:else}
        <div class="actions">
          <button class="primary" onclick={submit} disabled={!file || !slug.trim() || status === 'uploading'}>
            {status === 'uploading' ? 'Importiere…' : 'Importieren'}
          </button>
          <button class="secondary" onclick={closeModal}>Abbrechen</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: var(--color-surface, #fff); padding: 2rem; border-radius: 8px;
    min-width: 380px; max-width: 500px; display: flex; flex-direction: column; gap: 1rem;
  }
  label { display: flex; flex-direction: column; gap: .25rem; font-size: .9rem; }
  input[type=text], input[type=file] { padding: .4rem .6rem; border: 1px solid var(--color-border, #ccc); border-radius: 4px; }
  .progress-wrap { height: 8px; background: var(--color-border, #eee); border-radius: 4px; overflow: hidden; }
  .progress-bar { height: 100%; background: var(--color-accent, #4a90e2); transition: width .2s; }
  .progress-label { font-size: .85rem; color: var(--color-muted, #888); margin: 0; }
  .success { color: var(--color-success, green); }
  .error { color: var(--color-danger, red); font-size: .9rem; }
  .actions { display: flex; gap: .5rem; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/KnowledgeJsonImport.svelte
git commit -m "feat(knowledge): add KnowledgeJsonImport Svelte component"
```

---

### Task 6: Wire into `wissensquellen.astro`

**Files:**
- Modify: `website/src/pages/admin/wissensquellen.astro`

- [ ] **Step 1: Add import** — add after line 5 (after the last import in the frontmatter):

```astro
import KnowledgeJsonImport from '../../components/admin/KnowledgeJsonImport.svelte';
```

- [ ] **Step 2: Add button** — in the `head-actions` div (around line 31), add after the `+ Neue Wissensquelle` button:

```astro
<button id="new-json-btn" class="secondary">+ JSON importieren</button>
```

- [ ] **Step 3: Mount component** — add after line 111 (after the `CollectionMergePanel`):

```astro
<KnowledgeJsonImport client:load />
```

- [ ] **Step 4: Add event listener** — in the `<script is:inline>` block (after `new-crawl-btn` listener, around line 123):

```javascript
document.getElementById('new-json-btn').addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('open-json-import-modal'));
});
```

- [ ] **Step 5: Verify dev server renders page without errors**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/coaching-json-ingest/website
BRAND_ID=mentolder npx astro dev --port 4322 &
sleep 8
curl -s http://localhost:4322/admin/wissensquellen | grep -q "JSON importieren" && echo "OK" || echo "FAIL"
kill %1
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/coaching-json-ingest
git add website/src/pages/admin/wissensquellen.astro
git commit -m "feat(knowledge): wire JSON import button into wissensquellen admin page"
```

---

### Task 7: BATS test — `tests/unit/coaching-json-ingest.bats`

**Files:**
- Create: `tests/unit/coaching-json-ingest.bats`
- Create: `tests/unit/fixtures/sample-knowledge.json` (3-entry test fixture)

- [ ] **Step 1: Create fixture file**

```json
[
  {
    "id": "test-entry-1",
    "content": "Test content für Coaching-Einheit 1. Enthält ausreichend Text für Embedding.",
    "metadata": { "type": "test", "language": "de" }
  },
  {
    "id": "test-entry-2",
    "content": "Test content für Coaching-Einheit 2. Zweiter Eintrag für die Testsammlung.",
    "metadata": { "type": "test", "language": "de" }
  },
  {
    "id": "test-entry-3",
    "content": "Test content für Coaching-Einheit 3. Dritter und letzter Testeintrag.",
    "metadata": { "type": "test", "language": "de" }
  }
]
```

Save to: `tests/unit/fixtures/sample-knowledge.json`

- [ ] **Step 2: Write BATS test**

```bash
#!/usr/bin/env bats

load test_helper

@test "coaching:ingest-json task exists in Taskfile.yml" {
  run grep -c "coaching:ingest-json:" "${PROJECT_DIR}/Taskfile.yml"
  assert_success
  assert_output "1"
}

@test "ingest-json.mts script exists" {
  run test -f "${PROJECT_DIR}/scripts/coaching/ingest-json.mts"
  assert_success
}

@test "ingest-json-core.ts exists in website/src/lib" {
  run test -f "${PROJECT_DIR}/website/src/lib/ingest-json-core.ts"
  assert_success
}

@test "ingest-json.mts exits 2 with no args (usage error, no DB needed)" {
  run bash -c "cd '${PROJECT_DIR}/website' && npx tsx ../scripts/coaching/ingest-json.mts 2>&1; echo EXIT:\$?"
  assert_output --partial "EXIT:2"
  assert_output --partial "Usage:"
}

@test "ingest-json.mts exits 1 on malformed JSON content" {
  local bad_json="${BATS_TEST_TMPDIR}/bad.json"
  echo '[{"id":"x"}]' > "$bad_json"
  run bash -c "PGHOST=127.0.0.1 PGPORT=1 cd '${PROJECT_DIR}/website' && npx tsx ../scripts/coaching/ingest-json.mts '$bad_json' test-slug 2>&1; echo EXIT:\$?"
  # Should fail validation (missing content) before touching DB
  assert_output --partial "content fehlt"
}
```

Save to: `tests/unit/coaching-json-ingest.bats`

- [ ] **Step 3: Run tests offline**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/coaching-json-ingest
task test:unit 2>&1 | grep -E "coaching-json|PASS|FAIL|ok|not ok" | head -20
```

Expected: All 5 tests pass (tests 1–3 are file-existence checks; test 4 catches usage error before DB; test 5 catches validation error before DB connect).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/coaching-json-ingest.bats tests/unit/fixtures/sample-knowledge.json
git commit -m "test(knowledge): add BATS tests for coaching:ingest-json"
```

---

### Task 8: Final verification + push

- [ ] **Step 1: Run full offline test suite**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/coaching-json-ingest
task test:all 2>&1 | tail -20
```

Expected: exit 0, no failures.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/coaching-json-ingest
```

- [ ] **Step 3: Smoke-test the CLI manually** (requires `task workspace:port-forward ENV=mentolder` in a separate terminal):

```bash
PGHOST=localhost PGPASSWORD=<website-db-pw> \
task coaching:ingest-json ENV=mentolder -- \
  "/mnt/c/Users/PatrickKorczewski/OneDrive - Core-IT/Desktop/KI_pgvector.json" \
  ki-brueckenschlag
```

Expected output ends with:
```
39/39 Chunks embedded
[ingest-json] done. collectionId=<uuid>, chunks=39
```

Verify in DB:
```bash
task workspace:psql ENV=mentolder -- website -c \
  "SELECT name, chunk_count FROM knowledge.collections WHERE name='ki-brueckenschlag';"
```

Expected: 1 row, `chunk_count=39`.
