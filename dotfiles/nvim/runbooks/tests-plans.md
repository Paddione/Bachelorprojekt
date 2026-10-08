---
page: tests-plans
ticket: T901044
status: complete
actions:
  - test-file
  - test-single
  - plan-browser
  - skill-browser
---

## Voraussetzungen

- Projekt-Root mit `tests/spec/` (BATS), `.agents/plans/` (Plaene),
  `.agents/skills/` (Skills).

## Geordnete Schritte

1. **test-file**: Test zur aktuellen Datei oeffnen — per Namenskonvention
   (`foo_spec.lua`, `foo.bats`, `foo.test.*`) oder Graph-Kante; ohne
   Treffer klare Meldung.
2. **test-single**: Filter eingeben — Einzel-Test fahren, Ergebnis ins
   quickfix (`:cgetbuffer`).
3. **plan-browser**: Plan aus `.agents/plans/*/tasks.md` waehlen —
   oeffnet `tasks.md` (mit `tasks.d/`-Partials daneben).
4. **skill-browser**: Skill aus `.agents/skills/*/SKILL.md` waehlen.

## Erwartetes Ergebnis

Testzonen, Plaene und Skills ohne Umweg erreichbar; Einzel-Test mit
quickfix-Anbindung.

## Troubleshooting

- **Kein Test gefunden**: Namenskonvention pruefen oder Test neu anlegen.
- **Keine Plaene/Skills**: Verzeichnisse existieren nur mit aktivem Plan.

## Recovery

Keine: Browser veraendern nichts.
