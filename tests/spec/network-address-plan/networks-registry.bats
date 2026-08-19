#!/usr/bin/env bats
# tests/spec/network-address-plan/networks-registry.bats
# SSOT: openspec/specs/network-address-plan.md  (Ticket T012645)
#
# PRUEFMODUS (T002448-M4): Output-Verifikation. Geprueft werden Exit-Code und
# Ausgabe von `scripts/networks-check.mjs` gegen Fixtures — NICHT der Quelltext
# des Skripts. Jeder Negativtest traegt einen Positiv-Anker im selben @test
# (T002356-M1): ein Skript, das pauschal fehlschlaegt, wuerde die Negativtests
# sonst gruen aussehen lassen, ohne irgendetwas zu pruefen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CHECK="$REPO_ROOT/scripts/networks-check.mjs"
  FIX="$BATS_TEST_DIRNAME/fixtures"
}

# ── REQ-NETPLAN-002: unerklaerte Ueberschneidung faellt auf ──────────────────

@test "REQ-NETPLAN-002: unerklaerte Ueberschneidung -> Exit != 0, beide id genannt" {
  run node "$CHECK" --registry "$FIX/valid.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  run node "$CHECK" --registry "$FIX/undeclared-overlap.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"alpha"* ]]
  [[ "$output" == *"beta"* ]]
}

@test "REQ-NETPLAN-002: Ueberschneidung ueber verschiedene Praefixlaengen faellt auf" {
  run node "$CHECK" --registry "$FIX/valid.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  # 10.0.0.0/8 und 10.42.5.0/24 haben kein gemeinsames Textpraefix.
  run node "$CHECK" --registry "$FIX/prefix-span-overlap.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"home-lan"* ]]
  [[ "$output" == *"pod-cidr"* ]]
}

# ── REQ-NETPLAN-003: erklaerte Ueberschneidung wird akzeptiert ───────────────

@test "REQ-NETPLAN-003: beidseitig erklaerte Ueberschneidung -> Exit 0" {
  run node "$CHECK" --registry "$FIX/declared-overlap.yaml"
  [ "$status" -eq 0 ]
}

@test "REQ-NETPLAN-003: overlaps ohne tatsaechliche Ueberschneidung -> Exit != 0" {
  run node "$CHECK" --registry "$FIX/declared-overlap.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  run node "$CHECK" --registry "$FIX/spurious-overlap.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"alpha"* ]]
}

@test "REQ-NETPLAN-003: overlaps auf unbekannte id -> Exit != 0, id genannt" {
  run node "$CHECK" --registry "$FIX/valid.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  run node "$CHECK" --registry "$FIX/unknown-overlap-id.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"gibt-es-nicht"* ]]
}

# ── REQ-NETPLAN-004: fehlerhafte Eintraege ──────────────────────────────────

@test "REQ-NETPLAN-004: nicht normalisierter CIDR -> Exit != 0" {
  run node "$CHECK" --registry "$FIX/valid.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  run node "$CHECK" --registry "$FIX/unnormalised-cidr.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"10.42.5.7/24"* ]]
}

@test "REQ-NETPLAN-004: doppelte id -> Exit != 0, id genannt" {
  run node "$CHECK" --registry "$FIX/valid.yaml"
  [ "$status" -eq 0 ]                              # Positiv-Anker

  run node "$CHECK" --registry "$FIX/duplicate-id.yaml"
  [ "$status" -ne 0 ]
  [[ "$output" == *"alpha"* ]]
}

# ── REQ-NETPLAN-001/005: echte Registry und Karte ───────────────────────────

@test "REQ-NETPLAN-001: die echte Registry existiert und besteht den Guard" {
  [ -f "$REPO_ROOT/docs/agent-guide/registry/networks.yaml" ]

  run node "$CHECK"
  [ "$status" -eq 0 ]
}

@test "REQ-NETPLAN-001: die Registry deklariert die erhobenen Bereiche" {
  local reg="$REPO_ROOT/docs/agent-guide/registry/networks.yaml"
  for cidr in "10.0.0.0/8" "10.13.14.0/24" "10.20.0.0/24" "10.42.0.0/16" \
              "10.43.0.0/16" "100.64.0.0/10" "172.17.0.0/16" "172.18.0.0/16" \
              "172.23.0.0/16" "192.168.100.0/24"; do
    run grep -F "$cidr" "$reg"
    [ "$status" -eq 0 ]
  done
}

@test "REQ-NETPLAN-001: das ausser Dienst gestellte korczewski-Mesh bleibt als retired deklariert" {
  local reg="$REPO_ROOT/docs/agent-guide/registry/networks.yaml"
  run grep -F "10.13.14.0/24" "$reg"
  [ "$status" -eq 0 ]
  run grep -F "retired" "$reg"
  [ "$status" -eq 0 ]
}

@test "REQ-NETPLAN-005: die Karte ist generiert und nennt das fleet-Overlay" {
  local map="$REPO_ROOT/docs/agent-guide/maps/networks-map.md"
  [ -f "$map" ]
  run grep -F "10.20.0.0/24" "$map"
  [ "$status" -eq 0 ]
}
