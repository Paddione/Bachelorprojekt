#!/usr/bin/env bats
# tests/spec/finetune-hf-jobs.bats
# SSOT: openspec/changes/wsl-exit-hf-jobs/specs/modell-registry-training-grounds.md [T016438]

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  README="${REPO_ROOT}/scripts/finetune/README.md"
  TASKFILE="${REPO_ROOT}/taskfiles/Taskfile.finetune.yml"
}

@test "finetune README names HF Jobs as the primary post-WSL path" {
  [ -f "$README" ]
  grep -q "HF Jobs Cloud (primär" "$README"
  grep -qi "Trackio" "$README"
  grep -qi "deprecated" "$README"
}

@test "taskfile ships hf-jobs targets without secrets or hardcoded hosts" {
  grep -q "hf-jobs:train:" "$TASKFILE"
  grep -q "hf-jobs:export:" "$TASKFILE"
  # Kein Klartext-Token, kein Hostname-Literal in den neuen Targets:
  ! grep -Eq "hf_[A-Za-z0-9]{20,}|https://[a-z0-9.-]+\.(de|com|org)" "$TASKFILE"
  grep -q "HF_TOKEN erforderlich\|HF_TOKEN ist nicht gesetzt" "$TASKFILE"
}
