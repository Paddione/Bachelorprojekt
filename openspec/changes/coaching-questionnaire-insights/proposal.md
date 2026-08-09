# Proposal: Questionnaire-Antworten semantisch analysieren

**Ticket:** T002652 | **Typ:** feat | **Aufwand:** klein | **Parent:** T002649

## Problem

Fragebögen werden im Coaching ausgefüllt, aber die Antworten liegen unstrukturiert in der DB.
Der Coach müsste jede Antwort einzeln lesen, um Muster zu erkennen — das skaliert nicht.

## Ziel

Fragebogen-Antworten mit bge-m3 embedden, semantische Cluster bilden und automatisch
labeln. Die Insights erscheinen im Admin-Cockpit als neue Komponente.

## Scope

- **Im Scope:** Embedding aller Antworten eines Fragebogens, Clustering (pgvector cosine +
  DBSCAN), LLM-Labeling pro Cluster, Cockpit-UI
- **Nicht im Scope:** Echtzeit-Updates, Trend-Erkennung über Zeit, mehrere Fragebögen
  gleichzeitig vergleichen

## API

`POST /api/admin/coaching/questionnaire/insights`
- Body: `{ questionnaireId: string }`
- Response: `{ clusters: [{ label, representativeAnswers, size }], generatedAt }`
- Idempotent: existierende Ergebnisse werden gecached zurückgegeben
