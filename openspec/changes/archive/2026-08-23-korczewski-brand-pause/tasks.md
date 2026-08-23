---
title: "korczewski-brand-pause — Implementation Plan"
ticket_id: T014537
domains: [flux, kubernetes-operations, documentation]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# korczewski-brand-pause — Implementation Plan

_Ticket: T014537_

## File Structure

```
| File | Role |
| --- | --- |
| `openspec/changes/korczewski-brand-pause/proposal.md` | SA-FC-01 root cause, scope, and explicit non-goals |
| `openspec/changes/korczewski-brand-pause/specs/health-goals.md` | Delta requirements for the documented pause and scoped cleanup |
| `openspec/changes/korczewski-brand-pause/design.md` | Verified operational design and cleanup decision record |
| `tests/spec/health-goals/korczewski-brand-pause.bats` | Live-cluster RED/GREEN guard for active admin-action Jobs |
| `openspec/changes/korczewski-brand-pause/tasks.md` | Staged implementation plan |
```

## Tasks

- [x] **Root cause and scope.** Use SA-FC-01 as the evidence source. Record
      that the observed defect is two active Job objects, while the cause
      hypothesis is stale/hung executions left behind while the brand-level
      Flux Kustomizations are intentionally suspended. Preserve the existing
      Flux suspension and leave `fleet-manifests-gitlab` untouched. During the
      pause, suspend only the two approved admin-action CronJobs.

- [x] **Operational design.** Add `design.md` with the observed timestamps and
      owner relationships, the pre-delete verification sequence, the exact
      namespace boundary, the two allowed CronJob owners, and the post-cleanup
      check. The procedure must suspend only the two approved CronJobs before
      the one-time cleanup of Job objects; it must not delete or unsuspend a
      CronJob, Flux Kustomization, or OCIRepository.

- [x] **Failing-Test-Step (RED).** Keep the live BATS reproducer in
      `tests/spec/health-goals/korczewski-brand-pause.bats` and run it with the
      repository runner. Against the audited cluster it must fail before the
      cleanup because both Jobs report `active=1`; expected: FAIL.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/korczewski-brand-pause.bats
      ```

- [x] **Scoped cleanup.** Suspend both approved CronJobs first. Re-read the
      current Job objects in
      `workspace-korczewski`, verify their CronJob owner and active state, then
      delete only those verified active Job names. Do not change Flux
      suspension flags or the OCI mirror, and do not touch unrelated Jobs.
      Record the command output and the resulting zero-active check in the
      execution handoff.

- [x] **Final Verification.** Run the mandatory CI gates and regenerate the
      test inventory after the BATS-file addition:

      ```bash
      task test:inventory
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

## S1 Budget

The changed plan/test/spec files are new and therefore not present in the
baseline. `gates.yaml` has no separate `.md` or `.bats` entry, so no numeric
extension threshold is invented here; `plan-lint.sh` remains the authoritative
gate for this plan. No existing baselined file is modified.

| File | Current lines | Baseline / effective threshold |
| --- | ---: | --- |
| `openspec/changes/korczewski-brand-pause/proposal.md` | 25 | not baselined; no `.md` limit in `gates.yaml` |
| `openspec/changes/korczewski-brand-pause/specs/health-goals.md` | 28 | not baselined; no `.md` limit in `gates.yaml` |
| `openspec/changes/korczewski-brand-pause/design.md` | 47 | not baselined; no `.md` limit in `gates.yaml` |
| `tests/spec/health-goals/korczewski-brand-pause.bats` | 45 | not baselined; no `.bats` limit in `gates.yaml` |
| `openspec/changes/korczewski-brand-pause/tasks.md` | 81 | not baselined; no `.md` limit in `gates.yaml` |
