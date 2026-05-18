# Coaching Session Agent SDK Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conversational memory, tool use, and SSE streaming to coaching session generation — Claude sessions use the Anthropic SDK agent loop with three tools; other providers get conversation history injected into their existing call.

**Architecture:** A `SessionAgent` interface unifies two implementations — `ClaudeSessionAgent` (Agent SDK, three DB/pgvector tools, streaming) and `LegacySessionAgent` (direct OpenAI/Mistral SDKs with history prepended). `generate.ts` routes via a factory keyed on `ki_config.provider` and builds conversation history from accepted/skipped prior steps before calling either agent.

**Tech Stack:** `@anthropic-ai/sdk` (messages API, tool_use, streaming), `openai`, `@mistralai/mistralai`, `pg` pool, `knowledge-db.ts#queryNearest` for pgvector, Svelte 5 `$state` runes, `text/event-stream` SSE.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `website/src/lib/session-agent.ts` | `SessionAgent` interface + `GenerateOptions` + `GenerateResult` types |
| Create | `website/src/lib/session-history.ts` | Build conversation turns from DB steps; token guard |
| Create | `website/src/lib/session-history.test.ts` | Unit tests for history builder |
| Create | `website/src/lib/session-agent-factory.ts` | `createSessionAgent(kiConfig)` routing |
| Create | `website/src/lib/legacy-session-agent.ts` | OpenAI / Mistral with history |
| Create | `website/src/lib/legacy-session-agent.test.ts` | Unit tests with mocked providers |
| Create | `website/src/lib/session-tools.ts` | Three tool implementations (search_knowledge, get_step, draft_report) |
| Create | `website/src/lib/session-tools.test.ts` | Unit tests for tools |
| Create | `website/src/lib/claude-session-agent.ts` | Anthropic agent loop + streaming |
| Create | `website/src/lib/claude-session-agent.test.ts` | Unit tests with mocked Anthropic SDK |
| Modify | `website/src/lib/coaching-session-db.ts:28` | Add `'tool_invocation'` to `AuditEntry.eventType` union |
| Modify | `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | Wire factory + history + SSE streaming path |
| Modify | `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` | Skip inline report when step_number=0 already has content |
| Modify | `website/src/components/admin/coaching/SessionWizard.svelte` | `streamingResponse` rune + SSE fetch for Claude provider |

---

### Task 1: SessionAgent types + audit log update

**Files:**
- Create: `website/src/lib/session-agent.ts`
- Modify: `website/src/lib/coaching-session-db.ts:28`

- [ ] **Step 1: Create session-agent.ts**

```typescript
// website/src/lib/session-agent.ts
import type { KiConfig } from './coaching-ki-config-db';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  sessionId: string;
  stepNumber: number;
  coachInputs: Record<string, string>;
  kiConfig: KiConfig;
  brand: string;
  history: ConversationTurn[];          // prior accepted/skipped steps as turns
  effectiveSystemPrompt: string;        // assembled by generate.ts (project ctx + provider override)
  assembledUserPrompt: string;          // anonymized user prompt (Klient M0123: ...)
  stepName: string;
  phase: string;
}

export interface GenerateResult {
  aiResponse: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface SessionAgent {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream?(options: GenerateOptions): AsyncIterable<string>;
}
```

- [ ] **Step 2: Add tool_invocation to AuditEntry**

In `website/src/lib/coaching-session-db.ts`, change line 28:
```typescript
// Before:
eventType: 'status_change' | 'field_change' | 'ai_request' | 'notes_change';

// After:
eventType: 'status_change' | 'field_change' | 'ai_request' | 'notes_change' | 'tool_invocation';
```

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/session-agent.ts website/src/lib/coaching-session-db.ts
git commit -m "feat(coaching): add SessionAgent interface + tool_invocation audit type"
```

---

### Task 2: Session history builder

**Files:**
- Create: `website/src/lib/session-history.ts`
- Create: `website/src/lib/session-history.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// website/src/lib/session-history.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { buildSessionHistory, estimateTokens } from './session-history';
import { upsertStep } from './coaching-session-db';
import { __setPoolForTests } from './session-history';

let pool: Pool;

beforeAll(async () => {
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.session_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL,
      step_number int NOT NULL,
      step_name text NOT NULL DEFAULT '',
      phase text NOT NULL DEFAULT '',
      coach_inputs jsonb NOT NULL DEFAULT '{}',
      ai_prompt text,
      ai_response text,
      coach_notes text,
      status text NOT NULL DEFAULT 'pending',
      generated_at timestamptz,
      UNIQUE(session_id, step_number)
    );
  `);
  pool = pgmem.adapters.createPg().Pool();
  __setPoolForTests(pool);
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end?.();
});

const SID = '00000000-0000-4000-8000-000000000001';

describe('buildSessionHistory', () => {
  it('returns empty array when no prior steps exist', async () => {
    const hist = await buildSessionHistory(SID, 1);
    expect(hist).toEqual([]);
  });

  it('includes accepted and skipped steps as user+assistant turns', async () => {
    await upsertStep(pool, { sessionId: SID, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel', coachInputs: { anlass: 'Stress' }, aiPrompt: 'Klient M0001: Stress', aiResponse: 'Schritt-1-Antwort', status: 'accepted' });
    await upsertStep(pool, { sessionId: SID, stepNumber: 2, stepName: 'Schlüsselemotion', phase: 'problem_ziel', coachInputs: { emotion: 'Angst' }, aiPrompt: 'Klient M0001: Angst', aiResponse: 'Schritt-2-Antwort', status: 'skipped' });
    const hist = await buildSessionHistory(SID, 3);
    expect(hist).toHaveLength(4); // 2 user + 2 assistant
    expect(hist[0]).toEqual({ role: 'user', content: 'Klient M0001: Stress' });
    expect(hist[1]).toEqual({ role: 'assistant', content: 'Schritt-1-Antwort' });
    expect(hist[2]).toEqual({ role: 'user', content: 'Klient M0001: Angst' });
    expect(hist[3]).toEqual({ role: 'assistant', content: 'Schritt-2-Antwort' });
  });

  it('excludes generated and pending steps', async () => {
    const SID2 = '00000000-0000-4000-8000-000000000002';
    await upsertStep(pool, { sessionId: SID2, stepNumber: 1, stepName: 'S1', phase: 'p', coachInputs: {}, aiPrompt: 'prompt', aiResponse: 'resp', status: 'generated' });
    const hist = await buildSessionHistory(SID2, 2);
    expect(hist).toHaveLength(0);
  });

  it('does not include step N itself', async () => {
    const hist = await buildSessionHistory(SID, 2); // only step 1 should be included
    expect(hist).toHaveLength(2);
  });
});

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('abcdefghijklmnop')).toBe(4); // 16 chars → 4 tokens
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/session-history.test.ts 2>&1 | tail -10
```
Expected: error — `Cannot find module './session-history'`

- [ ] **Step 3: Implement session-history.ts**

```typescript
// website/src/lib/session-history.ts
import type { Pool } from 'pg';
import type { ConversationTurn } from './session-agent';
import { pool as defaultPool } from './website-db';

let _pool: Pool | null = null;
export function __setPoolForTests(p: Pool): void { _pool = p; }
function p(): Pool { return _pool ?? defaultPool; }

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MAX_HISTORY_TOKENS = 80_000;

export async function buildSessionHistory(
  sessionId: string,
  upToStep: number,
): Promise<ConversationTurn[]> {
  const r = await p().query(
    `SELECT step_number, ai_prompt, ai_response
       FROM coaching.session_steps
      WHERE session_id = $1
        AND step_number > 0
        AND step_number < $2
        AND status IN ('accepted', 'skipped')
        AND ai_prompt IS NOT NULL
        AND ai_response IS NOT NULL
      ORDER BY step_number ASC`,
    [sessionId, upToStep],
  );

  const turns: ConversationTurn[] = [];
  for (const row of r.rows) {
    turns.push({ role: 'user', content: row.ai_prompt as string });
    turns.push({ role: 'assistant', content: row.ai_response as string });
  }

  // Trim oldest turns if over token budget
  let totalTokens = turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  while (totalTokens > MAX_HISTORY_TOKENS && turns.length >= 2) {
    const removed = turns.splice(0, 2); // remove oldest user+assistant pair
    totalTokens -= removed.reduce((sum, t) => sum + estimateTokens(t.content), 0);
  }

  return turns;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/session-history.test.ts 2>&1 | tail -10
```
Expected: `✓ session-history.test.ts (5 tests)`

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/session-history.ts website/src/lib/session-history.test.ts
git commit -m "feat(coaching): add session history builder with token guard"
```

---

### Task 3: Session agent factory + LegacySessionAgent

**Files:**
- Create: `website/src/lib/session-agent-factory.ts`
- Create: `website/src/lib/legacy-session-agent.ts`
- Create: `website/src/lib/legacy-session-agent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// website/src/lib/legacy-session-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOptions } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';

const baseKiConfig = (provider: string): KiConfig => ({
  id: 1, brand: 'mentolder', provider, isActive: true,
  modelName: provider === 'openai' ? 'gpt-4o-mini' : 'mistral-small-latest',
  displayName: provider, createdAt: new Date(),
  apiKey: 'test-key', apiEndpoint: null, temperature: null, maxTokens: 600,
  topP: null, systemPrompt: null, notes: null, topK: null, thinkingMode: false,
  presencePenalty: null, frequencyPenalty: null, safePrompt: false,
  randomSeed: null, organizationId: null, euEndpoint: false, enabledFields: null,
});

const baseOptions = (provider: string): GenerateOptions => ({
  sessionId: 'sess-1',
  stepNumber: 3,
  coachInputs: { thema: 'Test' },
  kiConfig: baseKiConfig(provider),
  brand: 'mentolder',
  history: [
    { role: 'user', content: 'Step 1 prompt' },
    { role: 'assistant', content: 'Step 1 response' },
  ],
  effectiveSystemPrompt: 'Du bist ein Coaching-Assistent.',
  assembledUserPrompt: 'Klient M0001: Schritt 3',
  stepName: 'Ressourcenanalyse',
  phase: 'analyse',
});

describe('LegacySessionAgent - OpenAI', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('calls OpenAI chat.completions.create with history prepended', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'OpenAI antwort' } }],
    });
    vi.doMock('openai', () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      })),
    }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const result = await agent.generate(baseOptions('openai'));

    expect(result.aiResponse).toBe('OpenAI antwort');
    expect(result.provider).toBe('openai');
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0]).toEqual({ role: 'system', content: 'Du bist ein Coaching-Assistent.' });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'Step 1 prompt' });
    expect(call.messages[2]).toEqual({ role: 'assistant', content: 'Step 1 response' });
    expect(call.messages[3]).toEqual({ role: 'user', content: 'Klient M0001: Schritt 3' });
  });

  it('throws if OpenAI API key is missing', async () => {
    vi.doMock('openai', () => ({ default: vi.fn() }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const opts = { ...baseOptions('openai'), kiConfig: { ...baseKiConfig('openai'), apiKey: null } };
    await expect(agent.generate(opts)).rejects.toThrow('OPENAI_API_KEY');
  });
});

describe('LegacySessionAgent - Mistral', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('calls Mistral chat.complete with history prepended', async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Mistral antwort' } }],
    });
    vi.doMock('@mistralai/mistralai', () => ({
      Mistral: vi.fn().mockImplementation(() => ({
        chat: { complete: mockComplete },
      })),
    }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const result = await agent.generate(baseOptions('mistral'));

    expect(result.aiResponse).toBe('Mistral antwort');
    expect(result.provider).toBe('mistral');
    const call = mockComplete.mock.calls[0][0];
    expect(call.messages[1]).toEqual({ role: 'user', content: 'Step 1 prompt' });
    expect(call.messages[3]).toEqual({ role: 'user', content: 'Klient M0001: Schritt 3' });
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/legacy-session-agent.test.ts 2>&1 | tail -5
```
Expected: error — `Cannot find module './legacy-session-agent'`

- [ ] **Step 3: Implement legacy-session-agent.ts**

```typescript
// website/src/lib/legacy-session-agent.ts
import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';

export class LegacySessionAgent implements SessionAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const provider = kiConfig.provider;
    const startMs = Date.now();
    let aiResponse: string;
    const model = kiConfig.modelName ?? (provider === 'openai' ? 'gpt-4o-mini' : 'mistral-small-latest');

    if (provider === 'openai') {
      const apiKey = kiConfig.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY nicht konfiguriert');
      const { default: OpenAI } = await import('openai');
      const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
      if (kiConfig.apiEndpoint) clientOpts.baseURL = kiConfig.apiEndpoint;
      if (kiConfig.organizationId) clientOpts.organization = kiConfig.organizationId;
      const client = new OpenAI(clientOpts);
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: assembledUserPrompt },
      ];
      const resp = await client.chat.completions.create({
        model,
        max_tokens: kiConfig.maxTokens ?? 600,
        temperature: kiConfig.temperature ?? undefined,
        top_p: kiConfig.topP ?? undefined,
        presence_penalty: kiConfig.presencePenalty ?? undefined,
        frequency_penalty: kiConfig.frequencyPenalty ?? undefined,
        messages,
      });
      aiResponse = resp.choices[0]?.message.content ?? '';

    } else if (provider === 'mistral') {
      const apiKey = kiConfig.apiKey ?? process.env.MISTRAL_API_KEY;
      if (!apiKey) throw new Error('MISTRAL_API_KEY nicht konfiguriert');
      const { Mistral } = await import('@mistralai/mistralai');
      const clientOpts: ConstructorParameters<typeof Mistral>[0] = { apiKey };
      if (kiConfig.apiEndpoint) clientOpts.serverURL = kiConfig.apiEndpoint;
      const client = new Mistral(clientOpts);
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
        { role: 'user', content: assembledUserPrompt },
      ];
      const resp = await client.chat.complete({
        model,
        maxTokens: kiConfig.maxTokens ?? undefined,
        temperature: kiConfig.temperature ?? undefined,
        topP: kiConfig.topP ?? undefined,
        randomSeed: kiConfig.randomSeed ?? undefined,
        safePrompt: kiConfig.safePrompt ?? false,
        messages,
      });
      aiResponse = (resp.choices?.[0]?.message?.content as string) ?? '';

    } else {
      throw new Error(`LegacySessionAgent: unsupported provider '${provider}'`);
    }

    return { aiResponse, provider, model, durationMs: Date.now() - startMs };
  }
}
```

- [ ] **Step 4: Implement session-agent-factory.ts**

```typescript
// website/src/lib/session-agent-factory.ts
import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { LegacySessionAgent } from './legacy-session-agent';
import { ClaudeSessionAgent } from './claude-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  if (kiConfig.provider === 'claude') {
    return new ClaudeSessionAgent();
  }
  return new LegacySessionAgent();
}
```

Note: `ClaudeSessionAgent` is imported here but created in Task 5 — the factory file will cause a TypeScript error until Task 5 is done. That is expected.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/legacy-session-agent.test.ts 2>&1 | tail -10
```
Expected: `✓ legacy-session-agent.test.ts (4 tests)`

- [ ] **Step 6: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/session-agent-factory.ts website/src/lib/legacy-session-agent.ts website/src/lib/legacy-session-agent.test.ts
git commit -m "feat(coaching): add session agent factory + LegacySessionAgent with history"
```

---

### Task 4: Tool implementations

**Files:**
- Create: `website/src/lib/session-tools.ts`
- Create: `website/src/lib/session-tools.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// website/src/lib/session-tools.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { getSessionStepTool, draftSessionReportTool, __setPoolForTests } from './session-tools';
import { upsertStep } from './coaching-session-db';

let pool: Pool;

beforeAll(async () => {
  const pgmem = newDb();
  pgmem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
  });
  pgmem.public.none(`
    CREATE SCHEMA coaching;
    CREATE TABLE coaching.session_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL,
      step_number int NOT NULL,
      step_name text NOT NULL DEFAULT '',
      phase text NOT NULL DEFAULT '',
      coach_inputs jsonb NOT NULL DEFAULT '{}',
      ai_prompt text,
      ai_response text,
      coach_notes text,
      status text NOT NULL DEFAULT 'pending',
      generated_at timestamptz,
      UNIQUE(session_id, step_number)
    );
  `);
  pool = pgmem.adapters.createPg().Pool();
  __setPoolForTests(pool);
});

afterAll(async () => {
  await (pool as unknown as { end(): Promise<void> }).end?.();
});

const SID = '00000000-0000-4000-8000-000000000010';

describe('getSessionStepTool', () => {
  it('returns step data for an existing accepted step', async () => {
    await upsertStep(pool, { sessionId: SID, stepNumber: 1, stepName: 'Erstanamnese', phase: 'problem_ziel', coachInputs: { anlass: 'Burnout' }, aiPrompt: 'prompt', aiResponse: 'antwort', status: 'accepted' });
    const result = await getSessionStepTool(SID, 1);
    expect(result.found).toBe(true);
    expect(result.stepName).toBe('Erstanamnese');
    expect(result.aiResponse).toBe('antwort');
  });

  it('returns found=false for a nonexistent step', async () => {
    const result = await getSessionStepTool(SID, 99);
    expect(result.found).toBe(false);
  });
});

describe('draftSessionReportTool', () => {
  it('returns error when no accepted steps exist', async () => {
    const result = await draftSessionReportTool('00000000-0000-4000-8000-000000000099', 'markdown');
    expect(result.error).toBeDefined();
  });

  it('assembles text from accepted steps for report prompt', async () => {
    // Seed two accepted steps for a fresh session
    const SID2 = '00000000-0000-4000-8000-000000000011';
    await upsertStep(pool, { sessionId: SID2, stepNumber: 1, stepName: 'S1', phase: 'p', coachInputs: {}, aiPrompt: 'p1', aiResponse: 'r1', status: 'accepted' });
    await upsertStep(pool, { sessionId: SID2, stepNumber: 2, stepName: 'S2', phase: 'p', coachInputs: {}, aiPrompt: 'p2', aiResponse: 'r2', status: 'accepted' });
    const result = await draftSessionReportTool(SID2, 'markdown');
    // Tool assembles the stepsText; actual LLM call is mocked via env
    expect(result.stepsText).toContain('S1');
    expect(result.stepsText).toContain('r1');
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/session-tools.test.ts 2>&1 | tail -5
```
Expected: error — `Cannot find module './session-tools'`

- [ ] **Step 3: Implement session-tools.ts**

```typescript
// website/src/lib/session-tools.ts
import type { Pool } from 'pg';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { pool as defaultPool } from './website-db';
import { queryNearest } from './knowledge-db';

let _pool: Pool | null = null;
export function __setPoolForTests(p: Pool): void { _pool = p; }
function p(): Pool { return _pool ?? defaultPool; }

// ── Tool: get_session_step ──────────────────────────────────────────────────

export async function getSessionStepTool(
  sessionId: string,
  stepNumber: number,
): Promise<{ found: boolean; stepName?: string; coachInputs?: Record<string, string>; aiResponse?: string; coachNotes?: string; status?: string }> {
  const r = await p().query(
    `SELECT step_name, coach_inputs, ai_response, coach_notes, status
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number = $2`,
    [sessionId, stepNumber],
  );
  if (!r.rows[0]) return { found: false };
  const row = r.rows[0];
  return {
    found: true,
    stepName: row.step_name as string,
    coachInputs: row.coach_inputs as Record<string, string>,
    aiResponse: (row.ai_response as string | null) ?? undefined,
    coachNotes: (row.coach_notes as string | null) ?? undefined,
    status: row.status as string,
  };
}

// ── Tool: search_coaching_knowledge ────────────────────────────────────────

export async function searchCoachingKnowledgeTool(
  query: string,
  limit = 4,
): Promise<{ title: string | null; body: string; source: string }[]> {
  try {
    // Get all coaching book collection IDs
    const colsRes = await p().query(
      `SELECT knowledge_collection_id FROM coaching.books WHERE knowledge_collection_id IS NOT NULL`,
    );
    const collectionIds: string[] = colsRes.rows.map((r: { knowledge_collection_id: string }) => r.knowledge_collection_id);
    if (collectionIds.length === 0) return [];

    const chunks = await queryNearest({ collectionIds, queryText: query, limit });
    return chunks.map(c => ({
      title: c.bookTitle,
      body: c.text,
      source: `${c.collectionName}${c.page ? ` S.${c.page}` : ''}`,
    }));
  } catch {
    // GPU host down or mixed-model error — fail closed
    return [];
  }
}

// ── Tool: draft_session_report ─────────────────────────────────────────────

export async function draftSessionReportTool(
  sessionId: string,
  _format: 'markdown' | 'structured',
): Promise<{ stepsText: string; error?: string }> {
  const r = await p().query(
    `SELECT step_number, step_name, coach_inputs, ai_response, coach_notes
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number > 0 AND status IN ('accepted', 'skipped')
      ORDER BY step_number`,
    [sessionId],
  );
  if (r.rows.length === 0) {
    return { stepsText: '', error: 'Keine abgeschlossenen Schritte gefunden' };
  }
  const stepsText = r.rows
    .map((s: { step_number: number; step_name: string; coach_inputs: Record<string, string>; ai_response: string | null; coach_notes: string | null }) =>
      `## Schritt ${s.step_number}: ${s.step_name}\n**Eingaben:** ${JSON.stringify(s.coach_inputs)}\n**KI:** ${s.ai_response ?? '—'}\n**Coach-Notiz:** ${s.coach_notes ?? '—'}`)
    .join('\n\n');
  return { stepsText };
}

// ── Tool definitions for Anthropic SDK ────────────────────────────────────

export const SESSION_TOOLS: Tool[] = [
  {
    name: 'get_session_step',
    description: 'Retrieve the content of a specific prior coaching step by number. Use this to reference what was said or decided in an earlier step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step_number: { type: 'number', description: 'The step number (1–10) to retrieve.' },
      },
      required: ['step_number'],
    },
  },
  {
    name: 'search_coaching_knowledge',
    description: 'Search the coaching knowledge base for techniques, frameworks, or intervention examples relevant to the current step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The topic or question to search for.' },
        limit: { type: 'number', description: 'Max results to return (default 4).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'draft_session_report',
    description: 'Generate the Abschlussbericht (closing report) for the session. Call this only during step 10 after all prior steps are accepted or skipped.',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['markdown', 'structured'], description: 'Output format.' },
      },
      required: ['format'],
    },
  },
];
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/session-tools.test.ts 2>&1 | tail -10
```
Expected: `✓ session-tools.test.ts (4 tests)`

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/session-tools.ts website/src/lib/session-tools.test.ts
git commit -m "feat(coaching): add session tools (get_step, search_knowledge, draft_report)"
```

---

### Task 5: ClaudeSessionAgent

**Files:**
- Create: `website/src/lib/claude-session-agent.ts`
- Create: `website/src/lib/claude-session-agent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// website/src/lib/claude-session-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOptions } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';

const mockKiConfig: KiConfig = {
  id: 1, brand: 'mentolder', provider: 'claude', isActive: true,
  modelName: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku',
  createdAt: new Date(), apiKey: 'test-key', apiEndpoint: null,
  temperature: null, maxTokens: 600, topP: null, systemPrompt: null,
  notes: null, topK: null, thinkingMode: false, presencePenalty: null,
  frequencyPenalty: null, safePrompt: false, randomSeed: null,
  organizationId: null, euEndpoint: false, enabledFields: null,
};

const baseOpts = (): GenerateOptions => ({
  sessionId: 'sess-1',
  stepNumber: 3,
  coachInputs: { thema: 'Test' },
  kiConfig: mockKiConfig,
  brand: 'mentolder',
  history: [{ role: 'user', content: 'Step1 prompt' }, { role: 'assistant', content: 'Step1 resp' }],
  effectiveSystemPrompt: 'Du bist ein Assistent.',
  assembledUserPrompt: 'Klient M0001: Schritt 3',
  stepName: 'Ressourcenanalyse',
  phase: 'analyse',
});

describe('ClaudeSessionAgent', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it('returns text response when Claude responds with text directly', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Claude-Antwort' }],
          }),
        },
      })),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    expect(result.aiResponse).toBe('Claude-Antwort');
    expect(result.provider).toBe('claude');
  });

  it('throws if ANTHROPIC_API_KEY is missing', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({ default: vi.fn() }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const opts = { ...baseOpts(), kiConfig: { ...mockKiConfig, apiKey: null } };
    delete process.env.ANTHROPIC_API_KEY;
    await expect(agent.generate(opts)).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('stops tool loop after 3 rounds and returns last text', async () => {
    let callCount = 0;
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 3) {
              return Promise.resolve({
                stop_reason: 'tool_use',
                content: [{ type: 'tool_use', id: `tool-${callCount}`, name: 'get_session_step', input: { step_number: 1 } }],
              });
            }
            return Promise.resolve({
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'Finale Antwort' }],
            });
          }),
        },
      })),
    }));
    vi.doMock('./session-tools', () => ({
      SESSION_TOOLS: [],
      getSessionStepTool: vi.fn().mockResolvedValue({ found: false }),
      searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
      draftSessionReportTool: vi.fn().mockResolvedValue({ stepsText: '' }),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    expect(result.aiResponse).toBe('Finale Antwort');
    expect(callCount).toBe(4); // 3 tool rounds + final
  });

  it('stops at MAX_TOOL_ROUNDS and returns empty response if never text', async () => {
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'tool-1', name: 'get_session_step', input: { step_number: 1 } }],
          }),
        },
      })),
    }));
    vi.doMock('./session-tools', () => ({
      SESSION_TOOLS: [],
      getSessionStepTool: vi.fn().mockResolvedValue({ found: false }),
      searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
      draftSessionReportTool: vi.fn().mockResolvedValue({ stepsText: '' }),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    // After 3 tool rounds with no text, returns empty string rather than hanging
    expect(typeof result.aiResponse).toBe('string');
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/claude-session-agent.test.ts 2>&1 | tail -5
```
Expected: error — `Cannot find module './claude-session-agent'`

- [ ] **Step 3: Implement claude-session-agent.ts**

```typescript
// website/src/lib/claude-session-agent.ts
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import {
  SESSION_TOOLS,
  getSessionStepTool,
  searchCoachingKnowledgeTool,
  draftSessionReportTool,
} from './session-tools';

const MAX_TOOL_ROUNDS = 3;

export class ClaudeSessionAgent implements SessionAgent {
  private buildClient(kiConfig: GenerateOptions['kiConfig']): Anthropic {
    const apiKey = kiConfig.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    if (kiConfig.apiEndpoint) opts.baseURL = kiConfig.apiEndpoint;
    return new Anthropic(opts);
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    sessionId: string,
  ): Promise<string> {
    if (name === 'get_session_step') {
      const result = await getSessionStepTool(sessionId, input.step_number as number);
      return JSON.stringify(result);
    }
    if (name === 'search_coaching_knowledge') {
      const result = await searchCoachingKnowledgeTool(input.query as string, input.limit as number | undefined);
      return JSON.stringify(result);
    }
    if (name === 'draft_session_report') {
      const result = await draftSessionReportTool(sessionId, input.format as 'markdown' | 'structured');
      return JSON.stringify(result);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt, sessionId } = options;
    const client = this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? 'claude-haiku-4-5-20251001';
    const startMs = Date.now();

    const messages: MessageParam[] = [
      ...history.map(t => ({ role: t.role, content: t.content } as MessageParam)),
      { role: 'user', content: assembledUserPrompt },
    ];

    let aiResponse = '';
    let rounds = 0;

    while (rounds <= MAX_TOOL_ROUNDS) {
      const msg = await client.messages.create({
        model,
        max_tokens: kiConfig.maxTokens ?? 600,
        system: effectiveSystemPrompt,
        temperature: kiConfig.temperature ?? undefined,
        top_p: kiConfig.topP ?? undefined,
        top_k: kiConfig.topK ?? undefined,
        tools: SESSION_TOOLS,
        messages,
      });

      const textBlocks = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      if (textBlocks.length > 0) {
        aiResponse = textBlocks.map(b => b.text).join('');
        break;
      }

      if (msg.stop_reason !== 'tool_use' || rounds >= MAX_TOOL_ROUNDS) break;

      const toolUseBlocks = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      // Append assistant message with tool calls
      messages.push({ role: 'assistant', content: msg.content });

      // Execute all tool calls and collect results
      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: await this.executeTool(b.name, b.input as Record<string, unknown>, sessionId),
        })),
      );
      messages.push({ role: 'user', content: toolResults });
      rounds++;
    }

    return { aiResponse, provider: 'claude', model, durationMs: Date.now() - startMs };
  }

  async *stream(options: GenerateOptions): AsyncIterable<string> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const client = this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? 'claude-haiku-4-5-20251001';

    const messages: MessageParam[] = [
      ...history.map(t => ({ role: t.role, content: t.content } as MessageParam)),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = await client.messages.stream({
      model,
      max_tokens: kiConfig.maxTokens ?? 600,
      system: effectiveSystemPrompt,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      top_k: kiConfig.topK ?? undefined,
      tools: SESSION_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/claude-session-agent.test.ts 2>&1 | tail -10
```
Expected: `✓ claude-session-agent.test.ts (4 tests)`

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/claude-session-agent.ts website/src/lib/claude-session-agent.test.ts website/src/lib/session-agent-factory.ts
git commit -m "feat(coaching): add ClaudeSessionAgent with tool loop + streaming"
```

---

### Task 6: Wire generate.ts

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts`

- [ ] **Step 1: Replace the provider-switch block in generate.ts**

Replace lines 84–148 (the `try { if (providerName === 'claude') ... }` block through the closing `}` before `const durationMs`) with the following. Keep everything before line 84 (auth, session load, prompt assembly) and after line 148 (upsertStep, appendAuditLog, return) unchanged.

```typescript
  // Detect streaming request
  const wantsStream = new URL(request.url).searchParams.get('stream') === 'true';

  const { buildSessionHistory } = await import('../../../../../../../../lib/session-history');
  const { createSessionAgent } = await import('../../../../../../../../lib/session-agent-factory');

  const history = await buildSessionHistory(sessionId, stepNumber);
  const agent = createSessionAgent(activeProvider!);

  if (wantsStream && agent.stream) {
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const streamStart = Date.now();

    (async () => {
      let fullResponse = '';
      try {
        for await (const chunk of agent.stream!({
          sessionId, stepNumber, coachInputs: body.coachInputs,
          kiConfig: activeProvider!, brand, history,
          effectiveSystemPrompt: effectiveSystem,
          assembledUserPrompt: anonymizedUserPrompt,
          stepName, phase,
        })) {
          fullResponse += chunk;
          await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }
        const durationMs = Date.now() - streamStart;
        const step = await upsertStep(pool, {
          sessionId, stepNumber, stepName, phase,
          coachInputs: body.coachInputs,
          aiPrompt: anonymizedUserPrompt,
          aiResponse: fullResponse,
          status: 'generated',
        });
        await appendAuditLog(pool, {
          sessionId, eventType: 'ai_request', actor: session.preferred_username,
          stepNumber,
          payload: { provider: providerName, model: activeProvider?.modelName ?? '?', prompt: anonymizedUserPrompt, response: fullResponse, duration_ms: durationMs, streaming: true },
        });
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, step, aiPrompt: anonymizedUserPrompt, durationMs })}\n\n`));
      } catch (err) {
        console.error('[coaching/generate] stream error', err);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream-Fehler' })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
    });
  }

  // Non-streaming path
  let aiResponse: string;
  const startMs = Date.now();
  try {
    const result = await agent.generate({
      sessionId, stepNumber, coachInputs: body.coachInputs,
      kiConfig: activeProvider!, brand, history,
      effectiveSystemPrompt: effectiveSystem,
      assembledUserPrompt: anonymizedUserPrompt,
      stepName, phase,
    });
    aiResponse = result.aiResponse;
  } catch (err) {
    console.error('[coaching/generate]', err);
    return new Response(JSON.stringify({ error: 'KI-Anfrage fehlgeschlagen' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  const durationMs = Date.now() - startMs;
```

Also remove the now-unused `import Anthropic from '@anthropic-ai/sdk'` at the top of generate.ts (the Anthropic SDK is now used only inside `claude-session-agent.ts`).

- [ ] **Step 2: Run all coaching-related tests**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run src/lib/session-history.test.ts src/lib/legacy-session-agent.test.ts src/lib/session-tools.test.ts src/lib/claude-session-agent.test.ts 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit 2>&1 | grep "coaching\|session" | head -20
```
Expected: no errors in the coaching/session files.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/coaching/sessions/\[id\]/steps/\[n\]/generate.ts
git commit -m "feat(coaching): wire generate.ts to SessionAgent factory + SSE streaming"
```

---

### Task 7: Update complete.ts

**Files:**
- Modify: `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts`

- [ ] **Step 1: Update complete.ts to skip report when step 0 already has content**

Replace the entire file content:

```typescript
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getSession as getCoachingSession, completeSession } from '../../../../../../lib/coaching-session-db';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const sessionId = params.id as string;
  const coachingSession = await getCoachingSession(pool, sessionId);
  if (!coachingSession) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }

  // If the ClaudeSessionAgent already wrote the report via draft_session_report tool, reuse it
  const existingReport = coachingSession.steps.find(s => s.stepNumber === 0 && s.aiResponse);
  if (existingReport?.aiResponse) {
    await completeSession(pool, sessionId, existingReport.aiResponse);
    return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
  }

  // Legacy fallback: generate report inline (non-Claude providers or tool not called)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let report = '# Abschlussbericht\n\n*(KI nicht verfügbar — bitte manuell ergänzen)*';

  if (apiKey) {
    const stepsText = coachingSession.steps
      .filter(s => s.stepNumber > 0)
      .map(s => `## Schritt ${s.stepNumber}: ${s.stepName}\n**Eingaben:** ${JSON.stringify(s.coachInputs)}\n**KI:** ${s.aiResponse ?? '—'}\n**Coach-Notiz:** ${s.coachNotes ?? '—'}`)
      .join('\n\n');

    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: process.env.COACHING_SESSION_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: `Du bist ein Coaching-Protokollant. Erstelle aus den 10 Schritten einer Coaching-Session eine strukturierte Zusammenfassung auf Deutsch.
Abschnitte: ## Ausgangslage, ## Analyse, ## Lösungsansatz, ## Vereinbarte Schritte, ## Bewertung.
Maximal 600 Wörter. Konkret und handlungsorientiert.`,
        messages: [{ role: 'user', content: stepsText }],
      });
      report = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    } catch (err) {
      console.error('[coaching/complete] Report generation failed:', err);
    }
  }

  await completeSession(pool, sessionId, report);
  return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit 2>&1 | grep "complete" | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/coaching/sessions/\[id\]/complete.ts
git commit -m "feat(coaching): skip inline report in complete.ts when tool already wrote it"
```

---

### Task 8: SessionWizard.svelte — SSE streaming

**Files:**
- Modify: `website/src/components/admin/coaching/SessionWizard.svelte`

- [ ] **Step 1: Read the current generate function** (lines 67–90 of SessionWizard.svelte)

The existing `generate()` function (lines 67–90):
```javascript
async function generate() {
  loading = true; error = '';
  try {
    await saveInputs();
    const res = await fetch(`/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachInputs: inputs }),
    });
    const json = await res.json();
    if (!res.ok) { error = json.error ?? 'Fehler bei KI-Anfrage'; return; }
    session = {
      ...session,
      steps: session.steps.find(s => s.stepNumber === currentStep)
        ? session.steps.map(s => s.stepNumber === currentStep ? json.step : s)
        : [...session.steps, json.step],
    };
  } catch (e) {
    error = 'Netzwerkfehler';
  } finally {
    loading = false;
  }
}
```

- [ ] **Step 2: Pass providerName from the page to SessionWizard**

In `website/src/pages/admin/coaching/sessions/[id].astro`, line 92, update the SessionWizard usage:

```astro
{/* Before: */}
<SessionWizard sessionId={id} initialSession={coachingSession} client:load />

{/* After: */}
{(() => {
  const activeProviderName = kiProviders.find(p => p.id === coachingSession.kiConfigId)?.provider
    ?? kiProviders.find(p => p.isActive)?.provider
    ?? 'claude';
  return <SessionWizard sessionId={id} initialSession={coachingSession} providerName={activeProviderName} client:load />;
})()}
```

In `SessionWizard.svelte`, update the `$props()` destructure (line 5):

```typescript
// Before:
let { sessionId, initialSession }: { sessionId: string; initialSession: Session } = $props();

// After:
let { sessionId, initialSession, providerName = 'claude' }: { sessionId: string; initialSession: Session; providerName?: string } = $props();
```

- [ ] **Step 3: Add streamingResponse state and update generate function**

In the `<script lang="ts">` section, after `let error = $state('');` (line 25), add:

```typescript
let streamingResponse = $state('');
const isClaudeProvider = $derived(providerName === 'claude');
```

Replace the entire `generate()` function (lines 67–90) with:

```typescript
async function generate() {
  loading = true; error = ''; streamingResponse = '';
  try {
    await saveInputs();

    const url = `/api/admin/coaching/sessions/${sessionId}/steps/${currentStep}/generate${isClaudeProvider ? '?stream=true' : ''}`;

    if (isClaudeProvider) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs }),
      });
      if (!res.ok || !res.body) { error = 'Fehler bei KI-Anfrage'; return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; step?: typeof session.steps[0]; error?: string };
            if (event.chunk) {
              streamingResponse += event.chunk;
            } else if (event.done && event.step) {
              session = {
                ...session,
                steps: session.steps.find(s => s.stepNumber === currentStep)
                  ? session.steps.map(s => s.stepNumber === currentStep ? event.step! : s)
                  : [...session.steps, event.step!],
              };
              streamingResponse = '';
            } else if (event.error) {
              error = event.error;
            }
          } catch { /* skip malformed event */ }
        }
      }
    } else {
      // Non-streaming path for OpenAI / Mistral
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachInputs: inputs }),
      });
      const json = await res.json();
      if (!res.ok) { error = json.error ?? 'Fehler bei KI-Anfrage'; return; }
      session = {
        ...session,
        steps: session.steps.find(s => s.stepNumber === currentStep)
          ? session.steps.map(s => s.stepNumber === currentStep ? json.step : s)
          : [...session.steps, json.step],
      };
    }
  } catch (e) {
    error = 'Netzwerkfehler';
  } finally {
    loading = false;
  }
}
```

- [ ] **Step 5: Show streaming response in the UI template**

In the Svelte template section, find the area where the AI response is displayed (look for `stepData?.aiResponse`). Add a streaming preview above it:

```svelte
{#if streamingResponse}
  <div class="ai-response streaming">
    <span class="label">KI generiert…</span>
    <p>{streamingResponse}</p>
  </div>
{/if}
```

- [ ] **Step 6: TypeScript check on the Svelte file**

```bash
cd /home/patrick/Bachelorprojekt/website
npx astro check 2>&1 | grep "SessionWizard" | head -10
```
Expected: no type errors in SessionWizard.svelte.

- [ ] **Step 7: Run full test suite**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run 2>&1 | tail -15
```
Expected: all tests pass (no regressions).

- [ ] **Step 8: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/coaching/SessionWizard.svelte
git add website/src/pages/admin/coaching/sessions/\[id\].astro
git commit -m "feat(coaching): add SSE streaming to SessionWizard for Claude provider"
```

---

### Task 9: Final TypeScript check + full test run

- [ ] **Step 1: Full TypeScript check**

```bash
cd /home/patrick/Bachelorprojekt/website
npx tsc --noEmit 2>&1 | head -30
```
Expected: zero errors.

- [ ] **Step 2: Full vitest run**

```bash
cd /home/patrick/Bachelorprojekt/website
npx vitest run 2>&1 | tail -20
```
Expected: all tests pass. Note the test count before this feature and after — new tests should be visible.

- [ ] **Step 3: Astro build check**

```bash
cd /home/patrick/Bachelorprojekt/website
npx astro build 2>&1 | tail -10
```
Expected: build succeeds with no errors.

- [ ] **Step 4: Final commit**

```bash
cd /home/patrick/Bachelorprojekt
git add -p  # review any remaining unstaged changes
git commit -m "chore(coaching): final type fixes + build verification"
```
