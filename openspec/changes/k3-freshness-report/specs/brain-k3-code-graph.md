## MODIFIED Requirements

### Requirement: Periodischer Graph-Refresh (REQ-k3-05)

The repository SHALL refresh the code graph through the shared single-flight wrapper and
skip only when validated freshness evidence explicitly reports fresh. Missing, failed or
malformed evidence SHALL report unknown with reasons rather than fresh-skip. The scheduler
SHALL NOT initiate refresh for a mismatched project/root or missing index tool.

#### Scenario: Probe failure at tick time

- **GIVEN** detect_changes exits nonzero, times out or returns invalid/error data
- **WHEN** cron evaluates freshness, including dry-run
- **THEN** it reports unknown and a nonzero exit, never fresh-skip

#### Scenario: Safe initial or stale refresh

- **GIVEN** target identity and tool probes are valid and a receipt is absent or index state has drifted
- **WHEN** the scheduler refreshes
- **THEN** it uses the shared single-flight wrapper and reports the outcome
- **AND** a wrong-root or missing-tool condition prevents indexing

## ADDED Requirements

### Requirement: Explicit read-only freshness evidence (REQ-k3-06)

The repository SHALL expose a read-only JSON status command with repository/project options
and bounded probe timeout. It SHALL distinguish fresh/stale/unknown and reasons, graph
metadata, successful-index receipt, checkout HEAD, local origin/main SHA, distinct local
changed/untracked paths and project/root identity. Index-vs-checkout and checkout-vs-upstream
SHALL be separate; snapshots SHALL NOT claim semantic index completeness.

#### Scenario: Checkout behind local upstream

- **GIVEN** a valid clean receipt matches checkout state while local origin/main is ahead
- **WHEN** status is requested
- **THEN** index freshness and upstream lag are reported separately
- **AND** upstream lag alone does not request reindexing or perform a fetch

#### Scenario: Unknown or dirty evidence

- **GIVEN** a missing receipt, failed/malformed probe, wrong worktree or local dirty/untracked state
- **WHEN** status is requested
- **THEN** it does not claim a clean fresh index and reports the evidence and reasons
- **AND** status performs no writes, fetch or indexing

### Requirement: Verified successful-index receipt (REQ-k3-07)

The wrapper SHALL atomically record index success while holding its shared lock only when
the subprocess succeeds, the tool result has no error and before/after repository state is
stable. The receipt SHALL identify timestamp, SHA, canonical root, project, mode, tool version,
state fingerprint and dirty state. Failed refreshes SHALL preserve the previous valid receipt.

#### Scenario: Stable successful indexing

- **GIVEN** JSON repo_path identifies a repository different from the wrapper caller's cwd
- **WHEN** indexing succeeds with a valid result and stable state
- **THEN** the receipt records the target repository and is replaced atomically under the lock
- **AND** a dirty success is explicitly dirty rather than described as clean freshness

#### Scenario: Identical dirty snapshot

- **GIVEN** a valid successful receipt matches the same dirty working-tree contents
- **WHEN** freshness is requested repeatedly
- **THEN** it can report fresh with explicit dirty state without reindexing unchanged dirtiness

#### Scenario: Failed or unstable indexing

- **GIVEN** a valid previous receipt
- **WHEN** indexing fails, returns a tool error or observes changed repository state
- **THEN** the previous receipt remains unchanged and the failure is observable
- **AND** a separate attempt marker prevents the old receipt being trusted after partial writes
- **AND** external database replacement or mutation invalidates freshness evidence
