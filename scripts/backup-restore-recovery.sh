#!/usr/bin/env bash
# scripts/backup-restore-recovery.sh — cmd_recovery_* subcommands
# Called by backup-restore.sh dispatcher. Do not call directly.
# Commands: stage, verify, browse, unbrowse, restore-file, restore-table, unstage
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

CMD="${1:-}"; shift || true

cmd_recovery_stage() {
  local TS="${1:-}"; local TARGET="${2:-}"
  [[ -n "$TS" && -n "$TARGET" ]] || _die "Usage: backup-restore.sh stage <timestamp> <db|service>"
  local KIND; KIND=$(_target_kind "$TARGET")

  if [[ "$KIND" == "db" ]]; then
    echo "--> Staging DB '${TARGET}' from ${TS} into ${TARGET}_recovery (live DB untouched)..."
    local JOB="recovery-stage-db-${TARGET}-$$"
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
    local ARCHIVE_FILE; ARCHIVE_FILE=$(_pvc_service_mount "$TARGET")
    echo "--> Staging service '${TARGET}' from ${TS} into recovery-pvc:/recovery/${TS}/${TARGET}/ ..."
    local JOB="recovery-stage-svc-${TARGET}-$$"
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
              echo "✓ staged \$DEST — browse it via: backup-restore.sh browse"
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
}


cmd_recovery_restore_file() {
  local TS="${1:-}"; local SVC="${2:-}"; local SUBPATH="${3:-}"
  [[ -n "$TS" && -n "$SVC" && -n "$SUBPATH" ]] || _die "Usage: backup-restore.sh restore-file <timestamp> <service> <path>"
  _pvc_service_mount "$SVC" >/dev/null   # validate service name
  local PVC_NAME MOUNT_PATH
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
  local JOB="recovery-restore-file-${SVC}-$$"
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
              [ -e "\$SRC" ] || { echo "ERROR: \$SRC not staged — run: backup-restore.sh stage ${TS} ${SVC}"; exit 1; }
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
}

cmd_recovery_restore_table() {
  local TS="${1:-}"; local DB="${2:-}"; local TABLE="${3:-}"
  [[ -n "$TS" && -n "$DB" && -n "$TABLE" ]] || _die "Usage: backup-restore.sh restore-table <timestamp> <db> <table>"
  [[ "$(_target_kind "$DB")" == "db" ]] || _die "restore-table expects a database name"
  echo ""
  echo " SELECTIVE TABLE RESTORE"
  printf "  Dump  : %s/%s.dump.enc\n" "$TS" "$DB"
  printf "  Into  : LIVE %s.%s (ns=%s) — table is DROPPED + recreated from the dump\n" "$DB" "$TABLE" "$NS"
  if [[ "$YES" != true ]]; then
    read -rp "Type 'yes' to continue: " CONFIRM
    [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
  fi
  local JOB="recovery-restore-table-${DB}-$$"
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
}


case "$CMD" in
  stage)         cmd_recovery_stage         "$@" ;;
  verify)        cmd_recovery_verify        "$@" ;;
  browse)        cmd_recovery_browse        "$@" ;;
  unbrowse)      cmd_recovery_unbrowse      "$@" ;;
  restore-file)  cmd_recovery_restore_file  "$@" ;;
  restore-table) cmd_recovery_restore_table "$@" ;;
  unstage)       cmd_recovery_unstage       "$@" ;;
  *) _die "unknown recovery command '$CMD'" ;;
esac
