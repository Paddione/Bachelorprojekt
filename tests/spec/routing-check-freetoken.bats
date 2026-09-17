#!/usr/bin/env bats

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
  curl -s -m 2 http://127.0.0.1:1919/v1/models >/dev/null 2>&1 || skip ":1919 nicht erreichbar"

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
  run curl -s -m 2 http://127.0.0.1:1919/v1/models
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"$model"* ]]
}
