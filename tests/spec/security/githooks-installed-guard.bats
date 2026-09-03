#!/usr/bin/env bats
# tests/spec/security/githooks-installed-guard.bats — T900050
#
# Pruefmodus: Output-Verifikation (T002448-M4)
# Verifiziert, dass scripts/check-hooks-path.sh:
# 1. Erfolgreich ist, wenn core.hooksPath gesetzt und gueltig ist (Positiv-Anker).
# 2. Fehlschlaegt (Exit 1) mit klarer Handlungsanweisung, wenn core.hooksPath fehlt.
# 3. Fehlschlaegt (Exit 1), wenn core.hooksPath auf ein nicht existierendes Verzeichnis zeigt.
# 4. In CI uebersprungen wird (Exit 0).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/check-hooks-path.sh"
}

@test "check-hooks-path: exits 0 in CI" {
  run env CI=true bash "$GUARD"
  [ "$status" -eq 0 ]
}

@test "check-hooks-path: fails when core.hooksPath is unset" {
  local sandbox="${BATS_TEST_TMPDIR}/hooks-unset"
  mkdir -p "$sandbox"
  git -C "$sandbox" init -q
  git -C "$sandbox" config --unset-all core.hooksPath 2>/dev/null || true

  run bash -c "cd '$sandbox' && env -u CI -u GITHUB_ACTIONS bash '$GUARD'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"core.hooksPath is not set"* ]]
  [[ "$output" == *"task hooks:install"* ]]
}

@test "check-hooks-path: passes when core.hooksPath points to valid hooks directory (Positiv-Anker)" {
  local sandbox="${BATS_TEST_TMPDIR}/hooks-valid"
  mkdir -p "$sandbox/.githooks"
  touch "$sandbox/.githooks/pre-commit"
  git -C "$sandbox" init -q
  git -C "$sandbox" config core.hooksPath .githooks

  run bash -c "cd '$sandbox' && env -u CI -u GITHUB_ACTIONS bash '$GUARD'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"core.hooksPath is configured and active"* ]]
}

@test "check-hooks-path: fails when core.hooksPath points to non-existent directory" {
  local sandbox="${BATS_TEST_TMPDIR}/hooks-broken"
  mkdir -p "$sandbox"
  git -C "$sandbox" init -q
  git -C "$sandbox" config core.hooksPath .nonexistent-hooks

  run bash -c "cd '$sandbox' && env -u CI -u GITHUB_ACTIONS bash '$GUARD'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"directory does not exist"* ]]
}