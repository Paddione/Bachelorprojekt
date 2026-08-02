# K2: Embedding- und Rerank-Ebene (bge-Paare) visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert die bge-Embedding- und Reranker-Komponenten mit allen Schnittstellen, Konsumenten und Ausfallpfaden. Unterscheidet Ist-Zustand (GPU-Paar auf :8095/:8096) von Soll-Zustand (zusätzliches CPU-Paar auf :8085/:8086 aus T002426).

## Requirements

### REQ-k2-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K2 erstellt wird
**THEN** existiert ein Diagramm, das alle Knoten (Server, Gateway, Konsumenten) und Kanten (Protokoll, Vektorraum, Failover-Pfad) beschriftet darstellt

### REQ-k2-02: Ist/Soll-Unterscheidung

**GIVEN** T002426 (CPU-Paar) ist plan_staged aber noch nicht gebaut
**WHEN** das K2-Diagramm wird erstellt
**THEN** sind Ist-Komponenten (GPU-Paar, aktive Konsumenten) und Soll-Komponenten (CPU-Paar, MCP-Shim) visuell unterscheidbar (z.B. durchgezogen vs. gestrichelt)

### REQ-k2-03: Vollständige Aufrufer-Erhebung

**GIVEN** die bge-Server laufen auf :8095/:8096
**WHEN** K2 wird dokumentiert
**THEN** sind alle Aufrufer erfasst (website/src/lib/embeddings.ts, website/src/lib/rerank.ts, sowie Aufrufer außerhalb von website/) mit Zuordnung zum jeweiligen Vektorraum

### REQ-k2-04: Silent-Failure-Pfade

**GIVEN** der Reranker fiel historisch still auf score:0 zurück
**WHEN** K2 analysiert die Ausfallpfade
**THEN** ist dokumentiert, welche Kanten heute still degradieren (kein Alarm, kein Fehler-Log)

### REQ-k2-05: Host-SPOF und Endpunkt-Quellen

**GIVEN** beide GPU-Server laufen auf demselben Windows-Host
**WHEN** K2 dokumentiert die Infrastruktur
**THEN** ist der Single Point of Failure sichtbar, und die Endpunkt-Adressen sind mit ihrer Quelle (environments/*.yaml, schema.yaml) verlinkt

## Scope

- Kein Code — reine Dokumentation und Visualisierung
- Ergebnis: Diagramm + Silent-Failure-Liste + Aufrufer-Tabelle
- Ablage: `docs/brain/` oder `openspec/changes/brain-k2-bge-paare/`
