---
title: "G-GIT02: Non-conventional commit regression — implementation plan"
ticket_id: T001356
domains: [quality, ops]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# G-GIT02: Non-conventional commit regression — implementation plan

_Ticket: T001356_

## File Structure

```
.githooks/pre-push                  — add blocking commit-message validation
.github/workflows/ci.yml            — (optional) add push-to-main commit check
commitlint.config.cjs               — reference for allowed scopes/types
scripts/validate-commit-msg.sh      — new shared validation script (called by hook + CI)
```

## Tasks

### Task 1: Analyse the full commit-to-main delivery path

- Identify every code path through which a commit reaches the `main` branch: PR squash-merge, PR merge commit, direct push, `release-please` pushes.
- For each path, determine whether commit messages (as opposed to PR titles) are validated.
- Document gaps in `openspec/changes/t001356-git02-conventional-commit/analysis.md`.

```bash
grep -rn 'conventional\|commit.*lint\|semantic-pull-request' .github/workflows/ .githooks/ | grep -v node_modules
# expected: shows PR-title validation only, no per-commit check
```

### Task 2: Implement commit-message validation

- Create `scripts/validate-commit-msg.sh`: a bash script that uses `commitlint` (from `commitlint.config.cjs`) to validate all commits in a given range (`HEAD~n..HEAD` or `origin/main..HEAD`) or the latest commit.
- Add a blocking check to `.githooks/pre-push` that runs the validation on the commits being pushed and exits non-zero if any commit message violates conventional-commit rules.
- (Optional) Add a CI step in `.github/workflows/ci.yml` that validates all commits in the PR (range `origin/main..HEAD`) when `github.event_name == 'pull_request'`, to catch bypasses of the local hook.

### Task 3: Verify the fix and run CI gates

- Create a BATS test at `tests/spec/g-git02-validate-commit-msg.bats` that reproduces the regression scenario (commits with "Betreff" in subject) and asserts the validation script rejects them.
- Run the full CI gate suite:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
