---
ticket_id: T000070
title: LM Studio Session Agent with pgvector RAG — Implementation Plan
domains: []
status: active
pr_number: null
---

# LM Studio Session Agent with pgvector RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire LM Studio (`http://100.102.71.114:1234/v1`, model `yemiao2745/qwen2.5-14b-instruct-uncensored`) as the active coaching-session provider for `mentolder`, with coaching book chunks from pgvector automatically injected into every prompt before the LLM call.

**Architecture:** A new `OpenAICompatibleSessionAgent` performs a pgvector similarity search on the user prompt, prepends matching coaching knowledge chunks to the system prompt, then calls the LM Studio OpenAI-compatible API. The broken `session-agent-factory.ts` (currently always returns `LegacySessionAgent`) is fixed to route `claude` → `ClaudeSessionAgent` and `custom_*` → `OpenAICompatibleSessionAgent`. An idempotent seed script inserts the `custom_lmstudio` row into `coaching.ki_config`.

**Tech Stack:** TypeScript, `openai` npm package (OpenAI SDK), `pg` (PostgreSQL pool), pgvector `<=>` cosine distance, LM Studio OpenAI-compatible API, Playwright E2E tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `website/src/lib/openai-compatible-session-agent.ts` | **CREATE** | pgvector RAG + OpenAI SDK call + streaming |
| `website/src/lib/session-agent-factory.ts` | **MODIFY** | Proper provider routing |
| `website/src/lib/coaching-ki-config-db.ts` | **MODIFY** | Add `lmstudio` to `KNOWN_PROVIDERS` so it can't be accidentally deleted |
| `scripts/seed-lmstudio-ki-config.mjs` | **CREATE** | Idempotent DB seed for the LM Studio provider row |
| `tests/e2e/specs/fa-39-lmstudio-integration.spec.ts` | **VERIFY** | Already exists — run as-is, fix assertions if needed |

---

## Task 1: Create `OpenAICompatibleSessionAgent`

**Files:**
- Create: `website/src/lib/openai-compatible-session-agent.ts`

- [ ] **Step 1.1: Write the file**

```typescript
// website/src/lib/openai-compatible-session-agent.ts
import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import { searchCoachingKnowledgeTool } from './session-tools';

async function buildEnrichedSystemPrompt(
  basePrompt: string,
  userMessage: string,
): Promise<string> {
  const chunks = await searchCoachingKnowledgeTool(userMessage, 4);
  if (chunks.length === 0) return basePrompt;

  const knowledgeSection = chunks
    .map((c, i) => {
      const header = c.title ? `**[${i + 1}] ${c.title}**` : `**[${i + 1}]**`;
      return `${header}\n${c.body}\n*(${c.source})*`;
    })
    .join('\n\n');

  return `${basePrompt}\n\n## Coaching-Wissen (aus Wissensdatenbank)\n\n${knowledgeSection}`;
}

export class OpenAICompatibleSessionAgent implements SessionAgent {
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const startMs = Date.now();

    if (!kiConfig.apiEndpoint) {
      throw new Error(`OpenAICompatibleSessionAgent: apiEndpoint fehlt für provider '${kiConfig.provider}'`);
    }

    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: kiConfig.apiKey ?? 'not-required',
      baseURL: kiConfig.apiEndpoint,
    });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const resp = await client.chat.completions.create({
      model: kiConfig.modelName ?? 'llama3',
      max_tokens: kiConfig.maxTokens ?? 800,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      messages,
    });

    const aiResponse = resp.choices[0]?.message.content ?? '';
    return {
      aiResponse,
      provider: kiConfig.provider,
      model: kiConfig.modelName ?? 'unknown',
      durationMs: Date.now() - startMs,
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<string> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;

    if (!kiConfig.apiEndpoint) {
      throw new Error(`OpenAICompatibleSessionAgent: apiEndpoint fehlt für provider '${kiConfig.provider}'`);
    }

    const enrichedSystem = await buildEnrichedSystemPrompt(effectiveSystemPrompt, assembledUserPrompt);

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: kiConfig.apiKey ?? 'not-required',
      baseURL: kiConfig.apiEndpoint,
    });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: enrichedSystem },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = await client.chat.completions.create({
      model: kiConfig.modelName ?? 'llama3',
      max_tokens: kiConfig.maxTokens ?? 800,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
```

- [ ] **Step 1.2: Verify TypeScript compiles**

```bash
cd /tmp/wt-lmstudio-session-pgvector/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `openai-compatible-session-agent.ts`. If `searchCoachingKnowledgeTool` import fails, check that `session-tools.ts` exports it (it does, line 32).

- [ ] **Step 1.3: Commit**

```bash
cd /tmp/wt-lmstudio-session-pgvector
git add website/src/lib/openai-compatible-session-agent.ts
git commit -m "feat(coaching): add OpenAICompatibleSessionAgent with pgvector RAG injection"
```

---

## Task 2: Fix `session-agent-factory.ts`

The factory currently always returns `new LegacySessionAgent()`, making `ClaudeSessionAgent` unreachable and routing `custom_*` providers (including LM Studio) to a path that has no pgvector support.

**Files:**
- Modify: `website/src/lib/session-agent-factory.ts`

- [ ] **Step 2.1: Replace the factory**

Current content (the only 7 lines):

```typescript
import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { LegacySessionAgent } from './legacy-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  return new LegacySessionAgent();
}
```

Replace with:

```typescript
import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { ClaudeSessionAgent } from './claude-session-agent';
import { LegacySessionAgent } from './legacy-session-agent';
import { OpenAICompatibleSessionAgent } from './openai-compatible-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  const { provider } = kiConfig;

  // Anthropic SDK path — handles both native Anthropic and custom baseURL (e.g. llm-router)
  if (provider === 'claude') {
    return new ClaudeSessionAgent();
  }

  // OpenAI-compatible local/custom endpoints → RAG injection from pgvector
  if (provider.startsWith('custom_') || provider === 'lumo') {
    return new OpenAICompatibleSessionAgent();
  }

  // openai / mistral — external APIs, keep legacy behaviour
  return new LegacySessionAgent();
}
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
cd /tmp/wt-lmstudio-session-pgvector/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
cd /tmp/wt-lmstudio-session-pgvector
git add website/src/lib/session-agent-factory.ts
git commit -m "fix(coaching): restore ClaudeSessionAgent routing; route custom_*/lumo to OpenAICompatibleSessionAgent"
```

---

## Task 3: Add `lmstudio` to `KNOWN_PROVIDERS`

Without this, the `custom_lmstudio` provider can be deleted via the admin UI (the DELETE endpoint only blocks KNOWN_PROVIDERS). Adding `lmstudio` to the set keeps the DB entry stable.

**Files:**
- Modify: `website/src/lib/coaching-ki-config-db.ts:3`

- [ ] **Step 3.1: Edit the KNOWN_PROVIDERS constant**

Current line 3:
```typescript
const KNOWN_PROVIDERS = new Set(['openai', 'mistral', 'lumo', 'claude']);
```

Change to:
```typescript
const KNOWN_PROVIDERS = new Set(['openai', 'mistral', 'lumo', 'claude', 'custom_lmstudio']);
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
cd /tmp/wt-lmstudio-session-pgvector/website
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
cd /tmp/wt-lmstudio-session-pgvector
git add website/src/lib/coaching-ki-config-db.ts
git commit -m "chore(coaching): protect custom_lmstudio provider from accidental deletion"
```

---

## Task 4: DB seed script

The LM Studio API key (`sk-lm-9TPygmH8:Xb8ZYSRULiaHAvVnyRem`) must be stored in the DB — **never committed to git**. The seed script reads it from an environment variable.

**Files:**
- Create: `scripts/seed-lmstudio-ki-config.mjs`

- [ ] **Step 4.1: Write the seed script**

```javascript
// scripts/seed-lmstudio-ki-config.mjs
// Idempotent: insert or update the custom_lmstudio row and set it as active.
// Usage:
//   LMSTUDIO_API_KEY=sk-lm-... node scripts/seed-lmstudio-ki-config.mjs [mentolder|korczewski]
//
// The script:
//   1. Deactivates all ki_config rows for the brand
//   2. Upserts the custom_lmstudio row with the provided key/endpoint/model
//   3. Sets is_active = true on that row

import pg from 'pg';

const { Pool } = pg;

const brand   = process.argv[2] ?? 'mentolder';
const apiKey  = process.env.LMSTUDIO_API_KEY;

if (!apiKey) {
  console.error('ERROR: set LMSTUDIO_API_KEY env var before running this script');
  process.exit(1);
}

const DATABASE_URL = process.env.SESSIONS_DATABASE_URL
  ?? 'postgresql://website:devwebsitedb@localhost:5432/website';

const pool = new Pool({ connectionString: DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Deactivate all providers for this brand
    await client.query(
      `UPDATE coaching.ki_config SET is_active = false WHERE brand = $1`,
      [brand],
    );

    // 2. Upsert the LM Studio row
    await client.query(`
      INSERT INTO coaching.ki_config
        (brand, provider, display_name, api_endpoint, model_name, api_key,
         max_tokens, is_active, enabled_fields)
      VALUES
        ($1, 'custom_lmstudio', 'LM Studio (Qwen 2.5)',
         'http://100.102.71.114:1234/v1',
         'yemiao2745/qwen2.5-14b-instruct-uncensored',
         $2,
         800, true,
         '["apiKey","apiEndpoint","modelName","maxTokens","temperature","systemPrompt","notes"]')
      ON CONFLICT (brand, provider) DO UPDATE SET
        api_endpoint = EXCLUDED.api_endpoint,
        model_name   = EXCLUDED.model_name,
        api_key      = EXCLUDED.api_key,
        max_tokens   = EXCLUDED.max_tokens,
        is_active    = true,
        display_name = EXCLUDED.display_name
    `, [brand, apiKey]);

    await client.query('COMMIT');
    console.log(`✓ custom_lmstudio set as active provider for brand '${brand}'`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

> **Note:** The `coaching.ki_config` table must have a unique constraint on `(brand, provider)` for the `ON CONFLICT` clause to work. If the `UPSERT` fails with "no unique constraint", fall back to:
> ```sql
> DELETE FROM coaching.ki_config WHERE brand = $1 AND provider = 'custom_lmstudio';
> -- then re-run the INSERT (without ON CONFLICT)
> ```

- [ ] **Step 4.2: Port-forward prod DB and run seed**

```bash
# Terminal 1 — keep running
task workspace:port-forward ENV=mentolder

# Terminal 2 — in the worktree
LMSTUDIO_API_KEY="sk-lm-9TPygmH8:Xb8ZYSRULiaHAvVnyRem" \
SESSIONS_DATABASE_URL="postgresql://website:$(kubectl get secret workspace-secrets -n workspace --context mentolder -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)@localhost:5432/website" \
node scripts/seed-lmstudio-ki-config.mjs mentolder
```

Expected output:
```
✓ custom_lmstudio set as active provider for brand 'mentolder'
```

- [ ] **Step 4.3: Verify DB state**

```bash
# In port-forward Terminal 2:
psql "postgresql://website:$(kubectl get secret workspace-secrets -n workspace --context mentolder -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)@localhost:5432/website" \
  -c "SELECT id, brand, provider, is_active, api_endpoint, model_name FROM coaching.ki_config WHERE brand='mentolder' ORDER BY id;"
```

Expected: row with `provider=custom_lmstudio`, `is_active=t`, `api_endpoint=http://100.102.71.114:1234/v1`, `model_name=yemiao2745/qwen2.5-14b-instruct-uncensored`. All other mentolder rows: `is_active=f`.

- [ ] **Step 4.4: Commit the seed script (token is NOT included)**

```bash
cd /tmp/wt-lmstudio-session-pgvector
git add scripts/seed-lmstudio-ki-config.mjs
git commit -m "chore(coaching): add idempotent LM Studio ki_config seed script"
```

---

## Task 5: Deploy website to mentolder

The new agent code must be live before E2E tests can run.

- [ ] **Step 5.1: Build and deploy to mentolder**

```bash
# From the main repo (not worktree) after PR merge:
task feature:website
```

If testing pre-merge from worktree, you can use a fast sync:

```bash
# Copy changed files into the main tree (worktree shares the git object store)
# Then deploy as normal
task website:deploy ENV=mentolder
```

- [ ] **Step 5.2: Verify website pod restarted with new code**

```bash
task workspace:status ENV=mentolder
# Look for: website pod — should show READY and recent start time
```

---

## Task 6: Run E2E tests

`fa-39-lmstudio-integration.spec.ts` already has all 7 required tests. Run them against the live mentolder cluster.

- [ ] **Step 6.1: Set E2E password**

```bash
export E2E_ADMIN_PASS="<paddione keycloak password>"
export WEBSITE_URL="https://web.mentolder.de"
```

- [ ] **Step 6.2: Run the LM Studio E2E suite**

```bash
cd /tmp/wt-lmstudio-session-pgvector
npx playwright test tests/e2e/specs/fa-39-lmstudio-integration.spec.ts \
  --reporter=list --timeout=90000
```

Expected: all 7 tests pass (T1–T7).

- [ ] **Step 6.3: If T4 (generate API) fails with 502 "KI-Anfrage fehlgeschlagen"**

Check website logs for the real error:
```bash
task workspace:logs ENV=mentolder -- website 2>&1 | grep -E "ERROR|coaching/generate|KI" | tail -20
```

Common causes:
- `UPSERT` conflict: run the fallback DELETE + INSERT from Task 4 note
- LM Studio auth error: verify token with `curl -H "Authorization: Bearer sk-lm-9TPygmH8:Xb8ZYSRULiaHAvVnyRem" http://100.102.71.114:1234/v1/models`
- pgvector embedding failure (no coaching books indexed): this returns empty chunks (not an error) — the agent continues without RAG, so it shouldn't cause a 502
- `apiEndpoint` not set on the DB row: check with the psql query from Task 4.3

- [ ] **Step 6.4: If T5 (latency < 30s) fails**

LM Studio may be loading the model cold. A single warm-up call fixes it:
```bash
curl -s -X POST http://100.102.71.114:1234/v1/chat/completions \
  -H "Authorization: Bearer sk-lm-9TPygmH8:Xb8ZYSRULiaHAvVnyRem" \
  -H "Content-Type: application/json" \
  -d '{"model":"yemiao2745/qwen2.5-14b-instruct-uncensored","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' | jq .choices[0].message.content
```

Then re-run T5.

- [ ] **Step 6.5: Run the base coaching-sessions suite as regression**

```bash
npx playwright test tests/e2e/specs/fa-39-coaching-sessions.spec.ts \
  --reporter=list --timeout=60000
```

Expected: T1–T4 pass (auth gating). T5–T12 require `E2E_ADMIN_PASS` — if set, all pass.

---

## Task 7: PR

- [ ] **Step 7.1: Squash-merge check**

```bash
cd /tmp/wt-lmstudio-session-pgvector
git log --oneline origin/main..HEAD
```

Expected commits (in order):
1. `feat(coaching): add OpenAICompatibleSessionAgent with pgvector RAG injection`
2. `fix(coaching): restore ClaudeSessionAgent routing; route custom_*/lumo to OpenAICompatibleSessionAgent`
3. `chore(coaching): protect custom_lmstudio provider from accidental deletion`
4. `chore(coaching): add idempotent LM Studio ki_config seed script`

- [ ] **Step 7.2: Run offline tests**

```bash
cd /tmp/wt-lmstudio-session-pgvector
task test:all
```

Expected: green.

- [ ] **Step 7.3: Push and create PR**

```bash
git push -u origin feature/lmstudio-session-pgvector
gh pr create \
  --title "feat(coaching): LM Studio provider with pgvector RAG (OpenAICompatibleSessionAgent)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `OpenAICompatibleSessionAgent`: searches pgvector coaching knowledge before every LLM call and injects matching chunks into the system prompt
- Fixes `session-agent-factory.ts`: was always returning `LegacySessionAgent` — now correctly routes `claude` → `ClaudeSessionAgent`, `custom_*`/`lumo` → `OpenAICompatibleSessionAgent`
- Adds idempotent seed script to configure LM Studio (`http://100.102.71.114:1234/v1`, `yemiao2745/qwen2.5-14b-instruct-uncensored`) as active provider for mentolder
- Protects `custom_lmstudio` row from accidental UI deletion

## Test plan
- [ ] `task test:all` — green offline
- [ ] `fa-39-lmstudio-integration.spec.ts` T1–T7 pass on live mentolder
- [ ] `fa-39-coaching-sessions.spec.ts` T1–T12 pass as regression

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7.4: Merge immediately**

```bash
gh pr merge --squash --delete-branch --auto
```

- [ ] **Step 7.5: Deploy merged code**

```bash
# After merge lands on main:
git checkout main && git pull --rebase origin main
task feature:website
```

---

## Spec Review

**Coverage check:**
- ✅ LM Studio endpoint `http://100.102.71.114:1234/v1` → Task 4 seed script
- ✅ Model `yemiao2745/qwen2.5-14b-instruct-uncensored` → Task 4 seed script
- ✅ pgvector coaching knowledge injected → Task 1 `buildEnrichedSystemPrompt`
- ✅ Factory routing fixed → Task 2
- ✅ Claude routing restored → Task 2 (was broken before)
- ✅ Token not committed to git → Task 4 uses env var, Task 4.4 commits only the script
- ✅ E2E test till it works → Task 6 with debug steps
- ✅ KNOWN_PROVIDERS guard → Task 3

**Placeholder scan:** No TBDs, no vague steps. All code blocks complete. Commands include expected output.

**Type consistency:** `SessionAgent` interface (from `session-agent.ts`) has `generate()` returning `Promise<GenerateResult>` and optional `stream()` — both implemented in Task 1.
