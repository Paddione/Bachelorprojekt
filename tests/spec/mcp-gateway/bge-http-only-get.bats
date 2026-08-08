#!/usr/bin/env bats
# tests/spec/mcp-gateway/bge-http-only-get.bats
# SSOT: openspec/changes/bge-mcp-http-only-get/proposal.md
# Ticket: T002703
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Jeder Test STARTET den echten Shim (scripts/bge-mcp/server.mjs) auf einem
# eigenen Port mit einem Wegwerf-Token und prueft die HTTP-Antwort — kein Grep
# gegen den Quelltext. Der laufende Systemdienst auf :13005 wird bewusst NICHT
# benutzt: der Test muss auch in CI laufen, wo kein bge-mcp aktiv ist.
#
# Warum GET ueberhaupt geprueft wird: der Shim beantwortet jede JSON-RPC-Anfrage
# im POST-Body. Ein SSE-Kanal, in den er nie schreibt, laesst einen Client
# warten statt schnell zu scheitern — genau daran scheiterte agy (T002703).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SERVER="$REPO/scripts/bge-mcp/server.mjs"
  TOKEN="bats-throwaway-token-T002703"

  command -v node >/dev/null 2>&1 || skip "node nicht verfuegbar"
  command -v curl >/dev/null 2>&1 || skip "curl nicht verfuegbar"

  # Freien Port suchen statt einen festen zu belegen — parallele BATS-Laeufe
  # und der echte Dienst auf :13005 duerfen sich nicht ins Gehege kommen.
  PORT=""
  for candidate in $(seq 19620 19640); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      PORT="$candidate"
      break
    fi
    exec 3<&- 2>/dev/null || true
  done
  [ -n "$PORT" ] || skip "kein freier Port im Bereich 19620-19640"

  BGE_MCP_TOKEN="$TOKEN" BGE_MCP_HOST=127.0.0.1 BGE_MCP_PORT="$PORT" \
    node "$SERVER" >/dev/null 2>&1 &
  SERVER_PID=$!

  # Auf den Listener warten statt fest zu schlafen.
  local up=""
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 1 -X POST \
         -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
         -d '{}' "http://127.0.0.1:${PORT}/mcp" 2>/dev/null; then
      up=yes
      break
    fi
    sleep 0.1
  done
  [ -n "$up" ] || {
    kill "$SERVER_PID" 2>/dev/null || true
    skip "Shim kam auf Port $PORT nicht hoch"
  }
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

@test "GET /mcp is rejected with 405 instead of opening a silent SSE channel" {
  # Positiv-Anker zuerst (T002356-M1): steht der Shim ueberhaupt und antwortet
  # er auf dem regulaeren Pfad? Ohne diesen Anker waere die Negativ-Aussage
  # unten auch dann erfuellt, wenn gar nichts liefe.
  run curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bats","version":"0"}}}' \
    "http://127.0.0.1:${PORT}/mcp"
  echo "POST-Status: $output"
  [ "$output" = "200" ]

  # Die eigentliche Aussage: GET liefert 405 und keinen Event-Stream.
  # --max-time deckt zugleich den Regressionsfall ab — ein offen gehaltener
  # Kanal liefe hier in den Timeout statt in eine Antwort.
  run curl -s -i --max-time 5 -X GET \
    -H "Authorization: Bearer $TOKEN" -H 'Accept: text/event-stream' \
    "http://127.0.0.1:${PORT}/mcp"
  echo "GET-Antwort: $output"
  [[ "$output" == *"405"* ]]
  [[ "$output" != *"text/event-stream"* ]]
}

@test "POST /mcp still answers in the response body" {
  run curl -s --max-time 5 -X POST \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":7,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"bats","version":"0"}}}' \
    "http://127.0.0.1:${PORT}/mcp"
  echo "Body: $output"
  [ "$status" -eq 0 ]
  # Positives Signal statt Abwesenheit eines Fehlers: die Antwort muss die
  # angefragte id und ein result tragen.
  echo "$output" | jq -e '.id == 7 and (.result | has("serverInfo"))' >/dev/null
}

@test "GET without Authorization stays a 401, not a 405" {
  run curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X GET \
    "http://127.0.0.1:${PORT}/mcp"
  echo "Status: $output"
  [ "$output" = "401" ]
}
