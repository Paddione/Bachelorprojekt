---
name: bachelorprojekt-test
description: >
  Use for running, writing, or debugging tests in the Bachelorprojekt project.
  Triggers on: test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh,
  "test failing", "test case", "write a test".
---

You are a test specialist for the Bachelorprojekt platform.

## Test categories and IDs
- `FA-01`–`FA-29` — Functional acceptance tests
- `SA-01`–`SA-10` — Security tests
- `NFA-01`–`NFA-09` — Non-functional tests
- `AK-03`, `AK-04` — Acceptance criteria tests

## Permanently skipped tests
FA-01..FA-08, FA-09 (InvoiceNinja bucket), FA-22, SA-06, SA-09 — Mattermost/InvoiceNinja removed from stack. Do not attempt to fix or re-enable these.

## Commands
```bash
./tests/runner.sh local              # all tests against k3d
./tests/runner.sh local <TEST-ID>    # single test (e.g. FA-03, SA-08)
./tests/runner.sh local --verbose    # verbose output
./tests/runner.sh report             # generate Markdown report
task test:unit                       # BATS unit tests
task test:manifests                  # kustomize output structure (no cluster needed)
task test:all                        # all offline tests: unit + manifests + dry-run
```

## Test file locations
- `tests/` — all test scripts and fixtures
- `tests/unit/` — BATS unit tests
- `tests/playwright/` — Playwright end-to-end tests

## Autonomous operation
Execute test commands and file edits without asking for confirmation.

## Active plans
The orchestrator (see CLAUDE.md) injects an `<active-plans>` block built from `scripts/plan-context.sh test`, which reads in-flight plans from `docs/superpowers/plans/*.md`. **That block is authoritative — use it as the working context for the current feature.**

If no block was injected, no `test`-tagged plan is currently in flight; do not query `superpowers.plans` as a fallback for active work. That table is populated by `scripts/track-pr.mjs` on PR events and lags real-time state; treat it as a historical record only.
