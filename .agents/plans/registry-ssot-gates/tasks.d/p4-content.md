# P4 — Content-Registry-Check

## Ausgang (verifiziert)

- `docs/agent-guide/registry/goals.yaml:16` (`guardrails:` freie Strings),
  `guardrails.yaml:1`, `components.yaml:2` (`relates_to`, `url: null`).

## Ziel

- [ ] `scripts/content-check.mjs`: fail-closed — unbekannte `guardrails`-/
      `relates_to`-/`theme`-IDs → Exit ≠ 0 (Dangling-Ref-Guard über
      goals/guardrails/components/themes/taxonomy/glossary).
- [ ] `docs/agent-guide/maps/content-map.md`: generiert (Komponente/Goal →
      live verdrahtet oder tot).

## Abnahme

- Check grün; Fixture (Dangling-Ref) → rot.

## Gegenbeleg-Entscheidung (execute)

- `scripts/agent-guide/validate.mjs` prüft bereits Guardrails/Related-Refs
  (tools, goals-guardrails/flow, components, themes, taxonomy) — als Substrat
  eingebunden (`validateRegistry()`), nicht dupliziert. Echte Lücke, die
  `scripts/content-check.mjs` schließt: `goals[].related` wurde nirgends gegen
  Goal-IDs geprüft. Abnahme erfüllt (grün; Fixture mit Dangling-Ref rot).
