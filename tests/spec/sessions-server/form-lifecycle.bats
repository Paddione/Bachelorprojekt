#!/usr/bin/env bats
# tests/spec/sessions-server/form-lifecycle.bats
# SSOT: openspec/specs/sessions-server.md — Form Session Start with Ticket
# Association + Form Re-Upload (regen). Prüfmodus: command output verification.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  HUB="bash ${REPO_ROOT}/scripts/session-hub.sh"
  TMP_DIR="$(mktemp -d)"
  export SESSION_HUB_REGISTRY="${TMP_DIR}/active-sessions.json"
  export SESSION_HUB_NO_TUNNEL=1
  printf '[]\n' > "$SESSION_HUB_REGISTRY"
}

teardown() { rm -rf "${TMP_DIR:-}"; }

@test "start-form speichert ticket_id und source_file in der Registry" {
  cat > "$TMP_DIR/tkform.html" <<'HTML'
<html><body data-ticket="__SESSION_TICKET_ID__"></body></html>
HTML
  run $HUB start-form --file "$TMP_DIR/tkform.html" --name tkform --ticket-id T000123
  [ "$status" -eq 0 ]
  [ "$(jq -r '.[] | select(.slug=="tkform") | .ticket_id' "$SESSION_HUB_REGISTRY")" = "T000123" ]
  src="$(jq -r '.[] | select(.slug=="tkform") | .source_file' "$SESSION_HUB_REGISTRY")"
  [ "$src" = "$TMP_DIR/tkform.html" ]
  [ "$(jq -r '.[] | select(.slug=="tkform") | .type' "$SESSION_HUB_REGISTRY")" = "form" ]
}

@test "start-form ohne Platzhalter speichert trotzdem source_file (absolut)" {
  printf '<html><body>plain</body></html>' > "$TMP_DIR/srcform.html"
  run $HUB start-form --file "$TMP_DIR/srcform.html" --name srcform
  [ "$status" -eq 0 ]
  [ "$(jq -r '.[] | select(.slug=="srcform") | .source_file' "$SESSION_HUB_REGISTRY")" = "$TMP_DIR/srcform.html" ]
}

@test "regen laedt das Formular aus dem gespeicherten source_file erneut hoch" {
  cat > "$TMP_DIR/regentest.html" <<'HTML'
<html><body data-api="__SESSION_API_URL__"></body></html>
HTML
  $HUB start-form --file "$TMP_DIR/regentest.html" --name regentest --ticket-id T000123 >/dev/null
  run $HUB regen --name regentest
  [ "$status" -eq 0 ]
  [[ "$output" == *"done"* ]]
}

@test "regen schlaegt fehl wenn kein source_file hinterlegt ist" {
  $HUB register --name noregen --port 18083 --type companion >/dev/null
  run $HUB regen --name noregen
  [ "$status" -ne 0 ]
}
