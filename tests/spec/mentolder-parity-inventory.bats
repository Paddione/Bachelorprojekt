#!/usr/bin/env bats
# mentolder-parity-inventory.bats — Guards für T901033 (Mentolder capability
# and data parity inventory, docs).
# Rotphase-Skelett (p5-Task 1): prüft nur die Existenz der vier
# Inventur-Dokumente unter docs/parity/. Sektions- und Evidenz-Guards folgen
# in p5-Tasks 2–3 (Grünphase).

setup() {
  ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "inventory doc exists: mentolder-flows-core.md" {
  [ -f "$ROOT/docs/parity/mentolder-flows-core.md" ]
}

@test "inventory doc exists: mentolder-auth-isolation.md" {
  [ -f "$ROOT/docs/parity/mentolder-auth-isolation.md" ]
}

@test "inventory doc exists: mentolder-flows-remaining.md" {
  [ -f "$ROOT/docs/parity/mentolder-flows-remaining.md" ]
}

@test "inventory doc exists: mentolder-parity-matrix.md" {
  [ -f "$ROOT/docs/parity/mentolder-parity-matrix.md" ]
}
