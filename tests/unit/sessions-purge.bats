#!/usr/bin/env bats
# tests/unit/sessions-purge.bats — Unit-Tests für scripts/sessions-purge.sh [T000994]
# Stubbt curl via PATH-Injection, damit kein echter HTTP-Aufruf stattfindet.

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/sessions-purge.sh"

setup() {
  export SESSIONS_PURGE_URL="http://fake-website.local/api/admin/sessions/purge"
  # Stub-Verzeichnis im TMPDIR anlegen
  STUB_DIR="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUB_DIR"
  export PATH="$STUB_DIR:$PATH"
}

@test "erfolgreicher Purge: Token gesetzt, curl antwortet HTTP 200" {
  export SESSIONS_CRON_TOKEN="test-token-abc"
  # curl-Stub: gibt JSON zurück, Exit 0
  cat > "$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
printf '{"purged":2,"warnings":[]}'
exit 0
EOF
  chmod +x "$STUB_DIR/curl"

  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"purged"'
}

@test "Token fehlt: Exit 2 mit Fehlermeldung auf stderr" {
  unset SESSIONS_CRON_TOKEN
  # curl-Stub existiert, aber sollte gar nicht aufgerufen werden
  cat > "$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$STUB_DIR/curl"

  run bash "$SCRIPT"
  [ "$status" -eq 2 ]
  echo "$output$stderr" | grep -qi "SESSIONS_CRON_TOKEN required" || \
    [[ "$output" == *"required"* ]] || \
    [[ "${output}${BATS_OUTPUT:-}" == *"required"* ]]
}

@test "curl schlägt fehl (HTTP 500): Exit 1" {
  export SESSIONS_CRON_TOKEN="test-token-xyz"
  # curl-Stub: simuliert Fehler (exit 22 = HTTP error mit -f)
  cat > "$STUB_DIR/curl" <<'EOF'
#!/usr/bin/env bash
exit 22
EOF
  chmod +x "$STUB_DIR/curl"

  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
}
