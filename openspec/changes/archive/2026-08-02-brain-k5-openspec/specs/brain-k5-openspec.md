# Spec Delta: brain-k5-openspec

## ADDED Requirements

### Requirement: Diagramm mit beschrifteten Kanten (REQ-k5-01)

#### Scenario: Diagramm-Erstellung

**GIVEN** die Brain-Architektur wird dokumentiert
**WHEN** K5 erstellt wird
**THEN** existiert ein Diagramm, das den Lebenszyklus propose→apply→archive sowie die Kanten K5→K1 (Embedding) und K5→K4 (Brain-Ingest) beschriftet darstellt

### Requirement: Lebenszyklus und Auslöser (REQ-k5-02)

#### Scenario: Lebenszyklus-Erhebung

**GIVEN** ein Change durchläuft propose→apply→archive
**WHEN** K5 wird dokumentiert
**THEN** sind die Auslöser je Phase erfasst (`/opsx:*`-Kommandos, `task openspec:*`-Wrapper, `dev-flow-plan`, `dev-flow-execute`) und der Delta-Merge via `scripts/openspec-merge.mjs` sowie das fail-closed-Gate `task openspec:validate` sind beschrieben

### Requirement: Rückstau-Erhebung (REQ-k5-03)

#### Scenario: Rückstau-Messung

**GIVEN** unarchivierte Changes können hinter bereits gemergter Realität zurückbleiben
**WHEN** K5 wird dokumentiert
**THEN** ist die aktuelle Anzahl unarchivierter Verzeichnisse unter `openspec/changes/` gemessen (nicht abgeleitet) und im Dokument beziffert

### Requirement: Defekt-Referenz (REQ-k5-04)

#### Scenario: Defekt-Zuordnung

**GIVEN** T002430 definiert die Defekte D1-D9
**WHEN** K5 wird dokumentiert
**THEN** sind die für K5 relevanten Defekte benannt und ihr Status referenziert
