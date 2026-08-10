# p5 — test:changed: kein Live-E2E bei reiner openspec-Änderung (T003138)

## Ziel

`test:changed` startet bei einer reinen openspec/-Änderung Live-E2E gegen
korczewski — unnötig und teuer, da keine Code-Änderung vorliegt.

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: reine openspec/-
   Änderung startet KEIN Live-E2E. `expected: FAIL` (startet doch).

2. **GREEN.** In `scripts/test-changed.sh`: Änderungs-Klassifikation — openspec/-only
   → nur openspec-spezifische Tests (validate/lint/embed), keine Live-E2E.

3. **Verifikation.** Fall aus T003138: openspec/-only PR läuft ohne korczewski-E2E.

## Acceptance

- Reine openspec/-Änderung startet kein Live-E2E.
- openspec-spezifische Gates laufen weiterhin.
