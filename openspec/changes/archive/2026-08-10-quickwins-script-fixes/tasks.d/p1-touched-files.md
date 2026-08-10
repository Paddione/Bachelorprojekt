# p1 — plan-touched-files: erwähnte Pfade statt existierende (T002765)

## Ziel

`scripts/plan-touched-files.sh` nimmt nur Pfade als berührte Dateien auf, die im
Plan **erwähnt** werden — nicht die tatsächlich im Change geänderten Dateien.
Folge: `touched_files` bleibt unvollständig, Konflikt-/Scope-Tracking lückenhaft.

## Steps

1. **RED.** Test in `tests/spec/quickwins-script-fixes.bats`: Plan erwähnt Pfad A,
   ändert aber auch Pfad B (im Plan nicht erwähnt) → B fehlt in touched_files.
   `expected: FAIL`.

2. **GREEN.** In `scripts/plan-touched-files.sh`: berührte Dateien aus dem
   tatsächlichen Diff (git diff --name-only gegen Branch-Basis) ermitteln und mit
   den erwähnten Pfaden vereinigen — nicht nur erwähnte Pfade übernehmen.

3. **Verifikation.** Fall aus T002765: touched_files enthält alle real geänderten
   Dateien, auch unerwähnte.

## Acceptance

- touched_files = real geänderte Dateien (Diff) ∪ erwähnte Pfade.
- Kein Verlust durch nicht erwähnte, aber geänderte Dateien.
