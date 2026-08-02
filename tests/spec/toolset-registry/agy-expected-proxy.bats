#!/usr/bin/env bats
# tests/spec/toolset-registry/agy-expected-proxy.bats
# Prüfmodus: Prüft die Existenz und Gültigkeit von expected/agy-mcp-config.json.

load '../test_helper.bash'

@test "expected agy mcp config file exists and is valid JSON" {
  local target="docs/agent-guide/registry/expected/agy-mcp-config.json"
  [ -f "$target" ] || { echo "$target file missing"; return 1; }
  run node -e "JSON.parse(require('fs').readFileSync('$target', 'utf8'))"
  [ "$status" -eq 0 ] || { echo "$target is invalid JSON"; return 1; }
}
