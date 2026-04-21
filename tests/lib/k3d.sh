#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# k3d.sh — Kubernetes (k3d) lifecycle + test data bootstrap
# ═══════════════════════════════════════════════════════════════════
# Usage: source this file, then call k3d_wait / bootstrap_test_data.
#
# Required env vars:
#   NAMESPACE — Kubernetes namespace (default: workspace)
# ═══════════════════════════════════════════════════════════════════

NAMESPACE="${NAMESPACE:-workspace}"

# ── Environment-aware URL configuration ─────────────────────────
# For prod tier: set PROD_DOMAIN (e.g. "${PROD_DOMAIN}")
# URLs are then https://auth-PROD_DOMAIN, https://files-PROD_DOMAIN, etc.
# For local tier: defaults to http://auth.localhost, http://files.localhost
if [[ -n "${PROD_DOMAIN:-}" ]]; then
  PROTO="${PROTO:-https}"
  KC_URL="${KC_URL:-${PROTO}://auth.${PROD_DOMAIN}}"
  NC_URL="${NC_URL:-${PROTO}://files.${PROD_DOMAIN}}"
  COLLAB_URL="${COLLAB_URL:-${PROTO}://office.${PROD_DOMAIN}}"
  MEET_URL="${MEET_URL:-${PROTO}://files.${PROD_DOMAIN}/index.php/apps/spreed/}"
else
  PROTO="${PROTO:-http}"
  KC_URL="${KC_URL:-${PROTO}://auth.localhost}"
  NC_URL="${NC_URL:-${PROTO}://files.localhost}"
  COLLAB_URL="${COLLAB_URL:-${PROTO}://office.localhost}"
  MEET_URL="${MEET_URL:-${PROTO}://files.localhost/index.php/apps/spreed/}"
fi

export PROTO KC_URL NC_URL COLLAB_URL MEET_URL

# ── kubectl helper for running commands in pods ──────────────────
_kube_run() {
  local deploy="$1"; shift
  kubectl exec -n "$NAMESPACE" "deploy/${deploy}" -- "$@" 2>/dev/null
}

# ── Wait for a URL to return HTTP 200 ───────────────────────────
_wait_for_url() {
  local url="$1" label="$2" max_wait="${3:-120}"
  local elapsed=0
  echo -n "  Warte auf ${label}..."
  while (( elapsed < max_wait )); do
    if curl -s -o /dev/null -w '' --max-time 5 "$url" 2>/dev/null; then
      echo " bereit (${elapsed}s)"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    echo -n "."
  done
  echo " TIMEOUT nach ${max_wait}s"
  return 1
}

# ── Port-forward for local Nextcloud API access ─────────────────
_NC_PF_PID=""

_start_nc_portforward() {
  if [[ -n "${PROD_DOMAIN:-}" ]]; then return; fi
  local pf_port=18080

  if [[ -n "$_NC_PF_PID" ]]; then
    kill "$_NC_PF_PID" 2>/dev/null || true
    wait "$_NC_PF_PID" 2>/dev/null || true
    _NC_PF_PID=""
  fi
  local stale_pid
  stale_pid=$(lsof -t -i:"${pf_port}" 2>/dev/null || true)
  [[ -n "$stale_pid" ]] && kill "$stale_pid" 2>/dev/null || true
  sleep 1

  kubectl port-forward -n "$NAMESPACE" svc/nextcloud "${pf_port}:80" &>/dev/null &
  _NC_PF_PID=$!
  local elapsed=0
  while (( elapsed < 15 )); do
    if curl -s -o /dev/null --max-time 1 "http://localhost:${pf_port}/status.php" 2>/dev/null; then
      break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "  Port-forward Nextcloud → localhost:${pf_port}"
  NC_URL="http://localhost:${pf_port}"
  export NC_URL
}

_stop_nc_portforward() {
  if [[ -n "$_NC_PF_PID" ]]; then
    kill "$_NC_PF_PID" 2>/dev/null || true
    wait "$_NC_PF_PID" 2>/dev/null || true
    _NC_PF_PID=""
  fi
}

# ── Wait for k3d services ───────────────────────────────────────
k3d_wait() {
  echo "▶ Warte auf k3d Services..."

  echo "  Prüfe ob k3d-Cluster erreichbar ist..."
  if ! kubectl cluster-info &>/dev/null; then
    echo "  FEHLER: Kein k3d-Cluster erreichbar. Starte mit: task cluster:create && task workspace:deploy"
    return 1
  fi

  # Check that pods are running
  local not_ready
  not_ready=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
    | grep -cv "Running" || true)
  if (( not_ready > 0 )); then
    echo "  ⚠ ${not_ready} Pods sind noch nicht Running — warte..."
    kubectl wait --for=condition=Available deployment --all -n "$NAMESPACE" --timeout=300s 2>&1 || true
  fi

  _wait_for_url "${KC_URL}/health/ready" "Keycloak" 180
  echo "  Alle Services bereit."

  # Start port-forward for local tier (bypasses ingress issues)
  _start_nc_portforward
}

# ── Keycloak admin token ────────────────────────────────────────
KC_ADMIN_TOKEN=""

_kc_admin_login() {
  local attempt max_attempts=3
  KC_ADMIN_TOKEN=""
  for attempt in $(seq 1 $max_attempts); do
    KC_ADMIN_TOKEN=$(curl -s --max-time 10 -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
      -d "client_id=admin-cli" \
      -d "username=admin" \
      -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
      -d "grant_type=password" | jq -r '.access_token // empty')
    if [[ -n "$KC_ADMIN_TOKEN" ]]; then
      return 0
    fi
    if (( attempt < max_attempts )); then
      echo "  KC Admin-Login Versuch ${attempt}/${max_attempts} fehlgeschlagen — warte 5s..."
      sleep 5
    fi
  done
  return 1
}

_bootstrap_keycloak_user() {
  echo "  Keycloak Test-User einrichten..."
  _kc_admin_login
  if [[ -z "$KC_ADMIN_TOKEN" ]]; then
    echo "  ⚠ Keycloak Admin-Token nicht verfügbar — KC-Bootstrap übersprungen"
    return 1
  fi

  local test_pass="${TEST_ADMIN_PASS:-Testpassword123!}"

  local exists
  exists=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_URL}/admin/realms/workspace/users?username=testuser1" | jq -r '.[0].id // empty')

  if [[ -z "$exists" ]]; then
    curl -s -o /dev/null -X POST -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      "${KC_URL}/admin/realms/workspace/users" \
      -d "{\"username\":\"testuser1\",\"email\":\"testuser1@workspace.local\",\"firstName\":\"Test\",\"lastName\":\"User\",\"enabled\":true,\"credentials\":[{\"type\":\"password\",\"value\":\"${test_pass}\",\"temporary\":false}]}"
    echo "  Keycloak User 'testuser1' erstellt."
  else
    echo "  Keycloak User 'testuser1' existiert bereits."
  fi

  export KC_ADMIN_TOKEN KC_URL
}

# ── Bootstrap test data ─────────────────────────────────────────
bootstrap_test_data() {
  echo "▶ Test-Daten einrichten..."
  _bootstrap_keycloak_user || echo "  ⚠ Keycloak-Bootstrap teilweise fehlgeschlagen"
  echo "  ✓ Test-Daten bereit."
}
