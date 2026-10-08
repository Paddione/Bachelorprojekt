# p2-tests — Guard verifizieren und Inventar pflegen

## Ziel

Der im Stage-Commit mitgelieferte Guard T901263-1 beweist erst Rot, dann
Grün, und die neue Test-ID landet im Test-Inventar.

## Budgets

- `tests/spec/client-directory.bats`: wächst nur im Stage-Commit um den Guard
  (Ist 71 plus Guard), nicht-baselined. Budget ausreichend.
- `components/website/src/data/test-inventory.json`: generierte Datei, wird
  per Task regeneriert, kein Hand-Edit.

## Steps

1. Rotphase gegen den ungefixten Stand (Partial p1 noch nicht angewendet):
   `tests/unit/lib/bats-core/bin/bats tests/spec/client-directory.bats`
   muss den Case T901263-1 als `not ok` melden, expected: FAIL. Die fünf
   älteren Cases bleiben grün.
2. Nach Partial p1 denselben Befehl erneut laufen lassen: alle 6 Cases grün.
3. Test-Inventar regenerieren: `task test:inventory`. Den Diff an
   `components/website/src/data/test-inventory.json` prüfen (nur die neue
   Test-ID plus Zähler, keine Fremdeinträge) und mitcommitten.
