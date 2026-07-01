## ADDED Requirements

### Requirement: validate-commit-message-before-push

The system SHALL validate every commit message against conventional-commit rules (type(scope): subject) before allowing a push to any remote branch.

#### Scenario: Push with non-conventional commit is rejected

- **GIVEN** a local commit with a non-conventional subject line (e.g. "Betreff: Test")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook runs `scripts/validate-commit-msg.sh` and rejects the push with exit code 1

#### Scenario: Push with conventional commits succeeds

- **GIVEN** a local commit with a valid conventional-commit message (e.g. "fix(ops): correct commit-lint scope [T001356]")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook passes and the push proceeds

### Requirement: ci-commit-message-validation

The system SHALL validate all commit messages in a PR (range `origin/main..HEAD`) as part of the CI `commit-lint` job when the event is `pull_request`.

#### Scenario: PR with non-conventional commits fails CI

- **GIVEN** a PR containing a commit with subject "Betreff: irgendwas"
- **WHEN** CI runs the `commit-lint` job
- **THEN** the job fails and reports which commit messages are invalid
