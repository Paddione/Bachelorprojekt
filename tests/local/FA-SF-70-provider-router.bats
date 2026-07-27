#!/usr/bin/env bats
# FA-SF-70 — provider routing CLI + wrappers (offline; DB-touching paths skipped).
setup() { load 'test_helper.bash'; }

@test "FA-SF-70: provider-config.sh prints usage and exits non-zero with no args" {
  run bash scripts/factory/provider-config.sh
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: provider-config.sh set does not reject tier=opus at validation, warns instead" {
  # DB-touching: this file is offline (no cluster), so the write itself may
  # still fail downstream (factory_psql needs a live shared-db pod) — only
  # assert the pre-DB validation behavior: opus passes argument validation
  # and emits a warning, instead of being hard-rejected like before.
  run bash scripts/factory/provider-config.sh set --source x --tier opus --priority 1 --provider anthropic --model m
  [[ "$output" == *"WARNING"* ]]
  [[ "$output" == *"opus"* ]]
  [[ "$output" != *"Usage:"* ]]
}

@test "FA-SF-70: provider-config.sh set requires all mandatory flags" {
  run bash scripts/factory/provider-config.sh set --source x --tier sonnet
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: route-provider.sh emits valid JSON keys for opus without DB" {
  run bash scripts/factory/route-provider.sh factory-plan opus
  [ "$status" -eq 0 ]
  # T002277: opus liest jetzt provider_config statt eines hardcodierten Modells.
  # Ohne Cluster faellt es auf den eingebauten Default zurueck - beide Wege muessen
  # dieselbe Invariante erfuellen: gueltiges JSON, das auf den LOKALEN Proxy zeigt
  # und keinen Slot claimt (opus hat beim Aufrufer keinen Release-Pfad).
  # Auf modelId wird bewusst nicht hart geprueft: welches Modell hinter dem Proxy
  # steht, entscheidet die Registry und darf sich ohne Testaenderung verschieben.
  # Die letzte Zeile isolieren - ohne DB schreibt das Skript eine Warnung auf stderr,
  # und `run` fuehrt stdout und stderr in $output zusammen.
  echo "${lines[${#lines[@]}-1]}" | jq -e '.modelId and (.baseUrl | test("127.0.0.1:18235")) and (.slotId == null)'
}

@test "FA-SF-70: route-provider.sh requires source and tier args" {
  run bash scripts/factory/route-provider.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh requires a provider arg" {
  run bash scripts/factory/release-slot.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh accepts null slotId (no-op)" {
  run bash scripts/factory/release-slot.sh null true
  [ "$status" -eq 0 ]
}
