## ADDED Requirements

### Requirement: devflow-ci-watch polls the correct PR and rejects incomplete CI

`scripts/devflow-ci-watch.sh` SHALL pass the `PR_URL` argument to every `gh pr checks` and
`gh pr view` call that targets PR-specific data, SHALL derive `TOTAL_CHECKS` from the PR's
`headRefOid` instead of the working-directory `HEAD`, and SHALL NOT report "all green" when
any check still has `status != COMPLETED`.

#### Scenario: PR-URL is passed to `gh pr checks --watch`

- **GIVEN** `devflow-ci-watch.sh` is called with `TICKET_ID` and `PR_URL` arguments
- **WHEN** the script reaches the `gh pr checks --watch` call
- **THEN** the `PR_URL` argument SHALL appear in the `gh pr checks` command line

#### Scenario: TOTAL_CHECKS is derived from PR headRefOid, not cwd HEAD

- **GIVEN** a PR whose `headRefOid` differs from the working-directory `HEAD`
- **WHEN** `devflow-ci-watch.sh` computes `TOTAL_CHECKS`
- **THEN** it SHALL use `gh pr view "$PR_URL" --json headRefOid -q '.headRefOid'`
- **AND** the resulting check-run count SHALL match the PR commit, not the cwd commit

#### Scenario: Checks with status != COMPLETED prevent the green exit

- **GIVEN** `gh pr checks --watch` returns (or fails) before all checks complete
- **AND** `gh pr view --json statusCheckRollup` shows at least one check where
  `.status != "COMPLETED"`
- **WHEN** the script evaluates whether to report "all green"
- **THEN** it SHALL NOT exit 0 with "✅ … alle grün"
- **AND** it SHALL continue the polling loop until all checks reach `status == COMPLETED`
  or `MAX_CI_ATTEMPTS` is exhausted

#### Scenario: All-checks-completed path remains unchanged

- **GIVEN** `gh pr checks --watch "$PR_URL"` completes successfully
- **AND** `statusCheckRollup` returns zero FAILURE/TIMED_OUT checks and zero non-COMPLETED checks
- **WHEN** the script evaluates the result
- **THEN** it SHALL report "✅ … CI-Checks, alle grün" and exit 0 (unchanged behavior)
