## ADDED Requirements

### Requirement: Registry Runtimes Stay in Sync with the opencode Runtime Config

Every role listed in `docs/agent-guide/registry/agents.yaml` SHALL correspond to an
existing entry in `.opencode/agent-models.jsonc`, and the `model:` field of each
registry role SHALL match the `model` field of its `agent-models.jsonc` counterpart.
When a role is retired from `agent-models.jsonc` (e.g. consolidated into a replacement
role serving the same model), the registry entry for that role SHALL be removed in
the same change — not left behind with an updated `model:` field pointing at a role
that no longer exists.

Rationale: `tests/spec/agent-roster.bats` (P4.3, P4.3b) already enforce this
bidirectionally, but no prose requirement documented the invariant — a guard without
a written requirement is invisible to a prior-art search over `openspec/specs/`
(only a grep over `tests/spec/` finds it), which is exactly how T900164 missed that
`agents.yaml` still listed five roles (`freetoken-primary`, `freetoken-thinking`,
`freetoken-fast-1/2/3`) that T900163 had already removed from `agent-models.jsonc`
in favor of the existing `qwen38` role.

#### Scenario: A role removed from agent-models.jsonc is also removed from the registry

- **GIVEN** a role was deleted from `.opencode/agent-models.jsonc` because it was
  consolidated into another role serving the same model
- **WHEN** `docs/agent-guide/registry/agents.yaml` is inspected
- **THEN** that role is not listed there either

#### Scenario: Every registry role has a matching agent-models.jsonc entry with the same model

- **GIVEN** `docs/agent-guide/registry/agents.yaml` lists a role with a `model:` field
- **WHEN** `.opencode/agent-models.jsonc` is checked for that role
- **THEN** the role exists there **AND** its `model` value matches the registry entry
