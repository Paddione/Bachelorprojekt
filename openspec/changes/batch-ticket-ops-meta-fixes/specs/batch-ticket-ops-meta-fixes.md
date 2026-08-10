## ADDED Requirements

### Requirement: Triage-Query skaliert über MCP

The system SHALL die Triage-Query aus ticket-ops Step 1.1 so chunkbar/kompakt gestalten, dass ~100 offene Tickets über mcp-postgres konsumierbar sind.

#### Scenario: 96 offene Tickets

- **GIVEN** 96 offene Tickets (is_test_data=false)
- **WHEN** die Triage-Query über mcp-postgres läuft
- **THEN** überschreitet sie das Token-Limit nicht
- **AND** liefert alle Tickets in Chunks oder über die Ergebnisdatei

### Requirement: Wellenbildung erkennt Freshness-Kollisionen

The system SHALL die ticket-ops-Wellenbildung so erweitern, dass geteilte generierte Artefakte (openspec-status.json, test-inventory.json) als Konfliktkante erkannt werden, auch ohne gemeinsame area.

#### Scenario: Zwei dev-flow-plan-Einheiten, kein gemeinsames area

- **GIVEN** zwei Tickets ohne gemeinsame area, aber beide regenerieren openspec-status.json
- **WHEN** die Wellenbildung läuft
- **THEN** erkennt sie die Freshness-Kollision
- **AND** weist die Einheiten als seriell-mergend aus

### Requirement: stage_plan(hold:true) setzt execution_released=false

The system SHALL den MCP-stage_plan bei hold:true dieselbe readiness setzen wie den CLI-Fallback — `execution_released=false` per JSONB-Merge.

#### Scenario: MCP stage_plan mit hold

- **GIVEN** stage_plan(hold:true) wird über ticket-mcp aufgerufen
- **WHEN** die readiness geprüft wird
- **THEN** enthält sie execution_released=false
- **AND** das Ticket wird nicht von der Factory dispatched

### Requirement: Mishap-Buffer hat Rücknahmepfad

The system SHALL gemeldete Mishap-Buffer-Einträge zurücknehmen können (resolve/withdraw), sodass behobene Befunde nicht als offene Punkte im Rollup landen.

#### Scenario: Befund in derselben Sitzung behoben

- **GIVEN** ein Befund wurde gemeldet und in derselben Sitzung behoben
- **WHEN** der Eintrag zurückgenommen und geflusht wird
- **THEN** erscheint er nicht als offener Punkt im Rollup
- **AND** der Verweis auf das lösende Ticket bleibt erhalten
