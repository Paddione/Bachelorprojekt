#!/usr/bin/env bats
# Regression test for T000478.
#
# Collabora WOPI: One office-stack instance serves both brands on fleet.
# The empty COLLABORA_SERVER_NAME fix (coolwsd derives server_name from
# Host header) is already in place, BUT single-brand deploys
# (workspace:office:deploy) overwrite the Ingress and DROP the other
# brand's host — only fleet:deploy:shared-services sets both hosts.
#
# This test guards against regressions:
#   A) single-brand deploy accidentally run on a prod env → must warn/block
#   B) COLLABORA_SERVER_NAME stays empty in ALL deploy paths
#   C) fleet:deploy:shared-services sets BOTH COLLABORA_HOST + COLLABORA_HOST_2
#
# RED until guards are in place; GREEN after.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE_PLATFORM="$REPO_ROOT/taskfiles/Taskfile.platform.yml"
  TASKFILE_WORKSPACE="$REPO_ROOT/taskfiles/Taskfile.workspace.yml"
}

# Total matching lines across the whole Taskfile suite (root + taskfiles/).
suite_count() {
  grep -rhE "$1" "$REPO_ROOT/Taskfile.yml" "$REPO_ROOT/taskfiles/" 2>/dev/null | wc -l | tr -d ' '
}

@test "T000478: fleet:shared-services sets COLLABORA_HOST_2 to a non-empty value" {
  # The fleet deploy must set a second host so the Ingress serves both brands.
  run bash -c "grep -A100 '^  fleet:shared-services:' $TASKFILE_PLATFORM | grep 'COLLABORA_HOST_2='"
  [ "$status" -eq 0 ]
  # Must NOT be empty
  [[ "$output" != *'COLLABORA_HOST_2=""'* ]] || false
}

@test "T000478: COLLABORA_SERVER_NAME stays empty in ALL deploy paths" {
  total=$(suite_count 'export[[:space:]]+COLLABORA_SERVER_NAME=')
  empty=$(suite_count 'export[[:space:]]+COLLABORA_SERVER_NAME=""')
  [ "$total" -ge 1 ]
  [ "$total" -eq "$empty" ]
}

@test "T000478: workspace:office:deploy has a prod-safety guard (blocks single-brand deploy on fleet)" {
  # Single-brand deploys overwrite the Ingress and drop the other brand's host.
  # The workspace:office:deploy task MUST either:
  #   a) refuse to run on prod contexts, OR
  #   b) warn that fleet:deploy:shared-services should be used instead
  # Note: run cmd | pipe doesn't work in bats (run captures stdout internally);
  # use run bash -c "pipeline" to capture the whole pipeline's exit code.
  run bash -c "grep -A100 'workspace:office:deploy:' '$TASKFILE_WORKSPACE' | grep -iE 'fleet|prod|shared|ENV.*dev|only.*dev|block'"
  [ "$status" -eq 0 ] || {
    echo "FAIL: workspace:office:deploy has no prod guard." >&2
    echo "      On fleet, use fleet:deploy:shared-services instead." >&2
    false
  }
}
