#!/usr/bin/env bats
# Tests for scripts/git-crypt-guard.sh — verifies the encryption-detection logic
# that the pre-commit hook and CI rely on.

setup() {
  GUARD="$BATS_TEST_DIRNAME/../../scripts/git-crypt-guard.sh"
  TMP="$(mktemp -d)"
  # 10-byte git-crypt magic header (NUL G I T C R Y P T NUL) + payload
  printf '\000GITCRYPT\000ciphertextpayload' > "$TMP/encrypted.bin"
  printf 'PASSWORD: hunter2\n'                > "$TMP/plaintext.yaml"
  : > "$TMP/empty"
}

teardown() { rm -rf "$TMP"; }

@test "is-encrypted: exit 0 for a git-crypt header" {
  run bash "$GUARD" is-encrypted "$TMP/encrypted.bin"
  [ "$status" -eq 0 ]
}

@test "is-encrypted: nonzero for plaintext" {
  run bash "$GUARD" is-encrypted "$TMP/plaintext.yaml"
  [ "$status" -ne 0 ]
}

@test "is-encrypted: nonzero for empty file" {
  run bash "$GUARD" is-encrypted "$TMP/empty"
  [ "$status" -ne 0 ]
}

@test "is-encrypted: nonzero for missing file" {
  run bash "$GUARD" is-encrypted "$TMP/does-not-exist"
  [ "$status" -ne 0 ]
}

@test "usage: unknown subcommand exits 2" {
  run bash "$GUARD" bogus
  [ "$status" -eq 2 ]
}
