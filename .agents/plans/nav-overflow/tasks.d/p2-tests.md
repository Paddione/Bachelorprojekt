# p2-tests — Guards verifizieren und Inventar pflegen

## Ziel

Die im Stage-Commit mitgelieferten Guards T901310-1..2 beweisen erst Rot,
dann Grün, und die neuen Test-IDs landen im Test-Inventar.

## Budgets

- `tests/spec/navigation-responsive.bats`: neue Datei im Stage-Commit,
  nicht-baselined. Budget ausreichend.
- `components/website/src/data/test-inventory.json`: generierte Datei, wird
  per Task regeneriert, kein Hand-Edit.

## Steps

1. Rotphase gegen den ungefixten Stand (Partial p1 noch nicht angewendet):
   `tests/unit/lib/bats-core/bin/bats tests/spec/navigation-responsive.bats`
   muss beide Cases als `not ok` melden, expected: FAIL.
2. Nach Partial p1 denselben Befehl erneut laufen lassen: beide Cases grün.
3. Test-Inventar regenerieren: `task test:inventory`. Den Diff an
   `components/website/src/data/test-inventory.json` prüfen (nur die neuen
   Test-IDs plus Zähler, keine Fremdeinträge) und mitcommitten.
