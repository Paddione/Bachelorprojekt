#!/usr/bin/env bats
# T002641: scripts/plan-qa-check.sh prüfte die Erreichbarkeit des llm-proxy mit
# `curl -sf .../health`. /health ist READINESS, nicht Liveness — der Proxy antwortet
# dort 503, sobald ein Prio-1-Backend fehlt. Mit -f sah das aus wie "niemand da",
# und die advisory Plan-QA übersprang sich selbst mit "Gateway not reachable".
# Gemessen am 2026-08-09: /livez 200, /health 503, /v1/models 200 — der Dienst lief.
#
# Dieselbe Verwechslung wurde in taskfiles/Taskfile.llm.yml unter T002336 bereits
# korrigiert ("livez, NICHT health — Port-Belegung, nicht Bedienbarkeit").
#
# Prüfmodus: command output verification [T002448-M4] — das Skript wird AUSGEFÜHRT
# und seine Ausgabe geprüft; kein grep auf die Implementierungsquelle.
#
# Die Tests warten per Polling auf den Fake-Gateway statt mit festem `sleep`
# (vgl. T002850: fixe sleeps auf Test-HTTPServer sind eine bekannte Flake-Quelle).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  QA="$REPO/scripts/plan-qa-check.sh"
  TMP="$BATS_TEST_TMPDIR"
  PLAN="$TMP/plan.md"
  GW_PID=""
  mkplan "$PLAN"
}

teardown() {
  if [[ -n "${GW_PID:-}" ]]; then
    kill "$GW_PID" 2>/dev/null || true
    wait "$GW_PID" 2>/dev/null || true
  fi
}

# Ein Plan mit Frontmatter und mindestens 10 Zeilen — beides prüft das Skript
# vor der Gateway-Probe und bricht sonst mit exit 1 ab.
mkplan() {
  cat > "$1" <<'PLANEOF'
---
title: "Fixture — Implementation Plan"
ticket_id: T002641
domains: [test]
status: active
---

# Fixture Implementation Plan

## File Structure

- Modify: `scripts/example.sh`

## Task 1: Beispiel

Ein Schritt, damit der Plan die Mindestlänge erreicht.
PLANEOF
}

# free_port — einen freien Port vom Kernel zuweisen lassen.
# Kein fester Port: unter WSL2 sind Bereiche wie 49152-49251 von Hyper-V
# reserviert und liefern EADDRINUSE ohne sichtbaren Lauscher.
free_port() {
  python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
}

# start_fake_gateway <port> <post_status> — Gateway mit lebendigem /livez (200)
# und degradierter Readiness /health (503). Der POST auf /v1/chat/completions
# antwortet mit <post_status>.
start_fake_gateway() {
  local port="$1" post_status="$2"
  python3 - "$port" "$post_status" <<'PYEOF' &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1])
POST_STATUS = int(sys.argv[2])

class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/livez":
            self._send(200, '{"alive":true}')
        elif self.path == "/health":
            self._send(503, '{"status":"degraded","ready":false}')
        else:
            self._send(404, '{"error":"not found"}')

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        self.rfile.read(length)
        if POST_STATUS == 409:
            self._send(409, '{"error":{"code":"exclusive_conflict","message":"teilt exclusiveGroup"}}')
        else:
            self._send(POST_STATUS, '{"error":"stub"}')

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", PORT), H).serve_forever()
PYEOF
  GW_PID=$!
  local i
  for ((i = 0; i < 100; i++)); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${port}/livez"; then
      return 0
    fi
    sleep 0.1
  done
  echo "Fake-Gateway auf Port ${port} wurde nicht bereit"
  return 1
}

@test "T002641: lebender Proxy mit degradierter Readiness gilt nicht als unerreichbar" {
  local port; port="$(free_port)"
  start_fake_gateway "$port" 500

  # Positiv-Anker ZUERST: der Fake-Gateway verhält sich wirklich wie beschrieben.
  # Ohne ihn bestünde die Negativ-Aussage unten auch dann, wenn gar nichts läuft.
  local livez health
  livez="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${port}/livez")"
  health="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${port}/health")"
  [ "$livez" = "200" ] || { echo "Anker verletzt: /livez lieferte $livez statt 200"; return 1; }
  [ "$health" = "503" ] || { echo "Anker verletzt: /health lieferte $health statt 503"; return 1; }

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  echo "$output" | grep -q 'not reachable' \
    && { echo "REGRESSION: lebender Proxy als 'not reachable' gemeldet"; echo "$output"; return 1; }
  return 0
}

@test "T002641: gestoppter Proxy gilt weiterhin als unerreichbar und bricht nicht" {
  local port; port="$(free_port)"
  # Bewusst KEIN Server auf diesem Port.

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  [ "$status" -eq 0 ] || { echo "advisory QA muss exit 0 liefern, war $status"; echo "$output"; return 1; }
  echo "$output" | grep -q 'not reachable' \
    || { echo "MISSING: fehlender Gateway wurde nicht als 'not reachable' gemeldet"; echo "$output"; return 1; }
}

@test "T002641: blockiertes Modell wird als HTTP-Status gemeldet, nicht als Unerreichbarkeit" {
  local port; port="$(free_port)"
  start_fake_gateway "$port" 409

  GATEWAY_BASE_URL="http://127.0.0.1:${port}" run bash "$QA" "$PLAN"

  echo "$output" | grep -q '409' \
    || { echo "MISSING: der 409 des Gateways taucht in der Diagnose nicht auf"; echo "$output"; return 1; }
  echo "$output" | grep -q 'not reachable' \
    && { echo "REGRESSION: 409 wurde als 'not reachable' gemeldet"; echo "$output"; return 1; }
  return 0
}
