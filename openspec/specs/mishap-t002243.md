# mishap-t002243

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-t002243 ergänzen._

## Requirements

### Requirement: --create-new für Mishap-Bundles dokumentieren

Die Plan-Archive-Referenz muss den `--create-new`-Flag für Mishap-Bundles dokumentieren, da diese keine Parent-SSOT-Spec haben.

#### Scenario: Mishap-Bundle wird archiviert

- **GIVEN** ein Mishap-Bundle (querschnittlicher Fix ohne Parent-SSOT-Spec) soll archiviert werden
- **WHEN** der Benutzer folgt .claude/skills/references/plan-archive-steps.md Schritt 3
- **THEN** wird dort explizit `bash scripts/openspec.sh archive "$SLUG" --create-new` empfohlen
- **AND** scripts/openspec-merge.mjs zeigt eine Fehlermeldung, die den Mishap-Bundle-Fall erwähnt

<!-- merged from change delta mishap-t002243.md (85f44bc92151) -->