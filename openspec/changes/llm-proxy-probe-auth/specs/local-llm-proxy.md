## ADDED Requirements

### Requirement: Health probe authenticates like the forwarding path

The health probe SHALL carry the same credential as the request-forwarding path. When a backend
declares an `api_key_env` and that variable resolves to a non-empty value, the probe request to
`GET {baseUrl}/models` SHALL send `Authorization: Bearer <key>`. When a backend declares no
`api_key_env`, the probe SHALL send no `Authorization` header, so local llama.cpp servers keep
their current behaviour.

A backend that answers the authenticated probe successfully SHALL be reported as healthy and its
model catalogue SHALL enter discovery — the credential state of the probe MUST NOT be able to
mark a reachable backend as dead.

#### Scenario: Remote backend with a resolvable key is healthy

- **GIVEN** an enabled backend of kind `openai-remote` whose `api_key_env` resolves to the value
  the remote API accepts
- **AND** the remote API answers `GET /v1/models` with HTTP 401 when no credential is presented
- **WHEN** the discovery loop probes that backend
- **THEN** the probe carries `Authorization: Bearer <key>`, the backend is reported healthy, and
  the model ids from the response enter the discovery catalogue

#### Scenario: Remote backend without a resolvable key stays unhealthy

- **GIVEN** an enabled backend of kind `openai-remote` whose `api_key_env` is unset in the
  process environment
- **WHEN** the discovery loop probes that backend
- **THEN** no `Authorization` header is sent, the backend is reported unhealthy, and no model ids
  from it enter the catalogue

#### Scenario: Local backend is probed without a credential

- **GIVEN** an enabled backend that declares no `api_key_env`
- **WHEN** the discovery loop probes that backend
- **THEN** the probe request carries no `Authorization` header

### Requirement: A failed probe records why it failed

A probe that transitions a backend from healthy to unhealthy SHALL emit exactly one log line
naming the backend and the reason — an HTTP status code when the backend answered, the error
otherwise. The line SHALL NOT be repeated while the backend stays unhealthy, so interval polling
cannot flood the journal.

The rationale is diagnostic separability: an authentication failure (HTTP 401) and an
unreachable host produce the same `healthy: false` today, which is why a misconfigured
credential can persist unnoticed.

#### Scenario: Authentication failure is distinguishable from unreachability

- **GIVEN** a healthy backend whose remote API starts answering the probe with HTTP 401
- **WHEN** the discovery loop probes it twice in a row
- **THEN** exactly one log line is emitted, and it names the backend and the status code 401

#### Scenario: A backend that stays unhealthy does not repeat its log line

- **GIVEN** a backend that is already unhealthy
- **WHEN** the discovery loop probes it again with the same failure
- **THEN** no further log line is emitted for that backend

### Requirement: Every proxy test file is registered in a runner

Every `scripts/llm-proxy/*.test.mjs` file SHALL be referenced by the `test:llm-proxy` task in
`Taskfile.yml` and by the llm-proxy step in `.github/workflows/ci.yml`. A test file that exists
but runs in no target is not regression protection.

The lists in both files are hand-maintained and therefore structurally incomplete; the guard
below holds them against the files actually present on disk.

#### Scenario: An unregistered test file fails the guard

- **GIVEN** a file `scripts/llm-proxy/<name>.test.mjs` that appears in neither runner list
- **WHEN** the guard runs
- **THEN** it fails and names the unregistered file

#### Scenario: The current tree passes the guard

- **GIVEN** the repository as committed by this change
- **WHEN** the guard runs
- **THEN** it passes, and every test file under `scripts/llm-proxy/` is named in both runners
