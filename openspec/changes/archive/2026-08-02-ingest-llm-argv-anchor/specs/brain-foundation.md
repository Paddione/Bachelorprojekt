## ADDED Requirements

### Requirement: argv secret test measures during an open request

The BATS test asserting that `LM_API_KEY` never appears in any process command line SHALL
perform its measurement while the HTTP request to the stub is still open, rather than by
polling the process tree for the lifetime of a short-lived background job.

The stub SHALL support an optional gate directory. When a gate is supplied, the request
handler SHALL signal arrival of the request, then hold the response until the test releases
it. When no gate is supplied, the stub SHALL behave exactly as before, so that existing
callers remain unaffected.

Rationale: the transform process lives roughly 35 ms while one polling iteration costs
11–23 ms, admitting only 2–4 samples. On a CI runner with four parallel shards this collapses
to a single sample and the test fails sporadically without any defect in the code under test.

#### Scenario: The key is absent from every command line while the request is open

- **GIVEN** the stub is started with a gate directory
- **AND** `LM_API_KEY` is exported rather than passed via `env VAR=… cmd`
- **WHEN** the transform has issued its request and the stub is holding the response open
- **THEN** no process command line contains the key
- **AND** the test releases the stub and the transform exits with status 0

#### Scenario: The measurement is proven to be capable of observing the process

- **GIVEN** the stub is holding the request open
- **WHEN** the test inspects the process table
- **THEN** the running transform is visible in it

Without this anchor the assertion above would hold vacuously whenever the process table
yields nothing, reporting "no key found" when the true state is "nothing was measured".

#### Scenario: A request that never arrives is reported as such

- **GIVEN** the stub never records an incoming request
- **WHEN** the test has waited 10 seconds for the arrival signal
- **THEN** the test fails with a message distinguishing an unreachable endpoint from a leaked key

#### Scenario: Existing stub callers are unaffected

- **GIVEN** a test that starts the stub without a gate directory
- **WHEN** that test runs
- **THEN** the stub responds immediately, exactly as before this change
