## ADDED Requirements

### Requirement: GitLab-Pipeline-Status ist lesbar klassifiziert

`scripts/gitlab-pipeline-check.sh` SHALL query the public GitLab API for the
latest pipeline on `main` of the mirror project (85496968) and SHALL classify:
`success` → exit 0; `failed`/`canceled` → exit 1; `pending`/`running` → exit 2
with a diagnostic naming the missing-runner/unknown-outcome classification. An
empty or invalid API response SHALL exit non-zero with a "no verdict"
diagnostic — an empty answer is never a green verdict.

#### Scenario: Erfolgreiche Pipeline
- **GIVEN** the latest pipeline on main has `status=success`
- **WHEN** `gitlab-pipeline-check.sh` runs
- **THEN** it SHALL exit 0 and print the success status

#### Scenario: Pending-Pipeline ohne Runner ist kein Urteil
- **GIVEN** the latest pipeline on main has `status=pending`
- **WHEN** `gitlab-pipeline-check.sh` runs
- **THEN** it SHALL exit non-zero with a diagnostic that names the pending
  status and the missing-runner/unknown-outcome classification

#### Scenario: Leere API-Antwort ist kein Urteil
- **GIVEN** the API returns an empty body
- **WHEN** `gitlab-pipeline-check.sh` runs
- **THEN** it SHALL exit non-zero with a "no verdict" diagnostic
