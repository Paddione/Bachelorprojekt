#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T001224: website/package-lock.json is not tracked by git" {
  run git ls-files --error-unmatch website/package-lock.json
  [ "$status" -ne 0 ]
}

@test "T001224: website/.gitignore ignores package-lock.json" {
  grep -q "package-lock.json" "$REPO_ROOT/website/.gitignore"
}
