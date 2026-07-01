# pocket-id-client-seed-timeout

<!-- SSOT: openspec/specs/fleet-operations.md -->

## ADDED Requirements

### Requirement: Pocket-ID-Client-Seed Init-Container-Timeouts

The system SHALL configure the `pocket-id-client-seed` Job's init container with a poll timeout of at least 600 seconds (300 iterations × 2s) to accommodate cold-start scenarios, and SHALL set `backoffLimit` to 2.

#### Scenario: Init-Container-Timeout wird bei Kaltstart nicht überschritten

- **GIVEN** ein frisch deploytes `pocket-id-client-seed` Job (Init-Container `wait-for-pocket-id`)
- **WHEN** pocket-id und shared-db starten kalt und brauchen >2 Minuten für DB-Migration + App-Init
- **THEN** der Init-Container wartet bis zu 600 Sekunden (300 Iterationen × 2s Poll-Intervall) auf pocket-id
- **AND** der Job hat `backoffLimit: 2`, da der Init-Container intern länger wartet

#### Scenario: Manifest enthält korrekte Timeout-Werte

- **GIVEN** die Datei `k3d/pocket-id-client-seed.yaml`
- **WHEN** der Init-Container-Befehl geprüft wird
- **THEN** enthält er `if [ "$i" -ge 300 ]; then`
- **AND** der Manifest hat `backoffLimit: 2`
