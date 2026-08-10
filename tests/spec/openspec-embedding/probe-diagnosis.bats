#!/usr/bin/env bats
# tests/spec/openspec-embedding/probe-diagnosis.bats
# SSOT: openspec/specs/openspec-embedding.md
#
# Pruefmodus: command output verification (T002448-M4). Der Test RUFT
# scripts/openspec-embed-local.sh auf und prueft dessen Ausgabe und Exit-Code —
# er greppt nicht den Quelltext des Probe-Codes.
#
# Hintergrund (T003177): Die Probe kollabierte jeden Fehlschlag auf einen
# HTTP-Code-String und meldete daraufhin pauschal "kein Embedding-Backend
# erreichbar (:18235)" — auch dann, wenn das Backend antwortete (nur eben nicht
# mit 200) und auch dann, wenn per LLM_EMBED_URL ein ganz anderer Endpunkt
# geprueft wurde. Eine Fehlermeldung mit falscher Ursache kostet beim Debuggen
# mehr als gar keine.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCRIPT="$REPO/scripts/openspec-embed-local.sh"
  # Kurze Probe-Zeit: der Test soll nicht 20s am Default haengen.
  export OPENSPEC_EMBED_PROBE_TIMEOUT=3
}

# Startet einen Wegwerf-HTTP-Server, der auf POST mit dem gewuenschten Status
# antwortet, und setzt SERVE_PORT auf den tatsaechlich gebundenen Port. Das ist
# der Kern des Tests: nur ein ANTWORTENDES Backend kann belegen, dass "nicht
# erreichbar" die falsche Diagnose war.
#
# Der Port wird vom Kernel vergeben (bind auf 0) und zurueckgemeldet, statt ihn
# im Test festzuschreiben: unter WSL2 sind ganze Portbereiche von Hyper-V
# reserviert und binden mit EADDRINUSE, ohne dass ein Lauscher existiert — ein
# fester Port faellt dort sporadisch aus, und zwar nur lokal, nie in CI.
_serve_status() {
  local status="$1" port_file
  port_file="$(mktemp)"
  python3 - "$status" "$port_file" <<'PY' &
import http.server, sys
status = int(sys.argv[1]); port_file = sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(status); self.end_headers(); self.wfile.write(b'x')
    def log_message(self, *a): pass
srv = http.server.HTTPServer(('127.0.0.1', 0), H)
with open(port_file, 'w') as fh:
    fh.write(str(srv.server_address[1]))
srv.serve_forever()
PY
  SERVER_PID=$!
  # Auf den gebundenen Port warten, statt blind zu schlafen.
  SERVE_PORT=""
  for _ in $(seq 1 50); do
    SERVE_PORT="$(cat "$port_file" 2>/dev/null)"
    [ -n "$SERVE_PORT" ] && break
    sleep 0.1
  done
  rm -f "$port_file"
  [ -n "$SERVE_PORT" ]
}

teardown() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  return 0
}

@test "T003177: ein antwortendes Backend wird NICHT als unerreichbar gemeldet" {
  _serve_status 500

  run env LLM_EMBED_URL="http://127.0.0.1:$SERVE_PORT" bash "$SCRIPT" __probe_only__
  [ "$status" -ne 0 ]

  # Positiv-Anker (T002356-M1): erst belegen, dass die Probe ueberhaupt
  # stattgefunden hat und den echten Status gesehen hat. Ohne ihn bestuende
  # die Negativ-Aussage unten vakuos, sobald das Skript vorher abbricht.
  echo "$output" | grep -qF '500'

  # Der eigentliche Befund: die Ursache darf nicht "nicht erreichbar" lauten,
  # wenn das Backend nachweislich geantwortet hat.
  ! echo "$output" | grep -qiF 'kein Embedding-Backend erreichbar'
}

@test "T003177: die Meldung nennt die tatsaechlich geprobte URL, nicht den Default-Port" {
  _serve_status 503

  run env LLM_EMBED_URL="http://127.0.0.1:$SERVE_PORT" bash "$SCRIPT" __probe_only__
  [ "$status" -ne 0 ]

  # Positiv-Anker: die geprobte URL steht in der Meldung.
  echo "$output" | grep -qF "127.0.0.1:$SERVE_PORT"
  # Negativ: der hartcodierte Default-Port darf nicht als Fundort auftauchen,
  # wenn gar nicht gegen ihn geprobt wurde.
  ! echo "$output" | grep -qF 'erreichbar (:18235)'
}

@test "T003177: ein toter Port wird weiterhin als Verbindungsfehler benannt" {
  # Gegenprobe: der echte Nicht-erreichbar-Fall muss weiterhin als solcher
  # erkannt werden — sonst waere der Fix nur eine Umbenennung.
  run env LLM_EMBED_URL='http://127.0.0.1:59973' bash "$SCRIPT" __probe_only__
  [ "$status" -ne 0 ]
  echo "$output" | grep -qiE 'curl 7|abgelehnt'
}
