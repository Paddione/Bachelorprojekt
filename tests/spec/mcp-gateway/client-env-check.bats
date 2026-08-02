#!/usr/bin/env bats
# tests/spec/mcp-gateway/client-env-check.bats
# SSOT: openspec/changes/bge-mcp-client-env-check/proposal.md
# Ticket: T002504
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Jeder Test FUEHRT scripts/bge-mcp/check-client-env.sh AUS (mit einem
# Fake-Env im tmpdir und einem lokalen Fake-HTTP-Server) und prueft
# $status/$output — kein Grep gegen den Skriptquelltext. Kein Test greift
# auf die echte ~/.config/bge-mcp/server.env zu (BGE_MCP_CLIENT_ENV_FILE
# overridet den Pfad).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CHECK="$REPO/scripts/bge-mcp/check-client-env.sh"
  TMPD="$(mktemp -d)"
  FAKE_SERVER="$TMPD/fake_server.py"

  command -v python3 >/dev/null 2>&1 || skip "python3 nicht verfuegbar"

  cat > "$FAKE_SERVER" <<'PYEOF'
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

port = int(sys.argv[1])
expected_token = sys.argv[2]

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.rfile.read(length)
        auth = self.headers.get('Authorization', '')
        if auth == 'Bearer ' + expected_token:
            self.send_response(200)
        else:
            self.send_response(401)
            self.send_header('www-authenticate', 'Bearer')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}')

    def log_message(self, fmt, *args):
        pass

HTTPServer(('127.0.0.1', port), Handler).serve_forever()
PYEOF
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPD"
}

start_fake_server() {
  local port="$1" token="$2"
  python3 "$FAKE_SERVER" "$port" "$token" &
  SERVER_PID=$!
  # Auf den Listener warten statt fest zu schlafen.
  for _ in $(seq 1 50); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${port}/mcp" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
}

@test "exit 0 and no leaked token value when server.env has a valid BGE_MCP_TOKEN and server accepts it" {
  local port=19501
  local token="s3cr3t-test-token-do-not-leak"
  start_fake_server "$port" "$token"

  echo "BGE_MCP_TOKEN=$token" > "$TMPD/server.env"

  run env -u BGE_MCP_TOKEN BGE_MCP_CLIENT_ENV_FILE="$TMPD/server.env" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT="$port" \
      bash "$CHECK"

  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
  # Positiv-Anker: die OK-Meldung muss auftauchen, bevor der Negativ-Check
  # unten (Token nicht im Output) etwas bedeuten kann.
  [[ "$output" == *"BGE_MCP_TOKEN ist in"* ]]

  # Der Token-WERT darf an keiner Stelle im Output erscheinen.
  [[ "$output" != *"$token"* ]]
}

@test "exit 1 when server.env is missing (token unset), with fix hint in output" {
  run env -u BGE_MCP_TOKEN BGE_MCP_CLIENT_ENV_FILE="$TMPD/does-not-exist.env" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT=19502 \
      bash "$CHECK"

  echo "output: $output"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Fix:"* ]]
}

@test "exit 1 when server.env exists but BGE_MCP_TOKEN is not set" {
  echo "SOME_OTHER_VAR=irrelevant" > "$TMPD/no-token.env"

  run env -u BGE_MCP_TOKEN BGE_MCP_CLIENT_ENV_FILE="$TMPD/no-token.env" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT=19503 \
      bash "$CHECK"

  echo "output: $output"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Fix:"* ]]
}

@test "exit 2 when the bge-mcp server is not reachable" {
  echo "BGE_MCP_TOKEN=irrelevant-because-server-is-down" > "$TMPD/server.env"

  # Port 19504 hat keinen Listener (Fake-Server wird hier bewusst NICHT gestartet).
  run env -u BGE_MCP_TOKEN BGE_MCP_CLIENT_ENV_FILE="$TMPD/server.env" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT=19504 \
      bash "$CHECK"

  echo "output: $output"
  [ "$status" -eq 2 ]
  [[ "$output" == *"nicht erreichbar"* ]]
}

@test "exit 1 when token in server.env does not match the server's token" {
  local port=19505
  start_fake_server "$port" "correct-token"

  echo "BGE_MCP_TOKEN=wrong-token" > "$TMPD/server.env"

  run env -u BGE_MCP_TOKEN BGE_MCP_CLIENT_ENV_FILE="$TMPD/server.env" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT="$port" \
      bash "$CHECK"

  echo "output: $output"
  [ "$status" -eq 1 ]
  [[ "$output" == *"HTTP 401"* ]]
}
