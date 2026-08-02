# K4: Brain-Wiki (externes Repo Paddione/brain) visualisieren

## Purpose

Kind-Ticket von T002430 (Brain-Architektur EPIC). Visualisiert das kompilierte Brain-Wiki im externen Repo Paddione/brain — Quellgruppen, Ingest-Pipeline, LLM-Schritt und Lesepfade.

## Requirements

### REQ-k4-01: Diagramm der Ingest-Pipeline

**GIVEN** die Brain-Architektur wird dokumentiert  
**WHEN** K4 erstellt wird  
**THEN** existiert ein Diagramm der Ingest-Pipeline: Quellen → brain-ingest.sh → LLM → externes Repo

### REQ-k4-02: Quellgruppen-Erhebung

**GIVEN** `scripts/brain/ingest-sources.yaml` definiert 8 Quellgruppen  
**WHEN** K4 dokumentiert die Quellen  
**THEN** ist erfasst, welche Gruppen aktuell befüllt sind und welche leer (Defekt D3)

### REQ-k4-03: Lesepfad-Integration

**GIVEN** K1 (Vektor) und K3 (Graph) sind separate Wissensquellen  
**WHEN** K4 analysiert die Integration  
**THEN** ist dokumentiert, ob der Brain-Lesepfad mit K1 oder K3 zusammenhängt oder eine dritte Wissensinsel ist

## Scope

- Kein Code — reine Dokumentation und Visualisierung
- Ergebnis: Diagramm + Quellgruppen-Status + Integrationsaussage
- Ablage: `docs/brain/k4-brain-wiki.md`
