## ADDED Requirements

### Requirement: Hybrid runner placement for pull-request CI

The system SHALL execute portable pull-request validation jobs on GitHub-hosted Linux
runners while reserving self-hosted runners for jobs with a documented dependency on local
GPU, private-network, cluster, or persistent host infrastructure.

The portable set SHALL include BATS and quality gates, manifest validation, Factory fast
validation, every Factory spec shard, the Factory aggregator, security scanning, Brett
TypeScript, website Vitest, Lighthouse, and conventional-commit validation. Their existing
job names, triggers, dependencies, timeouts, pinned tool versions, and failure semantics SHALL
remain unchanged.

Jobs requiring local infrastructure SHALL use a specific self-hosted capability label rather
than the generic `self-hosted, linux, x64` pool. The `opencode` and merge-arbitration jobs
SHALL remain on the `fleet-gpu` runner class while they require the local LLM/GPU path.

#### Scenario: Portable gates fan out onto GitHub-hosted capacity

- **GIVEN** a same-repository pull request triggers the CI workflow
- **WHEN** GitHub schedules the portable validation jobs
- **THEN** each portable job requests `ubuntu-latest`
- **AND** the four Factory spec shards can execute concurrently without consuming either self-hosted runner slot

#### Scenario: A local GPU job remains self-hosted

- **GIVEN** a workflow job requires the local LLM or GPU endpoint
- **WHEN** its runner placement is evaluated
- **THEN** the job requests `self-hosted` and the specific `fleet-gpu` label
- **AND** it is not silently routed to a GitHub-hosted runner

#### Scenario: Required check identities remain stable

- **GIVEN** branch protection requires the existing static PR check names
- **WHEN** runner placement changes
- **THEN** every required job retains its existing `name`
- **AND** no branch-protection update is required for the migration

### Requirement: Fork-safe execution boundary

The system SHALL permit portable, secret-free validation of fork pull requests on
GitHub-hosted runners while preventing untrusted fork code from executing on self-hosted
runners or receiving repository secrets.

Secret-dependent or write-capable jobs SHALL retain an explicit same-repository guard or an
equivalent event and permission boundary. Removing a self-hosted fork guard SHALL be allowed
only when the complete job has moved to GitHub-hosted infrastructure and does not expose a
secret to fork-triggered steps.

#### Scenario: Fork code does not execute on repository hardware

- **GIVEN** a pull request originates from a fork
- **WHEN** its workflows are scheduled
- **THEN** portable validation may execute on GitHub-hosted runners
- **AND** no job containing untrusted fork code is assigned to a self-hosted runner
- **AND** repository secrets are not exposed to the fork

#### Scenario: Secret-dependent PR automation is guarded

- **GIVEN** a PR automation job requires a repository secret or write permission
- **WHEN** the pull request originates from a fork
- **THEN** the sensitive job or step is skipped by an explicit trusted-repository boundary
- **AND** the workflow does not fail open by substituting missing secrets

### Requirement: Runner placement regression guard and performance evidence

The system SHALL provide an automated repository test that verifies the intended hosted and
self-hosted job sets and SHALL fail when a portable job is moved back to the generic
self-hosted pool or a local-only job loses its capability label.

The migration SHALL record before-and-after GitHub Actions timing evidence using job creation,
start, and completion timestamps. The target SHALL be at least a 40 percent reduction in
end-to-end PR CI duration for a representative full run; if the target is not reached, the
implementation SHALL document the measured result and identified residual bottleneck.

#### Scenario: Portable job regresses to the constrained pool

- **GIVEN** a portable required job is changed from `ubuntu-latest` to generic self-hosted labels
- **WHEN** the runner-placement guard executes
- **THEN** the guard fails and names the misplaced job

#### Scenario: Timing comparison is reviewable

- **GIVEN** one complete baseline run and one complete hybrid-runner run
- **WHEN** the implementation is reviewed
- **THEN** queue time and execution time are reported per job
- **AND** end-to-end CI duration and percentage change are reported
- **AND** any missed performance target includes a residual-bottleneck explanation
