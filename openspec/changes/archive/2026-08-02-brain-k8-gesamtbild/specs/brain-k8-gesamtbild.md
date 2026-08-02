# Spec Delta: brain-k8-gesamtbild

## ADDED Requirements

### Requirement: Gesamtdiagramm mit beschrifteten Kanten (REQ-k8-01)

**GIVEN** die Komponenten K1–K7 sind dokumentiert
**WHEN** K8 erstellt wird
**THEN** existiert ein Gesamtdiagramm, das alle sieben Komponenten und ihre Kanten beschriftet darstellt
**AND** jede Kante trägt Format, Transport, Auslöser und Status

### Requirement: Vollständige Defektliste (REQ-k8-02)

**GIVEN** T002430 definiert D1–D9 und die Einzelkinder haben weitere Defekte gefunden
**WHEN** K8 konsolidiert die Defekte
**THEN** existiert eine vollständige Liste aller Defekte mit betroffener Kante, Auswirkung und Typ
**AND** jeder Defekt ist einer der Kategorien Fehlfunktion, Inkompatibilität oder falsche Richtung zugeordnet

### Requirement: Fehlende Kanten (REQ-k8-03)

**GIVEN** die Architektur hat strukturelle Lücken
**WHEN** K8 analysiert die Schnittstellen
**THEN** sind alle Verbindungen benannt, die es nicht gibt, aber geben müsste
**AND** jede fehlende Kante hat eine Begründung und Priorität
