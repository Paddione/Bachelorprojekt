## ADDED Requirements

### Requirement: REQ-HG-MEASURE-FAIL-LOUD-001

A health-goal measurement that cannot measure SHALL make that visible instead of
emitting a value indistinguishable from a real result. A measurement whose input
structure is absent, unparsable, or empty SHALL NOT report the goal as met, and
SHALL NOT be silently downgraded to "not measurable" when the cause is a broken
precondition rather than a legitimately unavailable environment.

#### Scenario: Registry structure no longer provides candidates

- **GIVEN** `docs/agent-guide/registry/mcp.yaml` contains no client with
  `transport: http`
- **WHEN** G-IF01 is measured
- **THEN** the reported value violates the goal's target and a diagnostic is
  written to stderr
- **AND** the goal is NOT reported as skipped or met

#### Scenario: Audit output cannot be parsed

- **GIVEN** `pnpm audit --json` emits output that is not valid JSON
- **WHEN** the G-DEP01 parser processes it
- **THEN** the parser exits non-zero
- **AND** it does NOT print `0`, which would read as "no high/critical
  vulnerabilities found"

#### Scenario: Legitimately unavailable environment stays skippable

- **GIVEN** `website/node_modules` is absent, as in the CI security-scan job
- **WHEN** G-DEP01 is measured
- **THEN** the goal is reported as not measurable
- **AND** no failure is raised, because the absent dependency tree is an
  environment property and not a defect

### Requirement: REQ-HG-MEASURE-ISOLATED-002

Measurement logic whose only execution path is a full check run SHALL be
extractable into a helper that accepts its input on stdin, so it can be verified
against fixtures without the runtime cost or environment prerequisites of the
real data source.

#### Scenario: Audit parser verified without a package manager run

- **GIVEN** a fixture containing a pretty-printed `pnpm audit --json` object with
  an `advisories` map holding one `high` and one `critical` entry
- **WHEN** the fixture is piped into `scripts/lib/pnpm-audit-count.py`
- **THEN** it prints `2` and exits zero

#### Scenario: Outdated parser survives a producer that exits non-zero

- **GIVEN** a producer that writes valid `pnpm outdated --format json` output and
  then exits 1, as pnpm does whenever outdated packages exist
- **WHEN** it is piped into `scripts/lib/pnpm-outdated-majors.py` under
  `set -uo pipefail`
- **THEN** the major-version count is printed as the sole output token
- **AND** no fallback token is appended after it

### Requirement: REQ-HG-MEASURE-PORTS-003

An endpoint-reachability measurement SHALL only consider registry entries that
declare a network endpoint. Entries started as a subprocess expose no port and
SHALL be excluded from both the numerator and the denominator.

#### Scenario: stdio clients are not counted as unreachable

- **GIVEN** the registry declares four `transport: http` clients and nine
  `transport: stdio` clients
- **WHEN** G-IF01 is measured while no local MCP server is listening
- **THEN** the reported count of dead endpoints is at most four

### Requirement: REQ-HG-GENERATED-JSON-PATH-004

Every component that reads the generated goals JSON SHALL reference the path the
generator actually writes. A reader that cannot find the file SHALL NOT terminate
with a success status.

#### Scenario: Reader path follows the generator

- **GIVEN** `scripts/gen-goals-data.mjs` writes to
  `website/src/lib/sdlc/goals-data.generated.json`
- **WHEN** `scripts/health-goals-update.sh`, `scripts/health-goals-llm-fill.sh`
  or `scripts/factory/auto-close-merged.sh` reference that artifact
- **THEN** each reference resolves to an existing file
