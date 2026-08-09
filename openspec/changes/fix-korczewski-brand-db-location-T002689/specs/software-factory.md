## ADDED Requirements

### Requirement: REQ-SF-BRAND-ROWFILTER-001 — brand selects rows, not a namespace

The SDLC data path SHALL treat `brand` exclusively as a row filter on
`tickets.tickets`. Namespace resolution for the SDLC database SHALL depend only on
the kubectl context (`TICKET_CTX` / `FACTORY_CTX`) and SHALL NOT be derived from
`BRAND`.

`BRAND` SHALL still be validated against the allowed set (`mentolder`,
`korczewski`) and SHALL still be resolved with the existing precedence
(`--brand` flag > `BRAND` env > `TICKET_NS` env > default `mentolder`). An
explicitly supplied `TICKET_NS` / `FACTORY_NS` SHALL be honoured rather than
overwritten by a brand-derived value.

This requirement covers every copy of the resolution on the data path:
`scripts/ticket.sh`, `scripts/factory/lib.sh`, `scripts/factory/conflict-check.sh`
and `scripts/vda/ticket/readiness-audit.sh`. Workload-facing brand-to-namespace
mappings (deploy, promote, ingress overlays) are out of scope and SHALL remain
unchanged.

#### Scenario: korczewski resolves to the SDLC namespace

- **GIVEN** the SDLC database holds rows for both brands in a single instance
- **WHEN** a caller runs `scripts/ticket.sh --resolve-ns-only get --id T000001 --brand korczewski`
- **THEN** the resolved namespace equals the namespace resolved for `--brand mentolder`
- **AND** it is the SDLC stack namespace `workspace`, not `workspace-korczewski`

#### Scenario: factory resolution is brand-independent

- **GIVEN** `FACTORY_CTX` points at the local SDLC cluster
- **WHEN** `BRAND=korczewski FACTORY_DRY_RESOLVE=1 scripts/factory/schedule.sh` is run
- **THEN** the reported namespace equals the one reported for `BRAND=mentolder`

#### Scenario: the conflict gate resolves to a namespace that exists

- **GIVEN** `scripts/factory/conflict-check.sh` carries its own resolution copy
- **WHEN** it is dry-resolved for either brand against the local SDLC context
- **THEN** it reports the SDLC stack namespace
- **AND** it does not append a `-dev` suffix for a `k3d-*` SDLC context

#### Scenario: a korczewski ticket query returns rows

- **GIVEN** the SDLC database contains tickets with `brand = 'korczewski'`
- **WHEN** a caller runs `scripts/ticket.sh list --brand korczewski`
- **THEN** the command exits 0 and returns those rows
- **AND** rows belonging to other brands are not included

### Requirement: REQ-SF-BACKLOG-FAILCLOSED-002 — brand backlog counts fail closed

The factory SHALL NOT report an unreachable SDLC data path as an empty backlog.
A backlog count SHALL either yield a numeric value with exit code 0, or fail with a
non-zero exit code and no numeric value. Callers SHALL surface such a failure
distinctly from a legitimately empty backlog.

#### Scenario: unreachable database is not reported as zero backlog

- **GIVEN** the SDLC database cannot be reached for a brand
- **WHEN** the factory computes that brand's backlog count
- **THEN** the count fails with a non-zero exit code
- **AND** it does not emit `0`

#### Scenario: reachable database yields a count

- **GIVEN** the SDLC database is reachable
- **WHEN** the factory computes a brand's backlog count
- **THEN** it exits 0 and emits a non-negative integer

### Requirement: REQ-SF-PODERROR-ACTIONABLE-003 — pod lookup errors name the override

When a `shared-db` pod lookup fails, the error message SHALL name the namespace
queried, the kubectl context used, and the environment variable that overrides that
context (`TICKET_CTX` on the ticket path, `FACTORY_CTX` on the factory path).

#### Scenario: error message is actionable

- **GIVEN** no reachable `shared-db` pod for the resolved context
- **WHEN** any ticket CLI command fails on the pod lookup
- **THEN** the message names the namespace and the context
- **AND** the message names the override variable that changes the context
