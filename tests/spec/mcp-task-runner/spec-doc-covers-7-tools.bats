#!/usr/bin/env bats
# tests/spec/mcp-task-runner/spec-doc-covers-7-tools.bats
# SSOT-Spec: openspec/specs/mcp-task-runner.md
#
# Drift-Guard zwischen mcp-task-runner-Binary und SSOT-Spec (T005480):
# MCP-TASK-RUNNER-001 prüft, dass das Binary 7 Tools registriert; dieser
# Guard prüft, dass der SSOT-Spec alle 7 dokumentiert. Ein neues Tool, das
# nur im Binary landet, färbt diesen Guard rot — die Lücke, die T005480
# geöffnet hat (Spec dokumentierte 3, Binary registrierte 7).
#
# Prüfmodus (T002448-M4): Dokumentationskonventions-Test — die Zusicherung
# manifestiert sich ausschließlich im Quelltext, grep ist das angemessene
# Mittel. Formatfreie Proben ohne Zeilenanker (T002716).

SPEC_FILE="${BATS_TEST_DIRNAME}/../../../openspec/specs/mcp-task-runner.md"

@test "MCP-TASK-RUNNER-SPEC-001: SSOT-Spec documents all seven registered tools" {
  run test -f "$SPEC_FILE"
  [ "$status" -eq 0 ]

  local tool
  for tool in plan_tasks run_task execute_plan get_task_graph run_task_async cancel_task get_task_result; do
    run grep -qF -- "$tool" "$SPEC_FILE"
    [ "$status" -eq 0 ] || { echo "SSOT-Spec dokumentiert Tool nicht: $tool" >&2; return 1; }
  done
}

@test "MCP-TASK-RUNNER-SPEC-002: tools/list scenario states seven tools, not three" {
  # Positiv-Anker (T002356-M1): erst der gültige Fall — der Spec nennt die
  # Sieben-Tool-Zahl. Fehlt die Überarbeitung, wird schon der Anker rot.
  run grep -qF -- 'seven tools' "$SPEC_FILE"
  [ "$status" -eq 0 ]

  # Negativ-Aussage: die veraltete Drei-Tool-Behauptung ist verschwunden.
  run grep -F -- 'three tools' "$SPEC_FILE"
  [ "$status" -ne 0 ]
}
