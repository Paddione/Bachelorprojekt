#!/usr/bin/env bats
# tests/spec/mcp-gateway/qwen-token-expansion.bats
# Ticket: T004272
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Gemessen wird die tatsaechliche Generator-Ausgabe gegen eine Fixture-Registry
# in einem tmpdir (MCP_REGISTRY/MCP_OUT_DIR/HOME aus T002487) — kein Muster im
# Skriptquelltext. Die echte ~/.qwen-Config wird nie angefasst: QWEN_TARGET
# haengt an HOME, und HOME zeigt in jedem Test in den tmpdir.
#
# Hintergrund: Qwen Code expandiert ${VAR} in den mcpServers.headers NICHT —
# es sendet den Literal-String "Bearer ${BGE_MCP_TOKEN}", der Shim antwortet
# 401. Gleicher Bug wie agy (T002704) und OpenCode (T002488). Die Loesung:
# mcp-sync.sh loest den Token zur Sync-Zeit auf und schreibt den Klartext-
# Wert in die nicht-getrackte ~/.qwen/settings.json (chmod 600).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/mcp-sync.sh"
  TMPD="$(mktemp -d)"
  mkdir -p "$TMPD/fakehome/.qwen"
  QWEN_OUT="$TMPD/fakehome/.qwen/settings.json"
  fixture_registry "$TMPD/registry.yaml"
}

teardown() {
  rm -rf "$TMPD"
}

fixture_registry() {
  cat > "$1" <<'YAML'
clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Static: "no-placeholder-here"
    harness:
      claude_code:
        type: http
        url: http://localhost:19999/mcp
      agy:
        serverUrl: http://localhost:19999/mcp
      opencode:
        type: remote
        url: http://localhost:19999/mcp
        enabled: true
      qwen_code:
        httpUrl: http://localhost:19999/mcp
cluster: {}
YAML
}

write_server_env() {
  mkdir -p "$TMPD/fakehome/.config/bge-mcp"
  printf '%s\n' "$1" > "$TMPD/fakehome/.config/bge-mcp/server.env"
}

@test "qwen renderer resolves \${VAR} from the environment" {
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-5821" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$QWEN_OUT"
  echo "qwen header: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "Bearer env-value-5821" ]
}

@test "qwen renderer falls back to server.env when the environment is empty" {
  write_server_env 'PROBE_TOKEN=from-server-env-5822'

  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$QWEN_OUT"
  echo "qwen header: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "Bearer from-server-env-5822" ]
}

@test "qwen: unresolvable placeholder is kept, warned about, and does not fail the render" {
  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst (T002356-M1): der Renderer muss ueberhaupt gelaufen
  # sein und die Datei geschrieben haben.
  [ -f "$QWEN_OUT" ]
  run jq -r '.mcpServers["probe-http"].httpUrl' "$QWEN_OUT"
  [ "$output" = "http://localhost:19999/mcp" ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$QWEN_OUT"
  echo "qwen header: $output"
  [ "$output" = 'Bearer ${PROBE_TOKEN}' ]

  # Die Warnung nennt die Variable.
  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "stderr+stdout: $output"
  [[ "$output" == *"PROBE_TOKEN"* ]]
}

@test "qwen: header values without a placeholder pass through untouched" {
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-5821" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers["X-Static"]' "$QWEN_OUT"
  echo "static header: $output"
  [ "$output" = "no-placeholder-here" ]
}

@test "qwen: settings.json is written user-readable only, because it carries a resolved secret" {
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-5821" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run stat -c '%a' "$QWEN_OUT"
  echo "mode (neu angelegt): $output"
  [ "$output" = "600" ]

  # Bestandsfall: chmod 600 wird auch fuer eine bereits existierende Datei gesetzt.
  chmod 644 "$QWEN_OUT"
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-5821" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run stat -c '%a' "$QWEN_OUT"
  echo "mode (bestehende Datei): $output"
  [ "$output" = "600" ]
}

@test "qwen: settings.json preserves non-MCP config on merge" {
  # Vor dem Render eine bestehende settings.json mit anderen Settings anlegen.
  cat > "$QWEN_OUT" <<'JSON'
{
  "modelProviders": [{"name": "test-provider"}],
  "theme": "dark"
}
JSON

  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-5821" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run jq -r '.modelProviders[0].name' "$QWEN_OUT"
  [ "$output" = "test-provider" ]
  run jq -r '.theme' "$QWEN_OUT"
  [ "$output" = "dark" ]

  # Und die MCP-Server sind auch da.
  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$QWEN_OUT"
  [ "$output" = "Bearer env-value-5821" ]
}
