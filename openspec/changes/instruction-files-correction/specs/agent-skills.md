## ADDED Requirements

### Requirement: Root instruction files must not contradict the repository state

The three root instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) MUST NOT name systems,
tasks or deployment paths that do not exist in the repository. Specifically, they MUST NOT name
`Keycloak` as an active system — the identity provider is Pocket ID — and they MUST NOT describe
production deployment as push-only, because FluxCD is the primary pull-based path since T002083.

#### Scenario: an instruction file names Keycloak as the identity provider

- **GIVEN** `GEMINI.md` lists "Keycloak: Identity Provider (SSO/OIDC)" under Core Services
- **WHEN** the instruction-file gate in `tests/spec/agent-skills.bats` runs
- **THEN** the test fails and names the offending file

#### Scenario: all three instruction files are free of the forbidden claims

- **GIVEN** `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` name Pocket ID and describe Flux as the
  primary deployment path
- **WHEN** the instruction-file gate runs
- **THEN** the test passes

### Requirement: GEMINI.md is a pointer, not a mirror

`GEMINI.md` MUST remain a standalone file, because the `agy` harness loads a root `GEMINI.md` by
convention, but it MUST NOT duplicate architecture, service inventory or task inventory from
`CLAUDE.md`. It MUST stay within a line budget and MUST NOT contain hardcoded `task <group>:<name>`
invocations other than the MCP config generator, because `CLAUDE.md` forbids hardcoding task
commands in favour of `bash scripts/vda.sh oracle`.

#### Scenario: GEMINI.md regrows into a service and task listing

- **GIVEN** a session re-adds a "Core Services" list and a "Key Task Commands" section to
  `GEMINI.md`
- **WHEN** the instruction-file gate runs
- **THEN** the test fails on both the line budget and the forbidden-inventory checks

#### Scenario: GEMINI.md stays a pointer

- **GIVEN** `GEMINI.md` contains only the deferral to `CLAUDE.md`/`AGENTS.md` plus the
  agy-specific MCP config note
- **WHEN** the instruction-file gate runs
- **THEN** the test passes

### Requirement: Agent and runtime names in instruction files match the agent registry

The Claude Code domain agents listed in the routing tables of `CLAUDE.md` and `AGENTS.md` MUST
match the `roles:` keys of `docs/agent-guide/registry/agents.yaml`, and the opencode agents listed
in `AGENTS.md` MUST match the `runtimes:` keys of the same registry. The registry is the SSOT
established by T002304; the instruction files mirror it and MUST be provably consistent with it.

#### Scenario: an agent is added to the registry but not to the routing tables

- **GIVEN** `agents.yaml` gains a seventh entry under `roles:`
- **WHEN** the instruction-file gate runs
- **THEN** the test fails because `CLAUDE.md` and `AGENTS.md` still list only six agents

#### Scenario: an opencode runtime is missing from the AGENTS.md table

- **GIVEN** `agents.yaml` lists `orchestrator` under `runtimes:` and `AGENTS.md` omits it
- **WHEN** the instruction-file gate runs
- **THEN** the test fails and names the missing runtime
