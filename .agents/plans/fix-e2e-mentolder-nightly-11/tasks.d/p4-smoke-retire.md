# p4 — Smoke-Spec retiren (totes Artefakt, D4)

## Ziel
`tests/e2e/specs/mentolder-web-smoke.spec.ts` (ist 68) **löschen** + `testMatch`-Eintrag in
`tests/e2e/playwright.config.ts` (`smoke`-Projekt, Zeile ~235, Kommentar `K6-Staffel-B`) entfernen.
Begründung (D4): getestete Quelle `components/mentolder-web/` ist seit #7055 (01.11.) von `main` gelöscht;
die 6 Failures sind Befunde gegen ein zur Stilllegung vorgesehenes Artefakt, kein Signal. `a11y-axe.spec.ts`
(Astro, brand-geroutet) bleibt.

## Methode
1. RED-Beleg: aktuelle Nightly-Liste (6 rote Smoke-Tests, Run 41815883961 — kein lokaler Lauf nötig,
   Specs laufen gegen Prod und wären auch nach Löschung nicht „grün", sondern weg).
2. File löschen + genau die eine `testMatch`-Zeile entfernen (keine Nachbar-Keys).
3. `npx playwright test --project=smoke --list` → `mentolder-web-smoke` nicht mehr aufgeführt;
   `integration-smoke.spec.ts` bleibt.

## Gates
- `grep -rn "mentolder-web-smoke" tests/e2e/ .github/workflows/` leer (keine verwaiste Referenz).
- Smoke-Projekt listet nur noch `integration-smoke`.
- S1: `playwright.config.ts` prüfen (`wc -l` + Baseline vor Edit — schrumpft um 1 Zeile, kein Wachstum).
