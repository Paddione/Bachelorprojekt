# Delta: agent-skills

## MODIFIED Requirements

### Requirement: dead-path-references.bats referenziert existierende SSOT
Die SSOT-Kopfzeile in `tests/spec/repo-hygiene/dead-path-references.bats` MUSS auf
`openspec/specs/agent-skills.md` zeigen (existiert), nicht auf
`openspec/specs/repo-hygiene.md` (existiert nicht).

#### Scenario: SSOT-Kopfzeile verweist auf agent-skills.md

- **GIVEN** die Datei `tests/spec/repo-hygiene/dead-path-references.bats`
- **WHEN** die SSOT-Kopfzeile gelesen wird
- **THEN** sie verweist auf `openspec/specs/agent-skills.md`
