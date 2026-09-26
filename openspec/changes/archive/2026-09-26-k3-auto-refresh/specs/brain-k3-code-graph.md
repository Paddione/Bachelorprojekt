## MODIFIED Requirements

### Requirement: Index-Erhebung (REQ-k3-02)

#### Scenario: Index-Analyse

**GIVEN** codebase-memory-mcp indiziert das Repository
**WHEN** K3 dokumentiert die Infrastruktur
**THEN** sind Speicherort, Trigger (periodischer Auto-Refresh mit
Intervall und Frische-Kriterium), detect_changes, Projekte und
Index-Alter erfasst

## ADDED Requirements

### Requirement: Periodischer Graph-Refresh (REQ-k3-05)

The repository SHALL refresh the codebase-memory code graph
periodically on the dev machine via a scheduled job that skips fresh
indexes (cheap `index_status`/`detect_changes` pre-gate) and runs
drift-triggered refreshes exclusively through the single-flight
wrapper, so that at most one index job per repo path runs at any time
and staleness stays bounded by interval plus refresh duration.

#### Scenario: Fresh index at tick time

- **GIVEN** the scheduled job fires and the graph shows no drift
- **WHEN** the skip-if-fresh pre-gate runs
- **THEN** no index job starts and the tick reports a fresh skip with
  the last-refresh age

#### Scenario: Stale index at tick time

- **GIVEN** the scheduled job fires and the graph shows drift
- **WHEN** the refresh runs
- **THEN** it goes through the single-flight wrapper and the tick
  reports the refresh outcome with its duration
