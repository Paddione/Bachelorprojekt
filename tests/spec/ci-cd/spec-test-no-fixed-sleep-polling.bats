#!/usr/bin/env bats
# tests/spec/ci-cd/spec-test-no-fixed-sleep-polling.bats — [T002850/T002925]
#
# PRUEFMODUS: Quelltext-Inspektion (Ausnahme der CLAUDE.md Test-Resultats-Konvention
# T002448-M4 fuer Querschnittstests, deren Aussage sich nur im Quelltext manifestiert).
# Gegenstand ist die WARTEMECHANIK eines anderen Spec-Tests, nicht dessen Laufzeitverhalten
# unter Last selbst zu erzwingen — der Flake tritt nur unter CI-Kontention auf und laesst
# sich lokal nicht deterministisch reproduzieren (siehe design.md "Randbedingung"). Analog
# zur bereits etablierten Konvention in tests/spec/ci-cd/workflow-self-trigger.bats.
#
# HINTERGRUND: tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats startet zwei
# python3 http.server-Hintergrundprozesse und wartet danach mit einem FESTEN `sleep 1`,
# bevor der Positiv-Anker (der gesunde Server MUSS als erreichbar gelten) geprueft wird.
# Unter CPU-Kontention (parallele bats -j-Shards) kann die Sekunde nicht bis zum bind()
# reichen — dann kippt der Positiv-Anker aus einem Scheduling-Grund, nicht weil der Server
# tatsaechlich ungesund waere.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PROBE_FILE="${REPO_ROOT}/tests/spec/local-llm-proxy/kv-probe-endpoint-guard.bats"
}

@test "kv-probe-endpoint-guard wartet aktiv auf beide Server-Ports statt fest zu schlafen" {
  # Positiv-Anker [T002356-M1]: die Probe-Datei muss ueberhaupt existieren und den
  # Server-Start-Block enthalten, sonst waere die Negativ-Aussage unten gegenstandslos.
  [ -f "$PROBE_FILE" ] || { echo "ANKER ROT: $PROBE_FILE fehlt"; return 1; }
  run grep -c 'http.server.HTTPServer' "$PROBE_FILE"
  [ "$output" -gt 0 ] || { echo "ANKER ROT: kein HTTPServer-Setup in der Probe-Datei gefunden"; return 1; }

  # Eigentliche Aussage: die Wartezeit zwischen Serverstart und Probe ist ein aktives
  # Polling auf die Ports, kein fester Schlaf. Ein aktives Warten liest die Ports zurueck
  # und erscheint als /dev/tcp-Polling-Konstrukt.
  run grep -cE '/dev/tcp/127\.0\.0\.1/\$(port_ok|port_500)' "$PROBE_FILE"
  local has_polling=$((output > 0 ? 1 : 0))

  run grep -cE '^\s*sleep 1\s*$' "$PROBE_FILE"
  local has_bare_sleep=$((output > 0 ? 1 : 0))

  if [ "$has_polling" -eq 0 ] || [ "$has_bare_sleep" -eq 1 ]; then
    echo "kv-probe-endpoint-guard.bats wartet noch mit einem festen 'sleep 1' statt aktivem Port-Polling."
    echo "Fix: /dev/tcp-Polling mit Obergrenze statt 'sleep 1' (T002850)."
    return 1
  fi
}
