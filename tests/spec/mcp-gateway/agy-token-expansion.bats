#!/usr/bin/env bats
# tests/spec/mcp-gateway/agy-token-expansion.bats
# SSOT: openspec/changes/agy-token-expansion/proposal.md
# Ticket: T002704
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Gemessen wird die tatsaechliche Generator-Ausgabe gegen eine Fixture-Registry
# in einem tmpdir (MCP_REGISTRY/MCP_OUT_DIR/HOME aus T002487) — kein Muster im
# Skriptquelltext. Die echte ~/.gemini-Config wird nie angefasst: AGY_TARGET
# haengt an HOME, und HOME zeigt in jedem Test in den tmpdir.
#
# Hintergrund: agy loest weder ${VAR} auf (wie Claude Code) noch kennt es
# opencodes {env:VAR}. Es sendet den Literal-String, der Shim antwortet 401,
# und agy verwirft den Server. Belegt am 2026-08-08 gegen :13005 —
#   POST 'Bearer ${BGE_MCP_TOKEN}' -> 401
#   POST 'Bearer <echter Token>'   -> 200
# und mit expandiertem Wert in der Config erschien bge-mcp sofort in agys
# Server-Aufzaehlung (sieben statt sechs).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/mcp-sync.sh"
  TMPD="$(mktemp -d)"
  # AGY_TARGET wird nur geschrieben, wenn sein Verzeichnis existiert.
  mkdir -p "$TMPD/fakehome/.gemini/config"
  AGY_OUT="$TMPD/fakehome/.gemini/config/mcp_config.json"
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
cluster: {}
YAML
}

write_server_env() {
  mkdir -p "$TMPD/fakehome/.config/bge-mcp"
  printf '%s\n' "$1" > "$TMPD/fakehome/.config/bge-mcp/server.env"
}

@test "agy renderer resolves \${VAR} from the environment" {
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-4711" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$AGY_OUT"
  echo "agy header: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "Bearer env-value-4711" ]
}

@test "agy renderer falls back to server.env when the environment is empty" {
  # Der eigentliche Kern des Vorgangs: der Token WAR gepflegt — nur nicht in
  # der Umgebung des Harness-Prozesses.
  write_server_env 'PROBE_TOKEN=from-server-env-4712'

  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$AGY_OUT"
  echo "agy header: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "Bearer from-server-env-4712" ]
}

@test "unresolvable placeholder is kept, warned about, and does not fail the render" {
  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst (T002356-M1): der Renderer muss ueberhaupt gelaufen
  # sein und die Datei geschrieben haben — sonst waeren die Aussagen unten
  # vakuos erfuellt.
  [ -f "$AGY_OUT" ]
  run jq -r '.mcpServers["probe-http"].serverUrl' "$AGY_OUT"
  [ "$output" = "http://localhost:19999/mcp" ]

  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$AGY_OUT"
  echo "agy header: $output"
  [ "$output" = 'Bearer ${PROBE_TOKEN}' ]

  # Die Warnung nennt die Variable — eine Meldung ohne Namen hilft beim
  # Diagnostizieren nicht weiter.
  run env -u PROBE_TOKEN HOME="$TMPD/fakehome" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  echo "stderr+stdout: $output"
  [[ "$output" == *"PROBE_TOKEN"* ]]
}

@test "header values without a placeholder pass through untouched" {
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-4711" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run jq -r '.mcpServers["probe-http"].headers["X-Static"]' "$AGY_OUT"
  echo "static header: $output"
  [ "$output" = "no-placeholder-here" ]
}

@test "the repository-tracked renderers never receive the resolved value" {
  # Sicherheits-Guard: .mcp.json und .opencode/opencode.jsonc sind getrackt.
  # Ein expandierter Token waere dort ein committetes Geheimnis.
  run env HOME="$TMPD/fakehome" PROBE_TOKEN="env-value-4711" \
      MCP_REGISTRY="$TMPD/registry.yaml" MCP_OUT_DIR="$TMPD" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  # Positiv-Anker: beide Dateien existieren und tragen ihre eigene Notation.
  run jq -r '.mcpServers["probe-http"].headers.Authorization' "$TMPD/.mcp.json"
  echo "claude header: $output"
  [ "$output" = 'Bearer ${PROBE_TOKEN}' ]

  run grep -c '{env:PROBE_TOKEN}' "$TMPD/.opencode/opencode.jsonc"
  echo "opencode placeholder count: $output"
  [ "$output" -ge 1 ]

  # Erst danach die Negativ-Aussage: der aufgeloeste Wert taucht in keiner
  # der beiden getrackten Dateien auf.
  run grep -c 'env-value-4711' "$TMPD/.mcp.json"
  [ "$output" -eq 0 ]
  run grep -c 'env-value-4711' "$TMPD/.opencode/opencode.jsonc"
  [ "$output" -eq 0 ]
}
