#!/usr/bin/env bats
# tests/spec/mcp-gateway/authenticated-http-headers.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002487
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Die Tests messen die tatsaechliche Generator-Ausgabe (mcp-sync.sh render/check
# gegen eine Fixture-Registry in einem tmpdir) statt Implementierungsmuster im
# Skript zu grepen. Ausnahme sind die beiden Registry-Assertions: die Registry
# IST die Konfiguration, ihr Inhalt ist damit selbst das Ergebnis.
#
# Deckt ab: HTTP-MCP-Server mit Bearer-Auth (bge-mcp, :13005) waren in allen
# Harnesses unerreichbar (HTTP 401), weil die HTTP-Zweige der Renderer ein
# 2-Feld-Literal ohne Header-Durchreichung emittierten.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO/scripts/mcp-sync.sh"
  REGISTRY="$REPO/docs/agent-guide/registry/mcp.yaml"
}

# ── Registry deklariert den Header als Env-Referenz ──────────────────────

@test "registry declares an Authorization header for bge-mcp" {
  run bash -c "node -e \"
    const fs=require('fs'),y=require('yaml');
    const d=y.parse(fs.readFileSync('$REGISTRY','utf8'));
    const c=d.clients['bge-mcp'];
    if(!c.headers) process.exit(1);
    const a=c.headers.Authorization;
    if(!a) process.exit(1);
    console.log(a);
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == Bearer* ]]
}

@test "registry Authorization value is an env reference, never a literal token" {
  # Positiv-Anker zuerst (T002356-M1): der Header muss ueberhaupt existieren,
  # sonst bestuende die Negativ-Aussage vakuos.
  run bash -c "node -e \"
    const fs=require('fs'),y=require('yaml');
    const d=y.parse(fs.readFileSync('$REGISTRY','utf8'));
    const a=d.clients['bge-mcp'].headers.Authorization;
    console.log(a);
  \""
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  # Erst jetzt die Negativ-Aussage: kein expandierter Token im Klartext.
  [[ "$output" == *'${BGE_MCP_TOKEN}'* ]]
}

# ── Generator reicht Header in die HTTP-Harness-Configs durch ────────────

@test "generated .mcp.json does NOT carry bge-mcp (T004272)" {
  # [T004272] bge-mcp hat ${BGE_MCP_TOKEN} in Headers — der Claude-Renderer
  # ueberspringt Server mit ${VAR} in Headers, damit Qwen Code nicht den
  # Literal-String sendet (HTTP 401). bge-mcp gehoert in ~/.qwen/settings.json.
  run bash -c "node -e \"
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$REPO/.mcp.json','utf8'));
    const s=d.mcpServers['bge-mcp'];
    console.log(s === undefined ? 'absent' : 'present');
  \""
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "absent" ]
}

@test "generated opencode.jsonc carries the bge-mcp Authorization header" {
  run bash -c "grep -A8 '\"bge-mcp\"' '$REPO/.opencode/opencode.jsonc' | grep -c 'Authorization'"
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "mcp-sync.sh check stays green — headers are generated, not hand-edited" {
  # Wenn der Header in .mcp.json steht und check gruen ist, dann hat der
  # Generator ihn reproduzierbar aus der Registry erzeugt. Genau das trennt
  # den Fix von einem manuellen Eintrag, den der naechste sync ueberschreibt.
  run bash "$SYNC" check
  echo "output: $output"
  [ "$status" -eq 0 ]
}

# ── Generizitaet: kein bge-mcp-Sonderfall im Renderer ────────────────────

@test "renderers pass headers through for opencode and agy (T004272)" {
  # [T004272] Der Claude-Renderer ueberspringt Server mit ${VAR} in Headers.
  # Dieser Test prueft, dass opencode und agy die Header korrekt durchreichen.
  local tmpd fixture
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"
  cat > "$fixture" <<'YAML'
clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
      X-Probe: "static-value"
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

  run env HOME="$tmpd/fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd" bash "$SYNC" render
  local render_status="$status"
  local render_output="$output"

  echo "render output: $render_output"
  [ "$render_status" -eq 0 ]

  # Claude-Renderer ueberspringt probe-http (hat ${VAR} in Headers)
  run bash -c "node -e \"
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('$tmpd/.mcp.json','utf8'));
    console.log(d.mcpServers['probe-http'] === undefined ? 'absent' : 'present');
  \""
  echo "claude probe-http: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "absent" ]

  # OpenCode-Renderer uebersetzt ${VAR} in {env:VAR}
  # Hinweis: .opencode/opencode.jsonc ist JSONC (mit Kommentaren), also grep statt JSON.parse
  run grep -o '"Authorization":"[^"]*"' "$tmpd/.opencode/opencode.jsonc"
  echo "opencode auth header: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'{env:PROBE_TOKEN}'* ]]

  run grep -o '"X-Probe":"[^"]*"' "$tmpd/.opencode/opencode.jsonc"
  echo "opencode X-Probe: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *'static-value'* ]]

  rm -rf "$tmpd"
}

# ── Kein Secret in getrackten Dateien ────────────────────────────────────

@test "no expanded bearer token leaks into tracked harness configs" {
  # [T004272] .mcp.json hat jetzt KEINE Authorization-Header mehr, weil der
  # Claude-Renderer Server mit ${VAR} in Headers ueberspringt. Der Test prueft,
  # dass keine Klartext-Token in .mcp.json stehen.
  [ -f "$REPO/.mcp.json" ]

  # Extraktion aller Authorization-Werte (sollte leer sein)
  run jq -r '.mcpServers | to_entries[] | select(.value.headers != null)
             | .key as $n | .value.headers | to_entries[]
             | select(.key | ascii_downcase == "authorization")
             | "\($n)=\(.value)"' "$REPO/.mcp.json"
  echo "authorization headers: $output"
  [ "$status" -eq 0 ]

  # Wenn es Authorization-Header gibt, pruefe dass alle ${VAR}-Referenzen sind
  if [ -n "$output" ]; then
    local leaked=""
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      case "$line" in
        *'${'*'}'*) : ;;                   # Env-Referenz — in Ordnung
        *) leaked="${leaked}${line} " ;;   # alles andere ist ein Klartext-Wert
      esac
    done <<< "$output"
    [ -z "$leaked" ] || { echo "LEAK: $leaked"; false; }
  fi
}
