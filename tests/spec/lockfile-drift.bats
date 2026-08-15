#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T001224: components/website/package-lock.json is not tracked by git" {
  run git ls-files --error-unmatch components/website/package-lock.json
  [ "$status" -ne 0 ]
}

@test "T001224: components/website/.gitignore ignores package-lock.json" {
  grep -q "package-lock.json" "$REPO_ROOT/components/website/.gitignore"
}
