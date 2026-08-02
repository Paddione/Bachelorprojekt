# brain-k2-bge

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu brain-k2-bge ergänzen._

## Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k2-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K2 erstellt wird
**THEN** existiert ein Diagramm, das alle Knoten und Kanten beschriftet darstellt

### Requirement: Ist/Soll-Unterscheidung (REQ-k2-02)

#### Scenario: Ist/Soll-Visualisierung

**GIVEN** T002426 (CPU-Paar) ist plan_staged aber noch nicht gebaut
**WHEN** das K2-Diagramm wird erstellt
**THEN** sind Ist- und Soll-Komponenten visuell unterscheidbar

### Requirement: Vollständige Aufrufer-Erhebung (REQ-k2-03)

#### Scenario: Aufrufer-Survey

**GIVEN** die bge-Server laufen auf :8095/:8096
**WHEN** K2 wird dokumentiert
**THEN** sind alle Aufrufer mit Vektorraum-Zuordnung erfasst

### Requirement: Silent-Failure-Pfade (REQ-k2-04)

#### Scenario: Failure-Analyse

**GIVEN** der Reranker fiel historisch still auf score:0 zurück
**WHEN** K2 analysiert die Ausfallpfade
**THEN** ist dokumentiert, welche Kanten heute still degradieren

### Requirement: Host-SPOF und Endpunkt-Quellen (REQ-k2-05)

#### Scenario: SPOF-Dokumentation

**GIVEN** beide GPU-Server laufen auf demselben Windows-Host
**WHEN** K2 dokumentiert die Infrastruktur
**THEN** ist der Single Point of Failure sichtbar

<!-- merged from change delta brain-k2-bge.md (792c2920a8f4) -->
