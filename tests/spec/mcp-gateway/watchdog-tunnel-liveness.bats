#!/usr/bin/env bats
# T002543 — Der mcp-gateway-Watchdog muss TUNNEL-Liveness pruefen, nicht Prozess-Liveness.
#
# Pruefmodus: command output verification [T002448-M4]. Die Tests FUEHREN das
# Probe-Skript gegen echte und tote Ports aus und pruefen $status/$output. Ein
# grep auf die Skriptquelle wuerde belegen, dass Text existiert — nicht, dass
# der Probe einen toten Tunnel erkennt, und genau darum geht es hier.
#
# Warum es diesen Guard braucht: kubectl port-forward hat einen Versagensmodus,
# in dem der PROZESS weiterlebt, waehrend die SPDY-Streams abgerissen sind. Es
# gibt keinen Exit-Code, also greift systemds Restart= nie. Beobachtet am
# 2026-08-02: die Unit meldete 3h16m "active (running)", alle vier Ports liefen
# in den Timeout (http=000), der Ziel-Pod war durchgehend 4/4 Running. Nach
# kill + Neustart antworteten die Ports sofort.
#
# Ein Health-Check auf TCP-Ebene reicht dafuer NICHT: der Listener des
# port-forward bleibt offen, accept() gelingt, erst die Nutzlast laeuft in den
# Timeout. Der Probe muss deshalb einen echten MCP-initialize fuehren.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PROBE="${REPO_ROOT}/scripts/mcp-gateway/probe.sh"
}

@test "T002543: das Probe-Skript existiert und ist ausfuehrbar" {
  [ -x "${PROBE}" ]
}

@test "T002543: ein toter Port wird als Fehler gemeldet, nicht als Erfolg" {
  # Positiv-Anker zuerst [T002356-M1]: das Skript laeuft ueberhaupt und kennt
  # den Aufruf. Ohne ihn koennte der Test auch bei einem Skript bestehen, das
  # bei JEDEM Aufruf scheitert — etwa weil es gar nicht existiert.
  run "${PROBE}" --help
  [ "${status}" -eq 0 ]

  # Port 1 ist privilegiert und hier garantiert unbelegt.
  run "${PROBE}" --port 1 --timeout 2
  [ "${status}" -ne 0 ]
}

@test "T002543: ein TCP-Listener ohne MCP-Antwort gilt als tot" {
  # Der Kern des Defekts: der port-forward-Listener bleibt offen, waehrend der
  # Tunnel tot ist. Ein Probe, der nur auf accept() prueft, wuerde hier faelsch-
  # licherweise Erfolg melden.
  command -v nc >/dev/null 2>&1 || skip "nc nicht verfuegbar"
  local port=45871
  nc -l -p "${port}" >/dev/null 2>&1 &
  local nc_pid=$!
  sleep 0.5

  run "${PROBE}" --port "${port}" --timeout 2
  kill "${nc_pid}" 2>/dev/null || true

  [ "${status}" -ne 0 ]
  [[ "${output}" == *"${port}"* ]]
}

@test "T002543: der Probe nennt den geprueften Port im Fehlerfall" {
  # Ohne Portangabe ist im Journal nicht erkennbar, welcher der vier Ports
  # (18080, 13000, 13001, 13002) gefallen ist.
  #
  # ACHTUNG, hier lag schon ein vakuoser Test: geprueft wurde auf *"1"* im
  # $output. Fehlt das Skript, meldet bash "line 1: … No such file or
  # directory" — die "1" darin erfuellte die Assertion, und der Test war GRUEN,
  # obwohl nichts implementiert war. Deshalb erst der Existenz-Anker, dann ein
  # Port, dessen Ziffernfolge in keiner Shell-Fehlermeldung zufaellig vorkommt.
  [ -x "${PROBE}" ]
  run "${PROBE}" --port 45872 --timeout 2
  [ "${status}" -ne 0 ]
  [ "${status}" -ne 127 ]
  [[ "${output}" == *"45872"* ]]
}

@test "T002543: Watchdog-Units sind versioniert und referenzieren den Probe" {
  # Querschnittspruefung: die Unit-Dateien liegen im Repo, nicht nur auf dem
  # Host — sonst ist der Guard nach einer Neuinstallation weg. Hier ist der
  # Quelltext das Ergebnis, deshalb ist grep das richtige Mittel [T002448-M4].
  local timer="${REPO_ROOT}/scripts/mcp-gateway/mcp-gateway-watchdog.timer"
  local svc="${REPO_ROOT}/scripts/mcp-gateway/mcp-gateway-watchdog.service"
  [ -f "${timer}" ]
  [ -f "${svc}" ]
  grep -q "probe.sh" "${svc}"
  # Der Watchdog muss die Gateway-Unit neu starten koennen — sonst meldet er
  # nur, was ohnehin niemand liest.
  grep -qE "mcp-gateway\.service" "${svc}"
}

@test "T002543: der Timer feuert wiederholt, nicht nur einmal beim Boot" {
  local timer="${REPO_ROOT}/scripts/mcp-gateway/mcp-gateway-watchdog.timer"
  [ -f "${timer}" ]
  # OnUnitActiveSec/OnCalendar = wiederkehrend. Nur OnBootSec waere ein
  # einmaliger Schuss und wuerde den Defekt nicht abdecken, der erst nach
  # Stunden Laufzeit auftritt.
  grep -qE "OnUnitActiveSec=|OnCalendar=" "${timer}"
}
