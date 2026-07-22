#!/usr/bin/env bash
# scripts/backup-restore-lib.sh — sourced helpers for backup-restore*.sh
# Sourced by backup-restore.sh (Dispatcher) and all subcommand scripts.
# Globals consumed: NS, CTX_FLAG, REMOTE_PATH, MANIFEST, REPO_ROOT, KC, SCRIPT, YES
set -euo pipefail

_die() { echo "ERROR: $*" >&2; exit 1; }

# Render k3d/recovery-browser.yaml ($MANIFEST) with envsubst placeholders
# resolved from the live domain-config ConfigMap. Reads globals: MANIFEST, KC, NS.
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
    *) _die "unknown stage target '$1'" ;;
  esac
}

cmd_recovery_verify() {
  local TS="${1:-}"; local DB="${2:-}"
  [[ -n "$TS" && -n "$DB" ]] || _die "Usage: backup-restore.sh verify <timestamp> <db>"
  [[ "$(_target_kind "$DB")" == "db" ]] || _die "verify expects a database name"
  echo "--> Verifying ${DB} dump from ${TS} (restore into temp DB, count, drop)..."
  local JOB="recovery-verify-${DB}-$$"
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
              # Cleanup auch bei pg_restore-Abbruch — sonst bleibt die Wegwerf-DB als
              # Leiche auf shared-db zurück (Vorfall 2026-07-22: website_verify_781884)
              cleanup() { PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres --if-exists "\$TMP"; rm -f /tmp/${DB}.dump; }
              trap cleanup EXIT
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
  # Erfolg persistent stempeln — Mess-Anker für Health-Goal G-DB11 (der Job selbst
  # verschwindet nach ttlSecondsAfterFinished=600 und hinterlässt sonst keine Spur)
  $KC create configmap recovery-verify-status -n "$NS" \
    --from-literal=last_success="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --from-literal=db="$DB" --from-literal=backup_ts="$TS" \
    --dry-run=client -o yaml | $KC apply -n "$NS" -f - >/dev/null \
    || echo "    (Warnung: recovery-verify-status ConfigMap konnte nicht aktualisiert werden — G-DB11-Messung bleibt stale)"
}

cmd_recovery_browse() {
  local MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
  [[ -f "$MANIFEST" ]] || _die "recovery-browser.yaml missing — Plan 2 (feature/recovery-browse) provides it"
  echo "Bringing up the recovery filebrowser (read-only over recovery-pvc:/recovery)..."
  _render_recovery_browser | $KC apply -n "$NS" -f -
  local DOM; DOM=$($KC get configmap domain-config -n "$NS" -o jsonpath='{.data.RECOVER_DOMAIN}' 2>/dev/null || echo "recover.localhost")
  echo "✓ Browse at: https://${DOM}  (Keycloak login, group /recovery-access). Tear down with: backup-restore.sh unbrowse"
}

cmd_recovery_unbrowse() {
  local MANIFEST="${REPO_ROOT}/k3d/recovery-browser.yaml"
  echo "Removing the recovery filebrowser..."
  _render_recovery_browser | $KC delete -n "$NS" -f - --ignore-not-found 2>/dev/null || true
  echo "✓ recovery filebrowser removed"
}

cmd_recovery_unstage() {
  local TS="${1:-}"
  [[ -n "$TS" ]] || _die "Usage: backup-restore.sh unstage <timestamp>"
  if [[ "$YES" != true ]]; then
    read -rp "Drop all *_recovery DBs and clear recovery-pvc:/recovery/${TS}? Type 'yes': " CONFIRM
    [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
  fi
  local JOB="recovery-unstage-$$"
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
}

