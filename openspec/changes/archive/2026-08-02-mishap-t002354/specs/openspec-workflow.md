## ADDED Requirements

### Requirement: Plan-Phase editiert nicht die SSOT

The Plan-Phase SHALL NOT edit SSOT files under `openspec/specs/` directly. All
requirements changes SHALL be written exclusively as delta files under
`openspec/changes/<slug>/specs/`. The merge into the SSOT is the responsibility
of the `archive` verb — if both the SSOT and the delta are edited, the delta
marker is necessarily wrong (ADDED where MODIFIED is correct, or vice versa) and
the error surfaces only at archive time, i.e. after the PR has already been merged.

This rule SHALL be documented in `AGENTS.md` and/or the `opencode-flow-plan`
SKILL.md so that automated planners and human operators alike are bound by it.

#### Scenario: Plan-Phase produziert einen Change nur via Delta

- **GIVEN** ein Plan wird für ein Feature ausgearbeitet, das bestehende
  Requirements unter `openspec/specs/<parent>.md` ändert
- **WHEN** die Plan-Phase läuft
- **THEN** wird `openspec/changes/<slug>/specs/<parent>.md` mit den ADDED/
  MODIFIED/REMOVED Markern geschrieben
- **AND** `openspec/specs/<parent>.md` bleibt unverändert
- **AND** die SSOT-Änderung erfolgt ausschließlich beim `archive`-Schritt
