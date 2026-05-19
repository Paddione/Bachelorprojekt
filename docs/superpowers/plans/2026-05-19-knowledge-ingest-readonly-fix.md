---
ticket_id: T000485
---
# Plan: Knowledge Ingest Read-Only Fix

The `knowledge-ingest` CronJobs are failing because their `npm-install` init container attempts to run `npm install` in `/scripts`, which is a read-only ConfigMap mount.

## Proposed Changes

### Kubernetes Manifests
- Modify `k3d/knowledge-ingest-cronjob.yaml` to change the `npm-install` command.
- Instead of `cd /scripts && npm install`, it will run `npm install --prefix /tmp` and then copy the `node_modules` to the expected location.

## Verification Plan

### Automated Tests
- Run `tests/unit/knowledge-ingest-manifest.bats` to verify the manifest contains the correct fix and no longer contains the broken command.

### Manual Verification
- Deploy to `korczewski` cluster.
- Trigger one of the jobs manually: `kubectl create job --from=cronjob/knowledge-ingest-prs knowledge-ingest-manual-fix -n workspace --context korczewski`
- Verify the pod succeeds.
