## ADDED Requirements

### Requirement: Direct pushes to main SHALL be prevented server-side

The repository SHALL enforce the pull-request workflow for `main` through GitHub branch
protection, not through local git hooks alone. Protection SHALL apply to administrators
(`enforce_admins`) and SHALL require a pull request before merging
(`required_pull_request_reviews`).

Local hooks MAY warn earlier, but SHALL NOT be relied upon as the enforcing mechanism, because
`git commit --no-verify` bypasses them by design.

#### Scenario: An administrator attempts to push a commit straight to main

- **GIVEN** branch protection on `main` has `enforce_admins` enabled and requires a pull request
- **WHEN** a repository administrator pushes a commit directly to `main`
- **THEN** GitHub rejects the push
- **AND** the change can only reach `main` through a pull request that satisfies the required
  status checks

#### Scenario: The protection configuration is audited

- **GIVEN** the current protection settings of `main` as JSON
- **WHEN** `scripts/check-branch-protection.sh` evaluates them
- **THEN** it exits zero if `enforce_admins` is enabled and `required_pull_request_reviews` is
  present
- **AND** it exits non-zero otherwise, naming every unmet requirement individually rather than
  stopping at the first

### Requirement: Automated artifact regeneration SHALL reach main through a pull request

The freshness regeneration workflow SHALL NOT push to `main` directly. It SHALL commit to a
dedicated branch, open a pull request and enable auto-merge, so the same required status checks
apply to bot changes as to human ones.

The workflow SHALL NOT mark these commits with `[skip ci]`. Under required status checks a
skipped run never reports a result, which would leave the pull request permanently unmergeable.

#### Scenario: Regeneration finds changed artifacts

- **GIVEN** `task freshness:regenerate` produces a non-empty diff
- **WHEN** the workflow publishes the result
- **THEN** it pushes a branch and opens a pull request against `main`
- **AND** it enables auto-merge on that pull request
- **AND** no commit reaches `main` outside of that pull request

#### Scenario: Regeneration finds nothing to change

- **GIVEN** `task freshness:regenerate` produces no diff
- **WHEN** the workflow evaluates the result
- **THEN** it creates neither a branch nor a pull request
