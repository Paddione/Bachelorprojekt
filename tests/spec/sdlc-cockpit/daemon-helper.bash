# daemon-helper.bash — gemeinsame Daemon-Vorbedingung der sdlc-cockpit-Suite [T002508]
#
# Bis T002508 trug jede Datei ihre eigene Kopie dieser Pruefung, und alle
# skippten bedingungslos, wenn kein Daemon lief. Da CI den Daemon nicht starten
# konnte, war das der Dauerzustand: 24 der 41 Tests liefen nie, meldeten sich in
# bats aber als `ok`. Die Suite war gruen, ohne je eine Route beruehrt zu haben.
#
# Die Vorbedingung ist jetzt zweistufig:
#   - COCKPIT_DAEMON_REQUIRED gesetzt  -> ein fehlender Daemon FAELLT DURCH.
#     So laeuft CI: der Workflow startet den Daemon und setzt die Variable.
#   - Variable nicht gesetzt           -> skip wie bisher. Das erhaelt die
#     lokale Ergonomie: die 17 statischen Tests bleiben ohne Daemon nutzbar.

# Setzt DAEMON_PORT und BASE und stellt sicher, dass ein Daemon antwortet.
# Ruft je nach COCKPIT_DAEMON_REQUIRED entweder `skip` oder `fail` auf.
require_daemon() {
  DAEMON_PORT="${COCKPIT_DAEMON_PORT:-49152}"
  BASE="http://127.0.0.1:${DAEMON_PORT}"

  if curl -s -m 2 "${BASE}/health" >/dev/null 2>&1; then
    return 0
  fi

  if [ -n "${COCKPIT_DAEMON_REQUIRED:-}" ]; then
    # Kein skip: COCKPIT_DAEMON_REQUIRED ist die Zusage, dass ein Daemon laeuft.
    # Tut er es nicht, ist das ein Fehler der Umgebung und muss den Lauf roetten
    # — sonst faellt die Suite still in genau den Zustand zurueck, den T002508
    # behoben hat.
    echo "FATAL: COCKPIT_DAEMON_REQUIRED ist gesetzt, aber ${BASE}/health antwortet nicht." >&2
    echo "       Daemon starten mit: task cockpit:daemon" >&2
    return 1
  fi

  skip "Daemon not running (no /health on ${BASE})"
}
