# Design: Coaching Session — Agent SDK Integration

**Date:** 2026-05-18  
**Status:** Approved  
**Scope:** `website/src/lib/` + `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` + `website/src/components/admin/coaching/SessionWizard.svelte`

---

## Problem

The current `generate.ts` route makes a single-turn, fire-and-forget LLM call per coaching step. Each of the 10 steps is generated with no awareness of prior steps. There is no retry logic, no streaming, and no access to the coaching knowledge base. The multi-provider abstraction (`ki_config`) must be preserved.

Goals:
- **(A)** Conversational memory across steps — Step N can reference Steps 1..N-1
- **(B)** Tool use for the Claude path — knowledge base search, step retrieval, report generation
- **(C)** Operational improvements — streaming, retry, fallback

---

## Approach: Agent SDK Enhanced Mode (Approach B)

When `ki_config.provider === 'claude'`: route through `ClaudeSessionAgent` (Agent SDK, memory, tools, streaming).  
When `ki_config.provider !== 'claude'`: route through `LegacySessionAgent` (direct SDK, conversation history injected, no tools).

Both implementations satisfy the same `SessionAgent` interface. The `generate.ts` route is minimally changed — only the LLM call block is replaced.

---

## Architecture

```
POST …/steps/[n]/generate
        │
        ▼
session-agent-factory.ts
  createSessionAgent(kiConfig)
        │
  ┌─────┴──────┐
  │            │
  ▼            ▼
ClaudeSession  LegacySession
Agent          Agent
(Claude only)  (OpenAI/Mistral)
  │            │
  │            └─ history injected as messages array
  │
  ├─ Anthropic SDK messages API (tool_use)
  ├─ Conversation history (steps 1..N-1)
  ├─ Agent loop (max 3 tool rounds)
  ├─ SSE streaming
  └─ Tools:
       search_coaching_knowledge
       get_session_step
       draft_session_report
```

---

## New Files

All in `website/src/lib/`:

| File | Purpose |
|------|---------|
| `session-agent.ts` | `SessionAgent` interface + shared types |
| `session-agent-factory.ts` | Provider routing — `createSessionAgent(kiConfig)` |
| `claude-session-agent.ts` | Claude implementation: Agent SDK, tools, streaming |
| `legacy-session-agent.ts` | Other providers: history injection, direct SDK |
| `session-history.ts` | Rebuild conversation turns from `coaching.session_steps`; token guard |

---

## SessionAgent Interface

```typescript
// session-agent.ts

export interface GenerateOptions {
  sessionId: string;
  stepNumber: number;           // 1–10
  coachInputs: Record<string, string>;
  kiConfig: KiConfig;
  projectContext?: string;      // coaching.projects.ki_context
  brand: string;
  history: { role: 'user' | 'assistant'; content: string }[];  // built by generate.ts before calling agent
}

export interface GenerateResult {
  aiPrompt: string;
  aiResponse: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface SessionAgent {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream?(options: GenerateOptions): AsyncIterable<string>; // Claude path only
}
```

---

## Session History Builder

```typescript
// session-history.ts

export async function buildSessionHistory(
  sessionId: string,
  upToStep: number   // exclusive — does not include current step
): Promise<{ role: 'user' | 'assistant'; content: string }[]>
```

Reads `coaching.session_steps` for all steps with `step_number < upToStep` and `status IN ('accepted', 'skipped')`. Returns interleaved user (coach inputs + prompt) and assistant (ai_response) turns. Trims oldest turns when estimated token count exceeds 80k to stay within model context limits.

---

## Tools (Claude path only)

### `search_coaching_knowledge`

Semantic search over the coaching knowledge base.

- **Input:** `{ query: string, limit?: number }`
- **Returns:** `{ title, body, source }[]`
- **Infra:** `coaching.knowledge_chunks` via pgvector + `llm-gateway-embed:8081` (bge-m3 embeddings on GPU host)
- **Fail behaviour:** Returns empty array if GPU host is unavailable — agent continues without KB context

### `get_session_step`

Retrieve the accepted content of any prior step by number.

- **Input:** `{ step_number: number }`
- **Returns:** `{ stepName, coachInputs, aiResponse, coachNotes, status }`
- **Infra:** Direct read from `coaching.session_steps` via existing `coaching-session-db.ts`

### `draft_session_report`

Generate a structured Abschlussbericht (closing report). Called automatically at step 10.

- **Input:** `{ format: 'markdown' | 'structured' }`
- **Returns:** `{ summary, keyInsights, actionPlan, nextSession }`
- **Infra:** Writes to `coaching.session_steps` `step_number=0` (existing report row). Replaces current inline report logic in `complete.ts`.

**Agent loop guard:** Maximum 3 tool rounds per generate call. `search_coaching_knowledge` and `get_session_step` are read-only. `draft_session_report` writes only to `step_number=0`.

---

## LegacySessionAgent

For OpenAI and Mistral providers. The only change from the current implementation is that prior accepted/skipped steps are reconstructed as a `messages` array and prepended to the current turn. Temperature, max_tokens, system prompt, and all other provider parameters remain unchanged.

`stream()` is not implemented on `LegacySessionAgent`.

---

## Streaming (Claude path)

Triggered by `?stream=true` query param on the generate endpoint. Response format:

```
Content-Type: text/event-stream

data: {"chunk": "Der Klient zeigt..."}
data: {"chunk": " eine deutliche..."}
data: {"done": true, "aiPrompt": "...", "durationMs": 420}
```

The final `done` event carries `aiPrompt` and `durationMs` so the client can persist the step result in one call at stream end — identical to the current non-streaming flow.

`SessionWizard.svelte` changes:
- Adds `streamingResponse: string` rune (Svelte 5 `$state`)
- Detects `kiConfig.provider === 'claude'` at page load and always uses `?stream=true` for Claude sessions
- Falls back to existing JSON path for other providers — no UI flag needed

---

## Changes to Existing Files

| File | Change |
|------|--------|
| `generate.ts` | Replace ~60-line provider-switch block with `createSessionAgent` + `buildSessionHistory` calls |
| `complete.ts` | Remove inline report generation; `draft_session_report` tool handles this via the agent |
| `SessionWizard.svelte` | Add `streamingResponse` rune + SSE fetch path for Claude provider |
| `coaching.session_audit_log` | New `event_type = 'tool_invocation'` logged for each tool call with tool name, input, output, duration |

---

## Infra Impact

| Component | Impact |
|-----------|--------|
| K8s manifests | None — no new pods or services |
| DB schema | One new `event_type` value in `coaching.session_audit_log`; no new tables or columns |
| GPU host (`llm-gateway-embed:8081`) | New runtime dep for `search_coaching_knowledge`; already present for `coaching:classify` |
| Anthropic API key | Same key from `ki_config.api_key` / `ANTHROPIC_API_KEY`; no rotation needed |
| MCP servers | Not wired in v1; natural v2 extension if coaching tools grow |

---

## Out of Scope (v1)

- Client-facing (portal) session UI
- Tool support for OpenAI/Mistral providers
- MCP server integration
- Lumo provider implementation
- Cross-session memory (sessions remain independent units)
