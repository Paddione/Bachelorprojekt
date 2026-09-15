#!/usr/bin/env bats
# T900164 — FreeToken wurde nur auf der Agent-Routing-Ebene entfernt (T900163:
# .opencode/agent-models.jsonc, freetoken-active.ts geloescht). Projekt-Default,
# Factory-Proxy-Default und Routing-Skripte zeigen FreeToken (Port 1919) weiterhin
# als aktiv, obwohl der Prozess laut Betreiber nicht mehr laeuft. Sichtbares Symptom:
# das SDLC-Dashboard (/admin/state) liest scripts/llm/loadouts.json und zeigt
# "FreeToken aktiv".
#
# Zielzustand: derselbe, den T900163 fuer agent-models.jsonc bereits gewaehlt hat —
# llamacpp-local/qwen38-220k (Port 18235, enabled:true in loadouts.json).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPENCODE_CFG="${REPO_ROOT}/.opencode/opencode.jsonc"
  LOADOUTS="${REPO_ROOT}/scripts/llm/loadouts.json"
  ROUTE_PROVIDER="${REPO_ROOT}/scripts/factory/route-provider.sh"
  ROUTING_CHECK="${REPO_ROOT}/scripts/llm/routing-check.sh"
}

@test "T900164: Projekt-Default zeigt nicht mehr auf freetoken-local" {
  # Positiv-Anker zuerst [T002356-M1]: die Datei existiert und traegt ueberhaupt einen Default.
  [ -f "${OPENCODE_CFG}" ]
  run grep -c '"model":' "${OPENCODE_CFG}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]

  run grep -F '"model": "freetoken-local/active"' "${OPENCODE_CFG}"
  [ "${status}" -ne 0 ]
}

@test "T900164: Factory-Default in loadouts.json zeigt nicht mehr auf freetoken-local" {
  run jq -e '.loadouts[] | select(.slug=="qwen38-220k")' "${LOADOUTS}"
  [ "${status}" -eq 0 ]

  run jq -r '.factory.model' "${LOADOUTS}"
  [ "${output}" != "freetoken-local" ]
}

@test "T900164: loadouts.json enthaelt keinen freetoken-local-Loadout-Eintrag mehr" {
  run jq -e '.loadouts[] | select(.slug=="freetoken-local")' "${LOADOUTS}"
  [ "${status}" -ne 0 ]
}

@test "T900164: route-provider.sh verdrahtet keinen :1919-Fallback mehr" {
  [ -f "${ROUTE_PROVIDER}" ]
  run grep -c 'baseUrl\|BASEURL' "${ROUTE_PROVIDER}"
  [ "${status}" -eq 0 ]
  [ "${output}" -gt 0 ]

  run grep -F '127.0.0.1:1919' "${ROUTE_PROVIDER}"
  [ "${status}" -ne 0 ]
}

@test "T900164: routing-check.sh probt Port 1919 nicht mehr" {
  [ -f "${ROUTING_CHECK}" ]
  run grep -F '127.0.0.1:1919' "${ROUTING_CHECK}"
  [ "${status}" -ne 0 ]
}
