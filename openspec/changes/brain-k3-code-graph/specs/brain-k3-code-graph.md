# Spec Delta: brain-k3-code-graph

## ADDED Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k3-01)

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K3 erstellt wird
**THEN** existiert ein Diagramm des Code-Graphen mit allen Datenquellen

### Requirement: Index-Erhebung (REQ-k3-02)

**GIVEN** codebase-memory-mcp indiziert das Repository
**WHEN** K3 dokumentiert die Infrastruktur
**THEN** sind Speicherort, Trigger, detect_changes, Projekte und Index-Alter erfasst

### Requirement: Transport und Harness-Integration (REQ-k3-03)

**GIVEN** der Graph wird über stdio und MCP konsumiert
**WHEN** K3 dokumentiert die Schnittstellen
**THEN** sind alle Transportwege erfasst

### Requirement: K1/K3-Verhältnis (Defekt D8) (REQ-k3-04)

**GIVEN** K1 und K3 halten beide Wissen über dieselbe Codebasis
**WHEN** K3 analysiert die Dopplung
**THEN** existiert eine ausdrückliche Aussage zum Verhältnis mit Divergenzstellen
