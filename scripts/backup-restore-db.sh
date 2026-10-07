#!/usr/bin/env bash
# scripts/backup-restore-db.sh — cmd_db_* subcommands
# Called by backup-restore.sh dispatcher. Do not call directly.
# Commands: list, trigger, restore
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup-restore-lib.sh
source "$SCRIPT_DIR/backup-restore-lib.sh"

CMD="${1:-}"; shift || true

cmd_db_list() {
  echo "Backups on backup-pvc (newest first):"
  local POD="backup-list-$$"
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
  local OVERRIDES='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"affinity":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"NotIn","values":["k3s-1","k3s-2","k3s-3","k3w-1","k3w-2","k3w-3"]}]}]}}},"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","find /backups -maxdepth 1 -mindepth 1 -type d -name '"'"'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'"'"' | xargs -I{} basename {} | sort -r"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"b","mountPath":"/backups","readOnly":true}]}]}}'
  if ! $KC run "$POD" -n "$NS" --restart=Never --image=busybox \
      --overrides="$OVERRIDES" --quiet 2>&1; then
    echo "(failed to schedule backup-list pod — see warning above)"
    exit 1
  fi
  # Volume attach can take ~10s on a cold node; allow up to 90s before giving up.
  for _ in $(seq 1 90); do
    local PHASE; PHASE=$($KC get pod -n "$NS" "$POD" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    [[ "$PHASE" == "Succeeded" || "$PHASE" == "Failed" ]] && break
    sleep 1
  done
  $KC logs -n "$NS" "$POD" 2>/dev/null || echo "(no backups found)"
  $KC delete pod -n "$NS" "$POD" --ignore-not-found >/dev/null 2>&1 || true
}

cmd_db_trigger() {
  local STAMP; STAMP=$(date +%Y%m%d-%H%M%S)
  local JOB="db-backup-manual-${STAMP}"
  echo "Creating backup job: ${JOB}"
  $KC create job -n "$NS" "$JOB" --from=cronjob/db-backup
  echo "Following logs (Ctrl-C detaches — job keeps running):"
  sleep 4
  $KC logs -n "$NS" -l "job-name=${JOB}" -f --tail=200 2>/dev/null || true
  local SUCCEEDED; SUCCEEDED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || echo 0)
  local FAILED; FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo 0)
  if [[ "${SUCCEEDED}" == "1" ]]; then
    echo "✓ Backup complete"
  else
    echo "Job status: succeeded=${SUCCEEDED} failed=${FAILED}"
    echo "  kubectl logs -n $NS -l job-name=${JOB}"
  fi
}

# Print the demo_restore_probe row count for a business slug (and optional
# marker) from the website database. Dies when the probe job fails or
# produces no count — callers compare the printed number fail-closed.
_db_probe_count() {
  local slug="$1"; local marker="${2:-}"
  local where="business_slug='${slug}'"
  if [[ -n "$marker" ]]; then
    where="${where} AND marker='${marker}'"
  fi
  local JOB="db-probe-count-$$"
  $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: db-probe-count
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
        - name: probe
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              COUNT=\$(PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d website -tAc "SELECT count(*) FROM demo_restore_probe WHERE ${where}")
              echo "PROBE_COUNT=\${COUNT}"
          env:
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
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 512Mi
              cpu: "1"
YAML
  if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=180s 2>/dev/null; then
    _die "probe job ${JOB} did not complete"
  fi
  local count
  count=$($KC logs -n "$NS" -l "job-name=${JOB}" --tail=20 2>/dev/null | grep -E '^PROBE_COUNT=' | tail -1 | cut -d= -f2 || true)
  [[ -n "$count" ]] || _die "probe job ${JOB} produced no count (slug=${slug})"
  echo "$count"
}

cmd_db_demo_business() {
  : "${YES:=false}"
  : "${NS:=workspace}"
  : "${KC:=kubectl}"
  local slug="${1:-demo-business}"
  [[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || _die "invalid slug '$slug' (expected ^[a-z0-9][a-z0-9-]*$)"
  local STAMP; STAMP=$(date +%Y%m%d-%H%M%S)
  local marker="p3demo-${STAMP}"

  echo ""
  echo "==================================================="
  echo " BUSINESS RESTORE DEMO"
  echo "==================================================="
  printf " Slug       : %s\n" "$slug"
  printf " Marker     : %s\n" "$marker"
  printf " Namespace  : %s\n" "$NS"
  echo ""

  echo "--> [1/4] Seeding probe row..."
  local SEED_JOB="db-demo-seed-$$"
  $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${SEED_JOB}
  namespace: ${NS}
  labels:
    app: db-demo-seed
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
        - name: seed
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d website -v ON_ERROR_STOP=1 -c \
                "CREATE TABLE IF NOT EXISTS demo_restore_probe(business_slug TEXT, marker TEXT, created_at TIMESTAMPTZ DEFAULT now())"
              PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d website -v ON_ERROR_STOP=1 -c \
                "INSERT INTO demo_restore_probe(business_slug, marker) VALUES ('${slug}', '${marker}')"
              echo "seeded ${slug}/${marker}"
          env:
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
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 512Mi
              cpu: "1"
YAML
  if ! $KC wait -n "$NS" job/"$SEED_JOB" --for=condition=Complete --timeout=180s 2>/dev/null; then
    _die "demo-business: seed job ${SEED_JOB} did not complete"
  fi
  echo "    ✓ probe row seeded"

  echo "--> [2/4] Triggering backup..."
  cmd_db_trigger

  echo "--> [3/4] Resolving newest backup and restoring website..."
  local TS; TS=$(cmd_db_list | grep -E '^[0-9]{8}-[0-9]{6}$' | head -1)
  [[ -n "$TS" ]] || _die "demo-business: no backup timestamp found"
  echo "    using backup ${TS}"
  local prev_yes="$YES"
  YES=true
  cmd_db_restore website "$TS"
  YES="$prev_yes"

  echo "--> [4/4] Verifying marker..."
  local count; count=$(_db_probe_count "$slug" "$marker")
  [[ "$count" == "1" ]] || _die "demo-business: expected exactly 1 marker row for ${slug}/${marker}, got ${count}"
  echo "DEMO-OK slug=${slug} marker=${marker} ts=${TS}"
}

cmd_db_restore() {
  local DB="${1:-}"; local TS="${2:-}"; local SCOPE="${3:-}"
  [[ -n "$DB" ]]  || _die "Usage: backup-restore.sh restore <db> <timestamp> [business=<slug>]"
  [[ -n "$TS" ]]  || _die "Usage: backup-restore.sh restore <db> <timestamp> [business=<slug>]"

  local SCOPE_SLUG=""
  if [[ -n "$SCOPE" ]]; then
    [[ "$SCOPE" =~ ^business=([a-z0-9][a-z0-9-]*)$ ]] || _die "invalid scope '$SCOPE' (expected business=<slug>)"
    SCOPE_SLUG="${BASH_REMATCH[1]}"
  fi
  if [[ -n "$SCOPE_SLUG" && "$DB" != "website" ]]; then
    _die "business scope requires database 'website' (got '$DB')"
  fi

  local DBS=()
  if [[ "$DB" == "all" ]]; then
    DBS=(nextcloud vaultwarden website docuseal)
  else
    _db_pass_key "$DB" >/dev/null  # validate name early
    DBS=("$DB")
  fi

  local CTX_DISPLAY="${CTX_FLAG:-$(kubectl config current-context 2>/dev/null || echo "current")}"
  echo ""
  echo "==================================================="
  echo " WORKSPACE DATABASE RESTORE"
  echo "==================================================="
  printf " Databases  : %s\n"  "${DBS[*]}"
  printf " Timestamp  : %s\n"  "$TS"
  printf " Scope      : %s\n"  "${SCOPE:-none}"
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
    local JOB="db-restore-${db}-$$"

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
      local FAILED; FAILED=$($KC get job -n "$NS" "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || echo "?")
      echo "    ERROR: ${db} restore job did not complete (failed=${FAILED})"
      echo "    Check: kubectl get pods -n $NS -l job-name=${JOB}"
      exit 1
    fi
    echo "    ✓ ${db} restored"
  done

  if [[ -n "$SCOPE_SLUG" ]]; then
    echo ""
    echo "--> Verifying business scope ${SCOPE_SLUG}..."
    local scope_count; scope_count=$(_db_probe_count "$SCOPE_SLUG")
    [[ "$scope_count" != "0" ]] || _die "business scope ${SCOPE_SLUG}: no probe rows after restore"
    echo "    ✓ business scope ${SCOPE_SLUG}: ${scope_count} probe row(s)"
  fi

  echo ""
  echo "✓ Restore complete. Re-sync role passwords so new pods don't crashloop on auth drift:"
  echo "  task workspace:sync-db-passwords ENV=<env>   # postStart self-heal does NOT fire on a restore"
  echo "  then restart affected services: task workspace:restart -- ${DBS[*]}"
  echo "  (db:restore now chains sync-db-passwords automatically; this is the manual equivalent.)"
}

case "$CMD" in
  list)    cmd_db_list    "$@" ;;
  trigger) cmd_db_trigger "$@" ;;
  restore) cmd_db_restore "$@" ;;
  demo-business) cmd_db_demo_business "$@" ;;
  *) _die "unknown db command '$CMD'" ;;
esac
