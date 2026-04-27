#!/usr/bin/env bash
# Workspace backup management — list, trigger, and restore database backups.
# All operations target the backup-pvc inside the workspace namespace.
set -euo pipefail

NS=workspace
SCRIPT=$(basename "$0")

usage() {
  cat <<EOF
Usage: $SCRIPT <command> [options]

Commands:
  list                       List available backup timestamps
  trigger                    Trigger an immediate backup now
  restore <db> <timestamp>   Restore database(s) from a backup
    db:        keycloak | nextcloud | vaultwarden | website | docuseal | all
    timestamp: directory from 'list' (e.g. 20260427-020001)

Options:
  --context <ctx>   kubectl context (default: active context)
  --namespace <ns>  Kubernetes namespace (default: workspace)
  -y, --yes         Skip confirmation prompt for restore
  -h, --help        Show this help

Examples:
  $SCRIPT list
  $SCRIPT list --context mentolder
  $SCRIPT trigger
  $SCRIPT trigger --context korczewski
  $SCRIPT restore nextcloud 20260427-020001
  $SCRIPT restore all 20260427-020001 --context mentolder -y
EOF
}

# ── Flag parsing ──────────────────────────────────────────────────────────────
CTX_FLAG=""
YES=false
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)   CTX_FLAG="--context $2"; shift 2 ;;
    --namespace) NS="$2"; shift 2 ;;
    -y|--yes)    YES=true; shift ;;
    -h|--help)   usage; exit 0 ;;
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

# ── Commands ──────────────────────────────────────────────────────────────────
case "${CMD:-}" in

  list)
    echo "Backups on backup-pvc (newest first):"
    POD="backup-list-$$"
    # Only show YYYYMMDD-HHMMSS directories (not debug/log files)
    OVERRIDES='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","find /backups -maxdepth 1 -mindepth 1 -type d -name '"'"'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'"'"' | xargs -I{} basename {} | sort -r"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}'
    $KC run "$POD" -n "$NS" --restart=Never --image=busybox \
      --overrides="$OVERRIDES" --quiet 2>/dev/null || true
    for _ in $(seq 1 30); do
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

  *)
    usage
    exit 1
    ;;
esac
