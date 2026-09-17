## ADDED Requirements

### Requirement: factory.model in loadouts.json is vestigial and stays a valid slug

`factory.model` in `scripts/llm/loadouts.json` is NOT a routing input. Its
only reader was the llm-proxy pin (`GET /admin/factory` via
`factory_model_pin`), removed with the proxy in T900208 („Model choice is
`FACTORY_MODEL_ID` plus the `provider_config` chain"). The key is retained
exclusively because the loadouts schema validator
(`scripts/llm-proxy/loadouts.mjs:291-299`, covered by
`scripts/llm-proxy/factory-pin.test.mjs`) requires `factory` — when present —
to hold a non-empty `model` string matching an existing loadout slug.

Consequences, all SHALLs:

- The value SHALL remain the slug of an existing (even if disabled) loadout
  entry. Today that is `qwen38-220k`.
- The value SHALL NOT be set to a backend/provider name such as
  `freetoken-local`: no such loadout exists, the schema validation would fail
  (`factory.model '…' existiert nicht in loadouts`), and the T900164 guard
  (`tests/spec/local-llm-proxy/factory-default-not-freetoken.bats`) forbids
  exactly that edit.
- No routing surface SHALL read `factory.model` back into a routing decision;
  model choice stays `FACTORY_MODEL_ID` plus the `provider_config` chain
  (T900208).

Rationale: without this requirement, every future model-drift analysis will
„fix" the stale-looking `qwen38-220k` value into a red CI (observed during
T900213 planning). The stale look is load-bearing schema compat, not drift.

#### Scenario: vestigial value passes schema validation

- **GIVEN** `scripts/llm/loadouts.json` with `factory.model = qwen38-220k`
- **WHEN** `parseLoadouts` (loadouts.mjs) validates the document
- **THEN** validation succeeds and `factoryModel()` returns `qwen38-220k`,
  which no routing surface consumes

#### Scenario: a non-slug factory.model fails fast

- **GIVEN** a hypothetical `factory.model = freetoken-local`
- **WHEN** `parseLoadouts` validates the document
- **THEN** validation fails naming the unknown slug, and the T900164 guard
  fails naming the forbidden value
