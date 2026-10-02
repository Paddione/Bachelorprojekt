#!/usr/bin/env bats
# tests/spec/mcp-gateway/mcp-sync-qwen-drift-no-secret-leak.bats
# Ticket: T900839
#
# Pruefmodus (T002448-M4): ERGEBNIS-orientiert. `mcp-sync.sh check` wird
# tatsaechlich ausgefuehrt; geprueft wird der resultierende stdout/stderr-Text,
# nicht der Skript-Quelltext.
#
# Befund: render_qwen_json loest den Authorization-Header genauso zum echten
# Wert auf wie render_agy_json (T002704). diff_or_drift() schwaerzte den Diff
# aber nur fuer das Label "mcp_config.json" (T002941) — bei Drift in
# ~/.qwen/settings.json standen der erwartete und der veraltete Token im
# Klartext in der Ausgabe.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO_ROOT/scripts/mcp-sync.sh"
}

@test "T900839: mcp-sync.sh check redacts bearer tokens from the qwen settings.json drift diff" {
  local tmpd fixture fakehome
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"
  fakehome="$tmpd/fakehome"
  mkdir -p "$fakehome/.qwen"

  cat > "$fixture" <<'YAML'
clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
    harness:
      qwen_code:
        httpUrl: http://localhost:19999/mcp
cluster: {}
YAML

  # Stale settings.json unter dem fake $HOME erzwingt DRIFT gegen den
  # aufgeloesten Ist-Wert, den render_qwen_json aus PROBE_TOKEN erzeugt.
  cat > "$fakehome/.qwen/settings.json" <<'JSON'
{
  "mcpServers": {
    "probe-http": {
      "httpUrl": "http://localhost:19999/mcp",
      "headers": { "Authorization": "Bearer st4le-rotated-token-1a2b3c" }
    }
  }
}
JSON

  # MCP_OUT_DIR isoliert die repo-getrackten Ziele in ein tmpdir und synct sie
  # zuerst per render, damit `check` nur gegen die Mini-Fixture driftet.
  # QWEN_TARGET haengt nur an HOME. Der render-Lauf ohne PROBE_TOKEN laesst den
  # Platzhalter stehen; die stale Datei wird danach erneut geschrieben.
  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" bash "$SYNC" render
  [ "$status" -eq 0 ]
  cat > "$fakehome/.qwen/settings.json" <<'JSON'
{
  "mcpServers": {
    "probe-http": {
      "httpUrl": "http://localhost:19999/mcp",
      "headers": { "Authorization": "Bearer st4le-rotated-token-1a2b3c" }
    }
  }
}
JSON

  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" \
    PROBE_TOKEN="s3cr3t-live-token-9f8e7d" bash "$SYNC" check
  echo "$output"

  # Positiv-Anker (T002356-M1): der Drift-Zweig fuer die qwen-Datei muss
  # ueberhaupt ausloesen, sonst waere die Negativ-Aussage unten vakuos wahr.
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT in settings.json (qwen)"* ]]

  # Negativ-Aussage: weder der aufgeloeste noch der veraltete Token-Wert
  # taucht im Output auf.
  [[ "$output" != *"s3cr3t-live-token-9f8e7d"* ]]
  [[ "$output" != *"st4le-rotated-token-1a2b3c"* ]]

  rm -rf "$tmpd"
}
