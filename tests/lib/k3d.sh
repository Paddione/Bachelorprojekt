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

  _wait_for_url "http://chat.localhost/api/v4/system/ping" "Mattermost" 180
  _wait_for_url "http://auth.localhost/health/ready" "Keycloak" 180
  echo "  Alle Services bereit."
}

# ── Mattermost API helper ────────────────────────────────────────
MM_URL="http://chat.localhost/api/v4"
MM_ADMIN_TOKEN=""

_mm_api() {
  local method="$1" endpoint="$2" data="${3:-}"
  local args=(-s -X "$method" -H "Authorization: Bearer ${MM_ADMIN_TOKEN}" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" "${MM_URL}${endpoint}"
}

_mm_login() {
  local user="$1" pass="$2"
  local response
  response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"login_id\":\"${user}\",\"password\":\"${pass}\"}" \
    -D - "${MM_URL}/users/login" 2>/dev/null)
  echo "$response" | grep -i '^token:' | tr -d '[:space:]' | cut -d: -f2
}

# ── Keycloak test user ──────────────────────────────────────────
KC_URL="http://auth.localhost"
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
    # Create via Mattermost CLI inside k3d pod
    echo "  Admin-Token via CLI erstellen..."
    _kube_run mattermost mmctl user create \
      --username testadmin --email "$admin_email" \
      --password "$admin_pass" --system-admin --local 2>/dev/null || true
    MM_ADMIN_TOKEN=$(_mm_login "testadmin" "$admin_pass")
  fi

  if [[ -z "$MM_ADMIN_TOKEN" ]]; then
    echo "  ⚠ Konnte Admin-Token nicht erstellen — Tests starten ohne Bootstrap"
    return 1
  fi
  echo "  Admin-Token erhalten."

  # Create test users
  for user in testuser1 testuser2; do
    local exists
    exists=$(_mm_api GET "/users/username/${user}" | jq -r '.id // empty')
    if [[ -z "$exists" ]]; then
      _mm_api POST "/users" "{\"username\":\"${user}\",\"email\":\"${user}@homeoffice.local\",\"password\":\"${admin_pass}\"}" > /dev/null
      echo "  User '${user}' erstellt."
    else
      echo "  User '${user}' existiert bereits."
    fi
  done

  # Create guest user
  local guest_exists
  guest_exists=$(_mm_api GET "/users/username/testguest" | jq -r '.id // empty')
  if [[ -z "$guest_exists" ]]; then
    _mm_api POST "/users" "{\"username\":\"testguest\",\"email\":\"testguest@homeoffice.local\",\"password\":\"${admin_pass}\"}" > /dev/null
    local guest_id
    guest_id=$(_mm_api GET "/users/username/testguest" | jq -r '.id')
    _mm_api POST "/users/${guest_id}/demote" > /dev/null
    echo "  Guest 'testguest' erstellt."
  else
    echo "  Guest 'testguest' existiert bereits."
  fi

  # Get/create team
  local team_id
  team_id=$(_mm_api GET "/teams/name/testteam" | jq -r '.id // empty')
  if [[ -z "$team_id" ]]; then
    team_id=$(_mm_api POST "/teams" '{"name":"testteam","display_name":"Test Team","type":"O"}' | jq -r '.id')
    echo "  Team 'testteam' erstellt."
  else
    echo "  Team 'testteam' existiert bereits."
  fi

  # Add users to team
  for user in testuser1 testuser2 testguest; do
    local uid
    uid=$(_mm_api GET "/users/username/${user}" | jq -r '.id')
    _mm_api POST "/teams/${team_id}/members" "{\"team_id\":\"${team_id}\",\"user_id\":\"${uid}\"}" > /dev/null 2>&1 || true
  done

  # Create test channels
  local pub_ch
  pub_ch=$(_mm_api GET "/teams/${team_id}/channels/name/test-public" | jq -r '.id // empty')
  if [[ -z "$pub_ch" ]]; then
    _mm_api POST "/channels" "{\"team_id\":\"${team_id}\",\"name\":\"test-public\",\"display_name\":\"Test Public\",\"type\":\"O\"}" > /dev/null
    echo "  Channel 'test-public' erstellt."
  fi

  local priv_ch
  priv_ch=$(_mm_api GET "/teams/${team_id}/channels/name/test-private" | jq -r '.id // empty')
  if [[ -z "$priv_ch" ]]; then
    _mm_api POST "/channels" "{\"team_id\":\"${team_id}\",\"name\":\"test-private\",\"display_name\":\"Test Private\",\"type\":\"P\"}" > /dev/null
    echo "  Channel 'test-private' erstellt."
  fi

  _bootstrap_keycloak_user || echo "  ⚠ Keycloak-Bootstrap teilweise fehlgeschlagen"

  echo "  ✓ Test-Daten bereit."
  export MM_ADMIN_TOKEN MM_URL
}
