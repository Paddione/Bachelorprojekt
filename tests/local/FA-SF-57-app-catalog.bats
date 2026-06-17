#!/usr/bin/env bats
# FA-SF-57: App Catalog & Installer Tests

setup() {
  load 'test_helper.bash'
  
  # Create a temp directory for test manifests
  TEST_TMP_DIR="$BATS_TMPDIR/app-catalog-tests"
  mkdir -p "$TEST_TMP_DIR"
}

teardown() {
  rm -rf "$TEST_TMP_DIR"
}

@test "FA-SF-57: validate-manifest rejects invalid manifests" {
  cat <<EOF > "$TEST_TMP_DIR/invalid.yaml"
name: invalid_name_UPPERCASE
title: "Test App"
description: "A test app"
kustomize: k3d/test
EOF

  run node scripts/validate-manifest.mjs "$TEST_TMP_DIR/invalid.yaml"
  [ "$status" -eq 1 ]
  [[ "$output" =~ "Validation failed" ]]
}

@test "FA-SF-57: validate-manifest accepts valid manifests" {
  cat <<EOF > "$TEST_TMP_DIR/valid.yaml"
name: valid-app-name-123
title: "Test App"
description: "A test app description"
kustomize: k3d/test
domains:
  - key: TEST_DOMAIN
    host: "test.\${PROD_DOMAIN}"
EOF

  run node scripts/validate-manifest.mjs "$TEST_TMP_DIR/valid.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "is valid" ]]
}

@test "FA-SF-57: app-install.sh rejects missing app manifests" {
  run bash scripts/app-install.sh non-existent-app --dry-run
  [ "$status" -eq 1 ]
  [[ "$output" =~ "App manifest not found" ]]
}

@test "FA-SF-57: app-install.sh dry-run simulates deployment steps" {
  # Use a unique temp app name to avoid CI parallel-run collisions
  local app_name="test-mock-app-$$-$RANDOM"
  mkdir -p "apps/$app_name"
  cat <<EOF > "apps/$app_name/app.yaml"
name: $app_name
title: "Mock App"
description: "A mock app for testing"
kustomize: k3d/whiteboard
domains:
  - key: MOCK_APP_DOMAIN
    host: "mock.\${PROD_DOMAIN}"
secrets:
  - MOCK_APP_JWT_SECRET
EOF

  run env ENV=dev bash scripts/app-install.sh "$app_name" --dry-run
  local test_status=$status test_output="$output"
  # Clean up immediately regardless of test outcome
  rm -rf "apps/$app_name"

  [ "$test_status" -eq 0 ]
  [[ "$test_output" =~ "Validating manifest schema" ]]
  [[ "$test_output" =~ "Merging domains" ]]
  [[ "$test_output" =~ "Would register secret" ]]
  [[ "$test_output" =~ "Simulating deploy" ]]
}
