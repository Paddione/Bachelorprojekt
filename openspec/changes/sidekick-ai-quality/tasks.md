---
title: "Sidekick AI-Quality Widget"
ticket_id: T001065
domains: [website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Sidekick AI-Quality Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `'ai-quality'` Sidekick view that tracks latency, cost/tokens, error-rate and output health across all website AI workflows (coaching chat, RAG search, embeddings) via a central metrics middleware + new `ai_call_log` table + admin API + Svelte view.

**Architecture:** A pure `ai-metrics.ts` module logs each AI call (fire-and-forget) into a new `ai_call_log` table in the website DB. Two entry points: `withAiMetrics()` wraps Anthropic `messages.create()` calls (auto-extracts `usage`), and `logAiCall()` records explicit metrics for non-Anthropic call-sites (RAG / embeddings) without restructuring them. A `GET /api/admin/ai-quality` endpoint aggregates rows into health/24h/byWorkflow/recentErrors; `AiQualitySidekickView.svelte` renders it.

**Tech Stack:** Astro API routes, Svelte 5 (runes), PostgreSQL (`pg` Pool), TypeScript, Vitest.

## Global Constraints

- **S1 line budgets (hard ceiling per file — must NOT exceed after change):**
  - `website/src/lib/assistant/llm.ts` — ist 111, ceil 600, budget **489**
  - `website/src/lib/knowledge-db.ts` — ist 464, ceil 600, budget **136 ← eng, max 2–3 Zeilen Wrapper-Aufruf, kein Umbau**
  - `website/src/lib/embeddings.ts` — Instrumentierungsziel statt `ki-services.ts` (siehe Task 4 — `ki-services.ts` enthält KEINEN Embed-Call); minimal halten
  - `website/src/components/assistant/SidekickHome.svelte` — ist 303, ceil 500, budget **197**
  - `website/src/components/PortalSidekick.svelte` — ist 362, ceil 500, budget **138**
  - `website/src/lib/assistant/sidekick-nudge.ts` — ist 20, ceil 600, budget **580**
  - `website/src/lib/ai-metrics.ts` — NEU, ceil 600, budget **600**
  - `website/src/components/assistant/AiQualitySidekickView.svelte` — NEU, ceil 500, budget **500**
  - `website/src/pages/api/admin/ai-quality.ts` — NEU, ceil 600, budget **600**
- **S3:** Keine hardcodierten Hostnamen (`*.mentolder.de` / `*.korczewski.de`) in irgendeinem Code-Snippet. Domain immer aus Request/Config ableiten — hier nicht relevant, da nur relative Pfade verwendet werden.
- **`ai-metrics.ts` ist ein pure Module:** eigener `pg`-Pool-Import erlaubt, ABER **kein Import von `assistant/llm.ts`** (keine Rück-Importe in den LLM-Layer → keine Zyklen).
- **Logging bricht NIE den AI-Call:** alle DB-Inserts sind fire-and-forget (`void logAiCall(...)`), Insert-Fehler werden auf `stderr` geloggt und geschluckt. Fehler aus `fn()` werden immer rethrown.
- **Admin-only:** Endpoint nutzt das bestehende `getSession` + `isAdmin`-Pattern (siehe `api/admin/qa-queue.ts`), 401 bei fehlender Admin-Session.
- **Cost-Berechnung zur Query-Zeit** (Tokens × Preis/1k im API-Layer), nicht in der Tabelle.
- **Out of Scope (nicht implementieren):** Output-Güte/Thumbs-Feedback-UI, automatische Quality-Nudges, Plan-QA/Grilling-Call-Sites werden nur instrumentiert, *falls* sie tatsächlich direkte LLM-Calls im Website-Code haben — sonst dokumentieren und vertagen.

---

## File Structure

```
website/migrations/20260621_create_ai_call_log.sql          # NEU — Tabelle + Indizes
website/src/lib/ai-metrics.ts                                # NEU — withAiMetrics + logAiCall (pure module, eigener Pool)
website/src/lib/ai-metrics.test.ts                           # NEU — Vitest: usage-Extraktion, fire-and-forget, rethrow
website/src/pages/api/admin/ai-quality.ts                    # NEU — GET-Endpoint (Aggregation + Cost)
website/src/pages/api/admin/ai-quality.test.ts               # NEU — Vitest: Auth + Response-Shape + Health-Schwellen
website/src/components/assistant/AiQualitySidekickView.svelte# NEU — View (Health/24h/Cost/Errors)
website/src/lib/assistant/llm.ts                             # MODIFY — messages.create() in withAiMetrics wrappen
website/src/lib/knowledge-db.ts                              # MODIFY — queryNearest: 2–3 Zeilen logAiCall
website/src/lib/embeddings.ts                                # MODIFY — embedBatch: logAiCall (workflow 'embedding')
website/src/lib/assistant/sidekick-nudge.ts                  # MODIFY — 'ai-quality' zu View-Typ + KNOWN_VIEWS
website/src/components/assistant/SidekickHome.svelte         # MODIFY — Item '08 KI-Qualität' + Badge
website/src/components/PortalSidekick.svelte                 # MODIFY — Import + {#if view === 'ai-quality'} Branch
Taskfile.yml                                                 # MODIFY — maintenance:ai-log-cleanup Task
```

**Befund während Plan-Erstellung (wichtig für Implementierer):**
- Die Spec listet `lib/ki-services.ts:embedBatch()` als Call-Site. `ki-services.ts` ist aber eine **pure Service-Registry ohne Embed-Call**. Die echte `embedBatch()` liegt in `website/src/lib/embeddings.ts:130`. **Instrumentierung erfolgt dort** (Task 4). `ki-services.ts` bleibt unangetastet.
- Der generische `withAiMetrics`-Wrapper aus der Spec erwartet `result.usage.{input,output}_tokens` (Anthropic-Form). `queryNearest`/`embedBatch` liefern diese Form NICHT (`NearestChunk[]` bzw. `{embeddings, tokens}`). Deshalb exportiert `ai-metrics.ts` ZWEI Funktionen: `withAiMetrics()` (Anthropic-Form) **und** `logAiCall()` (explizite Metriken) für die Nicht-Anthropic-Call-Sites. Das hält die Instrumentierung in `knowledge-db.ts` minimal (Budget 136).

---

## Task 1: DB-Migration `ai_call_log`

**Files:**
- Create: `website/migrations/20260621_create_ai_call_log.sql`

**Interfaces:**
- Produces: Tabelle `public.ai_call_log` mit Spalten `id, ts, workflow, model, prompt_tokens, completion_tokens, latency_ms, error, user_sub, metadata` + Indizes `ai_call_log_ts`, `ai_call_log_workflow`.

  Hinweis: Bestehende Migrations unter `website/src/db/migrations/` sind reine SQL-Dateien (Muster: `20260617_create_audit_log.sql`). Diese Datei folgt demselben Muster (idempotent via `IF NOT EXISTS`).

- [x] **Step 1: Migration schreiben**

```sql
-- website/migrations/20260621_create_ai_call_log.sql
CREATE TABLE IF NOT EXISTS ai_call_log (
  id                BIGSERIAL PRIMARY KEY,
  ts                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow          TEXT NOT NULL,
  model             TEXT,
  prompt_tokens     INT,
  completion_tokens INT,
  latency_ms        INT NOT NULL,
  error             TEXT,
  user_sub          TEXT,
  metadata          JSONB
);

CREATE INDEX IF NOT EXISTS ai_call_log_ts       ON ai_call_log (ts DESC);
CREATE INDEX IF NOT EXISTS ai_call_log_workflow ON ai_call_log (workflow, ts DESC);
```

- [x] **Step 2: Syntaxprüfung (lokal, ohne Cluster)**

Run: `psql --version >/dev/null 2>&1 && echo "psql vorhanden" ; grep -c "CREATE" website/src/db/migrations/20260621_create_ai_call_log.sql`
Expected: Ausgabe `3` (1× Tabelle, 2× Index). (Falls lokal eine Test-DB existiert, optional `psql ... -f` gegen sie laufen lassen — sonst genügt die Strukturprüfung.)

- [x] **Step 3: Commit**

```bash
git add website/src/db/migrations/20260621_create_ai_call_log.sql
git commit -m "feat(website): add ai_call_log table migration [T001065]"
```

---

## Task 2: `ai-metrics.ts` Middleware (pure module)

**Files:**
- Create: `website/src/lib/ai-metrics.ts`
- Test: `website/src/lib/ai-metrics.test.ts`

**Interfaces:**
- Produces:
  - `type AiWorkflow = 'coaching_chat' | 'rag_search' | 'embedding' | 'grilling' | 'plan_qa'`
  - `interface AiCallMeta { workflow: AiWorkflow; model?: string; userSub?: string; metadata?: Record<string, unknown> }`
  - `interface AiCallRecord extends AiCallMeta { latencyMs: number; promptTokens?: number; completionTokens?: number; error?: string }`
  - `function logAiCall(rec: AiCallRecord): Promise<void>` — fire-and-forget Insert (schluckt DB-Fehler).
  - `function withAiMetrics<T>(fn: () => Promise<T & { usage?: { input_tokens?: number; output_tokens?: number } }>, meta: AiCallMeta): Promise<T>` — wrapt Anthropic-Calls, extrahiert `usage`, ruft `logAiCall` auf, rethrowt `fn()`-Fehler.
- Consumes: eigener `pg`-Pool (kein Import von `assistant/llm.ts`).

- [x] **Step 1: Failing test schreiben**

```typescript
// website/src/lib/ai-metrics.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Pool-Insert mocken, bevor das Modul geladen wird.
const queryMock = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({ query: queryMock })),
}));

let mod: typeof import('./ai-metrics');
beforeEach(async () => {
  queryMock.mockClear();
  vi.resetModules();
  mod = await import('./ai-metrics');
});

describe('withAiMetrics', () => {
  test('extrahiert usage-Tokens und loggt success', async () => {
    const res = await mod.withAiMetrics(
      async () => ({ reply: 'hi', usage: { input_tokens: 12, output_tokens: 34 } }),
      { workflow: 'coaching_chat', model: 'claude-sonnet-4-6' },
    );
    expect(res).toEqual({ reply: 'hi', usage: { input_tokens: 12, output_tokens: 34 } });
    // fire-and-forget → kurz warten bis Microtask-Insert lief
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1];
    expect(params).toContain('coaching_chat');
    expect(params).toContain(12);
    expect(params).toContain(34);
  });

  test('rethrowt fn()-Fehler und loggt error', async () => {
    await expect(
      mod.withAiMetrics(async () => { throw new Error('boom'); }, { workflow: 'coaching_chat' }),
    ).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1];
    expect(params.some((p: unknown) => typeof p === 'string' && p.includes('boom'))).toBe(true);
  });

  test('DB-Insert-Fehler bricht den Call NICHT', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const res = await mod.withAiMetrics(
      async () => ({ reply: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }),
      { workflow: 'rag_search' },
    );
    expect(res).toEqual({ reply: 'ok', usage: { input_tokens: 1, output_tokens: 1 } });
  });
});

describe('logAiCall', () => {
  test('schluckt DB-Fehler ohne zu werfen', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      mod.logAiCall({ workflow: 'embedding', latencyMs: 5 }),
    ).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd website && npx vitest run src/lib/ai-metrics.test.ts`
Expected: FAIL — `Cannot find module './ai-metrics'`.

- [x] **Step 3: `ai-metrics.ts` implementieren**

```typescript
// website/src/lib/ai-metrics.ts
// Pure observability module for AI calls. Fire-and-forget: logging never blocks
// or breaks the wrapped AI call. KEIN Import aus assistant/llm.ts (keine Zyklen).
import { Pool } from 'pg';

export type AiWorkflow =
  | 'coaching_chat'
  | 'rag_search'
  | 'embedding'
  | 'grilling'
  | 'plan_qa';

export interface AiCallMeta {
  workflow: AiWorkflow;
  model?: string;
  userSub?: string;
  metadata?: Record<string, unknown>;
}

export interface AiCallRecord extends AiCallMeta {
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

// Eigener, lazy initialisierter Pool. Connection-String aus derselben Env wie
// die übrigen website-DB-Module (DATABASE_URL).
let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** Fire-and-forget Insert. Schluckt DB-Fehler (loggt auf stderr), wirft nie. */
export async function logAiCall(rec: AiCallRecord): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO ai_call_log
         (workflow, model, prompt_tokens, completion_tokens, latency_ms, error, user_sub, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        rec.workflow,
        rec.model ?? null,
        rec.promptTokens ?? null,
        rec.completionTokens ?? null,
        rec.latencyMs,
        rec.error ?? null,
        rec.userSub ?? null,
        JSON.stringify(rec.metadata ?? null),
      ],
    );
  } catch (err) {
    console.error('[ai-metrics] logAiCall insert failed:', err);
  }
}

/**
 * Wrapt einen Anthropic-artigen Call (Result trägt optional `usage`).
 * Loggt Latenz + Tokens (success) bzw. Latenz + error (failure).
 * fn()-Fehler werden IMMER rethrown.
 */
export async function withAiMetrics<T>(
  fn: () => Promise<T & { usage?: { input_tokens?: number; output_tokens?: number } }>,
  meta: AiCallMeta,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void logAiCall({
      ...meta,
      latencyMs: Date.now() - start,
      promptTokens: result?.usage?.input_tokens,
      completionTokens: result?.usage?.output_tokens,
    });
    return result;
  } catch (err) {
    void logAiCall({ ...meta, latencyMs: Date.now() - start, error: String(err) });
    throw err;
  }
}
```

- [x] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd website && npx vitest run src/lib/ai-metrics.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: S1-Budget prüfen**

Run: `wc -l website/src/lib/ai-metrics.ts`
Expected: deutlich < 600.

- [x] **Step 6: Commit**

```bash
git add website/src/lib/ai-metrics.ts website/src/lib/ai-metrics.test.ts
git commit -m "feat(website): add ai-metrics middleware (withAiMetrics + logAiCall) [T001065]"
```

---

## Task 3: Coaching-Chat instrumentieren (`llm.ts`)

**Files:**
- Modify: `website/src/lib/assistant/llm.ts` (around `messages.create()` at ~line 91)

**Interfaces:**
- Consumes: `withAiMetrics` aus `../ai-metrics`.
- Produces: nach jedem Coaching-Chat-Request ein `ai_call_log`-Eintrag mit `workflow='coaching_chat'`.

Hinweis: Der bestehende `try { response = await client.messages.create({...}) } catch { setProviderCooldown(...); throw err }`-Block bleibt erhalten. Wir wrappen nur den `create()`-Aufruf, damit Latenz/Tokens auch im Fehlerfall (Cooldown-Pfad) erfasst werden.

- [x] **Step 1: Import ergänzen**

Oben in `llm.ts` zu den Imports hinzufügen:

```typescript
import { withAiMetrics } from '../ai-metrics';
```

- [x] **Step 2: `messages.create()` wrappen**

Ersetze (aktuell `llm.ts:90-103`):

```typescript
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: cfg.modelId,
      max_tokens: 1024,
      system: systemPrompt,
      messages: input.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });
  } catch (err) {
    await setProviderCooldown(pool, SOURCE.assistantChat, cfg.provider, 5);
    throw err;
  }
```

durch:

```typescript
  let response: Anthropic.Message;
  try {
    response = await withAiMetrics(
      () => client.messages.create({
        model: cfg.modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: input.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      }),
      { workflow: 'coaching_chat', model: cfg.modelId },
    );
  } catch (err) {
    await setProviderCooldown(pool, SOURCE.assistantChat, cfg.provider, 5);
    throw err;
  }
```

(`Anthropic.Message` trägt `usage: { input_tokens, output_tokens }` — passt zum `withAiMetrics`-Generic ohne Cast.)

- [x] **Step 3: Typecheck + bestehende llm-Tests**

Run: `cd website && npx vitest run src/lib/assistant/ 2>&1 | tail -20`
Expected: PASS (keine Regression). Falls kein dedizierter llm-Test existiert, mindestens `npx astro check --minimal` für diese Datei grün.

- [x] **Step 4: S1-Budget prüfen**

Run: `wc -l website/src/lib/assistant/llm.ts`
Expected: < 600 (Start 111, +~4 Zeilen).

- [x] **Step 5: Commit**

```bash
git add website/src/lib/assistant/llm.ts
git commit -m "feat(website): instrument coaching chat with withAiMetrics [T001065]"
```

---

## Task 4: RAG-Search + Embeddings instrumentieren (minimal)

**Files:**
- Modify: `website/src/lib/knowledge-db.ts` (`queryNearest`, ~line 235 — budget nur 136, max 2–3 Zeilen)
- Modify: `website/src/lib/embeddings.ts` (`embedBatch`, ~line 130)

**Interfaces:**
- Consumes: `logAiCall` aus `./ai-metrics`.
- Produces:
  - nach jedem `queryNearest()` ein `ai_call_log`-Eintrag mit `workflow='rag_search'`, `metadata={ chunk_count, threshold, collection_count }`.
  - nach jedem `embedBatch()` ein Eintrag mit `workflow='embedding'`, `metadata={ batch_size }`, `model`.

Hinweis: Beide Funktionen liefern NICHT die Anthropic-`usage`-Form, daher `logAiCall()` (explizit) statt `withAiMetrics`. Instrumentierung muss minimal sein — Start/Stop-Zeit + ein `void logAiCall(...)` am Erfolgs-Return, kein Code-Umbau.

- [x] **Step 1: `knowledge-db.ts` — Import + Instrumentierung in `queryNearest`**

Import oben ergänzen:

```typescript
import { logAiCall } from './ai-metrics';
```

In `queryNearest` (am Funktionsanfang `const _start = Date.now();` direkt nach der Signatur einfügen; am Erfolgs-Return die Chunks vorher in `const chunks` halten). Konkret: der bestehende finale `return r.rows.map(...)` wird zu:

```typescript
  const chunks = r.rows.map(mapRow);   // mapRow = bestehende Map-Funktion / inline-Mapping
  void logAiCall({
    workflow: 'rag_search',
    latencyMs: Date.now() - _start,
    metadata: { chunk_count: chunks.length, threshold: thresh, collection_count: args.collectionIds.length },
  });
  return chunks;
```

(Falls das aktuelle `return` ein inline-`.map()` ist, das Mapping unverändert in `const chunks = ...` umbenennen — keine Logikänderung. `_start` wird als erste Zeile nach der `if (args.collectionIds.length === 0) return [];`-Zeile gesetzt; der Early-Return für leere Collections wird NICHT geloggt.)

- [x] **Step 2: `embeddings.ts` — Import + Instrumentierung in `embedBatch`**

Import oben ergänzen:

```typescript
import { logAiCall } from './ai-metrics';
```

In `embedBatch` Start-Zeit messen und am Erfolgs-Return loggen. Der bestehende finale `return { embeddings: out, tokens: totalTokens };` wird zu:

```typescript
  void logAiCall({
    workflow: 'embedding',
    model: opts.model ?? 'bge-m3',
    latencyMs: Date.now() - _start,
    promptTokens: totalTokens,
    metadata: { batch_size: texts.length },
  });
  return { embeddings: out, tokens: totalTokens };
```

`const _start = Date.now();` als erste Zeile der Funktion (nach `const purpose = ...`).

- [x] **Step 3: Bestehende Tests laufen lassen (Regression)**

Run: `cd website && npx vitest run src/lib/knowledge-db.test.ts src/lib/tickets-embed.test.ts 2>&1 | tail -20`
Expected: PASS. (Die Tests mocken Pool/embed — `logAiCall` schluckt seine eigenen DB-Fehler, darf die Tests also nicht brechen. Falls ein Test wegen des neuen `pg`-Pool-Imports in `ai-metrics` bricht, in der jeweiligen Testdatei `vi.mock('./ai-metrics', () => ({ logAiCall: vi.fn() }))` ergänzen.)

- [x] **Step 4: S1-Budget prüfen (knowledge-db ist eng!)**

Run: `wc -l website/src/lib/knowledge-db.ts website/src/lib/embeddings.ts`
Expected: `knowledge-db.ts` < 600 (Start 464 + ~5 Zeilen = ~469, weit unter Ceiling, aber kein Umbau). `embeddings.ts` < 600.

- [x] **Step 5: Commit**

```bash
git add website/src/lib/knowledge-db.ts website/src/lib/embeddings.ts
git commit -m "feat(website): instrument RAG search + embeddings with logAiCall [T001065]"
```

---

## Task 5: Admin-API `GET /api/admin/ai-quality`

**Files:**
- Create: `website/src/pages/api/admin/ai-quality.ts`
- Test: `website/src/pages/api/admin/ai-quality.test.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdmin` aus `../../../lib/auth`; eigener `pg`-Pool (oder bestehender DB-Helper — siehe Step 3).
- Produces: HTTP-Endpoint, exportiert `const GET: APIRoute`. Response-Shape:
  ```typescript
  {
    health: Record<AiWorkflow, 'green' | 'yellow' | 'red'>,
    last24h: { hour: string; calls: number; errors: number; avg_latency_ms: number }[],
    byWorkflow: { workflow: AiWorkflow; calls: number; error_rate: number; avg_latency_ms: number;
                  p95_latency_ms: number; total_tokens: number; est_cost_eur: number }[],
    recentErrors: { ts: string; workflow: AiWorkflow; model: string | null; error: string }[],
  }
  ```

Hinweis (Pattern): `api/admin/qa-queue.ts` zeigt das exakte Astro-API-Route-Format: `import type { APIRoute }`, `export const GET: APIRoute = async ({ request }) => {...}`, 401 wenn `!session || !isAdmin(session)`, JSON-Responses mit `Content-Type: application/json`.

Health-Schwellen (Basis: letzte 1 Stunde, pro Workflow):
- `green`: avg_latency < 800ms **und** error_rate < 5%
- `yellow`: avg_latency < 2000ms **und** error_rate < 20% — oder kein Call in letzter Stunde
- `red`: sonst

Cost-Preise (hardcoded, im Modul, updatebar):
```typescript
const PRICE_PER_1K_EUR: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.003,   output: 0.015   },
  'claude-haiku-4-5':  { input: 0.00025, output: 0.00125 },
  'bge-m3':            { input: 0,       output: 0       },
};
```

- [x] **Step 1: Failing test schreiben**

```typescript
// website/src/pages/api/admin/ai-quality.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('pg', () => ({ Pool: vi.fn().mockImplementation(() => ({ query: queryMock })) }));
vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../lib/auth';
let route: typeof import('./ai-quality');

beforeEach(async () => {
  queryMock.mockReset();
  vi.resetModules();
  route = await import('./ai-quality');
});

function req(): Request {
  return new Request('http://localhost/api/admin/ai-quality', { headers: { cookie: 'sid=x' } });
}

describe('GET /api/admin/ai-quality', () => {
  test('401 ohne Admin-Session', async () => {
    (getSession as any).mockResolvedValue(null);
    (isAdmin as any).mockReturnValue(false);
    const res = await route.GET({ request: req() } as any);
    expect(res.status).toBe(401);
  });

  test('200 mit vollständigem Response-Shape', async () => {
    (getSession as any).mockResolvedValue({ sub: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    // Alle Aggregations-Queries liefern leere Mengen → Defaults
    queryMock.mockResolvedValue({ rows: [] });
    const res = await route.GET({ request: req() } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('health');
    expect(body).toHaveProperty('last24h');
    expect(body).toHaveProperty('byWorkflow');
    expect(body).toHaveProperty('recentErrors');
    expect(Array.isArray(body.last24h)).toBe(true);
    expect(Array.isArray(body.byWorkflow)).toBe(true);
    expect(Array.isArray(body.recentErrors)).toBe(true);
  });

  test('Health-Klassifikation: green bei niedriger Latenz/Fehlerrate', async () => {
    (getSession as any).mockResolvedValue({ sub: 'admin' });
    (isAdmin as any).mockReturnValue(true);
    // computeHealth ist exportiert und rein testbar:
    expect(route.computeHealth({ avg_latency_ms: 300, error_rate: 0.01, calls: 10 })).toBe('green');
    expect(route.computeHealth({ avg_latency_ms: 1500, error_rate: 0.1, calls: 10 })).toBe('yellow');
    expect(route.computeHealth({ avg_latency_ms: 5000, error_rate: 0.5, calls: 10 })).toBe('red');
    expect(route.computeHealth({ avg_latency_ms: 0, error_rate: 0, calls: 0 })).toBe('yellow'); // kein Call
  });
});
```

- [x] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd website && npx vitest run src/pages/api/admin/ai-quality.test.ts`
Expected: FAIL — `Cannot find module './ai-quality'`.

- [x] **Step 3: Endpoint implementieren**

```typescript
// website/src/pages/api/admin/ai-quality.ts
import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../lib/auth';
import type { AiWorkflow } from '../../../lib/ai-metrics';

const WORKFLOWS: AiWorkflow[] = ['coaching_chat', 'rag_search', 'embedding', 'grilling', 'plan_qa'];

const PRICE_PER_1K_EUR: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.003,   output: 0.015   },
  'claude-haiku-4-5':  { input: 0.00025, output: 0.00125 },
  'bge-m3':            { input: 0,       output: 0       },
};

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export type Health = 'green' | 'yellow' | 'red';

/** Reine, testbare Health-Klassifikation (Basis: letzte Stunde, ein Workflow). */
export function computeHealth(m: { avg_latency_ms: number; error_rate: number; calls: number }): Health {
  if (m.calls === 0) return 'yellow';                       // kein Call → unbekannt
  if (m.avg_latency_ms < 800 && m.error_rate < 0.05) return 'green';
  if (m.avg_latency_ms < 2000 && m.error_rate < 0.20) return 'yellow';
  return 'red';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  try {
    const p = getPool();

    // ① Health-Basis: letzte Stunde pro Workflow
    const healthRes = await p.query(
      `SELECT workflow,
              COUNT(*)::int                                            AS calls,
              COALESCE(AVG(latency_ms),0)::float                       AS avg_latency_ms,
              COALESCE(AVG((error IS NOT NULL)::int),0)::float         AS error_rate
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '1 hour'
        GROUP BY workflow`,
    );
    const healthByWf = new Map<string, { calls: number; avg_latency_ms: number; error_rate: number }>();
    for (const r of healthRes.rows) healthByWf.set(r.workflow, r);
    const health = Object.fromEntries(
      WORKFLOWS.map((wf) => [wf, computeHealth(healthByWf.get(wf) ?? { calls: 0, avg_latency_ms: 0, error_rate: 0 })]),
    ) as Record<AiWorkflow, Health>;

    // ② 24h-Verlauf (stündlich gebucketed)
    const histRes = await p.query(
      `SELECT date_trunc('hour', ts)                       AS hour,
              COUNT(*)::int                                AS calls,
              COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
              COALESCE(AVG(latency_ms),0)::int             AS avg_latency_ms
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '24 hours'
        GROUP BY 1 ORDER BY 1`,
    );
    const last24h = histRes.rows.map((r) => ({
      hour: new Date(r.hour).toISOString(),
      calls: r.calls, errors: r.errors, avg_latency_ms: r.avg_latency_ms,
    }));

    // ③ Pro Workflow über 7 Tage (Cost zur Query-Zeit berechnet)
    const wfRes = await p.query(
      `SELECT workflow, model,
              COUNT(*)::int                                          AS calls,
              COALESCE(AVG((error IS NOT NULL)::int),0)::float       AS error_rate,
              COALESCE(AVG(latency_ms),0)::int                       AS avg_latency_ms,
              COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),0)::int AS p95_latency_ms,
              COALESCE(SUM(prompt_tokens),0)::int                    AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0)::int                AS completion_tokens
         FROM ai_call_log
        WHERE ts > NOW() - INTERVAL '7 days'
        GROUP BY workflow, model`,
    );
    // Pro Workflow aggregieren (über Modelle hinweg) + Cost akkumulieren.
    const wfAgg = new Map<string, {
      calls: number; error_rate_sum: number; lat_sum: number; p95: number;
      total_tokens: number; est_cost_eur: number;
    }>();
    for (const r of wfRes.rows) {
      const price = PRICE_PER_1K_EUR[r.model ?? ''] ?? { input: 0, output: 0 };
      const cost = (r.prompt_tokens / 1000) * price.input + (r.completion_tokens / 1000) * price.output;
      const cur = wfAgg.get(r.workflow) ?? { calls: 0, error_rate_sum: 0, lat_sum: 0, p95: 0, total_tokens: 0, est_cost_eur: 0 };
      cur.calls += r.calls;
      cur.error_rate_sum += r.error_rate * r.calls;
      cur.lat_sum += r.avg_latency_ms * r.calls;
      cur.p95 = Math.max(cur.p95, r.p95_latency_ms);
      cur.total_tokens += r.prompt_tokens + r.completion_tokens;
      cur.est_cost_eur += cost;
      wfAgg.set(r.workflow, cur);
    }
    const byWorkflow = [...wfAgg.entries()].map(([workflow, a]) => ({
      workflow: workflow as AiWorkflow,
      calls: a.calls,
      error_rate: a.calls ? a.error_rate_sum / a.calls : 0,
      avg_latency_ms: a.calls ? Math.round(a.lat_sum / a.calls) : 0,
      p95_latency_ms: a.p95,
      total_tokens: a.total_tokens,
      est_cost_eur: Math.round(a.est_cost_eur * 100) / 100,
    })).sort((x, y) => y.est_cost_eur - x.est_cost_eur);

    // ④ Letzte 5 Fehler
    const errRes = await p.query(
      `SELECT ts, workflow, model, error
         FROM ai_call_log
        WHERE error IS NOT NULL AND ts > NOW() - INTERVAL '7 days'
        ORDER BY ts DESC LIMIT 5`,
    );
    const recentErrors = errRes.rows.map((r) => ({
      ts: new Date(r.ts).toISOString(),
      workflow: r.workflow as AiWorkflow,
      model: r.model ?? null,
      error: r.error,
    }));

    return json({ health, last24h, byWorkflow, recentErrors });
  } catch (err: any) {
    return json({ error: err?.message ?? 'internal error' }, 500);
  }
};
```

- [x] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd website && npx vitest run src/pages/api/admin/ai-quality.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: S1-Budget prüfen**

Run: `wc -l website/src/pages/api/admin/ai-quality.ts`
Expected: < 600.

- [x] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/ai-quality.ts website/src/pages/api/admin/ai-quality.test.ts
git commit -m "feat(website): add GET /api/admin/ai-quality endpoint [T001065]"
```

---

## Task 6: Sidekick-View `AiQualitySidekickView.svelte`

**Files:**
- Create: `website/src/components/assistant/AiQualitySidekickView.svelte`

**Interfaces:**
- Consumes: `GET /api/admin/ai-quality` (relativer Pfad, kein Hostname).
- Produces: Svelte-Komponente ohne Props (lädt selbst in `onMount`). Pattern: `CockpitSidekickView.svelte` (fetch in onMount, localStorage für aufklappbare Sektion, Auto-Refresh 60s + `onDestroy`-Cleanup).

Hinweis: Vor dem Schreiben `CockpitSidekickView.svelte` als Vorlage öffnen, um Svelte-5-Runes-Stil, Lade-/Fehlerzustände und CSS-Konventionen zu übernehmen.

- [x] **Step 1: Komponente implementieren**

```svelte
<!-- website/src/components/assistant/AiQualitySidekickView.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Health = 'green' | 'yellow' | 'red';
  interface Data {
    health: Record<string, Health>;
    last24h: { hour: string; calls: number; errors: number; avg_latency_ms: number }[];
    byWorkflow: { workflow: string; calls: number; error_rate: number; avg_latency_ms: number;
                  p95_latency_ms: number; total_tokens: number; est_cost_eur: number }[];
    recentErrors: { ts: string; workflow: string; model: string | null; error: string }[];
  }

  let data = $state<Data | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let histOpen = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const res = await fetch('/api/admin/ai-quality');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  const dotClass = (h: Health) => (h === 'green' ? 'dot-green' : h === 'yellow' ? 'dot-yellow' : 'dot-red');
  const maxCalls = $derived(Math.max(1, ...(data?.last24h.map((b) => b.calls) ?? [1])));
  const barColor = (errors: number, calls: number) => {
    const r = calls ? errors / calls : 0;
    return r < 0.05 ? '#3ba55d' : r < 0.2 ? '#d9a300' : '#d83c3c';
  };

  onMount(() => {
    try { histOpen = localStorage.getItem('ai-quality:24h-open') === '1'; } catch { /* ignore */ }
    void load();
    timer = setInterval(() => void load(), 60_000);
  });
  onDestroy(() => { if (timer) clearInterval(timer); });

  function toggleHist() {
    histOpen = !histOpen;
    try { localStorage.setItem('ai-quality:24h-open', histOpen ? '1' : '0'); } catch { /* ignore */ }
  }
</script>

<div class="ai-quality">
  {#if loading}
    <p class="muted">Lade KI-Qualitätsdaten…</p>
  {:else if error}
    <p class="err">Fehler: {error}</p>
  {:else if data}
    <!-- ① Health-Header -->
    <section class="health">
      {#each data.byWorkflow.length ? data.byWorkflow : Object.keys(data.health).map((w) => ({ workflow: w, avg_latency_ms: 0, error_rate: 0, calls: 0, p95_latency_ms: 0, total_tokens: 0, est_cost_eur: 0 })) as wf}
        <div class="health-row" title={`p95 ${wf.p95_latency_ms}ms`}>
          <span class="dot {dotClass(data.health[wf.workflow] ?? 'yellow')}"></span>
          <span class="wf">{wf.workflow}</span>
          <span class="lat">{wf.avg_latency_ms}ms</span>
          <span class="err-rate">{(wf.error_rate * 100).toFixed(1)}% err</span>
        </div>
      {/each}
    </section>

    <!-- ② 24h-Verlauf -->
    <section class="hist">
      <button class="hist-toggle" onclick={toggleHist}>
        {histOpen ? '▾' : '▸'} 24h-Verlauf
      </button>
      {#if histOpen}
        <div class="bars">
          {#each data.last24h as b}
            <div class="bar"
                 style={`height:${Math.round((b.calls / maxCalls) * 100)}%;background:${barColor(b.errors, b.calls)}`}
                 title={`${b.calls} Calls, ${b.errors} Fehler, ⌀${b.avg_latency_ms}ms`}></div>
          {/each}
          {#if !data.last24h.length}<span class="muted">keine Daten</span>{/if}
        </div>
      {/if}
    </section>

    <!-- ③ Kosten 7 Tage -->
    <section class="cost">
      <h4>Kosten 7 Tage</h4>
      <table>
        <thead><tr><th>Workflow</th><th>Calls</th><th>Tokens</th><th>EUR</th></tr></thead>
        <tbody>
          {#each data.byWorkflow as wf}
            <tr>
              <td>{wf.workflow}</td>
              <td>{wf.calls}</td>
              <td>{wf.total_tokens.toLocaleString('de-DE')}</td>
              <td>{wf.est_cost_eur > 0 ? wf.est_cost_eur.toFixed(2) : '—'}</td>
            </tr>
          {/each}
          {#if !data.byWorkflow.length}<tr><td colspan="4" class="muted">keine Daten</td></tr>{/if}
        </tbody>
      </table>
    </section>

    <!-- ④ Fehler-Log -->
    {#if data.recentErrors.length}
      <section class="errors">
        <h4>Fehler</h4>
        {#each data.recentErrors as e}
          <div class="err-item">
            <span class="err-meta">{new Date(e.ts).toLocaleTimeString('de-DE')} {e.workflow}</span>
            <span class="err-msg">{e.error}</span>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .ai-quality { display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem; font-size: 0.85rem; }
  .muted { color: #888; }
  .err { color: #d83c3c; }
  .health-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.15rem 0; }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; display: inline-block; }
  .dot-green { background: #3ba55d; }
  .dot-yellow { background: #d9a300; }
  .dot-red { background: #d83c3c; }
  .wf { flex: 1; }
  .lat, .err-rate { font-variant-numeric: tabular-nums; color: #aaa; }
  .hist-toggle { background: none; border: none; color: inherit; cursor: pointer; padding: 0; font: inherit; }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 60px; margin-top: 0.4rem; }
  .bar { flex: 1; min-height: 2px; border-radius: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.2rem 0.3rem; }
  td:nth-child(n+2), th:nth-child(n+2) { text-align: right; font-variant-numeric: tabular-nums; }
  .err-item { display: flex; flex-direction: column; padding: 0.3rem 0; border-top: 1px solid #2a2a2a; }
  .err-meta { color: #d83c3c; font-size: 0.78rem; }
  .err-msg { color: #ccc; word-break: break-word; }
</style>
```

- [x] **Step 2: Astro check (Komponente kompiliert)**

Run: `cd website && npx astro check --minimal 2>&1 | grep -i "ai-quality\|AiQuality" || echo "keine AiQuality-Fehler"`
Expected: `keine AiQuality-Fehler`.

- [x] **Step 3: S1-Budget prüfen**

Run: `wc -l website/src/components/assistant/AiQualitySidekickView.svelte`
Expected: < 500.

- [x] **Step 4: Commit**

```bash
git add website/src/components/assistant/AiQualitySidekickView.svelte
git commit -m "feat(website): add AiQualitySidekickView component [T001065]"
```

---

## Task 7: Navigation-Registrierung

**Files:**
- Modify: `website/src/lib/assistant/sidekick-nudge.ts`
- Modify: `website/src/components/assistant/SidekickHome.svelte`
- Modify: `website/src/components/PortalSidekick.svelte`

**Interfaces:**
- Consumes: `AiQualitySidekickView.svelte` (Task 6); `parseNavigateEvent` muss `'ai-quality'` als gültige View akzeptieren.
- Produces: View ist über Home-Menü (Item `08 KI-Qualität`) erreichbar; `{#if view === 'ai-quality'}`-Branch rendert die Komponente.

- [x] **Step 1: `sidekick-nudge.ts` — View-Typ + KNOWN_VIEWS erweitern**

```typescript
export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'cockpit' | 'mediaviewer' | 'grilling' | 'ai-quality';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'agent-guide', 'cockpit', 'mediaviewer', 'grilling', 'ai-quality',
]);
```

- [x] **Step 2: Test für parseNavigateEvent ergänzen (falls Testdatei existiert)**

Run: `ls website/src/lib/assistant/sidekick-nudge.test.ts 2>/dev/null && echo exists || echo none`

Falls `exists`: einen Case ergänzen, der `parseNavigateEvent({ view: 'ai-quality', jumpTo: null })` als gültig (`{ view: 'ai-quality', jumpTo: null }`) erwartet. Falls `none`: überspringen (kein neuer Test nötig — Typ-Erweiterung genügt).

- [x] **Step 3: `SidekickHome.svelte` — View-Typ + Menü-Item mit Badge**

Im `type View`-Alias (Zeile ~2) `'ai-quality'` ergänzen:

```typescript
type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'grilling' | 'cockpit' | 'ai-quality';
```

Im `items`-Array (nach dem letzten Admin-Item) hinzufügen. `aiErrorCount` als optionalen `$props()`-Input ergänzen (default 0); falls die Komponente Props bereits destrukturiert, dort einreihen:

```typescript
  // in den $props()-Block aufnehmen, default 0:
  // let { ..., aiErrorCount = 0 } = $props();

  // im items-$derived-Array, als neues Element:
  { id: 'ai-quality', no: '08', title: 'KI-Qualität', sub: 'Latenz · Kosten · Fehler',
    badge: aiErrorCount > 0 ? aiErrorCount : undefined, show: isAdmin },
```

(Die `no`-Nummer `08` an die bestehende Sequenz anpassen, falls die letzte Nummer abweicht — Implementierer prüft die vorhandenen `no:`-Werte und nimmt die nächste freie.)

- [x] **Step 4: `PortalSidekick.svelte` — Import + Branch**

Import oben (bei den anderen `...SidekickView`-Imports, ~Zeile 11):

```typescript
  import AiQualitySidekickView from './assistant/AiQualitySidekickView.svelte';
```

Im View-Switch (nach dem `cockpit`-Branch, ~Zeile 231) ergänzen:

```svelte
    {:else if view === 'ai-quality'}
      <AiQualitySidekickView />
```

(Exakte `{#if}`/`{:else if}`-Struktur an die vorhandene Kette anpassen — neuer Zweig vor dem schließenden `{/if}`.)

- [x] **Step 5: Astro check + bestehende Sidekick-Tests**

Run: `cd website && npx vitest run src/lib/assistant/ src/components/assistant/ 2>&1 | tail -20 && npx astro check --minimal 2>&1 | grep -iE "ai-quality|AiQuality|PortalSidekick|SidekickHome" || echo "keine Navigations-Fehler"`
Expected: Tests PASS, `keine Navigations-Fehler`.

- [x] **Step 6: S1-Budgets prüfen**

Run: `wc -l website/src/lib/assistant/sidekick-nudge.ts website/src/components/assistant/SidekickHome.svelte website/src/components/PortalSidekick.svelte`
Expected: sidekick-nudge < 600, SidekickHome < 500 (Start 303), PortalSidekick < 500 (Start 362).

- [x] **Step 7: Commit**

```bash
git add website/src/lib/assistant/sidekick-nudge.ts website/src/components/assistant/SidekickHome.svelte website/src/components/PortalSidekick.svelte
git commit -m "feat(website): register ai-quality sidekick view in navigation [T001065]"
```

---

## Task 8: Retention-Task `maintenance:ai-log-cleanup`

**Files:**
- Modify: `Taskfile.yml`

**Interfaces:**
- Produces: Task `maintenance:ai-log-cleanup`, der Zeilen älter als 90 Tage löscht; eingehängt in `maintenance:all`.

Hinweis: Vor dem Editieren bestehende `maintenance:*`-Tasks in `Taskfile.yml` ansehen, um Connection-Pattern (psql via kubectl exec, ENV-Auflösung, `WORKSPACE_NAMESPACE`) zu übernehmen. Der Cleanup nutzt dasselbe Muster wie andere `maintenance`-Cleanups.

- [ ] **Step 1: bestehendes maintenance-Pattern finden**

Run: `grep -n "maintenance:" Taskfile.yml | head -20`
Expected: zeigt vorhandene `maintenance:*`-Tasks + `maintenance:all` (als Vorlage für DB-Connection und Einhängung).

- [ ] **Step 2: Task ergänzen**

Im `Taskfile.yml` einen Task analog zu den bestehenden `maintenance:*`-Cleanups hinzufügen, der folgendes SQL gegen die website-DB ausführt (DB-Connection-Pattern aus Step 1 übernehmen):

```sql
DELETE FROM ai_call_log WHERE ts < NOW() - INTERVAL '90 days';
```

Und `maintenance:ai-log-cleanup` zu den `cmds`/`deps` von `maintenance:all` hinzufügen (analog zu den anderen Cleanup-Tasks dort).

- [ ] **Step 3: Dry-run Validierung**

Run: `task --dry maintenance:ai-log-cleanup 2>&1 | tail -10 || bash scripts/task-oracle.sh --dry-run 'cleanup ai call log'`
Expected: Task wird aufgelöst (kein „task not found"), zeigt das DELETE-Kommando.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(website): add maintenance:ai-log-cleanup retention task [T001065]"
```

---

## Task 9: Finale Verifikation

**Files:** — (keine Änderung; nur Verifikation)

Akzeptanzkriterien-Mapping (Spec §6):
1. Coaching-Chat → `ai_call_log` Eintrag → Task 3
2. `queryNearest()` → `workflow='rag_search'` → Task 4
3. `GET /api/admin/ai-quality` HTTP 200 + Shape → Task 5
4. View über Home-Menü erreichbar + Health-Dots → Tasks 6+7
5. Kein LLM-Call scheitert wegen Logging → fire-and-forget Garantie (Task 2, getestet)
6. `task test:changed` + `task freshness:check` grün → diese Task

- [ ] **Step 1: Geänderte Tests laufen lassen**

Run: `task test:changed`
Expected: PASS — alle neuen/betroffenen Vitest-Suites grün (ai-metrics, ai-quality, knowledge-db, sidekick-nudge, assistant-Komponenten).

- [ ] **Step 2: Freshness-Artefakte regenerieren**

Run: `task freshness:regenerate`
Expected: regeneriert generierte Artefakte (test-inventory etc.) — committet Änderungen mit aufnehmen, falls welche entstehen.

- [ ] **Step 3: Freshness-Gate prüfen**

Run: `task freshness:check`
Expected: PASS — keine Drift zwischen committeten und regenerierten Artefakten.

- [ ] **Step 4: Etwaige Freshness-Änderungen committen**

```bash
git add -A
git commit -m "chore(website): regenerate freshness artifacts for ai-quality [T001065]" || echo "nichts zu committen"
```

- [ ] **Step 5: Alle S1-Budgets final bestätigen**

Run:
```bash
wc -l \
  website/src/lib/assistant/llm.ts \
  website/src/lib/knowledge-db.ts \
  website/src/lib/embeddings.ts \
  website/src/components/assistant/SidekickHome.svelte \
  website/src/components/PortalSidekick.svelte \
  website/src/lib/assistant/sidekick-nudge.ts \
  website/src/lib/ai-metrics.ts \
  website/src/components/assistant/AiQualitySidekickView.svelte \
  website/src/pages/api/admin/ai-quality.ts
```
Expected: jede `.ts` < 600, jede `.svelte` < 500. Insbesondere `knowledge-db.ts` muss < 600 bleiben (Start 464).

---

## Self-Review (durchgeführt)

- **Spec-Coverage:** §1 Datenschicht → Task 1; §2 Middleware → Task 2; §2 Instrumentierung (3–5 Sites) → Tasks 3+4 (coaching_chat, rag_search, embedding; Grilling/Plan-QA explizit out-of-scope, da kein direkter Website-LLM-Call — siehe Spec §5); §3 API → Task 5; §4 View → Task 6; §4 Navigation → Task 7; §1 Retention → Task 8; §6 Akzeptanz → Task 9.
- **Typkonsistenz:** `AiWorkflow`, `AiCallMeta`, `AiCallRecord`, `logAiCall`, `withAiMetrics`, `computeHealth`, `Health` durchgängig konsistent zwischen Task 2, 4, 5.
- **Befund (für Implementierer):** `ki-services.ts` aus der Spec ist falsch — echte `embedBatch()` in `embeddings.ts`; `withAiMetrics` passt nur für Anthropic-Form, daher zusätzlich `logAiCall()` für RAG/Embeddings.
