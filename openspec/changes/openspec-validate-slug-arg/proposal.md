# Proposal: openspec-validate-slug-arg

## Why

`bash scripts/openspec.sh validate <slug>` ignoriert ein übergebenes Slug-Argument still — es
validiert stattdessen alle Changes (Mishap-Buffer-Eintrag vom 2026-08-23, Ticket T015825).
Der Aufrufer glaubt, einen einzelnen Change geprüft zu haben, bekommt aber kein gezieltes
Ergebnis; ein intendierter Voll-Lauf ist in der Ausgabe umgekehrt nicht von einem Slug-Lauf
zu unterscheiden. Verwandt: T015759 (Stray-Dir-Guard in derselben Funktion) — gleiches
Subsystem, anderer Defekt, läuft separat in Execution.

## Symptom vs. Ursache (T002448-M5)

**Symptom (beobachtet, reproduziert am 2026-08-24 auf main @ 5cbaa7c7):**
`bash scripts/openspec.sh validate does-not-exist-T015825-probe` gibt
`openspec validate: OK` aus und endet mit rc=0 — der unbekannte Slug wird still ignoriert,
stattdessen läuft der Voll-Baum.

**Ursache (per Code-Lesung verifiziert):** `main()` reicht restliche Argumente an
`cmd_validate "$@"` weiter (scripts/openspec.sh:489), aber `cmd_validate()` (Zeile 419)
deklariert keine Parameterverarbeitung und liest `$@` nie — die Glob-Schleife über
`$changes/*/` läuft immer über alle Changes.

## What

- `cmd_validate` akzeptiert optional **genau ein** Slug-Argument und validiert dann
  ausschließlich `openspec/changes/<slug>/`; existiert das Verzeichnis nicht, schlägt der
  Lauf fail-closed mit einer den Slug nennenden Meldung und rc≠0 fehl.
- Ohne Argument bleibt der Voll-Lauf bestehen, wird aber in der Abschlusszeile kenntlich
  gemacht (`openspec validate: OK (all changes)`); ein gezielter Lauf meldet
  `openspec validate: OK (<slug>)`. Der stabile Präfix `openspec validate:` bleibt erhalten.
- Mehr als ein Positionsargument → Usage-Fehler mit rc=2.
- Delta auf die SSOT `openspec/specs/openspec-workflow.md` (MODIFIED des Requirements
  „Validate ist ein fail-closed CI-Gate für Delta-Dateien") + RED-BATS-Test unter
  `tests/spec/openspec-workflow/`.

_Ticket: T015825_
