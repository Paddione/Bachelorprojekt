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
