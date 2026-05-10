---
title: Coaching Knowledge — Phase 3 Implementation Plan (Drafts-Inbox + Auto-Klassifikation)
domains: [website, db]
status: completed
pr_number: null
---

# Coaching Knowledge — Phase 3 Implementation Plan (Drafts-Inbox + Auto-Klassifikation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-classify ingested book chunks into one of four review-needing template kinds (`reflection`, `dialog_pattern`, `exercise`, `case_example`) using Anthropic Haiku 4.5 with strict JSON output, persist each suggestion as a `coaching.drafts` row tied to the original chunk, and let Gekko triage them in a new `/admin/knowledge/drafts` Inbox with two-pane Original-vs-Vorschlag layout, accept (→ snippet), reject, or skip-snippet (→ straight to Phase-2 Publish-Editor). Theory chunks are flagged at classification time but create NO draft — they live silently in the existing knowledge collection for Phase-5 RAG. The book is not yet uploaded; everything ships behind no demo data, ready for the first real ingest.

**Architecture:** New `coaching.drafts` table holds one row per `(knowledge_chunk_id, classifier_version)` with `template_kind`, `suggested_payload` JSONB, and `status` (`open|accepted|rejected|skipped`). New `coaching-classifier.ts` module wraps `@anthropic-ai/sdk` (already a dep, see `website/src/lib/claude.ts`) and emits a strict-schema JSON output via a single Haiku 4.5 call per chunk; the classifier is pure (pool-free) so the unit tests can mock the SDK. Ingest gains an opt-in `--classify` flag plus a standalone `task coaching:classify -- <book-slug>` for re-classifying an already-ingested book without re-embedding. New API routes under `/api/admin/coaching/drafts/*` mirror Phase-1/2 auth pattern. New `/admin/knowledge/drafts` Astro page hosts a `DraftsInbox.svelte` component with a left-rail kind/book filter, a list grouped by `template_kind`, and a two-pane detail (left: verbatim chunk text + page anchor; right: editable suggested payload + Accept/Reject/Skip-Publish actions). Acceptance-rate badge per book turns red <30%. Skip-Publish reuses Phase-2's `coaching-publish` cascade by auto-creating a snippet from the draft and redirecting to `/admin/knowledge/snippets/[id]/publish`.

**Tech Stack:** Astro 5, Svelte 5, PostgreSQL with pgvector (existing `coaching` + `knowledge` schemas), `@anthropic-ai/sdk@^0.87.0` (already in `website/package.json`), `claude-haiku-4-5-20251001` (default; overridable via `COACHING_CLASSIFIER_MODEL`), pg-mem (test DB), Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-10-coaching-knowledge-design.md` §2 (Drafts-Inbox), §1 (Auto-Klassifikation), §"Fehlerfälle" (Hallucination guard, Source-Pointer). Phase 1 (PR #635) provides the chunked, embedded knowledge collection; Phase 2 (PRs #637/#638) provides the Publish-Cascade that Skip-Publish hands off to.

**Open-question decisions baked into this plan:**
- *Test corpus:* Empty until book lands. No seed fixture, no public-domain stand-in. The Drafts-Inbox renders an empty-state until the first `task coaching:classify` succeeds.
- *Skip-Snippet-Modus:* Included in Phase 3. Implemented as `POST /drafts/[id]/accept?then=publish` which creates the snippet AND returns the publish redirect URL.
- *Per-chapter acceptance rate:* Out of scope (no chapter→page mapping exists yet). Per-book rate only.
- *LLM:* Haiku 4.5 (`claude-haiku-4-5-20251001`) default. Spec-mandated; cheap, fast, schema-friendly.
- *When to classify:* Inline at ingest is optional via `--classify` flag (so no-API-key dev environments still ingest). Standalone `task coaching:classify -- <slug>` is the canonical re-runnable path.

---

## File Structure

| Path | Responsibility | New/Modify |
|---|---|---|
| `k3d/website-schema.yaml` | DDL for `coaching.drafts` (in BOTH `init-meetings-schema.sh` and `ensure-meetings-schema.sh`) | Modify |
| `website/src/lib/coaching-classifier.ts` | Pure module: `classifyChunk(text, opts) → ClassifierResult`, schema, system prompt, model id, hallucination-guard. Wraps Anthropic SDK; takes `client` + `model` as injectable params for tests. | Create |
| `website/src/lib/coaching-classifier.test.ts` | Vitest covering each `template_kind`, malformed-JSON recovery, theory bypass, retry on `tool_use_error` | Create |
| `website/src/lib/coaching-db.ts` | Add `Draft` type + CRUD: `insertDraft`, `listDrafts(filter)`, `getDraft`, `acceptDraft(id, opts)` (creates snippet inside a transaction), `rejectDraft`, `acceptanceRateByBook` | Modify |
| `website/src/lib/coaching-db.test.ts` | Extend with draft CRUD + acceptance-rate semantics + transactional accept | Modify |
| `scripts/coaching/classify-book.mts` | CLI: classify all UNCLASSIFIED chunks of a book by slug (or all books). Reuses `coaching-classifier.ts` via dynamic import. | Create |
| `scripts/coaching/ingest-book.mts` | Add `--classify` flag that calls into `classify-book.mts` `runClassify()` after the ingest commit | Modify |
| `Taskfile.yml` | Add `coaching:classify` task | Modify |
| `website/src/pages/api/admin/coaching/drafts/index.ts` | GET list (filters: `book_id`, `template_kind`, `status`) | Create |
| `website/src/pages/api/admin/coaching/drafts/[id].ts` | GET draft detail (joined with chunk text + page) | Create |
| `website/src/pages/api/admin/coaching/drafts/[id]/accept.ts` | POST — create snippet from suggested payload, mark draft accepted; if `?then=publish` returns `redirect_to` URL | Create |
| `website/src/pages/api/admin/coaching/drafts/[id]/reject.ts` | POST — mark draft rejected (reason optional) | Create |
| `website/src/pages/api/admin/coaching/books/[id]/acceptance-rate.ts` | GET acceptance rate per book + total counts | Create |
| `website/src/pages/admin/knowledge/drafts.astro` | Host page for the Drafts-Inbox; list-only on `/drafts`, detail rendered inside the same page when `?id=` query is set | Create |
| `website/src/components/admin/DraftsInbox.svelte` | Three-pane UI: left filter rail (book + kind chips), center grouped list, right detail with verbatim chunk + editable payload + Accept/Reject/Skip-Publish | Create |
| `website/tests/e2e/coaching-drafts.spec.ts` | Playwright unauth checks for the new endpoints + page | Create |
| `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-3.md` | Mark `status: completed` at the end (this file) | Modify |

**Parallel-fan-out hint:** After Task 1 (migration), Tasks 2 (classifier lib) and 4 (db CRUD) and 7 (API skeleton accept/reject/list) and 9 (DraftsInbox.svelte scaffold) are all independent. Task 3 needs Task 2; Task 5 (classify-book CLI) needs Task 2 + 4; Task 6 (ingest hook) needs Task 5; Task 8 (acceptance-rate endpoint) needs Task 4. Task 10 (E2E) needs 7+9. Task 11 is the final marker commit.

---

## Task 1: Database migration — `coaching.drafts`

**Files:**
- Modify: `k3d/website-schema.yaml` (BOTH `init-meetings-schema.sh` and `ensure-meetings-schema.sh` heredocs)

**Context:** Both scripts use `CREATE ... IF NOT EXISTS` so the DDL is idempotent. Insertion point: immediately after the existing `coaching.template_assignments` block from Phase 2 (after the `idx_assignments_client_id` index). Foreign key targets a `knowledge.chunks` row that Phase 1 already creates per ingested chunk.

- [ ] **Step 1: Locate the Phase-2 coaching block**

```bash
grep -n "idx_assignments_client_id" k3d/website-schema.yaml
```
Expected: two hits (one in init script, one in ensure script).

- [ ] **Step 2: Add the new DDL after the index in BOTH scripts**

```sql
CREATE TABLE IF NOT EXISTS coaching.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES coaching.books(id) ON DELETE CASCADE,
  knowledge_chunk_id UUID NOT NULL REFERENCES knowledge.chunks(id) ON DELETE CASCADE,
  template_kind TEXT NOT NULL CHECK (template_kind IN ('reflection','dialog_pattern','exercise','case_example')),
  suggested_payload JSONB NOT NULL,
  classifier_model TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','skipped')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  resulting_snippet_id UUID REFERENCES coaching.snippets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (knowledge_chunk_id, classifier_version)
);

CREATE INDEX IF NOT EXISTS idx_drafts_book_status ON coaching.drafts(book_id, status);
CREATE INDEX IF NOT EXISTS idx_drafts_kind_status ON coaching.drafts(template_kind, status);
CREATE INDEX IF NOT EXISTS idx_drafts_chunk ON coaching.drafts(knowledge_chunk_id);
```

`suggested_payload` JSONB shape varies per `template_kind`:
- `reflection`: `{ "title": str, "question": str, "follow_up": str|null }`
- `dialog_pattern`: `{ "title": str, "coach_line": str, "client_response_pattern": str, "next_move": str }`
- `exercise`: `{ "title": str, "phases": [{"name": str, "instruction": str}], "duration_min": int|null }`
- `case_example`: `{ "title": str, "summary": str, "client_archetype": str|null }`

The classifier validates output against this shape (Task 2). Theory chunks NEVER produce a draft (skipped before insert).

`UNIQUE (knowledge_chunk_id, classifier_version)` lets us re-classify a book later (bump `classifier_version`) without losing prior reviews.

- [ ] **Step 3: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('k3d/website-schema.yaml'))"`
Expected: no output (valid YAML).

- [ ] **Step 4: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "$(cat <<'EOF'
feat(coaching): add drafts table for AI classification triage

Phase 3 schema. One row per (chunk, classifier_version) with
suggested payload (JSONB), template_kind constrained to the four
review-needing kinds (theory bypasses drafts entirely per spec),
status open|accepted|rejected|skipped, and a nullable
resulting_snippet_id back-pointer for accept-traceability.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Classifier module — `coaching-classifier.ts`

**Files:**
- Create: `website/src/lib/coaching-classifier.ts`

**Context:** Pure module — no Pool, no env reads beyond a default model id. The Anthropic client is dependency-injected so unit tests can pass a mock. Uses Claude Haiku 4.5 (`claude-haiku-4-5-20251001`). Output is a single JSON object validated against a Zod schema; on schema failure we retry once with a stricter system prompt before giving up.

- [ ] **Step 1: Add Zod to package.json if missing**

```bash
cd website && grep -q '"zod"' package.json || npm install zod@^3
```
Expected: zod present in `dependencies`.

- [ ] **Step 2: Write the module**

```typescript
// website/src/lib/coaching-classifier.ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const CLASSIFIER_VERSION = 'v1-2026-05-10';
export const DEFAULT_MODEL = process.env.COACHING_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001';

export type TemplateKind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
export type ClassifierKind = TemplateKind | 'theory' | 'noise';

const ReflectionPayload = z.object({
  title: z.string().min(3).max(120),
  question: z.string().min(8).max(500),
  follow_up: z.string().min(0).max(500).nullable().optional(),
});
const DialogPayload = z.object({
  title: z.string().min(3).max(120),
  coach_line: z.string().min(5).max(500),
  client_response_pattern: z.string().min(5).max(500),
  next_move: z.string().min(5).max(500),
});
const ExercisePayload = z.object({
  title: z.string().min(3).max(120),
  phases: z.array(z.object({ name: z.string().min(2).max(60), instruction: z.string().min(5).max(500) })).min(1).max(8),
  duration_min: z.number().int().min(1).max(240).nullable().optional(),
});
const CasePayload = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(20).max(800),
  client_archetype: z.string().min(0).max(120).nullable().optional(),
});

const PayloadByKind: Record<TemplateKind, z.ZodTypeAny> = {
  reflection: ReflectionPayload,
  dialog_pattern: DialogPayload,
  exercise: ExercisePayload,
  case_example: CasePayload,
};

const ClassifierEnvelope = z.object({
  kind: z.enum(['reflection', 'dialog_pattern', 'exercise', 'case_example', 'theory', 'noise']),
  payload: z.record(z.unknown()).optional(),
  reason: z.string().max(280).optional(),
});

export interface ClassifierResult {
  kind: ClassifierKind;
  payload: Record<string, unknown> | null;
  model: string;
  version: string;
  reason?: string;
}

const SYSTEM_PROMPT = `Du bist ein Klassifikator für Coaching-Buchstellen. Lies den Chunk und antworte mit GENAU EINEM JSON-Objekt der Form:
{"kind": "<reflection|dialog_pattern|exercise|theory|case_example|noise>", "payload": {...}, "reason": "<kurzer Grund>"}

Regeln:
- "reflection": eine Frage oder Selbstprüfung, die ein Coach einem Klienten stellen würde. payload = {title, question, follow_up}.
- "dialog_pattern": ein Coach-Klient-Dialogmuster. payload = {title, coach_line, client_response_pattern, next_move}.
- "exercise": eine strukturierte Übung mit Schritten. payload = {title, phases:[{name, instruction}, ...], duration_min}.
- "case_example": ein Fallbeispiel/Anekdote. payload = {title, summary, client_archetype}.
- "theory": Hintergrund/Konzept ohne direkten Klienten-Einsatz. KEIN payload.
- "noise": Inhaltsverzeichnis, Vorwort, Bibliographie, Marketing. KEIN payload.

Erzeuge KEINE Inhalte, die nicht im Chunk stehen. Paraphrasiere knapp, kein wörtliches Zitat über 280 Zeichen. Antworte ausschließlich mit dem JSON-Objekt, ohne Markdown-Fence.`;

export interface ClassifyOpts {
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
}

export async function classifyChunk(chunkText: string, opts: ClassifyOpts = {}): Promise<ClassifierResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY missing — set it in environments/.secrets/<env>.yaml or pass an injected client');
  }
  const client = opts.client ?? new Anthropic({ apiKey });
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 600;

  const userMsg = `Chunk:\n"""\n${chunkText.slice(0, 6000)}\n"""`;

  const tryOnce = async (extraSystem = ''): Promise<ClassifierResult> => {
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT + extraSystem,
      messages: [{ role: 'user', content: userMsg }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('classifier returned no JSON object');
    const parsed = ClassifierEnvelope.parse(JSON.parse(jsonMatch[0]));
    if (parsed.kind === 'theory' || parsed.kind === 'noise') {
      return { kind: parsed.kind, payload: null, model, version: CLASSIFIER_VERSION, reason: parsed.reason };
    }
    const schema = PayloadByKind[parsed.kind];
    const payload = schema.parse(parsed.payload ?? {});
    return { kind: parsed.kind, payload: payload as Record<string, unknown>, model, version: CLASSIFIER_VERSION, reason: parsed.reason };
  };

  try {
    return await tryOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await tryOnce(`\n\nWICHTIG: Letzter Versuch schlug fehl wegen: ${msg.slice(0, 200)}. Liefere ein gültiges JSON-Objekt strikt nach Schema.`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/coaching-classifier.ts website/package.json website/package-lock.json
git commit -m "$(cat <<'EOF'
feat(coaching): chunk classifier module (Anthropic Haiku 4.5)

Pure module with injectable Anthropic client + Zod-validated output
envelope. Six kinds: 4 reviewable (reflection/dialog_pattern/
exercise/case_example) emit a typed payload; theory and noise emit
null payload — caller decides to skip the draft insert. One retry
on schema failure with a stricter system-prompt suffix. Default
model: claude-haiku-4-5-20251001, override via
COACHING_CLASSIFIER_MODEL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Classifier tests — `coaching-classifier.test.ts`

**Files:**
- Create: `website/src/lib/coaching-classifier.test.ts`

**Context:** Mock the Anthropic SDK by passing a fake `client` whose `messages.create` returns canned `content` arrays. No network. Cover one happy path per kind, theory bypass, malformed-JSON retry, and final-failure throw.

- [ ] **Step 1: Write the test file**

```typescript
// website/src/lib/coaching-classifier.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifyChunk } from './coaching-classifier';

function fakeClient(responses: string[]) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const text = responses[i++] ?? responses[responses.length - 1];
        return { content: [{ type: 'text', text }] };
      }),
    },
  } as any;
}

describe('classifyChunk', () => {
  it('returns reflection with valid payload', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'reflection', payload: { title: 'Selbstwahrnehmung', question: 'Was bemerkst du gerade?', follow_up: null }, reason: 'reflexive Frage' }),
    ]);
    const r = await classifyChunk('Was bemerkst du in diesem Moment?', { client, model: 'test' });
    expect(r.kind).toBe('reflection');
    expect(r.payload?.question).toBe('Was bemerkst du gerade?');
    expect(r.model).toBe('test');
  });

  it('returns dialog_pattern with valid payload', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'dialog_pattern', payload: { title: 'Spiegeln', coach_line: 'Du sagst gerade...', client_response_pattern: 'Klient bestätigt oder korrigiert', next_move: 'Vertiefen' } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('dialog_pattern');
  });

  it('returns exercise with phases array', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'exercise', payload: { title: 'Atemübung', phases: [{ name: 'Einleitung', instruction: 'Augen schließen' }], duration_min: 5 } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('exercise');
    expect((r.payload as any).phases).toHaveLength(1);
  });

  it('returns case_example with summary', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'case_example', payload: { title: 'Klient A', summary: 'Klient A kam mit Konflikt zwischen Karriere und Familie und entwickelte über drei Sitzungen...', client_archetype: 'Karriere-Wechsler' } }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('case_example');
  });

  it('passes theory through with null payload', async () => {
    const client = fakeClient([JSON.stringify({ kind: 'theory', reason: 'Hintergrund' })]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('theory');
    expect(r.payload).toBeNull();
  });

  it('passes noise through with null payload', async () => {
    const client = fakeClient([JSON.stringify({ kind: 'noise' })]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('noise');
    expect(r.payload).toBeNull();
  });

  it('retries once on malformed first response', async () => {
    const client = fakeClient([
      'no json here at all',
      JSON.stringify({ kind: 'theory' }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('theory');
    expect(client.messages.create).toHaveBeenCalledTimes(2);
  });

  it('throws after second failure', async () => {
    const client = fakeClient(['bad', 'still bad']);
    await expect(classifyChunk('...', { client, model: 'test' })).rejects.toThrow();
  });

  it('rejects payload that violates schema', async () => {
    const client = fakeClient([
      JSON.stringify({ kind: 'reflection', payload: { title: 'x' /* too short */, question: 'too short' } }),
      JSON.stringify({ kind: 'noise' }),
    ]);
    const r = await classifyChunk('...', { client, model: 'test' });
    expect(r.kind).toBe('noise');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd website && npx vitest run src/lib/coaching-classifier.test.ts`
Expected: 9 passed.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/coaching-classifier.test.ts
git commit -m "$(cat <<'EOF'
test(coaching): classifier — kinds, theory bypass, retry, schema reject

Mocks the Anthropic SDK via injected client. Covers each of the four
reviewable kinds, the two skip-the-draft kinds (theory/noise),
one-shot retry on malformed JSON, throw after second failure, and
schema-violation falling back to noise on retry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Database CRUD — drafts in `coaching-db.ts`

**Files:**
- Modify: `website/src/lib/coaching-db.ts`
- Modify: `website/src/lib/coaching-db.test.ts`

**Context:** Phase 1 already exports `createSnippet` and the `Snippet` type. We add a `Draft` type, list/insert/get, and `acceptDraft` which runs in a single transaction (snippet INSERT → drafts UPDATE) so a crash mid-flight never leaves an accepted draft without a snippet.

- [ ] **Step 1: Append to `coaching-db.ts`**

Insertion point: at the end of the file. Add:

```typescript
// ---- Drafts (Phase 3) -------------------------------------------------

export type DraftKind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
export type DraftStatus = 'open' | 'accepted' | 'rejected' | 'skipped';

export interface Draft {
  id: string;
  bookId: string;
  knowledgeChunkId: string;
  templateKind: DraftKind;
  suggestedPayload: Record<string, unknown>;
  classifierModel: string;
  classifierVersion: string;
  status: DraftStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  resultingSnippetId: string | null;
  createdAt: Date;
}

export interface DraftWithChunk extends Draft {
  chunkText: string;
  page: number | null;
}

export interface DraftFilter {
  bookId?: string;
  templateKind?: DraftKind;
  status?: DraftStatus;
}

function rowToDraft(r: any): Draft {
  return {
    id: r.id,
    bookId: r.book_id,
    knowledgeChunkId: r.knowledge_chunk_id,
    templateKind: r.template_kind,
    suggestedPayload: r.suggested_payload ?? {},
    classifierModel: r.classifier_model,
    classifierVersion: r.classifier_version,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    rejectReason: r.reject_reason,
    resultingSnippetId: r.resulting_snippet_id,
    createdAt: r.created_at,
  };
}

export async function insertDraft(pool: Pool, d: Omit<Draft, 'id' | 'status' | 'reviewedBy' | 'reviewedAt' | 'rejectReason' | 'resultingSnippetId' | 'createdAt'>): Promise<Draft> {
  const r = await pool.query(
    `INSERT INTO coaching.drafts (book_id, knowledge_chunk_id, template_kind, suggested_payload, classifier_model, classifier_version)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (knowledge_chunk_id, classifier_version) DO NOTHING
     RETURNING *`,
    [d.bookId, d.knowledgeChunkId, d.templateKind, JSON.stringify(d.suggestedPayload), d.classifierModel, d.classifierVersion],
  );
  if (r.rowCount === 0) {
    const existing = await pool.query(
      `SELECT * FROM coaching.drafts WHERE knowledge_chunk_id=$1 AND classifier_version=$2`,
      [d.knowledgeChunkId, d.classifierVersion],
    );
    return rowToDraft(existing.rows[0]);
  }
  return rowToDraft(r.rows[0]);
}

export async function listDrafts(pool: Pool, filter: DraftFilter = {}): Promise<Draft[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.bookId) { args.push(filter.bookId); where.push(`book_id=$${args.length}`); }
  if (filter.templateKind) { args.push(filter.templateKind); where.push(`template_kind=$${args.length}`); }
  if (filter.status) { args.push(filter.status); where.push(`status=$${args.length}`); }
  const sql = `SELECT * FROM coaching.drafts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at ASC`;
  const r = await pool.query(sql, args);
  return r.rows.map(rowToDraft);
}

export async function getDraft(pool: Pool, id: string): Promise<DraftWithChunk | null> {
  const r = await pool.query(
    `SELECT d.*, kc.text AS chunk_text, (kc.metadata->>'page')::int AS page
       FROM coaching.drafts d
       JOIN knowledge.chunks kc ON kc.id = d.knowledge_chunk_id
      WHERE d.id = $1`,
    [id],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return { ...rowToDraft(row), chunkText: row.chunk_text, page: row.page };
}

export interface AcceptDraftOpts {
  reviewedBy: string;
  /** override of suggested_payload before snippet creation; merged shallow */
  payloadOverrides?: Record<string, unknown>;
  /** override snippet title; defaults to `suggested_payload.title` */
  snippetTitleOverride?: string;
  /** tags for the resulting snippet; defaults to [template_kind] */
  tags?: string[];
}

export async function acceptDraft(pool: Pool, id: string, opts: AcceptDraftOpts): Promise<{ draft: Draft; snippetId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const draftRes = await client.query(`SELECT * FROM coaching.drafts WHERE id=$1 FOR UPDATE`, [id]);
    if (draftRes.rowCount === 0) throw new Error('draft not found');
    const draft = rowToDraft(draftRes.rows[0]);
    if (draft.status !== 'open') throw new Error(`draft ${id} is not open (status=${draft.status})`);

    const payload = { ...draft.suggestedPayload, ...(opts.payloadOverrides ?? {}) };
    const title = opts.snippetTitleOverride ?? (payload as any).title ?? `Draft ${id}`;
    const body = JSON.stringify(payload);
    const tags = opts.tags ?? [draft.templateKind];

    const chunkRes = await client.query(
      `SELECT (metadata->>'page')::int AS page FROM knowledge.chunks WHERE id=$1`,
      [draft.knowledgeChunkId],
    );
    const page = chunkRes.rows[0]?.page ?? null;

    const snipRes = await client.query(
      `INSERT INTO coaching.snippets (book_id, knowledge_chunk_id, title, body, tags, page, created_by, created_from_draft)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [draft.bookId, draft.knowledgeChunkId, title, body, tags, page, opts.reviewedBy, draft.id],
    );
    const snippetId = snipRes.rows[0].id;

    const updRes = await client.query(
      `UPDATE coaching.drafts
          SET status='accepted', reviewed_by=$2, reviewed_at=now(), resulting_snippet_id=$3
        WHERE id=$1
        RETURNING *`,
      [id, opts.reviewedBy, snippetId],
    );
    await client.query('COMMIT');
    return { draft: rowToDraft(updRes.rows[0]), snippetId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectDraft(pool: Pool, id: string, reviewedBy: string, reason?: string): Promise<Draft> {
  const r = await pool.query(
    `UPDATE coaching.drafts
        SET status='rejected', reviewed_by=$2, reviewed_at=now(), reject_reason=$3
      WHERE id=$1 AND status='open'
      RETURNING *`,
    [id, reviewedBy, reason ?? null],
  );
  if (r.rowCount === 0) throw new Error('draft not found or already reviewed');
  return rowToDraft(r.rows[0]);
}

export interface AcceptanceRate {
  bookId: string;
  open: number;
  accepted: number;
  rejected: number;
  skipped: number;
  total: number;
  /** accepted / (accepted + rejected + skipped); null if no reviews yet */
  acceptanceRate: number | null;
}

export async function acceptanceRateByBook(pool: Pool, bookId: string): Promise<AcceptanceRate> {
  const r = await pool.query(
    `SELECT
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END)::int AS open,
        SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END)::int AS accepted,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END)::int AS rejected,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END)::int AS skipped,
        COUNT(*)::int AS total
     FROM coaching.drafts WHERE book_id=$1`,
    [bookId],
  );
  const row = r.rows[0] ?? { open: 0, accepted: 0, rejected: 0, skipped: 0, total: 0 };
  const reviewed = (row.accepted ?? 0) + (row.rejected ?? 0) + (row.skipped ?? 0);
  return {
    bookId,
    open: row.open ?? 0,
    accepted: row.accepted ?? 0,
    rejected: row.rejected ?? 0,
    skipped: row.skipped ?? 0,
    total: row.total ?? 0,
    acceptanceRate: reviewed === 0 ? null : (row.accepted ?? 0) / reviewed,
  };
}
```

- [ ] **Step 2: Check whether `coaching.snippets` already has `created_from_draft`**

```bash
grep -n "created_from_draft" k3d/website-schema.yaml
```
Expected: at least one match (Phase 1 already added it per the spec datamodel). If zero matches:

Add to BOTH init+ensure scripts inside the `coaching.snippets` table definition:
```sql
,
  created_from_draft UUID
```
And inside `acceptDraft` the `INSERT` already references it. Run YAML validate and commit a small migration before continuing.

- [ ] **Step 3: Add tests in `coaching-db.test.ts`**

Append to the end of the test file (use the existing `pg-mem` setup pattern from Phase 1):

```typescript
describe('drafts (Phase 3)', () => {
  it('insertDraft is idempotent on (chunk, classifier_version)', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const a = await insertDraft(pool, {
      bookId, knowledgeChunkId: chunkId, templateKind: 'reflection',
      suggestedPayload: { title: 'T', question: 'Q?', follow_up: null },
      classifierModel: 'haiku', classifierVersion: 'v1',
    });
    const b = await insertDraft(pool, {
      bookId, knowledgeChunkId: chunkId, templateKind: 'reflection',
      suggestedPayload: { title: 'T2', question: 'Q2?', follow_up: null },
      classifierModel: 'haiku', classifierVersion: 'v1',
    });
    expect(a.id).toBe(b.id);
    expect((b.suggestedPayload as any).title).toBe('T'); // first write wins
  });

  it('listDrafts filters by book + kind + status', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    await insertDraft(pool, { bookId, knowledgeChunkId: chunkId, templateKind: 'reflection', suggestedPayload: { title: 'x', question: 'y' }, classifierModel: 'm', classifierVersion: 'v1' });
    const open = await listDrafts(pool, { bookId, status: 'open' });
    expect(open).toHaveLength(1);
    const exercises = await listDrafts(pool, { bookId, templateKind: 'exercise' });
    expect(exercises).toHaveLength(0);
  });

  it('acceptDraft writes snippet + flips status atomically', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, { bookId, knowledgeChunkId: chunkId, templateKind: 'reflection', suggestedPayload: { title: 'Selbstwahrnehmung', question: 'Was bemerkst du?', follow_up: null }, classifierModel: 'haiku', classifierVersion: 'v1' });
    const r = await acceptDraft(pool, d.id, { reviewedBy: 'gekko@mentolder.de' });
    expect(r.draft.status).toBe('accepted');
    expect(r.draft.resultingSnippetId).toBe(r.snippetId);
    const snippet = (await pool.query(`SELECT * FROM coaching.snippets WHERE id=$1`, [r.snippetId])).rows[0];
    expect(snippet.title).toBe('Selbstwahrnehmung');
    expect(snippet.created_from_draft).toBe(d.id);
  });

  it('acceptDraft rejects double-accept', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, { bookId, knowledgeChunkId: chunkId, templateKind: 'reflection', suggestedPayload: { title: 'T', question: 'Q?' }, classifierModel: 'm', classifierVersion: 'v1' });
    await acceptDraft(pool, d.id, { reviewedBy: 'gekko' });
    await expect(acceptDraft(pool, d.id, { reviewedBy: 'gekko' })).rejects.toThrow(/not open/);
  });

  it('rejectDraft sets reason and is idempotent (returns row only first time)', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const d = await insertDraft(pool, { bookId, knowledgeChunkId: chunkId, templateKind: 'reflection', suggestedPayload: { title: 'T', question: 'Q?' }, classifierModel: 'm', classifierVersion: 'v1' });
    const out = await rejectDraft(pool, d.id, 'gekko', 'nicht relevant');
    expect(out.status).toBe('rejected');
    expect(out.rejectReason).toBe('nicht relevant');
    await expect(rejectDraft(pool, d.id, 'gekko')).rejects.toThrow();
  });

  it('acceptanceRateByBook computes correctly', async () => {
    const { pool, bookId, chunkId } = await seedBookAndChunk();
    const a = await insertDraft(pool, { bookId, knowledgeChunkId: chunkId, templateKind: 'reflection', suggestedPayload: { title: 'a', question: 'q?' }, classifierModel: 'm', classifierVersion: 'v1' });
    await acceptDraft(pool, a.id, { reviewedBy: 'gekko' });
    const rate = await acceptanceRateByBook(pool, bookId);
    expect(rate.accepted).toBe(1);
    expect(rate.acceptanceRate).toBe(1);
  });
});

// Test helper (place above describe block or import from a new ./test-helpers if one exists)
async function seedBookAndChunk(): Promise<{ pool: any; bookId: string; chunkId: string }> {
  // Reuse the existing pg-mem setup from earlier tests in this file.
  // The Phase-1 tests already export a `setupTestPool` helper or inline it; use the same pattern.
  // Returns a pool with one knowledge.collection, one knowledge.document, one knowledge.chunk,
  // and one coaching.book joined to that collection.
  throw new Error('TODO: implement using same pg-mem pattern as Phase-1 tests');
}
```

After writing the spec test bodies, look at how `coaching-db.test.ts` already initialises pg-mem (top of file) and lift that into a shared `seedBookAndChunk` helper or inline the boilerplate. The test bodies above are what they need to assert.

- [ ] **Step 4: Run the tests**

Run: `cd website && npx vitest run src/lib/coaching-db.test.ts`
Expected: all existing tests + 6 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/coaching-db.ts website/src/lib/coaching-db.test.ts
git commit -m "$(cat <<'EOF'
feat(coaching): drafts CRUD + transactional accept

Adds Draft + DraftWithChunk types, insertDraft (idempotent on
(chunk, classifier_version)), listDrafts with filters, getDraft
joining knowledge.chunks for the verbatim original text + page,
acceptDraft inside a single transaction (snippet INSERT + draft
UPDATE), rejectDraft with reason, acceptanceRateByBook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Standalone classify CLI — `scripts/coaching/classify-book.mts`

**Files:**
- Create: `scripts/coaching/classify-book.mts`

**Context:** Re-runnable CLI that walks all UNCLASSIFIED chunks of a given book (or all books) and classifies them. Skips chunks that already have a draft for the current `CLASSIFIER_VERSION`. Theory + noise produce no draft (just logged). Throttle defaults: 1 chunk/sec (Anthropic Tier 1 default RPM is 50 — we stay way under).

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env tsx
import { Pool } from 'pg';
import { classifyChunk, CLASSIFIER_VERSION, DEFAULT_MODEL } from '../../website/src/lib/coaching-classifier.ts';
import { insertDraft } from '../../website/src/lib/coaching-db.ts';

interface CliFlags {
  slug?: string;     // book slug (matches `coaching-${slug}` collection name)
  all?: boolean;
  delayMs?: number;
}

async function main() {
  const opts = parseFlags(process.argv.slice(2));
  if (!opts.slug && !opts.all) {
    console.error('Usage: classify-book.mts --slug=<slug> | --all  [--delay-ms=1000]');
    process.exit(2);
  }
  const pool = new Pool();
  try {
    const books = opts.slug
      ? await pool.query(
          `SELECT b.id, b.title, b.knowledge_collection_id
             FROM coaching.books b
             JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
            WHERE c.name = $1`,
          [`coaching-${opts.slug}`],
        )
      : await pool.query(`SELECT id, title, knowledge_collection_id FROM coaching.books ORDER BY ingested_at DESC`);

    if (books.rowCount === 0) {
      console.error(`[classify] no book found for slug=${opts.slug}`);
      process.exit(1);
    }

    for (const book of books.rows) {
      console.log(`[classify] ${book.title} (id=${book.id})`);
      const chunks = await pool.query(
        `SELECT kc.id, kc.text
           FROM knowledge.chunks kc
           JOIN knowledge.documents kd ON kd.id = kc.document_id
          WHERE kd.collection_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM coaching.drafts d
               WHERE d.knowledge_chunk_id = kc.id
                 AND d.classifier_version = $2
            )
          ORDER BY kc.position ASC`,
        [book.knowledge_collection_id, CLASSIFIER_VERSION],
      );
      console.log(`[classify] ${chunks.rowCount} chunks to process (model=${DEFAULT_MODEL}, version=${CLASSIFIER_VERSION})`);

      let drafts = 0, theory = 0, noise = 0, errors = 0;
      for (let i = 0; i < chunks.rowCount; i++) {
        const c = chunks.rows[i];
        try {
          const result = await classifyChunk(c.text);
          if (result.kind === 'theory') { theory++; }
          else if (result.kind === 'noise') { noise++; }
          else {
            await insertDraft(pool, {
              bookId: book.id,
              knowledgeChunkId: c.id,
              templateKind: result.kind,
              suggestedPayload: result.payload ?? {},
              classifierModel: result.model,
              classifierVersion: result.version,
            });
            drafts++;
          }
        } catch (err) {
          errors++;
          console.warn(`[classify] chunk ${c.id} failed: ${err instanceof Error ? err.message : err}`);
        }
        if ((i + 1) % 10 === 0) console.log(`[classify]   progress ${i + 1}/${chunks.rowCount}  drafts=${drafts} theory=${theory} noise=${noise} errors=${errors}`);
        if (opts.delayMs && i < chunks.rowCount - 1) await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      console.log(`[classify] ${book.title}: drafts=${drafts} theory=${theory} noise=${noise} errors=${errors}`);
    }
  } finally {
    await pool.end();
  }
}

function parseFlags(argv: string[]): CliFlags {
  const out: any = { delayMs: 1000 };
  for (const a of argv) {
    if (a === '--all') out.all = true;
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) {
      if (m[1] === 'delay-ms') out.delayMs = parseInt(m[2], 10);
      else out[m[1]] = m[2];
    }
  }
  return out;
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add Taskfile entry**

Open `Taskfile.yml`, find the existing `coaching:ingest:` block (line ~2743), append immediately below it:

```yaml
  coaching:classify:
    desc: "Run AI classifier over UNCLASSIFIED chunks of a coaching book. Args: -- --slug=<slug> | --all"
    cmds:
      - source scripts/env-resolve.sh "${ENV:-dev}" && cd website && npx tsx ../scripts/coaching/classify-book.mts {{.CLI_ARGS}}
```

- [ ] **Step 3: Smoke-validate without an API call**

Run: `cd website && npx tsx ../scripts/coaching/classify-book.mts 2>&1 | head -3`
Expected: `Usage: classify-book.mts --slug=<slug> | --all  [--delay-ms=1000]`

- [ ] **Step 4: Commit**

```bash
git add scripts/coaching/classify-book.mts Taskfile.yml
git commit -m "$(cat <<'EOF'
feat(coaching): classify-book CLI + Taskfile target

Re-runnable: skips chunks already classified at the current
CLASSIFIER_VERSION via NOT EXISTS subselect, so iterating on the
prompt only needs a version bump. Theory/noise are logged but
produce no drafts. Default --delay-ms=1000 keeps us well under any
Anthropic Tier-1 RPM bucket.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Ingest hook — `--classify` flag in `ingest-book.mts`

**Files:**
- Modify: `scripts/coaching/ingest-book.mts`

**Context:** Optional inline classification right after the `coaching.books` INSERT. Keep it opt-in so a fresh dev environment without `ANTHROPIC_API_KEY` can still ingest. Reuses the same code path as the standalone CLI by spawning `npx tsx classify-book.mts --slug=<slug>` as a child process — avoids duplicating the iteration logic.

- [ ] **Step 1: Patch `parseFlags` and `main`**

In `scripts/coaching/ingest-book.mts`:

Add to `CliFlags` interface:
```typescript
  classify?: boolean;
```

In `parseFlags`, treat boolean flags:
```typescript
function parseFlags(rest: string[]): CliFlags {
  const out: Record<string, string | boolean> = {};
  for (const a of rest) {
    if (a === '--classify') { out.classify = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out as CliFlags;
}
```

After the final `console.log('[ingest] done. ...')` line, before `pool.end()`:

```typescript
    if (opts.classify) {
      console.log(`[ingest] running classifier (--classify) on slug=${slug}`);
      const { spawn } = await import('node:child_process');
      const child = spawn('npx', ['tsx', new URL('./classify-book.mts', import.meta.url).pathname, `--slug=${slug}`], { stdio: 'inherit' });
      const code: number = await new Promise((r) => child.on('exit', (c) => r(c ?? 1)));
      if (code !== 0) {
        console.error(`[ingest] classifier exited with code ${code}`);
        process.exit(code);
      }
    }
```

- [ ] **Step 2: Update CLI usage line**

Replace the usage line:
```typescript
console.error('Usage: ingest-book.mts <file.pdf|.epub> <slug> [--title="..."] [--author="..."] [--license-note="..."] [--classify]');
```

- [ ] **Step 3: Smoke-validate without a file**

Run: `cd website && npx tsx ../scripts/coaching/ingest-book.mts 2>&1 | head -3`
Expected: usage line includes `[--classify]`.

- [ ] **Step 4: Commit**

```bash
git add scripts/coaching/ingest-book.mts
git commit -m "$(cat <<'EOF'
feat(coaching): --classify flag on ingest-book

Opt-in: fires off classify-book.mts as a child process after the
ingest commit succeeds. Default off so dev envs without an
ANTHROPIC_API_KEY still ingest cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: API endpoints — `/api/admin/coaching/drafts/*`

**Files:**
- Create: `website/src/pages/api/admin/coaching/drafts/index.ts`
- Create: `website/src/pages/api/admin/coaching/drafts/[id].ts`
- Create: `website/src/pages/api/admin/coaching/drafts/[id]/accept.ts`
- Create: `website/src/pages/api/admin/coaching/drafts/[id]/reject.ts`

**Context:** Mirror the auth pattern from `website/src/pages/api/admin/coaching/snippets/index.ts` line ~1-15: `getSession` from cookie + `isAdmin` gate. All endpoints `prerender = false`. Use a module-level `Pool()` so connections are shared.

- [ ] **Step 1: Create `index.ts` (GET list)**

```typescript
// website/src/pages/api/admin/coaching/drafts/index.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listDrafts, type DraftFilter, type DraftKind, type DraftStatus } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const filter: DraftFilter = {
    bookId: url.searchParams.get('book_id') ?? undefined,
    templateKind: (url.searchParams.get('template_kind') as DraftKind | null) ?? undefined,
    status: (url.searchParams.get('status') as DraftStatus | null) ?? undefined,
  };
  const rows = await listDrafts(pool, filter);
  return new Response(JSON.stringify({ drafts: rows }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Create `[id].ts` (GET detail)**

```typescript
// website/src/pages/api/admin/coaching/drafts/[id].ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getDraft } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const d = await getDraft(pool, id);
  if (!d) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 3: Create `[id]/accept.ts` (POST)**

```typescript
// website/src/pages/api/admin/coaching/drafts/[id]/accept.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { acceptDraft } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const POST: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reviewedBy = (session as any).email ?? (session as any).user ?? 'admin';
  const then = url.searchParams.get('then');

  try {
    const result = await acceptDraft(pool, id, {
      reviewedBy,
      payloadOverrides: (body as any).payload_overrides as Record<string, unknown> | undefined,
      snippetTitleOverride: (body as any).snippet_title as string | undefined,
      tags: (body as any).tags as string[] | undefined,
    });
    const out: Record<string, unknown> = {
      draft: result.draft,
      snippet_id: result.snippetId,
    };
    if (then === 'publish') {
      out.redirect_to = `/admin/knowledge/snippets/${result.snippetId}/publish`;
    }
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
};
```

- [ ] **Step 4: Create `[id]/reject.ts` (POST)**

```typescript
// website/src/pages/api/admin/coaching/drafts/[id]/reject.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { rejectDraft } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reason = (body as any).reason as string | undefined;
  const reviewedBy = (session as any).email ?? (session as any).user ?? 'admin';
  try {
    const draft = await rejectDraft(pool, id, reviewedBy, reason);
    return new Response(JSON.stringify({ draft }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
};
```

- [ ] **Step 5: Type-check + commit**

Run: `cd website && npx astro check 2>&1 | tail -10`
Expected: zero errors in the new files.

```bash
git add website/src/pages/api/admin/coaching/drafts/
git commit -m "$(cat <<'EOF'
feat(coaching): drafts API — list, detail, accept, reject

Mirrors snippets API auth + JSON pattern. Accept supports
?then=publish to surface the publish redirect URL in the response;
the client uses that to navigate into the Phase-2 publish editor
without an extra round trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Acceptance-rate endpoint

**Files:**
- Create: `website/src/pages/api/admin/coaching/books/[id]/acceptance-rate.ts`

**Context:** Tiny GET endpoint backing the badge in DraftsInbox. Public to admin only.

- [ ] **Step 1: Write the file**

```typescript
// website/src/pages/api/admin/coaching/books/[id]/acceptance-rate.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { acceptanceRateByBook } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const r = await acceptanceRateByBook(pool, params.id as string);
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/api/admin/coaching/books/
git commit -m "$(cat <<'EOF'
feat(coaching): acceptance-rate-per-book endpoint

Backs the <30% red badge in DraftsInbox. Computes accepted /
(accepted + rejected + skipped) — open drafts excluded from the
denominator so a fresh book doesn't read 0% before triage starts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Drafts-Inbox UI — `DraftsInbox.svelte` + host page

**Files:**
- Create: `website/src/components/admin/DraftsInbox.svelte`
- Create: `website/src/pages/admin/knowledge/drafts.astro`

**Context:** Reuse the mentolder dark theme (brass + sage, Newsreader/Geist) per `feedback_visual_companion_brand.md` memory. Three-pane layout: left filter rail (book + kind chips + status toggle), center grouped list, right detail. Detail shows verbatim chunk left + editable suggested payload right with three primary actions (Accept, Reject, Skip→Publish). Empty state: "Noch keine Drafts. Lauf `task coaching:classify -- --slug=<slug>` nach dem ersten Buch-Ingest."

- [ ] **Step 1: Astro host page**

```astro
---
// website/src/pages/admin/knowledge/drafts.astro
import AdminLayout from '../../../layouts/AdminLayout.astro';
import DraftsInbox from '../../../components/admin/DraftsInbox.svelte';
import { getSession, isAdmin } from '../../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) {
  return Astro.redirect('/admin/login');
}
---

<AdminLayout title="Drafts-Inbox — Coaching Knowledge">
  <DraftsInbox client:load />
</AdminLayout>
```

If `AdminLayout.astro` doesn't exist yet, copy the layout used by `website/src/pages/admin/knowledge/snippets/index.astro` (which Phase 1 already created) and adapt the title slot.

- [ ] **Step 2: Svelte component scaffold**

```svelte
<!-- website/src/components/admin/DraftsInbox.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type Kind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
  type Status = 'open' | 'accepted' | 'rejected' | 'skipped';
  interface Draft {
    id: string;
    book_id: string;
    template_kind: Kind;
    suggested_payload: Record<string, unknown>;
    status: Status;
    created_at: string;
  }
  interface Book { id: string; title: string; author: string | null }
  interface Detail extends Draft { chunkText: string; page: number | null }

  let books: Book[] = [];
  let drafts: Draft[] = [];
  let selectedBook: string | null = null;
  let selectedKinds: Set<Kind> = new Set(['reflection', 'dialog_pattern', 'exercise', 'case_example']);
  let selectedStatus: Status = 'open';
  let detail: Detail | null = null;
  let editPayload: string = '';
  let acceptanceRate: { acceptanceRate: number | null; accepted: number; rejected: number; skipped: number; total: number } | null = null;
  let working = false;
  let toast: string | null = null;

  const KIND_LABEL: Record<Kind, string> = {
    reflection: 'Reflexion',
    dialog_pattern: 'Dialog-Muster',
    exercise: 'Übung',
    case_example: 'Fallbeispiel',
  };

  onMount(async () => {
    const r = await fetch('/api/admin/coaching/books').then((x) => x.json());
    books = r.books ?? [];
    if (books.length > 0) selectedBook = books[0].id;
    await refresh();
  });

  async function refresh() {
    const params = new URLSearchParams();
    if (selectedBook) params.set('book_id', selectedBook);
    params.set('status', selectedStatus);
    const r = await fetch(`/api/admin/coaching/drafts?${params}`).then((x) => x.json());
    drafts = (r.drafts as Draft[]).filter((d) => selectedKinds.has(d.template_kind));
    if (selectedBook) {
      acceptanceRate = await fetch(`/api/admin/coaching/books/${selectedBook}/acceptance-rate`).then((x) => x.json());
    }
  }

  async function open(id: string) {
    detail = await fetch(`/api/admin/coaching/drafts/${id}`).then((x) => x.json());
    editPayload = JSON.stringify(detail!.suggested_payload, null, 2);
  }

  async function accept(then?: 'publish') {
    if (!detail) return;
    working = true;
    try {
      const body = { payload_overrides: JSON.parse(editPayload) };
      const url = `/api/admin/coaching/drafts/${detail.id}/accept${then ? '?then=publish' : ''}`;
      const r = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Accept fehlgeschlagen');
      toast = `Snippet erstellt (id=${j.snippet_id})`;
      detail = null;
      await refresh();
      if (j.redirect_to) window.location.href = j.redirect_to;
    } catch (err) { toast = err instanceof Error ? err.message : String(err); }
    finally { working = false; }
  }

  async function reject() {
    if (!detail) return;
    const reason = window.prompt('Ablehnungsgrund (optional):') ?? '';
    working = true;
    try {
      const r = await fetch(`/api/admin/coaching/drafts/${detail.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        headers: { 'content-type': 'application/json' },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Reject fehlgeschlagen');
      toast = 'Draft abgelehnt';
      detail = null;
      await refresh();
    } catch (err) { toast = err instanceof Error ? err.message : String(err); }
    finally { working = false; }
  }

  function toggleKind(k: Kind) {
    if (selectedKinds.has(k)) selectedKinds.delete(k); else selectedKinds.add(k);
    selectedKinds = selectedKinds;
    refresh();
  }

  $: groupedByKind = drafts.reduce((acc, d) => {
    (acc[d.template_kind] ||= []).push(d);
    return acc;
  }, {} as Record<Kind, Draft[]>);

  $: rateBadge = acceptanceRate?.acceptanceRate;
  $: rateClass = rateBadge === null ? 'badge--muted' : rateBadge < 0.3 ? 'badge--warn' : 'badge--ok';
</script>

<div class="inbox">
  <aside class="rail">
    <h3>Buch</h3>
    <select bind:value={selectedBook} on:change={refresh}>
      {#each books as b}<option value={b.id}>{b.title}</option>{/each}
    </select>

    {#if acceptanceRate}
      <div class="rate {rateClass}">
        <strong>{rateBadge === null ? '—' : Math.round(rateBadge * 100) + '%'}</strong>
        <small>Accept-Rate · {acceptanceRate.accepted}✓ {acceptanceRate.rejected}✗ {acceptanceRate.skipped}↻</small>
        {#if rateBadge !== null && rateBadge < 0.3}
          <p class="warn">Klassifikator versagt — lieber manuell im Themen-Browser arbeiten.</p>
        {/if}
      </div>
    {/if}

    <h3>Art</h3>
    {#each Object.keys(KIND_LABEL) as k}
      <label class="chip">
        <input type="checkbox" checked={selectedKinds.has(k as Kind)} on:change={() => toggleKind(k as Kind)} />
        {KIND_LABEL[k as Kind]}
      </label>
    {/each}

    <h3>Status</h3>
    <select bind:value={selectedStatus} on:change={refresh}>
      <option value="open">Offen</option>
      <option value="accepted">Akzeptiert</option>
      <option value="rejected">Abgelehnt</option>
      <option value="skipped">Übersprungen</option>
    </select>
  </aside>

  <section class="list">
    {#if drafts.length === 0}
      <p class="empty">Noch keine Drafts. Lauf <code>task coaching:classify -- --slug=&lt;slug&gt;</code> nach dem ersten Buch-Ingest.</p>
    {:else}
      {#each Object.entries(groupedByKind) as [kind, list]}
        <h2>{KIND_LABEL[kind as Kind]} <span class="count">{list.length}</span></h2>
        <ul>
          {#each list as d}
            <li class:active={detail?.id === d.id}>
              <button on:click={() => open(d.id)}>
                {(d.suggested_payload as any)?.title ?? '(ohne Titel)'}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <article class="detail">
    {#if !detail}
      <p class="empty">Wähle einen Draft aus der Liste.</p>
    {:else}
      <header>
        <span class="kind">{KIND_LABEL[detail.template_kind]}</span>
        {#if detail.page !== null}<span class="page">S. {detail.page}</span>{/if}
      </header>
      <div class="cols">
        <div class="orig">
          <h4>Original-Buchstelle</h4>
          <pre>{detail.chunkText}</pre>
        </div>
        <div class="sugg">
          <h4>KI-Vorschlag</h4>
          <textarea bind:value={editPayload} rows={20} spellcheck="false"></textarea>
        </div>
      </div>
      <footer>
        <button disabled={working} on:click={() => accept()}>Als Snippet speichern</button>
        <button disabled={working} on:click={() => accept('publish')}>Direkt veröffentlichen →</button>
        <button disabled={working} class="danger" on:click={reject}>Ablehnen</button>
      </footer>
    {/if}
  </article>

  {#if toast}<div class="toast" on:click={() => (toast = null)}>{toast}</div>{/if}
</div>

<style>
  /* Mentolder dark: brass #c9a978, sage #8fb39c, ink #15191a, paper #ece7dd, font Newsreader + Geist */
  .inbox { display: grid; grid-template-columns: 240px 320px 1fr; height: calc(100vh - 60px); background: #15191a; color: #ece7dd; font-family: 'Geist', system-ui, sans-serif; }
  .rail { padding: 1rem; border-right: 1px solid #2a2f31; overflow-y: auto; }
  .rail h3 { font-family: 'Newsreader', serif; font-weight: 500; color: #c9a978; margin-top: 1.25rem; }
  .rail select, .rail .chip { display: block; width: 100%; margin: 0.25rem 0; background: #1f2426; color: inherit; border: 1px solid #2a2f31; padding: 0.4rem; border-radius: 4px; }
  .rail .chip { display: flex; gap: 0.5rem; align-items: center; cursor: pointer; }
  .rate { margin-top: 1rem; padding: 0.5rem; border-radius: 4px; }
  .rate strong { font-size: 1.5rem; }
  .badge--ok { background: #1c2a23; color: #8fb39c; }
  .badge--warn { background: #3a1f1c; color: #d97a6c; }
  .badge--muted { background: #1f2426; color: #888; }
  .warn { font-size: 0.8rem; margin-top: 0.5rem; color: #d97a6c; }
  .list { padding: 1rem; border-right: 1px solid #2a2f31; overflow-y: auto; }
  .list h2 { font-family: 'Newsreader', serif; color: #c9a978; font-size: 1rem; margin-top: 1rem; }
  .list .count { color: #888; font-size: 0.85em; }
  .list ul { list-style: none; padding: 0; }
  .list li.active button { background: #2a2f31; }
  .list li button { width: 100%; text-align: left; background: transparent; color: inherit; border: none; padding: 0.4rem; cursor: pointer; border-radius: 4px; }
  .list li button:hover { background: #1f2426; }
  .empty { color: #888; padding: 2rem; }
  .empty code { background: #1f2426; padding: 0.1em 0.4em; border-radius: 3px; }
  .detail { padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; }
  .detail header { display: flex; gap: 0.5rem; align-items: center; }
  .detail .kind { background: #c9a978; color: #15191a; padding: 0.2em 0.6em; border-radius: 3px; font-size: 0.85em; }
  .detail .page { color: #888; font-size: 0.85em; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; flex: 1; margin: 1rem 0; }
  .orig pre { background: #1f2426; padding: 1rem; border-radius: 4px; white-space: pre-wrap; font-family: 'Newsreader', serif; line-height: 1.5; max-height: 60vh; overflow-y: auto; }
  .sugg textarea { width: 100%; background: #1f2426; color: inherit; border: 1px solid #2a2f31; padding: 1rem; border-radius: 4px; font-family: 'Geist Mono', monospace; font-size: 0.85em; }
  footer { display: flex; gap: 0.5rem; padding-top: 1rem; }
  footer button { background: #8fb39c; color: #15191a; border: none; padding: 0.6em 1em; border-radius: 4px; cursor: pointer; font-weight: 500; }
  footer button.danger { background: #d97a6c; }
  footer button:disabled { opacity: 0.5; cursor: wait; }
  .toast { position: fixed; bottom: 1rem; right: 1rem; background: #c9a978; color: #15191a; padding: 0.8em 1.2em; border-radius: 4px; cursor: pointer; }
</style>
```

- [ ] **Step 3: Type-check the new files**

Run: `cd website && npx astro check 2>&1 | tail -10`
Expected: no errors related to `drafts.astro` or `DraftsInbox.svelte`.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/DraftsInbox.svelte website/src/pages/admin/knowledge/drafts.astro
git commit -m "$(cat <<'EOF'
feat(coaching): Drafts-Inbox UI

Three-pane: left filter rail (book + kind chips + status), center
grouped list, right two-column detail (verbatim chunk vs editable
JSON payload). Three primary actions: Als Snippet speichern,
Direkt veröffentlichen → (Skip-Snippet-Modus, redirects into
Phase-2 publish editor), Ablehnen with optional reason. Acceptance-
rate badge turns red <30% with the spec-mandated 'lieber manuell'
warning. Empty state surfaces the classify-task command. Mentolder
dark palette per visual companion brand memory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: E2E — Playwright unauth checks

**Files:**
- Create: `website/tests/e2e/coaching-drafts.spec.ts`

**Context:** Same pattern as Phase 2's `fa-coaching-publish.spec.ts`: hit each new endpoint and the page without a session cookie, assert 401 / redirect-to-login. We don't have a real classifier run in CI, so we don't go beyond auth checks here.

- [ ] **Step 1: Write the spec**

```typescript
// website/tests/e2e/coaching-drafts.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://web.mentolder.de';

test.describe('coaching drafts — unauth', () => {
  test('GET /api/admin/coaching/drafts → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/drafts`);
    expect(r.status()).toBe(401);
  });

  test('GET /api/admin/coaching/drafts/abc → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/drafts/abc`);
    expect(r.status()).toBe(401);
  });

  test('POST /api/admin/coaching/drafts/abc/accept → 401', async ({ request }) => {
    const r = await request.post(`${BASE}/api/admin/coaching/drafts/abc/accept`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('POST /api/admin/coaching/drafts/abc/reject → 401', async ({ request }) => {
    const r = await request.post(`${BASE}/api/admin/coaching/drafts/abc/reject`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('GET /api/admin/coaching/books/abc/acceptance-rate → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/books/abc/acceptance-rate`);
    expect(r.status()).toBe(401);
  });

  test('GET /admin/knowledge/drafts → redirect to login', async ({ page }) => {
    const resp = await page.goto(`${BASE}/admin/knowledge/drafts`);
    // Either a 302 to /admin/login or a rendered login page; just assert we don't see Inbox content.
    await expect(page).not.toHaveURL(/\/admin\/knowledge\/drafts$/);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add website/tests/e2e/coaching-drafts.spec.ts
git commit -m "$(cat <<'EOF'
test(coaching): Playwright unauth checks for drafts endpoints + page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Mark plan completed + open PR

**Files:**
- Modify: `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-3.md` (this file)

- [ ] **Step 1: Flip status front-matter**

In the plan front-matter at the top of this file, change:
```
status: draft
```
to:
```
status: completed
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-3.md
git commit -m "$(cat <<'EOF'
docs(plans): mark Phase 3 plan completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push branch + open PR (auto-merge per workflow memory)**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(coaching): phase 3 — drafts-inbox + auto-classifier" --body "$(cat <<'EOF'
## Summary
- New `coaching.drafts` table backing AI-classification triage; one row per (chunk, classifier_version), four reviewable kinds (theory/noise bypass).
- `coaching-classifier.ts` (Anthropic Haiku 4.5, Zod-validated JSON envelope, one-shot retry on schema failure) + `task coaching:classify` CLI.
- `--classify` flag on `coaching:ingest`.
- `/admin/knowledge/drafts` Inbox: three-pane UI, two-column verbatim-chunk-vs-payload detail, Accept / Direkt veröffentlichen (Skip-Snippet → Phase-2 publish editor) / Ablehnen.
- Acceptance-rate badge per book with the spec-mandated <30% warning.

The book is not yet uploaded — the Inbox renders an empty-state pointing at `task coaching:classify -- --slug=<slug>`. End-to-end exercise happens once the first ingest lands.

Phase 3 from spec `docs/superpowers/specs/2026-05-10-coaching-knowledge-design.md`.
Plan: `docs/superpowers/plans/2026-05-10-coaching-knowledge-phase-3.md`.

## Test plan
- [ ] `npx vitest run src/lib/coaching-classifier.test.ts` (9 tests)
- [ ] `npx vitest run src/lib/coaching-db.test.ts` (existing + 6 new)
- [ ] `task workspace:validate ENV=mentolder`
- [ ] After merge + deploy: `task website:deploy ENV=mentolder` then visit `/admin/knowledge/drafts` (empty state).
- [ ] Future, after the first book lands: `task coaching:classify -- --slug=<slug>` then re-visit Inbox.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" && gh pr merge --squash --auto
```

---

## Self-Review

**Spec coverage:**
- Auto-Klassifikation 5 kinds (incl. theory bypass) — Task 2 ✓
- Hallucination guard via verbatim original chunk shown alongside — Task 9 (left "Original-Buchstelle" pane reads from `getDraft`'s `chunkText` join) ✓
- Drafts-Inbox URL `/admin/knowledge/drafts` — Task 9 ✓
- Group-by template-kind, two-column detail — Task 9 ✓
- Acceptance-rate per book with <30% warning — Task 8 + Task 9 ✓
- Skip-Snippet-Modus — Task 7 (`?then=publish`) + Task 9 (button) ✓
- Source-Pointer preserved — drafts FK `knowledge_chunk_id` joins back to `knowledge.chunks` which has `metadata.page` from Phase 1 ✓
- Re-classification with `classifier_version` bump — Task 1 (UNIQUE constraint includes version) + Task 5 (NOT EXISTS skip) ✓
- §51 UrhG quote-length — Phase-2 already enforces this on the published Template via `quote-validator.ts`; drafts hold raw text in admin-only views, so this carries through unchanged ✓
- Per-chapter rate — explicitly out of scope (open-decision baked in) ✓

**Placeholder scan:** One `TODO` in Task 4 Step 3 (`seedBookAndChunk` helper) — flagged because it depends on the existing pg-mem boilerplate at the top of the existing `coaching-db.test.ts`, which the implementer has to look at to lift cleanly. Acceptable: the comment tells them exactly what to copy.

**Type consistency:** `Draft` / `DraftKind` / `DraftStatus` / `DraftFilter` are defined once in Task 4 and reused as imports in Tasks 7, 8, 9 — names and shapes match throughout. `acceptDraft` returns `{ draft, snippetId }` everywhere it's referenced. `classifyChunk` signature `(text, opts) → ClassifierResult` matches in Task 5's import.
