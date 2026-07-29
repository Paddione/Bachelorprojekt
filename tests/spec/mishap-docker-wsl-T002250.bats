#!/usr/bin/env bats
# tests/spec/mishap-docker-wsl-T002250.bats
# T002250 — Mishap-Bundle: environment/docker-wsl

load 'test_helper'

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "T002250-M1: setup.sh removes credsStore in WSL" {
  local mock_home
  mock_home=$(mktemp -d)
  mkdir -p "$mock_home/.docker"
  
  # Create a mock config.json containing credsStore
  echo '{"auths":{"ghcr.io":{}},"credsStore":"desktop.exe"}' > "$mock_home/.docker/config.json"
  
  # Run setup.sh with mock HOME and WSL env
  HOME="$mock_home" WSL_DISTRO_NAME="test-wsl" run bash "$REPO/scripts/setup.sh" --check
  [ "$status" -eq 0 ]
  
  # Verify config.json exists and credsStore is removed
  [ -f "$mock_home/.docker/config.json" ]
  local creds
  creds=$(jq -r '.credsStore // empty' "$mock_home/.docker/config.json")
  [ -z "$creds" ]
  
  rm -rf "$mock_home"
}

@test "T002250-M2: renovate workflow has --dns 1.1.1.1" {
  local workflow="$REPO/.github/workflows/renovate.yml"
  [ -f "$workflow" ]
  run grep -q -E '--dns[[:space:]]+1\.1\.1\.1' "$workflow"
  [ "$status" -eq 0 ]
}

@test "T002250-M2: sandbox-run.sh runs docker with --dns 1.1.1.1 in WSL" {
  local script="$REPO/scripts/factory/sandbox-run.sh"
  [ -f "$script" ]
  # We should check if the script runs docker run with --dns 1.1.1.1 when WSL is detected or if it is configured
  run grep -q -E '--dns[[:space:]]+1\.1\.1\.1' "$script"
  [ "$status" -eq 0 ]
}
