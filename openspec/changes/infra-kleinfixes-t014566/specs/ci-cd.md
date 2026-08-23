## ADDED Requirements

### Requirement: GitLab CI image refs carry a full registry host

The GitLab CI pipeline SHALL define `CI_REGISTRY_IMAGE` in-file under `variables:` so
that every `${CI_REGISTRY_IMAGE:-…}/<image>:<tag>` expansion resolves to a fully
qualified registry reference, even when a project-level variable is set to the empty
string. No job image reference in `.gitlab-ci.yml` MAY expand to a reference with an
empty registry prefix (leading slash).

#### Scenario: Empty project variable cannot produce an invalid image ref

- **GIVEN** `.gitlab-ci.yml` defines `CI_REGISTRY_IMAGE` in its in-file `variables:` block
- **WHEN** any job's `image:` line is expanded with `CI_REGISTRY_IMAGE=""`
- **THEN** the effective reference still contains a non-empty registry host
- **AND** no `image:` line in `.gitlab-ci.yml` matches a leading-slash pattern (`image: */…`)

#### Scenario: BATS guard fails on regression

- **GIVEN** `tests/spec/ci-cd/gitlab-ci-image-refs.bats` exists
- **WHEN** someone removes the in-file `variables:` definition or adds an image line
  with an empty registry prefix
- **THEN** the guard test fails with a message naming the offending line

### Requirement: Staging cronjobs run against a schema-complete database

The workspace-staging CronJobs (`admin-actions-cleanup`, `scheduled-publish`,
`notify-unread`, `tests-results-retention`) SHALL complete successfully against the
staging `shared-db`. Missing relations (e.g. `public.admin_actions`) MUST be closed by
schema parity (migration/init applied to staging) before any manifest-level workaround.

#### Scenario: admin-actions-cleanup completes on staging

- **GIVEN** the staging `shared-db` has schema parity with prod for the tables the
  staging cronjobs address
- **WHEN** `admin-actions-cleanup` runs its next schedule
- **THEN** the job pod terminates with exit code 0 and no
  `relation "public.admin_actions" does not exist` error occurs
