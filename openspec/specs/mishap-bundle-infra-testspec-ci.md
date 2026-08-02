# mishap-bundle-infra-testspec-ci

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-bundle-infra-testspec-ci ergänzen._

## Requirements

### Requirement: worktree-create.sh validation
`worktree-create.sh` MUST check if the main checkout is on the `main` branch before performing any stash operations or trying to create a worktree. If it is on a different branch, it MUST fail-closed with a clear error message.

#### Scenario: worktree-create.sh on non-main checkout
- **GIVEN** a main checkout that is currently on a branch other than `main`
- **WHEN** running `worktree-create.sh`
- **THEN** it aborts immediately before stashing, returning a non-zero exit code and displaying a descriptive error.

---

### Requirement: commit-msg hook rejection output
The commit-msg hook MUST clearly communicate when no commit was created.

#### Scenario: rejected commit message
- **GIVEN** a commit message that violates conventions
- **WHEN** running `git commit`
- **THEN** the commit-msg hook rejects the commit and outputs a message stating "No commit was created" without misleading pre-push bypass context.

---

### Requirement: agent-lock worktree path normalization
`agent-lock.sh` MUST resolve `--worktree` arguments to absolute, normalized paths.

#### Scenario: relative path passed to --worktree
- **GIVEN** a relative path such as `.` or `./` passed to `--worktree`
- **WHEN** the lock is claimed
- **THEN** it resolves to the absolute canonical path without trailing `/./` or similar segments.

---

### Requirement: Test results vs Implementation check

#### Scenario: Test results vs Implementation check
Tests MUST check actual outputs/results of operations rather than grep-ing implementation patterns in source code, unless the result is truly unobservable.

---

### Requirement: agent-lock reap PID liveness
`agent-lock.sh reap` MUST use process PID checks (`owner_pid`) as the primary liveness signal, and only fall back to Session ID (SID) check if PID is not available.

#### Scenario: process is dead but SID is not
- **GIVEN** a lock with a dead process PID
- **WHEN** running `agent-lock.sh reap`
- **THEN** the lock is cleaned up.

---

### Requirement: commit-vs-diff check scoping
`check-commit-vs-diff.sh` MUST only check commits unique to the current feature branch.

#### Scenario: rebase imports external commits
- **GIVEN** external commits brought in by a rebase
- **WHEN** running `check-commit-vs-diff.sh`
- **THEN** those external commits do not trigger a mismatch error.

---

### Requirement: devflow-post-merge-deploy.sh robust diffing
`devflow-post-merge-deploy.sh` MUST find the correct commits by matching the ticket ID `[T00XXXX]` in the merge commits on `main`.

#### Scenario: multiple commits landed after feature merge
- **GIVEN** new commits have landed on `main` after the feature merge commit
- **WHEN** running `devflow-post-merge-deploy.sh T002448`
- **THEN** it correctly detects the modified files from the PR associated with `T002448` by grep-matching the ticket ID.

<!-- merged from change delta mishap-bundle-infra-testspec-ci.md (edd14e88e12a) -->