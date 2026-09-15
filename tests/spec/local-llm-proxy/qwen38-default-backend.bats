#!/usr/bin/env bats
# T900164 — Der Projekt-Default zeigt wieder auf den llamacpp-Stack:
# llamacpp-local/qwen38-220k via llm-proxy (:18235, Loadout Port 8094).
# Der FreeToken-Alias "active" ist decommissioned (T900164) — ein Default auf
# freetoken-local/active waere ein toter Backend-Aufruf. Der Migrations-Pin
# auf das historische qwen38-Backend bleibt unveraendert (Historie, kein Ist).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CONFIG="${REPO_ROOT}/.opencode/opencode.jsonc"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-22-llm-proxy-qwen38-backend.sql"
}

@test "T900164: project default selects the llamacpp qwen38-220k loadout" {
  # Positiv-Anker: der Default ist gesetzt und zeigt auf den aktiven Loadout.
  run grep -F '"model": "llamacpp-local/qwen38-220k"' "${CONFIG}"
  [ "${status}" -eq 0 ]

  # Negativ-Aussage: der decommissioned FreeToken-Alias ist nicht mehr Default.
  run grep -F '"model": "freetoken-local/active"' "${CONFIG}"
  [ "${status}" -ne 0 ]
}

@test "T013141: migration registers the qwen38 proxy backend" {
  [ -f "${MIGRATION}" ]

  run grep -F "'llamacpp-qwen38', 'llamacpp', 'http://127.0.0.1:8094/v1'" "${MIGRATION}"
  [ "${status}" -eq 0 ]

  run grep -F "'{\"qwen38-220k\":\"qwen38-220k\"}'::jsonb, 1" "${MIGRATION}"
  [ "${status}" -eq 0 ]

  run grep -F 'ON CONFLICT (name) DO UPDATE' "${MIGRATION}"
  [ "${status}" -eq 0 ]
}
