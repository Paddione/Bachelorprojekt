#!/usr/bin/env bash
# Workspace backup management — list, trigger, and restore database backups.
# All operations target the backup-pvc inside the workspace namespace.
set -euo pipefail

NS=workspace
SCRIPT=$(basename "$0")
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

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

Options:
  --context <ctx>   kubectl context (default: active context)
  --namespace <ns>  Kubernetes namespace (default: workspace)
  -y, --yes         Skip confirmation prompt for restore
  -h, --help        Show this help

Examples:
  $SCRIPT list
  $SCRIPT pvc-list --context fleet --namespace workspace
  $SCRIPT pvc-trigger
  $SCRIPT pvc-restore nextcloud-files pvc-20260427-030001 --context fleet --namespace workspace -y
  $SCRIPT restore all 20260427-020001 --context fleet --namespace workspace-korczewski -y
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

# Render k3d/recovery-browser.yaml ($MANIFEST) with its envsubst placeholders
# resolved from the live domain-config ConfigMap (the deploy-time SSOT). The
# manifest header documents these as substituted-at-browse-time; a raw apply
# would push the literal ${...} (broken Ingress host + oauth2 redirect-url).
# Reads globals: MANIFEST, KC, NS. Restricted envsubst list leaves the k8s
# $(RECOVERY_OIDC_SECRET) env-expansion untouched.
_render_recovery_browser() {
  local cm; cm=$($KC get configmap domain-config -n "$NS" -o json 2>/dev/null || echo '{}')
  export RECOVER_DOMAIN TLS_SECRET_NAME KC_DOMAIN WORKSPACE_NAMESPACE
  RECOVER_DOMAIN=$(printf '%s' "$cm"  | jq -r '.data.RECOVER_DOMAIN // "recover.localhost"')
  TLS_SECRET_NAME=$(printf '%s' "$cm" | jq -r '.data.TLS_SECRET_NAME // "workspace-wildcard-tls"')
  KC_DOMAIN=$(printf '%s' "$cm"       | jq -r '.data.KC_DOMAIN // "auth.localhost"')
  WORKSPACE_NAMESPACE="$NS"
  envsubst '$RECOVER_DOMAIN $TLS_SECRET_NAME $KC_DOMAIN $WORKSPACE_NAMESPACE' < "$MANIFEST"
}

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

_target_kind() {
  case "$1" in
    keycloak|nextcloud|vaultwarden|website|docuseal) echo db ;;
    nextcloud-files|vaultwarden-data|docuseal-data)  echo service ;;
    *) _die "unknown stage target '$1' (db: keycloak nextcloud vaultwarden website docuseal | service: nextcloud-files vaultwarden-data docuseal-data)" ;;
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
    echo "✓ Restore complete. Re-sync role passwords so new pods don't crashloop on auth drift:"
    echo "  task workspace:sync-db-passwords ENV=<env>   # postStart self-heal does NOT fire on a restore"
    echo "  then restart affected services: task workspace:restart -- ${DBS[*]}"
    echo "  (db:restore now chains sync-db-passwords automatically; this is the manual equivalent.)"
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

  restore-file)
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

  browse)
    MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
    [[ -f "$MANIFEST" ]] || _die "recovery-browser.yaml missing — Plan 2 (feature/recovery-browse) provides it"
    echo "Bringing up the recovery filebrowser (read-only over recovery-pvc:/recovery)..."
    _render_recovery_browser | $KC apply -n "$NS" -f -
    DOM=$($KC get configmap domain-config -n "$NS" -o jsonpath='{.data.RECOVER_DOMAIN}' 2>/dev/null || echo "recover.localhost")
    echo "✓ Browse at: https://${DOM}  (Keycloak login, group /recovery-access). Tear down with: $SCRIPT unbrowse"
    ;;

  unbrowse)
    MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
    echo "Removing the recovery filebrowser..."
    _render_recovery_browser | $KC delete -n "$NS" -f - --ignore-not-found 2>/dev/null || true
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

  *)
    usage
    exit 1
    ;;
esac
