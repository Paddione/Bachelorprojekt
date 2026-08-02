#!/usr/bin/env bats
# tests/spec/toolset-registry/check-offline.bats
# Prüfmodus: Führt das Gate offline aus. Positiv: Gate läuft offline durch.

load '../test_helper.bash'

@test "toolset gate runs offline without network" {
  run node scripts/toolset/check.mjs
  [ "$status" -eq 0 ] || { echo "Gate muss offline Exit 0 liefern (status=$status)"; return 1; }
}
