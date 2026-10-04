---
id: P2
role: tests
ticket: T900804
depends_on: [P1]
target_files:
  - tests/spec/pocket-id-client-seed-group-lookup.bats
---

# P2 — Testabnahme

## Ziel

Der bereits committete RED-Test wird durch P1 gruen, ohne dass er angepasst wird. Er fuehrt das echte Seed-Skript aus dem Manifest gegen einen curl-Stub aus (GET liefert Fixtures in v2.14.0- und Alt-Reihenfolge, jeder POST antwortet 409).

## Concrete-Steps

1. `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats` → 3/3 ok. Vor P1 war das Ergebnis expected: FAIL (Test 1 und 2).
2. Schlaegt ein Test nach P1 fehl: Ursache im Manifest suchen, nicht die Zusicherung lockern. Der Test darf nur geaendert werden, wenn er nachweislich falsch misst.
3. `tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*` → exit 0.

## Gate

- 3/3 ok in `tests/spec/pocket-id-client-seed-group-lookup.bats`
