#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# k3d.sh — Kubernetes (k3d) lifecycle + test data bootstrap
# ═══════════════════════════════════════════════════════════════════
# Usage: source this file, then call k3d_wait / bootstrap_test_data.
#
# Required env vars:
#   NAMESPACE — Kubernetes namespace (default: homeoffice)
# ═══════════════════════════════════════════════════════════════════

NAMESPACE="${NAMESPACE:-homeoffice}"

# ── Environment-aware URL configuration ─────────────────────────
# For prod tier: set PROD_DOMAIN (e.g. "wbhprojekt.ipv64.de")
# URLs are then https://auth-PROD_DOMAIN, https://chat-PROD_DOMAIN, etc.
# For local tier: defaults to http://auth.localhost, http://chat.localhost
if [[ -n "${PROD_DOMAIN:-}" ]]; then
  PROTO="${PROTO:-https}"
  KC_URL="${KC_URL:-${PROTO}://auth-${PROD_DOMAIN}}"
  MM_URL="${MM_URL:-${PROTO}://chat-${PROD_DOMAIN}/api/v4}"
  NC_URL="${NC_URL:-${PROTO}://files-${PROD_DOMAIN}}"
  COLLAB_URL="${COLLAB_URL:-${PROTO}://office-${PROD_DOMAIN}}"
  MEET_URL="${MEET_URL:-${PROTO}://meet-${PROD_DOMAIN}}"
else
  PROTO="${PROTO:-http}"
  KC_URL="${KC_URL:-${PROTO}://auth.localhost}"
  MM_URL="${MM_URL:-${PROTO}://chat.localhost/api/v4}"
  NC_URL="${NC_URL:-${PROTO}://files.localhost}"
  COLLAB_URL="${COLLAB_URL:-${PROTO}://office.localhost}"
  MEET_URL="${MEET_URL:-${PROTO}://meet.localhost}"
fi

export PROTO KC_URL MM_URL NC_URL COLLAB_URL MEET_URL

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

# ── Port-forward for local API access ──────────────────────────
# When SiteURL points to production, tokens don't work through the
# local ingress.  A port-forward bypasses the ingress and talks to
# the Mattermost service directly.
_MM_PF_PID=""
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

_start_mm_portforward() {
  if [[ -n "${PROD_DOMAIN:-}" ]]; then return; fi  # prod uses real URLs
  local pf_port=18065

  # Kill any stale port-forward on the same port
  if [[ -n "$_MM_PF_PID" ]]; then
    kill "$_MM_PF_PID" 2>/dev/null || true
    wait "$_MM_PF_PID" 2>/dev/null || true
    _MM_PF_PID=""
  fi
  # Also kill orphaned port-forwards from previous runs
  local stale_pid
  stale_pid=$(lsof -t -i:"${pf_port}" 2>/dev/null || true)
  [[ -n "$stale_pid" ]] && kill "$stale_pid" 2>/dev/null || true
  sleep 1

  kubectl port-forward -n "$NAMESPACE" svc/mattermost "${pf_port}:8065" &>/dev/null &
  _MM_PF_PID=$!
  # Wait for the port-forward to become ready
  local elapsed=0
  while (( elapsed < 20 )); do
    if curl -s -o /dev/null --max-time 1 "http://localhost:${pf_port}/api/v4/system/ping" 2>/dev/null; then
      break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "  Port-forward Mattermost → localhost:${pf_port}"

  # Override MM_URL so all tests use the direct connection
  MM_URL="http://localhost:${pf_port}/api/v4"
  export MM_URL
}

_stop_mm_portforward() {
  if [[ -n "$_MM_PF_PID" ]]; then
    kill "$_MM_PF_PID" 2>/dev/null || true
    wait "$_MM_PF_PID" 2>/dev/null || true
    _MM_PF_PID=""
  fi
}

# ── Wait for k3d services ───────────────────────────────────────
k3d_wait() {
  echo "▶ Warte auf k3d Services..."

  echo "  Prüfe ob k3d-Cluster erreichbar ist..."
  if ! kubectl cluster-info &>/dev/null; then
    echo "  FEHLER: Kein k3d-Cluster erreichbar. Starte mit: task cluster:create && task homeoffice:deploy"
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

  _wait_for_url "${MM_URL}/system/ping" "Mattermost" 180
  _wait_for_url "${KC_URL}/health/ready" "Keycloak" 180
  echo "  Alle Services bereit."

  # Start port-forwards for local tier (bypasses ingress issues)
  _start_mm_portforward
  _start_nc_portforward
}

# ── Mattermost API helper ────────────────────────────────────────
MM_ADMIN_TOKEN=""

_mm_api() {
  local method="$1" endpoint="$2" data="${3:-}"
  local args=(-s -X "$method" -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" "${MM_URL}${endpoint}"
}

_mm_login() {
  local user="$1" pass="$2"
  local token
  # Try password login first
  token=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"login_id\":\"${user}\",\"password\":\"${pass}\"}" \
    -D - "${MM_URL}/users/login" 2>/dev/null | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2)
  if [[ -n "$token" ]]; then
    echo "$token"
    return
  fi
  # SSO-only fallback: generate personal access token via mmctl
  local token_output
  token_output=$(_kube_run mattermost mmctl token generate "$user" "test-${user}" --local 2>/dev/null)
  echo "$token_output" | awk -F: '{print $1}' | tr -d '[:space:]'
}

# ── Keycloak test user ──────────────────────────────────────────
KC_ADMIN_TOKEN=""

_kc_admin_login() {
  KC_ADMIN_TOKEN=$(curl -s -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD:-devadmin}" \
    -d "grant_type=password" | jq -r '.access_token // empty')
}

_bootstrap_keycloak_user() {
  echo "  Keycloak Test-User einrichten..."
  _kc_admin_login
  if [[ -z "$KC_ADMIN_TOKEN" ]]; then
    echo "  ⚠ Keycloak Admin-Token nicht verfügbar — KC-Bootstrap übersprungen"
    return 1
  fi

  local test_pass="${MM_TEST_ADMIN_PASS:-Testpassword123!}"

  local exists
  exists=$(curl -s -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
    "${KC_URL}/admin/realms/homeoffice/users?username=testuser1" | jq -r '.[0].id // empty')

  if [[ -z "$exists" ]]; then
    curl -s -o /dev/null -X POST -H "Authorization: Bearer ${KC_ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      "${KC_URL}/admin/realms/homeoffice/users" \
      -d "{\"username\":\"testuser1\",\"email\":\"testuser1@homeoffice.local\",\"firstName\":\"Test\",\"lastName\":\"User\",\"enabled\":true,\"credentials\":[{\"type\":\"password\",\"value\":\"${test_pass}\",\"temporary\":false}]}"
    echo "  Keycloak User 'testuser1' erstellt."
  else
    echo "  Keycloak User 'testuser1' existiert bereits."
  fi

  export KC_ADMIN_TOKEN KC_URL
}

# ── Bootstrap test data ─────────────────────────────────────────
bootstrap_test_data() {
  echo "▶ Test-Daten einrichten..."

  local admin_pass="${MM_TEST_ADMIN_PASS:-Testpassword123!}"
  local admin_email="testadmin@homeoffice.local"

  # Try to login as existing admin
  MM_ADMIN_TOKEN=$(_mm_login "testadmin" "$admin_pass")

  if [[ -z "$MM_ADMIN_TOKEN" ]]; then
    # Create admin user via CLI if it doesn't exist
    echo "  Admin-User via CLI erstellen..."
    _kube_run mattermost mmctl user create \
      --username testadmin --email "$admin_email" \
      --password "$admin_pass" --system-admin --local 2>/dev/null || true

    # Try password login first (works when local auth is enabled)
    MM_ADMIN_TOKEN=$(_mm_login "testadmin" "$admin_pass")
  fi

  if [[ -z "$MM_ADMIN_TOKEN" ]]; then
    # SSO-only mode: password login disabled. Generate a personal access token
    # via mmctl --local (bypasses auth, talks to Mattermost socket directly).
    echo "  SSO-Modus erkannt — Token via mmctl generieren..."
    # Revoke any old test-runner tokens to avoid clutter
    local old_tokens
    old_tokens=$(_kube_run mattermost mmctl token list testadmin --local 2>/dev/null \
      | grep "test-runner" | awk '{print $1}') || true
    for tid in $old_tokens; do
      _kube_run mattermost mmctl token revoke "$tid" --local 2>/dev/null || true
    done
    # Generate fresh token
    local token_output
    token_output=$(_kube_run mattermost mmctl token generate testadmin test-runner --local 2>/dev/null)
    # mmctl outputs: "<token_value>: test-runner"
    MM_ADMIN_TOKEN=$(echo "$token_output" | awk -F: '{print $1}' | tr -d '[:space:]')
  fi

  if [[ -z "$MM_ADMIN_TOKEN" ]]; then
    echo "  ⚠ Konnte Admin-Token nicht erstellen — Tests starten ohne Bootstrap"
    return 1
  fi
  echo "  Admin-Token erhalten."

  # Helper: extract a real Mattermost entity ID (26-char alphanumeric), ignoring error IDs
  _mm_id() { jq -r 'if (.username // .name // .display_name) then .id else empty end'; }

  # Create test users (via mmctl for SSO-only mode)
  for user in testuser1 testuser2; do
    local exists
    exists=$(_mm_api GET "/users/username/${user}" | _mm_id)
    if [[ -z "$exists" ]]; then
      _kube_run mattermost mmctl user create \
        --username "$user" --email "${user}@homeoffice.local" \
        --password "$admin_pass" --local 2>/dev/null || true
      echo "  User '${user}' erstellt."
    else
      echo "  User '${user}' existiert bereits."
    fi
  done

  # Create guest user
  local guest_exists
  guest_exists=$(_mm_api GET "/users/username/testguest" | _mm_id)
  if [[ -z "$guest_exists" ]]; then
    _kube_run mattermost mmctl user create \
      --username testguest --email "testguest@homeoffice.local" \
      --password "$admin_pass" --local 2>/dev/null || true
    local guest_id
    guest_id=$(_mm_api GET "/users/username/testguest" | _mm_id)
    if [[ -n "$guest_id" ]]; then
      _mm_api POST "/users/${guest_id}/demote" > /dev/null
    fi
    echo "  Guest 'testguest' erstellt."
  else
    echo "  Guest 'testguest' existiert bereits."
  fi

  # Get/create team
  local team_id
  team_id=$(_mm_api GET "/teams/name/testteam" | _mm_id)
  if [[ -z "$team_id" ]]; then
    team_id=$(_mm_api POST "/teams" '{"name":"testteam","display_name":"Test Team","type":"O"}' | _mm_id)
    echo "  Team 'testteam' erstellt."
  else
    echo "  Team 'testteam' existiert bereits."
  fi

  # Add admin + test users to team
  local admin_uid
  admin_uid=$(_mm_api GET "/users/me" | _mm_id)
  for user_id in "$admin_uid" $(_mm_api GET "/users/username/testuser1" | _mm_id) \
                               $(_mm_api GET "/users/username/testuser2" | _mm_id) \
                               $(_mm_api GET "/users/username/testguest" | _mm_id); do
    [[ -n "$user_id" ]] && \
      _mm_api POST "/teams/${team_id}/members" "{\"team_id\":\"${team_id}\",\"user_id\":\"${user_id}\"}" > /dev/null 2>&1 || true
  done

  # Create test channels
  local pub_ch
  pub_ch=$(_mm_api GET "/teams/${team_id}/channels/name/test-public" | _mm_id)
  if [[ -z "$pub_ch" ]]; then
    _mm_api POST "/channels" "{\"team_id\":\"${team_id}\",\"name\":\"test-public\",\"display_name\":\"Test Public\",\"type\":\"O\"}" > /dev/null
    echo "  Channel 'test-public' erstellt."
  fi

  local priv_ch
  priv_ch=$(_mm_api GET "/teams/${team_id}/channels/name/test-private" | _mm_id)
  if [[ -z "$priv_ch" ]]; then
    _mm_api POST "/channels" "{\"team_id\":\"${team_id}\",\"name\":\"test-private\",\"display_name\":\"Test Private\",\"type\":\"P\"}" > /dev/null
    echo "  Channel 'test-private' erstellt."
  fi

  _bootstrap_keycloak_user || echo "  ⚠ Keycloak-Bootstrap teilweise fehlgeschlagen"

  echo "  ✓ Test-Daten bereit."
  export MM_ADMIN_TOKEN MM_URL
}
