#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/git-crypt-gpg.bats
# T900113: dev-shell entsperrt git-crypt per GPG-User (patrick/gekko) statt Keyfile.
#
# Pruefmodus: Konfiguration. Das Image-Paket und die dokumentierte Zeremonie
# manifestieren sich in versionierten Dateien (Ausnahme laut tests/CLAUDE.md).
# Die einmalige add-gpg-user-Zeremonie selbst laeuft beim Operator mit
# entsperrtem Checkout (P2.3, manuell) und committet danach die .gpg-Keyfiles.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  DOCKERFILE="${REPO_ROOT}/docker/dev-shell/Dockerfile"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/git-crypt-key-distribution.md"
}

@test "T900113: dev-shell image installs gnupg" {
  run grep -qF "gnupg" "$DOCKERFILE"
  [ "$status" -eq 0 ]
}

@test "T900113: dev-shell image installs pinentry for headless unlocking" {
  run grep -qF "pinentry" "$DOCKERFILE"
  [ "$status" -eq 0 ]
}

@test "T900113: runbook documents the GPG ceremony (add-gpg-user, GPG_TTY, agent lifetime)" {
  run grep -qF "add-gpg-user" "$RUNBOOK"
  [ "$status" -eq 0 ]
  run grep -qF "GPG_TTY" "$RUNBOOK"
  [ "$status" -eq 0 ]
}
