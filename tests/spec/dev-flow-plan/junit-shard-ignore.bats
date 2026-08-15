#!/usr/bin/env bats
# tests/spec/dev-flow-plan/junit-shard-ignore.bats
# Ticket: T006368 — spec-junit-shard-*-Artefakte in .gitignore aufnehmen

setup() {
  export REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
}

@test "spec-junit-shard-1/report.xml is ignored by git" {
  cd "$REPO_ROOT"
  run git check-ignore -q spec-junit-shard-1/report.xml
  [ "$status" -eq 0 ]
}

@test "spec-junit-shard-4/report.xml is ignored by git" {
  cd "$REPO_ROOT"
  run git check-ignore -q spec-junit-shard-4/report.xml
  [ "$status" -eq 0 ]
}

@test "junit-report/report.xml remains ignored by git" {
  cd "$REPO_ROOT"
  run git check-ignore -q junit-report/report.xml
  [ "$status" -eq 0 ]
}

@test "vitest-junit-report/report.xml remains ignored by git" {
  cd "$REPO_ROOT"
  run git check-ignore -q vitest-junit-report/report.xml
  [ "$status" -eq 0 ]
}
