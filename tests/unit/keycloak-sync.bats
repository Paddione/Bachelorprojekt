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
