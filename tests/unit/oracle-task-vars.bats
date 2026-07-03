#!/usr/bin/env bats
# oracle-task-vars.bats — task_required_var / materialize_task_env_arg [T001583]
#
# Regression coverage for mishap 3 (T001583): task-oracle used to always
# emit `ENV=<token>`, even for tasks whose Taskfile.yml `requires:` block
# declares `BRAND` (e.g. fleet:deploy:brand), producing a plausible-looking
# but non-runnable `cmd` field.

bats_require_minimum_version 1.5.0
load test_helper

setup() {
  FIXTURE_DIR="${BATS_TEST_TMPDIR}/fixture"
  mkdir -p "$FIXTURE_DIR"
  cat > "${FIXTURE_DIR}/Taskfile.yml" <<'EOF'
version: '3'

tasks:
  workspace:deploy:
    desc: "Deploy workspace services"
    cmds:
      - echo deploy

  fleet:deploy:brand:
    desc: "Deploy ONE brand's core stack to fleet"
    requires:
      vars: [BRAND]
    cmds:
      - echo deploy-brand

  test:all:
    desc: "Run all offline tests"
    cmds:
      - echo test
EOF

  source "${PROJECT_DIR}/scripts/vda/oracle-task-vars.sh"
}

@test "task_required_var detects ENV-requiring task" {
  run task_required_var "workspace:deploy" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  # workspace:deploy has no explicit requires: block in this fixture — empty
  [ -z "$output" ]
}

@test "task_required_var detects BRAND-requiring task" {
  run task_required_var "fleet:deploy:brand" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "BRAND" ]
}

@test "task_required_var returns empty for task with no vars" {
  run task_required_var "test:all" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "materialize_task_env_arg maps mentolder token to BRAND=fleet-mentolder" {
  run materialize_task_env_arg "fleet:deploy:brand" "mentolder" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "BRAND=fleet-mentolder" ]
}

@test "materialize_task_env_arg passes through an already-prefixed fleet- token" {
  run materialize_task_env_arg "fleet:deploy:brand" "fleet-korczewski" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "BRAND=fleet-korczewski" ]
}

@test "materialize_task_env_arg emits ENV= for a plain workspace task" {
  run materialize_task_env_arg "workspace:deploy" "mentolder" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "materialize_task_env_arg is empty for a task requiring neither var" {
  run materialize_task_env_arg "test:all" "mentolder" "$FIXTURE_DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}
