# scripts

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu scripts ergänzen._

## Requirements

### Requirement: brain-ingest.sh LM_MODEL fail-closed
brain-ingest.sh MUSS abbrechen, wenn LM_MODEL nicht gesetzt ist, statt mit einem nicht existierenden Default zu starten.

#### Scenario: LM_MODEL nicht gesetzt

- **GIVEN** die Umgebungsvariable LM_MODEL ist nicht gesetzt
- **WHEN** `bash scripts/brain-ingest.sh` ausgeführt wird
- **THEN** das Skript bricht mit einer Fehlermeldung ab (exit code != 0)

<!-- merged from change delta scripts.md (b7ae71d5c921) -->