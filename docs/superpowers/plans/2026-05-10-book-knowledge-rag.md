# Book Knowledge RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gekko can upload third-party coaching books via the admin UI, then flip a toggle in the AI assistant so every reply draws on indexed book content via vector search + Claude.

**Architecture:** Five sequential tasks wire the backend (Claude LLM + RAG into `llm.ts`, `chat.ts`), then three tasks build the frontend (toggle in `AssistantChat.svelte`, badge in `AssistantMessage.svelte`, upload form in `BookUploadForm.svelte` + `books/index.astro`), and finally one task adds the upload endpoint. Build order: backend first so the toggle works even if no upload UI exists yet (books can still be added via CLI for smoke-testing).

**Tech Stack:** TypeScript + Astro + Svelte 5 (runes), Anthropic SDK (`@anthropic-ai/sdk`), pgvector (`queryNearest` in `lib/knowledge-db.ts`), pdf-parse (`pdf-parse/lib/pdf-parse.js`), epub2, vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-10-book-knowledge-rag-design.md`

---

## File Map

| File | Change |
|------|--------|
| `website/src/lib/assistant/llm.ts` | Replace body — add Claude call, keep keyword fallback when no API key |
| `website/src/lib/assistant/llm.test.ts` | Extend — add mock tests for Claude path + RAG injection |
| `website/src/lib/assistant/types.ts` | Modify — add `sourcesUsed?: number` to `AssistantChatResult` |
| `website/src/lib/assistant/coaching-collections.ts` | NEW — resolves coaching book collection IDs with 60s cache |
| `website/src/pages/api/assistant/chat.ts` | Modify — accept `useBooks`, return `sourcesUsed` |
| `website/src/components/assistant/AssistantChat.svelte` | Modify — add `useBooks` toggle + pass to API |
| `website/src/components/assistant/AssistantMessage.svelte` | Modify — accept `sourcesUsed` prop, show badge |
| `website/src/pages/api/admin/coaching/books/upload.ts` | NEW — multipart PDF/EPUB upload + ingestion |
| `website/src/components/admin/BookUploadForm.svelte` | NEW — drag-drop upload form with progress |
| `website/src/pages/admin/knowledge/books/index.astro` | Modify — embed `BookUploadForm` |

---

## Task 1: Extend AssistantChatResult type

**Files:**
- Modify: `website/src/lib/assistant/types.ts`

- [ ] **Step 1: Find `AssistantChatResult` in types.ts**

```bash
grep -n "AssistantChatResult\|proposedAction" website/src/lib/assistant/types.ts
```

- [ ] **Step 2: Add `sourcesUsed` field**

Open `website/src/lib/assistant/types.ts`. Find the `AssistantChatResult` interface and add the optional field:

```typescript
export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
  sourcesUsed?: number;
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (the field is optional, nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/assistant/types.ts
git commit -m "feat(assistant): add sourcesUsed to AssistantChatResult"
```

---

## Task 2: Coaching collection ID resolver

**Files:**
- Create: `website/src/lib/assistant/coaching-collections.ts`

This module resolves all coaching book collection IDs from the DB and caches them for 60 seconds, avoiding a DB round trip on every chat message.

- [ ] **Step 1: Write the failing test**

Open `website/src/lib/assistant/llm.test.ts` and append:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resolveCoachingCollectionIds, __resetCacheForTests } from './coaching-collections';
import { Pool } from 'pg';

describe('resolveCoachingCollectionIds', () => {
  beforeEach(() => {
    __resetCacheForTests();
  });

  it('returns collection IDs from coaching.books joined to knowledge.collections', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ collection_id: 'abc-123' }, { collection_id: 'def-456' }],
      }),
    } as unknown as Pool;

    const ids = await resolveCoachingCollectionIds(mockPool);
    expect(ids).toEqual(['abc-123', 'def-456']);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('uses cached result on second call within 60s', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ collection_id: 'abc-123' }] }),
    } as unknown as Pool;

    await resolveCoachingCollectionIds(mockPool);
    await resolveCoachingCollectionIds(mockPool);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no books exist', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;

    const ids = await resolveCoachingCollectionIds(mockPool);
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -15
```

Expected: FAIL — `resolveCoachingCollectionIds` not found.

- [ ] **Step 3: Create the module**

Create `website/src/lib/assistant/coaching-collections.ts`:

```typescript
import { Pool } from 'pg';

interface Cache {
  ids: string[];
  expiresAt: number;
}

let _cache: Cache | null = null;

export function __resetCacheForTests(): void {
  _cache = null;
}

export async function resolveCoachingCollectionIds(pool: Pool): Promise<string[]> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.ids;

  const r = await pool.query(`
    SELECT b.knowledge_collection_id AS collection_id
      FROM coaching.books b
      JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
     WHERE c.source = 'custom'
  `);
  const ids = r.rows.map((row: { collection_id: string }) => row.collection_id);
  _cache = { ids, expiresAt: Date.now() + 60_000 };
  return ids;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -15
```

Expected: all tests pass (existing keyword tests + new resolver tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/coaching-collections.ts website/src/lib/assistant/llm.test.ts
git commit -m "feat(assistant): add coaching collection ID resolver with 60s cache"
```

---

## Task 3: Wire Claude + RAG into llm.ts

**Files:**
- Modify: `website/src/lib/assistant/llm.ts`
- Modify: `website/src/lib/assistant/llm.test.ts`

- [ ] **Step 1: Add mock tests for Claude path**

Append to the `describe` block in `website/src/lib/assistant/llm.test.ts`:

```typescript
import { assistantChat } from './llm';

// These run with mocked Anthropic — the module is already imported above.
// Re-require happens via vi.mock hoisting.

describe('assistantChat — Claude path', () => {
  it('returns Claude reply when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const result = await assistantChat({
      profile: 'admin',
      userSub: 'u',
      messages: [{ role: 'user', content: 'Wie geht Geissler mit Abwehr um?' }],
      context: { currentRoute: '/admin' },
    });
    expect(result.reply).toBe('mocked claude response');
    expect(result.sourcesUsed).toBe(0);
    delete process.env.ANTHROPIC_API_KEY;
  });
});
```

Add the Anthropic mock at the **top** of `llm.test.ts`, before any imports:

```typescript
import { vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'mocked claude response' }],
      }),
    },
  })),
}));
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -15
```

Expected: FAIL — Claude path not implemented.

- [ ] **Step 3: Replace llm.ts body**

Replace the entire contents of `website/src/lib/assistant/llm.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import type { AssistantProfile, Message, ProposedAction } from './types';
import { searchHelp, formatHit, noMatchReply } from './search';
import { queryNearest } from '../knowledge-db';
import { resolveCoachingCollectionIds } from './coaching-collections';

export interface AssistantChatInput {
  profile: AssistantProfile;
  userSub: string;
  messages: Array<Pick<Message, 'role' | 'content'>>;
  context: AssistantContext;
}

export interface AssistantContext {
  currentRoute: string;
  counts?: Record<string, number>;
  [k: string]: unknown;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
  sourcesUsed?: number;
}

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool();
  return _pool;
}

const SYSTEM_PROMPT = `Du bist der interne Assistent von ${process.env.BRAND_NAME ?? 'Mentolder'}. Du hilfst dem Coach bei seiner Arbeit — Klientenvorbereitung, Terminplanung, Gesprächsreflexion und Wissensarbeit. Antworte präzise und auf Deutsch. Wenn du Buchpassagen erhältst, zitiere konkret und nenne Seite wenn vorhanden.`;

export async function assistantChat(input: AssistantChatInput): Promise<AssistantChatResult> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content.trim()) {
    return { reply: 'Frag mich etwas — ich bin für dich da.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: keyword search (dev without API key)
    const hit = searchHelp(lastUser.content, input.profile);
    if (!hit) return { reply: noMatchReply(input.profile) };
    return { reply: formatHit(hit) };
  }

  let sourcesUsed = 0;
  let systemPrompt = SYSTEM_PROMPT;

  const useBooks = input.context.useBooks === true;
  if (useBooks) {
    const collectionIds = await resolveCoachingCollectionIds(getPool());
    if (collectionIds.length > 0) {
      const chunks = await queryNearest({
        collectionIds,
        queryText: lastUser.content,
        limit: 4,
        threshold: 0.62,
      });
      if (chunks.length > 0) {
        sourcesUsed = chunks.length;
        const passages = chunks
          .map((c, i) => `[${i + 1}] ${c.text}`)
          .join('\n\n');
        systemPrompt += `\n\n<Quellenpassagen>\n${passages}\n</Quellenpassagen>`;
      }
    }
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: input.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { reply, sourcesUsed };
}
```

- [ ] **Step 4: Run all tests — expect pass**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -20
```

Expected: all tests pass. The existing keyword tests still pass because they run without `ANTHROPIC_API_KEY` set.

- [ ] **Step 5: Check TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/assistant/llm.ts website/src/lib/assistant/llm.test.ts
git commit -m "feat(assistant): wire Claude LLM + RAG into assistantChat"
```

---

## Task 4: Thread useBooks through chat.ts + return sourcesUsed

**Files:**
- Modify: `website/src/pages/api/assistant/chat.ts`

- [ ] **Step 1: Open the file**

```bash
cat website/src/pages/api/assistant/chat.ts
```

- [ ] **Step 2: Add useBooks to body parsing and response**

Replace the entire file contents:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import {
  getOrCreateActiveConversation,
  appendMessage,
  loadHistory,
} from '../../../lib/assistant/conversations';
import { assistantChat } from '../../../lib/assistant/llm';
import type { AssistantProfile } from '../../../lib/assistant/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { profile: AssistantProfile; content: string; currentRoute?: string; useBooks?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { profile, content, currentRoute = '/', useBooks = false } = body;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);
  if (typeof content !== 'string' || !content.trim()) return json({ error: 'empty content' }, 400);

  const conv = await getOrCreateActiveConversation(session.sub, profile);
  await appendMessage(conv.id, 'user', content);
  const history = await loadHistory(conv.id);

  const result = await assistantChat({
    profile,
    userSub: session.sub,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    context: { currentRoute, useBooks },
  });

  const stored = await appendMessage(conv.id, 'assistant', result.reply, result.proposedAction);

  return json({ message: stored, sourcesUsed: result.sourcesUsed ?? 0 });
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/assistant/chat.ts
git commit -m "feat(assistant): pass useBooks flag through chat API, return sourcesUsed"
```

---

## Task 5: Toggle button in AssistantChat.svelte

**Files:**
- Modify: `website/src/components/assistant/AssistantChat.svelte`

- [ ] **Step 1: Read the current file**

```bash
cat website/src/components/assistant/AssistantChat.svelte
```

- [ ] **Step 2: Add useBooks state with sessionStorage persistence**

In the `<script>` block, after the existing state declarations, add:

```typescript
let useBooks = $state(sessionStorage.getItem('assistant-use-books') === '1');

function toggleBooks() {
  useBooks = !useBooks;
  sessionStorage.setItem('assistant-use-books', useBooks ? '1' : '0');
}
```

- [ ] **Step 3: Pass useBooks in the fetch call**

In the `send` function, update the fetch body:

```typescript
body: JSON.stringify({ profile, content, currentRoute: location.pathname, useBooks }),
```

Also update the response handling to capture `sourcesUsed`:

```typescript
const data = await res.json();
if (data?.message) {
  messages = [
    ...messages,
    { id: 'optimistic-' + Date.now(), conversationId: '', role: 'user', content, createdAt: new Date().toISOString() },
    { ...data.message, sourcesUsed: data.sourcesUsed ?? 0 },
  ];
}
```

Update the messages type annotation at the top:

```typescript
let messages = $state<(Message & { sourcesUsed?: number })[]>([]);
```

- [ ] **Step 4: Add the toggle button to the form**

After the `<input>` in the `<form>`, and before the closing `</form>` tag, add:

```svelte
<div style="display: flex; justify-content: flex-end; margin-top: 4px;">
  <button
    type="button"
    onclick={toggleBooks}
    style="display: flex; align-items: center; gap: 4px; padding: 2px 8px;
           background: {useBooks ? 'rgba(215,176,106,.15)' : 'transparent'};
           border: 1px solid {useBooks ? '#d7b06a' : 'var(--line)'};
           border-radius: 12px; font-size: 10px; cursor: pointer;
           color: {useBooks ? '#d7b06a' : 'var(--mute)'}; font-family: inherit;"
    title="Coaching-Bücher in die Antwort einbeziehen"
  >
    {#if useBooks}
      <span style="width: 6px; height: 6px; background: #d7b06a; border-radius: 50%; display: inline-block;"></span>
    {/if}
    📚 {useBooks ? 'Bücher aktiv' : 'Bücher'}
  </button>
</div>
```

- [ ] **Step 5: Pass sourcesUsed to AssistantMessage**

In the `{#each messages as m (m.id)}` loop, update the `<AssistantMessage>` line:

```svelte
<AssistantMessage message={m} sourcesUsed={m.sourcesUsed ?? 0} />
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add website/src/components/assistant/AssistantChat.svelte
git commit -m "feat(assistant): add Bücher-toggle button with sessionStorage persistence"
```

---

## Task 6: Sources badge in AssistantMessage.svelte

**Files:**
- Modify: `website/src/components/assistant/AssistantMessage.svelte`

- [ ] **Step 1: Add sourcesUsed prop and badge**

Replace the entire file:

```svelte
<script lang="ts">
  import type { Message } from '../../lib/assistant/types';
  let { message, sourcesUsed = 0 }: { message: Message; sourcesUsed?: number } = $props();
  const isUser = $derived(message.role === 'user');
</script>

<div
  class="msg"
  class:in={!isUser}
  class:out={isUser}
  style="font-size: 12px; line-height: 1.45; padding: 7px 10px; border-radius: 8px; max-width: 80%;
         font-family: var(--font-sans); color: var(--fg);"
>
  {#if !isUser && sourcesUsed > 0}
    <div style="font-size: 10px; color: #d7b06a; margin-bottom: 4px; opacity: .85;">
      📚 {sourcesUsed} {sourcesUsed === 1 ? 'Passage' : 'Passagen'} aus Coaching-Büchern
    </div>
  {/if}
  {message.content}
</div>

<style>
  .msg.in  { background: var(--ink-900); border: 1px solid var(--line); align-self: flex-start; border-radius: 8px 8px 8px 2px; }
  .msg.out { background: rgba(215,176,106,.16); border: 1px solid #d7b06a; align-self: flex-end; border-radius: 8px 8px 2px 8px; }
</style>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Smoke test — start dev server and open assistant**

```bash
cd website && npm run dev &
# Open http://localhost:4321/admin in browser
# Open assistant widget, send a message without toggle → no badge
# Enable toggle → badge should appear with chunk count once books are indexed
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/assistant/AssistantMessage.svelte
git commit -m "feat(assistant): show Passagen-badge when RAG sources were used"
```

---

## Task 7: Book upload endpoint

**Files:**
- Create: `website/src/pages/api/admin/coaching/books/upload.ts`

This endpoint accepts a PDF or EPUB file upload, extracts text, chunks it, embeds it, and stores it in `coaching.books` + `knowledge.collections/chunks`. It mirrors `scripts/coaching/ingest-book.mts` using the same shared library functions.

- [ ] **Step 1: Create the endpoint**

Create `website/src/pages/api/admin/coaching/books/upload.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { Pool } from 'pg';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import EPub from 'epub2';
import { chunkText } from '../../../../../../lib/chunking';
import { embedBatch } from '../../../../../../lib/embeddings';
import {
  ensureCollection,
  addDocument,
  upsertChunks,
  recountChunks,
} from '../../../../../../lib/knowledge-db';

const pool = new Pool();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'unauthorized' }, 401);

  let formData: FormData;
  try { formData = await request.formData(); } catch { return json({ error: 'invalid multipart' }, 400); }

  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string | null)?.trim() || '';
  const author = (formData.get('author') as string | null)?.trim() || null;
  const licenseNote = (formData.get('licenseNote') as string | null)?.trim() || null;

  if (!file || !file.name) return json({ error: 'missing file' }, 400);
  if (!title) return json({ error: 'missing title' }, 400);

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'pdf' && ext !== 'epub') return json({ error: 'unsupported format — only PDF or EPUB' }, 400);

  const tmpPath = join('/tmp', `book-upload-${randomUUID()}.${ext}`);
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buf);

    // Extract text
    let text: string;
    let pageCount: number;
    if (ext === 'pdf') {
      const data = await pdfParse(buf);
      text = data.text;
      pageCount = data.numpages;
    } else {
      const epub = await EPub.createAsync(tmpPath);
      const chapters: string[] = [];
      for (const item of epub.flow) {
        const html = await new Promise<string>((res, rej) =>
          epub.getChapter(item.id, (err: Error | null, txt: string) => (err ? rej(err) : res(txt))),
        );
        const clean = html
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean) chapters.push(clean);
      }
      text = chapters.join('\n\n');
      pageCount = chapters.length;
    }

    if (!text.trim()) return json({ error: 'no text could be extracted from the file' }, 422);

    // Slug from title
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Ensure collection
    const collection = await ensureCollection({
      name: `coaching-${slug}`,
      source: 'custom',
      brand: process.env.BRAND ?? 'mentolder',
      description: title,
    });

    // Chunk
    const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });

    // Embed
    const model = process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
    const { embeddings } = await embedBatch(chunks.map((c) => c.text), { model, purpose: 'index' });

    // Page approximation
    const totalChunks = chunks.length;
    const pageFor = (i: number): number | null =>
      pageCount < 1 ? null : Math.min(Math.floor((i * pageCount) / totalChunks) + 1, pageCount);

    // Store document + chunks
    const sha256 = createHash('sha256').update(text).digest('hex');
    const doc = await addDocument({
      collectionId: collection.id,
      title,
      sourceUri: `file://${file.name}`,
      rawText: text,
      sha256,
      metadata: { format: ext, pageCount },
    });

    await upsertChunks(
      collection.id,
      doc.id,
      chunks.map((c, i) => ({
        position: c.position,
        text: c.text,
        embedding: embeddings[i],
        metadata: { page: pageFor(i) },
      })),
    );

    await recountChunks(collection.id);

    // Upsert coaching.books row
    await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, author, source_filename, license_note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (knowledge_collection_id) DO UPDATE
         SET title = EXCLUDED.title,
             author = EXCLUDED.author,
             source_filename = EXCLUDED.source_filename,
             license_note = EXCLUDED.license_note`,
      [collection.id, title, author, file.name, licenseNote],
    );

    const bookRes = await pool.query(
      `SELECT b.*, c.chunk_count
         FROM coaching.books b
         JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
        WHERE b.knowledge_collection_id = $1`,
      [collection.id],
    );

    return json({ book: bookRes.rows[0] });
  } catch (err) {
    console.error('[upload] book ingestion failed:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    if (msg.includes('voyage') && msg.includes('429')) {
      return json({ error: 'Embedding-Dienst überlastet — bitte in 60 Sekunden erneut versuchen.' }, 429);
    }
    return json({ error: msg }, 500);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If `epub2` types are missing, add `as any` to the `EPub.createAsync` call.

- [ ] **Step 3: Quick manual test with curl (needs dev server running)**

```bash
# Start dev server first: cd website && npm run dev
curl -s -X POST http://localhost:4321/api/admin/coaching/books/upload \
  -H "Cookie: <paste your admin session cookie>" \
  -F "file=@coaching-sources/Geissler/KI-Coaching.pdf" \
  -F "title=KI-Coaching" \
  -F "author=Geissler" \
  | python3 -m json.tool | head -20
```

Expected: `{ "book": { "id": "...", "title": "KI-Coaching", "chunkCount": ... } }`

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/coaching/books/upload.ts
git commit -m "feat(coaching): book upload endpoint with PDF/EPUB ingestion"
```

---

## Task 8: Upload form UI

**Files:**
- Create: `website/src/components/admin/BookUploadForm.svelte`
- Modify: `website/src/pages/admin/knowledge/books/index.astro`

- [ ] **Step 1: Create BookUploadForm.svelte**

Create `website/src/components/admin/BookUploadForm.svelte`:

```svelte
<script lang="ts">
  let { onUploaded }: { onUploaded: (book: Record<string, unknown>) => void } = $props();

  let file = $state<File | null>(null);
  let title = $state('');
  let author = $state('');
  let licenseNote = $state('');
  let uploading = $state(false);
  let error = $state('');
  let showForm = $state(false);

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
    if (file && !title) {
      title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      file = f;
      if (!title) title = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  async function upload() {
    if (!file || !title.trim()) return;
    uploading = true;
    error = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('author', author.trim());
      fd.append('licenseNote', licenseNote.trim());
      const res = await fetch('/api/admin/coaching/books/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Fehler beim Hochladen.'; return; }
      onUploaded(data.book);
      file = null; title = ''; author = ''; licenseNote = ''; showForm = false;
    } catch {
      error = 'Verbindungsfehler.';
    } finally {
      uploading = false;
    }
  }
</script>

{#if !showForm}
  <button onclick={() => showForm = true} class="btn-primary">+ Buch hochladen</button>
{:else}
  <div class="upload-box">
    <div
      class="dropzone"
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
      role="region"
      aria-label="Datei ablegen"
    >
      {#if file}
        <p class="filename">📄 {file.name}</p>
        <button type="button" onclick={() => file = null} class="btn-ghost">Andere Datei wählen</button>
      {:else}
        <p>PDF oder EPUB hier ablegen</p>
        <label class="btn-secondary">
          Datei auswählen
          <input type="file" accept=".pdf,.epub" onchange={onFileChange} hidden />
        </label>
      {/if}
    </div>

    <div class="fields">
      <label>
        Titel <span class="required">*</span>
        <input type="text" bind:value={title} placeholder="z.B. KI-Coaching" />
      </label>
      <label>
        Autor
        <input type="text" bind:value={author} placeholder="z.B. Geissler" />
      </label>
      <label>
        Lizenzhinweis
        <input type="text" bind:value={licenseNote} placeholder="z.B. Privatkopie zum internen Gebrauch" />
      </label>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button type="button" onclick={() => { showForm = false; error = ''; }} class="btn-ghost" disabled={uploading}>
        Abbrechen
      </button>
      <button type="button" onclick={upload} class="btn-primary" disabled={uploading || !file || !title.trim()}>
        {uploading ? 'Wird eingelesen…' : 'Hochladen & Einlesen'}
      </button>
    </div>
    {#if uploading}
      <p class="hint">Das Einlesen dauert 30–120 Sekunden — bitte nicht schließen.</p>
    {/if}
  </div>
{/if}

<style>
  .upload-box { border: 1px solid var(--line, #ddd); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
  .dropzone { border: 2px dashed var(--brass, #c9a55c); border-radius: 6px; padding: 1.25rem; text-align: center; background: var(--bg-2, #f7f5f2); margin-bottom: 1rem; }
  .dropzone p { color: var(--text-muted, #888); font-size: .875rem; margin: 0 0 .5rem; }
  .filename { color: var(--text, #1a1a1a) !important; font-weight: 500; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-bottom: 1rem; }
  .fields label:last-child { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; font-size: .8rem; color: var(--text-muted, #666); gap: .25rem; }
  input[type=text] { padding: .35rem .6rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: .875rem; }
  .required { color: var(--brass, #c9a55c); }
  .actions { display: flex; justify-content: flex-end; gap: .5rem; }
  .error { color: #c00; font-size: .8rem; margin: .5rem 0; }
  .hint { color: var(--text-muted, #888); font-size: .78rem; margin-top: .5rem; text-align: center; }
  .btn-primary { padding: .4rem 1rem; background: var(--brass, #c9a55c); color: #fff; border: none; border-radius: 6px; font-size: .85rem; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-secondary { display: inline-block; padding: .3rem .7rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: .8rem; cursor: pointer; background: var(--bg, #fff); }
  .btn-ghost { background: none; border: 1px solid var(--line, #ddd); border-radius: 4px; padding: .3rem .6rem; font-size: .8rem; cursor: pointer; color: var(--text-muted, #666); }
</style>
```

- [ ] **Step 2: Embed form in books/index.astro**

Open `website/src/pages/admin/knowledge/books/index.astro`.

Add the import in the frontmatter (after existing imports):

```astro
---
// existing imports...
// add at end of frontmatter:
---
```

Replace the `<header class="page-head">` block's button — the page currently has no "Hochladen" button. Add `BookUploadForm` as a Svelte island after the `<header>` block.

Replace the current `{books.length === 0 ? ...}` section with a structure that handles both empty and non-empty state, and always shows the upload form:

```astro
---
import AdminLayout from '../../../../layouts/AdminLayout.astro';
import { Pool } from 'pg';
import { listBooks } from '../../../../lib/coaching-db';
import { getSession, getLoginUrl, isAdmin } from '../../../../lib/auth';
import BookUploadForm from '../../../../components/admin/BookUploadForm.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const pool = new Pool();
let books: Awaited<ReturnType<typeof listBooks>> = [];
try {
  books = await listBooks(pool);
} catch {
  // coaching schema may not yet exist in dev — show empty state
}
---
<AdminLayout title="Coaching-Bücher">
  <div class="page">
    <header class="page-head">
      <nav class="crumbs">
        <a href="/admin">Admin</a>
        <span class="sep">›</span>
        <a href="/admin/wissensquellen">Wissen</a>
        <span class="sep">›</span>
        Bücher
      </nav>
      <h1>Coaching-Bücher</h1>
      <p class="subtitle">Bücher anderer Autoren — deren Wissen wird von der KI absorbiert.</p>
    </header>

    <BookUploadForm
      client:load
      onUploaded="window.location.reload()"
    />

    {books.length === 0 ? (
      <p class="empty-hint">Noch keine Bücher hochgeladen.</p>
    ) : (
      <table class="books-table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Autor</th>
            <th class="num">Chunks</th>
            <th>Hochgeladen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {books.map((b) => (
            <tr>
              <td><a href={`/admin/knowledge/books/${b.id}`}>{b.title}</a></td>
              <td>{b.author ?? '—'}</td>
              <td class="num">{b.chunkCount ?? 0}</td>
              <td>{b.ingestedAt instanceof Date ? b.ingestedAt.toLocaleDateString('de-DE') : String(b.ingestedAt)}</td>
              <td><a class="btn-secondary" href={`/admin/knowledge/books/${b.id}`}>Öffnen</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</AdminLayout>
```

**Note on `onUploaded`:** Astro cannot pass a function prop across the server boundary. Change the Svelte component's prop type to call `window.location.reload()` internally on success, removing the `onUploaded` prop entirely. Update `BookUploadForm.svelte` — replace the `onUploaded` prop with a `location.reload()` call directly in the `upload()` function on success:

```typescript
// In BookUploadForm.svelte upload() function, replace:
onUploaded(data.book);
// With:
window.location.reload();
```

And remove `let { onUploaded }...` prop declaration entirely.

- [ ] **Step 3: Verify TypeScript**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Manual smoke test**

```bash
cd website && npm run dev
# Navigate to http://localhost:4321/admin/knowledge/books
# Click "+ Buch hochladen"
# Upload coaching-sources/Geissler/KI-Coaching.pdf
# Fill in Title: KI-Coaching, Author: Geissler
# Click "Hochladen & Einlesen"
# Wait ~60s (embedding via Voyage)
# Page reloads — book appears in table with chunk count
```

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/BookUploadForm.svelte website/src/pages/admin/knowledge/books/index.astro
git commit -m "feat(coaching): web-based book upload UI with PDF/EPUB drag-drop"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 1: Run unit tests**

```bash
cd website && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Ingest the Geissler book (if not done in Task 8)**

Either via UI (as in Task 8 step 4) or via CLI for speed:

```bash
ENV=dev task coaching:ingest -- coaching-sources/Geissler/KI-Coaching.pdf geissler --title="KI-Coaching" --author="Geissler"
```

- [ ] **Step 3: Open admin assistant and test toggle OFF**

```
Navigate to http://localhost:4321/admin
Open assistant widget
Type: "Was weißt du über Coaching?"
Expected: Claude response WITHOUT book badge (toggle is off)
```

- [ ] **Step 4: Enable toggle and test RAG**

```
Click "📚 Bücher" button — should turn amber
Type: "Wie geht Geissler mit Abwehr im Coaching-Gespräch um?"
Expected: response with "📚 N Passagen aus Coaching-Büchern" badge, 
          and Claude cites content from the KI-Coaching book
```

- [ ] **Step 5: Final commit + deploy prep**

```bash
git add -A
git status  # verify nothing unexpected
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Upload endpoint: Task 7
- ✅ Upload UI (drag-drop, title/author/licenseNote, progress): Task 8
- ✅ LLM wiring (Claude, keyword fallback without API key): Task 3
- ✅ RAG injection with useBooks flag: Task 3 + Task 4
- ✅ Toggle button with sessionStorage: Task 5
- ✅ Sources badge: Task 6
- ✅ Collection ID resolver with 60s cache: Task 2
- ✅ `sourcesUsed` through response chain: Tasks 1, 4, 5, 6
- ✅ Voyage 429 propagated to UI: Task 7 (catch block)
- ✅ No API key → keyword fallback: Task 3

**Type consistency:**
- `AssistantChatResult.sourcesUsed?: number` — defined Task 1, used Tasks 3, 4, 5, 6 ✅
- `resolveCoachingCollectionIds(pool)` — defined Task 2, called Task 3 ✅
- `chunkText`, `embedBatch`, `ensureCollection`, `addDocument`, `upsertChunks`, `recountChunks` — all imported from existing libs in Task 7 ✅
- `useBooks` in context — `AssistantContext` has `[k: string]: unknown` so no type change needed ✅
