#!/usr/bin/env bats

# daemon-port-binding.bats — T002708
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): GEMISCHT, je Test benannt.
# Test 1 ist ergebnis-basiert — er belegt einen Port wirklich, startet den Daemon
# dagegen und liest dessen Ausgabe. Test 2 arbeitet mit grep: Gegenstand ist die
# Port-KONFIGURATION, deren Wirkung sich ausschliesslich im Quelltext festlegen
# laesst (dokumentierte Ausnahme).
#
# Hintergrund (T002708): Der Cockpit-Daemon war auf Port 49152 voreingestellt,
# der Runtime-Test auf 49199. Beide liegen im dynamischen Portbereich, den
# Windows/Hyper-V auf WSL2-Hosts blockweise reserviert — `netsh interface ipv4
# show excludedportrange protocol=tcp` weist 49152-49251 als ausgeschlossen aus.
# Ein bind() dort liefert EADDRINUSE, OBWOHL `ss -ltnp` niemanden zeigt und kein
# Daemon-Prozess laeuft. Der Daemon war damit auf jedem WSL2-Rechner nicht
# startbar; der Cockpit ist Development-only, WSL ist also die Zielumgebung.
#
# Erschwerend kam eine irrefuehrende Ausgabe hinzu: server.ts loggte
# "listening on ..." VOR dem serve()-Aufruf. Der Daemon meldete also Erfolg und
# stuerzte danach mit EADDRINUSE auf demselben Port ab. Dieses Bild
# ("erst listening, dann Portkonflikt") liest sich wie ein doppelter bind() im
# selben Prozess und hat die Fehlersuche in T002708 zunaechst in genau diese
# falsche Richtung geschickt. Der Log darf Erfolg erst melden, wenn er eingetreten
# ist — deshalb ist das hier Testgegenstand und nicht bloss Kosmetik.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

setup() {
  cd "${REPO_ROOT}" || return 1
}

# ---------------------------------------------------------------------------
# 1. Der Daemon meldet keinen Erfolg, den es nicht gab
# ---------------------------------------------------------------------------

@test "T002708 Daemon meldet kein 'listening', wenn der bind fehlschlaegt" {
  # Pruefmodus: ERGEBNIS. Der Port wird wirklich belegt, der Daemon wirklich
  # gestartet, und gelesen wird, was er ausgegeben hat.
  #
  # 39190 liegt ausserhalb des Hyper-V-Ausschlusses (ab 49152) und ausserhalb
  # des lokalen ephemeren Bereichs — der Port ist also frei, bis dieser Test ihn
  # selbst belegt. Damit ist der Konflikt hier hergestellt statt vorgefunden,
  # und der Test faellt auf Linux genauso aus wie auf WSL2.
  local BLOCK_PORT=39190
  local BLOCKER_PID="${BATS_TEST_TMPDIR}/blocker.pid"

  node -e "require('http').createServer((q, s) => s.end('blocker')).listen(${BLOCK_PORT}, '127.0.0.1')" \
    > "${BATS_TEST_TMPDIR}/blocker.log" 2>&1 &
  echo $! > "${BLOCKER_PID}"

  # POSITIV-ANKER: der Blocker haelt den Port tatsaechlich. Ohne ihn wuerde die
  # Negativaussage unten vakuos bestehen — ein Daemon, der aus einem voellig
  # anderen Grund gar nichts loggt, erfuellt "loggt kein listening" trivial.
  local blocking=0
  for _ in $(seq 1 40); do
    if [ "$(curl -s -m 1 "http://127.0.0.1:${BLOCK_PORT}/" 2>/dev/null)" = "blocker" ]; then
      blocking=1
      break
    fi
    sleep 0.25
  done
  [ "$blocking" -eq 1 ]

  # Der Daemon laeuft jetzt gegen einen belegten Port. Er MUSS scheitern — die
  # Frage ist allein, ob er dabei die Wahrheit sagt.
  # `|| daemon_status=$?` statt einer nackten Zuweisung danach: bats bricht einen
  # Test beim ersten Fehlerstatus ab, und der Fehlschlag ist hier der Normalfall.
  local daemon_status=0
  COCKPIT_DAEMON_PORT="${BLOCK_PORT}" timeout 60 npx tsx .lavish/kit/daemon/server.ts \
    > "${BATS_TEST_TMPDIR}/daemon.log" 2>&1 || daemon_status=$?

  kill "$(cat "${BLOCKER_PID}")" 2>/dev/null || true

  if grep -q "listening on" "${BATS_TEST_TMPDIR}/daemon.log"; then
    echo "--- daemon.log (meldet listening, obwohl der Port belegt war) ---"
    cat "${BATS_TEST_TMPDIR}/daemon.log"
  fi

  # Der eigentliche Gegenstand: kein Erfolgs-Log ohne Erfolg.
  #
  # Bewusst `run grep -c` und NICHT `! grep -q`: POSIX schaltet `set -e` ab,
  # sobald der Rueckgabewert eines Kommandos mit `!` invertiert wird. Eine
  # Assertion der Form `! grep -q ...` kann einen bats-Test deshalb nie rot
  # machen — sie besteht immer. Genau daran ist die erste Fassung dieses Tests
  # vakuos gruen geworden, obwohl der Daemon "listening on" nachweislich loggte.
  run grep -c "listening on" "${BATS_TEST_TMPDIR}/daemon.log"
  [ "$output" -eq 0 ]

  # Und der Fehlschlag muss als solcher erkennbar sein: benannter Port plus
  # Ursache, statt eines nackten Unhandled-'error'-Stacktraces.
  grep -q "${BLOCK_PORT}" "${BATS_TEST_TMPDIR}/daemon.log"
  grep -qi "EADDRINUSE\|belegt\|reserviert" "${BATS_TEST_TMPDIR}/daemon.log"

  # Ein gescheiterter Start endet mit einem Fehlercode, nicht mit 0.
  [ "$daemon_status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# 2. Kein Cockpit-Port liegt im reservierten Bereich
# ---------------------------------------------------------------------------

@test "T002708 kein konfigurierter Cockpit-Port liegt im Hyper-V-Reservierungsbereich" {
  # Pruefmodus: grep (dokumentierte Ausnahme T002448-M4). Gegenstand ist die
  # Port-Konfiguration selbst; ihre Wirkung — startet der Daemon auf einem
  # WSL2-Host — laesst sich auf einem Linux-Runner gar nicht messen, weil der
  # Bereich dort frei ist. Genau deshalb blieb der Bug in CI unsichtbar.
  #
  # Geprueft wird der Bereich 49152-49251: der erste und groesste der von
  # Windows/Hyper-V reservierten Bloecke, in dem sowohl der alte Default (49152)
  # als auch der alte Testport (49199) lagen.

  # POSITIV-ANKER: der Default-Port des Daemons ist ueberhaupt auffindbar und
  # plausibel. Waere die Zeile umbenannt oder die Datei verschoben, faende der
  # Scan unten nichts — und die Negativaussage bestuende aus dem falschen Grund.
  run bash -c "grep -oE \"COCKPIT_DAEMON_PORT \\|\\| '[0-9]+'\" .lavish/kit/daemon/server.ts | grep -oE '[0-9]+'"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [ "$output" -gt 1024 ]
  [ "$output" -lt 49152 ]

  # Der eigentliche Gegenstand: keine der Cockpit-Portstellen darf im
  # reservierten Block liegen. Der Adapter zaehlt mit — er verdrahtet die
  # Basis-URL, die der Browser anspricht.
  #
  # Diese Datei selbst ist vom Scan ausgenommen: sie MUSS die alten Werte
  # nennen, um den Bereich zu dokumentieren und zu pruefen. Der Ausschluss ist
  # namentlich und nicht per Muster, damit er nicht versehentlich weitere
  # Dateien mitnimmt.
  local files=() f
  for f in .lavish/kit/daemon/server.ts .lavish/kit/adapter.js .lavish/kit/canvas-store.js \
           tests/spec/sdlc-cockpit/*.bats tests/spec/sdlc-cockpit/*.bash; do
    [ "$(basename "$f")" = "daemon-port-binding.bats" ] && continue
    files+=("$f")
  done

  # POSITIV-ANKER fuer den Scan selbst: die Dateiliste ist nicht leer. Ein
  # fehlgeschlagenes Glob liesse den Scan sonst ins Leere laufen und die
  # Negativaussage vakuos bestehen.
  [ "${#files[@]}" -gt 3 ]

  # Reine Kommentarzeilen sind ausgenommen: die alten Werte MUESSEN dort
  # vorkommen duerfen, sonst laesst sich nicht erklaeren, warum der Port
  # gewechselt wurde — und eine Aenderung, die man nicht begruenden darf, wird
  # bei der naechsten Aufraeumaktion zurueckgedreht. Gegenstand des Guards ist
  # die Konfiguration, nicht die Prosa. Ein Portwert in einer Code-Zeile wird
  # weiterhin gefunden, auch mit angehaengtem Kommentar.
  local hits
  hits=$(cat "${files[@]}" 2>/dev/null \
    | grep -vE '^[[:space:]]*(#|//)' \
    | grep -ohE '\b(4915[2-9]|491[6-9][0-9]|492[0-4][0-9]|4925[01])\b' \
    | sort -u | tr '\n' ' ')
  [ -z "$hits" ] || {
    echo "Ports im reservierten Bereich 49152-49251 gefunden: ${hits}"
    false
  }

  # Der Taskfile-Task startet denselben Daemon und darf nicht auf einen anderen
  # Port zeigen als der Default in server.ts.
  local task_port
  task_port=$(sed -n '/^  cockpit:daemon:/,/^  [a-z]/p' Taskfile.yml \
    | grep -oE 'default "[0-9]+"' | grep -oE '[0-9]+' | head -1)
  [ -n "$task_port" ]
  [ "$task_port" -lt 49152 ]
}
