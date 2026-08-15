#!/usr/bin/env bats
# tests/unit/wg-mesh-laptop-nodes.bats
# Ticket: T006143
#
# PRUEFMODUS: KONFIGURATIONS-Guard (dokumentierte Ausnahme in T002448-M4) —
# das Ergebnis der Registry manifestiert sich ausschliesslich im Quelltext
# (YAML) und in der Conf-Generierung. Geprueft wird daher die GENERIERTE
# Conf (Ausgabe von generate-wg-conf.sh, wie in wg-mesh-fullmesh.bats) plus
# die Registry-Eintraege. Aufbau: erst Positiv-Anker (Generator laeuft und
# findet die Node), dann die Einzelaussagen (T002356-M1).

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/hetzner/generate-wg-conf.sh"
DUMMY_KEY="0000000000000000000000000000000000000000000="
REGISTRY="${PROJECT_DIR}/wireguard/wg-mesh-nodes.yaml"

LAPTOP1_IP="192.168.100.11"
TABLET_IP="192.168.100.12"

@test "T006143: mentolder-Mesh-Confs listen die Laptops als Peers" {
  # Positiv-Anker zuerst: Generator laeuft fuer einen mentolder-Cluster-Node.
  run bash "$SCRIPT" --env mentolder --node-name gekko-hetzner-3 --private-key "$DUMMY_KEY"
  assert_success
  refute_output --partial "# gekko-hetzner-3"
  # Dann die Aussagen: beide Laptops tauchen als Peers auf.
  assert_output --partial "# pk-l-1"
  assert_output --partial "AllowedIPs = ${LAPTOP1_IP}/32"
  assert_output --partial "# pk-tablet"
  assert_output --partial "AllowedIPs = ${TABLET_IP}/32"
}

@test "T006143: Registry fuehrt pk-l-1 und pk-tablet mit festen wg_ips" {
  # Positiv-Anker: die Registry enthaelt die Node-Namen ueberhaupt.
  grep -q 'name: pk-l-1' "$REGISTRY"
  grep -q 'name: pk-tablet' "$REGISTRY"
  # Einzelaussagen: wg_ip, leerer Endpoint (Home-NAT) und Schema-Key.
  grep -A3 'name: pk-l-1' "$REGISTRY" | grep -q 'wg_ip: "192.168.100.11"'
  grep -A3 'name: pk-l-1' "$REGISTRY" | grep -q 'endpoint: ""'
  grep -A4 'name: pk-l-1' "$REGISTRY" | grep -q 'schema_key: WG_MESH_PKL1'
  grep -A3 'name: pk-tablet' "$REGISTRY" | grep -q 'wg_ip: "192.168.100.12"'
  grep -A3 'name: pk-tablet' "$REGISTRY" | grep -q 'endpoint: ""'
  grep -A4 'name: pk-tablet' "$REGISTRY" | grep -q 'schema_key: WG_MESH_PKT'
}

@test "T006143: Schema kennt die neuen WG_MESH_Variablen" {
  grep -q 'WG_MESH_PKL1_PRIVATE_KEY' "${PROJECT_DIR}/environments/schema.yaml"
  grep -q 'WG_MESH_PKT_PRIVATE_KEY' "${PROJECT_DIR}/environments/schema.yaml"
}

# BEWUSST KEIN Test auf environments/.secrets/*: die Datei ist git-crypt-
# verschluesselt und liegt in CI als Binaerblob vor — ein grep darauf wuerde
# dort rot. Plaintext- und Sealed-Praesenz verifiziert Task 2 Step 7 manuell.
