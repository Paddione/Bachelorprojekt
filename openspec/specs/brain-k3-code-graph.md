# brain-k3-code-graph

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k3-code-graph ergänzen._

## Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k3-01)

#### Scenario: Code-Graph-Dokumentation

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K3 erstellt wird
**THEN** existiert ein Diagramm des Code-Graphen mit allen Datenquellen

### Requirement: Index-Erhebung (REQ-k3-02)

#### Scenario: Index-Analyse

**GIVEN** codebase-memory-mcp indiziert das Repository
**WHEN** K3 dokumentiert die Infrastruktur
**THEN** sind Speicherort, Trigger (periodischer Auto-Refresh mit
Intervall und Frische-Kriterium), detect_changes, Projekte und
Index-Alter erfasst

### Requirement: Transport und Harness-Integration (REQ-k3-03)

#### Scenario: Transport-Dokumentation

**GIVEN** der Graph wird über stdio und MCP konsumiert
**WHEN** K3 dokumentiert die Schnittstellen
**THEN** sind alle Transportwege erfasst

### Requirement: K1/K3-Verhältnis (Defekt D8) (REQ-k3-04)

#### Scenario: Divergenz-Analyse

**GIVEN** K1 und K3 halten beide Wissen über dieselbe Codebasis
**WHEN** K3 analysiert die Dopplung
**THEN** existiert eine ausdrückliche Aussage zum Verhältnis mit Divergenzstellen

<!-- merged from change delta brain-k3-code-graph.md (ae2eeabf682b) -->

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

<!-- merged from change delta brain-k3-code-graph.md (b8787acec5db) -->