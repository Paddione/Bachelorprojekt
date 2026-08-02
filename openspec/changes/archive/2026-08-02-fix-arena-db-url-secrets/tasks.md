---
title: Fix arena-server orphaned cluster resources (korczewski)
ticket_id: T001800
domains: [infra, database]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-arena-db-url-secrets — Implementation Plan

## File Structure

- `tests/spec/database.bats` (modified — already committed with the failing test in the
  plan-stage commit; this plan's Task 1 marks it as the RED baseline, no further edits)
- Cluster-only change: `deployment/arena-server`, `service/arena-server`,
  `ingressroute.traefik.io/arena-server` in namespace `workspace-korczewski` on the `fleet`
  context (no repo files — the manifests were already removed from the repo in PR #2093)
- `openspec/specs/database.md` (modified — REMOVED Requirements delta from
  `specs/database.md` merges in on archive, dropping the stale "Arena DB Health Check
  Endpoint" requirement)

## Task 1: Confirm RED — orphaned-resource regression test fails

expected: FAIL

```bash
bats tests/spec/database.bats --filter arena-server
```

This must show all three `cluster: workspace-korczewski has no orphaned arena-server *`
tests failing (`not ok`), proving the three live objects still exist before the fix.
(This test was already committed in the plan-stage commit — Task 1 just re-confirms RED
before applying the fix, per the red→green fix-path contract.)

## Task 2: Delete the three orphaned arena-server cluster resources

```bash
kubectl --context fleet delete deployment arena-server -n workspace-korczewski
kubectl --context fleet delete service arena-server -n workspace-korczewski
kubectl --context fleet delete ingressroute.traefik.io arena-server -n workspace-korczewski
```

Do **not** touch `environments/schema.yaml`, `k3d/secrets.yaml`, or
`environments/sealed-secrets/korczewski.yaml` — `arena_db_url`/`ARENA_DB_URL` stay removed,
consistent with the PR #2093 decommission decision (see `design.md` Decision D1).

## Task 3: Confirm GREEN — regression test passes

```bash
bats tests/spec/database.bats --filter arena-server
```

All three `cluster: workspace-korczewski has no orphaned arena-server *` tests must now
pass (`ok`).

## Task 4: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` picks up `tests/spec/database.bats` (new arena-server tests) via git
diff. No `website/src/**` files touched, so no Vitest task needed
<!-- vitest: kein neuer Test nötig, weil die Änderung reines Cluster-Cleanup + BATS-Test ist, kein website/src-Code -->.
No new `k3d/*.yaml` or `scripts/*.sh` created (S4 n/a). No hardcoded brand-domain literals
introduced (S3 n/a). `tests/spec/database.bats` has no S1 baseline/extension limit (`.bats`
is not in the S1 extension table). After `freshness:regenerate`, commit any regenerated
files (e.g. `openspec-status.json`) alongside this change if they differ.
