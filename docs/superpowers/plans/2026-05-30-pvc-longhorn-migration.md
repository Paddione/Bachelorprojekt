---
title: PVC Longhorn Migration Implementation Plan
ticket_id: T000317
domains: [website, infra, ops, test]
status: active
pr_number: null
---

# PVC Longhorn Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `nextcloud-data-pvc`, `vaultwarden-data-pvc`, and `docuseal-data-pvc` from `local-path` to `longhorn` storage so the `pvc-backup` CronJob (03:00 UTC) can mount all three PVCs in a single pod.

**Architecture:** Add a Kustomize strategic-merge patch in `prod-mentolder/` that sets `storageClassName: longhorn` for the three data PVCs. Existing live PVCs have immutable storageClass, so each service is migrated one at a time: scale down → tar data to `backup-pvc` (already on Longhorn) → delete old PVC → `kustomize apply` creates new Longhorn PVC with the same name → restore data → scale up → verify.

**Tech Stack:** Kustomize, kubectl, alpine:3 (migration pods), BATS-style bash tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `tests/local/SA-07.sh` | T11 already added (failing) — no further changes needed |
| Create | `prod-mentolder/patch-data-pvc-storage.yaml` | Strategic-merge patches setting storageClass=longhorn for the 3 data PVCs |
| Modify | `prod-mentolder/kustomization.yaml` | Add `- path: patch-data-pvc-storage.yaml` to patches list |

---

### Task 1: Add Longhorn storageClass patch to prod-mentolder overlay

T11 in `tests/local/SA-07.sh` is already written and failing (red). This task makes it pass (green).

**Files:**
- Create: `prod-mentolder/patch-data-pvc-storage.yaml`
- Modify: `prod-mentolder/kustomization.yaml`

- [x] **Step 1: Create the storage patch file**

```bash
cat > prod-mentolder/patch-data-pvc-storage.yaml << 'EOF'
# Overrides storageClassName from local-path (base) to longhorn (prod).
# local-path PVCs are node-pinned RWO; pvc-backup cannot mount PVCs from two nodes.
# Longhorn is distributed — any Hetzner node can access the volume.
# NOTE: storageClass is immutable on existing PVCs. Apply this patch AFTER manual migration.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nextcloud-data-pvc
spec:
  storageClassName: longhorn
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: vaultwarden-data-pvc
spec:
  storageClassName: longhorn
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: docuseal-data-pvc
spec:
  storageClassName: longhorn
EOF
```

- [x] **Step 2: Wire the patch into the kustomization**

In `prod-mentolder/kustomization.yaml`, find the existing `- path: patch-backup-config.yaml` line and add the new patch directly after it:

```yaml
  - path: patch-backup-config.yaml
  - path: patch-data-pvc-storage.yaml   # ← add this line
  - path: patch-livekit.yaml
```

- [x] **Step 3: Verify kustomize build includes the Longhorn storageClass**

```bash
kustomize build prod-mentolder/ | grep -A5 "nextcloud-data-pvc" | grep storageClassName
# Expected output: storageClassName: longhorn
kustomize build prod-mentolder/ | grep -A5 "vaultwarden-data-pvc" | grep storageClassName
# Expected output: storageClassName: longhorn
kustomize build prod-mentolder/ | grep -A5 "docuseal-data-pvc" | grep storageClassName
# Expected output: storageClassName: longhorn
```

- [x] **Step 4: Run T11 — should now pass**

```bash
NAMESPACE=workspace RESULTS_FILE=/tmp/sa07-t11.jsonl bash tests/local/SA-07.sh 2>&1 | grep T11
# Expected: 3× "✓ SA-07/T11-*"
```

- [x] **Step 5: Run full offline test suite**

```bash
task test:all
# Expected: all tests pass (T1-T5 may skip if dev cluster is not running — that is OK)
```

- [x] **Step 6: Commit**

```bash
git add prod-mentolder/patch-data-pvc-storage.yaml prod-mentolder/kustomization.yaml tests/local/SA-07.sh
git commit -m "fix(infra): add Longhorn storageClass patch for data PVCs in prod-mentolder [T000317]"
```

---

### Task 2: Migrate nextcloud-data-pvc (gekko-hetzner-4)

> **IMPORTANT:** Run these steps exactly in order. Deleting a PVC destroys the live data. The tar archive on backup-pvc is the only safety net.
> Run: `kubectl --context mentolder -n workspace` for all commands below (abbreviated as `KB` in step comments).

**Prerequisite:** Task 1 committed and `kustomize build prod-mentolder/` shows `storageClassName: longhorn` for `nextcloud-data-pvc`.

- [ ] **Step 1: Scale down nextcloud**

```bash
kubectl --context mentolder -n workspace scale deploy/nextcloud --replicas=0
kubectl --context mentolder -n workspace wait deployment/nextcloud --for=condition=Available=False --timeout=60s || true
# Verify: 0 pods
kubectl --context mentolder -n workspace get pods -l app=nextcloud
# Expected: No resources found
```

- [ ] **Step 2: Create migration pod to tar nextcloud data into backup-pvc**

The pod must run on `gekko-hetzner-4` (where `nextcloud-data-pvc` lives — local-path is node-locked).

```bash
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: migrate-nextcloud
  namespace: workspace
spec:
  nodeName: gekko-hetzner-4
  restartPolicy: Never
  containers:
  - name: migrate
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: source
      mountPath: /source
      readOnly: true
    - name: staging
      mountPath: /staging
  volumes:
  - name: source
    persistentVolumeClaim:
      claimName: nextcloud-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
EOF
kubectl --context mentolder -n workspace wait pod/migrate-nextcloud --for=condition=Ready --timeout=90s
```

- [ ] **Step 3: Tar nextcloud data to backup-pvc**

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
kubectl --context mentolder -n workspace exec migrate-nextcloud -- \
  sh -c "tar czf /staging/migration-nextcloud-${STAMP}.tar.gz -C /source . && echo 'tar OK'"
# Expected output: tar OK

# Verify archive is substantial (nextcloud data is typically several MB)
kubectl --context mentolder -n workspace exec migrate-nextcloud -- \
  ls -lh /staging/migration-nextcloud-${STAMP}.tar.gz
# Expected: file size > 0, not empty
```

- [ ] **Step 4: Delete migration pod and old PVC**

```bash
kubectl --context mentolder -n workspace delete pod migrate-nextcloud

# ⚠️  IRREVERSIBLE — only proceed after verifying Step 3 succeeded
kubectl --context mentolder -n workspace delete pvc nextcloud-data-pvc
# Expected: persistentvolumeclaim "nextcloud-data-pvc" deleted
```

- [ ] **Step 5: Re-apply kustomize to create new Longhorn PVC**

```bash
kubectl apply -k prod-mentolder/ --context mentolder 2>&1 | grep -E "configured|created|unchanged|error"
# Expected: "nextcloud-data-pvc ... created" among the output

kubectl --context mentolder -n workspace wait pvc/nextcloud-data-pvc --for=jsonpath='{.status.phase}'=Bound --timeout=60s
kubectl --context mentolder -n workspace get pvc nextcloud-data-pvc -o jsonpath='{.spec.storageClassName}'
# Expected: longhorn
```

- [ ] **Step 6: Restore data from backup-pvc to new Longhorn PVC**

```bash
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: restore-nextcloud
  namespace: workspace
spec:
  restartPolicy: Never
  containers:
  - name: restore
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: dest
      mountPath: /dest
    - name: staging
      mountPath: /staging
      readOnly: true
  volumes:
  - name: dest
    persistentVolumeClaim:
      claimName: nextcloud-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
      readOnly: true
EOF
kubectl --context mentolder -n workspace wait pod/restore-nextcloud --for=condition=Ready --timeout=90s
```

- [ ] **Step 7: Extract archive into new PVC**

```bash
# Use the same STAMP from Step 3 — if session was reset, find it:
# kubectl exec restore-nextcloud -- ls /staging/migration-nextcloud-*.tar.gz
kubectl --context mentolder -n workspace exec restore-nextcloud -- \
  sh -c "tar xzf /staging/migration-nextcloud-${STAMP}.tar.gz -C /dest && echo 'restore OK'"
# Expected: restore OK

# Verify data is present
kubectl --context mentolder -n workspace exec restore-nextcloud -- \
  sh -c "ls /dest | head -5 && echo 'data present'"
```

- [ ] **Step 8: Clean up restore pod and scale nextcloud back up**

```bash
kubectl --context mentolder -n workspace delete pod restore-nextcloud
kubectl --context mentolder -n workspace scale deploy/nextcloud --replicas=1
kubectl --context mentolder -n workspace wait deployment/nextcloud --for=condition=Available --timeout=120s
```

- [ ] **Step 9: Verify nextcloud is healthy**

```bash
kubectl --context mentolder -n workspace get pods -l app=nextcloud
# Expected: 3/3 Running

curl -sf https://files.mentolder.de/status.php | jq .
# Expected: {"installed":true,"maintenance":false,"needsDbUpgrade":false,...}
```

- [ ] **Step 10: Commit checkpoint**

```bash
git commit --allow-empty -m "chore: nextcloud-data-pvc migrated to longhorn [T000317]"
```

---

### Task 3: Migrate vaultwarden-data-pvc (gekko-hetzner-3)

Same pattern as Task 2 but for `vaultwarden-data-pvc` on `gekko-hetzner-3`.

- [ ] **Step 1: Scale down vaultwarden**

```bash
kubectl --context mentolder -n workspace scale deploy/vaultwarden --replicas=0
kubectl --context mentolder -n workspace wait deployment/vaultwarden --for=condition=Available=False --timeout=60s || true
kubectl --context mentolder -n workspace get pods -l app=vaultwarden
# Expected: No resources found
```

- [ ] **Step 2: Create migration pod on hetzner-3**

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: migrate-vaultwarden
  namespace: workspace
spec:
  nodeName: gekko-hetzner-3
  restartPolicy: Never
  containers:
  - name: migrate
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: source
      mountPath: /source
      readOnly: true
    - name: staging
      mountPath: /staging
  volumes:
  - name: source
    persistentVolumeClaim:
      claimName: vaultwarden-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
EOF
kubectl --context mentolder -n workspace wait pod/migrate-vaultwarden --for=condition=Ready --timeout=90s
```

- [ ] **Step 3: Tar vaultwarden data to backup-pvc**

```bash
kubectl --context mentolder -n workspace exec migrate-vaultwarden -- \
  sh -c "tar czf /staging/migration-vaultwarden-${STAMP}.tar.gz -C /source . && echo 'tar OK'"
# Expected: tar OK
kubectl --context mentolder -n workspace exec migrate-vaultwarden -- \
  ls -lh /staging/migration-vaultwarden-${STAMP}.tar.gz
```

- [ ] **Step 4: Delete migration pod and old PVC**

```bash
kubectl --context mentolder -n workspace delete pod migrate-vaultwarden
# ⚠️  IRREVERSIBLE — only after Step 3 succeeded
kubectl --context mentolder -n workspace delete pvc vaultwarden-data-pvc
```

- [ ] **Step 5: Re-apply kustomize to create new Longhorn PVC**

```bash
kubectl apply -k prod-mentolder/ --context mentolder 2>&1 | grep -E "vaultwarden-data-pvc|error"
kubectl --context mentolder -n workspace wait pvc/vaultwarden-data-pvc --for=jsonpath='{.status.phase}'=Bound --timeout=60s
kubectl --context mentolder -n workspace get pvc vaultwarden-data-pvc -o jsonpath='{.spec.storageClassName}'
# Expected: longhorn
```

- [ ] **Step 6: Restore and verify**

```bash
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: restore-vaultwarden
  namespace: workspace
spec:
  restartPolicy: Never
  containers:
  - name: restore
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: dest
      mountPath: /dest
    - name: staging
      mountPath: /staging
      readOnly: true
  volumes:
  - name: dest
    persistentVolumeClaim:
      claimName: vaultwarden-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
      readOnly: true
EOF
kubectl --context mentolder -n workspace wait pod/restore-vaultwarden --for=condition=Ready --timeout=90s

kubectl --context mentolder -n workspace exec restore-vaultwarden -- \
  sh -c "tar xzf /staging/migration-vaultwarden-${STAMP}.tar.gz -C /dest && echo 'restore OK'"
# Expected: restore OK

kubectl --context mentolder -n workspace delete pod restore-vaultwarden
```

- [ ] **Step 7: Scale vaultwarden back up and verify**

```bash
kubectl --context mentolder -n workspace scale deploy/vaultwarden --replicas=1
kubectl --context mentolder -n workspace wait deployment/vaultwarden --for=condition=Available --timeout=120s
kubectl --context mentolder -n workspace get pods -l app=vaultwarden
# Expected: 1/1 Running

curl -sf https://vault.mentolder.de/alive | head -c 50
# Expected: non-empty 200 response
```

---

### Task 4: Migrate docuseal-data-pvc (gekko-hetzner-3)

Same pattern as Task 3 but for `docuseal-data-pvc`.

- [ ] **Step 1: Scale down docuseal**

```bash
kubectl --context mentolder -n workspace scale deploy/docuseal --replicas=0
kubectl --context mentolder -n workspace wait deployment/docuseal --for=condition=Available=False --timeout=60s || true
kubectl --context mentolder -n workspace get pods -l app=docuseal
# Expected: No resources found
```

- [ ] **Step 2: Migrate + restore docuseal data**

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
# Migration pod
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: migrate-docuseal
  namespace: workspace
spec:
  nodeName: gekko-hetzner-3
  restartPolicy: Never
  containers:
  - name: migrate
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: source
      mountPath: /source
      readOnly: true
    - name: staging
      mountPath: /staging
  volumes:
  - name: source
    persistentVolumeClaim:
      claimName: docuseal-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
EOF
kubectl --context mentolder -n workspace wait pod/migrate-docuseal --for=condition=Ready --timeout=90s

kubectl --context mentolder -n workspace exec migrate-docuseal -- \
  sh -c "tar czf /staging/migration-docuseal-${STAMP}.tar.gz -C /source . && echo 'tar OK'"
# Expected: tar OK

kubectl --context mentolder -n workspace exec migrate-docuseal -- \
  ls -lh /staging/migration-docuseal-${STAMP}.tar.gz

kubectl --context mentolder -n workspace delete pod migrate-docuseal
# ⚠️  IRREVERSIBLE
kubectl --context mentolder -n workspace delete pvc docuseal-data-pvc
```

- [ ] **Step 3: Re-apply kustomize + restore**

```bash
kubectl apply -k prod-mentolder/ --context mentolder 2>&1 | grep -E "docuseal-data-pvc|error"
kubectl --context mentolder -n workspace wait pvc/docuseal-data-pvc --for=jsonpath='{.status.phase}'=Bound --timeout=60s
kubectl --context mentolder -n workspace get pvc docuseal-data-pvc -o jsonpath='{.spec.storageClassName}'
# Expected: longhorn

kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: restore-docuseal
  namespace: workspace
spec:
  restartPolicy: Never
  containers:
  - name: restore
    image: alpine:3
    imagePullPolicy: IfNotPresent
    command: ["/bin/sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: dest
      mountPath: /dest
    - name: staging
      mountPath: /staging
      readOnly: true
  volumes:
  - name: dest
    persistentVolumeClaim:
      claimName: docuseal-data-pvc
  - name: staging
    persistentVolumeClaim:
      claimName: backup-pvc
      readOnly: true
EOF
kubectl --context mentolder -n workspace wait pod/restore-docuseal --for=condition=Ready --timeout=90s

kubectl --context mentolder -n workspace exec restore-docuseal -- \
  sh -c "tar xzf /staging/migration-docuseal-${STAMP}.tar.gz -C /dest && echo 'restore OK'"
# Expected: restore OK

kubectl --context mentolder -n workspace delete pod restore-docuseal
```

- [ ] **Step 4: Scale docuseal back up and verify**

```bash
kubectl --context mentolder -n workspace scale deploy/docuseal --replicas=1
kubectl --context mentolder -n workspace wait deployment/docuseal --for=condition=Available --timeout=120s
kubectl --context mentolder -n workspace get pods -l app=docuseal
# Expected: 1/1 Running
```

---

### Task 5: Verify pvc-backup CronJob runs successfully

All three data PVCs are now on Longhorn. Trigger a manual Job from the CronJob to confirm it schedules and completes.

- [ ] **Step 1: Confirm all three PVCs show longhorn**

```bash
kubectl --context mentolder -n workspace get pvc nextcloud-data-pvc vaultwarden-data-pvc docuseal-data-pvc \
  -o custom-columns='NAME:.metadata.name,SC:.spec.storageClassName,STATUS:.status.phase'
# Expected: all three show SC=longhorn, STATUS=Bound
```

- [ ] **Step 2: Trigger manual pvc-backup job**

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
kubectl --context mentolder -n workspace create job "pvc-backup-verify-${STAMP}" \
  --from=cronjob/pvc-backup
kubectl --context mentolder -n workspace get pods -l "job-name=pvc-backup-verify-${STAMP}" -w
# Expected: pod transitions to Running within 30s (no more Pending)
```

- [ ] **Step 3: Wait for job completion and check logs**

```bash
kubectl --context mentolder -n workspace wait job/"pvc-backup-verify-${STAMP}" \
  --for=condition=Complete --timeout=300s
kubectl --context mentolder -n workspace logs job/"pvc-backup-verify-${STAMP}" -c backup
# Expected output includes:
#   ✓ nextcloud-files OK (...)
#   ✓ vaultwarden-data OK (...)
#   ✓ docuseal-data OK (...)
#   PVC backup complete: /backups/pvc-...
```

- [ ] **Step 4: Clean up migration archives from backup-pvc**

```bash
kubectl --context mentolder -n workspace apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: cleanup-migration
  namespace: workspace
spec:
  restartPolicy: Never
  containers:
  - name: cleanup
    image: alpine:3
    command: ["/bin/sh", "-c", "rm -f /backups/migration-*.tar.gz && ls /backups/ && echo done"]
    volumeMounts:
    - name: storage
      mountPath: /backups
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: backup-pvc
EOF
kubectl --context mentolder -n workspace wait pod/cleanup-migration --for=condition=Ready --timeout=60s
kubectl --context mentolder -n workspace logs cleanup-migration
kubectl --context mentolder -n workspace delete pod cleanup-migration
```

---

### Task 6: Update test inventory, commit, and open PR

- [ ] **Step 1: Regenerate test inventory (required by CI)**

```bash
task test:inventory
git diff website/src/data/test-inventory.json | head -20
# If diff is non-empty, stage it — CI fails on stale inventory
```

- [ ] **Step 2: Run full offline test suite**

```bash
task test:all
# Expected: all pass, T11 green
```

- [ ] **Step 3: Final commit and PR**

```bash
git add prod-mentolder/patch-data-pvc-storage.yaml prod-mentolder/kustomization.yaml \
        tests/local/SA-07.sh website/src/data/test-inventory.json
git commit -m "fix(infra): migrate data PVCs to Longhorn for pvc-backup scheduling [T000317]"
git push -u origin fix/t000317-pvc-longhorn-migration
gh pr create \
  --title "fix(infra): migrate data PVCs to Longhorn — enables pvc-backup CronJob [T000317]" \
  --body "$(cat << 'EOF'
## Summary
- Add Kustomize patch in `prod-mentolder/` to set `storageClassName: longhorn` on `nextcloud-data-pvc`, `vaultwarden-data-pvc`, and `docuseal-data-pvc`
- Fix SA-07/T11 (new test): proves prod overlay declares Longhorn for data PVCs
- Enables `pvc-backup` CronJob (03:00 UTC) to schedule — previously stuck Pending forever because local-path PVCs were spread across gekko-hetzner-3 (vaultwarden, docuseal) and gekko-hetzner-4 (nextcloud)

## Operational notes
- **Code-only PR** — does not migrate live PVCs. The migration procedure is documented in Tasks 2–4 of `docs/superpowers/plans/2026-05-30-pvc-longhorn-migration.md`
- After merge + prod deploy, execute the migration runbook per-service: scale down → tar to backup-pvc → delete old PVC → re-apply (creates Longhorn PVC) → restore → scale up

## Test plan
- [ ] `task test:all` passes locally
- [ ] SA-07/T11 green (3 assertions for the 3 PVCs)
- [ ] `kustomize build prod-mentolder/` shows `storageClassName: longhorn` for all three PVCs
- [ ] After manual migration: trigger `pvc-backup-verify-*` job → all three PVC archives created

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
