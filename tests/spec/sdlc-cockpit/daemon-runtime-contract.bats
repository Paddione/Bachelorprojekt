#!/usr/bin/env bats

# daemon-runtime-contract.bats — T002508
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ueberwiegend ERGEBNIS-basiert.
# Die Tests starten den Daemon wirklich und messen, ob er antwortet; sie pruefen
# das Skip-Verhalten, indem sie bats erneut aufrufen und die AUSGABE lesen. Nur
# der ci.yml-Guard arbeitet mit grep — das ist die dokumentierte Ausnahme fuer
# CI-Konfiguration, deren Ergebnis sich ausschliesslich im Quelltext manifestiert.
#
# Hintergrund: Der Cockpit-Daemon (.lavish/kit/daemon/) war nie lauffaehig
# eingecheckt. `hono` und `@hono/node-server` sind in keiner package.json
# deklariert, es gab keinen Start-Task und keine tsconfig-Referenz. Folge: alle
# 24 Daemon-Tests der sdlc-cockpit-Suite skippten dauerhaft — auch die
# Security-Guards aus T002505. Ein Skip ist in bats ein `ok`, die Suite war also
# gruen, ohne je eine Route beruehrt zu haben.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

setup() {
  cd "${REPO_ROOT}" || return 1
}

# ---------------------------------------------------------------------------
# 1. Lauf-Kontrakt: Dependencies sind deklariert
# ---------------------------------------------------------------------------

@test "T002508 Daemon-Dependencies sind in package.json deklariert [Positiv-Anker + Negativaussage]" {
  # POSITIV-ANKER: package.json ist lesbar und jq funktioniert. Ohne diesen
  # Anker wuerde die Aussage unten vakuos bestehen, sobald jq scheitert oder
  # die Datei fehlt — "null ist nicht null" gilt dann trivial nicht, aber ein
  # kaputtes jq faellt sonst nirgends auf.
  run jq -r '.name' package.json
  [ "$status" -eq 0 ]
  [ "$output" = "bachelorprojekt-scripts" ]

  # Der eigentliche Gegenstand: beide Laufzeit-Abhaengigkeiten des Daemons
  # muessen deklariert sein — sonst startet er in keinem frischen Checkout.
  run jq -r '(.dependencies.hono // .devDependencies.hono) // "MISSING"' package.json
  [ "$output" != "MISSING" ]

  run jq -r '(.dependencies["@hono/node-server"] // .devDependencies["@hono/node-server"]) // "MISSING"' package.json
  [ "$output" != "MISSING" ]
}

@test "T002508 hono ist tatsaechlich aufloesbar, nicht nur deklariert" {
  # Ergebnis statt Deklaration: eine Zeile in package.json nuetzt nichts, wenn
  # das Paket nicht installiert ist. Node muss es wirklich importieren koennen.
  #
  # Bewusst per dynamischem import() und nicht per require.resolve(): hono gibt
  # in seinem exports-Feld weder './package.json' noch einen CJS-Einstieg frei,
  # ein require.resolve() scheitert dort mit ERR_PACKAGE_PATH_NOT_EXPORTED —
  # also aus einem Grund, der nichts mit der Frage zu tun hat, ob das Paket da
  # ist. Der Import prueft, was der Daemon tatsaechlich tut.
  run node -e "import('hono').then(m => { if (typeof m.Hono !== 'function') process.exit(1); })"
  [ "$status" -eq 0 ]

  run node -e "import('@hono/node-server').then(m => { if (typeof m.serve !== 'function') process.exit(1); })"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# 2. Der Daemon startet wirklich
# ---------------------------------------------------------------------------

@test "T002508 Daemon startet aus dem Checkout und antwortet auf /health" {
  # 39199 statt 49199 [T002708]: der alte Port lag im Bereich 49152-49251, den
  # Windows/Hyper-V auf WSL2-Hosts reserviert. Dort scheitert bind() mit
  # EADDRINUSE, obwohl niemand lauscht — dieser Test war deshalb auf jedem
  # WSL2-Rechner reproduzierbar rot und auf dem Linux-Runner gruen.
  local PORT=39199
  local PIDFILE="${BATS_TEST_TMPDIR}/daemon.pid"

  COCKPIT_DAEMON_PORT="${PORT}" npx tsx .lavish/kit/daemon/server.ts \
    > "${BATS_TEST_TMPDIR}/daemon.log" 2>&1 &
  echo $! > "${PIDFILE}"

  # 30s statt der urspruenglichen 10s [T002602]: auf dem CI-Runner laeuft diese
  # Suite unter `bats -j` parallel, und `npx tsx` braucht dort zum Aufloesen und
  # Starten deutlich laenger als lokal bei warmem Cache. Beobachtet auf Shard 1
  # als Flake in etwa jedem vierten Lauf — mit LEEREM daemon.log, weil der
  # Prozess beim Abbruch noch gar nichts geschrieben hatte. Ausgeschlossen als
  # Ursache wurden: volles /tmp (87G frei laut Diagnose-Step), Portkonflikt mit
  # dem CI-Daemon (der laeuft auf dem Default-Port, dieser Test auf einem
  # eigenen) und ein echter Defekt (lokal gruen). Die Aussagekraft bleibt
  # erhalten: ein wirklich kaputter Daemon beendet sich sofort und faellt
  # weiterhin durch — nur das Warten auf einen langsamen Start ist
  # grosszuegiger.
  #
  # Nachtrag [T002708]: die damals als "flaky" eingeordnete Rotfaerbung war auf
  # WSL2-Hosts kein Rennen, sondern deterministisch — der Testport lag im
  # Hyper-V-Reservierungsbereich. Der grosszuegigere Timeout bleibt trotzdem
  # richtig, er adressiert nur ein anderes Problem als angenommen.
  local ok=0
  for _ in $(seq 1 120); do
    if curl -s -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 0.25
  done

  # Aufraeumen vor der Assertion, damit ein fehlgeschlagener Test keinen
  # Prozess zuruecklaesst, der den Port fuer den naechsten Lauf blockiert.
  kill "$(cat "${PIDFILE}")" 2>/dev/null || true

  if [ "$ok" -ne 1 ]; then
    echo "--- daemon.log ---"
    cat "${BATS_TEST_TMPDIR}/daemon.log"
  fi
  [ "$ok" -eq 1 ]
}

# ---------------------------------------------------------------------------
# 3. Das Gate ist fail-closed
# ---------------------------------------------------------------------------

@test "T002508 mit COCKPIT_DAEMON_REQUIRED schlaegt ein fehlender Daemon FEHL statt zu skippen" {
  # Ein Port, auf dem garantiert nichts lauscht — und der auch nicht reserviert
  # ist [T002708]. Der alte Wert 49198 lag im Hyper-V-Block; das war fuer diesen
  # Test zufaellig folgenlos, weil er ohnehin einen toten Port braucht, haette
  # aber jede spaetere Umnutzung der Konstante in eine Falle laufen lassen.
  local DEAD_PORT=39198

  # POSITIV-ANKER: ohne die Variable ist Skippen weiterhin das gewollte
  # Verhalten (lokale Ergonomie). Waere die Datei schlicht kaputt, wuerde die
  # Negativaussage unten aus dem falschen Grund bestehen.
  #
  # `env -u` ist noetig, nicht kosmetisch: laeuft diese Suite selbst unter
  # gesetztem COCKPIT_DAEMON_REQUIRED — in CI ist das der Normalfall — erbt der
  # Kindprozess die Variable und wuerde rot statt skippen. Der Anker pruefte
  # dann das Gegenteil dessen, was er soll.
  COCKPIT_DAEMON_PORT="${DEAD_PORT}" \
    run env -u COCKPIT_DAEMON_REQUIRED ./tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-endpoints.bats
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "# skip"

  # Der eigentliche Gegenstand: mit gesetzter Variable darf NICHT geskippt
  # werden — der Lauf muss rot sein.
  COCKPIT_DAEMON_REQUIRED=1 COCKPIT_DAEMON_PORT="${DEAD_PORT}" \
    run ./tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-endpoints.bats
  [ "$status" -ne 0 ]

  # Gezaehlt statt invertiert [T002708]: `! echo "$output" | grep -q "# skip"`
  # stand hier und konnte diesen Test nie rot machen. POSIX schaltet `set -e`
  # ab, sobald der Rueckgabewert eines Kommandos mit `!` invertiert wird — die
  # Zeile war seit T002508 wirkungslos. Das `|| true` faengt nur den Exit-Code
  # von grep bei null Treffern ab; geprueft wird die Zahl.
  local skip_count
  skip_count=$(printf '%s' "$output" | grep -c '# skip' || true)
  [ "$skip_count" -eq 0 ]
}

@test "T002508 CI startet den Daemon und setzt COCKPIT_DAEMON_REQUIRED" {
  # Pruefmodus grep (Ausnahme T002448-M4): Gegenstand ist die CI-Konfiguration,
  # deren Wirkung sich nur im Workflow-Quelltext feststellen laesst.

  # POSITIV-ANKER: der Job, in dem die spec-Suite laeuft, existiert ueberhaupt.
  run grep -c "^  test-factory-shard:" .github/workflows/ci.yml
  [ "$output" -eq 1 ]

  # Ohne die Variable im Workflow bliebe das Gate wirkungslos: die Suite liefe
  # weiter durch und skippte still.
  run grep -c "COCKPIT_DAEMON_REQUIRED" .github/workflows/ci.yml
  [ "$output" -ge 1 ]

  # Und ohne Start-Step gaebe es nichts, gegen das die Tests laufen koennten.
  run grep -c "cockpit:daemon" .github/workflows/ci.yml
  [ "$output" -ge 1 ]
}

# ---------------------------------------------------------------------------
# 4. Start-Weg existiert
# ---------------------------------------------------------------------------

@test "T002508 task cockpit:daemon ist definiert" {
  # POSITIV-ANKER: das Taskfile ist parsebar und der bekannte Nachbar-Task da.
  run grep -c "^  cockpit:dev:" Taskfile.yml
  [ "$output" -eq 1 ]

  run grep -c "^  cockpit:daemon:" Taskfile.yml
  [ "$output" -eq 1 ]
}
