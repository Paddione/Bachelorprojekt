## ADDED Requirements

### Requirement: Provider configuration declares data residency

`tickets.provider_config` SHALL carry a `data_residency` column with exactly two
permitted values: `on_premises` and `external`. The value states who operates the
machine that processes the payload, not the legal jurisdiction it sits in.

The migration SHALL set every existing row to `external`. Residency is therefore
fail-closed: a provider is treated as external until someone declares otherwise, so a
forgotten entry causes a refusal rather than a silent transfer.

The existing `eu_endpoint` column SHALL remain untouched and SHALL NOT be reused for this
purpose. It answers a different question — a vendor's EU endpoint is inside the EU and
still outside this project's infrastructure — and overloading it would destroy the
ability to express both facts.

#### Scenario: Existing rows default to external

- **GIVEN** provider rows that predate the migration
- **WHEN** the migration has run
- **THEN** every one of them carries `data_residency = 'external'`

#### Scenario: An invalid residency value is rejected

- **GIVEN** an attempt to write a `data_residency` value other than `on_premises` or
  `external`
- **WHEN** the write is executed
- **THEN** the database rejects it

### Requirement: The coaching path refuses external providers

Any LLM request carrying coaching or questionnaire content SHALL resolve its provider
only if that provider declares `data_residency = 'on_premises'`. On any other value —
including a missing declaration — the request SHALL fail with an error naming the
provider and the reason, and SHALL NOT transmit the payload.

There SHALL be no fallback to another provider on refusal. This mirrors ADR-004, where
the same principle already governs embeddings: a clear failure beats a silently wrong
result. Here the wrong result would be an unnoticed transfer of client data.

The refusal SHALL happen before any network call is attempted, so that a misconfiguration
cannot leak the payload while producing an error afterwards.

#### Scenario: A session on an external provider is refused

- **GIVEN** a coaching session whose provider config declares `external`
- **WHEN** a generation is requested
- **THEN** it fails with an error naming the provider, and no request reaches the provider

#### Scenario: A session on an on-premises provider proceeds

- **GIVEN** a coaching session whose provider config declares `on_premises`
- **WHEN** a generation is requested
- **THEN** the request proceeds normally

#### Scenario: A missing declaration is treated as external

- **GIVEN** a provider config whose `data_residency` is absent or null
- **WHEN** a coaching generation is requested
- **THEN** it is refused exactly as an explicit `external` would be

#### Scenario: Refusal precedes the network call

- **GIVEN** a coaching session on an external provider and an unreachable endpoint
- **WHEN** a generation is requested
- **THEN** the error names the residency refusal, not a connection failure — proving the
  check ran first

### Requirement: The proxy offers a local-only request mode

The llm-proxy SHALL accept a request property that forbids serving the request from a
backend of a remote kind. Under this mode the proxy SHALL select only local backends and
SHALL fail when none is available, instead of substituting a remote one.

This exists so that coaching traffic keeps the proxy's slot queue and loadout management
instead of addressing a backend directly, while never inheriting the priority chain's
fallback to `openai-remote`.

The mode SHALL interact with draining as follows: while a training lock drains the local
backends (see the GPU arbitration change), a local-only request SHALL fail. That failure
is the intended behaviour — the alternative is the transfer this change exists to
prevent.

#### Scenario: A local-only request is not served by a remote backend

- **GIVEN** a request marked local-only, no healthy local backend, and a healthy remote one
- **WHEN** the proxy selects a backend
- **THEN** it fails, and the remote backend is not used

#### Scenario: A local-only request is served locally when possible

- **GIVEN** a request marked local-only and a healthy local backend
- **WHEN** the proxy selects a backend
- **THEN** it is served by the local backend

#### Scenario: Draining makes local-only requests fail rather than escape

- **GIVEN** a held training lock draining the local backends, and a healthy remote backend
- **WHEN** a local-only request arrives
- **THEN** it fails and the remote backend is not used

#### Scenario: Ordinary requests keep their fallback

- **GIVEN** a request NOT marked local-only and no healthy local backend
- **WHEN** the proxy selects a backend
- **THEN** it is served by the remote backend as before
