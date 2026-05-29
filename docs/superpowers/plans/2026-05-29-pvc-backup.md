---
title: PVC Backup Fix Implementation Plan
ticket_id: T000310
domains: []
status: active
pr_number: null
---

# PVC Backup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pvc-backup` CronJob and matching restore tooling so that all PVC-backed file data (Nextcloud files, Vaultwarden attachments, DocuSeal documents) is encrypted, stored on `backup-pvc`, and uploaded to Filen alongside the existing DB dumps.

**Architecture:** A new `pvc-backup` CronJob runs at 03:00 UTC daily (one hour after DB backup). It mounts the three critical data PVCs read-only alongside `backup-pvc` for writing. `podAffinity` to the `nextcloud` pod ensures the backup pod lands on the same Kubernetes node, satisfying the RWO "single node" constraint for Longhorn. Each PVC is tar-compressed and AES-256-CBC encrypted using the same `BACKUP_PASSPHRASE` as the DB backup. Output lands in `/backups/pvc-YYYYMMDD-HHMMSS/` on `backup-pvc`, then a sidecar uploads to Filen. `backup-restore.sh` gains `pvc-list`, `pvc-trigger`, and `pvc-restore` subcommands mirroring the existing DB restore API.

**Tech Stack:** Kubernetes CronJob, `alpine:3` (has `openssl` + `tar`), `node:22-alpine` (Filen CLI upload sidecar), `kustomize`, BATS (test assertions)

**Ticket:** T000310

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `k3d/pvc-backup-cronjob.yaml` | PVC backup CronJob + Filen sidecar |
| Modify | `k3d/kustomization.yaml` | Add pvc-backup-cronjob.yaml to resources |
| Modify | `scripts/backup-restore.sh` | Add `pvc-list`, `pvc-trigger`, `pvc-restore` subcommands |
| Modify | `Taskfile.yml` | Add `workspace:backup:pvcs` and `workspace:pvc:restore` tasks |
| Already done | `tests/local/SA-07.sh` | Failing tests T8–T10 (pvc-backup CronJob existence + volumes + restore help) |
| Already done | `tests/unit/manifests.bats` | Failing test 22 (pvc-backup in kustomize output) |

---

## Task 1: Create pvc-backup-cronjob.yaml and add to kustomization

**Files:**
- Create: `k3d/pvc-backup-cronjob.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1.1: Create `k3d/pvc-backup-cronjob.yaml`**

```yaml
# ═══════════════════════════════════════════════════════════════════
# PVC Data Backup — daily encrypted tar archives of file-backed PVCs
# SA-07: Daily at 03:00 UTC (one hour after db-backup at 02:00)
#
# Design constraint: All three data PVCs (nextcloud-data-pvc,
# vaultwarden-data-pvc, docuseal-data-pvc) must be on the same
# Kubernetes node for the backup pod to mount them (RWO single-node).
# podAffinity to the nextcloud pod enforces co-location. In production
# (Longhorn), co-location is the default for stateful workloads.
# In dev (local-path), PVCs are strictly node-pinned; SA-07 T8-T10
# only run against the live cluster, not the dev k3d stack.
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
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: pvc-backup
        spec:
          restartPolicy: OnFailure
          # Must run on the same node as nextcloud to mount its RWO PVC.
          # requiredDuringScheduling ensures this; if nextcloud is down
          # the backup will be rescheduled (OnFailure) once it is up again.
          affinity:
            podAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                - labelSelector:
                    matchLabels:
                      app: nextcloud
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
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: backup
              image: alpine:3
              imagePullPolicy: IfNotPresent
              securityContext:
                allowPrivilegeEscalation: false
                runAsNonRoot: true
                runAsUser: 65534
                capabilities:
                  drop: ["ALL"]
              env:
                - name: BACKUP_PASSPHRASE
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: BACKUP_PASSPHRASE
                - name: BRAND
                  valueFrom:
                    configMapKeyRef:
                      name: backup-config
                      key: BRAND
                - name: FILEN_DEFAULT_UPLOAD_PATH
                  valueFrom:
                    configMapKeyRef:
                      name: backup-config
                      key: FILEN_DEFAULT_UPLOAD_PATH
                - name: FILEN_EMAIL
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: FILEN_EMAIL
                      optional: true
                - name: FILEN_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: FILEN_PASSWORD
                      optional: true
              command: ["/bin/sh", "-c"]
              # Shell vars (STAMP, BACKUP_DIR, PASS, FILEN_PATH) evaluated at runtime.
              args:
                - |
                  set -euo pipefail
                  sleep 5

                  STAMP=$(date +%Y%m%d-%H%M%S)
                  BACKUP_DIR=/backups/pvc-${STAMP}
                  mkdir -p "${BACKUP_DIR}"

                  FAILED=0

                  # ── Nextcloud user files ─────────────────────────────────
                  echo "Backing up nextcloud-data (/nextcloud-data)..."
                  if [ "$(ls -A /nextcloud-data 2>/dev/null)" ]; then
                    tar czf - -C /nextcloud-data . \
                      | openssl enc -aes-256-cbc -salt -pbkdf2 \
                          -out "${BACKUP_DIR}/nextcloud-files.tar.gz.enc" \
                          -pass env:BACKUP_PASSPHRASE \
                      && echo "  ✓ nextcloud-files OK ($(ls -lh "${BACKUP_DIR}/nextcloud-files.tar.gz.enc" | awk '{print $5}'))" \
                      || { echo "  ✗ nextcloud-files FAILED"; FAILED=$((FAILED+1)); }
                  else
                    echo "  ⚠ /nextcloud-data is empty — skipping"
                  fi

                  # ── Vaultwarden file attachments ─────────────────────────
                  echo "Backing up vaultwarden-data (/vaultwarden-data)..."
                  if [ "$(ls -A /vaultwarden-data 2>/dev/null)" ]; then
                    tar czf - -C /vaultwarden-data . \
                      | openssl enc -aes-256-cbc -salt -pbkdf2 \
                          -out "${BACKUP_DIR}/vaultwarden-data.tar.gz.enc" \
                          -pass env:BACKUP_PASSPHRASE \
                      && echo "  ✓ vaultwarden-data OK ($(ls -lh "${BACKUP_DIR}/vaultwarden-data.tar.gz.enc" | awk '{print $5}'))" \
                      || { echo "  ✗ vaultwarden-data FAILED"; FAILED=$((FAILED+1)); }
                  else
                    echo "  ⚠ /vaultwarden-data is empty — skipping"
                  fi

                  # ── DocuSeal documents ──────────────────────────────────
                  echo "Backing up docuseal-data (/docuseal-data)..."
                  if [ "$(ls -A /docuseal-data 2>/dev/null)" ]; then
                    tar czf - -C /docuseal-data . \
                      | openssl enc -aes-256-cbc -salt -pbkdf2 \
                          -out "${BACKUP_DIR}/docuseal-data.tar.gz.enc" \
                          -pass env:BACKUP_PASSPHRASE \
                      && echo "  ✓ docuseal-data OK ($(ls -lh "${BACKUP_DIR}/docuseal-data.tar.gz.enc" | awk '{print $5}'))" \
                      || { echo "  ✗ docuseal-data FAILED"; FAILED=$((FAILED+1)); }
                  else
                    echo "  ⚠ /docuseal-data is empty — skipping"
                  fi

                  # ── Retention: remove PVC backups older than 30 days ─────
                  find /backups -maxdepth 1 -type d -name 'pvc-*' -mtime +30 -exec rm -rf {} +

                  # ── Signal filen-upload sidecar ──────────────────────────
                  FILEN_PATH="${FILEN_DEFAULT_UPLOAD_PATH}"
                  printf '%s' "${FILEN_PATH}" > /staging/.filen_path
                  printf '%s' "pvc-${STAMP}" > /staging/.done

                  echo "PVC backup complete: ${BACKUP_DIR}"
                  ls -lh "${BACKUP_DIR}/"

                  [ "${FAILED}" -eq 0 ] || { echo "WARN: ${FAILED} PVC backup(s) failed — see above"; exit 1; }
              volumeMounts:
                - name: backup-storage
                  mountPath: /backups
                - name: nextcloud-data
                  mountPath: /nextcloud-data
                  readOnly: true
                - name: vaultwarden-data
                  mountPath: /vaultwarden-data
                  readOnly: true
                - name: docuseal-data
                  mountPath: /docuseal-data
                  readOnly: true
                - name: staging
                  mountPath: /staging
              resources:
                requests:
                  memory: 256Mi
                  cpu: "200m"
                limits:
                  memory: 1Gi
                  cpu: "1"

            - name: filen-upload
              image: node:22-alpine
              imagePullPolicy: IfNotPresent
              securityContext:
                allowPrivilegeEscalation: false
                capabilities:
                  drop: ["ALL"]
              command: ["/bin/sh", "-c"]
              args:
                - |
                  if [ -z "${FILEN_EMAIL}" ] || [ -z "${FILEN_PASSWORD}" ]; then
                    echo "Filen not configured — skipping remote PVC backup upload"
                    until [ -f /staging/.done ]; do sleep 2; done
                    exit 0
                  fi

                  echo "Waiting for PVC backup to complete..."
                  until [ -f /staging/.done ]; do sleep 2; done

                  STAMP=$(cat /staging/.done)
                  UPLOAD_PATH=$(cat /staging/.filen_path)

                  echo "Installing Filen CLI..."
                  export HOME=/tmp
                  npm install -g @filen/cli --prefix /tmp/npm-global --silent 2>&1 | tail -3
                  export PATH="/tmp/npm-global/bin:$$PATH"

                  echo "Uploading ${STAMP} to Filen: ${UPLOAD_PATH}/${STAMP}/"
                  filen --email "${FILEN_EMAIL}" --password "${FILEN_PASSWORD}" \
                    upload "/backups/${STAMP}/" "${UPLOAD_PATH}/${STAMP}/" \
                    || echo "WARNING: Filen upload failed — local PVC backup intact"

                  echo "Filen PVC upload done"
              env:
                - name: FILEN_EMAIL
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: FILEN_EMAIL
                      optional: true
                - name: FILEN_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: FILEN_PASSWORD
                      optional: true
              volumeMounts:
                - name: backup-storage
                  mountPath: /backups
                  readOnly: true
                - name: staging
                  mountPath: /staging
                  readOnly: true
              resources:
                requests:
                  memory: 256Mi
                  cpu: "100m"
                limits:
                  memory: 512Mi
                  cpu: "500m"

          volumes:
            - name: backup-storage
              persistentVolumeClaim:
                claimName: backup-pvc
            - name: nextcloud-data
              persistentVolumeClaim:
                claimName: nextcloud-data-pvc
            - name: vaultwarden-data
              persistentVolumeClaim:
                claimName: vaultwarden-data-pvc
            - name: docuseal-data
              persistentVolumeClaim:
                claimName: docuseal-data-pvc
            - name: staging
              emptyDir: {}
```

- [ ] **Step 1.2: Add pvc-backup-cronjob.yaml to `k3d/kustomization.yaml`**

Find the line `- backup-cronjob.yaml` and add the new file right after it:

```yaml
  - backup-cronjob.yaml
  - pvc-backup-cronjob.yaml
  - backup-config.yaml
```

- [ ] **Step 1.3: Validate kustomize output**

```bash
task workspace:validate
```

Expected: exits 0 with no errors.

- [ ] **Step 1.4: Run manifests unit test — should now pass**

```bash
cd /tmp/wt-pvc-backup
./tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats 2>&1 | grep -E "pvc-backup|not ok"
```

Expected: `ok 22 pvc-backup CronJob references critical data PVCs` — no `not ok` lines for that test.

- [ ] **Step 1.5: Commit**

```bash
cd /tmp/wt-pvc-backup
git add k3d/pvc-backup-cronjob.yaml k3d/kustomization.yaml
git commit -m "feat(backup): add pvc-backup CronJob for nextcloud/vaultwarden/docuseal data [T000310]"
```

---

## Task 2: Add pvc-list, pvc-trigger, pvc-restore to backup-restore.sh

**Files:**
- Modify: `scripts/backup-restore.sh`

- [ ] **Step 2.1: Update the `usage()` function** to document the new PVC subcommands

Replace the existing `usage()` body (everything between the `cat <<EOF` and `EOF`) with:

```bash
usage() {
  cat <<EOF
Usage: $SCRIPT <command> [options]

Commands (database):
  list                       List available DB backup timestamps
  trigger                    Trigger an immediate DB backup now
  restore <db> <timestamp>   Restore database(s) from a backup
    db:        keycloak | nextcloud | vaultwarden | website | docuseal | all
    timestamp: directory from 'list' (e.g. 20260427-020001)

Commands (PVC file data):
  pvc-list                         List available PVC backup timestamps
  pvc-trigger                      Trigger an immediate PVC backup now
  pvc-restore <service> <timestamp> Restore PVC data from a backup
    service:   nextcloud-files | vaultwarden-data | docuseal-data | all
    timestamp: directory from 'pvc-list' (e.g. pvc-20260427-030001)
    IMPORTANT: scale down the target service before restoring, e.g.:
      kubectl scale deploy/nextcloud -n workspace --replicas=0 --context <ctx>

Options:
  --context <ctx>   kubectl context (default: active context)
  --namespace <ns>  Kubernetes namespace (default: workspace)
  -y, --yes         Skip confirmation prompt for restore
  -h, --help        Show this help

Examples:
  $SCRIPT list
  $SCRIPT pvc-list --context mentolder
  $SCRIPT pvc-trigger
  $SCRIPT pvc-restore nextcloud-files pvc-20260427-030001 --context mentolder -y
  $SCRIPT restore all 20260427-020001 --context mentolder -y
EOF
}
```

- [ ] **Step 2.2: Add a `_pvc_service_mount` helper** after the existing `_db_pass_key` helper

```bash
_pvc_service_mount() {
  case "$1" in
    nextcloud-files)   echo "nextcloud-files.tar.gz.enc" ;;
    vaultwarden-data)  echo "vaultwarden-data.tar.gz.enc" ;;
    docuseal-data)     echo "docuseal-data.tar.gz.enc" ;;
    *) _die "unknown PVC service '$1' (valid: nextcloud-files vaultwarden-data docuseal-data all)" ;;
  esac
}
```

- [ ] **Step 2.3: Add the three new case branches** to the `case "${CMD:-}" in` block, between the `restore)` branch and the `*)` fallthrough

Add this block just before the `*)` line:

```bash
  pvc-list)
    echo "PVC backups on backup-pvc (newest first):"
    POD="pvc-backup-list-$$"
    OVERRIDES='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"affinity":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"NotIn","values":["k3s-1","k3s-2","k3s-3","k3w-1","k3w-2","k3w-3"]}]}]}}},"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","find /backups -maxdepth 1 -mindepth 1 -type d -name '"'"'pvc-[0-9]*'"'"' | xargs -I{} basename {} | sort -r"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"b","mountPath":"/backups","readOnly":true}]}]}}'
    if ! $KC run "$POD" -n "$NS" --restart=Never --image=busybox \
        --overrides="$OVERRIDES" --quiet 2>&1; then
      echo "(failed to schedule pvc-backup-list pod)"
      exit 1
    fi
    for _ in $(seq 1 90); do
      PHASE=$($KC get pod -n "$NS" "$POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
      [[ "$PHASE" == "Succeeded" || "$PHASE" == "Failed" ]] && break
      sleep 1
    done
    $KC logs -n "$NS" "$POD" 2>/dev/null || echo "(no PVC backups found)"
    $KC delete pod -n "$NS" "$POD" --ignore-not-found >/dev/null 2>&1 || true
    ;;

  pvc-trigger)
    STAMP=$(date +%Y%m%d-%H%M%S)
    JOB="pvc-backup-manual-${STAMP}"
    echo "Creating PVC backup job: ${JOB}"
    $KC create job -n "$NS" "$JOB" --from=cronjob/pvc-backup
    echo "Following logs (Ctrl-C detaches — job keeps running):"
    sleep 4
    $KC logs -n "$NS" -l "job-name=${JOB}" -f --tail=200 2>/dev/null || true
    SUCCEEDED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || echo 0)
    FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo 0)
    if [[ "${SUCCEEDED}" == "1" ]]; then
      echo "✓ PVC backup complete"
    else
      echo "Job status: succeeded=${SUCCEEDED} failed=${FAILED}"
      echo "  kubectl logs -n $NS -l job-name=${JOB}"
    fi
    ;;

  pvc-restore)
    SVC="${1:-}"; TS="${2:-}"
    [[ -n "$SVC" ]] || _die "Usage: $SCRIPT pvc-restore <service> <timestamp>"
    [[ -n "$TS" ]]  || _die "Usage: $SCRIPT pvc-restore <service> <timestamp>"

    if [[ "$SVC" == "all" ]]; then
      SVCS=(nextcloud-files vaultwarden-data docuseal-data)
    else
      _pvc_service_mount "$SVC" >/dev/null
      SVCS=("$SVC")
    fi

    CTX_DISPLAY="${CTX_FLAG:-$(kubectl config current-context 2>/dev/null || echo "current")}"
    echo ""
    echo "==================================================="
    echo " WORKSPACE PVC RESTORE"
    echo "==================================================="
    printf " Services   : %s\n"  "${SVCS[*]}"
    printf " Timestamp  : %s\n"  "$TS"
    printf " Namespace  : %s\n"  "$NS"
    printf " Context    : %s\n"  "$CTX_DISPLAY"
    echo ""
    echo " WARNING: The target PVC contents will be ERASED"
    echo " and replaced with the backup. Scale down the"
    echo " affected service BEFORE continuing:"
    for svc in "${SVCS[@]}"; do
      case "$svc" in
        nextcloud-files)  echo "   kubectl scale deploy/nextcloud -n $NS --replicas=0" ;;
        vaultwarden-data) echo "   kubectl scale deploy/vaultwarden -n $NS --replicas=0" ;;
        docuseal-data)    echo "   kubectl scale deploy/docuseal -n $NS --replicas=0" ;;
      esac
    done
    echo "==================================================="
    echo ""
    if [[ "$YES" != true ]]; then
      read -rp "Type 'yes' to continue: " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
    fi

    for svc in "${SVCS[@]}"; do
      ARCHIVE_FILE=$(_pvc_service_mount "$svc")
      case "$svc" in
        nextcloud-files)  PVC_NAME="nextcloud-data-pvc";  MOUNT_PATH="/data" ;;
        vaultwarden-data) PVC_NAME="vaultwarden-data-pvc"; MOUNT_PATH="/data" ;;
        docuseal-data)    PVC_NAME="docuseal-data-pvc";    MOUNT_PATH="/data" ;;
      esac

      echo ""
      echo "--> Restoring ${svc} from ${TS}..."
      JOB="pvc-restore-${svc}-$$"

      $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: pvc-restore
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: restore
          image: alpine:3
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              ENC="/backups/${TS}/${ARCHIVE_FILE}"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found in PVC backup"; exit 1; }
              echo "Decrypting \$ENC..."
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/restore.tar.gz -pass env:BACKUP_PASSPHRASE
              echo "Clearing ${MOUNT_PATH}..."
              find ${MOUNT_PATH} -mindepth 1 -delete
              echo "Extracting into ${MOUNT_PATH}..."
              tar xzf /tmp/restore.tar.gz -C ${MOUNT_PATH}
              rm /tmp/restore.tar.gz
              echo "✓ ${svc} restored from \$ENC"
          env:
            - name: BACKUP_PASSPHRASE
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BACKUP_PASSPHRASE
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
              readOnly: true
            - name: target-data
              mountPath: ${MOUNT_PATH}
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 1Gi
              cpu: "1"
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
        - name: target-data
          persistentVolumeClaim:
            claimName: ${PVC_NAME}
YAML

      echo "    Waiting for PVC restore job to complete (up to 10 min)..."
      if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
        FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo "?")
        echo "    ERROR: ${svc} restore job did not complete (failed=${FAILED})"
        echo "    Check: kubectl get pods -n $NS -l job-name=${JOB}"
        exit 1
      fi
      echo "    ✓ ${svc} restored"
    done

    echo ""
    echo "✓ PVC restore complete. Scale services back up:"
    for svc in "${SVCS[@]}"; do
      case "$svc" in
        nextcloud-files)  echo "  kubectl scale deploy/nextcloud -n $NS --replicas=1" ;;
        vaultwarden-data) echo "  kubectl scale deploy/vaultwarden -n $NS --replicas=1" ;;
        docuseal-data)    echo "  kubectl scale deploy/docuseal -n $NS --replicas=1" ;;
      esac
    done
    ;;
```

- [ ] **Step 2.4: Verify the script parses correctly**

```bash
bash -n scripts/backup-restore.sh
echo "exit: $?"
```

Expected: `exit: 0` (no syntax errors).

- [ ] **Step 2.5: Verify pvc-restore appears in help output**

```bash
bash scripts/backup-restore.sh --help | grep pvc-restore
```

Expected: line containing `pvc-restore <service> <timestamp>` is printed.

- [ ] **Step 2.6: Commit**

```bash
cd /tmp/wt-pvc-backup
git add scripts/backup-restore.sh
git commit -m "feat(backup): add pvc-list/pvc-trigger/pvc-restore to backup-restore.sh [T000310]"
```

---

## Task 3: Add Taskfile tasks

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 3.1: Add `workspace:backup:pvcs` and `workspace:pvc:restore` tasks**

Find the block containing `workspace:backup:list:` in `Taskfile.yml` and insert two new tasks immediately after it (before `workspace:db:start:`):

```yaml
  workspace:backup:pvcs:
    desc: "Trigger an immediate PVC backup (nextcloud-files, vaultwarden-data, docuseal-data) [ENV=dev|mentolder|korczewski]"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_arg=""
        [ "{{.ENV}}" != "dev" ] && ctx_arg="--context $ENV_CONTEXT"
        bash scripts/backup-restore.sh pvc-trigger $ctx_arg {{.CLI_ARGS}}

  workspace:backup:pvcs:list:
    desc: "List available PVC backup timestamps [ENV=dev|mentolder|korczewski]"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_arg=""
        [ "{{.ENV}}" != "dev" ] && ctx_arg="--context $ENV_CONTEXT"
        bash scripts/backup-restore.sh pvc-list $ctx_arg

  workspace:pvc:restore:
    desc: "List available PVC backups then restore a service (usage: task workspace:pvc:restore -- <service> <timestamp> [ENV=...])"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_arg=""
        [ "{{.ENV}}" != "dev" ] && ctx_arg="--context $ENV_CONTEXT"
        echo "Available PVC backups:"
        bash scripts/backup-restore.sh pvc-list $ctx_arg
        echo ""
        bash scripts/backup-restore.sh pvc-restore {{.CLI_ARGS}} $ctx_arg
```

- [ ] **Step 3.2: Validate Taskfile dry-run**

```bash
task test:dry-run
```

Expected: exits 0 (Taskfile parses without errors).

- [ ] **Step 3.3: Commit**

```bash
cd /tmp/wt-pvc-backup
git add Taskfile.yml
git commit -m "feat(backup): add workspace:backup:pvcs and workspace:pvc:restore tasks [T000310]"
```

---

## Task 4: Verify tests and update test inventory

- [ ] **Step 4.1: Run full offline test suite**

```bash
cd /tmp/wt-pvc-backup
task test:all
```

Expected: all tests pass including the previously-failing manifests test 22.

- [ ] **Step 4.2: Update test inventory if needed**

```bash
cd /tmp/wt-pvc-backup
task test:inventory
git diff website/src/data/test-inventory.json
```

If there are diffs (SA-07 T8/T9/T10 are new sub-tests), commit the updated inventory:

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(tests): update test-inventory for SA-07 T8-T10 pvc-backup [T000310]"
```

- [ ] **Step 4.3: Run workspace:validate (manifest sanity)**

```bash
cd /tmp/wt-pvc-backup
task workspace:validate
```

Expected: exits 0.

---

## Task 5: PR and ticket close

- [ ] **Step 5.1: Update ticket to in_progress**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets SET status='in_progress' WHERE external_id='T000310';"
```

- [ ] **Step 5.2: Open PR**

Invoke `commit-commands:commit-push-pr`:
- Title: `fix(backup): add PVC backup CronJob for nextcloud/vaultwarden/docuseal data [T000310]`
- Body:
  ```
  ## Summary
  - Adds `pvc-backup` CronJob (03:00 UTC daily) that tar+AES-256-CBC encrypts nextcloud-data-pvc, vaultwarden-data-pvc, and docuseal-data-pvc to `backup-pvc` and uploads to Filen
  - Adds `pvc-list`, `pvc-trigger`, `pvc-restore` to `backup-restore.sh`
  - Adds `workspace:backup:pvcs`, `workspace:backup:pvcs:list`, `workspace:pvc:restore` Taskfile tasks
  - Failing manifests.bats test 22 and SA-07 T8-T10 now pass

  ## Test plan
  - [ ] `task test:all` green
  - [ ] `task workspace:validate` green
  - [ ] Manual: `task workspace:backup:pvcs ENV=mentolder` triggers job and job completes
  - [ ] Manual: `task workspace:backup:pvcs:list ENV=mentolder` shows the new `pvc-YYYYMMDD-HHMMSS` directory
  ```

- [ ] **Step 5.3: Merge and close ticket**

After CI passes:
```bash
gh pr merge --squash --delete-branch
```

Then close the ticket:
```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets SET status='done', resolution='fixed', done_at=now()
   WHERE external_id='T000310';
   INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
   SELECT id, 'claude-code', 'Fixed in PR #<number>. Added pvc-backup CronJob + restore tooling.', 'internal'
   FROM tickets.tickets WHERE external_id='T000310';"
```

- [ ] **Step 5.4: Deploy to mentolder**

```bash
task feature:deploy ENV=mentolder
task workspace:verify:all-prods
```

Then trigger a first manual PVC backup to verify the new CronJob works on prod:
```bash
task workspace:backup:pvcs ENV=mentolder
task workspace:backup:pvcs:list ENV=mentolder
```

Expected: a new `pvc-YYYYMMDD-HHMMSS` directory is listed with the three `.tar.gz.enc` files.
