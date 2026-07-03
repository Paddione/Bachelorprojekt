## ADDED Requirements

### Requirement: Token-Budget-Semaphor für Agent-Provider-Claims

Die bestehende Slot-Concurrency (`provider_config.max_concurrent`, statischer Zähler) kann die
KV-Cache-Ressource eines lokalen LLM-Hosts nicht modellieren: drei 60k-Kontexte passen
gleichzeitig, ein 180k-Kontext belegt den Host exklusiv. Das Routing SHALL Claims zusätzlich
gegen ein per-Provider Token-Budget absichern, das generisch für alle Provider gilt und bei
`context_budget = NULL` als unbegrenzt interpretiert wird (Cloud-Rows bleiben unverändert).

The system SHALL extend the atomic slot claim so that a claim reserves the candidate row's
`context_window` tokens on `provider_health.reserved_tokens` and only succeeds when the provider's
`context_budget` is `NULL` (unbounded) or the sum of already reserved tokens plus the requested
`context_window` does not exceed `context_budget`. The release SHALL symmetrically decrement
`reserved_tokens` by the same amount. The four routing implementations
(`scripts/factory/route-provider.sh`, `scripts/factory/release-slot.sh`,
`scripts/factory/provider-router.js`, and the inlined clone in `scripts/factory/pipeline.js`)
SHALL apply identical budget arithmetic; `website/src/lib/provider-config.ts` remains a read-only
selection path that passes the new columns through without claiming.

#### Scenario: Claim within budget succeeds and reserves tokens
- **GIVEN** provider `local-qwen35` has `context_budget = 180000` and `reserved_tokens = 0`
- **WHEN** a claim requests a row with `context_window = 60000`
- **THEN** the atomic UPDATE succeeds, `active_agents` becomes 1 and `reserved_tokens` becomes 60000

#### Scenario: Claim exceeding budget is rejected and routing falls through
- **GIVEN** provider `local-qwen35` has `context_budget = 180000` and `reserved_tokens = 120000`
- **WHEN** a claim requests another row with `context_window = 120000` (would total 240000)
- **THEN** the claim UPDATE returns no row, the candidate is skipped, and routing continues to the
  next lower-priority (cloud) candidate

#### Scenario: NULL budget is unbounded
- **GIVEN** a cloud provider row with `context_budget IS NULL`
- **WHEN** any claim is issued regardless of `reserved_tokens`
- **THEN** the budget guard is satisfied and only the existing `max_concurrent` cap applies

#### Scenario: Release restores the reserved budget
- **GIVEN** provider `local-qwen35` holds a 120000-token claim (`reserved_tokens = 120000`)
- **WHEN** the slot is released with its claim's `context_window = 120000`
- **THEN** `reserved_tokens` returns to 0 (floored at 0) and `active_agents` is decremented

### Requirement: Erweiterter Provider-Katalog und lokales qwen3.5-Primär-Routing

Der Provider-Katalog SHALL um einen lokalen `local-qwen35`-Eintrag (LM-Studio-Endpoint, kein
API-Key) sowie um die Cloud-Provider `openrouter`, `opencode-zen`, `google-gemini` und
`github-models` erweitert werden, deren API-Keys über die bestehende Provider-Verwaltung und
`environments/schema.yaml` gepflegt werden. Kontextleichte Orchestrierungsarbeit SHALL primär auf
den lokalen Provider geroutet werden, mit Cloud als automatischem prio-2-Fallback über den
bestehenden Circuit-Breaker.

The system SHALL register `local-qwen35` in `website/src/lib/ki-catalog.ts` with the LM-Studio
base URL and no `apiKeyEnv`, and SHALL register `openrouter`, `opencode-zen`, `google-gemini`, and
`github-models` each with an `apiKeyEnv`. The service source `lavish-artifact` SHALL be registered
in `website/src/lib/ki-services.ts`. Seed rows SHALL make `local-qwen35` priority 1 for the sources
`factory-scout`, `factory-plan`, `ticket-triage`, and `lavish-artifact`, and SHALL demote the
existing cloud rows of those sources to priority 2.

#### Scenario: Local provider is primary for orchestration sources
- **GIVEN** the seed migration has been applied to a brand database
- **WHEN** `route-provider.sh factory-scout sonnet` selects candidates
- **THEN** the highest-priority (priority 1) candidate is `local-qwen35` and the former cloud row is
  now priority 2

#### Scenario: New cloud providers expose an apiKeyEnv
- **GIVEN** the extended catalog
- **WHEN** `interfaceById('openrouter')` (or `opencode-zen`, `google-gemini`, `github-models`) is read
- **THEN** each entry defines a non-empty `apiKeyEnv`, and the four env names are declared in
  `environments/schema.yaml`

#### Scenario: Local provider requires no API key
- **GIVEN** the catalog entry `local-qwen35`
- **WHEN** its configuration is resolved
- **THEN** it defines no `apiKeyEnv` and its resolved API key is `not-required`
