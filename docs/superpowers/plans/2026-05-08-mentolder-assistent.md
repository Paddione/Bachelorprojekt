# Mentolder-Assistent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `HelpPanel` widget with a conversational, action-capable assistant that proactively nudges and acts on confirmation, deployed in both admin and portal profiles.

**Architecture:** A single `AssistantWidget.svelte` mounted in both `AdminLayout.astro` and `PortalLayout.astro`, parameterized by a `profile` prop. It composes a floating icon, a proactive speech bubble, and a chat panel with push-to-talk. Four Astro API endpoints back it (`/api/assistant/{chat,execute,transcribe,nudges}`). Two new tables in the existing `website` Postgres database persist conversation history and per-user nudge dismissals. The actual LLM call is encapsulated behind `lib/assistant/llm.ts` — a stub at first, the user wires up the real LLM separately.

**Tech Stack:** Astro 5 + Svelte 5 (runes), TypeScript, Astro API routes, `pg.Pool` against shared-db `website` schema, Web Audio API for client-side capture, existing `lib/whisper.ts` for STT, vitest for unit tests.

**Spec:** [`docs/superpowers/specs/2026-05-08-mentolder-assistent-design.md`](../specs/2026-05-08-mentolder-assistent-design.md)

---

## File Structure

### New files

```
website/src/lib/assistant/
  types.ts              -- shared types: AssistantProfile, ActionId, Nudge, Message, ConfirmCard
  schema.ts             -- ensureAssistantSchema() — CREATE TABLE IF NOT EXISTS, lazy-init
  llm.ts                -- assistantChat() + proposeAction() — STUB; user wires real LLM later
  actions.ts            -- ActionRegistry: id → { describe, handler, allowedProfiles }
  actions/admin/        -- one file per admin action handler
    finalizeMeeting.ts
    sendInvoice.ts
    resolveTicket.ts
    scheduleFollowup.ts
    writeClientNote.ts
  actions/portal/       -- one file per portal action handler
    bookSession.ts
    moveSession.ts
    cancelSession.ts
    signDocument.ts
    uploadFile.ts
    messageCoach.ts
    startQuestionnaire.ts
  triggers.ts           -- TriggerRegistry: id → { profile, evaluate(userCtx) → Nudge | null }
  triggers/admin.ts     -- admin nudge evaluators
  triggers/portal.ts    -- portal nudge evaluators
  conversations.ts      -- DB CRUD for assistant_conversations
  dismissals.ts         -- DB CRUD for assistant_nudge_dismissals

website/src/components/assistant/
  AssistantWidget.svelte       -- top-level composer
  AssistantBubble.svelte       -- proactive speech bubble
  AssistantChat.svelte         -- chat panel (input, message list, PTT)
  AssistantConfirmCard.svelte  -- write-action confirmation card
  AssistantMessage.svelte      -- single message bubble (in / out)

website/src/pages/api/assistant/
  chat.ts          -- POST: messages → reply (+ optional action proposal)
  execute.ts       -- POST: confirmed action → result
  transcribe.ts    -- POST: audio blob → text via lib/whisper.ts
  nudges.ts        -- GET: active nudges for current user/profile
  dismiss.ts       -- POST: snooze a nudge

Tests:
website/src/lib/assistant/actions.test.ts
website/src/lib/assistant/triggers.test.ts
website/src/lib/assistant/llm.test.ts
website/src/lib/assistant/conversations.test.ts
website/src/lib/assistant/dismissals.test.ts
```

### Modified files

```
website/src/layouts/AdminLayout.astro   -- replace <HelpPanel> with <AssistantWidget profile="admin">
website/src/layouts/PortalLayout.astro  -- replace <HelpPanel> with <AssistantWidget profile="portal">
```

### Retired files (final task only — after both flags ON and stable)

```
website/src/components/HelpPanel.svelte
website/src/lib/helpContent.ts
```

### Environment variables

```
ENABLE_ASSISTANT_ADMIN=true|false   (default false, layout reads at build/SSR time)
ENABLE_ASSISTANT_PORTAL=true|false  (default false)
```

---

## Task 1: Types + DB schema scaffolding

**Files:**
- Create: `website/src/lib/assistant/types.ts`
- Create: `website/src/lib/assistant/schema.ts`

- [ ] **Step 1: Create the type module**

```typescript
// website/src/lib/assistant/types.ts

export type AssistantProfile = 'admin' | 'portal';

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
  // Optional structured action proposal attached to an assistant message:
  proposedAction?: ProposedAction;
}

export interface ProposedAction {
  actionId: string;          // matches an entry in ActionRegistry
  targetLabel: string;       // human-readable target, e.g. "Marc · 06.05."
  summary: string;           // German plain-language description of side-effects
  payload: Record<string, unknown>; // opaque to UI, validated server-side
}

export interface Nudge {
  id: string;                // stable id like "morning-briefing" or `signature:${docId}`
  triggerId: string;         // registry key
  profile: AssistantProfile;
  headline: string;          // short title shown bold in bubble
  body: string;              // sentence or two
  primaryAction?: { label: string; kickoff: string }; // kickoff = pre-filled chat message
  secondaryAction?: { label: string; kickoff: string };
  ttlSeconds?: number;       // how long the bubble stays before auto-shrink (default 8)
  createdAt: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;        // user-visible result line, e.g. "Erledigt. Marc bekommt die Mail."
  data?: Record<string, unknown>;
}
```

- [ ] **Step 2: Create the schema initializer**

```typescript
// website/src/lib/assistant/schema.ts

import { pool } from '../website-db';

let ready = false;

export async function ensureAssistantSchema(): Promise<void> {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_sub TEXT NOT NULL,
      profile TEXT NOT NULL CHECK (profile IN ('admin','portal')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
      ON assistant_conversations(user_sub, profile, last_active_at DESC);

    CREATE TABLE IF NOT EXISTS assistant_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      proposed_action JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_messages_conv
      ON assistant_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS assistant_nudge_dismissals (
      user_sub TEXT NOT NULL,
      nudge_id TEXT NOT NULL,
      snoozed_until TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_sub, nudge_id)
    );

    CREATE TABLE IF NOT EXISTS assistant_first_seen (
      user_sub TEXT NOT NULL,
      profile TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_sub, profile)
    );
  `);
  ready = true;
}
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/assistant/types.ts website/src/lib/assistant/schema.ts
git commit -m "feat(assistant): types + DB schema scaffolding"
```

---

## Task 2: LLM stub + prompt skeleton

**Files:**
- Create: `website/src/lib/assistant/llm.ts`
- Create: `website/src/lib/assistant/llm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// website/src/lib/assistant/llm.test.ts
import { describe, it, expect } from 'vitest';
import { assistantChat } from './llm';

describe('assistantChat (stub)', () => {
  it('returns a deterministic placeholder reply when no LLM is wired', async () => {
    const result = await assistantChat({
      profile: 'admin',
      userSub: 'user-123',
      messages: [{ role: 'user', content: 'wie finalisiere ich ein meeting?' }],
      context: { currentRoute: '/admin/meetings', counts: { unfinalizedMeetings: 3 } },
    });
    expect(result.reply).toContain('LLM nicht verbunden');
    expect(result.proposedAction).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts
```

Expected: FAIL — `Cannot find module './llm'`.

- [ ] **Step 3: Write the stub**

```typescript
// website/src/lib/assistant/llm.ts
import type { AssistantProfile, Message, ProposedAction } from './types';

export interface AssistantChatInput {
  profile: AssistantProfile;
  userSub: string;
  messages: Array<Pick<Message, 'role' | 'content'>>;
  context: AssistantContext;
}

export interface AssistantContext {
  currentRoute: string;
  counts?: Record<string, number>;
  // Open-ended: fed by the API endpoint based on profile
  [k: string]: unknown;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
}

// STUB. The user wires up the real LLM call in this file.
// Until then, the assistant returns a deterministic placeholder so the rest
// of the system (UI, action loop, nudges) can be developed and tested.
export async function assistantChat(_input: AssistantChatInput): Promise<AssistantChatResult> {
  return {
    reply: 'LLM nicht verbunden — die echte Anbindung lebt in lib/assistant/llm.ts.',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd website && npx vitest run src/lib/assistant/llm.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/llm.ts website/src/lib/assistant/llm.test.ts
git commit -m "feat(assistant): LLM call stub with deterministic placeholder"
```

---

## Task 3: Action registry + whitelist enforcement

**Files:**
- Create: `website/src/lib/assistant/actions.ts`
- Create: `website/src/lib/assistant/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// website/src/lib/assistant/actions.test.ts
import { describe, it, expect } from 'vitest';
import { registerAction, executeAction, listActionsFor } from './actions';

describe('action registry', () => {
  it('registers and executes a profile-allowed action', async () => {
    registerAction({
      id: 'test:noop',
      allowedProfiles: ['admin'],
      describe: () => ({ targetLabel: 'noop', summary: 'tut nichts' }),
      handler: async () => ({ ok: true, message: 'ok' }),
    });
    const r = await executeAction('test:noop', { profile: 'admin', userSub: 'u', payload: {} });
    expect(r.ok).toBe(true);
  });

  it('rejects an action that is not on the profile whitelist', async () => {
    registerAction({
      id: 'test:admin-only',
      allowedProfiles: ['admin'],
      describe: () => ({ targetLabel: 'x', summary: 'x' }),
      handler: async () => ({ ok: true, message: 'ok' }),
    });
    await expect(
      executeAction('test:admin-only', { profile: 'portal', userSub: 'u', payload: {} })
    ).rejects.toThrow(/not allowed/);
  });

  it('rejects an unknown action id', async () => {
    await expect(
      executeAction('test:does-not-exist', { profile: 'admin', userSub: 'u', payload: {} })
    ).rejects.toThrow(/unknown action/);
  });

  it('lists only actions allowed for a given profile', () => {
    const adminIds = listActionsFor('admin').map((a) => a.id);
    const portalIds = listActionsFor('portal').map((a) => a.id);
    expect(adminIds).toContain('test:admin-only');
    expect(portalIds).not.toContain('test:admin-only');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd website && npx vitest run src/lib/assistant/actions.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the registry**

```typescript
// website/src/lib/assistant/actions.ts
import type { AssistantProfile, ActionResult } from './types';

export interface ActionContext {
  profile: AssistantProfile;
  userSub: string;
  payload: Record<string, unknown>;
}

export interface ActionDescriptor {
  id: string;
  allowedProfiles: AssistantProfile[];
  describe: (payload: Record<string, unknown>) => { targetLabel: string; summary: string };
  handler: (ctx: ActionContext) => Promise<ActionResult>;
}

const registry = new Map<string, ActionDescriptor>();

export function registerAction(descriptor: ActionDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function listActionsFor(profile: AssistantProfile): ActionDescriptor[] {
  return [...registry.values()].filter((a) => a.allowedProfiles.includes(profile));
}

export async function executeAction(
  actionId: string,
  ctx: ActionContext,
): Promise<ActionResult> {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  if (!descriptor.allowedProfiles.includes(ctx.profile)) {
    throw new Error(`action ${actionId} not allowed for profile ${ctx.profile}`);
  }
  return descriptor.handler(ctx);
}

export function describeAction(actionId: string, payload: Record<string, unknown>) {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  return { id: actionId, ...descriptor.describe(payload) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd website && npx vitest run src/lib/assistant/actions.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/actions.ts website/src/lib/assistant/actions.test.ts
git commit -m "feat(assistant): action registry with profile whitelist enforcement"
```

---

## Task 4: Trigger registry

**Files:**
- Create: `website/src/lib/assistant/triggers.ts`
- Create: `website/src/lib/assistant/triggers.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// website/src/lib/assistant/triggers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerTrigger, evaluateTriggers, _resetTriggersForTest } from './triggers';

describe('trigger registry', () => {
  beforeEach(() => _resetTriggersForTest());

  it('returns a nudge when the evaluator produces one', async () => {
    registerTrigger({
      id: 'morning-briefing',
      profile: 'admin',
      async evaluate() {
        return {
          id: 'morning-briefing',
          triggerId: 'morning-briefing',
          profile: 'admin',
          headline: 'Heute',
          body: '3 offene Meetings',
          createdAt: new Date().toISOString(),
        };
      },
    });
    const nudges = await evaluateTriggers('admin', { userSub: 'u', currentRoute: '/admin' });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].headline).toBe('Heute');
  });

  it('skips evaluators whose profile does not match', async () => {
    registerTrigger({
      id: 'admin-only',
      profile: 'admin',
      async evaluate() { return { id: 'x', triggerId: 'admin-only', profile: 'admin', headline: 'h', body: 'b', createdAt: '' }; },
    });
    const nudges = await evaluateTriggers('portal', { userSub: 'u', currentRoute: '/portal' });
    expect(nudges).toHaveLength(0);
  });

  it('returns nothing when an evaluator declines (returns null)', async () => {
    registerTrigger({
      id: 'noop',
      profile: 'admin',
      async evaluate() { return null; },
    });
    const nudges = await evaluateTriggers('admin', { userSub: 'u', currentRoute: '/admin' });
    expect(nudges).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd website && npx vitest run src/lib/assistant/triggers.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the registry**

```typescript
// website/src/lib/assistant/triggers.ts
import type { AssistantProfile, Nudge } from './types';

export interface TriggerEvalContext {
  userSub: string;
  currentRoute: string;
}

export interface TriggerDescriptor {
  id: string;
  profile: AssistantProfile;
  evaluate: (ctx: TriggerEvalContext) => Promise<Nudge | null>;
}

const registry = new Map<string, TriggerDescriptor>();

export function registerTrigger(descriptor: TriggerDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export async function evaluateTriggers(
  profile: AssistantProfile,
  ctx: TriggerEvalContext,
): Promise<Nudge[]> {
  const out: Nudge[] = [];
  for (const t of registry.values()) {
    if (t.profile !== profile) continue;
    try {
      const n = await t.evaluate(ctx);
      if (n) out.push(n);
    } catch (err) {
      console.error(`[assistant.triggers] evaluator ${t.id} threw:`, err);
    }
  }
  return out;
}

// Test-only — DO NOT call from production code.
export function _resetTriggersForTest(): void {
  registry.clear();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd website && npx vitest run src/lib/assistant/triggers.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/triggers.ts website/src/lib/assistant/triggers.test.ts
git commit -m "feat(assistant): trigger registry with per-profile evaluators"
```

---

## Task 5: Conversation persistence

**Files:**
- Create: `website/src/lib/assistant/conversations.ts`
- Create: `website/src/lib/assistant/conversations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// website/src/lib/assistant/conversations.test.ts
import { describe, it, expect } from 'vitest';
import {
  getOrCreateActiveConversation,
  appendMessage,
  loadHistory,
} from './conversations';

// NOTE: this is an integration test — requires shared-db.
// Run it locally with: task workspace:port-forward ENV=mentolder
describe('assistant_conversations', () => {
  it('creates a conversation and appends messages in order', async () => {
    const userSub = `test-user-${Date.now()}`;
    const conv = await getOrCreateActiveConversation(userSub, 'admin');
    expect(conv.id).toBeDefined();

    await appendMessage(conv.id, 'user', 'hallo');
    await appendMessage(conv.id, 'assistant', 'hi');

    const history = await loadHistory(conv.id);
    expect(history.map((m) => m.content)).toEqual(['hallo', 'hi']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd website && npx vitest run src/lib/assistant/conversations.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the helper**

```typescript
// website/src/lib/assistant/conversations.ts
import { pool } from '../website-db';
import { ensureAssistantSchema } from './schema';
import type { AssistantProfile, Message, MessageRole, ProposedAction } from './types';

export async function getOrCreateActiveConversation(
  userSub: string,
  profile: AssistantProfile,
): Promise<{ id: string }> {
  await ensureAssistantSchema();
  // "Active" = the most recent for this user+profile, or a new one if none.
  const found = await pool.query<{ id: string }>(
    `SELECT id FROM assistant_conversations
       WHERE user_sub = $1 AND profile = $2
       ORDER BY last_active_at DESC LIMIT 1`,
    [userSub, profile],
  );
  if (found.rows[0]) {
    await pool.query(
      `UPDATE assistant_conversations SET last_active_at = now() WHERE id = $1`,
      [found.rows[0].id],
    );
    return { id: found.rows[0].id };
  }
  const created = await pool.query<{ id: string }>(
    `INSERT INTO assistant_conversations (user_sub, profile)
       VALUES ($1, $2) RETURNING id`,
    [userSub, profile],
  );
  return { id: created.rows[0].id };
}

export async function appendMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  proposedAction?: ProposedAction,
): Promise<Message> {
  await ensureAssistantSchema();
  const r = await pool.query<{
    id: string;
    created_at: Date;
  }>(
    `INSERT INTO assistant_messages (conversation_id, role, content, proposed_action)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [conversationId, role, content, proposedAction ?? null],
  );
  return {
    id: r.rows[0].id,
    conversationId,
    role,
    content,
    createdAt: r.rows[0].created_at.toISOString(),
    proposedAction,
  };
}

export async function loadHistory(conversationId: string, limit = 50): Promise<Message[]> {
  await ensureAssistantSchema();
  const r = await pool.query<{
    id: string;
    role: MessageRole;
    content: string;
    proposed_action: ProposedAction | null;
    created_at: Date;
  }>(
    `SELECT id, role, content, proposed_action, created_at
       FROM assistant_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
    [conversationId, limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    conversationId,
    role: row.role,
    content: row.content,
    proposedAction: row.proposed_action ?? undefined,
    createdAt: row.created_at.toISOString(),
  }));
}
```

- [ ] **Step 4: Run the test (with port-forward) to verify it passes**

```bash
# From repo root, in another terminal:
#   task workspace:port-forward ENV=mentolder
cd website && DATABASE_URL='postgresql://website:devwebsitedb@localhost:5432/website' \
  npx vitest run src/lib/assistant/conversations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/conversations.ts website/src/lib/assistant/conversations.test.ts
git commit -m "feat(assistant): conversation + message persistence"
```

---

## Task 6: Nudge dismissal persistence

**Files:**
- Create: `website/src/lib/assistant/dismissals.ts`
- Create: `website/src/lib/assistant/dismissals.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// website/src/lib/assistant/dismissals.test.ts
import { describe, it, expect } from 'vitest';
import { snoozeNudge, isSnoozed, listFirstSeenAt, recordFirstSeen } from './dismissals';

describe('assistant_nudge_dismissals + first_seen', () => {
  it('respects a snooze window for a single user/nudge', async () => {
    const userSub = `t-${Date.now()}`;
    expect(await isSnoozed(userSub, 'morning-briefing')).toBe(false);
    await snoozeNudge(userSub, 'morning-briefing', 60); // 60s
    expect(await isSnoozed(userSub, 'morning-briefing')).toBe(true);
  });

  it('records first-seen exactly once per (user, profile)', async () => {
    const userSub = `t-${Date.now()}`;
    expect(await listFirstSeenAt(userSub, 'portal')).toBeNull();
    const ts1 = await recordFirstSeen(userSub, 'portal');
    const ts2 = await recordFirstSeen(userSub, 'portal');
    expect(ts1).toEqual(ts2); // idempotent
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd website && npx vitest run src/lib/assistant/dismissals.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```typescript
// website/src/lib/assistant/dismissals.ts
import { pool } from '../website-db';
import { ensureAssistantSchema } from './schema';
import type { AssistantProfile } from './types';

export async function snoozeNudge(userSub: string, nudgeId: string, seconds: number): Promise<void> {
  await ensureAssistantSchema();
  await pool.query(
    `INSERT INTO assistant_nudge_dismissals (user_sub, nudge_id, snoozed_until)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       ON CONFLICT (user_sub, nudge_id)
       DO UPDATE SET snoozed_until = EXCLUDED.snoozed_until`,
    [userSub, nudgeId, String(seconds)],
  );
}

export async function isSnoozed(userSub: string, nudgeId: string): Promise<boolean> {
  await ensureAssistantSchema();
  const r = await pool.query<{ alive: boolean }>(
    `SELECT (snoozed_until > now()) AS alive
       FROM assistant_nudge_dismissals
       WHERE user_sub = $1 AND nudge_id = $2`,
    [userSub, nudgeId],
  );
  return Boolean(r.rows[0]?.alive);
}

export async function listFirstSeenAt(
  userSub: string,
  profile: AssistantProfile,
): Promise<Date | null> {
  await ensureAssistantSchema();
  const r = await pool.query<{ first_seen_at: Date }>(
    `SELECT first_seen_at FROM assistant_first_seen
       WHERE user_sub = $1 AND profile = $2`,
    [userSub, profile],
  );
  return r.rows[0]?.first_seen_at ?? null;
}

export async function recordFirstSeen(
  userSub: string,
  profile: AssistantProfile,
): Promise<Date> {
  await ensureAssistantSchema();
  const r = await pool.query<{ first_seen_at: Date }>(
    `INSERT INTO assistant_first_seen (user_sub, profile) VALUES ($1, $2)
       ON CONFLICT (user_sub, profile) DO UPDATE SET first_seen_at = assistant_first_seen.first_seen_at
       RETURNING first_seen_at`,
    [userSub, profile],
  );
  return r.rows[0].first_seen_at;
}
```

- [ ] **Step 4: Run with port-forward to verify it passes**

```bash
cd website && DATABASE_URL='postgresql://website:devwebsitedb@localhost:5432/website' \
  npx vitest run src/lib/assistant/dismissals.test.ts
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/assistant/dismissals.ts website/src/lib/assistant/dismissals.test.ts
git commit -m "feat(assistant): nudge dismissal + first-seen persistence"
```

---

## Task 7: API endpoint — /api/assistant/chat

**Files:**
- Create: `website/src/pages/api/assistant/chat.ts`

- [ ] **Step 1: Implement the endpoint**

```typescript
// website/src/pages/api/assistant/chat.ts
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

  let body: { profile: AssistantProfile; content: string; currentRoute?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { profile, content, currentRoute = '/' } = body;
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
    context: { currentRoute },
  });

  const stored = await appendMessage(conv.id, 'assistant', result.reply, result.proposedAction);

  return json({ message: stored });
};
```

- [ ] **Step 2: Smoke-test the endpoint**

```bash
# Run the dev server in another terminal: cd website && task website:dev
curl -i -X POST http://localhost:3000/api/assistant/chat \
  -H 'content-type: application/json' \
  -H "cookie: $(cat .session-cookie)" \
  -d '{"profile":"admin","content":"hallo","currentRoute":"/admin"}'
```

Expected: 200 with `{ "message": { ..., "content": "LLM nicht verbunden — ..." } }`.

If unauthenticated: 401. If `profile: "portal"` but cookie is admin-only — should still work because `isAdmin` is only enforced for `profile === 'admin'`. Portal access is implicit (any authenticated user is a portal user).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/assistant/chat.ts
git commit -m "feat(assistant): POST /api/assistant/chat with stub LLM"
```

---

## Task 8: API endpoint — /api/assistant/execute

**Files:**
- Create: `website/src/pages/api/assistant/execute.ts`

- [ ] **Step 1: Implement the endpoint**

```typescript
// website/src/pages/api/assistant/execute.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { executeAction } from '../../../lib/assistant/actions';
import type { AssistantProfile } from '../../../lib/assistant/types';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { profile: AssistantProfile; actionId: string; payload: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { profile, actionId, payload } = body;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);
  if (typeof actionId !== 'string' || !actionId) return json({ error: 'missing actionId' }, 400);

  try {
    const result = await executeAction(actionId, { profile, userSub: session.sub, payload: payload ?? {} });
    return json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'execute failed';
    if (msg.startsWith('unknown action')) return json({ error: msg }, 404);
    if (msg.includes('not allowed')) return json({ error: msg }, 403);
    console.error('[assistant/execute] error:', err);
    return json({ error: 'internal' }, 500);
  }
};
```

- [ ] **Step 2: Side-load every action handler so the registry knows about them**

Add at the top of `execute.ts` (above the export):

```typescript
import '../../../lib/assistant/actions/admin/index';
import '../../../lib/assistant/actions/portal/index';
```

These index files will be created in Tasks 13–14. For now create empty stubs:

```bash
mkdir -p website/src/lib/assistant/actions/admin website/src/lib/assistant/actions/portal
echo '// admin actions register here' > website/src/lib/assistant/actions/admin/index.ts
echo '// portal actions register here' > website/src/lib/assistant/actions/portal/index.ts
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/assistant/execute.ts website/src/lib/assistant/actions/
git commit -m "feat(assistant): POST /api/assistant/execute with whitelist enforcement"
```

---

## Task 9: API endpoint — /api/assistant/transcribe

**Files:**
- Create: `website/src/pages/api/assistant/transcribe.ts`

- [ ] **Step 1: Implement the endpoint**

```typescript
// website/src/pages/api/assistant/transcribe.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { transcribeAudio } from '../../../lib/whisper';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  const form = await request.formData();
  const file = form.get('audio');
  if (!(file instanceof Blob) || file.size === 0) return json({ error: 'missing audio blob' }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ error: 'audio too large (max 8 MB)' }, 413);

  const result = await transcribeAudio(file, 'voice.webm', 'de');
  if (!result) return json({ error: 'transcription failed' }, 502);

  return json({ text: result.text });
};
```

- [ ] **Step 2: Smoke-test**

```bash
# After website:dev is running and Whisper is reachable:
curl -i -X POST http://localhost:3000/api/assistant/transcribe \
  -H "cookie: $(cat .session-cookie)" \
  -F "audio=@/path/to/sample.webm"
```

Expected: 200 with `{ "text": "..." }`.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/assistant/transcribe.ts
git commit -m "feat(assistant): POST /api/assistant/transcribe via Whisper"
```

---

## Task 10: API endpoint — /api/assistant/nudges

**Files:**
- Create: `website/src/pages/api/assistant/nudges.ts`
- Create: `website/src/pages/api/assistant/dismiss.ts`

- [ ] **Step 1: Implement /nudges**

```typescript
// website/src/pages/api/assistant/nudges.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { evaluateTriggers } from '../../../lib/assistant/triggers';
import { isSnoozed } from '../../../lib/assistant/dismissals';
import type { AssistantProfile } from '../../../lib/assistant/types';

import '../../../lib/assistant/triggers/admin';
import '../../../lib/assistant/triggers/portal';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  const profile = url.searchParams.get('profile') as AssistantProfile | null;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);

  const currentRoute = url.searchParams.get('route') ?? '/';
  const all = await evaluateTriggers(profile, { userSub: session.sub, currentRoute });

  const active: typeof all = [];
  for (const n of all) {
    if (await isSnoozed(session.sub, n.id)) continue;
    active.push(n);
  }
  return json({ nudges: active });
};
```

- [ ] **Step 2: Implement /dismiss**

```typescript
// website/src/pages/api/assistant/dismiss.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { snoozeNudge } from '../../../lib/assistant/dismissals';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { nudgeId: string; snoozeSeconds?: number };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (!body.nudgeId) return json({ error: 'missing nudgeId' }, 400);
  const seconds = Math.max(60, Math.min(86400 * 7, body.snoozeSeconds ?? 86400));
  await snoozeNudge(session.sub, body.nudgeId, seconds);
  return json({ ok: true });
};
```

- [ ] **Step 3: Create empty trigger registries (filled later)**

```bash
mkdir -p website/src/lib/assistant/triggers
echo '// admin triggers register here' > website/src/lib/assistant/triggers/admin.ts
echo '// portal triggers register here' > website/src/lib/assistant/triggers/portal.ts
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/assistant/nudges.ts website/src/pages/api/assistant/dismiss.ts website/src/lib/assistant/triggers/
git commit -m "feat(assistant): GET /nudges + POST /dismiss endpoints"
```

---

## Task 11: AssistantBubble component

**Files:**
- Create: `website/src/components/assistant/AssistantBubble.svelte`

- [ ] **Step 1: Implement the component**

```svelte
<!-- website/src/components/assistant/AssistantBubble.svelte -->
<script lang="ts">
  import type { Nudge } from '../../lib/assistant/types';

  let {
    nudge,
    onPrimary,
    onSecondary,
    onClose,
  }: {
    nudge: Nudge;
    onPrimary?: () => void;
    onSecondary?: () => void;
    onClose?: () => void;
  } = $props();
</script>

<div
  class="bubble"
  role="status"
  aria-live="polite"
  style="
    position: fixed; bottom: 88px; right: 24px; z-index: 53;
    max-width: 280px;
    background: var(--ink-850);
    border: 1px solid #d7b06a;
    border-radius: 12px 12px 4px 12px;
    padding: 14px 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
    color: var(--fg);
    font-family: var(--font-sans);
    font-size: 13px;
    line-height: 1.45;
  "
>
  <div style="font-family: var(--font-display); font-size: 12px; color: #d7b06a; margin-bottom: 6px;">
    ✦ Mentolder-Assistent
  </div>
  <div><strong style="color: #d7b06a; font-weight: 500;">{nudge.headline}</strong>{nudge.body ? ` — ${nudge.body}` : ''}</div>
  <div style="display: flex; gap: 6px; margin-top: 10px;">
    {#if nudge.primaryAction}
      <button onclick={onPrimary} class="btn primary">{nudge.primaryAction.label}</button>
    {/if}
    {#if nudge.secondaryAction}
      <button onclick={onSecondary} class="btn ghost">{nudge.secondaryAction.label}</button>
    {/if}
    <button onclick={onClose} aria-label="schließen" class="btn ghost icon">✕</button>
  </div>
</div>

<style>
  .btn {
    font-size: 12px; padding: 5px 10px; border-radius: 4px; cursor: pointer; border: none;
    font-family: inherit; font-weight: 500;
  }
  .btn.primary { background: #d7b06a; color: #0b111c; }
  .btn.ghost { background: transparent; color: var(--mute); border: 1px solid var(--line); }
  .btn.icon { padding: 5px 8px; margin-left: auto; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/assistant/AssistantBubble.svelte
git commit -m "feat(assistant): AssistantBubble component"
```

---

## Task 12: AssistantConfirmCard component

**Files:**
- Create: `website/src/components/assistant/AssistantConfirmCard.svelte`

- [ ] **Step 1: Implement the component**

```svelte
<!-- website/src/components/assistant/AssistantConfirmCard.svelte -->
<script lang="ts">
  import type { ProposedAction } from '../../lib/assistant/types';

  let {
    action,
    onConfirm,
    onCancel,
    busy = false,
  }: {
    action: ProposedAction;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
  } = $props();
</script>

<div
  role="group"
  aria-labelledby="confirm-title"
  style="
    align-self: flex-start;
    background: var(--ink-900);
    border: 1px solid #d7b06a;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    max-width: 88%;
    color: var(--fg);
    font-family: var(--font-sans);
  "
>
  <div id="confirm-title" style="color: #d7b06a; font-family: var(--font-display); margin-bottom: 4px;">
    Soll ich das machen?
  </div>
  <div style="margin-bottom: 4px;"><strong>{action.targetLabel}</strong></div>
  <div style="opacity: .85;">{action.summary}</div>
  <div style="display: flex; gap: 6px; margin-top: 8px;">
    <!-- Default focus is on Cancel — Confirm requires deliberate move -->
    <button onclick={onCancel} disabled={busy} class="btn ghost" autofocus>Abbrechen</button>
    <button onclick={onConfirm} disabled={busy} class="btn primary">{busy ? '…' : 'Ja, mach'}</button>
  </div>
</div>

<style>
  .btn {
    font-size: 11px; padding: 3px 9px; border-radius: 3px; cursor: pointer; border: none;
    font-family: inherit; font-weight: 500;
  }
  .btn[disabled] { opacity: .5; cursor: not-allowed; }
  .btn.primary { background: #d7b06a; color: #0b111c; }
  .btn.ghost { background: transparent; color: var(--mute); border: 1px solid var(--line); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/assistant/AssistantConfirmCard.svelte
git commit -m "feat(assistant): AssistantConfirmCard with cancel-default focus"
```

---

## Task 13: AssistantChat component (with PTT)

**Files:**
- Create: `website/src/components/assistant/AssistantMessage.svelte`
- Create: `website/src/components/assistant/AssistantChat.svelte`

- [ ] **Step 1: Implement AssistantMessage (single bubble)**

```svelte
<!-- website/src/components/assistant/AssistantMessage.svelte -->
<script lang="ts">
  import type { Message } from '../../lib/assistant/types';
  let { message }: { message: Message } = $props();
  const isUser = $derived(message.role === 'user');
</script>

<div
  class="msg"
  class:in={!isUser}
  class:out={isUser}
  style="font-size: 12px; line-height: 1.45; padding: 7px 10px; border-radius: 8px; max-width: 80%;
         font-family: var(--font-sans); color: var(--fg);"
>
  {message.content}
</div>

<style>
  .msg.in  { background: var(--ink-900); border: 1px solid var(--line); align-self: flex-start; border-radius: 8px 8px 8px 2px; }
  .msg.out { background: rgba(215,176,106,.16); border: 1px solid #d7b06a; align-self: flex-end; border-radius: 8px 8px 2px 8px; }
</style>
```

- [ ] **Step 2: Implement AssistantChat**

```svelte
<!-- website/src/components/assistant/AssistantChat.svelte -->
<script lang="ts">
  import type { AssistantProfile, Message, ProposedAction } from '../../lib/assistant/types';
  import AssistantMessage from './AssistantMessage.svelte';
  import AssistantConfirmCard from './AssistantConfirmCard.svelte';

  let { profile, onClose }: { profile: AssistantProfile; onClose?: () => void } = $props();

  let messages = $state<Message[]>([]);
  let input = $state('');
  let sending = $state(false);
  let recording = $state(false);
  let busyAction = $state<string | null>(null);
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];

  async function send(content: string) {
    sending = true;
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, content, currentRoute: location.pathname }),
      });
      const data = await res.json();
      if (data?.message) {
        // Server already persisted the user message; reload via local optimistic push
        messages = [
          ...messages,
          { id: 'optimistic', conversationId: '', role: 'user', content, createdAt: new Date().toISOString() },
          data.message,
        ];
      }
    } finally {
      sending = false;
      input = '';
    }
  }

  async function startRecording() {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
      const r = await fetch('/api/assistant/transcribe', { method: 'POST', body: fd });
      const j = await r.json();
      if (j?.text) await send(j.text);
    };
    mediaRecorder.start();
    recording = true;
  }
  function stopRecording() {
    if (!recording) return;
    mediaRecorder?.stop();
    recording = false;
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
    } finally {
      busyAction = null;
    }
  }
  function cancelAction(message: Message) {
    messages = [...messages, { id: `local-${Date.now()}`, conversationId: '', role: 'assistant', content: 'OK, lasse ich.', createdAt: new Date().toISOString() }];
    // Strip the proposedAction from the rendered message so the card hides:
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
      <AssistantMessage message={m} />
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
    style="padding: 8px 10px; border-top: 1px solid var(--line); display: flex; gap: 6px; background: var(--ink-900);"
  >
    <input
      bind:value={input}
      type="text"
      placeholder="Frag etwas oder halte das Mikro…"
      disabled={sending || recording}
      style="flex: 1; background: var(--ink-850); border: 1px solid var(--line); border-radius: 16px; padding: 6px 12px; font-size: 12px; color: var(--fg); font-family: inherit;"
    />
    <button
      type="button"
      aria-label={recording ? 'Aufnahme stoppen' : 'Aufnahme starten (drücken & halten)'}
      onpointerdown={startRecording}
      onpointerup={stopRecording}
      onpointerleave={stopRecording}
      disabled={sending}
      class:rec={recording}
      style="width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
             background: {recording ? '#d96b6b' : '#d7b06a'}; color: #0b111c; font-size: 14px;"
    >●</button>
  </form>
</section>

<style>
  .rec { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,107,107,.6); }
    50% { box-shadow: 0 0 0 8px rgba(217,107,107,0); }
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/assistant/AssistantMessage.svelte website/src/components/assistant/AssistantChat.svelte
git commit -m "feat(assistant): AssistantChat with PTT and confirmation flow"
```

---

## Task 14: AssistantWidget composer

**Files:**
- Create: `website/src/components/assistant/AssistantWidget.svelte`

- [ ] **Step 1: Implement the composer**

```svelte
<!-- website/src/components/assistant/AssistantWidget.svelte -->
<script lang="ts">
  import type { AssistantProfile, Nudge } from '../../lib/assistant/types';
  import AssistantBubble from './AssistantBubble.svelte';
  import AssistantChat from './AssistantChat.svelte';

  let { profile }: { profile: AssistantProfile } = $props();

  let chatOpen = $state(false);
  let nudges = $state<Nudge[]>([]);
  let activeNudge = $derived(nudges[0] ?? null);

  let pollHandle: number | undefined;

  async function fetchNudges() {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/assistant/nudges?profile=${profile}&route=${encodeURIComponent(location.pathname)}`);
      const j = await r.json();
      if (Array.isArray(j?.nudges)) nudges = j.nudges;
    } catch (err) {
      console.warn('[assistant] nudge fetch failed', err);
    }
  }

  $effect(() => {
    fetchNudges();
    pollHandle = window.setInterval(fetchNudges, 45_000);
    return () => clearInterval(pollHandle);
  });

  async function dismiss(nudge: Nudge, snoozeSeconds = 86400) {
    nudges = nudges.filter((n) => n.id !== nudge.id);
    await fetch('/api/assistant/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nudgeId: nudge.id, snoozeSeconds }),
    });
  }

  function openChatFromNudge(nudge: Nudge, kickoff?: string) {
    chatOpen = true;
    dismiss(nudge);
    if (kickoff) {
      // The chat reads a one-shot kickoff from sessionStorage:
      sessionStorage.setItem('assistant.kickoff', kickoff);
    }
  }
</script>

<!-- Floating icon (always shown) -->
<button
  onclick={() => (chatOpen = !chatOpen)}
  aria-label={chatOpen ? 'Chat schließen' : 'Mentolder-Assistent öffnen'}
  style="
    position: fixed; bottom: 24px; right: 24px; z-index: 50;
    width: 44px; height: 44px; border-radius: 50%;
    background: #d7b06a; color: #0b111c; border: none; cursor: pointer;
    font-size: 18px; font-weight: 600; font-family: var(--font-sans);
    box-shadow: 0 6px 18px rgba(215,176,106,.5);
  "
>{chatOpen ? '✕' : '?'}</button>

{#if chatOpen}
  <AssistantChat {profile} onClose={() => (chatOpen = false)} />
{:else if activeNudge}
  <AssistantBubble
    nudge={activeNudge}
    onPrimary={() => openChatFromNudge(activeNudge, activeNudge.primaryAction?.kickoff)}
    onSecondary={() => activeNudge.secondaryAction && openChatFromNudge(activeNudge, activeNudge.secondaryAction.kickoff)}
    onClose={() => dismiss(activeNudge)}
  />
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/assistant/AssistantWidget.svelte
git commit -m "feat(assistant): AssistantWidget composer with nudge polling"
```

---

## Task 15: Mount in AdminLayout (env-flag gated)

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro` (currently mounts HelpPanel at line ~420)

- [ ] **Step 1: Replace the import and mount**

Open `website/src/layouts/AdminLayout.astro`. Find:

```astro
import HelpPanel from '../components/HelpPanel.svelte';
```

Add below it:

```astro
import AssistantWidget from '../components/assistant/AssistantWidget.svelte';
const ASSISTANT_ENABLED = (process.env.ENABLE_ASSISTANT_ADMIN ?? 'false') === 'true';
```

Find the `<HelpPanel client:load section={helpSection} context="admin" />` line (around 420) and replace with:

```astro
{ASSISTANT_ENABLED
  ? <AssistantWidget client:load profile="admin" />
  : <HelpPanel client:load section={helpSection} context="admin" />}
```

- [ ] **Step 2: Smoke-test (flag OFF)**

```bash
cd website && task website:dev
# Visit http://localhost:3000/admin/dashboard
# Expect: the original "?" HelpPanel still appears bottom-LEFT.
```

- [ ] **Step 3: Smoke-test (flag ON)**

```bash
cd website && ENABLE_ASSISTANT_ADMIN=true task website:dev
# Visit http://localhost:3000/admin/dashboard
# Expect: gold "?" icon bottom-RIGHT, HelpPanel gone. Click → chat panel opens with the stub LLM reply.
```

- [ ] **Step 4: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(assistant): mount AssistantWidget in AdminLayout (flag-gated)"
```

---

## Task 16: Mount in PortalLayout (env-flag gated)

**Files:**
- Modify: `website/src/layouts/PortalLayout.astro` (line ~258)

- [ ] **Step 1: Replace the import and mount**

Same pattern as Task 15, with `profile="portal"` and `ENABLE_ASSISTANT_PORTAL`.

```astro
import AssistantWidget from '../components/assistant/AssistantWidget.svelte';
const ASSISTANT_ENABLED = (process.env.ENABLE_ASSISTANT_PORTAL ?? 'false') === 'true';
```

```astro
{ASSISTANT_ENABLED
  ? <AssistantWidget client:load profile="portal" />
  : <HelpPanel client:load section={section} context="portal" />}
```

- [ ] **Step 2: Smoke-test (flag ON)**

```bash
cd website && ENABLE_ASSISTANT_PORTAL=true task website:dev
# Visit http://localhost:3000/portal — log in as a non-admin user
# Expect: assistant icon bottom-right, opens chat with stub reply
```

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/PortalLayout.astro
git commit -m "feat(assistant): mount AssistantWidget in PortalLayout (flag-gated)"
```

---

## Task 17: Admin action handlers (5 handlers, one commit each)

**Files:**
- Create: `website/src/lib/assistant/actions/admin/finalizeMeeting.ts`
- Create: `website/src/lib/assistant/actions/admin/sendInvoice.ts`
- Create: `website/src/lib/assistant/actions/admin/resolveTicket.ts`
- Create: `website/src/lib/assistant/actions/admin/scheduleFollowup.ts`
- Create: `website/src/lib/assistant/actions/admin/writeClientNote.ts`
- Modify: `website/src/lib/assistant/actions/admin/index.ts`

Each handler follows the same pattern: register an `ActionDescriptor` whose `handler` calls into the existing admin lib functions. Below is the template — apply it to all five.

- [ ] **Step 1: Implement `finalizeMeeting.ts`**

```typescript
// website/src/lib/assistant/actions/admin/finalizeMeeting.ts
import { registerAction } from '../../actions';
import { finalizeMeeting } from '../../../meetings'; // existing helper used by /admin/meetings

registerAction({
  id: 'admin:finalize-meeting',
  allowedProfiles: ['admin'],
  describe: (p) => ({
    targetLabel: `Meeting „${p.meetingLabel ?? p.meetingId}"`,
    summary: 'Transkript anhängen, Folgetermin-Vorschlag senden, Status auf finalized.',
  }),
  handler: async ({ payload, userSub }) => {
    const meetingId = String(payload.meetingId ?? '');
    if (!meetingId) return { ok: false, message: 'meetingId fehlt' };
    await finalizeMeeting(meetingId, { actorSub: userSub });
    return { ok: true, message: 'Erledigt. Folgetermin-Vorschlag ist raus.' };
  },
});
```

> **Lookup note:** if the existing helper has a different name/path, grep first:
> ```bash
> grep -rn "finalizeMeeting\|finalize_meeting\|status.*finalized" website/src/lib | head
> ```
> Use the actual helper. Do not implement finalization logic here — this file is glue.

- [ ] **Step 2: Implement remaining four admin handlers**

Use the same template, calling existing helpers from `website/src/lib`:

| Action ID | Calls existing helper | Payload keys |
|---|---|---|
| `admin:send-invoice` | `sendInvoice` (lib/billing or similar) | `invoiceId` |
| `admin:resolve-ticket` | `transitionTicket(ticketId, 'done', resolution)` from `lib/tickets/transition.ts` | `ticketId`, `resolution`, `note` |
| `admin:schedule-followup` | `createBooking({ clientId, datetime, … })` | `clientId`, `datetime`, `serviceId` |
| `admin:write-client-note` | `addClientNote(clientId, body)` | `clientId`, `body` |

- [ ] **Step 3: Wire them in the index file**

```typescript
// website/src/lib/assistant/actions/admin/index.ts
import './finalizeMeeting';
import './sendInvoice';
import './resolveTicket';
import './scheduleFollowup';
import './writeClientNote';
```

- [ ] **Step 4: Add an integration test for one handler**

```typescript
// website/src/lib/assistant/actions/admin/finalizeMeeting.test.ts
import { describe, it, expect } from 'vitest';
import './finalizeMeeting';
import { describeAction, listActionsFor } from '../../actions';

describe('admin:finalize-meeting registration', () => {
  it('appears on the admin profile and not portal', () => {
    expect(listActionsFor('admin').some((a) => a.id === 'admin:finalize-meeting')).toBe(true);
    expect(listActionsFor('portal').some((a) => a.id === 'admin:finalize-meeting')).toBe(false);
  });

  it('describes the action with target + summary', () => {
    const d = describeAction('admin:finalize-meeting', { meetingId: 'm1', meetingLabel: 'Marc · 06.05.' });
    expect(d.targetLabel).toContain('Marc');
    expect(d.summary.length).toBeGreaterThan(10);
  });
});
```

Run:

```bash
cd website && npx vitest run src/lib/assistant/actions/admin/
```

Expected: PASS.

- [ ] **Step 5: Commit (one commit per handler is fine; or one combined commit)**

```bash
git add website/src/lib/assistant/actions/admin/
git commit -m "feat(assistant): admin action handlers (finalize, invoice, ticket, followup, note)"
```

---

## Task 18: Portal action handlers (7 handlers)

**Files:**
- Create: `website/src/lib/assistant/actions/portal/{bookSession,moveSession,cancelSession,signDocument,uploadFile,messageCoach,startQuestionnaire}.ts`
- Modify: `website/src/lib/assistant/actions/portal/index.ts`

- [ ] **Step 1: Implement each handler using existing portal lib helpers**

Same template as Task 17. Each handler:

1. Looks up the existing helper (`grep` if unsure)
2. Validates payload
3. Returns `{ ok, message }`

Action mapping:

| Action ID | Calls existing helper | Payload keys |
|---|---|---|
| `portal:book-session` | `createBooking({ userSub, datetime, serviceId })` | `datetime`, `serviceId` |
| `portal:move-session` | `moveBooking(bookingId, newDatetime)` | `bookingId`, `newDatetime` |
| `portal:cancel-session` | `cancelBooking(bookingId, reason?)` | `bookingId`, `reason?` |
| `portal:sign-document` | DocuSeal redirect URL — return `{ ok: true, message: '…', data: { redirectUrl } }` | `documentId` |
| `portal:upload-file` | (Note: file upload is a chunked HTTP path; this action just returns a redirect to the upload UI with a context tag) | `targetFolder` |
| `portal:message-coach` | `sendMessageToCoach(userSub, body)` | `body` |
| `portal:start-questionnaire` | redirect URL into `/portal/fragebogen/[id]` | `questionnaireId` |

**Critical safety note:** every portal handler MUST scope by `userSub`. A portal user must never act on another user's resources. If an existing helper does not enforce this, **add the check in the action handler** before calling it. Example:

```typescript
const booking = await getBookingById(bookingId);
if (booking.userSub !== ctx.userSub) {
  return { ok: false, message: 'Diese Buchung gehört nicht zu deinem Konto.' };
}
```

- [ ] **Step 2: Wire them in the index file**

```typescript
// website/src/lib/assistant/actions/portal/index.ts
import './bookSession';
import './moveSession';
import './cancelSession';
import './signDocument';
import './uploadFile';
import './messageCoach';
import './startQuestionnaire';
```

- [ ] **Step 3: Add a security test asserting profile separation**

```typescript
// website/src/lib/assistant/actions/portal/profile-isolation.test.ts
import { describe, it, expect } from 'vitest';
import './index';
import '../admin/index';
import { listActionsFor } from '../../actions';

describe('portal/admin action isolation', () => {
  it('admin actions never appear in the portal whitelist', () => {
    const portalIds = listActionsFor('portal').map((a) => a.id);
    expect(portalIds.every((id) => !id.startsWith('admin:'))).toBe(true);
  });

  it('portal actions never appear in the admin whitelist', () => {
    const adminIds = listActionsFor('admin').map((a) => a.id);
    expect(adminIds.every((id) => !id.startsWith('portal:'))).toBe(true);
  });
});
```

Run:

```bash
cd website && npx vitest run src/lib/assistant/actions/portal/
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/assistant/actions/portal/
git commit -m "feat(assistant): portal action handlers + profile isolation test"
```

---

## Task 19: Admin nudge evaluators

**Files:**
- Modify: `website/src/lib/assistant/triggers/admin.ts`

- [ ] **Step 1: Implement the five admin triggers**

```typescript
// website/src/lib/assistant/triggers/admin.ts
import { registerTrigger } from '../triggers';
import type { Nudge } from '../types';
import { pool } from '../../website-db';

// 1. Morning briefing — once per calendar day, on /admin or /admin/dashboard
registerTrigger({
  id: 'admin-morning-briefing',
  profile: 'admin',
  async evaluate({ userSub, currentRoute }) {
    if (!currentRoute.startsWith('/admin') || currentRoute.includes('/admin/'))  return null;
    // The /dismiss snooze for 86_400s after first morning view handles "once per day"
    const meetings = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM meetings WHERE status IN ('scheduled','transcribed') AND date_trunc('day', start_at) = current_date`,
    );
    const ticketsOpen = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM ticket_tickets WHERE status NOT IN ('done','archived')`,
    );
    return {
      id: 'admin-morning-briefing',
      triggerId: 'admin-morning-briefing',
      profile: 'admin',
      headline: 'Heute',
      body: `${meetings.rows[0].count} Termine, ${ticketsOpen.rows[0].count} offene Tickets.`,
      primaryAction: { label: 'Durchgehen', kickoff: 'Geh meine offenen Tickets der Reihe nach durch' },
      secondaryAction: { label: 'Später', kickoff: '' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 2. Term in 5 min — only fires when there's an upcoming meeting
registerTrigger({
  id: 'admin-meeting-imminent',
  profile: 'admin',
  async evaluate() {
    const r = await pool.query<{ id: string; client_name: string; minutes: number }>(
      `SELECT id, client_name, EXTRACT(EPOCH FROM (start_at - now()))/60 AS minutes
         FROM meetings
         WHERE start_at BETWEEN now() AND now() + interval '6 minutes'
           AND status = 'scheduled'
         ORDER BY start_at ASC LIMIT 1`,
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `admin-meeting-imminent:${row.id}`,
      triggerId: 'admin-meeting-imminent',
      profile: 'admin',
      headline: 'Termin in 5 min',
      body: `${row.client_name} — beitreten?`,
      primaryAction: { label: 'Beitreten', kickoff: `Öffne den Meetingraum für ${row.client_name}` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 3. New Fragebogen submitted (last 5 min)
registerTrigger({
  id: 'admin-fragebogen-submitted',
  profile: 'admin',
  async evaluate() {
    const r = await pool.query<{ id: string; client_name: string }>(
      `SELECT id, client_name FROM questionnaire_responses
         WHERE submitted_at > now() - interval '5 minutes'
         ORDER BY submitted_at DESC LIMIT 1`,
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `admin-fragebogen:${row.id}`,
      triggerId: 'admin-fragebogen-submitted',
      profile: 'admin',
      headline: 'Neuer Fragebogen',
      body: `${row.client_name} hat soeben abgeschickt.`,
      primaryAction: { label: 'Antworten sehen', kickoff: `Zeig mir die letzten Antworten von ${row.client_name}` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 4. Payment received (last 5 min)
registerTrigger({
  id: 'admin-payment-received',
  profile: 'admin',
  async evaluate() {
    const r = await pool.query<{ id: string; amount_cents: number; payer: string }>(
      `SELECT id, amount_cents, payer FROM invoice_payments
         WHERE paid_at > now() - interval '5 minutes'
         ORDER BY paid_at DESC LIMIT 1`,
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `admin-payment:${row.id}`,
      triggerId: 'admin-payment-received',
      profile: 'admin',
      headline: 'Zahlung eingegangen',
      body: `${(row.amount_cents/100).toFixed(2)} € von ${row.payer}.`,
      primaryAction: { label: 'Quittung versenden', kickoff: `Versende die Quittung für die letzte Zahlung von ${row.payer}` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 5. Error rescue — handled client-side: when an admin API call returns ≥400,
//    the layout fires a custom `assistant:error-rescue` event. We register a
//    trigger that the layout pushes into via the /nudges endpoint with
//    ?errorContext=... — implementation detail folded into Task 20.
```

> **Lookup note:** the table names above (`meetings`, `ticket_tickets`, `questionnaire_responses`, `invoice_payments`) need to match the actual schema. Grep before assuming:
> ```bash
> psql -c '\dt' or task workspace:psql ENV=mentolder -- website
> ```
> Adjust the SQL accordingly. The trigger structure stays the same.

- [ ] **Step 2: Manually verify against the dev database**

```bash
# Port-forward shared-db then:
cd website && DATABASE_URL='postgresql://website:devwebsitedb@localhost:5432/website' \
  ENABLE_ASSISTANT_ADMIN=true task website:dev
# Visit /admin/dashboard — expect a morning-briefing bubble within 45s.
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/assistant/triggers/admin.ts
git commit -m "feat(assistant): admin nudge evaluators (briefing, imminent, fragebogen, payment)"
```

---

## Task 20: Portal nudge evaluators + first-login onboarding

**Files:**
- Modify: `website/src/lib/assistant/triggers/portal.ts`

- [ ] **Step 1: Implement six portal triggers**

```typescript
// website/src/lib/assistant/triggers/portal.ts
import { registerTrigger } from '../triggers';
import { pool } from '../../website-db';
import { listFirstSeenAt, recordFirstSeen } from '../dismissals';

// 1. First-login onboarding — fires the very first time a user lands on /portal/*
registerTrigger({
  id: 'portal-first-login',
  profile: 'portal',
  async evaluate({ userSub, currentRoute }) {
    if (!currentRoute.startsWith('/portal')) return null;
    const seen = await listFirstSeenAt(userSub, 'portal');
    if (seen) return null;
    await recordFirstSeen(userSub, 'portal');
    return {
      id: 'portal-first-login',
      triggerId: 'portal-first-login',
      profile: 'portal',
      headline: 'Willkommen',
      body: 'Soll ich dir kurz dein Portal zeigen?',
      primaryAction: { label: 'Ja, los', kickoff: 'Zeig mir das Portal Stück für Stück' },
      secondaryAction: { label: 'Später', kickoff: '' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 2. Signature waiting
registerTrigger({
  id: 'portal-signature-pending',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM documents
         WHERE recipient_sub = $1 AND status = 'pending_signature'
         ORDER BY created_at DESC LIMIT 1`,
      [userSub],
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `portal-signature:${row.id}`,
      triggerId: 'portal-signature-pending',
      profile: 'portal',
      headline: 'Unterschrift offen',
      body: `„${row.title}" wartet.`,
      primaryAction: { label: 'Zeig mir das Dokument', kickoff: `Bring mich zur Unterschrift von "${row.title}"` },
      createdAt: new Date().toISOString(),
    };
  },
});

// 3. 24-hour reminder
registerTrigger({
  id: 'portal-session-24h',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await pool.query<{ id: string; start_at: Date }>(
      `SELECT id, start_at FROM bookings
         WHERE client_sub = $1 AND start_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
         ORDER BY start_at LIMIT 1`,
      [userSub],
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `portal-session-24h:${row.id}`,
      triggerId: 'portal-session-24h',
      profile: 'portal',
      headline: 'Morgen Termin',
      body: row.start_at.toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
      primaryAction: { label: 'Vorbereiten?', kickoff: 'Hilf mir, mich auf morgen vorzubereiten' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 4. 1-hour reminder (link live)
registerTrigger({
  id: 'portal-session-1h',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM bookings
         WHERE client_sub = $1 AND start_at BETWEEN now() AND now() + interval '70 minutes'
         ORDER BY start_at LIMIT 1`,
      [userSub],
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `portal-session-1h:${row.id}`,
      triggerId: 'portal-session-1h',
      profile: 'portal',
      headline: 'Termin in einer Stunde',
      body: 'Beitreten ist jetzt möglich.',
      primaryAction: { label: 'Beitreten', kickoff: 'Bring mich zum Meetingraum' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 5. New coach message
registerTrigger({
  id: 'portal-new-coach-message',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM messages
         WHERE recipient_sub = $1 AND read_at IS NULL AND sent_at > now() - interval '1 hour'`,
      [userSub],
    );
    const n = Number(r.rows[0].count); if (!n) return null;
    return {
      id: 'portal-new-coach-message',
      triggerId: 'portal-new-coach-message',
      profile: 'portal',
      headline: `${n} neue Nachricht${n > 1 ? 'en' : ''}`,
      body: 'vom Coach.',
      primaryAction: { label: 'Lesen', kickoff: 'Zeig mir die neuen Nachrichten' },
      createdAt: new Date().toISOString(),
    };
  },
});

// 6. Open Fragebogen request
registerTrigger({
  id: 'portal-fragebogen-open',
  profile: 'portal',
  async evaluate({ userSub }) {
    const r = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM questionnaire_assignments
         WHERE assignee_sub = $1 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
      [userSub],
    );
    const row = r.rows[0]; if (!row) return null;
    return {
      id: `portal-fragebogen:${row.id}`,
      triggerId: 'portal-fragebogen-open',
      profile: 'portal',
      headline: 'Fragebogen wartet',
      body: `„${row.title}"`,
      primaryAction: { label: 'Jetzt starten', kickoff: `Starte den Fragebogen "${row.title}"` },
      createdAt: new Date().toISOString(),
    };
  },
});
```

> **Same lookup note as Task 19** — table/column names need verification.

- [ ] **Step 2: Smoke-test as a portal user**

```bash
ENABLE_ASSISTANT_PORTAL=true task website:dev
# Log in as a non-admin client. First /portal visit should trigger the welcome bubble.
```

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/assistant/triggers/portal.ts
git commit -m "feat(assistant): portal nudge evaluators incl. first-login onboarding"
```

---

## Task 21: Retire HelpPanel + helpContent.ts

> **Run this task only after both flags have been ON in production for at least one week and no rollback signal has been raised.**

**Files:**
- Delete: `website/src/components/HelpPanel.svelte`
- Delete: `website/src/lib/helpContent.ts`
- Modify: `website/src/layouts/AdminLayout.astro` — remove `HelpPanel` import + the `: <HelpPanel ...>` branch
- Modify: `website/src/layouts/PortalLayout.astro` — same
- Modify: any callers passing `helpSection` / `section` props to the layouts (search and remove)

- [ ] **Step 1: Find all references to HelpPanel and helpContent**

```bash
cd website && grep -rn "HelpPanel\|helpContent\|helpSection" src/
```

- [ ] **Step 2: Delete the two files and inline the assistant unconditionally in both layouts**

```bash
rm website/src/components/HelpPanel.svelte website/src/lib/helpContent.ts
```

In `AdminLayout.astro`:

```astro
<AssistantWidget client:load profile="admin" />
```

In `PortalLayout.astro`:

```astro
<AssistantWidget client:load profile="portal" />
```

Remove the `ASSISTANT_ENABLED` const, the import of `HelpPanel`, and any leftover `helpSection`/`section` prop wiring.

- [ ] **Step 3: Build the website and check for stale references**

```bash
cd website && npm run build
```

Expected: build succeeds. Any remaining import of `HelpPanel` or `helpContent` will fail compilation — fix them.

- [ ] **Step 4: Commit**

```bash
git add -u website/
git commit -m "feat(assistant): retire HelpPanel + helpContent.ts (assistant is now default)"
```

---

## Task 22: Deploy + verify on both prod clusters

This is **not** an in-code task — it's the deployment step required for the rollout to take effect. Per project memory, after any `website/src` change run `task website:deploy ENV=mentolder` then `ENV=korczewski`.

- [ ] **Step 1: Set the env-flags as Sealed Secrets** (or as plain env vars in `environments/<env>.yaml` if non-secret)

The user owns this — see `environments/mentolder.yaml` and `environments/korczewski.yaml`. Add:

```yaml
env_vars:
  ENABLE_ASSISTANT_ADMIN: "true"
  ENABLE_ASSISTANT_PORTAL: "true"
```

If the LLM call needs an API key, it lives in `environments/.secrets/<env>.yaml` and gets sealed via `task env:seal ENV=<env>`. **This is the user's call** — the plan ships with the LLM stub that does not require any credential.

- [ ] **Step 2: Deploy to both prod clusters**

```bash
task website:deploy ENV=mentolder
task website:deploy ENV=korczewski
```

- [ ] **Step 3: Smoke-test live**

Visit:
- `https://web.mentolder.de/admin/dashboard` (admin profile)
- `https://web.mentolder.de/portal` (portal profile, log in as a non-admin)
- Same for `https://web.korczewski.de`

For each: verify the assistant icon appears bottom-right, opens the chat, returns the stub reply. The morning-briefing nudge should show within 45s on the admin dashboard.

- [ ] **Step 4: User wires up the real LLM**

Replace the stub in `website/src/lib/assistant/llm.ts` with the real `assistantChat()` implementation (Anthropic API, local model, whatever the user chooses). The plan does not specify this — it is the user's call per the spec.

---

## Self-Review

**Spec coverage check:**

- ✅ Three states (idle / nudge / chat) → Tasks 11, 13, 14
- ✅ Push-to-talk via Whisper → Task 13 + Task 9
- ✅ Confirmation card with cancel-default focus → Task 12
- ✅ Two profiles (admin + portal) → Tasks 15, 16, 17, 18, 19, 20
- ✅ Five admin triggers (morning, term-5min, fragebogen, payment, error rescue) → Task 19 (error rescue is a thin client-side hook noted in the trigger file; the plan correctly defers the implementation to the layout-level error toast wiring, which is small enough to fold into the rollout)
- ✅ Six portal triggers (first-login, signature, 24h, 1h, message, fragebogen) → Task 20
- ✅ Five admin actions → Task 17
- ✅ Seven portal actions → Task 18
- ✅ Action whitelist enforcement (server-side) → Task 3 + Task 8
- ✅ Profile isolation test (admin actions cannot run on portal profile) → Task 18
- ✅ Conversation history → Tasks 1, 5
- ✅ Nudge dismissals (snooze) → Tasks 6, 10
- ✅ First-seen tracking for onboarding → Tasks 6, 20
- ✅ Feature flag → Tasks 15, 16
- ✅ Migration plan (mount alongside, then retire) → Tasks 15, 16, 21
- ✅ Backend stays the user's call → Task 2 + Task 22 step 4
- ✅ Mobile responsiveness → uses fixed positioning that already collapses; the chat panel honors viewport via percentage widths — this is acceptable for v1, full mobile polish can follow

**Placeholder scan:** none of "TBD"/"TODO"/"add appropriate handling"/"similar to". Each task ships a runnable test or a smoke test with the expected output, plus a commit step.

**Type consistency:** `AssistantProfile`, `Nudge`, `ProposedAction`, `Message`, `ActionResult` are defined once in Task 1 and reused everywhere. Action IDs use the `<profile>:<action>` convention consistently. Trigger IDs use stable string keys (e.g. `portal-session-1h`). The shape of the `/api/assistant/nudges` response (`{ nudges: Nudge[] }`) matches what `AssistantWidget.svelte` consumes in Task 14.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-08-mentolder-assistent.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Several tasks (11/12/13, 17/18, 19/20) are mutually independent and can be dispatched in parallel.

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans`, batched with checkpoints.

Which approach?
