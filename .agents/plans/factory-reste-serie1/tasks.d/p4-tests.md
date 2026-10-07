# P4 — Tests: Kommentar-Prosa in fünf Spec-Dateien (Tests-Rolle)

Ziel: tote Factory-Kommentar-Prosa in fünf BATS-Spec-Dateien bereinigen.
Keine Test-Logik-Änderung: Assertions, Tags und Fixture-Inputs bleiben
identisch; Guard-Dateien selbst sind tabu.

## Target files
- `tests/spec/agent-roster.bats`
- `tests/spec/database.bats`
- `tests/spec/pipeline-interface.bats`
- `tests/spec/website-core.bats`
- `tests/spec/ci-cd.bats`

## Steps
- [ ] 1. Rot-Stand protokollieren: `git grep -n -i factory --
  tests/spec/agent-roster.bats tests/spec/database.bats
  tests/spec/pipeline-interface.bats tests/spec/website-core.bats
  tests/spec/ci-cd.bats` — Treffer vorhanden, expected: FAIL (Reste
  vorhanden). Ausgabe in den PR-Body. Testrunner-Baseline: `bats` auf den
  fünf Dateien läuft vor dem Edit grün (Nachweis für grün→grün).
- [ ] 2. Nur Kommentar-Prosa (`#`-Zeilen) umformulieren (z. B. „retired with
  the factory" → „per T900399 stillgelegt entfernt"; T900399-Historie auf
  einen Satz schrumpfen). TABU: Assertions, `@test`-Namen, Fixture-Strings
  mit Testwirkung (z. B. falls ein String wie „factory tooling change" als
  Frontmatter-Test-Input dient: stehenlassen + im PR-Body dokumentieren);
  Guard-Dateien (`sf-retirement-*`, `decommission-guard`,
  `os-retirement-*`) werden nicht editiert.
- [ ] 3. Grün-Nachweis: `git grep -I -i factory` auf den fünf Dateien zeigt
  nur noch begründete Ausnahmen; `bats` auf allen fünf Dateien grün
  (derselbe bats-Runner wie in Schritt 1 — rot→grün-Bezug: Grep-Stand
  rot, Testlauf grün→grün).
- [ ] 4. Test-Inventar: `task test:inventory` — falls die Inventar-Prüfung
  eine Regeneration verlangt, `components/website/src/data/
  test-inventory.json` mitcommitten (Staged-Set-Pflicht erlaubt genau diese
  Datei neben `tests/` und `.agents/plans/`).

## Akzeptanz
- Keine tote Kommentar-Prosa in den fünf Dateien; Assertions unverändert.
- `bats` auf allen fünf Dateien grün; sf-retirement-/decommission-Guards
  grün.
