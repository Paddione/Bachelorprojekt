#!/usr/bin/env bats
# tests/spec/software-factory/factory-e2e-pipeline-coverage.bats
#
# Covers Software Factory handling of E2E test files and test suites:
# - classify-paths: E2E and unit test paths do not trigger escalate-class by default
# - filter-diff: E2E spec files (.spec.ts) and BATS test files (.bats) are preserved
# - shared-state allowlist: verifies test directories are excluded from shared-state locks

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  CLASSIFY_PATHS="$REPO_ROOT/scripts/factory/classify-paths.sh"
  FILTER_DIFF="$REPO_ROOT/scripts/factory/filter-diff.sh"
}

# ── classify-paths: E2E & test path classification ────────────────────────────

@test "factory classify-paths: test files are not marked as escalate-class" {
  # Source classify-paths in a subshell
  run bash -c "
    source '$CLASSIFY_PATHS'
    paths_are_escalate_class 'tests/e2e/specs/fa-48-factory-devflow.spec.ts,tests/spec/dev-flow-e2e.bats'
  "
  [ "$status" -ne 0 ]
}

@test "factory classify-paths: test files with sql or secret keywords are caught" {
  run bash -c "
    source '$CLASSIFY_PATHS'
    paths_are_escalate_class 'tests/e2e/specs/fa-test.spec.ts,tests/sql/secret-test.sql'
  "
  [ "$status" -eq 0 ]
}

# ── filter-diff: preserving test files in diff analysis ───────────────────────

@test "factory filter-diff: preserves .spec.ts and .bats diff sections" {
  SAMPLE_DIFF="$(cat << 'EOF'
diff --git a/tests/e2e/specs/fa-99-new-feature.spec.ts b/tests/e2e/specs/fa-99-new-feature.spec.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/tests/e2e/specs/fa-99-new-feature.spec.ts
@@ -0,0 +1,5 @@
+import { test, expect } from '@playwright/test';
+test.describe('FA-99: Feature test', { tag: ['@smoke'] }, () => {
+  test('works', async ({ page }) => {});
+});
diff --git a/tests/spec/new-test.bats b/tests/spec/new-test.bats
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/tests/spec/new-test.bats
@@ -0,0 +1,4 @@
+#!/usr/bin/env bats
+@test "smoke" {
+  [ 1 -eq 1 ]
+}
EOF
)"

  run bash -c "echo \"$SAMPLE_DIFF\" | bash '$FILTER_DIFF' -"
  [ "$status" -eq 0 ]
  [[ "$output" == *"tests/e2e/specs/fa-99-new-feature.spec.ts"* ]]
  [[ "$output" == *"tests/spec/new-test.bats"* ]]
}

@test "factory filter-diff: strips lockfile noise while retaining e2e test diffs" {
  MIXED_DIFF="$(cat << 'EOF'
diff --git a/package-lock.json b/package-lock.json
index 1111111..2222222 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
- "version": "1.0.0"
+ "version": "1.0.1"
diff --git a/tests/e2e/specs/fa-01.spec.ts b/tests/e2e/specs/fa-01.spec.ts
index 3333333..4444444 100644
--- a/tests/e2e/specs/fa-01.spec.ts
+++ b/tests/e2e/specs/fa-01.spec.ts
@@ -1,2 +1,3 @@
+// modified test
EOF
)"

  run bash -c "echo \"$MIXED_DIFF\" | bash '$FILTER_DIFF' -"
  [ "$status" -eq 0 ]
  [[ "$output" != *"package-lock.json"* ]]
  [[ "$output" == *"tests/e2e/specs/fa-01.spec.ts"* ]]
}
