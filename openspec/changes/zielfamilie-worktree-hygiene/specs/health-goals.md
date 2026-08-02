## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-WT-001 — Worktree and session hygiene goal family

The system SHALL define a goal family `G-WT01` through `G-WT06` in `.claude/lib/goals.md` covering
the local working state of the repository: main-checkout branch and cleanliness, stale worktrees,
worktrees holding unsaved work, orphaned agent-locks, phantom-scope agent-locks, and local `main`
divergence from `origin/main`.

Each goal SHALL be measurable through a single command whose numeric output is the goal value.

#### Scenario: Every family member is documented and measurable

- **GIVEN** `.claude/lib/goals.md` as the single source of truth for health goals
- **WHEN** the goal family is read
- **THEN** each of `G-WT01`, `G-WT02`, `G-WT03`, `G-WT04`, `G-WT05` and `G-WT06` carries a title,
  a measurement command and a meta line with priority, baseline, target, effort, cycle,
  reproducibility and ticket reference
- **AND** each measurement command resolves to an invocation of `scripts/lib/wt-hygiene-measure.sh`

### Requirement: REQ-HEALTH-GOALS-WT-002 — Positive anchor in every measurement

Every `G-WT*` measurement SHALL emit `n/a` instead of a numeric value when its measurement
precondition is not satisfied, so that a missing measurement base is reported as skipped rather
than as a met target.

The preconditions are: for `G-WT01` a resolvable main-checkout git directory; for `G-WT02` and
`G-WT04` at least one registered worktree and a resolvable `origin/main` reference; for `G-WT03`
and `G-WT06` an existing lock directory holding at least one well-formed lock; for `G-WT05` both a
local `main` and an `origin/main` reference plus a fetch not older than 24 hours.

#### Scenario: Empty measurement base reports n/a rather than zero

- **GIVEN** a repository fixture with no worktrees registered
- **WHEN** `scripts/lib/wt-hygiene-measure.sh stale-worktrees` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A populated measurement base still reports a number

- **GIVEN** a repository fixture with at least one registered worktree and a resolvable
  `origin/main` reference
- **WHEN** `scripts/lib/wt-hygiene-measure.sh stale-worktrees` is executed against it
- **THEN** the command prints a non-negative integer

### Requirement: REQ-HEALTH-GOALS-WT-003 — Heartbeat-based orphan detection

`G-WT03` SHALL classify an agent-lock as orphaned when its `owner_pid` no longer refers to a
running process OR when its `heartbeat_at` is older than twice the configured lock TTL, whichever
occurs first.

The measurement SHALL NOT rely on `owner_pid` alone, because process IDs are reused on a
long-running host, whereas a heartbeat that was never advanced is unambiguous.

#### Scenario: Never-advanced heartbeat is detected as orphaned

- **GIVEN** a lock fixture whose `heartbeat_at` equals its `created_at` and whose timestamp is
  older than twice the lock TTL
- **WHEN** `scripts/lib/wt-hygiene-measure.sh orphan-locks` is executed
- **THEN** the reported count includes that lock

#### Scenario: The live lock of the running session is not counted

- **GIVEN** a lock fixture with a running `owner_pid` and a heartbeat refreshed within the TTL
- **WHEN** `scripts/lib/wt-hygiene-measure.sh orphan-locks` is executed
- **THEN** the reported count does not include that lock

### Requirement: REQ-HEALTH-GOALS-WT-004 — Phantom-scope lock detection

`G-WT06` SHALL count agent-locks whose `scope` field is empty or begins with a hyphen, because such
a scope can only originate from a command-line flag that was consumed as a positional argument.

The measurement SHALL NOT validate the scope against a fixed list of known scope names, because
scope names are open-ended.

#### Scenario: A flag consumed as scope is counted

- **GIVEN** a lock fixture whose `scope` field holds a value beginning with a hyphen
- **WHEN** `scripts/lib/wt-hygiene-measure.sh phantom-scope-locks` is executed
- **THEN** the reported count includes that lock
- **AND** a lock with a well-formed scope in the same directory is not included

### Requirement: REQ-HEALTH-GOALS-WT-005 — Local-only measurement location

The `G-WT*` family SHALL be measured locally and SHALL NOT be evaluated as a CI gate, because a CI
runner has neither worktrees, nor agent-locks, nor a main checkout, which would render every goal
structurally green.

`task freshness:check` SHALL surface the family as a non-failing warning block when running
locally, and SHALL print a visible skip notice instead of a measurement when running in CI.

The warning block SHALL take its goal IDs from a parameterised list so that further local-only goal
families can be added to the same block.

#### Scenario: Local run surfaces the measurement

- **GIVEN** an environment where the `CI` variable is unset
- **WHEN** the local hygiene warning block executes
- **THEN** the output contains the reported `G-WT*` values
- **AND** the exit status is unaffected by those values

#### Scenario: CI run skips the measurement visibly

- **GIVEN** an environment where the `CI` variable is set
- **WHEN** the warning block executes
- **THEN** the output contains a skip notice naming the reason
- **AND** no `G-WT*` value is reported as met
