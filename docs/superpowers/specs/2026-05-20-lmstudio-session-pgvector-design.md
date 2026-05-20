# Spec: LM Studio Session Agent with pgvector RAG
**Date:** 2026-05-20  
**Branch:** feature/lmstudio-session-pgvector

## Problem

The coaching-session LLM pipeline has two bugs:

1. **Factory always returns `LegacySessionAgent`** — `session-agent-factory.ts:6` ignores the provider config and never instantiates `ClaudeSessionAgent`, so Claude sessions never get tool-based pgvector retrieval.

2. **No pgvector RAG for OpenAI-compatible providers** — When a custom/local endpoint like LM Studio is used, coaching knowledge from the pgvector store is never injected into the prompt. The LLM answers from general knowledge only.

## Goal

Wire LM Studio (`http://100.102.71.114:1234/v1`, model `yemiao2745/qwen2.5-14b-instruct-uncensored`) as the active coaching session provider for the `mentolder` brand, with coaching book knowledge from pgvector automatically injected into every prompt.

## Design

### New: `OpenAICompatibleSessionAgent`

A new session agent that:
1. Calls `searchCoachingKnowledgeTool(assembledUserPrompt, 4)` before every LLM call  
2. If chunks are found, prepends a `## Coaching-Wissen` section to `effectiveSystemPrompt`  
3. Calls the LLM via the OpenAI SDK (OpenAI-compatible endpoint, auth via Bearer token in `kiConfig.apiKey`)
4. Supports both non-streaming (`generate`) and streaming (`stream`) paths

### Fixed: `session-agent-factory.ts`

```
claude (no custom endpoint) → ClaudeSessionAgent   (tool-based pgvector, unchanged)
claude (with apiEndpoint)   → ClaudeSessionAgent   (Anthropic SDK with custom baseURL)
custom_*                    → OpenAICompatibleSessionAgent  (RAG injection, new)
openai / mistral / lumo     → LegacySessionAgent   (unchanged, no pgvector)
```

### DB: LM Studio provider entry

New row in `coaching.ki_config` (mentolder brand):
- `provider`: `custom_lmstudio`
- `display_name`: `LM Studio (Qwen 2.5)`
- `api_endpoint`: `http://100.102.71.114:1234/v1`
- `model_name`: `yemiao2745/qwen2.5-14b-instruct-uncensored`
- `api_key`: stored in DB (not committed to git)
- `max_tokens`: 800
- `is_active`: `true` (current Claude entry → `false`)

## Files Changed

| File | Action |
|------|--------|
| `website/src/lib/openai-compatible-session-agent.ts` | NEW — pgvector RAG + OpenAI SDK |
| `website/src/lib/session-agent-factory.ts` | MODIFY — fix routing |
| `website/src/lib/coaching-ki-config-db.ts` | MODIFY — add `custom_lmstudio` to KNOWN_PROVIDERS |
| `scripts/seed-lmstudio-ki-config.mjs` | NEW — idempotent DB seed (token read from arg/env) |

## Verification

1. `task test:all` — offline tests pass
2. E2E: `fa-39-lmstudio-integration.spec.ts` T1–T7 all pass
3. Manual: POST to `/api/admin/coaching/sessions/{id}/steps/1/generate` returns `aiResponse` with coaching knowledge woven in
