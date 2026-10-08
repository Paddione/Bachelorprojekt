# p3-tests — Guards verifizieren, Verhalten beweisen, Inventar pflegen

## Ziel

BATS-Guards grün, FA-65-Verhaltensprobe 10/10 gegen den Fix-Stand, keine
Mentolder-Regression, Inventar aktuell.

## Budgets

- `tests/spec/massage-a11y.bats`: neue Datei im Stage-Commit,
  nicht-baselined. Budget ausreichend.
- `components/website/src/data/test-inventory.json`: generierte Datei, wird
  per Task regeneriert, kein Hand-Edit.

## Steps

1. Rotphase gegen den ungefixten Stand (Partials noch nicht angewendet):
   `tests/unit/lib/bats-core/bin/bats tests/spec/massage-a11y.bats`
   muss alle 5 Cases als `not ok` melden, expected: FAIL.
2. Nach p1+p2 denselben Befehl erneut laufen lassen: alle 5 Cases grün.
3. FA-65-Verhaltensprobe: Dev-Server AUS DIESEM Worktree starten
   (`BRAND=massage BRAND_NAME=massage POCKET_ID_WEBSITE_SECRET=dummy`,
   eigener freier Port; node_modules ggf. per Symlink aus dem Haupt-Checkout
   verlinken, untracked, nicht committen). FA-65-Spec aus dem
   T901307-Worktree (`.worktrees/fa65-audit/tests/e2e`) dagegen laufen
   lassen: alle 10 Tests müssen grün sein. Falls der T901307-Worktree nicht
   (mehr) existiert: Spec-Inhalt aus dessen Branch
   `chore/fa65-audit-T901307` lesen und gleichwertig prüfen.
4. Mentolder-Regression: lokale Mentolder-Instanz (`BRAND=mentolder`)
   starten, Homepage plus eine Inhaltsseite rendern (200, kein 500) und per
   AxeBuilder-Snippet (one-off, /tmp) die serious/critical-Zahl gegen main
   vergleichen — keine neuen Violations.
5. Test-Inventar regenerieren: `task test:inventory`. Den Diff an
   `components/website/src/data/test-inventory.json` prüfen (nur die neuen
   Test-IDs plus Zähler, keine Fremdeinträge) und mitcommitten.
