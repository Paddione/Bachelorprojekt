#!/usr/bin/env bats
# Tests for scripts/preflight-pr-scope.sh — validate PR title scope against
# the semantic-PR allowlist before `gh pr create`. [T000925]

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/preflight-pr-scope.sh"
  TMP="$(mktemp -d)"

  # Fixture ci.yml with a minimal commit-lint scopes list
  FIXTURE="$TMP/ci.yml"
  cat > "$FIXTURE" <<'EOF'
name: CI-TEST
on:
  pull_request:
    branches: [main]
jobs:
  commit-lint:
    name: Conventional Commits
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: amannn/action-semantic-pull-request@v5.5.3
        with:
          types: |
            feat
            fix
            chore
          scopes: |
            website
            admin
            db
            ops
            factory
          subjectPattern: ^.{1,200}$
EOF

  # Isolated git fixture [T001723]: the script's branch/worktree guards
  # ([T001592]) call `git symbolic-ref --short HEAD`, which is meaningless
  # against the *ambient* checkout — a CI `pull_request` run checks out a
  # detached HEAD, so running the script straight from $BATS_TEST_DIRNAME's
  # repo made every test here FATAL in CI while passing locally. Give the
  # script its own throwaway repo with a real branch (not main/master, not
  # feature/*|fix/*) checked out so these tests exercise scope-parsing only.
  git -C "$TMP" init -q -b test-fixture
  git -C "$TMP" config user.email "test@example.invalid"
  git -C "$TMP" config user.name "Test Fixture"
  git -C "$TMP" commit -q --allow-empty -m "fixture"
  cd "$TMP"
}

teardown() { rm -rf "$TMP"; }

@test "preflight: valid scope exits 0" {
  run bash "$HELPER" "feat(admin): add dashboard" "$FIXTURE"
  [ "$status" -eq 0 ]
}

@test "preflight: invalid scope exits non-zero with help" {
  run bash "$HELPER" "feat(cockpit): add view" "$FIXTURE"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "NOT in the semantic-PR allowlist"
  echo "$output" | grep -q "website"
}

@test "preflight: scope-less title exits 0" {
  run bash "$HELPER" "docs: update readme" "$FIXTURE"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "no scope"
}

@test "preflight: missing workflow file exits 2" {
  run bash "$HELPER" "feat(admin): x" "/nonexistent/ci.yml"
  [ "$status" -eq 2 ]
}

@test "preflight: multi-dash scope (dev-flow) is recognized" {
  run bash "$HELPER" "fix(ops): restart pod" "$FIXTURE"
  [ "$status" -eq 0 ]
}

@test "preflight: scope with breaking change marker exits 0 for valid scope" {
  run bash "$HELPER" "feat(db)!: breaking schema" "$FIXTURE"
  [ "$status" -eq 0 ]
}
