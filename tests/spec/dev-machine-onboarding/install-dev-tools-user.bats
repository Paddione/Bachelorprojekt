#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/install-dev-tools-user.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding/spec.md
# Pruefmodus: Laufzeit-Output von `install-dev-tools.sh --print-dev-user` (kein root,
# keine Installation); geprueft wird der aufgeloeste Ziel-Benutzer und der Exit-Code.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/install-dev-tools.sh"
}

@test "install-dev-tools: unter sudo ist der aufrufende Benutzer das Ziel" {
  run env -u DEV_USER -u DEV_USERS SUDO_USER=alice bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "alice" ]
}

@test "install-dev-tools: ohne sudo ist der ausfuehrende Benutzer das Ziel" {
  run env -u DEV_USER -u DEV_USERS -u SUDO_USER bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "$(id -un)" ]
}

@test "install-dev-tools: DEV_USER ueberschreibt den aufrufenden Benutzer (cloud-init-Pfad)" {
  run env -u DEV_USERS SUDO_USER=alice DEV_USER=gekko bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "gekko" ]
}

@test "install-dev-tools: der DEV_USERS-Mehrbenutzerpfad endet mit Exit 2" {
  # Positiv-Anker: der Einbenutzer-Aufruf loest auf
  run env -u DEV_USER -u DEV_USERS SUDO_USER=alice bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "alice" ]
  run env -u DEV_USER DEV_USERS="patrick gekko" bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 2 ]
}
