## MODIFIED Requirements

### Requirement: Direct pushes to main SHALL be prevented server-side

The repository SHALL enforce the pull-request workflow for `main` through GitHub branch
protection, not through local git hooks alone. Protection SHALL apply to administrators
(`enforce_admins.enabled=true`) and SHALL require a pull request with at least one approving
review before merging (`required_pull_request_reviews.required_approving_review_count >= 1`).

The idempotent protection apply script SHALL always emit `enforce_admins.enabled=true` in its
full protection payload, regardless of a weaker value returned by the live API.

Local hooks MAY warn earlier, but SHALL NOT be relied upon as the enforcing mechanism, because
`git commit --no-verify` bypasses them by design.

#### Scenario: An administrator attempts to push a commit straight to main

- **GIVEN** branch protection on `main` has `enforce_admins` enabled and requires a pull request
- **WHEN** a repository administrator pushes a commit directly to `main`
- **THEN** GitHub rejects the push
- **AND** the change can only reach `main` through a pull request that satisfies the required
  status checks and one approving review

#### Scenario: The protection configuration is audited

- **GIVEN** the current protection settings of `main` as JSON
- **WHEN** `scripts/check-branch-protection.sh` evaluates them
- **THEN** it exits zero if `enforce_admins` is enabled and at least one approval is required
- **AND** it exits non-zero otherwise, naming every unmet requirement individually rather than
  stopping at the first
