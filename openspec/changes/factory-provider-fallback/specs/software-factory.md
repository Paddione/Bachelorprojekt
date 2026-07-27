## ADDED Requirements

### Requirement: Phase Pin Is the First Candidate, Not a Shortcut

`scripts/factory/route-provider.sh` SHALL treat a matching row in `tickets.factory_model_slots` as
the highest-priority candidate of the same selection chain that evaluates `tickets.provider_config`,
and SHALL NOT return from the phase branch without passing through the cooldown check and the atomic
slot claim. A phase pin expresses a preference, not a bypass: returning early skipped the priority
chain, `provider_health`, the cooldown window and the claim entirely, which made the whole fallback
logic dead code for the `plan`, `implement` and `verify` phases.

#### Scenario: Pinned provider is claimed like any other candidate

- **GIVEN** `tickets.factory_model_slots` holds a row for phase `implement`
- **WHEN** `route-provider.sh factory-implement sonnet` runs against a reachable database
- **THEN** the pinned provider is offered to the same claim loop as the `provider_config` rows, and
  the emitted JSON carries a non-null `slotId` because a slot was actually claimed

#### Scenario: Blocked pin falls through to the next candidate

- **GIVEN** the pinned provider for a phase sits at `active_agents = max_concurrent`
- **WHEN** the router resolves that phase
- **THEN** the pin is skipped and the next candidate from `provider_config` is claimed, instead of
  the router returning the blocked provider

#### Scenario: Exhausted chain is announced, not returned silently

- **GIVEN** every candidate for a source/tier is claimed out or on cooldown
- **WHEN** the router falls through to the emergency branch
- **THEN** it writes a diagnostic naming the source and tier to stderr, and the emitted JSON carries
  `emergency: true` together with a model id that a reachable backend actually serves

### Requirement: Provider API Keys Are Resolved by Variable Name from the Routing Row

The routing row SHALL carry the **name** of the environment variable holding the provider's API key
in `api_key_env`, the router SHALL emit it as `apiKeyEnv`, and callers SHALL resolve the key by
indirection over that name. No caller SHALL map provider names to key variables itself: a provider
name cannot distinguish two accounts of the same vendor, which is how the factory ended up sending
the coaching key `DEEPSEEK_API_KEY` instead of the factory key `DEEPSEEK_API_KEY_PK`.

The column SHALL never hold a key value. Keys stay git-crypt-encrypted in the environment secrets.

#### Scenario: Caller resolves the factory key, not the coaching key

- **GIVEN** the routing row for the factory's `deepseek` candidate has `api_key_env = 'DEEPSEEK_API_KEY_PK'`
- **WHEN** `auto-triage.sh` builds the request for that provider
- **THEN** it reads the variable named by `apiKeyEnv` and uses the factory account's key

#### Scenario: Provider without a key stays usable

- **GIVEN** a routing row for a local backend with `api_key_env` NULL
- **WHEN** a caller resolves the key for that route
- **THEN** no key is set and no `Authorization` header is sent, and the call proceeds normally

#### Scenario: Missing key is reported, not silently empty

- **GIVEN** a routing row names an environment variable that is unset in the caller's environment
- **WHEN** the caller resolves the key
- **THEN** it writes a diagnostic naming the missing variable to stderr

### Requirement: Every Factory Tier Has a Fallback Candidate Behind the Primary

`tickets.provider_config` SHALL hold at least two `enabled` candidates for each tier the factory
actually requests (`cheap`, `flash`, `sonnet`), so that the cascade has something to fall to. The
stages SHALL be layered by failure domain: the local proxy first, the local backend directly second
(covering a proxy outage while the backend runs), and a cloud provider third (covering a total
outage of the GPU host).

#### Scenario: Each requested tier offers more than one candidate

- **GIVEN** the cascade migration has been applied
- **WHEN** the enabled `source = '*'` rows are counted per tier for `cheap`, `flash` and `sonnet`
- **THEN** every one of those tiers has at least two candidates

#### Scenario: Cloud stage carries its key variable name

- **GIVEN** the third-stage cloud candidate of a factory tier
- **WHEN** its routing row is read
- **THEN** `api_key_env` names the factory account's key variable and `base_url` addresses the
  OpenAI-compatible path that the callers append `/v1/chat/completions` to

### Requirement: Configured Model IDs Are Checked Against Live Backends

The system SHALL provide a check (`scripts/llm/routing-check.sh`, exposed as `task llm:routing:check`)
that fails when a configured model id is served by no reachable local backend. It SHALL cover both
sources of model ids — the routing tables in the database and the factory environment file — because
`resolveModel()` in the llm-proxy silently redirects unknown models to the first healthy backend,
so a drifted id produces no error anywhere on its own.

#### Scenario: Phantom model id fails the check

- **GIVEN** a configured model id that no reachable local backend serves
- **WHEN** the check runs with at least one backend reachable
- **THEN** it names the offending id and its source on stderr and exits non-zero

#### Scenario: Check is fail-soft without any backend

- **GIVEN** no local backend answers
- **WHEN** the check runs
- **THEN** it reports that it was skipped and exits zero, because it cannot make any statement

#### Scenario: Cloud endpoints are not probed

- **GIVEN** a routing row whose `base_url` addresses an `https://` cloud endpoint
- **WHEN** the check runs
- **THEN** that row is skipped, because its catalogue is not retrievable without an API key

## MODIFIED Requirements

### Requirement: Orphaned provider slots are reclaimed after a TTL

`tickets.provider_health` SHALL record `claimed_at` for every active claim, and
`scripts/factory/reap-provider-slots.sh` SHALL release **all** claims of a row whose `claimed_at` is
older than `PROVIDER_SLOT_TTL_MIN` (default 30) by setting `active_agents` and `reserved_tokens` to
zero. The TTL SHALL stay well above the runtime of a single LLM request — a shorter value would
release slots of requests still in flight and thereby defeat the concurrency limit it is meant to
protect.

Zeroing rather than decrementing is required for correctness, not merely for speed: `claimed_at`
records the **most recent** claim of a row, so a row that qualifies holds no fresh claim at all and
every slot on it is orphaned. Decrementing by one while clearing `claimed_at` in the same statement
made the row unreachable after the first run, because `claimed_at IS NOT NULL` never matched again —
the counter stayed permanently above zero and the provider was skipped by the candidate chain for good.

The reaper SHALL be invoked once per factory tick from `scripts/factory/wakeup.sh`, before the tick
claims any candidates. It is deliberately bound to the tick rather than to an independent timer: a
reaper that runs while the factory is stopped could reclaim slots of requests that are still active.

#### Scenario: A stale claim is reclaimed completely

- **GIVEN** a provider row with several concurrent claims whose `claimed_at` is older than the TTL
- **WHEN** the reaper runs once
- **THEN** `active_agents` and `reserved_tokens` are zero and `claimed_at` is reset to `NULL`

#### Scenario: A fresh claim is left alone

- **GIVEN** a provider row whose `claimed_at` lies within the TTL
- **WHEN** the reaper runs
- **THEN** the row is left untouched

#### Scenario: Releasing one of several concurrent claims keeps the timestamp

- **GIVEN** a provider holds more than one concurrent claim
- **WHEN** `release-slot.sh` releases one of them
- **THEN** `claimed_at` is retained, so the reaper can still see the remaining claim

#### Scenario: The reaper runs on every factory tick

- **GIVEN** a factory tick starts
- **WHEN** `wakeup.sh` prepares the tick
- **THEN** it invokes the reaper before dispatching, best-effort, so a reaper failure never aborts
  the tick
