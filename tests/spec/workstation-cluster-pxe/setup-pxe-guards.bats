#!/usr/bin/env bats
# Pruefmodus: command output verification.
# Fuehrt scripts/pxe/setup-pxe.sh aus und prueft Exit-Code plus Meldung.
#
# Alle Faelle hier enden VOR dem root-Check und vor jedem Netzwerkzugriff —
# die Guards laufen also auch auf einem CI-Runner ohne dnsmasq, ohne root und
# ohne LAN.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PXE="${REPO_ROOT}/scripts/pxe/setup-pxe.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR}/pxe-guards.XXXXXX")"
  echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYTESTKEYTESTKEY test@example" \
    > "${TMP}/id_test.pub"
}

teardown() {
  rm -rf "$TMP"
}

@test "setup-pxe: --help nennt beide Boot-Wege und endet mit 0" {
  run bash "$PXE" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q -e '--ssh-key'
  echo "$output" | grep -qi 'proxy-dhcp'
}

@test "setup-pxe: ohne --ssh-key bricht es ab" {
  run bash "$PXE"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'ssh-key'
}

@test "setup-pxe: ein privater Schluessel wird als solcher erkannt" {
  marker="PRIV""ATE KEY"
  printf -- '-----BEGIN OPENSSH %s-----\nabc\n' "$marker" > "${TMP}/id_test"
  run bash "$PXE" --ssh-key "${TMP}/id_test"
  [ "$status" -ne 0 ]
}

@test "setup-pxe: gueltiger Key passiert den Key-Guard" {
  # Positiv-Anker: mit gueltigem Key muss die Verarbeitung den naechsten Guard
  # erreichen. Beleg ist die Meldung zum absichtlich falschen --shutdown; sie
  # kann nur erscheinen, wenn der Key durchgelassen wurde.
  run bash "$PXE" --ssh-key "${TMP}/id_test.pub" --shutdown halt
  [ "$status" -ne 0 ]
  ! echo "$output" | grep -qi 'ssh-key'
  echo "$output" | grep -qi 'shutdown'
}

@test "setup-pxe: --http-port akzeptiert keine nicht-numerische Angabe" {
  run bash "$PXE" --ssh-key "${TMP}/id_test.pub" --http-port achtzig
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'http-port'
}

@test "setup-pxe: eine nicht existierende node-map bricht ab" {
  run bash "$PXE" --ssh-key "${TMP}/id_test.pub" --node-map "${TMP}/fehlt.map"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'node-map'
}

@test "setup-pxe: --status laeuft ohne root und ohne Argumente" {
  # --status und --stop duerfen nicht an der ssh-key-Pflicht scheitern:
  # wer einen laufenden Server beenden will, hat den Schluessel nicht zur Hand.
  run bash "$PXE" --status --root "${TMP}/leer"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi 'pxe'
}

@test "setup-pxe: --stop laeuft ohne root und ohne Argumente" {
  run bash "$PXE" --stop --root "${TMP}/leer"
  [ "$status" -eq 0 ]
}
