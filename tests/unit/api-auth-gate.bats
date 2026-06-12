#!/usr/bin/env bats
# api-auth-gate.bats — Offline BATS wrapper for scripts/api-auth-check.mjs
# Tests the gate script against fixture files (no live cluster or DB required).

load test_helper

GATE_SCRIPT="${PROJECT_DIR}/scripts/api-auth-check.mjs"

setup() {
  export MAP_FILE="${BATS_TEST_TMPDIR}/api-map.json"
  export ALLOWLIST_FILE="${BATS_TEST_TMPDIR}/allowlist.json"
}

write_map() {
  cat > "$MAP_FILE"
}

write_allowlist() {
  cat > "$ALLOWLIST_FILE"
}

run_gate() {
  run env API_MAP_PATH="$MAP_FILE" ALLOWLIST_PATH="$ALLOWLIST_FILE" \
    node "$GATE_SCRIPT" "$@"
}

@test "clean map + complete allowlist → exit 0" {
  write_map <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/health", "methods": ["GET"], "auth": "unclassified", "file": "health.ts" },
    { "path": "/api/admin/foo", "methods": ["POST"], "auth": "admin", "file": "admin/foo.ts" }
  ]
}
EOF
  write_allowlist <<'EOF'
[
  { "path": "/api/health", "methods": ["GET"], "reason": "health check" }
]
EOF
  run_gate
  assert_success
}

@test "unclassified endpoint without allowlist → exit 1" {
  write_map <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/mystery", "methods": ["GET"], "auth": "unclassified", "file": "mystery.ts" }
  ]
}
EOF
  write_allowlist <<'EOF'
[]
EOF
  run_gate
  assert_failure
  assert_output --partial "unclassified"
}

@test "unclassified endpoint without allowlist entry → exit 1" {
  write_map <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/public-form", "methods": ["POST"], "auth": "unclassified", "file": "public-form.ts" }
  ]
}
EOF
  write_allowlist <<'EOF'
[]
EOF
  run_gate
  assert_failure
}

@test "admin/session/internal/cron pass without allowlist" {
  write_map <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/a", "methods": ["GET"], "auth": "admin", "file": "a.ts" },
    { "path": "/api/b", "methods": ["GET"], "auth": "session", "file": "b.ts" },
    { "path": "/api/c", "methods": ["GET"], "auth": "internal", "file": "c.ts" },
    { "path": "/api/d", "methods": ["GET"], "auth": "cron", "file": "d.ts" }
  ]
}
EOF
  write_allowlist <<'EOF'
[]
EOF
  run_gate
  assert_success
}

@test "regression: session → unclassified without allowlist → exit 1" {
  write_map <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/protected", "methods": ["GET"], "auth": "unclassified", "file": "protected.ts" }
  ]
}
EOF
  write_allowlist <<'EOF'
[]
EOF
  MAIN_MAP="${BATS_TEST_TMPDIR}/main-map.json"
  cat > "$MAIN_MAP" <<'EOF'
{
  "generatedAt": "2026-06-12T00:00:00.000Z",
  "endpoints": [
    { "path": "/api/protected", "methods": ["GET"], "auth": "session", "file": "protected.ts" }
  ]
}
EOF
  run_gate --regression --main-map "$MAIN_MAP"
  assert_failure
  assert_output --partial "regression"
}
