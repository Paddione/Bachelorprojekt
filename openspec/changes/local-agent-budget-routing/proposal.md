# Proposal: local-agent-budget-routing

## Why

Die Software Factory und die dev-flow-Skills dispatchen Agenten heute ausschließlich über
Cloud-Provider (anthropic/deepseek), obwohl auf dem Windows-Host ein getesteter lokaler
LM-Studio-Endpoint mit qwen3.5-9b@iq4_xs läuft (parallele Requests, 180k Gesamt-KV-Cache
verifiziert). Kontextleichte Orchestrierungsarbeit (Scout, Plan-Entwürfe, Ticket-Triage,
Lavish-HTML-Generierung) kann lokal laufen — kostenlos, DSGVO-freundlich und ohne
API-Rate-Limits. Die bestehende Slot-Concurrency (`provider_config.max_concurrent`,
statisch 3) kann die entscheidende Ressource des lokalen Hosts aber nicht modellieren:
das KV-Cache-Budget. Drei 60k-Agenten passen gleichzeitig, ein 180k-Agent belegt den Host
exklusiv — ein statischer Zähler kennt diesen Unterschied nicht.

Außerdem fehlen im Provider-Katalog (`ki-catalog.ts`) Einträge für OpenRouter, opencode
Zen, Google Gemini und GitHub Models, sodass deren API-Keys nicht über die bestehende
Provider-Verwaltung gepflegt werden können.

Epic: T001589 (Change ① von 3) · Grilling: T001588 · Design-Spec:
`docs/superpowers/specs/2026-07-03-local-agent-orchestration-design.md`

## What

- **Token-Budget-Semaphor** (generisch, NULL = unbegrenzt):
  - `tickets.provider_config` += `context_window int` (pro Routing-Row, z. B. 60000),
    `context_budget int NULL` (pro Provider, z. B. 180000).
  - `tickets.provider_health` += `reserved_tokens int NOT NULL DEFAULT 0`.
  - Claim in `scripts/factory/route-provider.sh` erweitert: atomares
    `UPDATE … SET active_agents = active_agents + 1, reserved_tokens = reserved_tokens +
    :ctx WHERE … AND (context_budget IS NULL OR reserved_tokens + :ctx <=
    context_budget)`; Release symmetrisch.
  - Paritäts-Update der übrigen Implementierungen: `provider-router.js` (`isUsable`),
    `website/src/lib/provider-config.ts`, Inline-Klon `routeProviderSync()` in
    `scripts/factory/pipeline.js`. Neuer Paritäts-BATS-Test prüft alle gegen dieselben
    Fixtures.
  - Migration `scripts/migrations/2026-07-03-context-budget.sql` + idempotentes DDL in
    `website/src/lib/schema/provider-config-schema.ts`.
- **Provider-Katalog**: `ki-catalog.ts` += `local-qwen35` (defaultBaseUrl
  `http://100.102.71.114:1234/v1`, suggestedModels `qwen3.5-9b@iq4_xs`, kein Key) sowie
  `openrouter`, `opencode-zen`, `google-gemini`, `github-models` mit `apiKeyEnv`.
  `environments/schema.yaml` += `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`,
  `GEMINI_API_KEY`, `GITHUB_MODELS_TOKEN`.
- **Seeds**: prio-1-Rows `local-qwen35` (`context_window=60000`,
  `context_budget=180000`) für die Sources `factory-scout`, `factory-plan`,
  `ticket-triage` und die neue Source `lavish-artifact` (Registrierung in
  `ki-services.ts`); bestehende Cloud-Rows dieser Sources werden auf prio 2 demotet
  (Fallback über den vorhandenen Circuit-Breaker).

**Non-Goals** (Folge-Changes des Epics): der opencode-Spawn-Wrapper und die
Lavish-Delegation (Change ②, T001591) sowie Factory-Floor-Badge/Drawer und der
Sidekick-View `agent-settings` (Change ③, T001592). `factory-implement` und
`factory-review` werden NICHT auf den lokalen Provider geroutet.

_Ticket: T001590_
