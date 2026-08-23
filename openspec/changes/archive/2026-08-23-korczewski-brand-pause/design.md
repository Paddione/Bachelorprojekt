---
title: "korczewski-brand-pause — Operational Design"
ticket_id: T014537
plan_ref: openspec/changes/korczewski-brand-pause/tasks.md
status: proposed
---

# korczewski-brand-pause — Operational Design

## Evidence and root cause

SA-FC-01 in `tmp/claude-scratch/system-audit-multi-2026-08-23.md` reports a
deliberate korczewski pause: `flux-korczewski`, `flux-korczewski-jobs`, and
`flux-website-korczewski` are suspended. The same evidence reports
`admin-actions-cleanup` with active Job
`admin-actions-cleanup-29754030` and `admin-actions-prune` with active Job
`admin-actions-prune-29754840`; both last scheduled in late July.

The verified symptom is not a missing or unsuspended Flux resource. It is the
presence of two stale, active Job objects in `workspace-korczewski` while the
brand-level reconciliation is paused. The operational root cause to address is
therefore orphaned/hung Job state retained across the intentional pause. The
OCIRepository `fleet-manifests-gitlab` is a separate mirror concern and is not
part of this fix.

## Decision

Keep the brand pause exactly as it is. Before cleanup, suspend only the
`admin-actions-cleanup` and `admin-actions-prune` CronJobs in
`workspace-korczewski`, so the intentional pause cannot create replacement
Jobs. Re-read the current Jobs and check each target Job's namespace, CronJob
owner, and active status. Delete only active Jobs owned by those two CronJobs.
A final read confirms that no active Job remains and that both CronJobs are
suspended.

The procedure must not alter `spec.suspend` on any Flux Kustomization or
OCIRepository, must not delete or unsuspend either CronJob, and must not use a
namespace-wide or label-broad deletion that could remove unrelated Job
history. The existing manifest comments remain the source for why the brand
pause is intentional; this change records the audit finding and one-time
cleanup boundary.

## Acceptance evidence

The BATS guard in
`tests/spec/health-goals/korczewski-brand-pause.bats` queries the real Fleet
context when available and fails while either target owner has an active Job or
its CronJob is not suspended. It also verifies the three Flux Kustomizations
and the GitLab OCIRepository remain suspended. It skips without `kubectl` or
the `fleet` context so CI does not acquire an implicit cluster dependency. The
execution handoff records the deleted Job names and the succeeding zero-active
query.
