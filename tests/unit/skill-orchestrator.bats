#!/usr/bin/env bats

load "test_helper.bash"

setup() {
  export TEST_SKILL="${BATS_TEST_TMPDIR}/test-skill.md"
  mkdir -p "${BATS_TEST_TMPDIR}/scripts/hooks"
  
  # Create a mock skill file with hooks
  cat <<EOF > "$TEST_SKILL"
---
name: test-skill
hooks:
  pre:
    - test-pre-hook
  post:
    - test-post-hook
---
# Test Skill
EOF

  # Create mock hook scripts
  cat <<EOF > "${BATS_TEST_TMPDIR}/scripts/hooks/test-pre-hook.sh"
echo "pre-hook-executed"
EOF
  cat <<EOF > "${BATS_TEST_TMPDIR}/scripts/hooks/test-post-hook.sh"
echo "post-hook-executed"
EOF
  chmod +x "${BATS_TEST_TMPDIR}/scripts/hooks/"*.sh

  # Mock the orchestrator to use the tmp scripts dir
  export ORCHESTRATOR_TMP="${BATS_TEST_TMPDIR}/skill-orchestrator.sh"
  sed "s|scripts/hooks/|\${BATS_TEST_TMPDIR}/scripts/hooks/|g" scripts/skill-orchestrator.sh > "$ORCHESTRATOR_TMP"
  chmod +x "$ORCHESTRATOR_TMP"
}

@test "orchestrator parses and executes pre hooks" {
  run bash "$ORCHESTRATOR_TMP" "$TEST_SKILL" "pre"
  assert_success
  assert_output --partial "pre-hook-executed"
  refute_output --partial "post-hook-executed"
}

@test "orchestrator parses and executes post hooks" {
  run bash "$ORCHESTRATOR_TMP" "$TEST_SKILL" "post"
  assert_success
  assert_output --partial "post-hook-executed"
  refute_output --partial "pre-hook-executed"
}

@test "orchestrator handles missing hook scripts gracefully" {
  # Add a non-existent hook to the skill file
  sed -i '/test-pre-hook/a \    - non-existent-hook' "$TEST_SKILL"
  
  run bash "$ORCHESTRATOR_TMP" "$TEST_SKILL" "pre"
  assert_success
  assert_output --partial "pre-hook-executed"
}
