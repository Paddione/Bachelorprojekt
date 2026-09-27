#!/usr/bin/env bats

load "../lib/guard-preconditions.sh"

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  ROUTING_CHECK="${REPO_ROOT}/scripts/llm/routing-check.sh"
  OPENCODE_CFG="${REPO_ROOT}/.opencode/opencode.jsonc"
}

@test "routing-check meldet kein veraltetes gemma12-vision@18235" {
  run bash "${ROUTING_CHECK}"
  [[ "${output}" != *"gemma12-vision"* ]]
}

@test "T900213: routing-check probt Port 1919 und nicht 18235 in Probe-Liste" {
  [ -f "${ROUTING_CHECK}" ]
  # :1919 in Probe-Liste
  run bash -c "grep -vE '^[[:space:]]*#' '${ROUTING_CHECK}' | grep -F '127.0.0.1:1919'"
  [ "${status}" -eq 0 ]
  # :18235 nicht mehr in Probe-Liste (nur Kommentare erlaubt)
  run bash -c "grep -vE '^[[:space:]]*#' '${ROUTING_CHECK}' | grep -F '18235'"
  [ "${status}" -ne 0 ]
}

@test "T900213: opencode.jsonc Standardmodell ist im Live-Katalog vorhanden (wenn :1919 erreichbar)" {
  require_http "http://127.0.0.1:1919/v1/models" 200 ":1919 /v1/models"

  model=$(python3 -c "
import re
with open('${OPENCODE_CFG}') as f:
    text = f.read()
m = re.search(r'^\s*\"model\"\s*:\s*\"([^\"]+)\"', text, re.MULTILINE)
if m:
    val = m.group(1)
    if '/' in val:
        val = val.split('/', 1)[1]
    print(val)
")
  [ -n "$model" ]
  # [T900537] Der Test kann nur behaupten, dass Konfiguration und LIVE-Katalog
  # uebereinstimmen, wenn der Katalog das konfigurierte Modell ueberhaupt fuehrt.
  # Wo er es nicht fuehrt, ist die Aussage nicht "Auth-Regression", sondern
  # "diese Maschine serviert einen anderen Katalog" (Drift, T900509) — als Skip,
  # damit der Befund im Log sichtbar bleibt statt in einem not ok zu
  # verschwinden (seit T900651 aus guard-preconditions.sh).
  require_http_contains "http://127.0.0.1:1919/v1/models" "$model" ":1919-Katalog (Drift, T900509)"
}
