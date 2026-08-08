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
  DAEMON_PORT="${COCKPIT_DAEMON_PORT:-39152}"
  BASE="http://127.0.0.1:${DAEMON_PORT}"

  local health
  health="$(curl -s -m 2 "${BASE}/health" 2>/dev/null)"

  if [ -z "$health" ]; then
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
  fi

  # Zweite Vorbedingung [T002464]: antwortet der Daemon aus DIESEM Checkout?
  #
  # Bis hier genuegte "irgendwer antwortet". Auf dem Standardport laeuft aber
  # leicht noch ein Daemon aus einem anderen Worktree — dann prueft die Suite
  # dessen Code und nicht den, der gerade veraendert wurde. Beobachtet an
  # T002464: ein 3,8 h alter Daemon aus .worktrees/cockpit-daemon-runtime-T002508
  # lieferte 404 fuer eine Route, die im gepruefen Checkout registriert war.
  #
  # Das Feld `root` liefert /health seit T002464. Fehlt es, ist der Daemon
  # aelter als diese Pruefung — das wird wie ein Mismatch behandelt, denn ein
  # Daemon von vor dieser Aenderung traegt den aktuellen Stand sicher nicht.
  local daemon_root
  daemon_root="$(echo "$health" | sed -n 's/.*"root":"\([^"]*\)".*/\1/p')"

  # Symlinks aufloesen, damit .worktrees/x und ein realer Pfad vergleichbar sind.
  local expected_root
  expected_root="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)"
  [ -n "$daemon_root" ] && daemon_root="$(cd "$daemon_root" 2>/dev/null && pwd -P || echo "$daemon_root")"

  if [ "$daemon_root" != "$expected_root" ]; then
    local detail="root=${daemon_root:-<fehlt, Daemon aelter als T002464>} erwartet=${expected_root}"
    if [ -n "${COCKPIT_DAEMON_REQUIRED:-}" ]; then
      echo "FATAL: Der Daemon auf ${BASE} gehoert zu einem anderen Checkout." >&2
      echo "       ${detail}" >&2
      echo "       Eigenen Daemon starten: COCKPIT_DAEMON_PORT=<freier Port> npx tsx .lavish/kit/daemon/server.ts" >&2
      return 1
    fi
    skip "Daemon on ${BASE} belongs to another checkout (${detail})"
  fi

  return 0
}
