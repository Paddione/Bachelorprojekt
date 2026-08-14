## MODIFIED Requirements

### Requirement: The Software Factory picks up staged task tickets

Erweiterung um den Test-Daten-Ausschluss: Der Queue-Lesepfad muss SF-TEST-Fixtures
(`is_test_data = true`) von der Dispatch-Kandidatenliste fernhalten — sie dürfen nie im
Dispatch-Pfad landen (T002830). Die bestehenden Szenarien bleiben unverändert; das neue
Szenario verankert den Ausschluss auf Requirements-Ebene.

#### Scenario: queue.sh never surfaces is_test_data fixtures

- **GIVEN** a backlog feature seeded with `is_test_data = true` (SF-TEST-Fixture via
  `seed_test_feature`) and a backlog feature with `is_test_data = false`
- **WHEN** `scripts/factory/queue.sh` runs for that brand
- **THEN** the `is_test_data = false` feature appears in the candidate JSON
- **AND** the SF-TEST fixture does NOT appear in the candidate JSON
