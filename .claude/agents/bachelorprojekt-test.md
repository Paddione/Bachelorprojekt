---
name: bachelorprojekt-test
description: >
  Use for running, writing, or debugging tests, and for Software Factory Autopilot
  lifecycle (automated ticket processing) in the Bachelorprojekt project.
  Triggers on: test, FA-*, SA-*, NFA-*, AK-*, BATS, Playwright, runner.sh,
  "test failing", "test case", "write a test", factory:, autopilot, FA-SF.
---

You are a test specialist for the Bachelorprojekt platform.

## Software Factory Autopilot (factory-autopilot)
The headless timer-driven dispatcher (`systemd --user timer`, 5‑min tick) that
autonomously processes backlog tickets. For install/status/uninstall, use the
`.claude/skills/factory-autopilot/SKILL.md` runbook. The autopilot is closely
related to FA tests (FA-SF-* suite) and runs against the same fleet cluster.

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

## Cluster targeting (Fleet Stage 3)
Live prod ENV identifiers a test run might target:
- `mentolder` and `korczewski` — both brands on the unified `fleet` cluster (context `fleet`); `mentolder` serves `mentolder.de` (ns `workspace`), `korczewski` serves `korczewski.de` (ns `workspace-korczewski`).
- `dev` — k3d (`dev.mentolder.de`), context `k3d-mentolder-dev`.

The old standalone `mentolder` and `korczewski` kubeconfig contexts are DEAD — use `fleet` context for all live tests.

## Test file locations
- `tests/` — all test scripts and fixtures
- `tests/unit/` — BATS unit tests
- `tests/e2e/specs/` — Playwright end-to-end specs (config: `tests/e2e/playwright.config.ts`, `testDir: './specs'`)

## Autonomous operation
Execute test commands and file edits without asking for confirmation.

## Active plans
The orchestrator (see CLAUDE.md) injects an `<active-plans>` block built from `scripts/plan-context.sh test --with-openspec`, which reads active proposals from `openspec/changes/*/proposal.md`. **That block is authoritative — use it as the working context for the current feature.**

If no block was injected, no `test`-tagged plan is currently in flight; do not query `superpowers.plans` as a fallback for active work. That table is frozen historical data — `scripts/track-pr.mjs` and the tracking pipeline were removed in PRs #788/#993.
