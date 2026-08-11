## MODIFIED Requirements

### Requirement: validate-commit-message-before-push

The system SHALL validate every commit message against conventional-commit rules (type(scope): subject) before allowing a push to any remote branch. The scope base SHALL be the fork-point of the branch against `origin/main` — computed by `scripts/hooks/pre-push-scope-base.sh` via `git merge-base --fork-point origin/main <head>` — not the (possibly stale) `origin/main` ref state and not the previous remote branch tip. After a `git rebase origin/main`, the check SHALL cover only the branch's own non-ancestor commits (`git rev-list --no-merges <base>..<head>`); commits already merged on main SHALL be excluded from the validation so a valid push after a rebase is not rejected with foreign commit messages.

#### Scenario: Push with non-conventional commit is rejected

- **GIVEN** a local commit with a non-conventional subject line (e.g. "Betreff: Test")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook runs `scripts/validate-commit-msg.sh` and rejects the push with exit code 1

#### Scenario: Push with conventional commits succeeds

- **GIVEN** a local commit with a valid conventional-commit message (e.g. "fix(ops): correct commit-lint scope [T001356]")
- **WHEN** the user runs `git push`
- **THEN** the pre-push hook passes and the push proceeds

#### Scenario: Push after rebase on main is accepted *(BATS)*

- **GIVEN** a branch whose old tip is no longer an ancestor of HEAD after `git rebase origin/main` (stale `origin/main` ref state would pull already-merged main commits into the check)
- **WHEN** the user pushes and the branch contains only its own conventional commits
- **THEN** `scripts/hooks/pre-push-scope-base.sh` returns the fork-point base (not the non-ancestor remote tip)
- **AND** `git rev-list --no-merges <base>..<head>` contains only the branch's own commits
- **AND** the push proceeds without the foreign, already-merged main commits being validated
