# RAG Citation Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the admin assistant's RAG to return structured source citations (`AssistantSource[]`) and render inline `[n]` badges + a collapsible sources box in the chat UI.

**Architecture:** Context-injection stays the mechanism. `queryNearest` gains a JOIN to return book metadata. `assistantChat` builds `AssistantSource[]` and a richer system prompt that instructs Claude to cite with `[1]`, `[2]`. The frontend replaces the simple "📚 N Passagen" pill with rendered superscript badges and a `SourcesBox` component.

**Tech Stack:** TypeScript, Astro API routes, Svelte 5 runes, pgvector/PostgreSQL, Anthropic SDK, Vitest

---

## File Map

| File | Change |
|------|--------|
| `website/src/lib/assistant/types.ts` | Add `AssistantSource`; replace `sourcesUsed?` with `sources?` in `AssistantChatResult` |
| `website/src/lib/knowledge-db.ts` | Extend `queryNearest` SQL + return type to include `bookTitle`, `collectionName` |
| `website/src/lib/assistant/llm.ts` | New system-prompt block; build + return `sources: AssistantSource[]` |
| `website/src/pages/api/assistant/chat.ts` | Return `sources` instead of `sourcesUsed` |
| `website/src/components/assistant/AssistantChat.svelte` | Store `sources` per message; pass to `AssistantMessage` |
| `website/src/components/assistant/AssistantMessage.svelte` | Render `[n]` as `<sup>` badges; embed `SourcesBox` |
| `website/src/components/assistant/SourcesBox.svelte` | New: collapsible sources panel |
| `website/src/lib/assistant/llm.test.ts` | Add test: `sources` populated when `useBooks=true` and chunks found |
| `website/src/lib/knowledge-db.test.ts` | Add test: `queryNearest` result includes `bookTitle` + `collectionName` |

---

### Task 1: Add `AssistantSource` type and update `AssistantChatResult`

**Files:**
- Modify: `website/src/lib/assistant/types.ts`

- [ ] **Step 1: Update `types.ts`**

Replace the file content (keep all existing interfaces, add `AssistantSource`, update `AssistantChatResult`):

```ts
export type AssistantProfile = 'admin' | 'portal';

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
  proposedAction?: ProposedAction;
}

export interface ProposedAction {
  actionId: string;
  targetLabel: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface Nudge {
  id: string;
  triggerId: string;
  profile: AssistantProfile;
  headline: string;
  body: string;
  primaryAction?: { label: string; kickoff: string };
  secondaryAction?: { label: string; kickoff: string };
  ttlSeconds?: number;
  createdAt: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface AssistantSource {
  index: number;       // 1-based, matches [1] in reply text
  bookTitle: string;
  slug: string;        // collection name without "coaching-" prefix
  page: number | null;
  excerpt: string;     // chunk text truncated to 300 chars
  chunkId: string;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
  sources?: AssistantSource[];
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/assistant/types.ts
git commit -m "feat(assistant): add AssistantSource type, replace sourcesUsed with sources"
```

---

### Task 2: Extend `queryNearest` to return book metadata

**Files:**
- Modify: `website/src/lib/knowledge-db.ts`
- Modify: `website/src/lib/knowledge-db.test.ts`

- [ ] **Step 1: Write failing test**

In `website/src/lib/knowledge-db.test.ts`, add after the existing tests:

```ts
test('queryNearest result includes bookTitle and collectionName', async () => {
  // seed a collection + chunk with a known embedding (pg-mem doesn't run real vector ops
  // so we just verify the shape of the returned object)
  const colRes = await pool.query(
    `INSERT INTO knowledge.collections (name, source, embedding_model)
     VALUES ('coaching-test-book', 'custom', 'voyage-multilingual-2')
     RETURNING id`,
  );
  const colId = colRes.rows[0].id as string;

  const docRes = await pool.query(
    `INSERT INTO knowledge.documents (collection_id, title, raw_text)
     VALUES ($1, 'Test Doc', 'hello world') RETURNING id`,
    [colId],
  );
  const docId = docRes.rows[0].id as string;

  await pool.query(
    `INSERT INTO knowledge.chunks (collection_id, document_id, position, text, embedding, metadata)
     VALUES ($1, $2, 0, 'some passage', '[0.1,0.2,0.3]', '{"page": 7}')`,
    [colId, docId],
  );

  // queryNearest calls embedQuery + does vector math — mock embedQuery
  vi.mock('./embeddings', () => ({
    embedQuery: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3], tokens: 3 }),
    embedBatch: vi.fn(),
  }));

  const results = await kdb.queryNearest({
    collectionIds: [colId],
    queryText: 'hello',
    limit: 1,
    threshold: 0,
  });

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    bookTitle: expect.any(String),
    collectionName: 'coaching-test-book',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/patrick/Bachelorprojekt/website
pnpm vitest run src/lib/knowledge-db.test.ts 2>&1 | tail -20
```

Expected: FAIL — `results[0]` missing `bookTitle` / `collectionName`.

- [ ] **Step 3: Update `queryNearest` SQL and return type**

In `website/src/lib/knowledge-db.ts`, replace the `queryNearest` function (lines 148–181):

```ts
export interface NearestChunk {
  id: string;
  text: string;
  collection_id: string;
  document_id: string;
  score: number;
  bookTitle: string | null;
  collectionName: string;
  page: number | null;
}

export async function queryNearest(args: {
  collectionIds: string[]; queryText: string; limit?: number; threshold?: number; signal?: AbortSignal;
}): Promise<NearestChunk[]> {
  const limit  = args.limit     ?? 6;
  const thresh = args.threshold ?? 0.65;

  if (args.collectionIds.length === 0) return [];

  const placeholders = args.collectionIds.map((_, i) => `$${i + 1}`).join(',');
  const modelsRes = await p().query(
    `SELECT DISTINCT embedding_model FROM knowledge.collections WHERE id IN (${placeholders})`,
    args.collectionIds,
  );
  const models = modelsRes.rows.map((r: { embedding_model: string }) => r.embedding_model);
  if (models.length > 1) throw new MixedEmbeddingModelError(models);
  if (models.length === 0) return [];

  const { embedding } = await embedQuery(args.queryText, {
    model: models[0] as EmbeddingModel,
    purpose: 'query',
    signal: args.signal,
  });

  const r = await p().query(
    `SELECT kc.id, kc.text, kc.collection_id, kc.document_id,
            1 - (kc.embedding <=> $1) AS score,
            cb.title AS book_title,
            col.name AS collection_name,
            (kc.metadata->>'page')::int AS page
       FROM knowledge.chunks kc
       JOIN knowledge.collections col ON col.id = kc.collection_id
       LEFT JOIN coaching.books cb ON cb.knowledge_collection_id = kc.collection_id
      WHERE kc.collection_id = ANY($2::uuid[])
      ORDER BY kc.embedding <=> $1
      LIMIT $3`,
    [vecLiteral(embedding), args.collectionIds, limit],
  );
  return r.rows
    .filter((row: { score: number }) => row.score >= thresh)
    .map((row: { id: string; text: string; collection_id: string; document_id: string; score: number; book_title: string | null; collection_name: string; page: number | null }) => ({
      id: row.id,
      text: row.text,
      collection_id: row.collection_id,
      document_id: row.document_id,
      score: row.score,
      bookTitle: row.book_title,
      collectionName: row.collection_name,
      page: row.page,
    }));
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run src/lib/knowledge-db.test.ts 2>&1 | tail -20
```

Expected: all tests PASS (pg-mem test may skip the vector assertion — that's fine).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/knowledge-db.ts website/src/lib/knowledge-db.test.ts
git commit -m "feat(knowledge): queryNearest returns bookTitle, collectionName, page"
```

---

### Task 3: Update `assistantChat` — new system prompt + return `sources`

**Files:**
- Modify: `website/src/lib/assistant/llm.ts`
- Modify: `website/src/lib/assistant/llm.test.ts`

- [ ] **Step 1: Write failing test**

In `website/src/lib/assistant/llm.test.ts`, add:

```ts
test('returns populated sources array when useBooks=true and chunks found', async () => {
  vi.mock('../knowledge-db', () => ({
    queryNearest: vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        text: 'Vertrauen entsteht durch konsistentes Handeln.',
        collection_id: 'col-1',
        document_id: 'doc-1',
        score: 0.9,
        bookTitle: 'Systemische Therapie',
        collectionName: 'coaching-systemisch',
        page: 42,
      },
    ]),
  }));
  vi.mock('./coaching-collections', () => ({
    resolveCoachingCollectionIds: vi.fn().mockResolvedValue(['col-1']),
  }));

  const result = await assistantChat({
    profile: 'admin',
    userSub: 'u1',
    messages: [{ role: 'user', content: 'Was ist Vertrauen?' }],
    context: { currentRoute: '/', useBooks: true },
  });

  expect(result.sources).toHaveLength(1);
  expect(result.sources![0]).toMatchObject({
    index: 1,
    bookTitle: 'Systemische Therapie',
    slug: 'systemisch',
    page: 42,
    chunkId: 'chunk-1',
  });
  expect(result.sources![0].excerpt).toContain('Vertrauen');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -20
```

Expected: FAIL — `result.sources` is undefined.

- [ ] **Step 3: Update `llm.ts`**

Replace the full `assistantChat` function in `website/src/lib/assistant/llm.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantProfile, AssistantChatResult, AssistantSource, Message } from './types';
import { searchHelp, formatHit, noMatchReply } from './search';
import { queryNearest } from '../knowledge-db';
import { resolveCoachingCollectionIds } from './coaching-collections';
import { pool } from '../website-db';

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

const SYSTEM_PROMPT = `Du bist der interne Assistent von ${process.env.BRAND_NAME ?? 'Mentolder'}. Du hilfst dem Coach bei seiner Arbeit — Klientenvorbereitung, Terminplanung, Gesprächsreflexion und Wissensarbeit. Antworte präzise und auf Deutsch. Wenn du Buchpassagen erhältst, zitiere konkret und nenne Seite wenn vorhanden.`;

const CITATION_INSTRUCTIONS = `
Die folgenden Passagen stammen aus Fachbüchern des Coachs.
Prüfe zuerst ob eine der Passagen zur Frage relevant ist.
- Wenn ja: beantworte die Frage unter Nutzung der Passage(n) und zitiere inline mit [1], [2] etc. Beispiel: „Laut [1] gilt Vertrauen als..."
- Wenn nein: antworte aus deinem Allgemeinwissen und schreibe einen Satz wie „Die verfügbaren Buchstellen passen hier nicht direkt — aus meinem Wissen:..."

Zitiere nur wenn du wirklich aus einer Passage schöpfst, nicht bei jeder Aussage.`;

export async function assistantChat(input: AssistantChatInput): Promise<AssistantChatResult> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content.trim()) {
    return { reply: 'Frag mich etwas — ich bin für dich da.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const hit = searchHelp(lastUser.content, input.profile);
    if (!hit) return { reply: noMatchReply(input.profile) };
    return { reply: formatHit(hit) };
  }

  let sources: AssistantSource[] = [];
  let systemPrompt = SYSTEM_PROMPT;

  const useBooks = input.context.useBooks === true;
  if (useBooks) {
    try {
      const collectionIds = await resolveCoachingCollectionIds(pool);
      if (collectionIds.length > 0) {
        const chunks = await queryNearest({
          collectionIds,
          queryText: lastUser.content,
          limit: 4,
          threshold: 0.62,
        });
        if (chunks.length > 0) {
          sources = chunks.map((c, i) => ({
            index: i + 1,
            bookTitle: c.bookTitle ?? 'Unbekanntes Buch',
            slug: c.collectionName.startsWith('coaching-')
              ? c.collectionName.slice('coaching-'.length)
              : c.collectionName,
            page: c.page ?? null,
            excerpt: c.text.slice(0, 300),
            chunkId: c.id,
          }));

          const passages = chunks
            .map((c, i) => `[${i + 1}] ${c.text}`)
            .join('\n\n');
          systemPrompt += `\n\n${CITATION_INSTRUCTIONS}\n\n<Quellenpassagen>\n${passages}\n</Quellenpassagen>`;
        }
      }
    } catch (err) {
      console.error('[assistantChat] RAG lookup failed, proceeding without passages:', err);
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

  return { reply, sources: sources.length > 0 ? sources : undefined };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run src/lib/assistant/llm.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/llm.ts website/src/lib/assistant/llm.test.ts
git commit -m "feat(assistant): structured citation sources + grounding-check system prompt"
```

---

### Task 4: Update API route to pass `sources` through

**Files:**
- Modify: `website/src/pages/api/assistant/chat.ts`

- [ ] **Step 1: Update the API route**

Replace `website/src/pages/api/assistant/chat.ts`:

```ts
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

  const { profile, content, currentRoute = '/' } = body;
  const useBooks = profile === 'admin' ? (body.useBooks ?? false) : false;
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

  return json({ message: stored, sources: result.sources ?? [] });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/assistant/chat.ts
git commit -m "feat(api): return sources array from assistant chat endpoint"
```

---

### Task 5: Create `SourcesBox.svelte`

**Files:**
- Create: `website/src/components/assistant/SourcesBox.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import type { AssistantSource } from '../../lib/assistant/types';
  let { sources }: { sources: AssistantSource[] } = $props();
</script>

{#if sources.length > 0}
  <details style="margin-top: 4px; font-size: 10px; font-family: var(--font-sans);">
    <summary style="cursor: pointer; color: #d7b06a; opacity: .85; list-style: none; user-select: none;">
      📚 {sources.length} {sources.length === 1 ? 'Quelle' : 'Quellen'} verwendet
    </summary>
    <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px;">
      {#each sources as s}
        <div style="background: var(--ink-900); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px;">
          <div style="color: #d7b06a; font-weight: 600; margin-bottom: 2px;">
            [{s.index}] {s.bookTitle}{s.page !== null ? `, S. ${s.page}` : ''}
          </div>
          <div style="color: var(--mute); line-height: 1.4;">
            „{s.excerpt}{s.excerpt.length >= 300 ? '…' : ''}"
          </div>
        </div>
      {/each}
    </div>
  </details>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/assistant/SourcesBox.svelte
git commit -m "feat(assistant): add SourcesBox component for collapsible citation panel"
```

---

### Task 6: Update `AssistantMessage.svelte` and `AssistantChat.svelte`

**Files:**
- Modify: `website/src/components/assistant/AssistantMessage.svelte`
- Modify: `website/src/components/assistant/AssistantChat.svelte`

- [ ] **Step 1: Update `AssistantMessage.svelte`**

```svelte
<script lang="ts">
  import type { Message, AssistantSource } from '../../lib/assistant/types';
  import SourcesBox from './SourcesBox.svelte';

  let { message, sources = [] }: { message: Message; sources?: AssistantSource[] } = $props();
  const isUser = $derived(message.role === 'user');

  function renderCitations(text: string): string {
    return text.replace(/\[(\d+)\]/g, (_, n) =>
      `<sup style="font-size:9px;color:#d7b06a;font-weight:600;cursor:default;" title="Quelle ${n}">[${n}]</sup>`
    );
  }
</script>

<div
  class="msg"
  class:in={!isUser}
  class:out={isUser}
  style="font-size: 12px; line-height: 1.45; padding: 7px 10px; border-radius: 8px; max-width: 80%;
         font-family: var(--font-sans); color: var(--fg);"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html renderCitations(message.content)}
  {#if !isUser}
    <SourcesBox {sources} />
  {/if}
</div>

<style>
  .msg.in  { background: var(--ink-900); border: 1px solid var(--line); align-self: flex-start; border-radius: 8px 8px 8px 2px; }
  .msg.out { background: rgba(215,176,106,.16); border: 1px solid #d7b06a; align-self: flex-end; border-radius: 8px 8px 2px 8px; }
</style>
```

- [ ] **Step 2: Update `AssistantChat.svelte`**

Replace the two occurrences of `sourcesUsed` in `AssistantChat.svelte`:

Line 8 — change message state type:
```ts
let messages = $state<(Message & { sources?: AssistantSource[] })[]>([]);
```

Add the import at line 2:
```ts
import type { AssistantProfile, Message, AssistantSource } from '../../lib/assistant/types';
```

Line 33 — update the push after API response:
```ts
{ ...data.message, sources: data.sources ?? [] },
```

Line 80 — update the `AssistantMessage` usage:
```svelte
<AssistantMessage message={m} sources={m.sources ?? []} />
```

The full updated `AssistantChat.svelte`:

```svelte
<script lang="ts">
  import type { AssistantProfile, Message, AssistantSource } from '../../lib/assistant/types';
  import AssistantMessage from './AssistantMessage.svelte';
  import AssistantConfirmCard from './AssistantConfirmCard.svelte';

  let { profile, onClose }: { profile: AssistantProfile; onClose?: () => void } = $props();

  let messages = $state<(Message & { sources?: AssistantSource[] })[]>([]);
  let input = $state('');
  let sending = $state(false);
  let busyAction = $state<string | null>(null);

  let useBooks = $state(sessionStorage.getItem('assistant-use-books') === '1');

  function toggleBooks() {
    useBooks = !useBooks;
    sessionStorage.setItem('assistant-use-books', useBooks ? '1' : '0');
  }

  async function send(content: string) {
    sending = true;
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, content, currentRoute: location.pathname, useBooks }),
      });
      const data = await res.json();
      if (data?.message) {
        messages = [
          ...messages,
          { id: 'optimistic-' + Date.now(), conversationId: '', role: 'user', content, createdAt: new Date().toISOString() },
          { ...data.message, sources: data.sources ?? [] },
        ];
      }
    } finally {
      sending = false;
      input = '';
    }
  }

  async function confirmAction(message: Message) {
    if (!message.proposedAction) return;
    busyAction = message.id;
    try {
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, actionId: message.proposedAction.actionId, payload: message.proposedAction.payload }),
      });
      const data = await res.json();
      const replyText = data?.result?.message ?? (data?.error ? `Fehler: ${data.error}` : 'OK');
      messages = [...messages, { id: `local-${Date.now()}`, conversationId: '', role: 'assistant', content: replyText, createdAt: new Date().toISOString() }];
      messages = messages.map((m) => m.id === message.id ? { ...m, proposedAction: undefined } : m);
    } finally {
      busyAction = null;
    }
  }

  function cancelAction(message: Message) {
    messages = [...messages, { id: `local-${Date.now()}`, conversationId: '', role: 'assistant', content: 'OK, lasse ich.', createdAt: new Date().toISOString() }];
    messages = messages.map((m) => m.id === message.id ? { ...m, proposedAction: undefined } : m);
  }
</script>

<section
  role="dialog" aria-modal="false" aria-label="Mentolder-Assistent"
  style="position: fixed; right: 24px; bottom: 24px; z-index: 53;
         width: 320px; height: 400px;
         background: var(--ink-850); border: 1px solid #d7b06a; border-radius: 12px;
         box-shadow: 0 12px 32px rgba(0,0,0,.6);
         display: flex; flex-direction: column; overflow: hidden;
         font-family: var(--font-sans);"
>
  <header style="padding: 10px 12px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; background: var(--ink-900);">
    <span style="font-family: var(--font-display); color: #d7b06a; font-size: 14px;">✦ Mentolder-Assistent</span>
    <button onclick={onClose} aria-label="Chat schließen" style="background: none; border: none; color: var(--mute); font-size: 16px; cursor: pointer;">✕</button>
  </header>
  <div style="flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
    {#each messages as m (m.id)}
      <AssistantMessage message={m} sources={m.sources ?? []} />
      {#if m.role === 'assistant' && m.proposedAction}
        <AssistantConfirmCard
          action={m.proposedAction}
          busy={busyAction === m.id}
          onConfirm={() => confirmAction(m)}
          onCancel={() => cancelAction(m)}
        />
      {/if}
    {/each}
  </div>
  <form
    onsubmit={(e) => { e.preventDefault(); if (input.trim()) send(input.trim()); }}
    style="padding: 8px 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; background: var(--ink-900);"
  >
    <div style="display: flex; gap: 6px;">
      <input
        bind:value={input}
        type="text"
        placeholder="Nachricht eingeben…"
        disabled={sending}
        style="flex: 1; background: var(--ink-850); border: 1px solid var(--line); border-radius: 16px; padding: 6px 12px; font-size: 12px; color: var(--fg); font-family: inherit;"
      />
    </div>
    {#if profile === 'admin'}
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
    {/if}
  </form>
</section>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/assistant/AssistantMessage.svelte \
        website/src/components/assistant/AssistantChat.svelte
git commit -m "feat(assistant): render inline citation badges and SourcesBox in chat"
```

---

### Task 7: Full test run + type check

**Files:** none modified

- [ ] **Step 1: Run all unit tests**

```bash
cd /home/patrick/Bachelorprojekt/website
pnpm vitest run 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 2: Type check**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Deploy to dev and smoke test**

```bash
cd /home/patrick/Bachelorprojekt
task website:deploy ENV=mentolder
```

Then open `https://web.mentolder.de/admin`, open the assistant, activate "Bücher aktiv", ask something related to the ingested book. Verify:
- Reply contains `[1]` superscript badges (gold color)
- Below the reply a collapsible "📚 N Quellen verwendet" details panel appears
- Expanding it shows book title, page number, and excerpt
- When useBooks is off, no sources box appears

- [ ] **Step 4: Final commit (if no fixes needed)**

```bash
git push
```
