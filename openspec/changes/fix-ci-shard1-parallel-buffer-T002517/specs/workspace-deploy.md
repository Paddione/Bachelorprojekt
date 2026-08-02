## ADDED Requirements

### Requirement: GNU parallel nutzt isoliertes TMPDIR in CI

The system SHALL set `TMPDIR` to `$RUNNER_TEMP` for all `bats -j` invocations
in CI, so that GNU parallel output buffers are written to the job-isolated
temp directory instead of the shared `/tmp`.

#### Scenario: /tmp auf CI-Runner ist voll

- **GIVEN** `/tmp` auf dem CI-Runner ist durch andere Prozesse belegt
- **WHEN** ein `bats -j $JOBS` Lauf startet
- **THEN** schreibt GNU parallel Ausgabepuffer nach `$RUNNER_TEMP`
- **AND** der Testlauf führt alle erwarteten Tests aus (nicht 0)
