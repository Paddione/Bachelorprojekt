# Book Knowledge RAG — Design Spec

**Date:** 2026-05-10  
**Status:** approved  
**Branch target:** feature/book-knowledge-rag

## Problem

Books by third-party authors (e.g. Geissler's *KI-Coaching*) sit in `coaching-sources/` and can only be ingested via CLI. The AI assistant (`AssistantChat.svelte → /api/assistant/chat → llm.ts`) falls back to keyword search — Claude is never called. The vector store and `queryNearest()` exist but are never wired into the chat path.

Gekko (the coach/admin) cannot feel the system working.

## Goal

1. Gekko can upload a PDF/EPUB via the admin UI; the system automatically chunks, embeds, and indexes it.
2. Gekko can flip a "📚 Bücher aktiv" toggle in the assistant; when on, every message searches indexed book chunks and Claude uses them as context.

## Scope — what is NOT in scope

- Client-facing RAG (portal users do not get book knowledge)
- Streaming responses (word-by-word typing effect) — deferred
- Auto-classification of new book chunks into coaching drafts — already works via `task coaching:classify`, not changed
- Multi-collection selection UI — single toggle activates all coaching books

---

## Architecture

### 1. Book Upload Endpoint

**File:** `website/src/pages/api/admin/coaching/books/upload.ts` (new)

- Accepts `POST multipart/form-data` with fields: `file` (binary), `title` (string), `author` (string, optional), `licenseNote` (string, optional).
- Auth: admin only.
- Saves file to a temp path (`/tmp/book-upload-<uuid>.<ext>`).
- Derives a slug from the title: lowercase, alphanumeric + hyphens.
- Runs the ingestion logic inline (not via child process): imports `chunkText` from `lib/chunking.ts`, `embedBatch` from `lib/embeddings.ts`, and the knowledge DB helpers. Mirrors what `scripts/coaching/ingest-book.mts` does — no duplication of logic where avoidable, but the script is a Node CLI so we call the shared library functions directly.
- For PDF extraction, uses `pdf-parse` (already used in `lib-extract.mjs`) — import it directly.
- Returns `{ book: Book }` on success, or `{ error: string }` with appropriate HTTP status.
- Embedding can take 30–120 seconds for a large book. The endpoint runs synchronously and holds the connection; the client shows a progress indicator. (Async job queue is deferred — Voyage rate limits are the slow path, not the server.)

**Error cases:**
- Unsupported format → 400
- Voyage/bge-m3 unreachable → 502 with message
- Duplicate slug → upsert (ON CONFLICT already in `ingest-book.mts` pattern)

### 2. Upload UI

**File:** `website/src/pages/admin/knowledge/books/index.astro` (modify)

Replace the CLI hint in the empty state with a drag-drop upload zone. The zone is always visible (not just on empty state). Fields: PDF/EPUB file picker, Titel, Autor, Lizenzhinweis (optional). Submit button: "Hochladen & Einlesen". While uploading, show a spinner and disable the form. On success, append the new book to the table without full-page reload (fetch + JSON parse + prepend row). On error, show the server's error message inline.

No new page — stays on `index.astro` with a Svelte island for the upload form interactivity (`BookUploadForm.svelte`, new).

### 3. LLM Wiring — `llm.ts`

**File:** `website/src/lib/assistant/llm.ts` (replace body)

Current implementation: keyword search fallback, no LLM.

New implementation:

```
assistantChat(input):
  if ANTHROPIC_API_KEY unset → fall back to existing searchHelp keyword path (keeps dev working without key)
  build system prompt (see below)
  if input.useBooks === true:
    chunks = queryNearest({ collectionIds: all coaching book collection IDs, queryText: last user message, limit: 4, threshold: 0.62 })
    if chunks.length > 0: inject chunks as <Quellenpassagen> block into system prompt
  call Anthropic messages.create (claude-sonnet-4-6, max_tokens: 1024)
  return { reply: text }
```

**System prompt (German, Gekko's voice):**
```
Du bist der interne Assistent von ${process.env.BRAND_NAME ?? 'Mentolder'}. Du hilfst dem Coach bei seiner Arbeit — 
Klientenvorbereitung, Terminplanung, Gesprächsreflexion und Wissensarbeit.
Antworte präzise und auf Deutsch. Wenn du Buchpassagen erhältst, zitiere konkret 
und nenne Seite/Kapitel wenn vorhanden.
```

**`collectionIds` resolution:** query `coaching.books` joined to `knowledge.collections` to get all collection IDs where `source = 'custom'` and `brand = 'mentolder'` (or brand IS NULL). Cache result in module scope for 60 seconds to avoid per-message DB round trips.

### 4. Chat API — `useBooks` flag

**File:** `website/src/pages/api/assistant/chat.ts` (modify)

Accept `useBooks?: boolean` in the request body. Pass it through to `assistantChat()` as `context.useBooks`. The function signature already accepts `context: AssistantContext` with `[k: string]: unknown` — no type change needed.

`assistantChat()` returns `{ reply, sourcesUsed?: number }`. The chat route adds `sourcesUsed` to the JSON response alongside `message`: `return json({ message: stored, sourcesUsed: result.sourcesUsed ?? 0 })`. The Svelte component reads it from the fetch response, not from the stored message row.

### 5. Assistant Toggle — `AssistantChat.svelte`

**File:** `website/src/components/assistant/AssistantChat.svelte` (modify)

Add `let useBooks = $state(false)` (persisted in `sessionStorage` so it survives widget open/close within the same tab).

In the form footer, add a pill button right-aligned:
- Off state: `📚 Bücher` — muted border, grey text
- On state: `📚 Bücher aktiv` — amber border + dot indicator (`#c9a55c`)

Pass `useBooks` in the fetch body to `/api/assistant/chat`.

When the AI reply contains chunks (indicated by the `<Quellenpassagen>` block being used), the API response should include a `sourcesUsed: number` field so the widget can show "📚 3 Passagen verwendet" as a sub-line under the AI bubble — done in `AssistantMessage.svelte`.

---

## Data Flow

```
Gekko uploads PDF
  → POST /api/admin/coaching/books/upload
  → pdf-parse extracts text
  → chunkText() splits into ~600-token chunks
  → embedBatch() gets vectors (Voyage or bge-m3)
  → knowledge.collections + knowledge.chunks upserted
  → coaching.books row inserted
  → { book } returned to UI

Gekko asks question with toggle ON
  → POST /api/assistant/chat { content, useBooks: true }
  → chat.ts passes context.useBooks = true to assistantChat()
  → llm.ts resolves coaching collection IDs (60s cache)
  → queryNearest() returns top-4 chunks (cosine similarity ≥ 0.62)
  → chunks injected into Claude system prompt as <Quellenpassagen>
  → Claude responds in German with source-aware answer
  → { message, sourcesUsed: 4 } returned
  → AssistantChat shows "📚 4 Passagen verwendet" badge
```

---

## Files Changed

| File | Change |
|------|--------|
| `website/src/pages/api/admin/coaching/books/upload.ts` | NEW |
| `website/src/components/admin/BookUploadForm.svelte` | NEW |
| `website/src/lib/assistant/llm.ts` | Replace body |
| `website/src/pages/api/assistant/chat.ts` | Add `useBooks` passthrough |
| `website/src/components/assistant/AssistantChat.svelte` | Add toggle |
| `website/src/components/assistant/AssistantMessage.svelte` | Add sources badge |
| `website/src/pages/admin/knowledge/books/index.astro` | Embed upload form |

---

## Environment Variables

- `ANTHROPIC_API_KEY` — already present in prod (used for meeting insights in `claude.ts`). No new secrets needed.
- `VOYAGE_API_KEY` / `LLM_ENABLED` / `LLM_ROUTER_URL` — existing, drive embedding model selection.

---

## Error Handling

- No `ANTHROPIC_API_KEY` → graceful fallback to keyword search (dev environment stays usable).
- `queryNearest()` returns 0 results → Claude called without injection, no badge shown.
- Upload endpoint: Voyage rate limit during embedding → 429 propagated to UI with "Bitte erneut versuchen".
- Upload timeout (>5 min): return 504; user retries.

---

## Out of scope / future

- Streaming SSE responses
- Per-book toggle granularity (currently: all coaching books or none)
- Client portal RAG access
- Auto-classify newly uploaded chunks (use existing `task coaching:classify` after upload)
