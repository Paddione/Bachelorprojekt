---
title: "t002185-health-goals-cronjob — Implementation Plan"
ticket_id: T002185
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002185-health-goals-cronjob — Implementation Plan

_Ticket: T002185_

## Context

`k3d/monitoring/health-goals-cronjob.yaml` is dead weight: its container command is a placeholder
`echo`, it is not listed as a `resource` in `k3d/monitoring/kustomization.yaml`, and no
`health-goals-check` CronJob exists in the live `fleet` cluster (`kubectl --context fleet -n workspace
get cronjob` confirms this). The real health-goals measurement already runs completely via
`.github/workflows/health-goals.yml` (`task health:goals:update` → `scripts/health-goals-check.sh`),
which needs a full repo checkout + Taskfile/Node tooling that a bare `alpine/k8s` CronJob does not have.
This plan removes the dead manifest and adds a regression test so a future orphaned/placeholder
manifest under `k3d/monitoring/` is caught in CI instead of lingering unnoticed.

**Scope boundary:** T002148 (SDLC health-goals content in `.claude/lib/goals.md`) and T002151
(Observability-Remediation, which introduced this stub) are both `done` and out of scope here — this
plan only removes the specific leftover artifact from T002151, it does not reopen either.

## File Structure

```
k3d/monitoring/health-goals-cronjob.yaml   (deleted)
tests/spec/monitoring-alerts.bats          (add 2 new @test cases)
```

## Tasks

- [ ] **Task 1 — RED: add regression tests to `tests/spec/monitoring-alerts.bats`.**
  Add two `@test` cases:
  1. "no unregistered resource manifests in k3d/monitoring" — for every `k3d/monitoring/*.yaml` file
     containing a top-level `kind:` field, assert it is listed in the `resources:` block of
     `k3d/monitoring/kustomization.yaml`.
  2. "health-goals-cronjob.yaml does not exist" — asserts
     `k3d/monitoring/health-goals-cronjob.yaml` is absent (documents that health-goals measurement is
     owned by `.github/workflows/health-goals.yml`, not an in-cluster CronJob).
  Both tests MUST fail on the current branch (test 1 fails because `health-goals-cronjob.yaml` exists
  but is unregistered; test 2 fails because the file exists).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts.bats
# expected: FAIL (red — health-goals-cronjob.yaml still present and unregistered)
```

- [ ] **Task 2 — GREEN: delete the dead manifest.**
  `git rm k3d/monitoring/health-goals-cronjob.yaml`. Re-run the BATS file from Task 1 — both new tests
  must now pass, and no existing `monitoring-alerts.bats` test may regress.

- [ ] **Task 3 — Regenerate the test inventory.**
  Run `task test:inventory` and commit the resulting diff in
  `website/src/data/test-inventory.json` (CI fails the job otherwise per the "Test inventory check"
  gate in `.github/workflows/ci.yml`).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS tests from Task 1. They must FAIL on the current
      branch.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/monitoring-alerts.bats
# expected: FAIL (red — health-goals-cronjob.yaml still present and unregistered)
```

- [ ] **Fix-Step (GREEN).** Delete `k3d/monitoring/health-goals-cronjob.yaml` (Task 2). The BATS tests
      from the previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Also run `task workspace:validate` to confirm `k3d/monitoring/kustomization.yaml` still builds cleanly
after the resource is removed (it was never referenced there, so no kustomization edit is required).
