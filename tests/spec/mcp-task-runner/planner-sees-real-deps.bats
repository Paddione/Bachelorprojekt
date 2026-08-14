#!/usr/bin/env bats
# tests/spec/mcp-task-runner/planner-sees-real-deps.bats
# SSOT-Spec: openspec/specs/mcp-task-runner.md
#
# Failing Test für T005596: planner.Parse liest deps aus `task --list-all --json`,
# das go-task 3.52.0 nicht mehr liefert → plan_tasks baut einen kantenlosen
# Graphen und liefert immer genau eine Gruppe. Dieser Test läuft GEGEN DEN
# ECHTEN Taskfile-Graphen (kein fake task-Binary): workspace:transcriber-push
# deklariert deps: [workspace:transcriber-build] (Taskfile.yml) — plan_tasks
# muss zwei Gruppen liefern, build vor push.

setup() {
  # T002820: Verfügbarkeits-Guard — ohne Binary misst der Test die
  # Runner-Ausstattung statt des Codes.
  command -v mcp-task-runner >/dev/null 2>&1 || skip "mcp-task-runner binary not installed"
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

_mcp_plan() {
  local json="$1"
  printf '%s\n' "$json" | mcp-task-runner --taskfile "${REPO_ROOT}/Taskfile.yml" 2>/dev/null
}

@test "plan_tasks sequences a real declared dependency into two groups (T005596)" {
  req='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"plan_tasks","arguments":{"tasks":[{"task":"workspace:transcriber-push","env":"dev"},{"task":"workspace:transcriber-build","env":"dev"}]}}}'
  run _mcp_plan "$req"
  [ "$status" -eq 0 ]

  groups="$(echo "$output" | jq -r '.result.content[0].text' | jq -r '.groups')"

  # Positiv-Anker (T002356-M1): die deps-Kante steht wirklich in der YAML-Quelle —
  # der Test prüft das Verhalten gegen diese deklarierte Kante.
  grep -qF -- 'deps: [workspace:transcriber-build]' "${REPO_ROOT}/Taskfile.yml"

  [ "$(echo "$groups" | jq 'length')" -eq 2 ]
  echo "$groups" | jq -e '.[0].tasks[0].task == "workspace:transcriber-build"' >/dev/null
  echo "$groups" | jq -e '.[1].tasks[0].task == "workspace:transcriber-push"' >/dev/null
}
