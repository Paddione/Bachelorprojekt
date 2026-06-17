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
