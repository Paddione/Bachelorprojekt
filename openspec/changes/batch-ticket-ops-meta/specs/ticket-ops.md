## ADDED Requirements

### Requirement: Triage-Query skaliert über MCP (Chunking)

The ticket-ops Triage-Query in ticket-ops-procedures.md §Step 1.1 SHALL so chunkbar dokumentiert sein, dass ~100+ offene Tickets über mcp-postgres konsumierbar bleiben, ohne das Token-Limit zu überschreiten.

#### Scenario: 96 offene Tickets überschreiten das Token-Limit nicht

- **GIVEN** 96 offene Tickets (is_test_data=false) und die Triage-Query aus Step 1.1
- **WHEN** die Query per LIMIT/OFFSET in Chunks ausgeführt wird
- **THEN** bleibt jeder Chunk unter dem mcp-postgres-Token-Limit
- **AND** die Prozedur dokumentiert die Chunk-Größe und den Skalierungsbruch

### Requirement: Wellenbildung erkennt Freshness-Kollisionen

The ticket-ops Wellenbildung (§Step 3.1/3.2) SHALL generierte Artefakte (openspec-status.json, test-inventory.json) als implizite geteilte area behandeln, sodass Kollisionen über Freshness-Generate erkannt und serialisiert werden, auch ohne gemeinsamen areas-Eintrag.

#### Scenario: Zwei dev-flow-plan-Einheiten teilen ein generiertes Artefakt

- **GIVEN** zwei planungsreife Tickets ohne gemeinsame area, die beide openspec-status.json regenerieren
- **WHEN** die Wellenbildung die Konfliktkanten aufbaut
- **THEN** erkennt sie die Freshness-Kollision
- **AND** weist die Einheiten als seriell-mergend aus

### Requirement: MCP stage_plan(hold) setzt readiness wie der CLI-Fallback

The MCP-Tool stage_plan SHALL bei hold:true dieselbe readiness setzen wie scripts/vda/ticket/stage-plan.sh — `execution_released=false` per JSONB-Merge — damit ein per MCP gestagtes Ticket nicht unbeabsichtigt von der Factory dispatched wird.

#### Scenario: stage_plan(hold:true) über ticket-mcp

- **GIVEN** ein Ticket wird über mcp__ticket-mcp__stage_plan mit hold:true gestaged
- **WHEN** die readiness geprüft wird
- **THEN** enthält sie execution_released=false
- **AND** das Ticket wird nicht von der Factory dispatched, bis die Sperre aufgehoben wird

### Requirement: Mishap-Buffer hat Rücknahmepfad

The system SHALL gemeldete Mishap-Buffer-Einträge per Titel- oder Index-Match zurücknehmen können (resolve/withdraw), sodass behobene Befunde nicht als offene Punkte im Rollup landen.

#### Scenario: Befund in derselben Sitzung behoben und zurückgenommen

- **GIVEN** ein Befund wurde gemeldet und in derselben Sitzung behoben
- **WHEN** der Eintrag per resolve/withdraw zurückgenommen und geflusht wird
- **THEN** erscheint er nicht als offener Punkt im Rollup
- **AND** der Verweis auf das lösende Ticket bleibt erhalten

### Requirement: agent-lock erkennt die Session des Aufrufers statt des Serverprozesses

The system SHALL bei agent-lock-Prüfungen die Session-Identität des Aufrufers verwenden, nicht die Startumgebung eines langlebigen MCP-Serverprozesses, damit der Lock-Guard den eigenen Lock nicht als fremd sperrt.

#### Scenario: ticket-mcp-Schreibvorgang bei gehaltenem eigenen Lock

- **GIVEN** die Session hält den agent-lock für ein Ticket und ruft danach ticket-mcp auf
- **WHEN** der Lock-Guard die Ownership prüft
- **THEN** erkennt er den Lock als eigenen (Caller-SID)
- **AND** der Status-Schreibvorgang wird nicht verweigert

### Requirement: agent-lock-Heartbeat wird fortgeschrieben

The system SHALL heartbeat_at eines aktiven Locks bei jeder aktiven Aktion (Schreibzugriff, Lock-Prüfung) fortschreiben, sodass die heartbeat-TTL einen Lock während laufender Arbeit nicht reapt.

#### Scenario: Aktive Arbeit länger als die heartbeat-TTL

- **GIVEN** eine Session arbeitet aktiv in ihrem geclaimten Worktree
- **WHEN** die Heartbeat-TTL abläuft und ein Reap-Lauf prüft
- **THEN** wurde heartbeat_at durch die aktive Arbeit erneuert
- **AND** der Lock bleibt live, der Worktree-Write-Guard sperrt den eigenen Worktree nicht

### Requirement: Empty-Return-Rule prüft den Arbeitsstand vor dem Modellwechsel

The system SHALL bei einem leeren Task-Return zuerst remote Branch, PR-Status und Ticket-Status prüfen und nur bei tatsächlich offener Arbeit den M2/M3-Modellwechsel auslösen.

#### Scenario: Leerer Return bei bereits gemergter Arbeit

- **GIVEN** ein Task-Return ist leer, aber der zugehörige PR ist bereits gemergt und das Ticket done
- **WHEN** die Empty-Return-Rule den Arbeitsstand prüft
- **THEN** wird KEIN Modellwechsel ausgelöst
- **AND** nur das fehlende Reporting wird nachgeholt

#### Scenario: Leerer Return bei offener Arbeit

- **GIVEN** ein Task-Return ist leer und die Arbeit ist offen (Branch/PR existieren, Ticket nicht done)
- **WHEN** die Empty-Return-Rule den Arbeitsstand prüft
- **THEN** greift die M2/M3-Eskalation wie bisher
