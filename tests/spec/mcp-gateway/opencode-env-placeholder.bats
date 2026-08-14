#!/usr/bin/env bats
# tests/spec/mcp-gateway/opencode-env-placeholder.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002488
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Gemessen wird die tatsaechliche Generator-Ausgabe gegen eine Fixture-Registry
# in einem tmpdir (MCP_REGISTRY/MCP_OUT_DIR aus T002487), nicht ein Muster im
# Skriptquelltext.
#
# Hintergrund: Claude Code und opencode verlangen UNTERSCHIEDLICHE
# Platzhalter-Syntax fuer Umgebungsvariablen in der MCP-Config. Empirisch
# belegt mit `opencode mcp list` gegen den laufenden Shim auf :13005:
#   "Bearer ${BGE_MCP_TOKEN}"      -> bge-mcp failed     (opencode expandiert nicht)
#   "Bearer {env:BGE_MCP_TOKEN}"   -> bge-mcp connected
# Die Registry fuehrt weiter die kanonische ${VAR}-Notation; der
# opencode-Renderer uebersetzt sie.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/mcp-sync.sh"
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

@test "opencode renderer translates \${VAR} into opencode's {env:VAR} syntax" {
  local tmpd
  tmpd="$(mktemp -d)"
  fixture_registry "$tmpd/registry.yaml"

  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$tmpd/registry.yaml" MCP_OUT_DIR="$tmpd" \
      bash "$SYNC" render
  echo "render: $output"
  [ "$status" -eq 0 ]

  run grep -o '"Authorization":"[^"]*"' "$tmpd/.opencode/opencode.jsonc"
  echo "opencode header: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'{env:PROBE_TOKEN}'* ]]
  # Die Claude-Code-Notation darf in der opencode-Datei NICHT mehr auftauchen —
  # sie wuerde dort unexpandiert als Literal an den Server gehen (HTTP 401).
  [[ "$output" != *'${PROBE_TOKEN}'* ]]

  rm -rf "$tmpd"
}

@test "claude renderer skips servers with \${VAR} in headers (T004272)" {
  # [T004272] Qwen Code liest .mcp.json mit Vorrang vor ~/.qwen/settings.json,
  # expandiert ${VAR} aber nicht — der Literal-String fuehrt zu HTTP 401.
  # Der Claude-Renderer ueberspringt deshalb Server mit ${VAR} in Headers.
  local tmpd
  tmpd="$(mktemp -d)"
  fixture_registry "$tmpd/registry.yaml"

  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$tmpd/registry.yaml" MCP_OUT_DIR="$tmpd" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  # probe-http hat ${PROBE_TOKEN} in Headers — darf NICHT in .mcp.json sein
  run jq -r '.mcpServers["probe-http"]' "$tmpd/.mcp.json"
  echo "claude probe-http: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]

  rm -rf "$tmpd"
}

@test "header values without a placeholder pass through untouched in opencode" {
  # Positiv-Anker gegen eine zu gierige Ersetzung: ein Wert ohne ${...} darf
  # in KEINEM Renderer veraendert werden. Ohne diesen Test wuerde eine
  # Uebersetzung, die blind jede geschweifte Klammer umschreibt, unbemerkt
  # durchgehen.
  # [T004272] Hinweis: Der Claude-Renderer ueberspringt Server mit ${VAR} in
  # Headers komplett — deshalb wird hier nur opencode geprueft.
  local tmpd
  tmpd="$(mktemp -d)"
  fixture_registry "$tmpd/registry.yaml"

  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$tmpd/registry.yaml" MCP_OUT_DIR="$tmpd" \
      bash "$SYNC" render
  [ "$status" -eq 0 ]

  run grep -c 'no-placeholder-here' "$tmpd/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]

  rm -rf "$tmpd"
}

@test "the live bge-mcp entry uses the syntax opencode actually expands" {
  # Regressionsschutz fuer den konkreten Server, der den Vorgang ausgeloest hat.
  run grep -o '"Authorization":"[^"]*"' "$REPO/.opencode/opencode.jsonc"
  echo "live opencode header: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'{env:BGE_MCP_TOKEN}'* ]]
}
