#!/usr/bin/env bats
# T013141 — OpenCode-Default und persistente Proxy-Registry muessen gemeinsam
# auf qwen38-220k zeigen; sonst kann ein Default-Request Gemma laden und Qwen aus
# der gemeinsamen chat-gpu exclusiveGroup verdraengen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CONFIG="${REPO_ROOT}/.opencode/opencode.jsonc"
  MIGRATION="${REPO_ROOT}/scripts/migrations/2026-08-22-llm-proxy-qwen38-backend.sql"
}

@test "T013141: project default selects qwen38-220k" {
  run grep -F '"model": "llamacpp-local/qwen38-220k"' "${CONFIG}"
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
