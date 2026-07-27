#!/usr/bin/env bats
# Tests for scripts/preflight-pr-scope.sh — validate PR title scope against
# the named-scope list in commitlint.config.cjs before `gh pr create`.
# [T000925, Quelle umgestellt in T002328]

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/preflight-pr-scope.sh"
  TMP="$(mktemp -d)"

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
  run bash "$HELPER" "feat(website): add dashboard"
  [ "$status" -eq 0 ]
}

@test "preflight: invalid scope exits non-zero with help" {
  run bash "$HELPER" "feat(cockpit): add view"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "NOT in the semantic-PR allowlist"
  echo "$output" | grep -q "website"
}

@test "preflight: scope-less title exits 0" {
  run bash "$HELPER" "docs: update readme"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "no scope"
}

@test "preflight: Domaenen-Scope 'ops' wird erkannt" {
  # Hiess bis T002328 "multi-dash scope (dev-flow) is recognized" — der Name war
  # schon davor irrefuehrend (geprueft wurde stets 'ops', nie 'dev-flow'), und
  # seit der Konsolidierung enthaelt kein einziger der 14 Ziel-Scopes einen
  # Bindestrich. Der Testzweck ist damit entfallen; was bleibt, ist die
  # Erkennung eines regulaeren Domaenen-Scopes.
  run bash "$HELPER" "fix(ops): restart pod"
  [ "$status" -eq 0 ]
}

@test "preflight: scope with breaking change marker exits 0 for valid scope" {
  run bash "$HELPER" "feat(db)!: breaking schema"
  [ "$status" -eq 0 ]
}

@test "preflight: ticket-ID/branch mismatch suggests a git branch -m fix [T001915]" {
  # Mishap regression: FATAL alone left no clue how to recover. The error must
  # now propose the concrete rename command and point at the T001917 process fix.
  run bash "$HELPER" "chore(dev-flow): some chore [T001901]"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "does not match current branch"
  echo "$output" | grep -q "git branch -m"
  echo "$output" | grep -q "T001917"
}

@test "preflight: fix/* branch under a real .worktrees/ path is accepted [T001723]" {
  # Regression: the T001592 worktree-enforcement check used the broken glob
  # `*"\.worktrees/"*` (a literal backslash-dot inside a quoted pattern never
  # matches), so it silently fell through to `*"/worktrees/"*` — which does
  # NOT match a real `.worktrees/foo` path (leading dot). Every real worktree
  # created by scripts/worktree-create.sh (the repo-mandated convention) was
  # rejected with a FATAL.
  WTREE="$TMP/.worktrees/fix-example"
  mkdir -p "$WTREE"
  git -C "$TMP" worktree add -q -b fix/example "$WTREE" test-fixture
  cd "$WTREE"
  run bash "$HELPER" "fix(ops): example"
  [ "$status" -eq 0 ]
}
