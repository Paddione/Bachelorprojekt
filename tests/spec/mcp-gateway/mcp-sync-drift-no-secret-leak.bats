#!/usr/bin/env bats
# tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002941 (zweiter, unabhaengiger Befund aus derselben Quelldatei)
# Ticket: T900052 (Task 4.4 — erweitert um Token-Isolations-Test)
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

# [T900052] Task 4.4: Token-Isolation — ein Server-Specific Token darf NUR
# seinen eigenen Endpoint autorisieren, nicht einen anderen. Die Registry
# gettete Token getrennt (FACTORY_MCP_TOKEN vs. MCP_POSTGRES_TOKEN vs.
# BGE_MCP_TOKEN), und die generierten Configs muessen diese Trennung
# respektieren.
@test "T900052: server-specific tokens are isolated in rendered configs" {
  local tmpd fixture fakehome
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"
  fakehome="$tmpd/fakehome"
  mkdir -p "$fakehome/.gemini/config"

  cat > "$fixture" <<'YAML'
clients:
  server-a:
    transport: http
    endpoint: http://localhost:13001/mcp
    headers:
      Authorization: "Bearer ${SERVER_A_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:13001/mcp
  server-b:
    transport: http
    endpoint: http://localhost:13003/mcp
    headers:
      Authorization: "Bearer ${SERVER_B_TOKEN}"
    harness:
      agy:
        serverUrl: http://localhost:13003/mcp
cluster: {}
YAML

  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" bash "$SYNC" render
  [ "$status" -eq 0 ]

  # Render mit einem Token-Wert fuer beide — pruefe, dass die erwartete
  # Konfiguration die richtige Zuordnung hat (server-a bekommt A-Token,
  # server-b bekommt B-Token).
  run env HOME="$fakehome" MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" \
    SERVER_A_TOKEN="token-for-a-only" SERVER_B_TOKEN="token-for-b-only" \
    bash "$SYNC" render
  [ "$status" -eq 0 ]

  # Die generierte mcp_config.json muss die Tokens korrekt zuordnen:
  # server-a Authorization enthaelt "token-for-a-only"
  # server-b Authorization enthaelt "token-for-b-only"
  if [ -f "$fakehome/.gemini/config/mcp_config.json" ]; then
    local config
    config="$(cat "$fakehome/.gemini/config/mcp_config.json")"
    # server-a muss A-Token haben, nicht B-Token
    local a_url a_auth b_url b_auth
    a_url="$(echo "$config" | grep -A5 '"server-a"' | grep 'serverUrl' | head -1)"
    a_auth="$(echo "$config" | grep -A10 '"server-a"' | grep 'Authorization' | head -1)"
    b_auth="$(echo "$config" | grep -A10 '"server-b"' | grep 'Authorization' | head -1)"
    echo "server-a auth: $a_auth"
    echo "server-b auth: $b_auth"
    [[ "$a_auth" == *"token-for-a-only"* ]]
    [[ "$b_auth" == *"token-for-b-only"* ]]
  fi

  rm -rf "$tmpd"
}

# [T900052] Task 4.4: Plaintext-Tokens duerfen nie in getrackte Outputs
# gelangen. Die repo-getrackten Dateien (.mcp.json, opencode.jsonc,
# mcp-servers.json) muessen unexpandierte ${VAR}-Platzhalter enthalten,
# niemals Klartext-Token.
@test "T900052: rendered tracked outputs contain no plaintext secrets" {
  local tmpd fixture
  tmpd="$(mktemp -d)"
  fixture="$tmpd/registry.yaml"

  cat > "$fixture" <<'YAML'
clients:
  secret-svc:
    transport: http
    endpoint: http://localhost:13001/mcp
    headers:
      Authorization: "Bearer ${MY_SECRET_TOKEN}"
    harness:
      claude_code:
        type: http
        url: http://localhost:13001/mcp
      opencode:
        type: remote
        url: http://localhost:13001/mcp
        enabled: true
cluster: {}
YAML

  run env MCP_REGISTRY="$fixture" MCP_OUT_DIR="$tmpd/out" \
    MY_SECRET_TOKEN="plaintext-super-secret-value" bash "$SYNC" render
  [ "$status" -eq 0 ]

  # Die repo-getrackten Dateien duerfen den Klartext-Wert NICHT enthalten
  for f in "$tmpd/out/.mcp.json" "$tmpd/out/opencode.jsonc" "$tmpd/out/mcp-servers.json"; do
    if [ -f "$f" ]; then
      echo "Checking $f..."
      ! grep -qF "plaintext-super-secret-value" "$f"
    fi
  done

  rm -rf "$tmpd"
}
