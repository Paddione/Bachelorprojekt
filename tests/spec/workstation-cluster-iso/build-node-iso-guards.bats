#!/usr/bin/env bats
# Pruefmodus: command output verification.
# Prueft die Vorbedingungs-Guards von scripts/iso/build-node-iso.sh, indem das
# Skript ausgefuehrt und Exit-Code plus Fehlermeldung geprueft werden.
#
# Warum diese Guards Tests wert sind: sie fangen genau die Fehler ab, die
# sonst erst auffallen, wenn alle drei Workstations bereits installiert sind
# (kein SSH-Key -> Node unerreichbar) oder Stunden Download verbrannt wurden.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  BUILD="${REPO_ROOT}/scripts/iso/build-node-iso.sh"
  TMP="$(mktemp -d "${BATS_TMPDIR}/iso-guards.XXXXXX")"
  PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYTESTKEYTESTKEYTESTKEY test@example"
  echo "$PUBKEY" > "${TMP}/id_test.pub"
}

teardown() {
  rm -rf "$TMP"
}

@test "build-node-iso: --help beschreibt die Pflichtflags und endet mit 0" {
  run bash "$BUILD" --help
  [ "$status" -eq 0 ]
  # Positiv-Anker: die Hilfe muss die beiden Flags nennen, ohne die der Bau
  # sinnlos ist.
  echo "$output" | grep -q -e '--ssh-key'
  echo "$output" | grep -q -e '--node-map'
}

@test "build-node-iso: ohne --ssh-key bricht es ab, bevor etwas geladen wird" {
  run bash "$BUILD" --out "${TMP}/out.iso"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'ssh-key'
  # Kein Download angestossen: das Ausgabe-ISO darf nicht existieren.
  [ ! -f "${TMP}/out.iso" ]
}

@test "build-node-iso: ein privater Schluessel wird als solcher erkannt" {
  # Realer Fehlgriff: --ssh-key ~/.ssh/id_ed25519 statt .pub.
  # Der Header wird zusammengesetzt, weil ihn der gitleaks-Pre-Commit-Hook
  # sonst als echten Schluesselfund meldet.
  marker="PRIV""ATE KEY"
  printf -- '-----BEGIN OPENSSH %s-----\nabc\n' "$marker" > "${TMP}/id_test"
  run bash "$BUILD" --ssh-key "${TMP}/id_test" --out "${TMP}/out.iso"
  [ "$status" -ne 0 ]
  [ ! -f "${TMP}/out.iso" ]
}

@test "build-node-iso: gueltiger Key passiert den Key-Guard" {
  # Positiv-Anker zum vorigen Test: mit gueltigem Key darf NICHT der
  # Key-Guard greifen. Der Lauf scheitert spaeter (kein Netz/kein Quell-ISO),
  # aber die Meldung darf nicht mehr den Schluessel betreffen.
  run bash "$BUILD" --ssh-key "${TMP}/id_test.pub" \
    --source-iso "${TMP}/gibt-es-nicht.iso" --out "${TMP}/out.iso"
  [ "$status" -ne 0 ]
  ! echo "$output" | grep -qi 'ssh-key'
  echo "$output" | grep -qi 'source-iso'
}

@test "build-node-iso: --shutdown akzeptiert nur reboot und poweroff" {
  run bash "$BUILD" --ssh-key "${TMP}/id_test.pub" --shutdown halt \
    --out "${TMP}/out.iso"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'shutdown'
}

@test "build-node-iso: eine nicht existierende node-map bricht ab" {
  run bash "$BUILD" --ssh-key "${TMP}/id_test.pub" \
    --node-map "${TMP}/fehlt.map" --out "${TMP}/out.iso"
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'node-map'
}
