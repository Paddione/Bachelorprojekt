## MODIFIED Requirements

### Requirement: Every claimed provider slot is released on all return paths

Any script or program that obtains a slot from `scripts/factory/route-provider.sh` SHALL release
it again on **every** return path, including error paths. A claim increments
`tickets.provider_health.active_agents`; a provider whose counter reaches `max_concurrent` is
silently skipped by the candidate chain, without any error being surfaced to the caller.

Scripts that claim more than once per run SHALL NOT rely on an `EXIT` trap alone, because such a
trap releases only the final claim.

This SHALL hold for non-shell callers as well: `factory-mcp` (`scripts/factory/mcp-go/main.go`,
Go), the MCP tool `factory_ask`'s only production caller of `route-provider.sh`, SHALL invoke
`scripts/factory/release-slot.sh <slotId> <success> <ctx>` after every LLM request it issues,
regardless of whether the request succeeded, failed, or the process returned early — mirroring
the shell-caller obligation above rather than being exempt from it because the caller happens to
be compiled Go instead of bash.

#### Scenario: The triage helper releases its slot after a successful call

- **GIVEN** `auto-triage.sh` has routed a ticket and holds a slot for provider `deepseek`
- **WHEN** the LLM call completes successfully
- **THEN** `active_agents` for `deepseek` is back at its pre-call value

#### Scenario: The triage helper releases its slot after a failed call

- **GIVEN** `auto-triage.sh` holds a slot and the downstream `curl` fails
- **WHEN** the helper returns a non-zero status
- **THEN** the slot is released just as on the success path

#### Scenario: A provider at its concurrency cap is skipped, not reported

- **GIVEN** `tickets.provider_health.active_agents` for a provider equals its `max_concurrent`
- **WHEN** `route-provider.sh` walks the candidate chain
- **THEN** that provider is passed over and the next candidate is claimed instead

#### Scenario: factory-mcp releases its slot after a successful factory_ask call

- **GIVEN** `factory_ask` routed to a provider and holds a slot (`slotId` non-null)
- **WHEN** the LLM chat-completion request returns successfully
- **THEN** `scripts/factory/release-slot.sh <slotId> true <ctx>` is invoked before the tool
  returns its answer

#### Scenario: factory-mcp releases its slot after a failed factory_ask call

- **GIVEN** `factory_ask` routed to a provider and holds a slot
- **WHEN** the LLM request errors (network failure, non-2xx status, or unparsable body)
- **THEN** `scripts/factory/release-slot.sh <slotId> false <ctx>` is invoked before the tool
  returns its error

#### Scenario: factory-mcp does not attempt to release a null slot

- **GIVEN** `route-provider.sh` returned `slotId:null` (opus/emergency lookup, no claim made)
- **WHEN** `factory_ask` completes
- **THEN** no release call blocks the response, matching `release-slot.sh`'s own no-op for a
  null/empty provider argument

## ADDED Requirements

### Requirement: factory_ask authenticates with the routed provider's API key

`factory_ask` (`scripts/factory/mcp-go/main.go`) SHALL authenticate its LLM chat-completion
request with the credential named by the `apiKeyEnv` field of the `route-provider.sh` response
(the environment variable holding that provider's real secret), not with a hardcoded literal.

When `apiKeyEnv` is empty/null (a local, unauthenticated backend) or the named environment
variable is itself unset, `factory_ask` SHALL fall back to
`envOr("FACTORY_LLM_API_KEY", "lmstudio")` as the last resort, so local backends that need no
real credential keep working and a misrouted external provider fails on an already-known,
documented fallback value rather than silently sending an empty bearer token.

#### Scenario: A local, unauthenticated route needs no real secret

- **GIVEN** `route-provider.sh` returns `apiKeyEnv:null` for the llamacpp candidate
- **WHEN** `factory_ask` builds its request
- **THEN** the `Authorization` header carries the `FACTORY_LLM_API_KEY`/`lmstudio` fallback, not
  an attempt to read an empty variable name

#### Scenario: A routed external provider is authenticated with its real key

- **GIVEN** `route-provider.sh` falls back to `deepseek` and returns
  `apiKeyEnv:"DEEPSEEK_API_KEY_PK"`, with that environment variable set to a real secret
- **WHEN** `factory_ask` builds its request
- **THEN** the `Authorization` header carries the value of `DEEPSEEK_API_KEY_PK`, not the
  literal `lmstudio`

#### Scenario: A routed provider's named key variable is unset

- **GIVEN** `route-provider.sh` returns `apiKeyEnv:"SOME_UNSET_VAR"` and that variable is not
  set in the process environment
- **WHEN** `factory_ask` builds its request
- **THEN** it falls back to `FACTORY_LLM_API_KEY`/`lmstudio` instead of sending an empty bearer
  token
