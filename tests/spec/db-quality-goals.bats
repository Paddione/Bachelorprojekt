#!/usr/bin/env bats
# tests/spec/db-quality-goals.bats
# SSOT: openspec/changes/db-quality-goals/specs/db-quality-goals.md (→ openspec/specs/ nach archive)
# Konvention: ein .bats-File pro OpenSpec-SSOT-Spec.

HGC="scripts/health-goals-check.sh"
DB_IDS="G-DB01 G-DB03 G-DB04 G-DB06 G-DB08"

setup() {
  cd "$BATS_TEST_DIRNAME/../.." || return 1
}

@test "health-goals-check.sh ist syntaktisch valide (bash -n)" {
  run bash -n "$HGC"
  [ "$status" -eq 0 ]
}

@test "health-goals-check.sh --fast --only=<G-DB*> rendert alle 5 DB-Ziele ohne Absturz" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id"
  done
}

@test "keine der 5 DB-Ziel-IDs fehlt in der --only-Ausgabe" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  missing=0
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id" || missing=$((missing+1))
  done
  [ "$missing" -eq 0 ]
}
