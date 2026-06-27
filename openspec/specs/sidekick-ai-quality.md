# sidekick-ai-quality

## Purpose

Ein neues Sidekick-View `'ai-quality'` macht AI-Workflow-Gesundheit sichtbar: Latenz, Cost/Tokens, Error-Rate und Output-Health werden über alle Website-AI-Workflows (coaching chat, RAG search, embeddings) hinweg getrackt. Die Implementierung folgt einem "pure module"-Pattern: ein fire-and-forget `ai-metrics.ts` schreibt jede AI-Call in eine neue `ai_call_log`-Tabelle, ein Admin-API-Endpoint aggregiert die Daten, und `AiQualitySidekickView.svelte` rendert sie.

## Requirements

### Requirement: ai_call_log Tabelle

The system SHALL provide `website/migrations/20260621_create_ai_call_log.sql` creating a `public.ai_call_log` table with columns `id, ts, workflow, model, prompt_tokens, completion_tokens, latency_ms, error, user_sub, metadata` and indexes `ai_call_log_ts` (DESC) and `ai_call_log_workflow` (workflow, ts DESC). The migration SHALL be idempotent (`IF NOT EXISTS`).

### Requirement: ai-metrics Pure Module

The system SHALL provide `website/src/lib/ai-metrics.ts` exporting two functions: `withAiMetrics(workflow, fn, modelHint?)` for Anthropic-Form call-sites (auto-extracts `result.usage.{input,output}_tokens` and `result.model`), and `logAiCall(metrics)` for non-Anthropic call-sites (RAG/embeddings). Both SHALL be fire-and-forget (Insert-Fehler werden auf stderr geloggt, Exit 0). `ai-metrics.ts` SHALL NOT import `assistant/llm.ts` (no import cycles).

#### Scenario: withAiMetrics extrahiert usage aus Anthropic-Result

- **GIVEN** `messages.create()` returns `{ usage: { input_tokens: 100, output_tokens: 50 }, model: 'claude-sonnet-4-5' }`
- **WHEN** `await withAiMetrics('coaching-chat', () => messages.create(...))` aufgerufen wird
- **THEN** wird ein `ai_call_log`-Row mit `workflow='coaching-chat'`, `prompt_tokens=100`, `completion_tokens=50`, `model='claude-sonnet-4-5'`, `error=NULL` geschrieben
- **AND** das Original-Result wird rethrown

#### Scenario: Fehlerhafter Insert bricht AI-Call nicht ab

- **GIVEN** der `ai_call_log` Insert wirft einen DB-Fehler
- **WHEN** `await withAiMetrics(...)` läuft
- **THEN** wird der Fehler auf stderr geloggt (nicht geworfen)
- **AND** `messages.create()`'s Result/Error propagiert unverändert

### Requirement: Admin-Endpoint für AI-Quality Aggregation

The system SHALL provide `GET /api/admin/ai-quality` (admin-only via `getSession` + `isAdmin` pattern, 401 ohne Admin-Session) that aggregates `ai_call_log` rows into `{ health: {ok, total, errors_24h, p95_latency_ms}, last24h: { calls, tokens, cost_usd, by_workflow: [...] }, recentErrors: [...] }`. Cost SHALL be computed at query time (tokens × model price/1k).

### Requirement: AiQualitySidekickView Svelte-Komponente

The system SHALL provide `website/src/components/assistant/AiQualitySidekickView.svelte` rendering health indicator, 24h summary, cost chart, and recent error list. The view SHALL be registered as a Sidekick view in `sidekick-nudge.ts` (`'ai-quality'` to `View` union + `KNOWN_VIEWS`).

#### Scenario: Admin sieht AI-Quality-View im Sidekick

- **GIVEN** ein Admin ist eingeloggt
- **WHEN** er im Sidekick "KI-Qualität" auswählt
- **THEN** zeigt die View die aggregierten Metriken der letzten 24h
- **AND** der Health-Indikator reflektiert `error_rate < 5%` als grün, sonst gelb/rot

<!-- from archive/2026-06-21-sidekick-ai-quality/tasks.md lines 1-200 -->
