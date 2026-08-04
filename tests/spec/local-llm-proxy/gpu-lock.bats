#!/usr/bin/env bats
# tests/spec/local-llm-proxy/gpu-lock.bats
# SSOT: openspec/changes/gpu-arbitrierung-trainings-vorrang/specs/local-llm-proxy.md
# Ticket: T002628
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): OUTPUT-basiert. Geprueft
# werden $status und der Dateizustand nach Aufruf von scripts/gpu-lock.sh.
# Kein grep auf den Quelltext des Skripts.
#
# Alle Tests nutzen GPU_LOCK_FILE auf eine Fixture-Datei im BATS-Tmpdir, damit
# sie ohne den echten Lock und ohne Rechte auf die echte Lock-Datei laufen.
# GPU_LOCK_NVIDIA_SMI wird fuer Tests, die den measure-Pfad triggern, auf einen
# Mock gesetzt.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GPU_LOCK="${REPO}/scripts/gpu-lock.sh"
  LOCK_FILE="${BATS_TEST_TMPDIR}/gpu-lock.json"
}

# ─── acquire: Lock-Datei schreiben ──────────────────────────────────────────

@test "acquire mit unreachable proxy raeumt Lock auf" {
  run env GPU_LOCK_FILE="$LOCK_FILE" \
         GPU_LOCK_NVIDIA_SMI="echo 16000" \
         GPU_LOCK_REQUIRED_MIB=100 \
         GPU_LOCK_PROXY_URL="http://127.0.0.1:19999" \
         bash "$GPU_LOCK" acquire --reason "Testlauf"

  # acquire mit Mock-nvidia-smi auf ungenutztem Port: der Proxy ist nicht
  # erreichbar, das Pollen schlaegt sofort fehl. Dadurch wird kein Stop-Step
  # ausgefuehrt, und der Lock wird mit exit 1 freigegeben. Wir pruefen nur die
  # Lock-Datei im Fehlerfall: sie darf nach Abbruch NICHT liegen bleiben.
  # (Das ist der Standard-Zustand ohne laufenden Proxy.)
  [ "$status" -ne 0 ]
  [ ! -f "$LOCK_FILE" ]
}

@test "acquire mit mock-proxy erzeugt gueltiges JSON-Lock" {
  # Verwende einen Mock-Endpoint, der /admin/state mit inflight=0 antwortet
  # und /admin/loadouts/*/stop akzeptiert.
  local mock_pid
  # Starte einen minimalen Mock-Server auf einem freien Port
  python3 -c "
import http.server, json, sys, os
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if '/admin/state' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'backends':[]}).encode())
        elif '/health' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'status':'ok'}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({'stopped':'test'}).encode())
    def log_message(self, *a): pass
s = http.server.HTTPServer(('127.0.0.1', 0), H)
print(s.server_address[1], flush=True)
sys.stdout.flush()
s.serve_forever()
" &>/dev/null &
  mock_pid=$!
  # Warte kurz, dann lies den Port aus der ersten Zeile
  sleep 0.3
  local mock_port
  # Der Mock schrieb den Port nach stdout — leider ist das mit &>/dev/null
  # nicht lesbar. Nutze einen festen Mechanismus: schreibe den Port in eine Datei.
  # Besser: restart mit Port-Datei.
  kill "$mock_pid" 2>/dev/null || true

  # Mock mit Port-Datei
  local MOCK_PORT_FILE="${BATS_TEST_TMPDIR}/mock-port.txt"
  python3 -c "
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if '/admin/state' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'backends':[]}).encode())
        elif '/health' in self.path:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps({'status':'ok'}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({'stopped':'test'}).encode())
    def log_message(self, *a): pass
s = http.server.HTTPServer(('127.0.0.1', 0), H)
with open('$MOCK_PORT_FILE', 'w') as f:
    f.write(str(s.server_address[1]))
s.serve_forever()
" &
  mock_pid=$!
  sleep 0.3
  mock_port=$(cat "$MOCK_PORT_FILE" 2>/dev/null || echo "")
  [ -n "$mock_port" ] || skip "Mock-Server konnte nicht gestartet werden"

  run env GPU_LOCK_FILE="$LOCK_FILE" \
         GPU_LOCK_NVIDIA_SMI="echo 16000" \
         GPU_LOCK_REQUIRED_MIB=100 \
         GPU_LOCK_PROXY_URL="http://127.0.0.1:${mock_port}" \
         bash "$GPU_LOCK" acquire --reason "Testlauf"

  kill "$mock_pid" 2>/dev/null || true

  echo "status=$status output=$output"
  [ "$status" -eq 0 ]
  [ -f "$LOCK_FILE" ]

  # Die Datei muss gueltiges JSON mit pid, started_at und reason sein
  local pid_field
  pid_field=$(python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('pid',''))")
  [ -n "$pid_field" ]
  # pid muss eine gueltige positive Ganzzahl sein (Subshell-PID != Test-PID)
  [ "$pid_field" -gt 0 ] 2>/dev/null || { echo "pid ist keine positive Zahl: $pid_field"; return 1; }

  local reason_field
  reason_field=$(python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('reason',''))")
  [ "$reason_field" = "Testlauf" ]

  local started_field
  started_field=$(python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('started_at',''))")
  [ -n "$started_field" ]
}

# ─── release: Lock entfernen ────────────────────────────────────────────────

@test "release entfernt die Lock-Datei" {
  # Lock manuell anlegen
  python3 -c "import json; json.dump({'pid':$$,'started_at':'2026-01-01T00:00:00Z','reason':'test'}, open('$LOCK_FILE','w'))"
  [ -f "$LOCK_FILE" ]

  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" release
  [ "$status" -eq 0 ]
  [ ! -f "$LOCK_FILE" ]
}

@test "release auf nicht existierender Lock-Datei ist unkritisch" {
  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" release
  [ "$status" -eq 0 ]
}

# ─── status: lock-status abfragen ───────────────────────────────────────────

@test "status meldet keinen Lock wenn Datei fehlt" {
  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" status
  [ "$status" -eq 0 ]
  [[ "$output" =~ frei|free|kein|no|not.held ]] \
    || { echo "erwartet: Hinweis dass kein Lock gehalten wird. output=$output"; return 1; }
}

@test "status meldet Lock wenn Datei existiert" {
  python3 -c "import json; json.dump({'pid':$$,'started_at':'2026-01-01T00:00:00Z','reason':'test'}, open('$LOCK_FILE','w'))"

  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" status
  echo "output=$output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ $$ ]] \
    || { echo "erwartet: PID $$ in der Ausgabe. output=$output"; return 1; }
}

# ─── tote PID ───────────────────────────────────────────────────────────────

@test "status behandelt Lock mit toter PID als abwesend" {
  # Schreibe einen Lock mit einer garantiert nicht existierenden PID
  python3 -c "import json; json.dump({'pid':99999,'started_at':'2026-01-01T00:00:00Z','reason':'dead'}, open('$LOCK_FILE','w'))"
  [ -f "$LOCK_FILE" ]

  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" status
  echo "output=$output"
  [ "$status" -eq 0 ]
  [[ "$output" =~ frei|free|kein|no|not.held|abwesend|absent|verworfen|discarded ]] \
    || { echo "erwartet: Hinweis dass Lock verworfen wurde. output=$output"; return 1; }
}

@test "status bereinigt Lock-Datei wenn PID tot" {
  python3 -c "import json; json.dump({'pid':99999,'started_at':'2026-01-01T00:00:00Z','reason':'dead'}, open('$LOCK_FILE','w'))"
  [ -f "$LOCK_FILE" ]

  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" status
  [ "$status" -eq 0 ]
  [ ! -f "$LOCK_FILE" ]
}

# ─── GPU_LOCK_FILE override ─────────────────────────────────────────────────

@test "GPU_LOCK_FILE setzt den Lock-Pfad um" {
  local custom="${BATS_TEST_TMPDIR}/custom-lock.json"
  python3 -c "import json; json.dump({'pid':$$,'started_at':'2026-01-01T00:00:00Z','reason':'custom'}, open('$custom','w'))"

  # status auf der Custom-Datei findet den Lock
  run env GPU_LOCK_FILE="$custom" bash "$GPU_LOCK" status
  [ "$status" -eq 0 ]
  [[ "$output" =~ $$ ]]

  # Der Default-Pfad ist unberuehrt
  [ ! -f "$LOCK_FILE" ]
}

# ─── usage / fehlendes Verb ─────────────────────────────────────────────────

@test "ohne Verb zeigt usage" {
  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK"
  [ "$status" -ne 0 ]
  [[ "$output" =~ acquire|release|status|usage|Verwendung ]] \
    || { echo "erwartet: usage-Hinweis. output=$output"; return 1; }
}

@test "unbekanntes Verb fuehrt zu Fehler" {
  run env GPU_LOCK_FILE="$LOCK_FILE" bash "$GPU_LOCK" bogus
  [ "$status" -ne 0 ]
}
