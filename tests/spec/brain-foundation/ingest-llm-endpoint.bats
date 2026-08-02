#!/usr/bin/env bats
# tests/spec/brain-foundation/ingest-llm-endpoint.bats
# Ticket: T002533 — brain-ingest gegen beliebige OpenAI-kompatible Anbieter
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Jeder Test
# FUEHRT scripts/brain-ingest-transform.sh aus und misst $status/$output. Wo ein
# Gegenueber noetig ist, laeuft ein echter HTTP-Stub (python3 http.server) auf
# einem freien Port — geprueft wird also der tatsaechliche Request/Response-Weg,
# nicht der Quelltext des Skripts.

TRANSFORM="$BATS_TEST_DIRNAME/../../../scripts/brain-ingest-transform.sh"

setup() {
  STUB_DIR="$BATS_TEST_TMPDIR/stub"
  mkdir -p "$STUB_DIR"
  SRC="$BATS_TEST_TMPDIR/quelle.md"
  printf '# Titel\n\nEin Absatz.\n' > "$SRC"
  # Gueltige Stub-Antwort: das Skript validiert Frontmatter, eine source::-Zeile
  # und mindestens einen Wikilink und wiederholt sonst einmal. Eine unvollstaendige
  # Antwort wuerde hier also zwei Requests ausloesen und die Header-Zaehlung
  # verfaelschen.
  VALID_PAGE='{"choices":[{"message":{"content":"---\ntype: note\nstatus: active\n---\n\n# X\n\nsource:: Bachelorprojekt quelle.md\n\nSiehe [[andere-seite]].\n"},"finish_reason":"stop"}]}'
}

teardown() {
  # Erst freigeben, dann toeten: schlaegt eine Assertion zwischen ANKER 1 und
  # dem regulaeren `touch release` fehl, haengt sonst ein Stub-Handler bis zu
  # seinem eigenen 60s-Timeout im offenen Request. [T002537]
  [ -n "${GATE:-}" ] && touch "$GATE/release" 2>/dev/null
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  return 0
}

# Startet einen HTTP-Stub, der $1 als Antwortkoerper liefert, jeden eingehenden
# Request-Header nach $STUB_DIR/headers.txt und jeden Request-BODY nach
# $STUB_DIR/headers.txt.body schreibt.
# Setzt STUB_PID und STUB_URL.
#
# Der Port wird ueber eine DATEI zurueckgegeben, nicht ueber einen freien
# Dateideskriptor: BATS belegt FD 3 fuer seine eigene Ausgabe, und ein
# `exec 3< <(...)` laesst den Testlauf blockieren statt zu scheitern.
start_stub() {
  local body="$1"
  local gate_dir="${2:-}"
  cat > "$STUB_DIR/server.py" <<PYEOF
import http.server, socketserver, sys, json, os, time
BODY = open(sys.argv[1], 'rb').read()
GATE = sys.argv[4] if len(sys.argv) > 4 else None
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        with open(sys.argv[2], 'a') as f:
            for k, v in self.headers.items():
                f.write(f"{k}: {v}\n")
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(sys.argv[2] + '.body', 'ab') as f:
            f.write(body + b"\n")
        if GATE:
            with open(os.path.join(GATE, 'arrived'), 'w') as f:
                f.write('ok\n')
            deadline = time.time() + 60
            while time.time() < deadline:
                if os.path.exists(os.path.join(GATE, 'release')):
                    break
                time.sleep(0.1)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)
    def log_message(self, *a):
        pass
with socketserver.TCPServer(('127.0.0.1', 0), H) as s:
    with open(sys.argv[3], 'w') as f:
        f.write(str(s.server_address[1]))
    s.serve_forever()
PYEOF
  printf '%s' "$body" > "$STUB_DIR/body.json"
  : > "$STUB_DIR/headers.txt"
  : > "$STUB_DIR/headers.txt.body"
  rm -f "$STUB_DIR/port"
  if [ -n "$gate_dir" ]; then
    python3 "$STUB_DIR/server.py" "$STUB_DIR/body.json" "$STUB_DIR/headers.txt" "$STUB_DIR/port" "$gate_dir" &
  else
    python3 "$STUB_DIR/server.py" "$STUB_DIR/body.json" "$STUB_DIR/headers.txt" "$STUB_DIR/port" &
  fi
  STUB_PID=$!
  local i
  for i in $(seq 1 50); do
    [ -s "$STUB_DIR/port" ] && break
    sleep 0.1
  done
  [ -s "$STUB_DIR/port" ] || { echo "Stub-Server nicht gestartet" >&2; return 1; }
  STUB_URL="http://127.0.0.1:$(cat "$STUB_DIR/port")"
}

@test "T002533 transform verlangt LM_STUDIO_URL statt still auf einen toten Pool zu zeigen" {
  run env -u LM_STUDIO_URL -u LM_MODEL bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -ne 0 ]
  [[ "$output" == *"LM_STUDIO_URL"* ]]
}

@test "T002533 transform verlangt LM_MODEL" {
  run env -u LM_MODEL LM_STUDIO_URL=http://127.0.0.1:1 bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -ne 0 ]
  [[ "$output" == *"LM_MODEL"* ]]
}

@test "T002533 LM_API_KEY wird als Authorization-Header gesendet" {
  start_stub "$VALID_PAGE"

  # Positiv-Anker: OHNE Schluessel laeuft derselbe Aufruf durch und sendet
  # KEINEN Authorization-Header. Ohne diesen Anker koennte der Negativbefund
  # unten auch bedeuten, dass der Aufruf gar nicht stattgefunden hat.
  run env LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -eq 0 ]
  run grep -c '^Authorization:' "$STUB_DIR/headers.txt"
  [ "$output" -eq 0 ]

  : > "$STUB_DIR/headers.txt"
  run env LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub LM_API_KEY=geheim-123 \
      bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -eq 0 ]
  run grep -c '^Authorization: Bearer geheim-123$' "$STUB_DIR/headers.txt"
  [ "$output" -eq 1 ]
}

@test "T002533 der Schluessel steht nicht in argv (per ps lesbar)" {
  # Gemessen wird im OFFENEN Request, nicht durch Abtasten. [T002537]
  #
  # Vorher lief hier eine 200er-Schleife, die den Prozessbaum pollte, bis der
  # Hintergrundjob endete. Der Transform lebt aber nur ~35 ms, und eine
  # Iteration (zwei ps-Aufrufe) kostet 11-23 ms — es passten also nur 2-4
  # Stichproben in das gesamte Ereignisfenster. Abtastperiode und Ereignisdauer
  # lagen in derselben Groessenordnung, das Verfahren hatte an keinem Ende
  # Reserve: zu frueh war fork/exec des Kindes noch nicht fertig, zu spaet war
  # der Job schon weg. Auf dem CI-Runner (vier parallele Shards) kollabierte
  # das auf eine einzige Stichprobe und wurde sporadisch rot.
  GATE="$BATS_TEST_TMPDIR/gate"
  mkdir -p "$GATE"
  start_stub "$VALID_PAGE" "$GATE"

  # Der Schluessel wird EXPORTIERT, nicht per `env VAR=... cmd` uebergeben:
  # sonst legt `env` ihn selbst in seine eigene Kommandozeile und der Test
  # wuerde das Testgeruest messen statt das Skript.
  export LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub LM_API_KEY=streng-geheim-xyz
  bash "$TRANSFORM" "$SRC" note slug '[]' '[]' >/dev/null &
  local job=$! waited=0

  # ANKER 1 — ein Ereignis, kein Zeitfenster: der Stub hat den Request erhalten
  # und haelt ihn offen. Ab hier ist bewiesen, dass der Transform laeuft UND
  # curl mitten im Request steht. Das ist zugleich der einzige Moment, in dem
  # ein Leck ueberhaupt sichtbar waere — der Schluessel wandert in einen
  # Authorization-Header, ein `curl -H "Authorization: Bearer ..."` truege ihn
  # in seiner argv, und dieses Kind existiert nur waehrend des Requests. Die
  # alte Abtastung konnte genau diesen Moment verpassen und trotzdem gruen
  # melden.
  while [ ! -e "$GATE/arrived" ]; do
    waited=$((waited + 1))
    if [ "$waited" -gt 100 ]; then
      echo "Stub hat den Request in 10s nie gesehen — der Transform hat den" >&2
      echo "Endpunkt nicht erreicht. Das ist KEIN Schluessel-Leck." >&2
      # `|| true`: ist der Job schon weg, gibt kill 1 zurueck — bats meldete
      # dann diese Zeile als Fehlerursache und verdeckte die Diagnose oben.
      kill "$job" 2>/dev/null || true
      return 1
    fi
    sleep 0.1
  done

  # ANKER 2 — ps ist in dieser Umgebung aussagefaehig. Ohne diesen Nachweis
  # bestuende die Sachaussage unten vakuos, sobald ps aus irgendeinem Grund
  # nichts liefert: "kein Treffer" hiesse dann nicht "sauber", sondern "nicht
  # gemessen". [T002356-M1]
  run bash -c "ps -eo args 2>/dev/null | grep -c '[b]rain-ingest-transform'"
  [ "$output" -ge 1 ]

  # SACHAUSSAGE. Klammer-Schreibweise: `grep 'streng-geheim-xyz'` traegt das
  # Muster in die EIGENE Kommandozeile, und ps sieht diesen grep, weil beide in
  # derselben Pipeline gleichzeitig starten — der Test wuerde sich selbst
  # finden. `[s]treng-...` matcht denselben Text, aber nicht mehr sich selbst.
  run bash -c "ps -eo args 2>/dev/null | grep -c '[s]treng-geheim-xyz'"
  [ "$output" -eq 0 ]

  touch "$GATE/release"
  wait "$job"
  local rc=$?
  unset LM_STUDIO_URL LM_MODEL LM_API_KEY
  [ "$rc" -eq 0 ]
}

@test "T002533 leeres content bei gefuelltem reasoning_content nennt LM_DISABLE_THINKING" {
  # Genau der DeepSeek-v4-Fall: das Modell verbraucht sein Budget im Denken,
  # content bleibt leer. Die alte Meldung war 'empty response' und schickte
  # einen auf die Suche nach einem toten Endpunkt.
  start_stub '{"choices":[{"message":{"content":"","reasoning_content":"lange denkphase"},"finish_reason":"length"}]}'
  run env LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -ne 0 ]
  [[ "$output" == *"LM_DISABLE_THINKING"* ]]
}

@test "T002533 LM_DISABLE_THINKING=1 setzt thinking.type=disabled im Request" {
  start_stub "$VALID_PAGE"

  # Positiv-Anker: OHNE den Schalter geht derselbe Request raus und enthaelt
  # KEIN thinking-Feld. Ohne diesen Anker bestuende der Test auch dann, wenn
  # der Schalter gar nichts bewirkt.
  run env LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub \
      bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -eq 0 ]
  run grep -c 'thinking' "$STUB_DIR/headers.txt.body"
  [ "$output" -eq 0 ]

  : > "$STUB_DIR/headers.txt.body"
  run env LM_STUDIO_URL="$STUB_URL" LM_MODEL=stub LM_DISABLE_THINKING=1 \
      bash "$TRANSFORM" "$SRC" note slug '[]' '[]'
  [ "$status" -eq 0 ]
  # jq -n gibt standardmaessig FORMATIERTES JSON aus — der Vergleich muss den
  # Zeilenumbruch zwischen Schluessel und Wert vertragen, sonst prueft man das
  # Ausgabeformat von jq statt den Inhalt des Requests.
  run grep -c '"disabled"' "$STUB_DIR/headers.txt.body"
  [ "$output" -ge 1 ]
  run grep -c '"thinking"' "$STUB_DIR/headers.txt.body"
  [ "$output" -ge 1 ]
}
