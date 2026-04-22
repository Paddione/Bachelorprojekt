#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-sync.bats — Pure unit tests for scripts/lib/keycloak-helpers.sh
# ═══════════════════════════════════════════════════════════════════
# No cluster, no curl, no kubectl. Uses fixtures under BATS_TEST_TMPDIR.

load test_helper

HELPERS="${PROJECT_DIR}/scripts/lib/keycloak-helpers.sh"

setup() {
  # shellcheck disable=SC1090
  source "$HELPERS"
}

# ── kc_substitute_placeholders ──────────────────────────────────

@test "kc_substitute_placeholders replaces single \${VAR} with value" {
  run kc_substitute_placeholders 'hello ${FOO} world' 'FOO=bar'
  [ "$status" -eq 0 ]
  [ "$output" = "hello bar world" ]
}

@test "kc_substitute_placeholders replaces multiple distinct vars" {
  run kc_substitute_placeholders '${A}/${B}/${A}' 'A=x
B=y'
  [ "$status" -eq 0 ]
  [ "$output" = "x/y/x" ]
}

@test "kc_substitute_placeholders leaves unknown \${VAR} untouched" {
  run kc_substitute_placeholders 'keep ${UNKNOWN}' 'FOO=bar'
  [ "$status" -eq 0 ]
  [ "$output" = "keep \${UNKNOWN}" ]
}

@test "kc_substitute_placeholders handles values with slashes and pipes safely" {
  run kc_substitute_placeholders 'url=${URL}' 'URL=https://auth.localhost/path|q'
  [ "$status" -eq 0 ]
  [ "$output" = "url=https://auth.localhost/path|q" ]
}

@test "kc_substitute_placeholders handles values containing '&' safely" {
  run kc_substitute_placeholders 'greet=${MSG}' 'MSG=hello & goodbye'
  [ "$status" -eq 0 ]
  [ "$output" = "greet=hello & goodbye" ]
}

# ── kc_assert_no_placeholders ───────────────────────────────────

@test "kc_assert_no_placeholders returns 0 when no \${...} present" {
  run kc_assert_no_placeholders 'fully resolved string'
  [ "$status" -eq 0 ]
}

@test "kc_assert_no_placeholders returns non-zero when \${VAR} remains" {
  run kc_assert_no_placeholders 'still has ${LEFTOVER}'
  [ "$status" -ne 0 ]
  [[ "$output" == *'LEFTOVER'* ]]
}

@test "kc_assert_no_placeholders reports all unresolved vars, sorted unique" {
  run kc_assert_no_placeholders '${B} and ${A} and ${B}'
  [ "$status" -ne 0 ]
  # Output should mention A and B exactly once each.
  [[ "$output" == *'${A}'* ]]
  [[ "$output" == *'${B}'* ]]
}

# ── kc_extract_clients_from_template ────────────────────────────

@test "kc_extract_clients_from_template emits one client JSON per line (NDJSON)" {
  local fixture="${BATS_TEST_TMPDIR}/realm.json"
  cat > "$fixture" <<'JSON'
{
  "realm": "workspace",
  "clients": [
    {"clientId": "alpha", "secret": "${A_SECRET}"},
    {"clientId": "beta", "secret": "${B_SECRET}"}
  ]
}
JSON

  run kc_extract_clients_from_template "$fixture"
  [ "$status" -eq 0 ]
  # Expect two NDJSON lines, one per client.
  [ "$(echo "$output" | wc -l)" -eq 2 ]
  [[ "$(echo "$output" | sed -n '1p')" == *'"clientId":"alpha"'* ]]
  [[ "$(echo "$output" | sed -n '2p')" == *'"clientId":"beta"'* ]]
}

@test "kc_extract_clients_from_template emits nothing for empty clients array" {
  local fixture="${BATS_TEST_TMPDIR}/empty.json"
  cat > "$fixture" <<'JSON'
{"realm": "workspace", "clients": []}
JSON
  run kc_extract_clients_from_template "$fixture"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
