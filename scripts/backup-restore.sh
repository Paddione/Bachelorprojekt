#!/usr/bin/env bash
# Workspace backup management — list, trigger, and restore database backups.
# All operations target the backup-pvc inside the workspace namespace.
set -euo pipefail

NS=workspace
SCRIPT=$(basename "$0")

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
      kubectl scale deploy/nextcloud -n <ns> --replicas=0 --context <ctx>

Commands (disaster recovery — fresh cluster):
  filen-pull <timestamp> [--remote-path <path>]
                             Download a backup timestamp from Filen cloud into
                             the in-cluster backup-pvc, so the existing
                             'restore' / 'pvc-restore' commands can run on a
                             freshly-deployed cluster (where backup-pvc is empty).
                             Remote path defaults to backup-config's
                             FILEN_DEFAULT_UPLOAD_PATH. Timestamps are discovered
                             out-of-band (Filen web/desktop app or 'filen ls').

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

# ── Flag parsing ──────────────────────────────────────────────────────────────
CTX_FLAG=""
YES=false
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)     CTX_FLAG="--context $2"; shift 2 ;;
    --namespace)   NS="$2"; shift 2 ;;
    --remote-path) REMOTE_PATH="$2"; shift 2 ;;
    -y|--yes)      YES=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

CMD="${1:-}"; shift || true
KC="kubectl ${CTX_FLAG}"

# ── Helpers ───────────────────────────────────────────────────────────────────
_die() { echo "ERROR: $*" >&2; exit 1; }

_db_pass_key() {
  case "$1" in
    keycloak)    echo KEYCLOAK_DB_PASSWORD ;;
    nextcloud)   echo NEXTCLOUD_DB_PASSWORD ;;
    vaultwarden) echo VAULTWARDEN_DB_PASSWORD ;;
    website)     echo WEBSITE_DB_PASSWORD ;;
    docuseal)    echo DOCUSEAL_DB_PASSWORD ;;
    *) _die "unknown database '$1' (valid: keycloak nextcloud vaultwarden website docuseal all)" ;;
  esac
}

_pvc_service_mount() {
  case "$1" in
    nextcloud-files)   echo "nextcloud-files.tar.gz.enc" ;;
    vaultwarden-data)  echo "vaultwarden-data.tar.gz.enc" ;;
    docuseal-data)     echo "docuseal-data.tar.gz.enc" ;;
    *) _die "unknown PVC service '$1' (valid: nextcloud-files vaultwarden-data docuseal-data all)" ;;
  esac
}

# ── Commands ──────────────────────────────────────────────────────────────────
case "${CMD:-}" in

  list)
    echo "Backups on backup-pvc (newest first):"
    POD="backup-list-$$"
    # Only show YYYYMMDD-HHMMSS directories (not debug/log files).
    # The override must include:
    #   - securityContext fields — workspace/workspace-korczewski both run
    #     PodSecurity=restricted; without them apiserver rejects the pod
    #     silently and the previous `2>/dev/null` swallowed the warning.
    #   - nodeAffinity that excludes home workers (k3s-1/2/3, k3w-1/2/3) —
    #     backup-pvc is Longhorn ReadWriteOnce and the home nodes don't run
    #     the longhorn CSI driver, so a pod scheduled there hangs in
    #     ContainerCreating with FailedAttachVolume forever. Mirrors the
    #     affinity on the db-backup CronJob.
    OVERRIDES='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"affinity":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"NotIn","values":["k3s-1","k3s-2","k3s-3","k3w-1","k3w-2","k3w-3"]}]}]}}},"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","find /backups -maxdepth 1 -mindepth 1 -type d -name '"'"'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'"'"' | xargs -I{} basename {} | sort -r"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"b","mountPath":"/backups","readOnly":true}]}]}}'
    if ! $KC run "$POD" -n "$NS" --restart=Never --image=busybox \
        --overrides="$OVERRIDES" --quiet 2>&1; then
      echo "(failed to schedule backup-list pod — see warning above)"
      exit 1
    fi
    # Volume attach can take ~10s on a cold node; allow up to 90s before giving up.
    for _ in $(seq 1 90); do
      PHASE=$($KC get pod -n "$NS" "$POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
      [[ "$PHASE" == "Succeeded" || "$PHASE" == "Failed" ]] && break
      sleep 1
    done
    $KC logs -n "$NS" "$POD" 2>/dev/null || echo "(no backups found)"
    $KC delete pod -n "$NS" "$POD" --ignore-not-found >/dev/null 2>&1 || true
    ;;

  trigger)
    STAMP=$(date +%Y%m%d-%H%M%S)
    JOB="db-backup-manual-${STAMP}"
    echo "Creating backup job: ${JOB}"
    $KC create job -n "$NS" "$JOB" --from=cronjob/db-backup
    echo "Following logs (Ctrl-C detaches — job keeps running):"
    sleep 4
    $KC logs -n "$NS" -l "job-name=${JOB}" -f --tail=200 2>/dev/null || true
    SUCCEEDED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || echo 0)
    FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo 0)
    if [[ "${SUCCEEDED}" == "1" ]]; then
      echo "✓ Backup complete"
    else
      echo "Job status: succeeded=${SUCCEEDED} failed=${FAILED}"
      echo "  kubectl logs -n $NS -l job-name=${JOB}"
    fi
    ;;

  restore)
    DB="${1:-}"; TS="${2:-}"
    [[ -n "$DB" ]]  || _die "Usage: $SCRIPT restore <db> <timestamp>"
    [[ -n "$TS" ]]  || _die "Usage: $SCRIPT restore <db> <timestamp>"

    if [[ "$DB" == "all" ]]; then
      DBS=(keycloak nextcloud vaultwarden website docuseal)
    else
      _db_pass_key "$DB" >/dev/null  # validate name early
      DBS=("$DB")
    fi

    CTX_DISPLAY="${CTX_FLAG:-$(kubectl config current-context 2>/dev/null || echo "current")}"
    echo ""
    echo "==================================================="
    echo " WORKSPACE DATABASE RESTORE"
    echo "==================================================="
    printf " Databases  : %s\n"  "${DBS[*]}"
    printf " Timestamp  : %s\n"  "$TS"
    printf " Namespace  : %s\n"  "$NS"
    printf " Context    : %s\n"  "$CTX_DISPLAY"
    echo ""
    echo " WARNING: Each selected database will be DROPPED"
    echo " and RECREATED. Current data will be PERMANENTLY"
    echo " LOST. Stop affected services before continuing."
    echo "==================================================="
    echo ""
    if [[ "$YES" != true ]]; then
      read -rp "Type 'yes' to continue: " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
    fi

    for db in "${DBS[@]}"; do
      echo ""
      echo "--> Restoring ${db} from ${TS}..."
      _db_pass_key "$db" >/dev/null
      JOB="db-restore-${db}-$$"

      $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: db-restore
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: shared-db
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: restore
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              sleep 15
              ENC="/backups/${TS}/${db}.dump.enc"
              [ -f "\$ENC" ] || { echo "ERROR: \$ENC not found in backup"; exit 1; }
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/${db}.dump -pass env:BACKUP_PASSPHRASE
              echo "Decrypted \$(ls -lh /tmp/${db}.dump | awk '{print \$5}')"
              PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}' AND pid<>pg_backend_pid();" -t 2>&1 | tail -3
              PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres --if-exists ${db}
              PGPASSWORD="\$SHARED_DB_PASSWORD" createdb -h shared-db -U postgres -O ${db} ${db}
              PGPASSWORD="\$SHARED_DB_PASSWORD" pg_restore -h shared-db -U postgres -d ${db} --no-owner --exit-on-error /tmp/${db}.dump
              rm /tmp/${db}.dump
              echo "✓ ${db} restored from \$ENC"
          env:
            - name: BACKUP_PASSPHRASE
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BACKUP_PASSPHRASE
            - name: SHARED_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: SHARED_DB_PASSWORD
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
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 512Mi
              cpu: "1"
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
YAML

      echo "    Waiting for restore job to complete (up to 5 min)..."
      # Wait up to 300s for completion
      if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=300s 2>/dev/null; then
        FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo "?")
        echo "    ERROR: ${db} restore job did not complete (failed=${FAILED})"
        echo "    Check: kubectl get pods -n $NS -l job-name=${JOB}"
        exit 1
      fi
      echo "    ✓ ${db} restored"
    done

    echo ""
    echo "✓ Restore complete. Restart affected services:"
    for db in "${DBS[@]}"; do
      echo "  task workspace:restart -- ${db}"
    done
    ;;

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

  filen-pull)
    TS="${1:-}"
    [[ -n "$TS" ]] || _die "Usage: $SCRIPT filen-pull <timestamp> [--remote-path <path>]"

    # Resolve the Filen remote base path: --remote-path wins, else the
    # backup-config ConfigMap default (mirrors what the upload side uploads to).
    if [[ -z "${REMOTE_PATH:-}" ]]; then
      REMOTE_PATH=$($KC get configmap backup-config -n "$NS" \
        -o jsonpath='{.data.FILEN_DEFAULT_UPLOAD_PATH}' 2>/dev/null || echo "")
    fi
    [[ -n "$REMOTE_PATH" ]] || _die "Could not resolve Filen remote path — pass --remote-path <path> or ensure backup-config has FILEN_DEFAULT_UPLOAD_PATH"

    echo "Pulling ${TS} from Filen (${REMOTE_PATH}/${TS}/) into backup-pvc (ns=${NS})..."
    JOB="filen-pull-$$"

    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: filen-pull
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: filen-pull
          # Mirrors the filen-upload container in k3d/backup-cronjob.yaml,
          # inverted to download. @filen/cli is the only working Filen client
          # (rclone has no Filen backend; webdav.filen.io is desktop-only).
          image: node:22-alpine
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              if [ -z "\$FILEN_EMAIL" ] || [ -z "\$FILEN_PASSWORD" ]; then
                echo "ERROR: FILEN_EMAIL/FILEN_PASSWORD not set in workspace-secrets"; exit 1
              fi
              export HOME=/tmp
              echo "Installing Filen CLI..."
              npm install -g @filen/cli --prefix /tmp/npm-global --silent 2>&1 | tail -3
              export PATH="/tmp/npm-global/bin:\$PATH"
              mkdir -p "/backups/${TS}"
              echo "Downloading ${REMOTE_PATH}/${TS}/ -> /backups/${TS}/ ..."
              filen --email "\$FILEN_EMAIL" --password "\$FILEN_PASSWORD" \\
                download "${REMOTE_PATH}/${TS}/" "/backups/${TS}/"
              echo "Pulled ${TS} into backup-pvc:/backups/${TS}/"
              ls -la "/backups/${TS}/"
          env:
            - name: FILEN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_EMAIL
            - name: FILEN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_PASSWORD
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
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
YAML

    echo "Waiting for filen-pull job to complete (up to 10 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
      echo "ERROR: filen-pull job did not complete"
      $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true
      exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=20 2>/dev/null || true
    echo ""
    echo "✓ filen-pull complete. Confirm and restore:"
    echo "    $SCRIPT list ${CTX_FLAG}        # DB backups now in backup-pvc"
    echo "    $SCRIPT pvc-list ${CTX_FLAG}    # PVC backups now in backup-pvc"
    echo "    $SCRIPT restore <db> ${TS} ${CTX_FLAG}"
    echo "    $SCRIPT pvc-restore <svc> ${TS} ${CTX_FLAG}"
    ;;

  *)
    usage
    exit 1
    ;;
esac
