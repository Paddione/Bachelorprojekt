#!/usr/bin/env bats
# T013593 — scripts/brain-ingest-swap.sh: Loadout merken, wechseln, wiederherstellen.
#
# PRUEFMODUS: Output-Verifikation gegen einen Fake-Proxy. Der Wrapper spricht
# ausschliesslich ueber HTTP mit dem llm-proxy; ein Stub, der jeden Request
# protokolliert, macht das tatsaechliche Verhalten pruefbar — welche Loadouts
# gestoppt und gestartet wurden und in welcher Reihenfolge.
#
# KEIN TEST GEGEN DEN ECHTEN PROXY: in CI laeuft weder llm-proxy noch eine
# Ticket-DB. Ein Test gegen den laufenden Dienst wuerde dort skippen und damit
# die Ausstattung des Runners messen statt den Zustand des Codes (T002716).

setup() {
  command -v python3 >/dev/null 2>&1 || skip "python3 binary not installed"

  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SWAP_SH="${REPO_ROOT}/scripts/brain-ingest-swap.sh"
  LOG="${BATS_TEST_TMPDIR}/requests.log"
  PIN_FILE="${BATS_TEST_TMPDIR}/pin.json"
  : > "$LOG"

  cat > "${BATS_TEST_TMPDIR}/fake-proxy.py" << 'PYEOF'
import json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = os.environ["FAKE_LOG"]
RUNNING = os.environ.get("FAKE_RUNNING", "")      # Slug, der als laufend gilt ("" = keiner)
INFLIGHT = int(os.environ.get("FAKE_INFLIGHT", "0"))  # bleibt konstant -> Drain laeuft in den Deckel

def log(line):
    with open(LOG, "a") as fh:
        fh.write(line + "\n")

class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/admin/loadouts/status":
            log("GET status")
            extra = {}
            if os.environ.get("FAKE_QUOTED_LABEL"):
                # Ein Feld, das Anfuehrungszeichen und Backslash traegt. Wird die
                # Antwort in Quelltext interpoliert, zerlegt es den Interpreter.
                extra = {"label": "drei ''' und ein backslash \\\\"}
            return self._send(200, {"status": [
                {"slug": "gemma4", "port": 8090, "running": RUNNING == "gemma4", **extra},
                {"slug": "gemma12-vision", "port": 8089, "running": RUNNING == "gemma12-vision"},
                {"slug": "brain-ingest", "port": 8100, "running": RUNNING == "brain-ingest"},
            ]})
        if self.path == "/admin/state":
            if os.environ.get("FAKE_BAD_STATE"):
                body = b"kein json {{{"
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return self._send(200, {"backends": [
                {"name": "llamacpp-bonsai", "kind": "llamacpp", "inflight": INFLIGHT},
            ]})
        return self._send(404, {})

    def do_POST(self):
        parts = self.path.strip("/").split("/")
        # /admin/loadouts/<slug>/<start|stop>
        if len(parts) == 4 and parts[0] == "admin" and parts[1] == "loadouts":
            log(f"{parts[3]} {parts[2]}")
            return self._send(201 if parts[3] == "start" else 200, {"ok": True})
        return self._send(404, {})

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PYEOF

  # Ingest-Stub: protokolliert seinen Aufruf samt Ziel-URL und beendet sich mit
  # dem in FAKE_INGEST_RC verlangten Code.
  cat > "${BATS_TEST_TMPDIR}/ingest-stub.sh" << 'SHEOF'
#!/usr/bin/env bash
echo "ingest url=${LM_STUDIO_URL} model=${LM_MODEL} parallel=${MAX_PARALLEL}" >> "$FAKE_LOG"
exit "${FAKE_INGEST_RC:-0}"
SHEOF
  chmod +x "${BATS_TEST_TMPDIR}/ingest-stub.sh"
}

teardown() {
  [ -n "${PROXY_PID:-}" ] && kill "$PROXY_PID" 2>/dev/null
  return 0
}

# Startet den Fake-Proxy auf einem freien Port und wartet, bis er antwortet.
start_proxy() {
  PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  FAKE_LOG="$LOG" FAKE_RUNNING="${1:-}" FAKE_INFLIGHT="${2:-0}" \
  FAKE_BAD_STATE="${FAKE_BAD_STATE:-}" \
    python3 "${BATS_TEST_TMPDIR}/fake-proxy.py" "$PORT" &
  PROXY_PID=$!
  for _ in $(seq 1 50); do
    curl -sf "http://127.0.0.1:${PORT}/admin/state" >/dev/null 2>&1 && return 0
    sleep 0.1
  done
  return 1
}

run_swap() {
  FAKE_LOG="$LOG" FAKE_INGEST_RC="${FAKE_INGEST_RC:-0}" \
  SWAP_PROXY_URL="http://127.0.0.1:${PORT}" \
  GPU_PIN_FILE="$PIN_FILE" \
  SWAP_DRAIN_TIMEOUT="${SWAP_DRAIN_TIMEOUT:-3}" \
  SWAP_HEALTH_TIMEOUT=3 \
  BRAIN_INGEST_SH="${BATS_TEST_TMPDIR}/ingest-stub.sh" \
    run bash "$SWAP_SH"
}

@test "T013593: Fake-Proxy antwortet ueberhaupt (Anker fuer alle Aussagen unten)" {
  # POSITIV-ANKER: ohne ihn bestuenden die Aussagen unten vakuos, sobald der
  # Stub gar nicht startet — ein leeres Log enthaelt jede verbotene Zeile nicht.
  [ -f "$SWAP_SH" ]
  start_proxy "gemma4"
  run curl -sf "http://127.0.0.1:${PORT}/admin/loadouts/status"
  [ "$status" -eq 0 ]
  [[ "$output" == *"gemma4"* ]]
}

@test "T013593: laufendes Loadout wird gemerkt, getauscht und wiederhergestellt" {
  start_proxy "gemma4"
  run_swap
  [ "$status" -eq 0 ]

  # Reihenfolge ist die Aussage: erst das fremde Loadout stoppen, dann den
  # Ingest fahren, dann das gemerkte wieder starten.
  run cat "$LOG"
  [[ "$output" == *"stop gemma4"* ]]
  [[ "$output" == *"start brain-ingest"* ]]
  [[ "$output" == *"start gemma4"* ]]

  order="$(grep -nE '^(stop|start) ' "$LOG" | tr '\n' ' ')"
  [[ "$order" =~ stop\ gemma4.*start\ brain-ingest.*start\ gemma4 ]]
}

@test "T013593: der Ingest zielt auf Port 8100 mit drei Slots" {
  start_proxy "gemma4"
  run_swap
  [ "$status" -eq 0 ]
  run grep '^ingest ' "$LOG"
  [ "$status" -eq 0 ]
  [[ "$output" == *"url=http://127.0.0.1:8100"* ]]
  [[ "$output" == *"parallel=3"* ]]
}

@test "T013593: lief nichts, wird auch nichts wiederhergestellt" {
  start_proxy ""
  run_swap
  [ "$status" -eq 0 ]

  # brain-ingest wird gestartet und wieder gestoppt — aber kein drittes Loadout.
  run grep -c '^start ' "$LOG"
  [ "$output" -eq 1 ]
  run grep '^start ' "$LOG"
  [[ "$output" == *"brain-ingest"* ]]
}

@test "T013593: ein beschaeftigtes Loadout wird nicht verdraengt" {
  # inflight bleibt konstant bei 2 -> der Drain laeuft in seinen Deckel.
  start_proxy "gemma4" 2
  SWAP_DRAIN_TIMEOUT=2 run_swap
  [ "$status" -ne 0 ]

  # Die eigentliche Aussage: nichts gestoppt, nichts gestartet, kein Ingest.
  run grep -c -E '^(stop|start|ingest) ' "$LOG"
  [ "$output" -eq 0 ]

  # Und der Pin darf nicht liegen bleiben.
  [ ! -f "$PIN_FILE" ]
}

@test "T013593: ein fehlgeschlagener Ingest stellt trotzdem wieder her und meldet den Fehler" {
  start_proxy "gemma4"
  FAKE_INGEST_RC=7 run_swap
  [ "$status" -eq 7 ]

  run cat "$LOG"
  [[ "$output" == *"start gemma4"* ]]
  [ ! -f "$PIN_FILE" ]
}

@test "T013593: ein unlesbarer Proxy-Zustand bricht den Swap ab" {
  # Ein unbekannter Zustand ist kein "nichts in flight". Waere die Antwort als
  # 0 gelesen worden, haette der Swap ein womoeglich beschaeftigtes Loadout
  # verdraengt — der teuerste Fehler, den dieser Pfad machen kann.
  FAKE_BAD_STATE=1 start_proxy "gemma4"
  SWAP_DRAIN_TIMEOUT=5 run_swap
  [ "$status" -ne 0 ]

  run grep -c -E '^(stop|start|ingest) ' "$LOG"
  [ "$output" -eq 0 ]
  [ ! -f "$PIN_FILE" ]
}

@test "T013593: ein Abbruch waehrend des Ingests stellt wieder her" {
  start_proxy "gemma4"

  # Ingest-Stub, der lange genug laeuft, um ihn zuverlaessig zu unterbrechen.
  cat > "${BATS_TEST_TMPDIR}/ingest-stub.sh" << 'SHEOF'
#!/usr/bin/env bash
echo "ingest url=${LM_STUDIO_URL} model=${LM_MODEL} parallel=${MAX_PARALLEL}" >> "$FAKE_LOG"
sleep 30
SHEOF
  chmod +x "${BATS_TEST_TMPDIR}/ingest-stub.sh"

  FAKE_LOG="$LOG"   SWAP_PROXY_URL="http://127.0.0.1:${PORT}"   GPU_PIN_FILE="$PIN_FILE"   SWAP_DRAIN_TIMEOUT=3 SWAP_HEALTH_TIMEOUT=3   BRAIN_INGEST_SH="${BATS_TEST_TMPDIR}/ingest-stub.sh"     bash "$SWAP_SH" &
  swap_pid=$!

  # Warten, bis der Ingest wirklich laeuft — sonst misst der Test ein Rennen
  # statt das Verhalten.
  for _ in $(seq 1 100); do
    grep -q '^ingest ' "$LOG" && break
    sleep 0.1
  done
  grep -q '^ingest ' "$LOG"

  kill -TERM "$swap_pid"
  wait "$swap_pid" || true

  for _ in $(seq 1 100); do
    grep -q '^start gemma4' "$LOG" && break
    sleep 0.1
  done

  run cat "$LOG"
  [[ "$output" == *"start gemma4"* ]]
  [ ! -f "$PIN_FILE" ]
}

@test "T013593: eine Antwort mit Anfuehrungszeichen zerlegt den Wrapper nicht" {
  # Die Proxy-Antwort ist Netzwerk-Eingabe. Wird sie in Python-Quelltext
  # interpoliert statt ueber stdin gelesen, bricht sie den Interpreter mit
  # ihrem Inhalt — ein Slug-Name muss dafuer nicht einmal exotisch sein.
  FAKE_QUOTED_LABEL=1 start_proxy "gemma4"
  run_swap
  [ "$status" -eq 0 ]

  run cat "$LOG"
  [[ "$output" == *"stop gemma4"* ]]
  [[ "$output" == *"start gemma4"* ]]
}
