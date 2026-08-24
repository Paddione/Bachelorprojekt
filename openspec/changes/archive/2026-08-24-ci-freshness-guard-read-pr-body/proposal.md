# Proposal: ci-freshness-guard-read-pr-body

## Why
Symptom: `freshness:check` returns a false-negative when it cannot read the PR body, silently logging a WARN and assuming the baseline-allow tag is missing.
Root Cause: In `scripts/code-quality/baseline-key-count-assertion.mjs`, `readPrBody()` catches `execSync` errors from `gh pr view`, logs them, and returns `''`. The check then proceeds and fails due to missing tags, masking the infrastructure failure.

## What
1. Extend `readPrBody()` to use `process.env.GITHUB_EVENT_PATH` to read the PR body from the GitHub Actions event payload JSON if `process.env.PR_BODY` is missing.
2. If the PR body is still unavailable and `gh pr view` fails, explicitly `process.exit(1)` (or throw) with a clear error message instead of returning `''`.

_Ticket: T015384_
