#!/usr/bin/env bats

setup() {
  SCRIPT="scripts/llm/kv-budget.sh"
  [ -x "$SCRIPT" ]
}

@test "kv-budget: baseline calculation (65536, 1sl, kvu, q4_0, mmproj)" {
  run "$SCRIPT" --ctx 65536 --slots 1 --kvu --kv-type q4_0 --mmproj
  [ "$status" -eq 0 ]
  [[ "$output" =~ "8672 MiB" ]]
  [[ "$output" =~ "Konfiguration" ]]
  [[ "$output" =~ "Gesamt-VRAM" ]]
  [[ "$output" =~ "Frei" ]]
}

@test "kv-budget: 3 slots no-kvu (65536, 3sl, no-kvu, q4_0, mmproj)" {
  run "$SCRIPT" --ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --mmproj
  [ "$status" -eq 0 ]
  [[ "$output" =~ "9616 MiB" ]]
}

@test "kv-budget: overcommit detection" {
  run "$SCRIPT" --ctx 200000 --slots 6 --no-kvu --kv-type q8_0 --mmproj
  [ "$status" -eq 0 ]
  [[ "$output" =~ "⚠️ OVERCOMMIT" ]]
}

@test "kv-budget: kvu pool advantage" {
  run "$SCRIPT" --ctx 200000 --slots 3 --kvu --kv-type q8_0 --mmproj
  [ "$status" -eq 0 ]
  # kvu shared pool should use less VRAM than 3 slots no-kvu
  run "$SCRIPT" --ctx 200000 --slots 3 --no-kvu --kv-type q8_0 --mmproj
  [ "$status" -eq 0 ]
}

@test "kv-budget: invalid parameter exit code" {
  run "$SCRIPT" --kv-type unsupported
  [ "$status" -eq 1 ]
}

@test "kv-budget: --max-slots calculation" {
  run "$SCRIPT" --ctx 65536 --kv-type q4_0 --mmproj --max-slots
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Max slots:" ]]
}

@test "kv-budget: --fitt-margin analysis" {
  run "$SCRIPT" --ctx 65536 --slots 3 --no-kvu --kv-type q4_0 --fitt-margin 2400
  [ "$status" -eq 0 ]
  [[ "$output" =~ "c_fitt" ]]
}
