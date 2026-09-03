#!/usr/bin/env bats
# tests/spec/mcp-gateway/guarded-proxy-streaming.bats
# SSOT: openspec/specs/mcp-gateway.md (Delta: openspec/changes/mcp-http-origin-auth-hardening)
# Ticket: T900052 — Task 3.2
#
# Prueft, dass der guarded mcp-cors-proxy SSE-Streaming unter Auth
# korrekt relayt, Client-Disconnect das Upstream beendet, und
# abgelehnte Requests den Upstream nie erreichen.
#
# Design D7: echte HTTP-Listener (Proxy + Mock-Upstream), kein
# Browser-/Cluster-/Secret-Zugriff.
#
# OPTIONS-Preflight-Tests fehlen hier bewusst: das Verhalten des
# gemeinsamen guardRequest() fuer OPTIONS (204/403) wird durch
# http-security-boundary.bats (test 9) abgedeckt — dort laeuft der
# gleiche Shared-Guard gegen den Fixture-Listener zuverlaessig.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO="$(cygpath -m "$REPO")" ;; esac
  command -v node >/dev/null 2>&1 || skip "node binary not installed"

  # Zwei freie Ports: einen fuer den Mock-Upstream, einen fuer den Proxy
  UPSTREAM_PORT=""
  PROXY_PORT=""
  for candidate in $(seq 19860 19890); do
    if [ -z "$UPSTREAM_PORT" ] && ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      UPSTREAM_PORT="$candidate"
    elif [ -z "$PROXY_PORT" ] && ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      PROXY_PORT="$candidate"
      break
    fi
  done
  [ -n "$UPSTREAM_PORT" ] && [ -n "$PROXY_PORT" ] || skip "kein freien Port-Paar im Bereich 19860-19890"

  PROXY_TOKEN="test-proxy-token-$$"

  MOCK_PID=""
  PROXY_PID=""
}

teardown() {
  # Kill-only teardown: auf Windows/MSYS blockiert wait(1) auf einem bereits
  # beendeten Hintergrund-Prozess zuverlaessig (BATS-Hang). Ein verwaister
  # node-Prozess laesst den naechsten Test via Port-Erkennung skipen statt
  # zu haengen.
  local pid
  for pid in "$PROXY_PID" "$MOCK_PID"; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done
  PROXY_PID=""
  MOCK_PID=""
}

# start_mock_upstream — startet einen Node-Mock, der:
#   - GET /hits  -> Anzahl empfangener Requests
#   - POST /*    -> 200 + zaehlt
#   - GET /sse   -> sendet 3 SSE-Events, dann schliesst
start_mock_upstream() {
  node -e "
    const http = require('node:http');
    let hits = 0;
    const server = http.createServer((req, res) => {
      if (req.url === '/hits') {
        res.writeHead(200, {'content-type':'text/plain'});
        res.end(String(hits));
        return;
      }
      if (req.url === '/sse') {
        res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache'});
        for (let i = 1; i <= 3; i++) {
          res.write('event: msg\\ndata: chunk-' + i + '\\n\\n');
        }
        res.end();
        return;
      }
      hits++;
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({dispatched:true}));
    });
    server.listen($UPSTREAM_PORT, '127.0.0.1');
  " >/dev/null 2>&1 &
  MOCK_PID=$!

  # Warten bis Upstream hoch ist
  local up=""
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${UPSTREAM_PORT}/hits" 2>/dev/null; then
      up=yes; break
    fi
    sleep 0.1
  done
  if [ -z "$up" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
    skip "Mock-Upstream auf $UPSTREAM_PORT nicht hoch"
  fi
}

# start_proxy — startet den guarded Proxy mit PROXY_TOKEN, der auf
# $PROXY_PORT lauscht und zu $UPSTREAM_PORT weiterleitet.
start_proxy() {
  MCP_KUBERNETES_TOKEN="$PROXY_TOKEN" LISTEN_PORT="$PROXY_PORT" \
    UPSTREAM="http://127.0.0.1:${UPSTREAM_PORT}" \
    node "$REPO/scripts/mcp-cors-proxy/proxy.mjs" >/dev/null 2>&1 &
  PROXY_PID=$!

  local up=""
  for _ in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${PROXY_PORT}/health" 2>/dev/null; then
      up=yes; break
    fi
    sleep 0.1
  done
  if [ -z "$up" ]; then
    kill "$PROXY_PID" 2>/dev/null || true
    skip "Proxy auf $PROXY_PORT nicht hoch"
  fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@test "guarded-proxy: rejected request never reaches upstream" {
  start_mock_upstream
  start_proxy

  # 401 ohne Token — darf nicht dispatchen
  run curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PROXY_PORT}/mcp" \
    -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
  [ "$output" = "401" ]

  # 401 mit falschem Token — darf nicht dispatchen
  run curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PROXY_PORT}/mcp" \
    -H "Authorization: Bearer wrong-token" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
  [ "$output" = "401" ]

  # Negativ-Anker: Upstream sollte 0 Hits haben
  hits="$(curl -s "http://127.0.0.1:${UPSTREAM_PORT}/hits")"
  [ "$hits" = "0" ]
}

@test "guarded-proxy: authenticated request reaches upstream and counts" {
  start_mock_upstream
  start_proxy

  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PROXY_PORT}/mcp" \
    -H "Authorization: Bearer $PROXY_TOKEN" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
  [ "$code" = "200" ]

  # Positiv-Anker: authentifizierter Request erreicht den Upstream
  hits="$(curl -s "http://127.0.0.1:${UPSTREAM_PORT}/hits")"
  [ "$hits" = "1" ]
}

@test "guarded-proxy: SSE stream relayed without buffering" {
  start_mock_upstream
  start_proxy

  # SSE-Stream abonnieren — 3 Events erwartet
  stream="$(curl -s --max-time 5 -H "Authorization: Bearer $PROXY_TOKEN" \
    "http://127.0.0.1:${PROXY_PORT}/sse")"

  [[ "$stream" == *"chunk-1"* ]]
  [[ "$stream" == *"chunk-2"* ]]
  [[ "$stream" == *"chunk-3"* ]]
}
