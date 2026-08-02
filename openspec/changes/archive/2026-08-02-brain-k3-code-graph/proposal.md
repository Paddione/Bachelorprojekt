# K3: Code-Graph (codebase-memory-mcp) visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert den codebase-memory-mcp Wissensgraphen — Symbole, Aufrufketten, Routen, Abhängigkeiten — und klärt das Verhältnis zur parallelen Vektor-Wahrheit in K1 (Defekt D8).

## Requirements

### REQ-k3-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K3 erstellt wird
**THEN** existiert ein Diagramm des Code-Graphen mit allen Datenquellen (Index, Speicher, Abfragewege, Trigger)

### REQ-k3-02: Index-Erhebung

**GIVEN** codebase-memory-mcp indiziert das Repository
**WHEN** K3 dokumentiert die Infrastruktur
**THEN** sind erfasst: Speicherort (physisch), Trigger (manuell/Hook/CI), detect_changes-Mechanismus, indizierte Projekte, Index-Alter

### REQ-k3-03: Transport und Harness-Integration

**GIVEN** der Graph wird über stdio und MCP konsumiert
**WHEN** K3 dokumentiert die Schnittstellen
**THEN** sind alle Transportwege (stdio als Kindprozess, MCP in den drei Agenten-Harnessen) erfasst

### REQ-k3-04: K1/K3-Verhältnis (Defekt D8)

**GIVEN** K1 (Vektor-Embeddings) und K3 (Code-Graph) halten beide Wissen über dieselbe Codebasis
**WHEN** K3 analysiert die Dopplung
**THEN** existiert eine ausdrückliche Aussage: getrennt mit Grund, oder zusammenzuführen — mit Liste der Stellen, an denen sie auseinanderlaufen können

## Scope

- Kein Code — reine Dokumentation und Visualisierung
- Ergebnis: Diagramm + Erhebungstabelle + K1/K3-Stellungnahme
- Ablage: `docs/brain/k3-code-graph.md`
