# p2-tests — Guard verifizieren, Verhalten beweisen, Inventar pflegen

## Ziel

Der Guard beweist erst Rot, dann Grün; FA-65 A1 läuft 5/5 mit sichtbarem
Banner; das Inventar ist aktuell.

## Budgets

- `tests/spec/cookie-consent.bats`: neue Datei im Stage-Commit,
  nicht-baselined. Budget ausreichend.
- `components/website/src/data/test-inventory.json`: generierte Datei, wird
  per Task regeneriert, kein Hand-Edit.

## Steps

1. Rotphase gegen den ungefixten Stand (Partial p1 noch nicht angewendet):
   `tests/unit/lib/bats-core/bin/bats tests/spec/cookie-consent.bats`
   muss den Case als `not ok` melden, expected: FAIL.
2. Nach Partial p1 denselben Befehl erneut laufen lassen: Case grün.
3. FA-65-Verhaltensprobe: Dev-Server AUS DIESEM Worktree starten
   (`BRAND=massage BRAND_NAME=massage POCKET_ID_WEBSITE_SECRET=dummy`,
   eigener freier Port; node_modules ggf. per Symlink aus dem Haupt-Checkout
   verlinken, untracked, nicht committen). FA-65-Spec aus dem
   T901307-Worktree (`.worktrees/fa65-audit/tests/e2e`) dagegen laufen
   lassen: alle A1-Tests müssen grün sein (Banner dabei sichtbar — die Spec
   wartet deterministisch darauf). Falls der T901307-Worktree nicht (mehr)
   existiert: Spec-Inhalt aus dessen Branch lesen und gleichwertig prüfen.
4. Test-Inventar regenerieren: `task test:inventory`. Den Diff an
   `components/website/src/data/test-inventory.json` prüfen (nur die neue
   Test-ID plus Zähler, keine Fremdeinträge) und mitcommitten.
