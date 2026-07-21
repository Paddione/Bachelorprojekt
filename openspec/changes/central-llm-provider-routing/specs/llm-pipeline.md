## ADDED Requirements

### Requirement: Single Provider-Selection Authority

The system SHALL resolve every LLM provider decision (automatic tier-based routing and explicit
user/admin provider choice) exclusively through `getProviderConfig(source, tier)` or
`getProviderByName(providerName, brand?)` in `website/src/lib/provider-config.ts` for Node/TS
callers, and exclusively through `scripts/factory/route-provider.sh` for non-TS callers (bash, Go).
No call site SHALL maintain an independent hardcoded provider→URL or provider→model-default table,
and no call site SHALL read `process.env.ANTHROPIC_API_KEY` (or any other provider API key env var)
directly as a provider-resolution fallback.

#### Scenario: Explicit provider choice resolves via getProviderByName

- **GIVEN** a coaching session configuration with `provider = 'deepseek'`
- **WHEN** `openai-compatible-session-agent.ts` needs the endpoint/API key for that session
- **THEN** it calls `getProviderByName('deepseek', brand)` instead of its own `resolveEndpoint()`
  URL map, and receives `{provider, modelId, baseUrl, apiKey}` from `tickets.provider_config`

#### Scenario: Disabled provider is rejected, not silently substituted

- **GIVEN** `tickets.provider_config` has a row for `provider = 'openai'` with `enabled = false`
- **WHEN** any call site invokes `getProviderByName('openai', brand)`
- **THEN** the system throws a typed error identifying the disabled provider, and does NOT fall
  back to a raw `process.env` API key or a hardcoded default endpoint

#### Scenario: Non-TS caller resolves through route-provider.sh

- **GIVEN** the `factory_ask` MCP tool (`scripts/factory/mcp-go/main.go`) needs a provider for tier `plan`
- **WHEN** the tool handler runs
- **THEN** it invokes `scripts/factory/route-provider.sh factory-mcp plan` and parses its JSON output,
  instead of using its own `FACTORY_LLM_URL`/`FACTORY_LLM_MODEL`/`FACTORY_LLM_API_KEY` env defaults

### Requirement: Bonsai-Only Provider Configuration via Data, Not Code

The system SHALL determine which provider is active purely from `tickets.provider_config.enabled`
rows, so that activating or deactivating a provider requires only a data change, never a code change.

#### Scenario: Only ternary-bonsai-27b is enabled

- **GIVEN** the seed migration `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql` has run
- **WHEN** `getProviderConfig(source, tier)` or `route-provider.sh <source> <tier>` is called for any
  source/tier combination
- **THEN** the resolved provider is `ternary-bonsai-27b` with `baseUrl = http://127.0.0.1:18235`
  (the fixup proxy — never `:8093` directly)

#### Scenario: Re-enabling a provider needs no code change

- **GIVEN** an operator runs `UPDATE tickets.provider_config SET enabled = true WHERE provider = 'deepseek'`
- **WHEN** a call site next resolves a provider for a source/tier that includes a `deepseek` row
- **THEN** `deepseek` becomes selectable again without any deployment or code change

### Requirement: Cooldown and Circuit-Breaker Remain Active in Single-Provider Mode

The system SHALL keep the existing cooldown/circuit-breaker mechanism (`tickets.provider_health`)
active even when only one provider is enabled, so that repeated failures against that provider do
not cause unbounded retries.

#### Scenario: Bonsai server unreachable triggers cooldown, not silent retry storm

- **GIVEN** `ternary-bonsai-27b` is the only enabled provider and its health check fails
  `FAILURE_THRESHOLD` times in a row
- **WHEN** a subsequent call resolves a provider
- **THEN** the system returns the documented emergency-fallback response (marked `emergency: true`)
  instead of repeatedly claiming a slot on a provider in cooldown
