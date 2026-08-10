## ADDED Requirements

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
