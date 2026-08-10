# ticket-ops

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu ticket-ops ergänzen._

## Requirements

### Requirement: Prosa-Blocker-Erkennung in Phase 1
Die Completeness Triage MUSS Ticket-Beschreibungen auf Schlüsselwörter wie
"BLOCKIERT VON", "hängt an" scannen und gefundene Referenzen in `depends_on`
überführen. Bereits gemergte PRs werden als aufgelöster Blocker erkannt.

#### Scenario: Prosa-Blocker wird in depends_on überführt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234"
- **WHEN** die Completeness Triage läuft
- **THEN** die PR-Referenz wird in `depends_on` überführt

#### Scenario: Bereits gemergter PR wird als aufgelöst erkannt

- **GIVEN** eine Ticket-Beschreibung enthält "BLOCKIERT VON: PR #1234" und PR #1234 ist gemergt
- **WHEN** die Completeness Triage läuft
- **THEN** der Blocker wird als aufgelöst markiert und das DoR-Flag `abhaengigkeiten_klar` auf true gesetzt

<!-- merged from change delta ticket-ops.md (7053ad1339bb) -->

### Requirement: Step-1.1-Triage-Query dokumentiert den korrekten jq-Parse-Schritt

Die Prozedur in ticket-ops-procedures.md §Step 1.1 MUSS den jq-Ausdruck dokumentieren,
der das tatsächliche mcp-postgres-Ausgabeformat `[{"result":"<json-string>"}]` korrekt
verarbeitet. Der dokumentierte Ausdruck ist `jq -r '.[0].result'`, nicht
`jq -r '.result[]'`.

Der zweite Parse-Schritt (die Ausgabe von `jq -r '.[0].result'` ist ein JSON-String, der
erneut geparst werden muss) MUSS explizit benannt sein.

#### Scenario: Dokumentierter jq-Ausdruck matcht das mcp-postgres-Format

- **GIVEN** die ticket-ops-procedures.md §Step 1.1
- **WHEN** ein Agent die dokumentierte jq-Anweisung befolgt
- **THEN** der Ausdruck verarbeitet das Format `[{"result":"<json-string>"}]` ohne Fehler

<!-- merged from change delta ticket-ops.md (4690b95f6132) -->