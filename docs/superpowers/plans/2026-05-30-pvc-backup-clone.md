---
title: pvc-backup Clone-Based Redesign Implementation Plan
ticket_id: T000317
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# pvc-backup Clone-Based Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `pvc-backup` CronJob (03:00 UTC, mentolder) actually complete instead of deadlocking on a Longhorn RWO `FailedAttachVolume` Multi-Attach error.

**Architecture:** The current single backup pod mounts all three live data PVCs directly. Two of them (`vaultwarden-data-pvc`, `docuseal-data-pvc`) are Longhorn RWO and stay attached to their running app pods on whatever node those pods land — but the backup pod is pinned to nextcloud's node (`gekko-hetzner-4`) by the existing `podAffinity` (needed for nextcloud's `local-path` volume). When an app pod is off-node, its RWO volume cannot attach to the backup pod → deadlock. The fix introduces an **orchestrator + mounter** pattern: an orchestrator pod (with RBAC) creates a fresh CSI **clone** PVC of each Longhorn data PVC (`spec.dataSource: {kind: PersistentVolumeClaim}`), waits for the clones to bind, then launches a mounter Job that mounts the **clones** (placement-independent, no contention) plus nextcloud's local-path volume (direct, co-located — it never had the bug). After the mounter finishes, the orchestrator deletes the clones. nextcloud is intentionally left on its co-located direct mount because `local-path` supports neither clone nor snapshot.

**Tech Stack:** Kubernetes Jobs/CronJobs, Longhorn CSI volume cloning, Kustomize, `rancher/kubectl` orchestration image, RBAC (ServiceAccount/Role/RoleBinding), BATS-style bash tests (`tests/local/SA-07.sh`).

**Ticket:** T000317

---

## Background — verified failure (2026-05-30)

A manually materialised Job from the CronJob (`kubectl create job --from=cronjob/pvc-backup`) hung in `ContainerCreating` ~6 min. Pod events:

```
Warning  FailedAttachVolume   Multi-Attach error for volume "pvc-4ff32fa0..." (docuseal-data)
                               Volume is already used by pod docuseal-7bdd9bf6c9-bzb7f
```

Node layout at the time: backup pod forced to `gekko-hetzner-4` (nextcloud local-path affinity); `vaultwarden` app pod on hetzner-4 (its Longhorn volume attached fine), `docuseal` app pod on hetzner-3 (its Longhorn volume could not multi-attach to hetzner-4). The outcome flips with any app-pod reschedule — the design is fragile, not occasionally broken.

## Cluster facts confirmed (do not re-discover)

- `nextcloud-data-pvc` → `local-path` (PR #1167 excluded it from Longhorn for disk headroom), hard node-affinity to `gekko-hetzner-4`.
- `vaultwarden-data-pvc`, `docuseal-data-pvc` → `longhorn`, RWO.
- `backup-pvc` → `longhorn`, RWO, Bound — attaches fine on hetzner-4 (proven during the test).
- Longhorn CSI driver `driver.longhorn.io` is present and supports volume cloning via PVC `dataSource`.
- The Kubernetes `snapshot.storage.k8s.io` CRDs (external-snapshotter) are **NOT** installed → we deliberately use **CSI volume cloning** (no cluster-wide CRD install needed) rather than `VolumeSnapshot`.

## Alternative considered (and rejected)

- **Install external-snapshotter + VolumeSnapshotClass and snapshot instead of clone.** Rejected for this iteration: it's a cluster-wide CRD + controller install on both clusters for no functional gain over CSI clone, which Longhorn already supports. If clone-from-attached proves unreliable (Task 1 spike), this is the documented fallback.
- **Per-app co-located backup Jobs (one CronJob per PVC, each `podAffinity`'d to its own app).** Avoids clones but forces three pods writing to the shared Longhorn RWO `backup-pvc` from potentially three nodes → reintroduces Multi-Attach on `backup-pvc`, or drops local 30-day retention. Rejected: more moving parts, worse retention.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `tests/local/SA-07.sh` | T12 already added (failing) — asserts the two Longhorn PVCs are not direct-mounted; T9 reconciled in Task 4 |
| Create | `k3d/pvc-backup-rbac.yaml` | ServiceAccount + Role + RoleBinding letting the orchestrator manage clone PVCs and the mounter Job in `workspace` |
| Modify | `k3d/pvc-backup-cronjob.yaml` | Replace the direct-mount pod with the orchestrator pod (creates clones → launches mounter → cleans up) |
| Modify | `k3d/kustomization.yaml` | Add `pvc-backup-rbac.yaml` to resources |
| Modify | `scripts/backup-restore.sh` | No behaviour change needed (archives stay `*.tar.gz.enc`); add a one-line comment noting clones are ephemeral. Verify only. |

---

## Task 1: Spike — prove Longhorn clone-from-attached works

A clone of an **in-use** RWO Longhorn volume must bind and be readable while the source app pod keeps running. Verify on the live mentolder cluster before building the manifest around it. This is a throwaway spike; nothing is committed.

**Files:** none (live-cluster spike).

- [ ] **Step 1: Create a clone PVC of the live docuseal volume**

```bash
kubectl --context mentolder apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: docuseal-data-clone-spike
  namespace: workspace
spec:
  storageClassName: longhorn
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 5Gi
  dataSource:
    kind: PersistentVolumeClaim
    name: docuseal-data-pvc
EOF
```

> Set `storage` ≥ the source PVC's capacity. Check with `kubectl --context mentolder get pvc docuseal-data-pvc -n workspace -o jsonpath='{.spec.resources.requests.storage}'` and match or exceed it.

- [ ] **Step 2: Confirm the clone binds while the source stays attached**

Run: `kubectl --context mentolder get pvc docuseal-data-clone-spike -n workspace -w`
Expected: reaches `Bound` within ~60s. The live `docuseal` pod must remain `Running` throughout (`kubectl --context mentolder get pod -n workspace -l app=docuseal`).

- [ ] **Step 3: Mount the clone read-only on hetzner-4 and read it**

```bash
kubectl --context mentolder run clone-read-spike -n workspace --restart=Never --image=alpine:3 \
  --overrides='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"gekko-hetzner-4"},"containers":[{"name":"r","image":"alpine:3","command":["sh","-c","ls -A /d | head; echo OK"],"volumeMounts":[{"name":"d","mountPath":"/d","readOnly":true}]}],"volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"docuseal-data-clone-spike"}}]}}'
kubectl --context mentolder logs clone-read-spike -n workspace
```

Expected: lists files and prints `OK` (clone is attachable + readable on hetzner-4 even though the source app pod is on another node).

- [ ] **Step 4: Decision gate + cleanup**

```bash
kubectl --context mentolder delete pod clone-read-spike -n workspace
kubectl --context mentolder delete pvc docuseal-data-clone-spike -n workspace
```

If Steps 2–3 succeeded → proceed with the clone design (Tasks 2–6). If the clone failed to bind or read, **stop and switch to the external-snapshotter fallback** (see "Alternative considered"); update this plan before continuing. Record the outcome in T000317.

- [ ] **Step 5: Commit** — nothing to commit (spike only). Note result in the ticket.

---

## Task 2: RBAC for the orchestrator

The orchestrator pod creates/deletes clone PVCs and creates/waits/deletes the mounter Job. Give it a scoped ServiceAccount.

**Files:**
- Create: `k3d/pvc-backup-rbac.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Write the failing test**

Add to `tests/local/SA-07.sh` (after the T12 block):

```bash
# T13: orchestrator RBAC objects are declared in the base kustomization [T000317]
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
RBAC_OUT=$(kustomize build "${PROJECT_DIR}/k3d" 2>/dev/null)
for kind_name in "ServiceAccount/pvc-backup" "Role/pvc-backup" "RoleBinding/pvc-backup"; do
  KIND="${kind_name%/*}"; NAME="${kind_name#*/}"
  FOUND=$(echo "$RBAC_OUT" | python3 -c "
import sys, yaml
for d in yaml.safe_load_all(sys.stdin):
    if d and d.get('kind')=='${KIND}' and d.get('metadata',{}).get('name')=='${NAME}':
        print('yes'); break
else:
    print('no')
" 2>/dev/null || echo "ERROR")
  assert_eq "$FOUND" "yes" "SA-07" "T13-${KIND}" "pvc-backup ${KIND} im base kustomize build vorhanden [T000317]"
done
```

- [ ] **Step 2: Run test to verify it fails**

Run: `kustomize build k3d >/dev/null && ./tests/runner.sh local SA-07`
Expected: T13-ServiceAccount / T13-Role / T13-RoleBinding FAIL (objects not yet defined).

- [ ] **Step 3: Create the RBAC manifest**

```yaml
# k3d/pvc-backup-rbac.yaml
# RBAC for the pvc-backup orchestrator: manage ephemeral clone PVCs and the
# mounter Job within the workspace namespace. [T000317]
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pvc-backup
  namespace: workspace
  labels:
    app: pvc-backup
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pvc-backup
  namespace: workspace
  labels:
    app: pvc-backup
rules:
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "create", "delete", "watch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pvc-backup
  namespace: workspace
  labels:
    app: pvc-backup
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pvc-backup
subjects:
  - kind: ServiceAccount
    name: pvc-backup
    namespace: workspace
```

- [ ] **Step 4: Register the manifest in the base kustomization**

Add to the `resources:` list in `k3d/kustomization.yaml` (alphabetical/grouped near the other backup entries):

```yaml
  - pvc-backup-rbac.yaml
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./tests/runner.sh local SA-07`
Expected: T13-ServiceAccount / T13-Role / T13-RoleBinding PASS.

- [ ] **Step 6: Commit**

```bash
git add k3d/pvc-backup-rbac.yaml k3d/kustomization.yaml tests/local/SA-07.sh
git commit -m "feat(backup): add pvc-backup orchestrator RBAC [T000317]"
```

---

## Task 3: Rewrite pvc-backup as orchestrator + mounter

Replace the single direct-mount pod with an orchestrator that clones the two Longhorn PVCs, runs a mounter Job, and cleans up. The mounter reuses the existing tar+encrypt+Filen logic but mounts **clones** for the Longhorn PVCs and the **direct** local-path volume for nextcloud.

**Files:**
- Modify: `k3d/pvc-backup-cronjob.yaml` (full replacement of the jobTemplate)

- [ ] **Step 1: Replace the CronJob manifest**

Replace the entire contents of `k3d/pvc-backup-cronjob.yaml` with:

```yaml
# ═══════════════════════════════════════════════════════════════════
# PVC Data Backup — daily encrypted tar archives of file-backed PVCs
# SA-07: Daily at 03:00 UTC (one hour after db-backup at 02:00)
#
# Design (T000317): the orchestrator pod clones the two Longhorn data
# PVCs (vaultwarden, docuseal) via CSI dataSource so the backup mounts
# placement-independent copies — never the live RWO volumes, which
# deadlock on Multi-Attach when the app pod runs on another node.
# nextcloud-data stays on local-path (no clone support) and is mounted
# directly by the mounter, which is co-located with the nextcloud pod
# via podAffinity (same node → local-path is shareable). After the
# mounter Job completes, the orchestrator deletes the clones.
# ═══════════════════════════════════════════════════════════════════
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pvc-backup
  namespace: workspace
  labels:
    app: pvc-backup
spec:
  schedule: "0 3 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 3600
      template:
        metadata:
          labels:
            app: pvc-backup
        spec:
          serviceAccountName: pvc-backup
          restartPolicy: Never
          securityContext:
            runAsNonRoot: true
            runAsUser: 65534
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: orchestrator
              image: rancher/kubectl:v1.30.2
              imagePullPolicy: IfNotPresent
              securityContext:
                allowPrivilegeEscalation: false
                runAsNonRoot: true
                runAsUser: 65534
                capabilities:
                  drop: ["ALL"]
              command: ["/bin/sh", "-c"]
              args:
                - |
                  set -eu
                  NS=workspace
                  STAMP=$(date +%Y%m%d-%H%M%S)
                  MOUNTER="pvc-backup-mounter-${STAMP}"
                  CLONES="vaultwarden-data-backup-clone docuseal-data-backup-clone"

                  cleanup() {
                    echo "Cleanup: deleting mounter Job and clone PVCs..."
                    kubectl -n "$NS" delete job "$MOUNTER" --ignore-not-found --wait=true || true
                    for c in $CLONES; do
                      kubectl -n "$NS" delete pvc "$c" --ignore-not-found || true
                    done
                  }
                  trap cleanup EXIT

                  # Stale clones from a crashed prior run would block creation.
                  for c in $CLONES; do
                    kubectl -n "$NS" delete pvc "$c" --ignore-not-found || true
                  done

                  echo "Creating clone PVCs from live Longhorn volumes..."
                  VW_SIZE=$(kubectl -n "$NS" get pvc vaultwarden-data-pvc -o jsonpath='{.spec.resources.requests.storage}')
                  DS_SIZE=$(kubectl -n "$NS" get pvc docuseal-data-pvc   -o jsonpath='{.spec.resources.requests.storage}')
                  kubectl -n "$NS" apply -f - <<CLONE
                  apiVersion: v1
                  kind: PersistentVolumeClaim
                  metadata:
                    name: vaultwarden-data-backup-clone
                    labels: { app: pvc-backup }
                  spec:
                    storageClassName: longhorn
                    accessModes: ["ReadWriteOnce"]
                    resources: { requests: { storage: ${VW_SIZE} } }
                    dataSource: { kind: PersistentVolumeClaim, name: vaultwarden-data-pvc }
                  ---
                  apiVersion: v1
                  kind: PersistentVolumeClaim
                  metadata:
                    name: docuseal-data-backup-clone
                    labels: { app: pvc-backup }
                  spec:
                    storageClassName: longhorn
                    accessModes: ["ReadWriteOnce"]
                    resources: { requests: { storage: ${DS_SIZE} } }
                    dataSource: { kind: PersistentVolumeClaim, name: docuseal-data-pvc }
                  CLONE

                  echo "Waiting for clone PVCs to bind..."
                  for c in $CLONES; do
                    for i in $(seq 1 60); do
                      PHASE=$(kubectl -n "$NS" get pvc "$c" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
                      [ "$PHASE" = "Bound" ] && break
                      sleep 5
                    done
                    [ "$PHASE" = "Bound" ] || { echo "Clone $c did not bind (phase=$PHASE)"; exit 1; }
                    echo "  ✓ $c Bound"
                  done

                  echo "Launching mounter Job $MOUNTER..."
                  kubectl -n "$NS" apply -f - <<MJOB
                  apiVersion: batch/v1
                  kind: Job
                  metadata:
                    name: ${MOUNTER}
                    labels: { app: pvc-backup, role: mounter }
                  spec:
                    backoffLimit: 0
                    activeDeadlineSeconds: 3000
                    template:
                      metadata:
                        labels: { app: pvc-backup, role: mounter }
                      spec:
                        restartPolicy: Never
                        # Co-locate with nextcloud for its local-path RWO mount.
                        affinity:
                          podAffinity:
                            requiredDuringSchedulingIgnoredDuringExecution:
                              - labelSelector: { matchLabels: { app: nextcloud } }
                                topologyKey: kubernetes.io/hostname
                          nodeAffinity:
                            requiredDuringSchedulingIgnoredDuringExecution:
                              nodeSelectorTerms:
                                - matchExpressions:
                                    - key: kubernetes.io/hostname
                                      operator: NotIn
                                      values: [k3s-1, k3s-2, k3s-3, k3w-1, k3w-2, k3w-3]
                        securityContext:
                          runAsNonRoot: true
                          runAsUser: 65534
                          fsGroup: 65534
                          seccompProfile: { type: RuntimeDefault }
                        containers:
                          - name: backup
                            image: alpine:3
                            imagePullPolicy: IfNotPresent
                            securityContext:
                              allowPrivilegeEscalation: false
                              runAsNonRoot: true
                              runAsUser: 65534
                              capabilities: { drop: ["ALL"] }
                            env:
                              - name: BACKUP_PASSPHRASE
                                valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } }
                              - name: BRAND
                                valueFrom: { configMapKeyRef: { name: backup-config, key: BRAND } }
                              - name: FILEN_DEFAULT_UPLOAD_PATH
                                valueFrom: { configMapKeyRef: { name: backup-config, key: FILEN_DEFAULT_UPLOAD_PATH } }
                              - name: FILEN_EMAIL
                                valueFrom: { secretKeyRef: { name: workspace-secrets, key: FILEN_EMAIL, optional: true } }
                              - name: FILEN_PASSWORD
                                valueFrom: { secretKeyRef: { name: workspace-secrets, key: FILEN_PASSWORD, optional: true } }
                            command: ["/bin/sh", "-c"]
                            args:
                              - |
                                set -euo pipefail
                                sleep 5
                                STAMP=\$(date +%Y%m%d-%H%M%S)
                                BACKUP_DIR=/backups/pvc-\${STAMP}
                                mkdir -p "\${BACKUP_DIR}"
                                FAILED=0
                                backup_dir() {
                                  SRC="\$1"; OUT="\$2"; LABEL="\$3"
                                  echo "Backing up \${LABEL} (\${SRC})..."
                                  if [ "\$(ls -A "\${SRC}" 2>/dev/null)" ]; then
                                    tar czf - -C "\${SRC}" . \
                                      | openssl enc -aes-256-cbc -salt -pbkdf2 \
                                          -out "\${BACKUP_DIR}/\${OUT}" -pass env:BACKUP_PASSPHRASE \
                                      && echo "  ✓ \${LABEL} OK (\$(ls -lh "\${BACKUP_DIR}/\${OUT}" | awk '{print \$5}'))" \
                                      || { echo "  ✗ \${LABEL} FAILED"; FAILED=\$((FAILED+1)); }
                                  else
                                    echo "  ⚠ \${SRC} empty — skipping"
                                  fi
                                }
                                backup_dir /nextcloud-data   nextcloud-files.tar.gz.enc  nextcloud-data
                                backup_dir /vaultwarden-data vaultwarden-data.tar.gz.enc vaultwarden-data
                                backup_dir /docuseal-data    docuseal-data.tar.gz.enc    docuseal-data
                                find /backups -maxdepth 1 -type d -name 'pvc-*' -mtime +30 -exec rm -rf {} +
                                printf '%s' "\${FILEN_DEFAULT_UPLOAD_PATH}" > /staging/.filen_path
                                printf '%s' "pvc-\${STAMP}" > /staging/.done
                                echo "PVC backup complete: \${BACKUP_DIR}"
                                ls -lh "\${BACKUP_DIR}/"
                                [ "\${FAILED}" -eq 0 ] || { echo "WARN: \${FAILED} backup(s) failed"; exit 1; }
                            volumeMounts:
                              - { name: backup-storage,   mountPath: /backups }
                              - { name: nextcloud-data,   mountPath: /nextcloud-data,   readOnly: true }
                              - { name: vaultwarden-data, mountPath: /vaultwarden-data, readOnly: true }
                              - { name: docuseal-data,    mountPath: /docuseal-data,    readOnly: true }
                              - { name: staging,          mountPath: /staging }
                            resources:
                              requests: { memory: 256Mi, cpu: "200m" }
                              limits:   { memory: 1Gi,   cpu: "1" }
                          - name: filen-upload
                            image: node:22-alpine
                            imagePullPolicy: IfNotPresent
                            securityContext:
                              allowPrivilegeEscalation: false
                              capabilities: { drop: ["ALL"] }
                            command: ["/bin/sh", "-c"]
                            args:
                              - |
                                if [ -z "\${FILEN_EMAIL}" ] || [ -z "\${FILEN_PASSWORD}" ]; then
                                  echo "Filen not configured — skipping upload"
                                  until [ -f /staging/.done ]; do sleep 2; done
                                  exit 0
                                fi
                                echo "Waiting for backup to complete..."
                                until [ -f /staging/.done ]; do sleep 2; done
                                STAMP=\$(cat /staging/.done)
                                UPLOAD_PATH=\$(cat /staging/.filen_path)
                                export HOME=/tmp
                                npm install -g @filen/cli --prefix /tmp/npm-global --silent 2>&1 | tail -3
                                export PATH="/tmp/npm-global/bin:\$PATH"
                                echo "Uploading \${STAMP} to Filen: \${UPLOAD_PATH}/\${STAMP}/"
                                filen --email "\${FILEN_EMAIL}" --password "\${FILEN_PASSWORD}" \
                                  upload "/backups/\${STAMP}/" "\${UPLOAD_PATH}/\${STAMP}/" \
                                  || echo "WARNING: Filen upload failed — local backup intact"
                                echo "Filen upload done"
                            env:
                              - name: FILEN_EMAIL
                                valueFrom: { secretKeyRef: { name: workspace-secrets, key: FILEN_EMAIL, optional: true } }
                              - name: FILEN_PASSWORD
                                valueFrom: { secretKeyRef: { name: workspace-secrets, key: FILEN_PASSWORD, optional: true } }
                            volumeMounts:
                              - { name: backup-storage, mountPath: /backups, readOnly: true }
                              - { name: staging,        mountPath: /staging, readOnly: true }
                            resources:
                              requests: { memory: 256Mi, cpu: "100m" }
                              limits:   { memory: 512Mi, cpu: "500m" }
                        volumes:
                          - name: backup-storage
                            persistentVolumeClaim: { claimName: backup-pvc }
                          - name: nextcloud-data
                            persistentVolumeClaim: { claimName: nextcloud-data-pvc }
                          - name: vaultwarden-data
                            persistentVolumeClaim: { claimName: vaultwarden-data-backup-clone }
                          - name: docuseal-data
                            persistentVolumeClaim: { claimName: docuseal-data-backup-clone }
                          - name: staging
                            emptyDir: {}
                  MJOB

                  echo "Waiting for mounter Job to finish..."
                  kubectl -n "$NS" wait --for=condition=complete --timeout=3000s job/"$MOUNTER" &
                  CW=$!
                  kubectl -n "$NS" wait --for=condition=failed --timeout=3000s job/"$MOUNTER" &
                  FW=$!
                  wait -n "$CW" "$FW" || true
                  STATUS=$(kubectl -n "$NS" get job "$MOUNTER" -o jsonpath='{.status.conditions[?(@.status=="True")].type}')
                  echo "Mounter logs:"
                  kubectl -n "$NS" logs job/"$MOUNTER" --all-containers --tail=80 || true
                  echo "Mounter terminal status: ${STATUS:-Unknown}"
                  [ "$STATUS" = "Complete" ] || { echo "Backup mounter did not complete"; exit 1; }
                  echo "pvc-backup orchestration succeeded."
              resources:
                requests: { memory: 64Mi, cpu: "50m" }
                limits:   { memory: 256Mi, cpu: "500m" }
```

> **`concurrencyPolicy: Forbid`** prevents a second run from racing on the fixed-name clone PVCs. **`restartPolicy: Never` + `backoffLimit: 1`** on the orchestrator, and the `trap cleanup EXIT`, ensure clones are deleted even on failure.

- [ ] **Step 2: Validate the manifest builds**

Run: `kustomize build k3d >/dev/null && echo OK`
Expected: `OK` (no YAML errors).

- [ ] **Step 3: Run the failing tests — now green**

Run: `./tests/runner.sh local SA-07`
Expected: T12-vaultwarden-data-pvc / T12-docuseal-data-pvc PASS (the CronJob's own volumes no longer reference the live Longhorn PVCs — they reference `*-backup-clone`). T13 still PASS.

- [ ] **Step 4: Commit**

```bash
git add k3d/pvc-backup-cronjob.yaml
git commit -m "fix(backup): clone Longhorn PVCs in pvc-backup to avoid Multi-Attach [T000317]"
```

---

## Task 4: Reconcile T9 (live-cluster volume assertion)

T9a–T9c in `tests/local/SA-07.sh` assert the **live** CronJob mounts `nextcloud-data-pvc`, `vaultwarden-data-pvc`, `docuseal-data-pvc` by name. After Task 3 the CronJob's own volumes are `nextcloud-data-pvc` + the two `*-backup-clone` names, so T9b/T9c would break. Update them to assert the mounter pod template inside the orchestrator script references the clones.

**Files:**
- Modify: `tests/local/SA-07.sh` (T9 block)

- [ ] **Step 1: Read the current T9 block**

Run: `grep -n "T9" tests/local/SA-07.sh`
Locate the `PVC_VOLS=$(kubectl ... pvc-backup ...)` extraction and the three `assert_contains` lines.

- [ ] **Step 2: Replace the T9 assertions**

The live CronJob no longer lists vaultwarden/docuseal directly — they appear as clone names in the embedded mounter manifest (the orchestrator `args` string). Replace T9b/T9c so they assert the CronJob spec contains the clone claim names, and keep T9a for nextcloud. Concretely, change the extraction to read the whole CronJob spec as text and assert:

```bash
# T9: pvc-backup wires up all three data sources [T000317]
CJ_SPEC=$(kubectl get cronjob pvc-backup -n "$NAMESPACE" -o yaml 2>/dev/null || echo "")
assert_contains "$CJ_SPEC" "nextcloud-data-pvc"            "SA-07" "T9a" "pvc-backup mountet nextcloud-data-pvc direkt (co-located)"
assert_contains "$CJ_SPEC" "vaultwarden-data-backup-clone" "SA-07" "T9b" "pvc-backup nutzt vaultwarden Clone-PVC"
assert_contains "$CJ_SPEC" "docuseal-data-backup-clone"    "SA-07" "T9c" "pvc-backup nutzt docuseal Clone-PVC"
```

- [ ] **Step 3: Update the test inventory**

Run: `task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
If it reports a diff, the inventory changed — stage it in Step 5. (CI fails if `test-inventory.json` is stale.)

- [ ] **Step 4: Run offline suite**

Run: `task test:all`
Expected: green. (T9 is a live-cluster test; locally it will skip/no-op without a cluster — confirm no syntax error in SA-07 by sourcing it: `bash -n tests/local/SA-07.sh && echo OK`.)

- [ ] **Step 5: Commit**

```bash
git add tests/local/SA-07.sh website/src/data/test-inventory.json
git commit -m "test(SA-07): reconcile T9 with clone-based pvc-backup [T000317]"
```

---

## Task 5: Verify backup-restore.sh is unaffected

The on-disk/Filen artifacts are unchanged (`*.tar.gz.enc` under `pvc-<stamp>/`). `backup-restore.sh pvc-restore` should need no change. Confirm.

**Files:**
- Modify (comment only, if anything): `scripts/backup-restore.sh`

- [ ] **Step 1: Read the pvc-restore path**

Run: `grep -n "pvc-restore\|nextcloud-files\|vaultwarden-data\|docuseal-data" scripts/backup-restore.sh`
Expected: restore reads the same archive filenames the mounter writes (`nextcloud-files.tar.gz.enc`, `vaultwarden-data.tar.gz.enc`, `docuseal-data.tar.gz.enc`). No code change required.

- [ ] **Step 2: Confirm T10 still passes**

Run: `bash scripts/backup-restore.sh --help` → must still print `pvc-restore`. (SA-07 T10 already covers this.)

- [ ] **Step 3: Commit (only if a comment was added)**

```bash
git add scripts/backup-restore.sh
git commit -m "docs(backup): note clone PVCs are ephemeral in restore path [T000317]"
```

If no edit was needed, skip this commit.

---

## Task 6: Live end-to-end verification on mentolder

Prove the 03:00 path now completes, without waiting for the schedule. Run after the branch is deployed to the mentolder prod overlay (post-merge, via the normal `task feature:deploy` flow — this is part of dev-flow-execute's deploy step, not this plan).

**Files:** none (live verification).

- [ ] **Step 1: Materialise a manual run**

```bash
kubectl --context mentolder create job --from=cronjob/pvc-backup pvc-backup-verify -n workspace
```

- [ ] **Step 2: Watch the orchestrator drive the run**

```bash
kubectl --context mentolder get pods -n workspace -l app=pvc-backup -w
kubectl --context mentolder logs -f job/pvc-backup-verify -n workspace
```

Expected sequence in the orchestrator log: clone PVCs created → both `Bound` → mounter Job launched → mounter logs show `✓ nextcloud-data OK`, `✓ vaultwarden-data OK`, `✓ docuseal-data OK` → `Mounter terminal status: Complete` → `Cleanup: deleting ...` → `pvc-backup orchestration succeeded.`

- [ ] **Step 3: Confirm no clones leaked**

```bash
kubectl --context mentolder get pvc -n workspace | grep backup-clone || echo "clean — no leftover clones"
```

Expected: `clean — no leftover clones`.

- [ ] **Step 4: Confirm the Filen upload (if configured)**

In the `filen-upload` container logs: `Filen upload done` and no `WARNING: Filen upload failed`.

- [ ] **Step 5: Clean up the manual Job**

```bash
kubectl --context mentolder delete job pvc-backup-verify -n workspace
```

- [ ] **Step 6: Update the ticket**

Mark T000317 `done` with resolution `fixed` once Steps 1–5 pass, summarising the verified end-to-end run.

---

## Self-Review

- **Spec coverage:** Multi-Attach root cause (Task 3 clones the Longhorn PVCs; nextcloud co-located direct mount retained), RBAC for orchestration (Task 2), clone feasibility de-risked (Task 1 spike), tests red→green (T12 Task 3, T13 Task 2, T9 reconciled Task 4), restore unaffected (Task 5), live proof (Task 6). Covered.
- **Placeholder scan:** every code step contains full manifests/commands; no TBD/TODO.
- **Type/name consistency:** clone PVC names `vaultwarden-data-backup-clone` / `docuseal-data-backup-clone` are identical across the orchestrator clone-creation, the mounter `volumes`, the T9 assertions, and the cleanup. ServiceAccount/Role/RoleBinding all named `pvc-backup`. Mounter Job name `pvc-backup-mounter-<stamp>` is generated once and reused in wait/log/cleanup.

## Risks / watch-items for the executor

- **Clone size:** clones request the source PVC's `spec.resources.requests.storage`. If Longhorn lacks free space for two clones (recall PR #1167 excluded nextcloud for headroom), the clone PVCs may stay `Pending` → orchestrator fails fast at the bind wait. Check `kubectl get nodes.longhorn.io -n longhorn-system` free space before first prod run; if tight, lower clone replica count via a Longhorn StorageClass param or stagger the two clones sequentially.
- **rancher/kubectl image tag:** pin to the cluster's server minor (`v1.30.x` shown). Verify with `kubectl --context mentolder version` and adjust the tag if the server is newer.
- **korczewski:** this CronJob is mentolder-only (Filen + these PVCs). Do not fan out to korczewski unless it grows the same stack.
