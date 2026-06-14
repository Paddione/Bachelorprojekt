---
title: LLM Availability-Based Routing Implementation Plan
ticket_id: T000718
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# LLM Availability-Based Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route website assistant-chat, ticket-triage, and classify to DeepSeek/GPU-worker automatically via the existing `tickets.provider_config` DB system, with error-driven cooldowns and an embeddings runtime fallback when the GPU worker is unreachable.

**Architecture:** Four changes build on the already-merged `tickets.provider_config` routing table (PR #1651): (1) `classify.ts` is migrated from hardcoded Anthropic to `getProviderConfig`, (2) a `setProviderCooldown` helper is added to `provider-config.ts` and wired into all three hot-path catch-blocks, (3) a SQL migration seeds DeepSeek + local-cluster rows for `assistant-chat` and `ticket-triage` sources, and (4) `embeddings.ts` gets a try/catch around `callRouter` with Voyage fallback for ECONNREFUSED/timeout — but only when the collection model is homogeneous voyage (bge-m3 calls still fail closed). A critical fix is also required: both `ticket-triage.ts` and `assistant/llm.ts` skip providers with an empty `apiKey`, but `local-cluster` legitimately needs no key — `apiKeyForProvider` must return `'not-required'` instead of `''` for non-standard providers.

**Tech Stack:** TypeScript (Astro/Node.js), `pg` PostgreSQL client, `@anthropic-ai/sdk` (OpenAI-compat mode via `baseURL`), Vitest for tests, SQL migrations in `scripts/migrations/`.

---

## S1-Budget (pre-flight)

| File | Current lines | Baseline | Budget |
|------|--------------|----------|--------|
| `website/src/pages/api/admin/tickets/[id]/classify.ts` | 88 | nicht-baselined | 600 − 88 = **+512** |
| `website/src/lib/provider-config.ts` | 43 | nicht-baselined | 600 − 43 = **+557** |
| `website/src/lib/assistant/llm.ts` | 104 | nicht-baselined | 600 − 104 = **+496** |
| `website/src/lib/ticket-triage.ts` | 108 | nicht-baselined | 600 − 108 = **+492** |
| `website/src/lib/embeddings.ts` | 119 | nicht-baselined | 600 − 119 = **+481** |

All five files are well under their extension limits. No S1-ratchet risk.

## Key finding: `setProviderCooldown` does NOT exist yet

`provider-config.ts` has `getProviderConfig` but no `setProviderCooldown`. The function must be written as part of Task A.

## Key finding: `apiKeyForProvider` blocks `local-cluster`

`apiKeyForProvider('local-cluster')` returns `''` (falsy). Both `ticket-triage.ts:38` and `assistant/llm.ts:40` guard with `if (!cfg.apiKey) return null/fallback`. This silently skips local-cluster even when it's the highest-priority provider. Fix: make `apiKeyForProvider` return `'not-required'` for unknown providers (mirrors `openai-compatible-session-agent.ts:resolveApiKey`).

## Key finding: `DEEPSEEK_API_KEY` already in schema.yaml and k3d/secrets.yaml

`environments/schema.yaml` line 751 already declares `DEEPSEEK_API_KEY`. `k3d/secrets.yaml` line 91 already has `DEEPSEEK_API_KEY: ""`. No schema/secrets changes needed.

## Key finding: Migration convention

New SQL migrations live in `scripts/migrations/` with date-prefixed names (e.g. `2026-06-14-provider-config-unify.sql`). The `website/src/db/migrations/` directory uses a different YYYYMMDD_ prefix for platform asset migrations. Provider routing seeds follow the `scripts/migrations/` convention.

---

## File Map

| File | Change |
|------|--------|
| `website/src/lib/provider-config.ts` | Add `setProviderCooldown` export; fix `apiKeyForProvider` to return `'not-required'` for unknown providers |
| `website/src/pages/api/admin/tickets/[id]/classify.ts` | Replace hardcoded Anthropic client + model with `getProviderConfig`; add `setProviderCooldown` in catch |
| `website/src/lib/ticket-triage.ts` | Add `setProviderCooldown` in catch block; remove falsy-apiKey early return for local-cluster |
| `website/src/lib/assistant/llm.ts` | Add `setProviderCooldown` in catch block; adjust apiKey guard |
| `website/src/lib/embeddings.ts` | Wrap `callRouter` in try/catch with Voyage fallback for network errors; keep bge-m3 fail-closed |
| `scripts/migrations/2026-06-14-llm-availability-seed.sql` | New: UPSERT DeepSeek + local-cluster rows for `assistant-chat` and `ticket-triage`; demote Anthropic wildcard to priority 99 |
| `website/src/lib/ki-services-wiring.test.ts` | Extend: add `classify.ts` to the anti-drift CASES array |
| `website/src/lib/tickets-db.providerrouting.test.ts` | Extend: add test for `setProviderCooldown` and apiKey='not-required' behaviour |
| `website/src/lib/embeddings.test.ts` | Extend: add test for GPU-down Voyage fallback (voyage-multilingual-2 only) |

---

## Task A: `provider-config.ts` — setProviderCooldown + apiKeyForProvider fix

**Files:**
- Modify: `website/src/lib/provider-config.ts`
- Test: `website/src/lib/tickets-db.providerrouting.test.ts`

- [ ] **Step 1: Write failing tests for setProviderCooldown and apiKeyForProvider fix**

Open `website/src/lib/tickets-db.providerrouting.test.ts` and **add** these tests inside a new `describe` block at the bottom (do not remove existing tests):

```typescript
import { getProviderConfig, setProviderCooldown } from './provider-config';

// … after the existing describe blocks …

describe('provider-config helpers', () => {
  it('apiKeyForProvider returns non-empty string for local-cluster (no key needed)', async () => {
    // Arrange: local-cluster row in DB, no env key set
    await pool.query(
      `INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url)
       VALUES ('assistant-chat', 'sonnet', 1, 'local-cluster', 'mistral', 'http://llm-gw:11434/v1')
       ON CONFLICT (source, tier, priority) DO UPDATE SET provider=EXCLUDED.provider`,
    );
    // Act
    const cfg = await getProviderConfig('assistant-chat', 'sonnet');
    // Assert: apiKey is truthy even though no env var is set for local-cluster
    expect(cfg.provider).toBe('local-cluster');
    expect(cfg.apiKey).toBeTruthy();
  });

  it('setProviderCooldown inserts/updates provider_health cooldown_until', async () => {
    await setProviderCooldown(pool, 'ticket-triage', 'deepseek', 5);
    const { rows } = await pool.query(
      `SELECT cooldown_until FROM tickets.provider_health WHERE provider = 'deepseek'`,
    );
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].cooldown_until).getTime()).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/tickets-db.providerrouting.test.ts 2>&1 | tail -20
```

Expected: two new tests fail — `setProviderCooldown` not exported, `local-cluster` apiKey is `''`.

- [ ] **Step 3: Implement the fixes in provider-config.ts**

Replace the entire content of `website/src/lib/provider-config.ts`:

```typescript
import { pool } from './website-db';
import type { Pool } from 'pg';

export interface ProviderChoice {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
}

const OPUS_MODEL = 'claude-opus-4-6';
const FALLBACK: Omit<ProviderChoice, 'apiKey'> = {
  provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null,
};

function apiKeyForProvider(provider: string): string {
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY || '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  // local-cluster, local-lmstudio, local-ollama: no key needed
  return 'not-required';
}

export async function getProviderConfig(source: string, tier: 'sonnet' | 'haiku' | 'opus'): Promise<ProviderChoice> {
  if (tier === 'opus') {
    return { provider: 'anthropic', modelId: OPUS_MODEL, baseUrl: null, apiKey: process.env.ANTHROPIC_API_KEY || '' };
  }
  try {
    const { rows } = await pool.query(
      `SELECT pc.provider, pc.model_id, pc.base_url
         FROM tickets.provider_config pc
         LEFT JOIN tickets.provider_health ph ON ph.provider = pc.provider
        WHERE (pc.source = $1 OR pc.source = '*') AND pc.tier = $2 AND pc.enabled = true
          AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= now())
        ORDER BY (pc.source = $1) DESC, pc.priority ASC
        LIMIT 1`,
      [source, tier],
    );
    if (rows.length) {
      const { provider, model_id, base_url } = rows[0];
      return { provider, modelId: model_id, baseUrl: base_url ?? null, apiKey: apiKeyForProvider(provider) };
    }
  } catch (err) {
    console.error('[provider-config] DB lookup failed, falling back to anthropic:', err);
  }
  return { ...FALLBACK, apiKey: process.env.ANTHROPIC_API_KEY || '' };
}

/**
 * Record a provider failure. Sets cooldown_until = now() + minutesFromNow minutes.
 * The next call to getProviderConfig will skip this provider until the cooldown expires,
 * automatically falling through to the next priority row.
 */
export async function setProviderCooldown(
  dbPool: Pool,
  source: string,
  provider: string,
  minutesFromNow: number,
): Promise<void> {
  try {
    await dbPool.query(
      `INSERT INTO tickets.provider_health (provider, failure_count, last_failure, cooldown_until)
       VALUES ($1, 1, now(), now() + ($2 || ' minutes')::interval)
       ON CONFLICT (provider) DO UPDATE
         SET failure_count  = tickets.provider_health.failure_count + 1,
             last_failure   = now(),
             cooldown_until = now() + ($2 || ' minutes')::interval`,
      [provider, minutesFromNow],
    );
    console.warn(`[provider-config] ${source}: provider '${provider}' put on cooldown for ${minutesFromNow}m`);
  } catch (err) {
    console.error('[provider-config] setProviderCooldown failed (non-fatal):', err);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/tickets-db.providerrouting.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-llm-availability-routing
git add website/src/lib/provider-config.ts website/src/lib/tickets-db.providerrouting.test.ts
git commit -m "feat(llm-routing): add setProviderCooldown + fix apiKeyForProvider for local-cluster"
```

---

## Task B: Migrate `classify.ts` to `getProviderConfig`

`classify.ts` currently hardcodes `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` and the model `claude-haiku-4-5-20251001`. It must use `getProviderConfig(SOURCE.ticketTriage, 'haiku')` — the exact same source as `ticket-triage.ts`. The ki-services-wiring test must also be extended to cover `classify.ts`.

**Files:**
- Modify: `website/src/pages/api/admin/tickets/[id]/classify.ts`
- Modify: `website/src/lib/ki-services-wiring.test.ts`

- [ ] **Step 1: Extend ki-services-wiring.test.ts to cover classify.ts**

Open `website/src/lib/ki-services-wiring.test.ts`. The `here` variable points to `.../src/lib` and the `read()` helper resolves relative to it. `classify.ts` is under `pages/api/admin/tickets/[id]/`, which is two levels up from `src/lib`. Add a new describe block **after** the existing one:

```typescript
// Add this import at the top
import { join as joinPath } from 'node:path';

// The existing `here` and `read` helpers work for lib/ files.
// For classify.ts we need a separate absolute path.
const pagesRoot = joinPath(here, '..', 'pages');
const readPage = (rel: string) => readFileSync(joinPath(pagesRoot, rel), 'utf8');

describe('classify.ts — Source-String kommt aus der Registry (Anti-Drift)', () => {
  it('classify.ts importiert SOURCE aus ki-services', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).toContain("from '");
    expect(src).toContain('SOURCE');
  });

  it('classify.ts nutzt SOURCE.ticketTriage statt String-Literal', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).toContain('SOURCE.ticketTriage');
    expect(src).not.toContain("getProviderConfig('ticket-triage'");
  });

  it('classify.ts enthält keine hardcoded claude-haiku Modell-ID', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).not.toContain('claude-haiku-4-5-20251001');
    expect(src).not.toContain('claude-haiku-4-5');
  });

  it('classify.ts hat keinen hardcoded ANTHROPIC_API_KEY Guard mehr', () => {
    const src = readPage('api/admin/tickets/[id]/classify.ts');
    expect(src).not.toContain("process.env.ANTHROPIC_API_KEY");
    expect(src).not.toContain('ANTHROPIC_API_KEY not configured');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/ki-services-wiring.test.ts 2>&1 | tail -20
```

Expected: the four new classify tests fail.

- [ ] **Step 3: Rewrite classify.ts**

Replace the entire content of `website/src/pages/api/admin/tickets/[id]/classify.ts`:

```typescript
// website/src/pages/api/admin/tickets/[id]/classify.ts
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getTicketDetail, patchAdminTicket } from '../../../../../lib/tickets/admin';
import { getProviderConfig, setProviderCooldown } from '../../../../../lib/provider-config';
import { SOURCE } from '../../../../../lib/ki-services';
import { pool } from '../../../../../lib/website-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const PRIORITY_MAP: Record<string, 'hoch' | 'mittel' | 'niedrig'> = {
  high: 'hoch', critical: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const id = String(params.id ?? '');
  if (!id) return new Response(JSON.stringify({ error: 'id missing' }), { status: 400 });

  const detail = await getTicketDetail(BRAND(), id);
  if (!detail) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const cfg = await getProviderConfig(SOURCE.ticketTriage, 'haiku');
  if (!cfg.apiKey) {
    return new Response(JSON.stringify({ error: 'KI-Provider nicht konfiguriert' }), { status: 503 });
  }

  const prompt = `Classify this support ticket and respond with ONLY valid JSON, no other text.

Title: ${detail.title}
Description: ${detail.description ?? '(keine Beschreibung)'}

Respond exactly:
{"component":"<short component name, e.g. website/auth/brett/api>","priority":"low|medium|high|critical","attention_mode":"ai_ready|needs_human"}

Rules:
- component: one lowercase word or slash-path, max 20 chars
- priority: low if minor cosmetic, medium if impactful, high if blocking, critical if data loss
- attention_mode: ai_ready if description is clear and actionable, needs_human if ambiguous`;

  let parsed: { component: string; priority: string; attention_mode: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = new Anthropic({
        apiKey: cfg.apiKey,
        ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
      });
      const msg = await client.messages.create({
        model: cfg.modelId,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        break;
      }
    } catch (err) {
      await setProviderCooldown(pool, SOURCE.ticketTriage, cfg.provider, 5);
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: 'LLM nicht erreichbar' }), { status: 503 });
      }
    }
  }

  if (!parsed) {
    return new Response(JSON.stringify({ error: 'KI-Antwort konnte nicht geparst werden' }), { status: 500 });
  }

  const mappedPriority = PRIORITY_MAP[parsed.priority] ?? 'mittel';
  const mappedAttention = ['ai_ready', 'needs_human'].includes(parsed.attention_mode)
    ? parsed.attention_mode as 'ai_ready' | 'needs_human'
    : 'ai_ready';

  await patchAdminTicket({
    brand: BRAND(),
    id,
    component: parsed.component.slice(0, 50) || null,
    priority: mappedPriority,
    attentionMode: mappedAttention,
    actor: { label: session.preferred_username },
  });

  return new Response(JSON.stringify({
    ticket_id: id,
    component: parsed.component,
    priority: mappedPriority,
    attention_mode: mappedAttention,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

Note: the file went from 88 to 85 lines (net -3, stays well under limit).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/ki-services-wiring.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the four new classify tests.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-llm-availability-routing
git add \
  website/src/pages/api/admin/tickets/[id]/classify.ts \
  website/src/lib/ki-services-wiring.test.ts
git commit -m "feat(llm-routing): migrate classify.ts to getProviderConfig(SOURCE.ticketTriage, 'haiku')"
```

---

## Task C: Wire `setProviderCooldown` into ticket-triage.ts and assistant/llm.ts

Both files already use `getProviderConfig` correctly. They need (1) `setProviderCooldown` in catch blocks, and (2) the `!cfg.apiKey` guard must not reject `local-cluster` — since Task A changed `apiKeyForProvider` to return `'not-required'` for unknown providers, the guard `if (!cfg.apiKey)` now works correctly (truthy for `'not-required'`). No other guard change is needed.

**Files:**
- Modify: `website/src/lib/ticket-triage.ts`
- Modify: `website/src/lib/assistant/llm.ts`

- [ ] **Step 1: Update ticket-triage.ts**

The only change: import `setProviderCooldown` and `pool`, and call `setProviderCooldown` in the catch block. Replace the catch block at lines 74-79 with:

In `website/src/lib/ticket-triage.ts`, change:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getProviderConfig } from './provider-config';
import { SOURCE } from './ki-services';
import { getTicketDetail, addComment } from './tickets/admin';
```

to:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getProviderConfig, setProviderCooldown } from './provider-config';
import { SOURCE } from './ki-services';
import { getTicketDetail, addComment } from './tickets/admin';
import { pool } from './website-db';
```

Then replace the inner catch block (lines 74-79):

```typescript
    } catch (err) {
      if (attempt === 1) {
        console.error('[ticket-triage] LLM call failed after retry:', err);
        return null;
      }
    }
```

with:

```typescript
    } catch (err) {
      await setProviderCooldown(pool, SOURCE.ticketTriage, cfg.provider, 5);
      if (attempt === 1) {
        console.error('[ticket-triage] LLM call failed after retry:', err);
        return null;
      }
    }
```

- [ ] **Step 2: Update assistant/llm.ts**

In `website/src/lib/assistant/llm.ts`, change:

```typescript
import { getProviderConfig } from '../provider-config';
```

to:

```typescript
import { getProviderConfig, setProviderCooldown } from '../provider-config';
```

The `pool` is already imported at line 7. Now wrap the main `client.messages.create` call. The current code (lines 84-102) has no try/catch around the Anthropic call — add one:

Replace:

```typescript
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });
  const response = await client.messages.create({
    model: cfg.modelId,
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
```

with:

```typescript
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });

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

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { reply, sources: sources.length > 0 ? sources : undefined };
```

- [ ] **Step 3: Run full vitest suite to verify no regressions**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run 2>&1 | tail -30
```

Expected: all existing tests continue to pass. No new test failures.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-llm-availability-routing
git add website/src/lib/ticket-triage.ts website/src/lib/assistant/llm.ts
git commit -m "feat(llm-routing): wire setProviderCooldown into ticket-triage and assistant/llm hot-paths"
```

---

## Task D: DB Migration — Seed DeepSeek + local-cluster rows

New migration file in `scripts/migrations/`. The schema already exists (PR #1651). This migration only inserts/updates data rows.

**Files:**
- Create: `scripts/migrations/2026-06-14-llm-availability-seed.sql`

- [ ] **Step 1: Create the migration file**

Create `scripts/migrations/2026-06-14-llm-availability-seed.sql` with this content:

```sql
-- 2026-06-14-llm-availability-seed.sql
-- Seeds DeepSeek + local-cluster as preferred providers for assistant-chat and
-- ticket-triage, demoting wildcard Anthropic rows to priority 99 (last resort).
-- Idempotent (ON CONFLICT DO UPDATE / DO NOTHING).
--
-- Apply to BOTH brands (workspace AND workspace-korczewski) — separate per-brand DBs:
--   BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-llm-availability-seed.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-06-14-llm-availability-seed.sql'
-- Dev (k3d): kubectl exec -n workspace <shared-db-pod> -- psql -U website website

BEGIN;

-- ── assistant-chat: DeepSeek priority 1, local-cluster priority 2 ─────────────
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('assistant-chat', 'sonnet', 1, 'deepseek',       'deepseek-chat', 'https://api.deepseek.com/v1', true),
  ('assistant-chat', 'sonnet', 2, 'local-cluster',  'mistral',       NULL,                          true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider  = EXCLUDED.provider,
      model_id  = EXCLUDED.model_id,
      base_url  = EXCLUDED.base_url,
      enabled   = EXCLUDED.enabled,
      updated_at = now();

-- ── ticket-triage: DeepSeek priority 1, local-cluster priority 2 ─────────────
INSERT INTO tickets.provider_config (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('ticket-triage', 'haiku', 1, 'deepseek',      'deepseek-chat', 'https://api.deepseek.com/v1', true),
  ('ticket-triage', 'haiku', 2, 'local-cluster', 'mistral',       NULL,                          true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider  = EXCLUDED.provider,
      model_id  = EXCLUDED.model_id,
      base_url  = EXCLUDED.base_url,
      enabled   = EXCLUDED.enabled,
      updated_at = now();

-- ── Demote wildcard Anthropic rows to priority 99 (already there from initProviderConfigSchema,
--    but make explicit in case they were re-seeded at a different priority) ────
UPDATE tickets.provider_config
  SET priority = 99, updated_at = now()
  WHERE source = '*' AND provider = 'anthropic'
    AND priority <> 99;

-- Note: the wildcard rows (*,sonnet,99,anthropic) and (*,haiku,99,anthropic) are inserted by
-- initProviderConfigSchema on startup (DO NOTHING on conflict). No further action needed.

COMMIT;
```

Note on `local-cluster` model_id: the migration sets `'mistral'` as a placeholder. The actual model name served by the GPU worker is env/deployment-specific and is typically overridden via the `/admin/ki-konfiguration` UI or by updating the row in prod. The `base_url` is `NULL`, which means `provider-config.ts` returns `baseUrl: null` — the caller (`Anthropic({baseURL: cfg.baseUrl})`) spreads it only when truthy, so no baseURL is set. For `local-cluster` the runtime must reach the GPU via `LLM_ROUTER_URL`. However, since `classify.ts` and `ticket-triage.ts` use `@anthropic-ai/sdk` in OpenAI-compat mode, the `base_url` column for `local-cluster` should point to the cluster chat URL. Update the migration to use the env-driven default:

The `base_url` for `local-cluster` in the migration should be the cluster-internal URL. Since this is an environment-specific value and the Kubernetes environment resolves it via `LLM_ROUTER_URL`, set it to `NULL` in the migration and document that operators should update it post-migration if the GPU worker is available:

```sql
-- For local-cluster: base_url defaults to NULL; update after migration:
-- UPDATE tickets.provider_config
--   SET base_url = 'http://llm-gateway-chat.workspace.svc.cluster.local:11434/v1'
--   WHERE source IN ('assistant-chat','ticket-triage') AND provider = 'local-cluster';
-- Or use the /admin/ki-konfiguration UI.
```

The migration above already has `NULL` for local-cluster `base_url` — this is correct. The `getProviderConfig` function returns `baseUrl: null` when the column is NULL, and the Anthropic SDK caller only sets `baseURL` when the value is truthy. **For local-cluster to actually work, the `base_url` column must be set to the cluster URL in prod.** The migration comment documents this. Add the comment to the file after the local-cluster INSERT.

- [ ] **Step 2: Verify the SQL is valid (dry run)**

```bash
cd /tmp/wt-llm-availability-routing
# Just syntax-check (no running cluster needed in dev)
psql --version 2>&1 | head -1
# If psql available, check syntax:
echo "SELECT 1" | psql -d "postgres://localhost/test" 2>&1 | head -5 || true
# Static check: verify no brand domain literals (S3)
grep -n "mentolder\|korczewski" scripts/migrations/2026-06-14-llm-availability-seed.sql || echo "OK: no brand domain literals"
```

Expected: "OK: no brand domain literals"

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-llm-availability-routing
git add scripts/migrations/2026-06-14-llm-availability-seed.sql
git commit -m "feat(llm-routing): seed DeepSeek + local-cluster rows for assistant-chat and ticket-triage"
```

---

## Task E: Embeddings Runtime Fallback

`embeddings.ts` currently calls `callRouter()` without any catch when `LLM_ENABLED=true`. If the GPU worker is unreachable (ECONNREFUSED, timeout), it throws an `EmbeddingIndexError` or `EmbeddingQueryError` immediately — there is no Voyage fallback. The spec requires: wrap the GPU call with try/catch; if the error is a network failure AND the collection model is voyage-multilingual-2, fall through to Voyage. bge-m3 collections must still fail closed (the Mixed-Collection constraint from `CLAUDE.md` must be preserved).

However, `embeddings.ts` does not know the collection model. The `opts.model` parameter already controls which model is requested. The rule is: if `opts.model` is `'voyage-multilingual-2'` (explicit) AND the GPU router fails with a network error, fall back to direct Voyage. If `opts.model` is `'bge-m3'` (the default when `LLM_ENABLED=true`), there is no Voyage fallback (bge-m3 vectors are incompatible with voyage space).

**Files:**
- Modify: `website/src/lib/embeddings.ts`
- Modify: `website/src/lib/embeddings.test.ts`

- [ ] **Step 1: Write failing tests for the Voyage fallback**

In `website/src/lib/embeddings.test.ts`, add inside the `describe('embeddings client — router mode (LLM_ENABLED=true)')` block (before the closing `}`):

```typescript
  test('voyage model: ECONNREFUSED from router → falls back to Voyage with console.warn', async () => {
    // Simulate network error (ECONNREFUSED / fetch throws)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (String(url).includes('llm-router.test')) {
        return Promise.reject(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      }
      // Voyage fallback succeeds
      return Promise.resolve(new Response(
        JSON.stringify({ data: [{ embedding: Array(1024).fill(0.5) }], usage: { total_tokens: 5 } }),
        { status: 200 },
      ));
    });
    process.env.VOYAGE_API_KEY = 'test-voyage-key';

    const r = await embedQuery('hello', { model: 'voyage-multilingual-2', purpose: 'query', maxAttempts: 1 });
    expect(r.embedding).toHaveLength(1024);
    expect(callCount).toBeGreaterThan(1); // router was tried, then voyage
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[embeddings] GPU router unreachable'));

    delete process.env.VOYAGE_API_KEY;
    warnSpy.mockRestore();
  });

  test('bge-m3 model: ECONNREFUSED from router → throws EmbeddingQueryError (no fallback)', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );
    await expect(
      embedQuery('x', { model: 'bge-m3', purpose: 'query', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingQueryError/);
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/embeddings.test.ts 2>&1 | tail -20
```

Expected: the two new tests fail.

- [ ] **Step 3: Implement the fallback in embeddings.ts**

The change is limited to `embedQuery` and `embedBatch`. When `callRouter` throws a network-type error AND the model is `voyage-multilingual-2`, catch the error and call `callVoyageDirect` instead.

A network error is one where `fetch()` itself rejects (TypeError: fetch failed, ECONNREFUSED, ETIMEDOUT, AbortError). Distinguish from HTTP-level errors (which `callRouter` wraps as `EmbeddingIndexError`/`EmbeddingQueryError` after `r.ok` is false).

Add a helper at the top of the file (after the class definitions):

```typescript
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { message, name } = err as { message: string; name: string };
  return name === 'AbortError' ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message);
}
```

Update `embedQuery`:

```typescript
export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'query';
  if (isLlmEnabled()) {
    const model: EmbeddingModel = opts.model ?? 'bge-m3';
    try {
      const r = await callRouter([text], { ...opts, model, purpose });
      return { embedding: r.embeddings[0], tokens: r.tokens };
    } catch (err) {
      if (model === 'voyage-multilingual-2' && isNetworkError(err)) {
        console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
        const r = await callVoyageDirect([text], 'query', opts);
        return { embedding: r.embeddings[0], tokens: r.tokens };
      }
      throw err;
    }
  }
  const r = await callVoyageDirect([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}
```

Update `embedBatch`:

```typescript
export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    if (isLlmEnabled()) {
      const model: EmbeddingModel = opts.model ?? 'bge-m3';
      try {
        const r = await callRouter(slice, { ...opts, model, purpose });
        out.push(...r.embeddings);
        totalTokens += r.tokens;
      } catch (err) {
        if (model === 'voyage-multilingual-2' && isNetworkError(err)) {
          console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
          const r = await callVoyageDirect(slice, 'document', opts);
          out.push(...r.embeddings);
          totalTokens += r.tokens;
        } else {
          throw err;
        }
      }
    } else {
      const r = await callVoyageDirect(slice, 'document', opts);
      out.push(...r.embeddings);
      totalTokens += r.tokens;
    }
  }
  return { embeddings: out, tokens: totalTokens };
}
```

The full updated `embeddings.ts` (preserving all existing exports and the `isNetworkError` helper added at line ~30):

```typescript
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export type EmbeddingModel = 'bge-m3' | 'voyage-multilingual-2';
export type EmbeddingPurpose = 'index' | 'query';

export interface EmbedResult { embedding: number[]; tokens: number; }
export interface BatchResult  { embeddings: number[][]; tokens: number; }
export interface EmbedOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  model?: EmbeddingModel;
  purpose?: EmbeddingPurpose;
}

export class EmbeddingIndexError extends Error {
  constructor(msg: string) { super(`EmbeddingIndexError: ${msg}`); this.name = 'EmbeddingIndexError'; }
}
export class EmbeddingQueryError extends Error {
  constructor(msg: string) { super(`EmbeddingQueryError: ${msg}`); this.name = 'EmbeddingQueryError'; }
}

const voyageKey = () => {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY is unset');
  return k;
};

const isLlmEnabled = () => process.env.LLM_ENABLED === 'true';
const embedUrl = () => process.env.LLM_EMBED_URL ?? 'http://llm-gateway-embed.workspace.svc.cluster.local:8081';

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { message, name } = err as { message: string; name: string };
  return name === 'AbortError' ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message);
}

async function callVoyageDirect(inputs: string[], inputType: 'query' | 'document', opts: EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${voyageKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage: { total_tokens: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage.total_tokens };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('voyage retry exhausted');
}

async function callRouter(inputs: string[], opts: Required<Pick<EmbedOpts, 'model' | 'purpose'>> & EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(`${embedUrl()}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': opts.purpose },
      body: JSON.stringify({ model: opts.model, input: inputs }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage?.total_tokens ?? 0 };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw opts.purpose === 'index'
      ? new EmbeddingIndexError(`router ${r.status} ${await r.clone().text().catch(() => '')}`)
      : new EmbeddingQueryError(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw opts.purpose === 'index'
    ? new EmbeddingIndexError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted')
    : new EmbeddingQueryError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted');
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'query';
  if (isLlmEnabled()) {
    const model: EmbeddingModel = opts.model ?? 'bge-m3';
    try {
      const r = await callRouter([text], { ...opts, model, purpose });
      return { embedding: r.embeddings[0], tokens: r.tokens };
    } catch (err) {
      if (model === 'voyage-multilingual-2' && isNetworkError(err)) {
        console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
        const r = await callVoyageDirect([text], 'query', opts);
        return { embedding: r.embeddings[0], tokens: r.tokens };
      }
      throw err;
    }
  }
  const r = await callVoyageDirect([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    if (isLlmEnabled()) {
      const model: EmbeddingModel = opts.model ?? 'bge-m3';
      try {
        const r = await callRouter(slice, { ...opts, model, purpose });
        out.push(...r.embeddings);
        totalTokens += r.tokens;
      } catch (err) {
        if (model === 'voyage-multilingual-2' && isNetworkError(err)) {
          console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
          const r = await callVoyageDirect(slice, 'document', opts);
          out.push(...r.embeddings);
          totalTokens += r.tokens;
        } else {
          throw err;
        }
      }
    } else {
      const r = await callVoyageDirect(slice, 'document', opts);
      out.push(...r.embeddings);
      totalTokens += r.tokens;
    }
  }
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
```

File goes from 119 to ~141 lines — still well under the 600-line limit for `.ts` files (nicht-baselined).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /tmp/wt-llm-availability-routing/website
npx vitest run src/lib/embeddings.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the two new fallback tests.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-llm-availability-routing
git add website/src/lib/embeddings.ts website/src/lib/embeddings.test.ts
git commit -m "feat(llm-routing): add Voyage fallback in embeddings.ts for GPU worker network failures"
```

---

## Task F: Final Verification

- [ ] **Step 1: Run full offline test suite**

```bash
cd /tmp/wt-llm-availability-routing
task test:all 2>&1 | tail -40
```

Expected: green. If `task` is not in PATH or Ollama is not running, the task-oracle script may fail — that is expected for network-dependent tests; offline BATS and Vitest must be green.

- [ ] **Step 2: Regenerate freshness artifacts**

```bash
cd /tmp/wt-llm-availability-routing
task freshness:regenerate 2>&1 | tail -20
```

- [ ] **Step 3: Run freshness check (S1-S4 gate)**

```bash
cd /tmp/wt-llm-availability-routing
task freshness:check 2>&1 | tail -30
```

Expected: all gates green. If S1 trips on any modified file, the file grew unexpectedly — diff against baseline and remove unused code until it fits.

- [ ] **Step 4: Regenerate test inventory and check for drift**

```bash
cd /tmp/wt-llm-availability-routing
task test:inventory 2>&1 | tail -10
git diff website/src/data/test-inventory.json | head -20
```

If the file changed, commit it:

```bash
cd /tmp/wt-llm-availability-routing
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test-inventory after llm-availability-routing test additions"
```

- [ ] **Step 5: Commit any freshness artifact changes**

```bash
cd /tmp/wt-llm-availability-routing
git status
# Stage only generated artifacts (docs/generated/, k3d/docs-content-built/):
git add docs/generated/ k3d/docs-content-built/ 2>/dev/null || true
git diff --staged --name-only
git commit -m "chore: regenerate freshness artifacts for llm-availability-routing" 2>/dev/null || echo "Nothing to commit"
```

---

## Spec Coverage Self-Review

| Spec requirement | Covered by |
|-----------------|------------|
| classify.ts uses getProviderConfig(SOURCE.ticketTriage, 'haiku') | Task B |
| classify.ts reads baseURL from config | Task B — Anthropic SDK spread: `...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {})` |
| setProviderCooldown on classify.ts error | Task B |
| setProviderCooldown on ticket-triage.ts error | Task C |
| setProviderCooldown on assistant/llm.ts error | Task C |
| DB seed: assistant-chat DeepSeek priority 1 | Task D |
| DB seed: assistant-chat local-cluster priority 2 | Task D |
| DB seed: ticket-triage DeepSeek priority 1 | Task D |
| DB seed: ticket-triage local-cluster priority 2 | Task D |
| Anthropic wildcard rows demoted to priority 99 | Task D |
| embeddings.ts: voyage model network error → Voyage fallback | Task E |
| embeddings.ts: bge-m3 still fails closed | Task E |
| No silent fallback when LLM_ENABLED=false | Task E (existing path unchanged) |
| MixedEmbeddingModelError preserved | Task E (thrown by knowledge-db.ts, not embeddings.ts — unchanged) |
| DEEPSEEK_API_KEY in schema.yaml | Already present — no change needed |
| DEEPSEEK_API_KEY in k3d/secrets.yaml | Already present (`""`) — no change needed |
| No new GPU-worker Kubernetes Service | Confirmed — migration uses NULL base_url for local-cluster |
| S3 — no brand domain literals | Task D SQL checked; no *.mentolder.de / *.korczewski.de literals in code |
| S2 — no import cycles | All new imports are from existing well-known modules; no cycles created |
| S4 — new migration is reachable | Yes — documented in the file header with factory_psql invocation |
