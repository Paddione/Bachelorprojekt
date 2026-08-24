#!/usr/bin/env bats
# T016419 — Der Projekt-Default zeigt auf den modellagnostischen FreeToken-Alias
# "active". Der alte llama.cpp-Stack (:18235) ist stillgelegt — ein Default auf
# llamacpp-local/qwen38-220k waere ein toter Backend-Aufruf. Der Migrations-Pin
# auf das historische qwen38-Backend bleibt unveraendert (Historie, kein Ist).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CONFIG="${REPO_ROOT}/.opencode/opencode.jsonc"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-22-llm-proxy-qwen38-backend.sql"
}

@test "T016419: project default selects the freetoken alias" {
  run grep -F '"model": "freetoken-local/active"' "${CONFIG}"
  [ "${status}" -eq 0 ]
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
