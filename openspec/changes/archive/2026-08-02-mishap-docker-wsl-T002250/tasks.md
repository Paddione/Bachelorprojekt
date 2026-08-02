---
title: "mishap-docker-wsl-T002250 — Implementation Plan"
ticket_id: T002250
domains: [environment]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-docker-wsl-T002250 — Implementation Plan

_Ticket: T002250_

## File Structure

| File | Lines | Budget |
| :--- | :--- | :--- |
| `scripts/setup.sh` | 67 | 733 |
| `scripts/factory/sandbox-run.sh` | 82 | 718 |
| `tests/spec/mishap-docker-wsl-T002250.bats` | 45 | null |
| `.github/workflows/renovate.yml` | - | - |

## Task 1: Failing Test Verification (RED)

We run the newly added BATS tests to verify that they reproduce the bug and fail on the current branch.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-docker-wsl-T002250.bats
# expected: FAIL
```

## Task 2: Implement Fixes

- **Docker Desktop Credential Helper in WSL**: Update `scripts/setup.sh` to check if running in WSL. If so, check if `~/.docker/config.json` contains `"credsStore": "desktop.exe"` or `"credsStore": "desktop"`. If configured, automatically strip it from the JSON using `jq`.
- **Renovate container DNS**: Add `--dns 1.1.1.1` to the `docker run` command in `.github/workflows/renovate.yml`.
- **Sandbox container DNS in WSL**: Update `scripts/factory/sandbox-run.sh` to include `--dns 1.1.1.1` in the `docker run` command when run under WSL.

## Task 3: Final Verification (GREEN)

Run the BATS tests again to confirm they are green.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-docker-wsl-T002250.bats
```

Run the three mandatory CI gates to ensure everything is correct and no regressions occur:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
