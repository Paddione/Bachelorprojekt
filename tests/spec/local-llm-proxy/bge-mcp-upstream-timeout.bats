#!/usr/bin/env bats
# Pruefmodus: command output verification [T002448-M4] — der Test startet den
# bge-MCP-Shim gegen einen Upstream, der die Verbindung annimmt und dann nie
# antwortet, und prueft die tatsaechliche JSON-RPC-Antwort. Kein Source-Grep:
# dass `AbortSignal` im Quelltext steht, belegt nicht, dass der Aufruf
# abbricht.
#
# Hintergrund (T002838): callUpstream rief `fetch` ohne Signal auf. Ein toter
# Endpoint warf sofort, ein ueberlasteter liess den Aufruf unbegrenzt haengen —
# am 2026-08-09 ueber 60s, waehrend /health des Endpoints weiter 200 lieferte.
# Der MCP-Client sah ein blockiertes Werkzeug statt einer Fehlermeldung.

setup() {
  REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  PORT_HANG=$((20000 + RANDOM % 1000))
  PORT_MCP=$((21000 + RANDOM % 1000))

  # Upstream, der annimmt und schweigt — genau der Fall, den ein reines
  # "unreachable" nicht abdeckt.
  node -e "
    require('http').createServer(() => {}).listen($PORT_HANG, '127.0.0.1');
  " &
  HANG_PID=$!

  BGE_MCP_TOKEN=testtoken \
  BGE_MCP_PORT="$PORT_MCP" \
  BGE_MCP_UPSTREAM_TIMEOUT_MS=800 \
  LLM_EMBED_URL="http://127.0.0.1:$PORT_HANG" \
  LLM_RERANKER_URL="http://127.0.0.1:$PORT_HANG" \
    node "$REPO/scripts/bge-mcp/server.mjs" >/dev/null 2>&1 &
  MCP_PID=$!

  # Warten per curl statt /dev/tcp: BATS belegt FD 3 selbst, ein `exec 3<>`
  # hier bricht den Testlauf mit "Bad file descriptor" ab.
  for _ in $(seq 1 30); do
    curl -s --max-time 1 -o /dev/null "http://127.0.0.1:$PORT_MCP/mcp" && break
    sleep 0.2
  done
}

teardown() {
  [ -n "${MCP_PID:-}" ] && kill "$MCP_PID" 2>/dev/null
  [ -n "${HANG_PID:-}" ] && kill "$HANG_PID" 2>/dev/null
  return 0
}

@test "bge_embed bricht bei schweigendem Upstream ab statt zu haengen (T002838)" {
  # Positiv-Anker zuerst [T002356-M1]: der Shim muss ueberhaupt antworten.
  # Ohne ihn koennte der Test auch bei einem gar nicht gestarteten Server
  # gruen wirken, sobald die Fehlerpruefung unten leer ausginge.
  run curl -s --max-time 10 -X POST "http://127.0.0.1:$PORT_MCP/mcp" \
    -H "Authorization: Bearer testtoken" \
    -H "Accept: application/json, text/event-stream" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bats","version":"1"}}}'
  [ "$status" -eq 0 ]
  [[ "$output" == *'"serverInfo"'* ]] || { echo "Shim antwortet nicht auf initialize: $output"; false; }

  # Der eigentliche Vorgang: der Aufruf MUSS innerhalb der curl-Frist
  # zurueckkehren. Vor dem Fix lief er in --max-time und $status waere 28.
  run curl -s --max-time 10 -X POST "http://127.0.0.1:$PORT_MCP/mcp" \
    -H "Authorization: Bearer testtoken" \
    -H "Accept: application/json, text/event-stream" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bge_embed","arguments":{"texts":["ping"]}}}'
  [ "$status" -eq 0 ] || { echo "curl lief in den Timeout (status=$status) — der Shim haengt weiterhin"; false; }
  [[ "$output" == *"did not answer within"* ]] || { echo "keine Timeout-Diagnose in der Antwort: $output"; false; }
}
