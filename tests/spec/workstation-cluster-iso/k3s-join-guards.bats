#!/usr/bin/env bats
# Pruefmodus: command output verification.
# Prueft die Argument-Guards von scripts/iso/autoinstall/k3s-join.sh. Alle
# Faelle hier enden VOR dem root-Check und damit vor jeder Installation —
# das Skript laesst sich so ohne Cluster testen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  JOIN="${REPO_ROOT}/scripts/iso/autoinstall/k3s-join.sh"
}

@test "k3s-join: --help nennt alle drei Rollen und endet mit 0" {
  run bash "$JOIN" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'init'
  echo "$output" | grep -q 'server'
  echo "$output" | grep -q 'agent'
}

@test "k3s-join: fehlende Rolle bricht ab" {
  run bash "$JOIN" --token abc123
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'role'
}

@test "k3s-join: unbekannte Rolle bricht ab" {
  run bash "$JOIN" --role master --token abc123
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'rolle'
}

@test "k3s-join: fehlendes Token bricht ab" {
  run bash "$JOIN" --role init
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'token'
}

@test "k3s-join: Rolle server ohne --server bricht ab" {
  run bash "$JOIN" --role server --token abc123
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'server'
}

@test "k3s-join: Rolle agent ohne --server bricht ab" {
  run bash "$JOIN" --role agent --token abc123
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'server'
}

@test "k3s-join: --role init zusammen mit --server bricht ab" {
  # Haeufiger Denkfehler: der erste Node soll gegen sich selbst joinen.
  # init startet den Cluster und darf keine Server-URL bekommen.
  run bash "$JOIN" --role init --token abc123 --server https://10.0.0.1:6443
  [ "$status" -ne 0 ]
}

@test "k3s-join: vollstaendige init-Argumente passieren die Argumentpruefung" {
  # Positiv-Anker: mit gueltigen Argumenten darf KEINE Argumentmeldung mehr
  # kommen. Als Nicht-root endet der Lauf danach am root-Check — das belegt,
  # dass die Validierung durchlaufen wurde.
  run bash "$JOIN" --role init --token abc123
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'root'
}
