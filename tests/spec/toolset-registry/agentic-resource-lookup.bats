#!/usr/bin/env bats
# tests/spec/toolset-registry/agentic-resource-lookup.bats
# Pruefmodus: command output verification (T002448-M4). Jeder Test fuehrt
# `node scripts/agentic-lookup.mjs` aus und prueft $status und $output.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIXTURE_DIR="$REPO_ROOT/tests/fixtures/agentic-lookup"
  REG_DIR="${BATS_TEST_TMPDIR}/registry"
  mkdir -p "$REG_DIR"

  cp "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml" "$REG_DIR/capabilities.yaml"
}

write_registry() {
  local path="${BATS_TEST_TMPDIR}/$1.yaml"
  cat > "$path"
  echo "$path"
}

lookup() {
  local verb="$1"; shift
  run env TOOLSET_REGISTRY="${REG_DIR}/capabilities.yaml" \
    AGENTIC_REGISTRY_FIXTURE_DIR="$FIXTURE_DIR" \
    AGENTIC_TOOLS_FIXTURE="$FIXTURE_DIR/tools-list.json" \
    node "$REPO_ROOT/scripts/agentic-lookup.mjs" "$verb" "$@"
}

@test "find: suppressed entry from capabilities.yaml is annotated with state and reason" {
  local reg
  reg="$(write_registry find-suppressed <<'EOF'
capabilities:
  browser-automation:
    mcp:com.pulsemcp/playwright-stealth:
      state: suppressed
      reason: "chrome-devtools-mcp deckt den Bedarf ab."
EOF
)"
  cp "$reg" "$REG_DIR/capabilities.yaml"

  lookup find "browser automation"
  [ "$status" -eq 0 ]
  [[ "$output" == *"com.pulsemcp/playwright-stealth"* ]]
  [[ "$output" == *"suppressed"* ]]
  [[ "$output" == *"chrome-devtools-mcp deckt den Bedarf"* ]]
}

@test "find: unreachable registry returns local hits, names source on stderr, exits 0" {
  local reg
  reg="$(write_registry find-netfail <<'EOF'
capabilities:
  filesystem:
    mcp:com.example/filesystem:
      state: canonical
      use_when: "Filesystem access"
      roles: [orchestrator]
EOF
)"
  cp "$reg" "$REG_DIR/capabilities.yaml"

  run env TOOLSET_REGISTRY="${REG_DIR}/capabilities.yaml" \
    AGENTIC_REGISTRY_BASE="http://127.0.0.1:9" \
    node "$REPO_ROOT/scripts/agentic-lookup.mjs" find "filesystem"
  [ "$status" -eq 0 ]
  [[ "$output" == *"com.example/filesystem"* ]]
  [[ "$output" == *"canonical"* ]]
}

@test "inspect: server with remote labels output as schema" {
  lookup inspect "com.pulsemcp/playwright-stealth"
  [ "$status" -eq 0 ]
  [[ "$output" == *"schema"* ]]
  [[ "$output" == *"browser_navigate"* ]]
  [[ "$output" == *"browser_screenshot"* ]]
}

@test "inspect: server without remote labels output as readme and names acquisition path" {
  lookup inspect "com.example/filesystem"
  [ "$status" -eq 0 ]
  [[ "$output" == *"readme"* ]]
}

@test "record: without --reason on non-canonical state exits 1 before touching file" {
  local reg
  reg="$(write_registry record-test <<'EOF'
capabilities: {}
EOF
)"
  cp "$reg" "$REG_DIR/capabilities.yaml"
  local before; before=$(sha256sum "$REG_DIR/capabilities.yaml" | awk '{print $1}')

  local pos_reg
  pos_reg="$(write_registry record-positive <<'EOF'
capabilities: {}
EOF
)"
  cp "$pos_reg" "$REG_DIR/capabilities.yaml"
  run env TOOLSET_REGISTRY="${REG_DIR}/capabilities.yaml" \
    node "$REPO_ROOT/scripts/agentic-lookup.mjs" record "com.pulsemcp/test-server" \
    --capability "browser-automation" --state suppressed --reason "test reason" --source "npm:@pulsemcp/test"
  [ "$status" -eq 0 ]

  cp "$reg" "$REG_DIR/capabilities.yaml"
  run env TOOLSET_REGISTRY="${REG_DIR}/capabilities.yaml" \
    node "$REPO_ROOT/scripts/agentic-lookup.mjs" record "com.pulsemcp/test-server" \
    --capability "browser-automation" --state suppressed --source "npm:@pulsemcp/test"
  [ "$status" -eq 1 ]

  local after; after=$(sha256sum "$REG_DIR/capabilities.yaml" | awk '{print $1}')
  [ "$before" = "$after" ]
}
