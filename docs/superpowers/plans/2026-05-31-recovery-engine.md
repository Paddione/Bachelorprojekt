---
title: Recovery Engine — Implementation Plan (Plan 1 of 2)
ticket_id: T000386
domains: [infra, test]
status: active
pr_number: null
---

# Recovery Engine — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parallel-safe:** This plan touches `scripts/backup-restore.sh`, `k3d/recovery-pvc.yaml`, `Taskfile.yml`, `tests/unit/backup-restore-recovery.bats` — **disjoint** from Plan 2 (`feature/recovery-browse`). The only cross-reference is `browse` running `kubectl apply -f k3d/recovery-browser.yaml` (a path Plan 2 creates) and the shared contract `recovery-pvc:/recovery/<ts>/<service>/`.

**Goal:** Turn opaque, all-or-nothing recovery into a browsable, selective, self-verifying staging workflow: new `stage`/`verify`/`restore-file`/`restore-table`/`browse`/`unstage` subcommands in `backup-restore.sh`, backed by a `recovery-pvc` and throwaway `<db>_recovery` inspection databases.

**Architecture:** Additive subcommands in `scripts/backup-restore.sh`, each rendering a Kubernetes Job via heredoc — exactly like the existing `restore`/`pvc-restore`/`filen-pull` (PodSecurity 65534/65532, `nodeAffinity` excluding home nodes for backup-pvc, `podAffinity` to `shared-db`, secrets `BACKUP_PASSPHRASE`/`SHARED_DB_PASSWORD` from `workspace-secrets`, all `$KC` calls carry `-n "$NS"`). Per-service/per-db staging keeps `recovery-pvc` small.

**Tech Stack:** Bash (`set -euo pipefail`), kubectl Jobs, `openssl enc -d -aes-256-cbc -pbkdf2`, `pg_restore`/`createdb`/`dropdb` (pgvector/pgvector:0.8.0-pg16), `tar`/`cp` (alpine:3), BATS (`tests/unit/`, kubectl stub).

---

## Invariants (read first)

- **`-n "$NS"` everywhere.** `tests/unit/backup-restore-namespace.bats` greps for literal `-n workspace` and for `$KC … secret … workspace-secrets` without `-n "$NS"`. Every new `$KC` call must pass `-n "$NS"`. The only allowed `workspace` literal is the existing `NS=workspace` default.
- **No live data touched by `stage`/`verify`.** They create `<db>_recovery` DBs and write under `recovery-pvc:/recovery/`. Only `restore-file`/`restore-table` write to live data, and only after a `yes` confirmation (skippable with `-y`).
- **Mirror existing Job hygiene:** `ttlSecondsAfterFinished: 600`, `backoffLimit: 0`, `restartPolicy: Never`, `runAsNonRoot`, `seccompProfile: RuntimeDefault`, `capabilities: drop:[ALL]`, resource requests/limits — copy from the `restore`/`pvc-restore` Jobs.
- **Repo root in the script:** add near the top (after `SCRIPT=`): `REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)`.

## File structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `k3d/recovery-pvc.yaml` | The staging volume (`recovery-pvc`). |
| Modify | `scripts/backup-restore.sh` | New `stage`/`verify`/`restore-file`/`restore-table`/`browse`/`unbrowse`/`unstage` subcommands + helpers + usage. |
| Modify | `Taskfile.yml` | `recovery:*` tasks wrapping the script (env-resolved, namespaced). |
| Create | `tests/unit/backup-restore-recovery.bats` | Unit tests (kubectl stub, rendered-YAML assertions). |

---

## Task 1: `recovery-pvc` manifest

**Files:** Create `k3d/recovery-pvc.yaml`

- [ ] **Step 1: Create the PVC manifest**

Create `k3d/recovery-pvc.yaml` (mirror `k3d/backup-pvc.yaml`'s shape; larger size for decompressed staging):

```yaml
# recovery-pvc — scratch space for browsable backup staging (recovery workflow).
# Holds decrypted+extracted PVC file trees under /recovery/<ts>/<service>/.
# Per-service staging keeps real usage well under the quota. NOT mounted by any
# always-on workload; written by `backup-restore.sh stage`, read-only by the
# on-demand recovery filebrowser (Plan 2).
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: recovery-pvc
  labels:
    app: recovery
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

- [ ] **Step 2: Validate the manifest**

Run: `cd /tmp/wt-recovery-engine && kubectl apply --dry-run=client -f k3d/recovery-pvc.yaml`
Expected: `persistentvolumeclaim/recovery-pvc created (dry run)`.

> Note: do NOT add `recovery-pvc.yaml` to `k3d/kustomization.yaml` — it is applied on demand by the recovery tasks (like office-stack/coturn). It is applied via the Taskfile in Task 7.

- [ ] **Step 3: Commit**

```bash
git add k3d/recovery-pvc.yaml
git commit -m "feat(recovery): recovery-pvc staging volume"
```

---

## Task 2: helpers + `stage` subcommand

**Files:** Modify `scripts/backup-restore.sh`; Test `tests/unit/backup-restore-recovery.bats`

- [ ] **Step 1: Write the failing BATS test**

Create `tests/unit/backup-restore-recovery.bats` (mirror `backup-restore-filen-pull.bats`'s kubectl stub):

```bash
#!/usr/bin/env bats
# backup-restore-recovery.bats — unit tests for the recovery-staging subcommands.
# Stubs kubectl; captures the applied Job/exec YAML; no live cluster required.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/backup-restore.sh"

setup() {
  FAKE_BIN=$(mktemp -d)
  export CAPTURE="${BATS_TEST_TMPDIR}/applied.yaml"
  cat > "${FAKE_BIN}/kubectl" <<EOF
#!/usr/bin/env bash
args="\$*"
case "\$args" in
  *"apply"*) cat > "${CAPTURE}" ; exit 0 ;;
  *"wait"*)  exit 0 ;;
  *"logs"*)  exit 0 ;;
  *"get configmap domain-config"*) echo "recover.localhost" ; exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/kubectl"
  export PATH="${FAKE_BIN}:${PATH}"
}

teardown() { rm -rf "$FAKE_BIN"; }

@test "stage without args fails with usage" {
  run bash "$SCRIPT" stage
  assert_failure
  assert_output --partial "Usage"
}

@test "stage of a DB renders a pg_restore Job into <db>_recovery (live DB untouched)" {
  run bash "$SCRIPT" stage 20260530-020001 website -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "kind: Job"
  assert_output --partial "website.dump.enc"
  assert_output --partial "createdb -h shared-db -U postgres -O website website_recovery"
  assert_output --partial "pg_restore -h shared-db -U postgres -d website_recovery"
  # never drops the live db during staging
  refute_output --partial "dropdb -h shared-db -U postgres --if-exists website "
}

@test "stage of a service extracts into recovery-pvc under /recovery/<ts>/<service>" {
  run bash "$SCRIPT" stage pvc-20260530-030001 nextcloud-files -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "nextcloud-files.tar.gz.enc"
  assert_output --partial "claimName: recovery-pvc"
  assert_output --partial "/recovery/pvc-20260530-030001/nextcloud-files"
  # backup source mounted read-only
  assert_output --partial "claimName: backup-pvc"
}
```

Add `tests/unit/backup-restore-recovery.bats` to the test inventory only if CI requires (the BATS files are globbed by `runner.sh`; no manual registration needed — verify in Task 8).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats`
Expected: FAIL — `stage` is unknown, so the script prints usage and exits 1 for all cases.

- [ ] **Step 3: Add helpers + repo root**

In `scripts/backup-restore.sh`, after `SCRIPT=$(basename "$0")` (line ~7) add:

```bash
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
```

After `_pvc_service_mount()` (line ~94) add a target classifier and a recovery-pvc list of DBs/services:

```bash
_target_kind() {
  case "$1" in
    keycloak|nextcloud|vaultwarden|website|docuseal) echo db ;;
    nextcloud-files|vaultwarden-data|docuseal-data)  echo service ;;
    *) _die "unknown stage target '$1' (db: keycloak nextcloud vaultwarden website docuseal | service: nextcloud-files vaultwarden-data docuseal-data)" ;;
  esac
}
```

- [ ] **Step 4: Implement the `stage` subcommand**

Add a new `case` branch before the final `*)` in the dispatch (after the `filen-pull` branch, line ~567):

```bash
  stage)
    TS="${1:-}"; TARGET="${2:-}"
    [[ -n "$TS" && -n "$TARGET" ]] || _die "Usage: $SCRIPT stage <timestamp> <db|service>"
    KIND=$(_target_kind "$TARGET")

    if [[ "$KIND" == "db" ]]; then
      echo "--> Staging DB '${TARGET}' from ${TS} into ${TARGET}_recovery (live DB untouched)..."
      JOB="recovery-stage-db-${TARGET}-$$"
      $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-stage }
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector: { matchLabels: { app: shared-db } }
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: stage
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              sleep 10
              ENC="/backups/${TS}/${TARGET}.dump.enc"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found"; exit 1; }
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/${TARGET}.dump -pass env:BACKUP_PASSPHRASE
              PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres --if-exists ${TARGET}_recovery
              PGPASSWORD="\$SHARED_DB_PASSWORD" createdb -h shared-db -U postgres -O ${TARGET} ${TARGET}_recovery
              PGPASSWORD="\$SHARED_DB_PASSWORD" pg_restore -h shared-db -U postgres -d ${TARGET}_recovery --no-owner --exit-on-error /tmp/${TARGET}.dump
              rm /tmp/${TARGET}.dump
              echo "✓ staged ${TARGET}_recovery — inspect with: psql -h shared-db -U postgres -d ${TARGET}_recovery"
          env:
            - { name: BACKUP_PASSPHRASE,  valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } } }
            - { name: SHARED_DB_PASSWORD, valueFrom: { secretKeyRef: { name: workspace-secrets, key: SHARED_DB_PASSWORD } } }
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: backup-storage, mountPath: /backups, readOnly: true }
          resources:
            requests: { memory: 256Mi, cpu: "200m" }
            limits:   { memory: 512Mi, cpu: "1" }
      volumes:
        - name: backup-storage
          persistentVolumeClaim: { claimName: backup-pvc }
YAML
    else
      ARCHIVE_FILE=$(_pvc_service_mount "$TARGET")
      echo "--> Staging service '${TARGET}' from ${TS} into recovery-pvc:/recovery/${TS}/${TARGET}/ ..."
      JOB="recovery-stage-svc-${TARGET}-$$"
      $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-stage }
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
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: stage
          image: alpine:3
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              ENC="/backups/${TS}/${ARCHIVE_FILE}"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found"; exit 1; }
              DEST="/recovery/${TS}/${TARGET}"
              mkdir -p "\$DEST"
              find "\$DEST" -mindepth 1 -delete
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/stage.tar.gz -pass env:BACKUP_PASSPHRASE
              tar xzf /tmp/stage.tar.gz -C "\$DEST"
              rm /tmp/stage.tar.gz
              echo "✓ staged \$DEST — browse it via: $SCRIPT browse"
          env:
            - { name: BACKUP_PASSPHRASE, valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } } }
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: backup-storage, mountPath: /backups, readOnly: true }
            - { name: recovery,       mountPath: /recovery }
          resources:
            requests: { memory: 256Mi, cpu: "200m" }
            limits:   { memory: 1Gi,   cpu: "1" }
      volumes:
        - { name: backup-storage, persistentVolumeClaim: { claimName: backup-pvc } }
        - { name: recovery,       persistentVolumeClaim: { claimName: recovery-pvc } }
YAML
    fi
    echo "    Waiting for stage job to complete (up to 10 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
      echo "    ERROR: stage job did not complete"; $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true; exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=10 2>/dev/null || true
    ;;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats`
Expected: PASS for the 3 `stage` tests. (The `-y` flag is parsed by the existing flag loop; `stage` itself doesn't prompt, so `-y` is a harmless no-op kept for symmetry — the stub makes `wait` succeed.)

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-recovery.bats
git commit -m "feat(recovery): stage subcommand (DB → *_recovery, service → recovery-pvc)"
```

---

## Task 3: `verify` subcommand

**Files:** Modify `scripts/backup-restore.sh`; Test `tests/unit/backup-restore-recovery.bats`

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/backup-restore-recovery.bats`:

```bash
@test "verify renders a Job that restores into a temp DB, counts, and drops it" {
  run bash "$SCRIPT" verify 20260530-020001 website
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "website.dump.enc"
  assert_output --partial "createdb -h shared-db -U postgres"
  assert_output --partial "information_schema.tables"
  assert_output --partial "dropdb -h shared-db -U postgres --if-exists"
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f verify`
Expected: FAIL (`verify` unknown).

- [ ] **Step 3: Implement `verify`**

Add after the `stage)` branch:

```bash
  verify)
    TS="${1:-}"; DB="${2:-}"
    [[ -n "$TS" && -n "$DB" ]] || _die "Usage: $SCRIPT verify <timestamp> <db>"
    [[ "$(_target_kind "$DB")" == "db" ]] || _die "verify expects a database name"
    echo "--> Verifying ${DB} dump from ${TS} (restore into temp DB, count, drop)..."
    JOB="recovery-verify-${DB}-$$"
    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-verify }
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector: { matchLabels: { app: shared-db } }
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: verify
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              sleep 10
              ENC="/backups/${TS}/${DB}.dump.enc"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found"; exit 1; }
              TMP=${DB}_verify_$$
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/${DB}.dump -pass env:BACKUP_PASSPHRASE
              PGPASSWORD="\$SHARED_DB_PASSWORD" createdb -h shared-db -U postgres "\$TMP"
              PGPASSWORD="\$SHARED_DB_PASSWORD" pg_restore -h shared-db -U postgres -d "\$TMP" --no-owner --exit-on-error /tmp/${DB}.dump
              echo "── Tabellen-Zähler für ${DB} (${TS}) ──"
              PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d "\$TMP" -c \
                "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS rows FROM information_schema.tables WHERE table_schema='public' ORDER BY rows DESC;"
              PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres --if-exists "\$TMP"
              rm /tmp/${DB}.dump
              echo "✓ ${DB} dump from ${TS} is restorable."
          env:
            - { name: BACKUP_PASSPHRASE,  valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } } }
            - { name: SHARED_DB_PASSWORD, valueFrom: { secretKeyRef: { name: workspace-secrets, key: SHARED_DB_PASSWORD } } }
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: backup-storage, mountPath: /backups, readOnly: true }
          resources:
            requests: { memory: 256Mi, cpu: "200m" }
            limits:   { memory: 512Mi, cpu: "1" }
      volumes:
        - { name: backup-storage, persistentVolumeClaim: { claimName: backup-pvc } }
YAML
    echo "    Waiting for verify job (up to 10 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
      echo "    ✗ ${DB} dump FAILED to restore — backup is NOT trustworthy"; $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true; exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" 2>/dev/null || true
    ;;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-recovery.bats
git commit -m "feat(recovery): verify subcommand (restorability + table counts)"
```

---

## Task 4: `restore-file` (selective file recovery)

**Files:** Modify `scripts/backup-restore.sh`; Test `tests/unit/backup-restore-recovery.bats`

- [ ] **Step 1: Add the failing test**

Append:

```bash
@test "restore-file copies one path from staging into the live PVC (with -y)" {
  run bash "$SCRIPT" restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "claimName: recovery-pvc"
  assert_output --partial "claimName: nextcloud-data-pvc"
  assert_output --partial "/recovery/pvc-20260530-030001/nextcloud-files/admin/files/Doc.pdf"
}

@test "restore-file requires confirmation without -y" {
  run bash -c "echo no | bash '$SCRIPT' restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf"
  assert_failure
  assert_output --partial "Aborted"
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f restore-file`
Expected: FAIL (`restore-file` unknown).

- [ ] **Step 3: Implement `restore-file`**

Add after the `verify)` branch. Reuse the live-PVC name mapping from `pvc-restore`:

```bash
  restore-file)
    SVC="${1:-}"; SUBPATH=""; TS="${1:-}"
    # arg order: <timestamp> <service> <path>
    TS="${1:-}"; SVC="${2:-}"; SUBPATH="${3:-}"
    [[ -n "$TS" && -n "$SVC" && -n "$SUBPATH" ]] || _die "Usage: $SCRIPT restore-file <timestamp> <service> <path>"
    _pvc_service_mount "$SVC" >/dev/null   # validate service name
    case "$SVC" in
      nextcloud-files)  PVC_NAME="nextcloud-data-pvc";  MOUNT_PATH="/data" ;;
      vaultwarden-data) PVC_NAME="vaultwarden-data-pvc"; MOUNT_PATH="/data" ;;
      docuseal-data)    PVC_NAME="docuseal-data-pvc";    MOUNT_PATH="/data" ;;
    esac
    echo ""
    echo " SELECTIVE FILE RESTORE"
    printf "  From staging : recovery-pvc:/recovery/%s/%s/%s\n" "$TS" "$SVC" "$SUBPATH"
    printf "  Into live    : %s:%s/%s  (ns=%s)\n" "$PVC_NAME" "$MOUNT_PATH" "$SUBPATH" "$NS"
    echo "  This overwrites that path in the LIVE volume."
    if [[ "$YES" != true ]]; then
      read -rp "Type 'yes' to continue: " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
    fi
    JOB="recovery-restore-file-${SVC}-$$"
    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-restore-file }
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
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: restore-file
          image: alpine:3
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              SRC="/recovery/${TS}/${SVC}/${SUBPATH}"
              DST="${MOUNT_PATH}/${SUBPATH}"
              [ -e "\$SRC" ] || { echo "ERROR: \$SRC not staged — run: $SCRIPT stage ${TS} ${SVC}"; exit 1; }
              mkdir -p "\$(dirname "\$DST")"
              cp -a "\$SRC" "\$DST"
              echo "✓ restored \$DST from staging"
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: recovery, mountPath: /recovery, readOnly: true }
            - { name: target,   mountPath: ${MOUNT_PATH} }
          resources:
            requests: { memory: 128Mi, cpu: "100m" }
            limits:   { memory: 512Mi, cpu: "1" }
      volumes:
        - { name: recovery, persistentVolumeClaim: { claimName: recovery-pvc } }
        - { name: target,   persistentVolumeClaim: { claimName: ${PVC_NAME} } }
YAML
    echo "    Waiting for restore-file job (up to 5 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=300s 2>/dev/null; then
      echo "    ERROR: restore-file did not complete"; $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true; exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=10 2>/dev/null || true
    ;;
```

> Note: the first two `SVC=`/`TS=` lines are intentionally re-assigned on the next two lines — keep only the canonical `TS="${1:-}"; SVC="${2:-}"; SUBPATH="${3:-}"` line and delete the stray first assignment when implementing (it's shown to flag the arg order explicitly).

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f restore-file`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-recovery.bats
git commit -m "feat(recovery): restore-file (selective file recovery from staging)"
```

---

## Task 5: `restore-table` (selective DB-table recovery)

**Files:** Modify `scripts/backup-restore.sh`; Test `tests/unit/backup-restore-recovery.bats`

- [ ] **Step 1: Add the failing test**

```bash
@test "restore-table renders pg_restore -t <table> into the live DB (with -y)" {
  run bash "$SCRIPT" restore-table 20260530-020001 website site_settings -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "website.dump.enc"
  assert_output --partial "pg_restore -h shared-db -U postgres -d website"
  assert_output --partial "-t site_settings"
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f restore-table`
Expected: FAIL.

- [ ] **Step 3: Implement `restore-table`**

Add after the `restore-file)` branch:

```bash
  restore-table)
    TS="${1:-}"; DB="${2:-}"; TABLE="${3:-}"
    [[ -n "$TS" && -n "$DB" && -n "$TABLE" ]] || _die "Usage: $SCRIPT restore-table <timestamp> <db> <table>"
    [[ "$(_target_kind "$DB")" == "db" ]] || _die "restore-table expects a database name"
    echo ""
    echo " SELECTIVE TABLE RESTORE"
    printf "  Dump  : %s/%s.dump.enc\n" "$TS" "$DB"
    printf "  Into  : LIVE %s.%s (ns=%s) — table is DROPPED + recreated from the dump\n" "$DB" "$TABLE" "$NS"
    if [[ "$YES" != true ]]; then
      read -rp "Type 'yes' to continue: " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
    fi
    JOB="recovery-restore-table-${DB}-$$"
    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-restore-table }
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector: { matchLabels: { app: shared-db } }
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: restore-table
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              sleep 10
              ENC="/backups/${TS}/${DB}.dump.enc"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found"; exit 1; }
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/${DB}.dump -pass env:BACKUP_PASSPHRASE
              PGPASSWORD="\$SHARED_DB_PASSWORD" pg_restore -h shared-db -U postgres -d ${DB} --no-owner --clean --if-exists -t ${TABLE} /tmp/${DB}.dump
              rm /tmp/${DB}.dump
              echo "✓ restored table ${DB}.${TABLE} from ${TS}"
          env:
            - { name: BACKUP_PASSPHRASE,  valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } } }
            - { name: SHARED_DB_PASSWORD, valueFrom: { secretKeyRef: { name: workspace-secrets, key: SHARED_DB_PASSWORD } } }
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: backup-storage, mountPath: /backups, readOnly: true }
          resources:
            requests: { memory: 256Mi, cpu: "200m" }
            limits:   { memory: 512Mi, cpu: "1" }
      volumes:
        - { name: backup-storage, persistentVolumeClaim: { claimName: backup-pvc } }
YAML
    echo "    Waiting for restore-table job (up to 5 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=300s 2>/dev/null; then
      echo "    ERROR: restore-table did not complete"; $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true; exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=10 2>/dev/null || true
    ;;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f restore-table`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-recovery.bats
git commit -m "feat(recovery): restore-table (selective pg_restore -t into live DB)"
```

---

## Task 6: `browse` / `unbrowse` / `unstage` + usage

**Files:** Modify `scripts/backup-restore.sh`; Test `tests/unit/backup-restore-recovery.bats`

- [ ] **Step 1: Add the failing tests**

```bash
@test "browse applies the recovery-browser manifest and prints the URL" {
  run bash "$SCRIPT" browse
  assert_success
  assert_output --partial "recover."
}

@test "unstage drops *_recovery DBs and clears the staging dir for a timestamp" {
  run bash "$SCRIPT" unstage pvc-20260530-030001 -y
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/recovery/pvc-20260530-030001"
}

@test "usage lists the recovery commands" {
  run bash "$SCRIPT" --help
  assert_success
  assert_output --partial "stage"
  assert_output --partial "verify"
  assert_output --partial "restore-file"
  assert_output --partial "restore-table"
  assert_output --partial "browse"
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats -f "browse|unstage|usage"`
Expected: FAIL.

- [ ] **Step 3: Implement `browse`/`unbrowse`/`unstage`**

Add after the `restore-table)` branch:

```bash
  browse)
    MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
    [[ -f "$MANIFEST" ]] || _die "recovery-browser.yaml missing — Plan 2 (feature/recovery-browse) provides it"
    echo "Bringing up the recovery filebrowser (read-only over recovery-pvc:/recovery)..."
    $KC apply -n "$NS" -f "$MANIFEST"
    DOM=$($KC get configmap domain-config -n "$NS" -o jsonpath='{.data.RECOVER_DOMAIN}' 2>/dev/null || echo "recover.localhost")
    echo "✓ Browse at: https://${DOM}  (Keycloak login, group /recovery-access). Tear down with: $SCRIPT unbrowse"
    ;;

  unbrowse)
    MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
    echo "Removing the recovery filebrowser..."
    $KC delete -n "$NS" -f "$MANIFEST" --ignore-not-found 2>/dev/null || true
    echo "✓ recovery filebrowser removed"
    ;;

  unstage)
    TS="${1:-}"
    [[ -n "$TS" ]] || _die "Usage: $SCRIPT unstage <timestamp>"
    if [[ "$YES" != true ]]; then
      read -rp "Drop all *_recovery DBs and clear recovery-pvc:/recovery/${TS}? Type 'yes': " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
    fi
    JOB="recovery-unstage-$$"
    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels: { app: recovery-unstage }
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector: { matchLabels: { app: shared-db } }
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: unstage
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              for db in keycloak nextcloud vaultwarden website docuseal; do
                PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres --if-exists \${db}_recovery
              done
              rm -rf "/recovery/${TS}" 2>/dev/null || true
              echo "✓ unstaged ${TS}"
          env:
            - { name: SHARED_DB_PASSWORD, valueFrom: { secretKeyRef: { name: workspace-secrets, key: SHARED_DB_PASSWORD } } }
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: recovery, mountPath: /recovery }
          resources:
            requests: { memory: 128Mi, cpu: "100m" }
            limits:   { memory: 256Mi, cpu: "500m" }
      volumes:
        - { name: recovery, persistentVolumeClaim: { claimName: recovery-pvc } }
YAML
    $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=180s 2>/dev/null || true
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=10 2>/dev/null || true
    ;;
```

- [ ] **Step 4: Extend `usage()`**

In `usage()`, add a recovery block before `Options:` (after the disaster-recovery block, line ~38):

```bash
  cat <<'EOF'

Commands (browsable recovery — stage, browse, selectively restore):
  stage <timestamp> <db|service>      Decrypt one entry into a browsable staging area
                                        db → <db>_recovery inspection DB; service →
                                        recovery-pvc:/recovery/<ts>/<service>/
  verify <timestamp> <db>             Prove a DB dump restores; print table counts; drop temp
  browse                              Bring up the on-demand recovery filebrowser (SSO)
  unbrowse                            Tear the filebrowser down
  restore-file <timestamp> <service> <path>   Copy ONE staged path back into the live PVC
  restore-table <timestamp> <db> <table>      Restore ONE table back into the live DB
  unstage <timestamp>                 Drop *_recovery DBs + clear the staging dir
EOF
```

(Place this `cat` immediately after the existing heredoc's closing `EOF` and before the function's closing brace, or fold the lines into the single existing heredoc — keep it inside `usage()`.)

- [ ] **Step 5: Run to verify pass**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats`
Expected: PASS (entire file).

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-restore.sh tests/unit/backup-restore-recovery.bats
git commit -m "feat(recovery): browse/unbrowse/unstage + usage"
```

---

## Task 7: Taskfile `recovery:*` tasks

**Files:** Modify `Taskfile.yml`

- [ ] **Step 1: Read the neighbouring backup tasks to match style**

Run: `cd /tmp/wt-recovery-engine && sed -n '1082,1200p' Taskfile.yml`
Expected: see `workspace:backup`, `workspace:db:restore`, `workspace:pvc:restore` — note how they `source scripts/env-resolve.sh "$ENV"`, export `WORKSPACE_NAMESPACE`, and call `bash scripts/backup-restore.sh … --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"`.

- [ ] **Step 2: Add the recovery tasks**

Insert after `workspace:pvc:restore` (match the exact env-resolve + `--context`/`--namespace` wrapper of the neighbours). Template:

```yaml
  recovery:prepare:
    desc: "Apply recovery-pvc (run once per cluster before staging). ENV=<env>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        kubectl apply --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" -f k3d/recovery-pvc.yaml

  recovery:stage:
    desc: "Stage one backup entry browsable. ENV=<env> -- <timestamp> <db|service>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh stage {{.CLI_ARGS}} --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:verify:
    desc: "Prove a DB dump restores + show table counts. ENV=<env> -- <timestamp> <db>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh verify {{.CLI_ARGS}} --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:browse:
    desc: "Bring up the on-demand recovery filebrowser (SSO). ENV=<env>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh browse --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:unbrowse:
    desc: "Tear the recovery filebrowser down. ENV=<env>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh unbrowse --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:restore-file:
    desc: "Restore ONE staged file/dir into the live PVC. ENV=<env> -- <timestamp> <service> <path>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh restore-file {{.CLI_ARGS}} --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:restore-table:
    desc: "Restore ONE table into the live DB. ENV=<env> -- <timestamp> <db> <table>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh restore-table {{.CLI_ARGS}} --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"

  recovery:unstage:
    desc: "Drop *_recovery DBs + clear staging. ENV=<env> -- <timestamp>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV | default \"dev\"}}"
        bash scripts/backup-restore.sh unstage {{.CLI_ARGS}} --context "$ENV_CONTEXT" --namespace "${WORKSPACE_NAMESPACE:-workspace}"
```

> Match the exact quoting/escaping used by the surrounding tasks (`{{.ENV | default "dev"}}` may need the unescaped form depending on the file's convention — copy a neighbour verbatim and swap the subcommand).

- [ ] **Step 3: Validate the Taskfile parses**

Run: `cd /tmp/wt-recovery-engine && task --list 2>&1 | grep recovery:`
Expected: the eight `recovery:*` tasks listed, no YAML parse error.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(recovery): Taskfile recovery:* wrappers (env-resolved, namespaced)"
```

---

## Task 8: Verification + docs

**Files:** none new (verification) + a doc note.

- [ ] **Step 1: Full BATS + offline suite**

Run: `cd /tmp/wt-recovery-engine && bats tests/unit/backup-restore-recovery.bats tests/unit/backup-restore-namespace.bats`
Expected: all pass — crucially `backup-restore-namespace.bats` still passes (no hardcoded `-n workspace`; every new `$KC … workspace-secrets` lookup carries `-n "$NS"` — note our new code only references `workspace-secrets` inside YAML heredocs, which the test explicitly allows).

- [ ] **Step 2: Offline CI parity**

Run: `cd /tmp/wt-recovery-engine && task test:all`
Expected: green. If the test-inventory check flags a new test file, run `task test:inventory` and commit the regenerated `website/src/data/test-inventory.json`.

- [ ] **Step 3: shellcheck (advisory)**

Run: `cd /tmp/wt-recovery-engine && shellcheck scripts/backup-restore.sh || true`
Expected: no new errors introduced by the recovery branches (pre-existing advisories may remain).

- [ ] **Step 4: Note for the database-ops skill (cross-plan, do in whichever merges last)**

The `database-ops` skill doc (`.claude/skills/database-ops/SKILL.md`) backup/restore section should gain the stage→browse→selective-restore runbook. Leave a `TODO(recovery-docs)` only if Plan 2 owns the doc; otherwise append the runbook here and commit:

```bash
# append the runbook to the skill, then:
git add .claude/skills/database-ops/SKILL.md
git commit -m "docs(database-ops): browsable recovery runbook"
```

- [ ] **Step 5: PR**

Open the PR for `feature/recovery-engine` (squash-merge, CI green). Mergeable independently of Plan 2; `browse` will print a clear error until Plan 2's `recovery-browser.yaml` is also merged.

---

## Self-review (author)

- **Spec coverage:** browse-files → staging + Plan-2 surface (T2/T6), trustworthy restore → `verify` + clearer Job output (T3), selective recovery → `restore-file`/`restore-table` (T4/T5), browse-DB → `stage` into `<db>_recovery` + `psql` (T2). Lifecycle → `unstage`/`unbrowse` (T6). Per-service staging → `stage <ts> <service>` (T2). recovery-pvc → T1. Tasks → T7.
- **Placeholder scan:** real code throughout; the two deliberately-flagged spots (the stray `SVC=`/`TS=` line in T4, the usage-heredoc placement in T6) carry explicit instructions to resolve them.
- **Invariant consistency:** every `$KC` call carries `-n "$NS"`; `workspace-secrets` only inside heredocs (allowed by the namespace test); Job hygiene copied from existing restore Jobs; `<db>_recovery` naming consistent across stage/unstage.
- **Parallel safety:** files disjoint from Plan 2; `browse` references `k3d/recovery-browser.yaml` by path and fails gracefully if absent.
