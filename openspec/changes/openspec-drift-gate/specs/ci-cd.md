## ADDED Requirements

### Requirement: Advisory OpenSpec Drift Gate

The CI pipeline SHALL run an advisory spec-drift check on every `pull_request`
event that warns when a feature or fix PR changes files mapped to an SSOT spec
without touching that spec or a corresponding delta spec. In Phase 1 the check
SHALL be advisory: it MUST exit 0 (non-blocking) when drift is detected, MUST
reserve exit code 1 for the opt-in `DRIFT_CHECK_ENFORCE=1` enforcement mode, and
MUST use exit code 2 or higher only for script-level failures that fail the CI
step. File-to-spec mapping SHALL reuse the longest-prefix semantics of
`openspec/component-map.yaml`. The check SHALL be skippable via the
`SKIP_SPEC_DRIFT=1` environment variable and SHALL run against non-`feat`/`fix`
PRs as a no-op.

#### Scenario: Feature PR changes mapped code without touching its spec

- **GIVEN** a PR whose title starts with `feat:` or `fix:` (or, locally, a `feature/*` or `fix/*` branch)
- **AND** the diff against `origin/main` changes a file whose prefix maps to an SSOT spec in `openspec/component-map.yaml`
- **AND** neither `openspec/specs/<slug>.md` nor a delta spec `openspec/changes/*/specs/<slug>.md` for that slug is in the diff
- **WHEN** `scripts/openspec-drift-check.sh` runs
- **THEN** it prints a greppable `DRIFT: <slug> <- <file>` line, a `::warning::` annotation, and a `$GITHUB_STEP_SUMMARY` entry, and exits 0

#### Scenario: Delta spec in the diff suppresses the warning

- **GIVEN** a `feat:`/`fix:` PR that changes mapped code
- **AND** the diff also contains a delta spec `openspec/changes/<change>/specs/<slug>.md` for the mapped slug
- **WHEN** the drift check runs
- **THEN** it emits no `DRIFT:` line for that slug and exits 0

#### Scenario: Chore PRs and explicit bypass are skipped

- **GIVEN** a PR whose title does not start with `feat:` or `fix:` (for example `chore:`), or the environment variable `SKIP_SPEC_DRIFT=1` is set
- **WHEN** the drift check runs
- **THEN** it prints a skip message and exits 0 without evaluating drift

#### Scenario: Enforcement mode turns drift into a failure

- **GIVEN** `DRIFT_CHECK_ENFORCE=1` is set and mapped code changed without a spec touch
- **WHEN** the drift check runs
- **THEN** it exits 1, while the CI step itself never sets this variable in Phase 1

#### Scenario: Self-test validates the gate logic

- **GIVEN** a maintainer runs `scripts/openspec-drift-check.sh --self-test`
- **WHEN** the synthetic cases (drift, delta-spec suppression, chore skip, bypass) execute in a throwaway git repository
- **THEN** all cases pass and the command exits 0
