# Proposal: openspec-upstream-cli

_Ticket: T001262_

## Why

Die `_merge_delta()`-Funktion in `scripts/openspec.sh` behandelt alle Delta-Operationen
(ADDED, MODIFIED, REMOVED) als blinden Append ans Dateiende. Das ist für ADDED zufällig
korrekt, aber für MODIFIED (doppelte Blöcke im SSOT) und REMOVED (Block wird angehängt
statt gelöscht) semantisch falsch. Fünf aktive MODIFIED-Deltas und ein REMOVED-Delta werden
bei `archive` ihre SSOT-Specs korrumpieren.

Zusätzlich kennt der Validator (`scripts/openspec-validate.ts`) keine RENAMED-Operation,
erkennt keine Stub-Platzhalter (unbearbeitete `### Requirement: TODO`) und prüft nicht, ob
MODIFIED/REMOVED-Targets tatsächlich in der SSOT existieren.

## What

### Neue Komponente: `scripts/openspec-merge.mjs`

Node.js-Helfer (~120 Zeilen), der Block-Parsing auf Markdown-Heading-Ebene macht. Wird von
`_merge_delta()` in `openspec.sh` aufgerufen. Implementiert vier Operationen:
- **ADDED**: Requirements ans Ende der `## Requirements`-Sektion einfügen (strukturiert)
- **MODIFIED**: vorhandene Requirement-Blöcke nach Name in-place ersetzen
- **REMOVED**: vorhandene Blocks nach Name löschen
- **RENAMED**: Heading-Zeile eines vorhandenen Blocks umbenennen

### Validator-Hardening

`scripts/openspec-validate.ts` erhält drei neue Prüfungen:
1. RENAMED als valide Operation in den Regexen
2. Stub-Detection: `### Requirement: TODO` / `The system SHALL …` / `#### Scenario: TODO`
3. Cross-Reference: MODIFIED/REMOVED-Targets müssen im SSOT existieren

### Tests

Neue BATS-Tests in `tests/spec/openspec-workflow.bats` für alle neuen Operationen
(RED → GREEN). Fixtures unter `tests/fixtures/openspec/` für mini SSOT + Deltas.

## Non-Goals

- Adoption des upstream `@fission-ai/openspec` als Backend-Ersatz
- Migration historischer archivierter Changes
- Änderungen an propose/apply-Verben
- Änderungen an den `/opsx:*`-Skills
