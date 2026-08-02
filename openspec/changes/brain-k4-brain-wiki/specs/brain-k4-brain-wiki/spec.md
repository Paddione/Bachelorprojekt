# Spec Delta: brain-k4-brain-wiki

## ADDED Requirements

### REQ-k4-01: Diagramm der Ingest-Pipeline

**GIVEN** die Brain-Architektur wird dokumentiert  
**WHEN** K4 erstellt wird  
**THEN** existiert ein Diagramm der Ingest-Pipeline

### REQ-k4-02: Quellgruppen-Erhebung

**GIVEN** ingest-sources.yaml definiert 8 Quellgruppen  
**WHEN** K4 dokumentiert die Quellen  
**THEN** ist erfasst, welche Gruppen aktuell befüllt sind

### REQ-k4-03: Lesepfad-Integration

**GIVEN** K1 und K3 sind separate Wissensquellen  
**WHEN** K4 analysiert die Integration  
**THEN** ist dokumentiert, ob der Brain-Lesepfad mit K1/K3 zusammenhängt
