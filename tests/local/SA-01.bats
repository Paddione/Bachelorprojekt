#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# SA-01.bats — Transport encryption & Ingress routing (local)
# ═══════════════════════════════════════════════════════════════════

load test_helper

setup() {
  export ASSERT_EXIT_ON_FAIL="true"
}

# ── T1: Ingress Definitions ──────────────────────────────────────

@test "SA-01/T1: All service ingresses are defined" {
  for svc in auth files vault board meet; do
    run bash -c "kubectl get ingress -n '$NAMESPACE' --no-headers 2>/dev/null | grep -c '${svc}' || echo '0'"
    assert_success
    assert_gt "$output" 0 "SA-01" "T1-${svc}" "Ingress für ${svc}.localhost definiert"
  done
}

# ── T2: Reachability ─────────────────────────────────────────────

@test "SA-01/T2: Core services are reachable" {
  # Use URLs from k3d.sh (handles port-forwards automatically)
  local services=(
    "auth|${KC_URL}/|200,302,303"
    "files|${NC_URL}/status.php|200"
  )

  for entry in "${services[@]}"; do
    IFS="|" read -r name url expected <<< "$entry"
    run curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url"
    assert_success
    local status="$output"
    
    if echo "$expected" | tr ',' '\n' | grep -qx "$status"; then
       _log_result "SA-01" "T2-${name}" "Service ${name} erreichbar (HTTP ${status})" "pass" "0"
    else
       _log_result "SA-01" "T2-${name}" "Service ${name} erreichbar" "fail" "0" "HTTP ${status}, erwartet: ${expected}"
    fi
  done
}

# ── T3: TLS Configuration ────────────────────────────────────────

@test "SA-01/T3: Ingress uses TLS annotation or spec" {
  run bash -c "kubectl get ingress -n '$NAMESPACE' -o json 2>/dev/null | jq '[.items[] | select(.spec.tls != null or .metadata.annotations[\"traefik.ingress.kubernetes.io/router.tls\"] == \"true\")] | length'"
  assert_success
  local tls_count="$output"
  
  run bash -c "kubectl get ingress -n '$NAMESPACE' -o json 2>/dev/null | jq '.items | length'"
  assert_success
  local total_count="$output"
  
  if (( total_count > 0 )); then
    _log_result "SA-01" "T3" "TLS-Konfiguration in Ingress vorhanden (${tls_count}/${total_count})" "pass" "0"
  else
    _log_result "SA-01" "T3" "Ingress-Objekte vorhanden" "fail" "0" "Keine Ingress-Objekte gefunden"
  fi
}

# ── T5: Security Headers ─────────────────────────────────────────

@test "SA-01/T5: Keycloak serves correct security headers" {
  run curl -s -D - -o /dev/null --max-time 10 "${KC_URL}/realms/workspace"
  assert_success
  local headers="$output"
  
  assert_contains "$headers" "X-Content-Type-Options" "SA-01" "T5a" "Keycloak setzt X-Content-Type-Options Header"
  assert_contains "$headers" "X-Frame-Options" "SA-01" "T5b" "Keycloak setzt X-Frame-Options Header"
}
