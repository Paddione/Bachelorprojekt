K7: Agenten- und MCP-Harness-Ebene visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert die Agenten-Landschaft (orchestrator, gemma26-1/2, deepseek-helper/pro/flash) und die MCP-Harness-Ebene (mcp-gateway, llm-proxy, Tool-Registry).

## Requirements

### REQ-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** diese Komponente erstellt wird
**THEN** existiert ein Diagramm mit beschrifteten Knoten und Kanten

### REQ-02: Vollständige Erhebung

**GIVEN** die Komponente hat spezifische Datenquellen und Schnittstellen
**WHEN** die Dokumentation wird erstellt
**THEN** sind alle relevanten Aspekte erfasst (Datenquellen, Transport, Konsumenten)

### REQ-03: Defekt-Referenz

**GIVEN** das Epic T002430 definiert Defekte (D1-D8)
**WHEN** die Komponente wird dokumentiert
**THEN** sind die für diese Komponente relevanten Defekte referenziert

## Scope

- Kein Code — reine Dokumentation und Visualisierung
- Ablage: docs/brain/k7-agenten-mcp.md
