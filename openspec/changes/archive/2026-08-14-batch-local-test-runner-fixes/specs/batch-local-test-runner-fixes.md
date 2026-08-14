# Delta: batch-local-test-runner-fixes

## ADDED Requirements

### Requirement: Cockpit Vitest Suite mocks relative paths accurately

The system SHALL use correct relative import and mock paths for auth and database modules in `website/src/lib/sdlc/tickets/__tests__/` so that tests execute isolated in-memory and pass without connecting to external cluster services.

#### Scenario: Running cockpit API unit tests

- **GIVEN** unit tests in `website/src/lib/sdlc/tickets/__tests__/cockpit-api.test.ts`
- **WHEN** vitest executes the test suite locally
- **THEN** authentication and database mocks are applied correctly and tests pass with expected status codes (200, 400, 504) without requiring cluster services.

### Requirement: Local test:changed skips E2E website gracefully when port 4321 is not reachable

The system SHALL check whether `localhost:4321` is reachable before attempting to run `RUN_E2E_WEBSITE` tests in `task test:changed`, emitting an informative skip notice instead of timing out.

#### Scenario: Running task test:changed without local website dev server

- **GIVEN** code changes under `website/` and no running dev server on `localhost:4321`
- **WHEN** `task test:changed` is executed locally
- **THEN** `RUN_E2E_WEBSITE` detects that port 4321 is unreachable, skips E2E execution with an explanation, and does not block the command.

### Requirement: Code Quality import cycle gate resolves madge across worktrees

The system SHALL resolve the `madge` binary location reliably across worktrees and local execution environments in `scripts/code-quality/gates/s2-cycles.mjs`.

#### Scenario: Running S2 import cycle gate in a git worktree

- **GIVEN** an active git worktree
- **WHEN** `task test:code-quality` or S2 gate runs
- **THEN** `madge` is executed without ENOENT errors.

