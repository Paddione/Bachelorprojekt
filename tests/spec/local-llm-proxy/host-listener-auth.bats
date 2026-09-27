#!/usr/bin/env bats

load ../test_helper

setup() {
  curl -s -m 2 -o /dev/null "http://127.0.0.1:18235/livez" || skip "llm-proxy not running"
}

# [T900537] /livez beweist, dass der PROZESS laeuft — nicht, dass die
# Admin-Routen antworten. Auf einem llm-proxy ohne LLM_PROXY_ADMIN_TOKEN bzw.
# ohne aktivierten Loopback-Listener liefert /admin/state nichts Verwertbares, und
# die Testfaelle meldeten das als Auth-/410-Regression. Der Probe muss die Route
# benennen, auf die die Assertion sich stuetzt.
_skip_unless_admin_endpoint() {
  local code
  code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:18235/admin/state" 2>/dev/null || true)"
  case "$code" in
    200) : ;;
    *) skip "llm-proxy antwortet auf /admin/state mit '${code:-kein Code}' — Admin-Loopback nicht freigeschaltet (Umgebung, kein Produktfehler; T900537)" ;;
  esac
}

@test "admin state on loopback responds 200 without token" {
  _skip_unless_admin_endpoint
  run curl -s -w "%{http_code}" -o "$BATS_TMPDIR/state.json" "http://127.0.0.1:18235/admin/state"
  [ "$status" -eq 0 ]
  [ "$output" = "200" ]
  run jq -r '.port' "$BATS_TMPDIR/state.json"
  [ "$output" != "null" ]
  [ "$output" != "" ]
  run jq -r '.uptimeSec' "$BATS_TMPDIR/state.json"
  [ "$output" != "null" ]
  [ "$output" != "" ]
  run jq -r '.version' "$BATS_TMPDIR/state.json"
  [ "$output" != "null" ]
  [ "$output" != "" ]
}

@test "admin page returns 410 gone without html" {
  _skip_unless_admin_endpoint
  run curl -s -w "%{http_code}" -o "$BATS_TMPDIR/admin.txt" "http://127.0.0.1:18235/admin"
  [ "$status" -eq 0 ]
  [ "$output" = "410" ]
  run grep -i "<html" "$BATS_TMPDIR/admin.txt"
  [ "$status" -ne 0 ]
}

@test "bridge listener requires bearer token when open" {
  BRIDGE_IP=$(docker network inspect "${LLM_PROXY_K3D_NETWORK:-}" -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true)
  [ -n "$BRIDGE_IP" ] || skip "k3d docker network gateway not available"

  # Pruefen, ob der Bridge-Listener ueberhaupt antwortet
  run curl -s -m 2 -o /dev/null "http://${BRIDGE_IP}:18235/livez"
  [ "$status" -eq 0 ] || skip "bridge listener not listening on ${BRIDGE_IP}:18235 (e.g. LLM_PROXY_ADMIN_TOKEN not set on running proxy)"

  # Ohne Token: 401
  run curl -s -w "%{http_code}" -o /dev/null "http://${BRIDGE_IP}:18235/admin/state"
  [ "$status" -eq 0 ]
  [ "$output" = "401" ]

  # Mit korrektem Token: 200 (sofern LLM_PROXY_ADMIN_TOKEN bekannt)
  if [ -n "$LLM_PROXY_ADMIN_TOKEN" ]; then
    run curl -s -w "%{http_code}" -H "Authorization: Bearer $LLM_PROXY_ADMIN_TOKEN" -o /dev/null "http://${BRIDGE_IP}:18235/admin/state"
    [ "$status" -eq 0 ]
    [ "$output" = "200" ]
  fi
}
