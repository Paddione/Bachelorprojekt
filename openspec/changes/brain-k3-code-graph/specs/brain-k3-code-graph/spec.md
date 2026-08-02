# Spec Delta: brain-k3-code-graph

## ADDED Requirements

### REQ-k3-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K3 erstellt wird
**THEN** existiert ein Diagramm des Code-Graphen mit allen Datenquellen

### REQ-k3-02: Index-Erhebung

**GIVEN** codebase-memory-mcp indiziert das Repository
**WHEN** K3 dokumentiert die Infrastruktur
**THEN** sind Speicherort, Trigger, detect_changes, Projekte und Index-Alter erfasst

### REQ-k3-03: Transport und Harness-Integration

**GIVEN** der Graph wird über stdio und MCP konsumiert
**WHEN** K3 dokumentiert die Schnittstellen
**THEN** sind alle Transportwege erfasst

### REQ-k3-04: K1/K3-Verhältnis (Defekt D8)

**GIVEN** K1 und K3 halten beide Wissen über dieselbe Codebasis
**WHEN** K3 analysiert die Dopplung
**THEN** existiert eine ausdrückliche Aussage zum Verhältnis mit Divergenzstellen
