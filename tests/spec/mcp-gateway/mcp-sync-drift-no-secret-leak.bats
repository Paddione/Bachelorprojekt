#!/usr/bin/env bats
# tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002941 (zweiter, unabhaengiger Befund aus derselben Quelldatei)
#
# Pruefmodus (T002448-M4): ERGEBNIS-orientiert. `mcp-sync.sh check` wird
# tatsaechlich ausgefuehrt; geprueft wird der resultierende stdout/stderr-Text,
# nicht der Skript-Quelltext.
#
# Befund: fuer den agy-Ziel-Vergleich (mcp_config.json, liegt unter
# $HOME/.gemini/config/ — ausserhalb des Repos, ohne git als Sicherheitsnetz)
# ist der Authorization-Header BEREITS zum echten Wert aufgeloest
# (render_agy_json, T002704 — agy kennt ${VAR}-Platzhalter nicht). Faellt der
# Drift-Zweig von diff_or_drift() aus, gibt er den vollstaendigen `diff`
# zwischen erwarteter und tatsaechlicher Datei aus — inklusive des
# aufgeloesten Klartext-Tokens. Faellt dieser Zweig in CI aus, landet ein
# Credential im oeffentlich lesbaren Actions-Log.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SYNC="$REPO_ROOT/scripts/mcp-sync.sh"
}

@test "T002941: mcp-sync.sh check redacts expanded bearer tokens from the mcp_config.json drift diff" {
  local tmpd fixture fakehome
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"
  fakehome="$tmpd/fakehome"
  mkdir -p "$fakehome/.gemini/config"

  cat > "$fixture" <<'YAML'
clients:
  probe-http:
    transport: http
    endpoint: http://localhost:19999/mcp
    headers:
      Authorization: "Bearer ${PROBE_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:19999/mcp
cluster: {}
YAML

  # Stale mcp_config.json unter dem fake $HOME erzwingt DRIFT gegen den
  # aufgeloesten Ist-Wert, den render_agy_json aus PROBE_TOKEN erzeugt.
  cat > "$fakehome/.gemini/config/mcp_config.json" <<'JSON'
{
  "mcpServers": {
    "probe-http": {
      "serverUrl": "http://localhost:19999/mcp",
      "headers": { "Authorization": "Bearer STALE-VALUE-NOT-CURRENT" }
    }
  }
}
JSON

  # MCP_OUT_DIR isoliert die drei repo-getrackten Ziele (.mcp.json,
  # opencode.jsonc, mcp-servers.json) in ein leeres tmpdir und synct sie
  # zuerst per render — ohne diesen Schritt driftet `check` zusaetzlich gegen
  # die echten Repo-Dateien (voller Registry-Inhalt vs. Mini-Fixture) und der
  # Test misst Rauschen statt gezielt den mcp_config.json-Zweig. AGY_TARGET
  # (mcp_config.json) haengt bewusst NICHT an MCP_OUT_DIR (siehe
  # scripts/mcp-sync.sh), sondern nur an HOME — genau das isoliert dieser Test.
  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" bash "$SYNC" render
  [ "$status" -eq 0 ]

  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" \
    PROBE_TOKEN="s3cr3t-live-token-9f8e7d" bash "$SYNC" check
  echo "$output"

  # Positiv-Anker (T002356-M1): der Drift-Zweig fuer mcp_config.json muss
  # ueberhaupt auslösen, sonst waere die Negativ-Aussage unten vakuos wahr.
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT in mcp_config.json"* ]]

  # Negativ-Aussage: der aufgeloeste Token-Wert taucht nirgends im Output auf.
  [[ "$output" != *"s3cr3t-live-token-9f8e7d"* ]]

  rm -rf "$tmpd"
}
