# Design: Questionnaire-Insights

## Pipeline

```
questionnaire_db.answers
  │
  ├─► [1] Antworten extrahieren + PII scrubben
  │
  ├─► [2] Embedding via bge-mcp (bge-m3, dim=1024)
  │
  ├─► [3] pgvector cosine distance → DBSCAN clustering
  │        (eps=0.3, min_samples=2)
  │
  ├─► [4] Pro Cluster: Top-3 repräsentative Antworten
  │        + LLM-Label (via coaching-ki-config)
  │
  └─► [5] Ergebnis als JSON in Cockpit rendern
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `website/src/pages/api/admin/coaching/questionnaire/insights.ts` | API-Endpoint |
| `website/src/lib/coaching-questionnaire-insights.ts` | Business-Logik (embed, cluster, label) |
| `website/src/lib/coaching-questionnaire-insights.test.ts` | Unit-Tests |
| `website/src/components/admin/coaching/QuestionnaireInsights.svelte` | Cockpit-UI |
| `tests/spec/coaching-llm/questionnaire-insights.bats` | BATS-Integrationstest |

## DB

Bestehende Tabellen, keine Schema-Änderung:
- `knowledge.chunks` — Embeddings speichern (source='questionnaire', collection_id)
- `questionnaire_db` — Antworten lesen

## Verifikation

```bash
curl -s -X POST http://localhost:4321/api/admin/coaching/questionnaire/insights \
  -H 'Content-Type: application/json' \
  -d '{"questionnaireId":"<id>"}' | jq '.clusters | length'
```
