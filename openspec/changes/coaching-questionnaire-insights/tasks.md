# Tasks: Questionnaire-Insights

> **Ticket:** T002652 | **Effort:** klein | **Files:** 5

## Implementierung

- [ ] 1. `coaching-questionnaire-insights.ts` — embed(), cluster(), label() Funktionen
  - Embedding via `bge-mcp` (scripts/bge-mcp/client.ts oder HTTP POST localhost:13005)
  - DBSCAN clustering via pgvector cosine distance
  - LLM-Labeling via `getActiveProvider()` + `session-agent-factory`
- [ ] 2. `insights.ts` API-Endpoint — POST /api/admin/coaching/questionnaire/insights
  - Auth (admin-only)
  - Idempotenz (Cache-Check)
  - Error-Handling (kein Embedding-Backend → 503)
- [ ] 3. `QuestionnaireInsights.svelte` — Cockpit-UI-Komponente
  - Cluster-Liste mit Label, Größe, repräsentativen Antworten
  - Regenerate-Button
  - Loading/Error-States
- [ ] 4. `coaching-questionnaire-insights.test.ts` — Unit-Tests
  - Mock bge-mcp, mock LLM
  - Cluster-Logik testen
- [ ] 5. `tests/spec/coaching-llm/questionnaire-insights.bats` — Integrationstest
  - API-Call mit Test-Daten
  - Response-Validierung

## Verifikation

```bash
task test:changed
```
