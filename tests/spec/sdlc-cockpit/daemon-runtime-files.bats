#!/usr/bin/env bats

# daemon-runtime-files.bats — T002721
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
# starten echte Daemons, lesen die tatsaechlich geschriebenen Dateien und
# befragen den laufenden Prozess ueber HTTP. Es wird kein Quelltext gegrept.
#
# Hintergrund: server.ts schrieb Token- und PID-Datei am Modul-Top-Level, also
# BEVOR serve() gebunden hat. Ein zweiter Daemon auf einem belegten Port
# scheiterte dadurch zwar sauber, hatte aber vorher den Zustand des LAUFENDEN
# Daemons zerstoert:
#
#   - /tmp/cockpit-daemon.pid zeigte auf den inzwischen toten Prozess. Das im
#     Dateikopf von server.ts dokumentierte `kill $(cat …pid)` beendete den
#     laufenden Daemon nicht mehr.
#   - /tmp/cockpit-daemon.token enthielt ein Token, das der laufende Daemon
#     nicht kannte. Gemessen bei der Ursachenpruefung zu T002721: POST auf
#     /api/cockpit/ticket-action mit dem Token AUS DER DATEI ergab HTTP 401,
#     mit dem echten Token HTTP 200. Der dokumentierte Weg — Token aus der
#     0600-Datei lesen — fuehrte also ins Leere, und die Datei sah dabei
#     gueltig aus.
#
# Die Laufzeitdateipfade sind ueber COCKPIT_DAEMON_STATE_DIR umstellbar. Ohne
# das waere dieser Test selbst die Schadensquelle, gegen die er sich richtet:
# er wuerde die Dateien eines echten Entwickler-Daemons ueberschreiben und im
# Cleanup-Test loeschen. Zusaetzlich sichert setup()/teardown() einen etwaigen
# /tmp-Stand, damit auch ein Lauf gegen die unfixierte Fassung nichts zerstoert.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

setup() {
  cd "${REPO_ROOT}" || return 1
  STATE_DIR="${BATS_TEST_TMPDIR}/state"
  mkdir -p "${STATE_DIR}"
  export STATE_DIR

  # Etwaigen echten Stand sichern — greift nur, solange der Daemon
  # COCKPIT_DAEMON_STATE_DIR noch nicht beachtet (roter Lauf).
  [ -f /tmp/cockpit-daemon.pid ]   && cp /tmp/cockpit-daemon.pid   "${BATS_TEST_TMPDIR}/real.pid.bak"   || true
  [ -f /tmp/cockpit-daemon.token ] && cp /tmp/cockpit-daemon.token "${BATS_TEST_TMPDIR}/real.token.bak" || true
  return 0
}

teardown() {
  [ -n "${DAEMON_A_PID:-}" ] && kill "${DAEMON_A_PID}" 2>/dev/null || true
  [ -f "${BATS_TEST_TMPDIR}/real.pid.bak" ]   && cp "${BATS_TEST_TMPDIR}/real.pid.bak"   /tmp/cockpit-daemon.pid   || true
  [ -f "${BATS_TEST_TMPDIR}/real.token.bak" ] && cp "${BATS_TEST_TMPDIR}/real.token.bak" /tmp/cockpit-daemon.token || true
  return 0
}

# start_daemon <port> <logfile> — startet einen Daemon im isolierten State-Dir
# und gibt dessen PID auf stdout aus. Wartet NICHT auf Bereitschaft.
start_daemon() {
  local port="$1" log="$2"
  COCKPIT_DAEMON_PORT="${port}" COCKPIT_DAEMON_STATE_DIR="${STATE_DIR}" \
    npx tsx .lavish/kit/daemon/server.ts > "${log}" 2>&1 &
  echo $!
}

# wait_health <port> — pollt /health, gibt 0 bei Erreichbarkeit zurueck.
wait_health() {
  local port="$1" _
  for _ in $(seq 1 120); do
    curl -s -m 1 "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

# ---------------------------------------------------------------------------
# 1. Ein Fehlstart laesst den Zustand des laufenden Daemons unangetastet
# ---------------------------------------------------------------------------

@test "T002721 gescheiterter Start ueberschreibt PID- und Token-Datei nicht" {
  local PORT=39181
  local PIDFILE="${STATE_DIR}/cockpit-daemon.pid"
  local TOKENFILE="${STATE_DIR}/cockpit-daemon.token"

  DAEMON_A_PID="$(start_daemon "${PORT}" "${BATS_TEST_TMPDIR}/A.log")"

  # POSITIV-ANKER: Daemon A laeuft wirklich und hat beide Dateien im isolierten
  # State-Dir angelegt. Ohne diesen Anker bestuende die Aussage "Dateien
  # unveraendert" vakuos, sobald der Daemon gar nicht erst startet oder in ein
  # anderes Verzeichnis schreibt.
  wait_health "${PORT}"
  [ -f "${PIDFILE}" ]
  [ -f "${TOKENFILE}" ]

  local pid_before token_before
  pid_before="$(cat "${PIDFILE}")"
  token_before="$(cat "${TOKENFILE}")"
  [ "$pid_before" = "$DAEMON_A_PID" ] || [ -n "$pid_before" ]

  # Zweiter Daemon auf demselben Port — er MUSS scheitern.
  local b_status=0
  COCKPIT_DAEMON_PORT="${PORT}" COCKPIT_DAEMON_STATE_DIR="${STATE_DIR}" \
    timeout 60 npx tsx .lavish/kit/daemon/server.ts \
    > "${BATS_TEST_TMPDIR}/B.log" 2>&1 || b_status=$?
  [ "$b_status" -ne 0 ]

  # Der eigentliche Gegenstand: der Fehlstart hat nichts angefasst.
  [ "$(cat "${PIDFILE}")" = "$pid_before" ]
  [ "$(cat "${TOKENFILE}")" = "$token_before" ]

  # Und die Wirkung, die den Bug ueberhaupt schmerzhaft macht: das Token AUS
  # DER DATEI muss der laufende Daemon weiterhin akzeptieren.
  run curl -s -m 3 -o /dev/null -w '%{http_code}' \
    -X POST -H "Authorization: Bearer $(cat "${TOKENFILE}")" \
    "http://127.0.0.1:${PORT}/api/cockpit/ticket-action"
  [ "$output" = "200" ]
}

# ---------------------------------------------------------------------------
# 2. Beim regulaeren Beenden bleiben keine verwaisten Dateien zurueck
# ---------------------------------------------------------------------------

@test "T002721 Daemon raeumt PID- und Token-Datei beim Beenden auf" {
  local PORT=39182
  local PIDFILE="${STATE_DIR}/cockpit-daemon.pid"
  local TOKENFILE="${STATE_DIR}/cockpit-daemon.token"

  DAEMON_A_PID="$(start_daemon "${PORT}" "${BATS_TEST_TMPDIR}/C.log")"

  # POSITIV-ANKER: die Dateien existieren ueberhaupt, bevor ihr Verschwinden
  # geprueft wird. Sonst bestuende "Datei ist weg" trivial.
  wait_health "${PORT}"
  [ -f "${PIDFILE}" ]
  [ -f "${TOKENFILE}" ]

  kill -TERM "${DAEMON_A_PID}"
  local gone=0 _
  for _ in $(seq 1 40); do
    if [ ! -f "${PIDFILE}" ] && [ ! -f "${TOKENFILE}" ]; then
      gone=1
      break
    fi
    sleep 0.25
  done

  if [ "$gone" -ne 1 ]; then
    echo "--- verbliebene Dateien ---"
    ls -la "${STATE_DIR}"
  fi
  [ "$gone" -eq 1 ]

  # Der Prozess ist wirklich beendet — ein Cleanup, der den Daemon am Leben
  # laesst, waere kein Cleanup.
  run kill -0 "${DAEMON_A_PID}"
  [ "$status" -ne 0 ]
}
