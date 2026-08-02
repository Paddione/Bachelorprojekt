# Spec Delta: brain-k2-bge

## ADDED Requirements

### REQ-k2-01: Diagramm mit beschrifteten Kanten

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K2 erstellt wird
**THEN** existiert ein Diagramm, das alle Knoten und Kanten beschriftet darstellt

### REQ-k2-02: Ist/Soll-Unterscheidung

**GIVEN** T002426 (CPU-Paar) ist plan_staged aber noch nicht gebaut
**WHEN** das K2-Diagramm wird erstellt
**THEN** sind Ist- und Soll-Komponenten visuell unterscheidbar

### REQ-k2-03: Vollständige Aufrufer-Erhebung

**GIVEN** die bge-Server laufen auf :8095/:8096
**WHEN** K2 wird dokumentiert
**THEN** sind alle Aufrufer mit Vektorraum-Zuordnung erfasst

### REQ-k2-04: Silent-Failure-Pfade

**GIVEN** der Reranker fiel historisch still auf score:0 zurück
**WHEN** K2 analysiert die Ausfallpfade
**THEN** ist dokumentiert, welche Kanten heute still degradieren

### REQ-k2-05: Host-SPOF und Endpunkt-Quellen

**GIVEN** beide GPU-Server laufen auf demselben Windows-Host
**WHEN** K2 dokumentiert die Infrastruktur
**THEN** ist der Single Point of Failure sichtbar
