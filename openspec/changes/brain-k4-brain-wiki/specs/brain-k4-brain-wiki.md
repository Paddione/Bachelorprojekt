# Spec Delta: brain-k4-brain-wiki

## ADDED Requirements

### Requirement: Diagramm der Ingest-Pipeline (REQ-k4-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K4 erstellt wird
**THEN** existiert ein Diagramm der Ingest-Pipeline mit beschrifteten Kanten

### Requirement: Quellgruppen-Erhebung (REQ-k4-02)

#### Scenario: Quellgruppen-Survey

**GIVEN** ingest-sources.yaml definiert 8 Quellgruppen
**WHEN** K4 dokumentiert die Quellen
**THEN** ist erfasst, welche Gruppen aktuell befüllt sind und welche keinen Trigger haben

### Requirement: Lesepfad-Integration (REQ-k4-03)

#### Scenario: Integrations-Analyse

**GIVEN** K1 und K3 sind separate Wissensquellen
**WHEN** K4 analysiert die Integration
**THEN** ist dokumentiert, ob der Brain-Lesepfad mit K1/K3 zusammenhängt oder eine unverbundene Wissensinsel bildet
