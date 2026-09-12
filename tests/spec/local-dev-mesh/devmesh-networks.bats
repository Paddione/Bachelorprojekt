#!/usr/bin/env bats
# tests/spec/local-dev-mesh/devmesh-networks.bats — devmesh-Cluster-Netze in der Registry [T900117]
#
# Pruefmodus: Output-Verifikation von scripts/networks-check.mjs gegen die echte Registry plus
# yq-Lesen der Registry (die Datei ist das Resultat). networks-check verlangt jede Ueberschneidung
# von beiden Seiten erklaert. Besteht der Check und nennt kein devmesh-Eintrag die fleet-Netze
# unter overlaps, ueberschneiden sich devmesh- und fleet-Netze nicht.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REG="${REPO_ROOT}/docs/agent-guide/registry/networks.yaml"
}

_cidr() { yq -r ".networks[] | select(.id == \"$1\") | .cidr" "$REG"; }

@test "devmesh-Netze stehen mit 10.52.0.0/16 und 10.53.0.0/16 in der Registry" {
  [ "$(_cidr devmesh-pod-cidr)" = "10.52.0.0/16" ]
  [ "$(_cidr devmesh-service-cidr)" = "10.53.0.0/16" ]
}

@test "devmesh-Netze ueberschneiden weder pod-cidr-fleet noch service-cidr-fleet" {
  # Positiv-Anker: die fleet-Eintraege existieren, und der Registry-Check besteht
  [ "$(_cidr pod-cidr-fleet)" = "10.42.0.0/16" ]
  [ "$(_cidr service-cidr-fleet)" = "10.43.0.0/16" ]
  run bash -c "cd '$REPO_ROOT' && node scripts/networks-check.mjs"
  [ "$status" -eq 0 ]
  named="$(yq -r '.networks[] | select(.id == "devmesh-pod-cidr" or .id == "devmesh-service-cidr") | (.overlaps // [])[] | .with' "$REG")"
  printf '%s\n' "$named" | grep -qxF home-lan
  fleet="$(printf '%s\n' "$named" | grep -xF -e pod-cidr-fleet -e service-cidr-fleet || true)"
  [ -z "$fleet" ]
}
