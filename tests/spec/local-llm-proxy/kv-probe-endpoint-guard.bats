#!/usr/bin/env bats
# =============================================================================
# T002579 — Guards fuer die Langkontext-Probe aus T002535.
#
# HINTERGRUND: tests/spec/local-llm-proxy/gemma-kv-quant.bats richtete seine
# Probe an localhost:8081 — den Port des am 2026-07-27 DECOMMISSIONIERTEN
# TEI-Embed-Dienstes. gemma26-factory laeuft auf dem Port, den loadouts.json
# deklariert (8091). Der Skip-Guard griff deshalb IMMER, der Test hat nie
# gemessen, und T002535 wurde trotzdem auf done gesetzt.
#
# PRUEFMODUS (Konvention T002448-M4 verlangt die Angabe):
#   - Test 1 und 2: Quelltext-Vergleich. Beide pruefen eine KONSISTENZ ZWISCHEN
#     ZWEI DATEIEN (Konfiguration vs. Testdatei) bzw. das Vorhandensein eines
#     Ankers. Das manifestiert sich ausschliesslich im Quelltext — die
#     dokumentierte Ausnahme fuer Querschnittstests.
#   - Test 3: command output verification. Die Endpunkt-Pruefung wird
#     AUSGEFUEHRT, gegen echte HTTP-Server mit definiertem Status, und ihr
#     Rueckgabewert geprueft. Kein Grep auf die Implementierung.
# =============================================================================

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
PROBE_FILE="$REPO_ROOT/tests/spec/local-llm-proxy/gemma-kv-quant.bats"
LOADOUTS="$REPO_ROOT/scripts/llm/loadouts.json"
HELPER="$REPO_ROOT/tests/spec/local-llm-proxy/helpers/llm-endpoint.bash"

@test "T002579: die Langkontext-Probe zielt auf den Port, den das Loadout deklariert" {
  # Positiv-Anker: ohne ein gemma26-factory-Loadout MIT Port waere die
  # Portaussage unten gegenstandslos und der Test liefe vakuos durch.
  local declared
  declared=$(python3 -c "
import json
d=json.load(open('$LOADOUTS'))
lo=[x for x in d['loadouts'] if x['slug']=='gemma26-factory']
print(lo[0]['port'] if lo else '')
")
  [ -n "$declared" ] || { echo "ANKER ROT: kein gemma26-factory-Loadout mit Port"; return 1; }
  echo "Loadout deklariert Port: $declared"

  [ -f "$PROBE_FILE" ] || { echo "ANKER ROT: $PROBE_FILE fehlt"; return 1; }

  # Die Probe muss den Port entweder aus der Registry BEZIEHEN (bevorzugt —
  # eine kuenftige Portaenderung zieht dann automatisch mit) oder ihn wenigstens
  # korrekt nennen. Beides erfuellt das Ziel; nur ein davon abweichender
  # hartkodierter Port ist der Defekt.
  local from_registry=0 literal=0
  grep -qF 'loadouts.json' "$PROBE_FILE" && from_registry=1
  grep -qF ":${declared}" "$PROBE_FILE" && literal=1
  [ "$from_registry" -eq 1 ] || [ "$literal" -eq 1 ] || {
    echo "Probe bezieht Port weder aus loadouts.json noch nennt sie $declared."; return 1; }

  # Der tote TEI-Port 8081 darf in keiner WIRKSAMEN Zeile mehr stehen.
  # Kommentarzeilen sind ausgenommen — der historische Hinweis, dass die Probe
  # frueher dorthin zeigte, ist der Grund, warum dieser Guard existiert, und
  # soll erhalten bleiben. (Gleiche Konvention wie beim S3-Gate gegen
  # hartkodierte Hostnamen.)
  run bash -c "grep -n ':8081' '$PROBE_FILE' | grep -v '^[0-9]*: *#' || true"
  [ -z "$output" ] || {
    echo "Probe zeigt in wirksamem Code noch auf den toten Port 8081:"; echo "$output"; return 1; }
}

@test "T002579: die Langkontext-Probe belegt ihre Kontextgroesse am Server" {
  # Positiv-Anker: der Probe-Test muss ueberhaupt existieren, sonst prueft
  # die Forderung unten eine leere Menge.
  run grep -c 'T002535' "$PROBE_FILE"
  [ "$output" -gt 0 ] || { echo "ANKER ROT: kein T002535-Probe-Test vorhanden"; return 1; }

  # Ohne Beleg der tatsaechlichen Prompt-Groesse meldet die Probe auch dann
  # Erfolg, wenn der Fuellkontext gar nicht griff. Genau das ist am 2026-08-02
  # zweimal real passiert: 19788 statt ~35000 Tokens (Fuellertext zu kurz) und
  # 0 Tokens (jq scheiterte an ARG_MAX, der Server bekam nichts).
  run grep -c 'prompt_tokens' "$PROBE_FILE"
  [ "$output" -gt 0 ] || {
    echo "Probe prueft prompt_tokens nicht — Langkontext ist unbelegt."; return 1; }
}

@test "T002579: die Endpunkt-Pruefung erkennt HTTP 500 als NICHT verfuegbar" {
  # T002574: 'curl -s URL >/dev/null' liefert Exit 0 auch bei HTTP 500. Ein
  # Skip-Guard darauf haelt einen kaputten Server fuer einen gesunden und
  # laesst die Probe gegen ihn weiterlaufen.
  #
  # command output verification: die Hilfsfunktion wird gegen zwei echte
  # Server ausgefuehrt und ihr Rueckgabewert bewertet.
  [ -f "$HELPER" ] || { echo "Hilfsfunktion fehlt: $HELPER"; return 1; }
  # shellcheck disable=SC1090
  source "$HELPER"

  local port_ok=19551 port_500=19552
  python3 -c "
import http.server,threading
class OK(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(200); s.end_headers(); s.wfile.write(b'{\"status\":\"ok\"}')
    def log_message(*a): pass
class Err(http.server.BaseHTTPRequestHandler):
    def do_GET(s): s.send_response(500); s.end_headers(); s.wfile.write(b'boom')
    def log_message(*a): pass
for cls,p in ((OK,$port_ok),(Err,$port_500)):
    srv=http.server.HTTPServer(('127.0.0.1',p),cls)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
import time; time.sleep(20)
" &
  local pypid=$!

  # Aktives Port-Polling statt festem 'sleep 1' (T002850): unter CPU-Kontention
  # (parallele bats -j-Shards) reicht eine feste Wartezeit nicht immer bis zum
  # bind() beider Server. Poll in kurzen Schritten mit klarer Obergrenze.
  local attempt=0 max_attempts=50
  until (exec 3<>"/dev/tcp/127.0.0.1/$port_ok") 2>/dev/null \
     && (exec 3<>"/dev/tcp/127.0.0.1/$port_500") 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      kill "$pypid" 2>/dev/null || true
      echo "TIMEOUT: Ports $port_ok/$port_500 banden nicht innerhalb von $((max_attempts / 10))s"
      return 1
    fi
    sleep 0.1
  done

  # Positiv-Anker ZUERST: der gesunde Server MUSS als verfuegbar gelten.
  # Faellt der durch, sagt das Negativ-Ergebnis unten nichts aus.
  run llm_endpoint_healthy "http://127.0.0.1:${port_ok}/health"
  local ok_status=$status
  run llm_endpoint_healthy "http://127.0.0.1:${port_500}/health"
  local err_status=$status
  kill "$pypid" 2>/dev/null || true

  [ "$ok_status" -eq 0 ] || { echo "ANKER ROT: HTTP 200 wurde als nicht verfuegbar gewertet"; return 1; }
  [ "$err_status" -ne 0 ] || { echo "HTTP 500 wurde faelschlich als verfuegbar gewertet"; return 1; }
}
