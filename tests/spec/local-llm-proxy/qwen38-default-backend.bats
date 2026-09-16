#!/usr/bin/env bats
# T900164/T900189 — Der Projekt-Default zeigt auf den FreeToken-Alias:
# llamacpp-local/Qwen3.6-35B-A3B-NVFP4 via llm-proxy (:18235, FreeToken :1919).
# T900203: Der fruehere Default llamacpp-local/qwen38-220k (Loadout Port 8094,
# decommissioned) ist abgeloest; freetoken-local/active existiert nicht mehr.
# Der Migrations-Pin auf das historische qwen38-Backend bleibt unveraendert
# (Historie, kein Ist).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CONFIG="${REPO_ROOT}/.opencode/opencode.jsonc"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-22-llm-proxy-qwen38-backend.sql"
}

@test "T900164/T900189: project default selects the FreeToken Qwen3.6 alias loadout" {
  # Positiv-Anker: der Default ist gesetzt und zeigt auf den aktiven
  # FreeToken-gestuetzten Checkpoint (SSOT: Project Default Model Targets
  # the FreeToken Alias).
  run grep -F '"model": "llamacpp-local/Qwen3.6-35B-A3B-NVFP4"' "${CONFIG}"
  [ "${status}" -eq 0 ]

  # Negativ-Aussagen: weder das decommissioned qwen38-Loadout noch der
  # entfernte freetoken-local/active-Alias ist Default.
  run grep -F '"model": "llamacpp-local/qwen38-220k"' "${CONFIG}"
  [ "${status}" -ne 0 ]
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
