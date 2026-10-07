---
id: P2
role: tests
ticket: T901061
depends_on: [P1]
target_files:
  - tests/spec/pocket-id-client-seed-skip-secret.bats
  - components/website/src/data/test-inventory.json
---

# P2 — Tests & Verifikation

## Ziel

1. Einen Bats-Test `tests/spec/pocket-id-client-seed-skip-secret.bats` erstellen, der das reale Seed-Skript (de-indentiert und mit Flux-Escape-Simulation `$$` -> `$`) gegen einen curl-Stub ausführt.
2. Prüfen:
   - Clients ohne gesetztes Secret (z. B. `SECRET_downloads` ungesetzt/leer) loggen: `skip downloads (no secret configured)` und werden übersprungen.
   - Clients mit gesetztem Secret (z. B. `SECRET_docs="s3cret"`) werden regulär verarbeitet (`updated docs ...`).

## Concrete-Steps

1. Initialer Testlauf vor dem Fix (RED-Phase):
   `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-skip-secret.bats`
   expected: FAIL (vor P1 wird kein Skip ausgeführt, da `eval` den Variablennamen liefert).
2. Nach P1 (GREEN-Phase):
   `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-skip-secret.bats` → PASS.
3. Regression:
   `tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*` → exit 0.

## Gate

- Tests in `tests/spec/pocket-id-client-seed-skip-secret.bats` sind grün.
- Keine Regression bei den bestehenden Seed-Specs.
