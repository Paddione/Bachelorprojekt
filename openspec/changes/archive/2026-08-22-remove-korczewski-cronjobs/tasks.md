---
title: "remove-korczewski-cronjobs — Implementation Plan"
ticket_id: T012964
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# remove-korczewski-cronjobs — Implementation Plan

_Ticket: T012964_

## File Structure

```
prod-korczewski/kustomization.yaml    # ADD delete-patches for pvc-backup + error-log-retention CronJobs
```

## Tasks

### 1. Delete-Patches hinzufuegen

In `prod-korczewski/kustomization.yaml` die folgenden Inline-Delete-Patches ergaenzen (analog bestehende brain-Delete-Patches):

```yaml
  # pvc-backup CronJob: referenziert vaultwarden/nextcloud Pods, die in
  # korczewski auf 0 skaliert sind (T012964).
  - target: { group: batch, version: v1, kind: CronJob, name: pvc-backup }
    patch: |-
      $patch: delete
      apiVersion: batch/v1
      kind: CronJob
      metadata:
        name: pvc-backup

  # error-log-retention CronJob: target website Pod, in korczewski auf 0.
  - target: { group: batch, version: v1, kind: CronJob, name: error-log-retention }
    patch: |-
      $patch: delete
      apiVersion: batch/v1
      kind: CronJob
      metadata:
        name: error-log-retention
```

### 2. Kustomize Dry-Run verifizieren

```bash
task workspace:validate ENV=fleet-korczewski
```

### 3. Commit + Push

```bash
git add prod-korczewski/kustomization.yaml
git commit -m "fix(infra): remove pvc-backup + error-log-retention CronJobs from korczewski overlay [T012964]"
git push origin chore/remove-korczewski-cronjobs-T012964
```

## Verify

- [ ] `task workspace:validate ENV=fleet-korczewski` — kein Fehler
- [ ] Kustomize-Build zeigt geloeschte CronJobs
