#!/usr/bin/env bats
# tests/spec/factory-merge-hooks.bats
# Verifies merge-hooks.sh logic, specifically partial-plan completeness checks.

setup() {
  load 'test_helper.bash'
  TEST_TMP_DIR="$BATS_TEST_TMPDIR/merge-hooks-$$"
  mkdir -p "$TEST_TMP_DIR/openspec/changes/t002102-test-feature/tasks.d"
}

teardown() {
  rm -rf "$TEST_TMP_DIR" 2>/dev/null || true
}

@test "merge-hooks: passes when no multi-partial tasks.d dir exists" {
  run bash scripts/factory/merge-hooks.sh T009999 "$TEST_TMP_DIR"
  [ "$status" -eq 0 ]
}

@test "merge-hooks: blocks closure when multi-partial tasks.md has unchecked tasks" {
  local change_dir="$TEST_TMP_DIR/openspec/changes/t002102-test-feature"
  cat > "$change_dir/tasks.md" <<'EOF'
# Plan
## Partials
| id | file | role | target_files |
|----|------|------|--------------|
| p1 | tasks.d/p1.md | impl | a.sh |
| p2 | tasks.d/p2.md | impl | b.sh |

- [x] Task 1 done
- [ ] Task 2 pending
EOF
  cat > "$change_dir/tasks.d/p1.md" <<'EOF'
- [x] p1 done
EOF
  cat > "$change_dir/tasks.d/p2.md" <<'EOF'
- [ ] p2 pending
EOF

  run bash scripts/factory/merge-hooks.sh T002102 "$TEST_TMP_DIR"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "incomplete tasks" ]]
}

@test "merge-hooks: passes closure when all partial tasks are completed" {
  local change_dir="$TEST_TMP_DIR/openspec/changes/t002102-test-feature"
  cat > "$change_dir/tasks.md" <<'EOF'
# Plan
## Partials
| id | file | role | target_files |
|----|------|------|--------------|
| p1 | tasks.d/p1.md | impl | a.sh |
| p2 | tasks.d/p2.md | impl | b.sh |

- [x] Task 1 done
- [x] Task 2 done
EOF
  cat > "$change_dir/tasks.d/p1.md" <<'EOF'
- [x] p1 done
EOF
  cat > "$change_dir/tasks.d/p2.md" <<'EOF'
- [x] p2 done
EOF

  run bash scripts/factory/merge-hooks.sh T002102 "$TEST_TMP_DIR"
  [ "$status" -eq 0 ]
}
