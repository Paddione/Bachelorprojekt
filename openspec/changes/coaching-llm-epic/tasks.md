# Tasks: Coaching-LLM-EPIC

> **Typ:** project (EPIC) | **Kinder:** T002652, T002653, T002654
> **Architektur:** [design.md](./design.md)

## Übersicht

Der EPIC koordiniert drei Kind-Tickets, die parallel implementiert werden können.
Die EPIC-Aufgabe selbst ist die architektonische Klammer — gemeinsame Schnittstellen
definieren, Embedding-Pipeline bereitstellen, KI-Provider-Konfiguration sicherstellen.

## Tasks

### 1. Embedding-Pipeline verifizieren

- [ ] Prüfen, ob bge-mcp (Port 13005) erreichbar ist und Embeddings liefert
- [ ] Prüfen, ob `knowledge.chunks` Tabelle HNSW-Index hat (nach T002658 S1)
- [ ] Test-Embedding schreiben: `curl -s -X POST http://localhost:13005/...` → Vektor
- [ ] Verifikation: `bash scripts/bge-mcp/check-client-env.sh` → Exit 0

### 2. Questionnaire-Analyse (→ T002652)

- [ ] T002652 aus Backlog dispatchen (→ dev-flow-plan)
- [ ] API: `POST /api/admin/coaching/questionnaire/insights`
- [ ] Embedding + Clustering + LLM-Labeling
- [ ] Cockpit-UI: Insights-Komponente

### 3. Session-Zusammenfassungen (→ T002653)

- [ ] T002653 aus Backlog dispatchen (→ dev-flow-plan)
- [ ] API: `POST /api/admin/coaching/sessions/[id]/summary`
- [ ] Session-Daten-Aggregation + LLM-Call
- [ ] DB-Schema: `coaching.sessions.llm_summary`
- [ ] Cockpit-UI: Summary in SessionReport

### 4. RAG-Coaching-Assistent (→ T002654)

- [ ] T002654 aus Backlog dispatchen (→ dev-flow-plan)
- [ ] API: `POST /api/admin/coaching/rag/chat`
- [ ] Retrieval + Rerank + LLM
- [ ] Cockpit-UI: Chat-Komponente mit Quellenangabe

### 5. Integration & QA

- [ ] Ende-zu-Ende-Test: Questionnaire → Insights → Cockpit
- [ ] Ende-zu-Ende-Test: Session → Summary → Cockpit
- [ ] Ende-zu-Ende-Test: Frage → RAG → Antwort mit Quellen
- [ ] DSGVO-Check: Keine PII in Embeddings / LLM-Calls
- [ ] Performance: Embedding < 2s, LLM < 10s, RAG < 5s

## Abhängigkeiten

```
T002649 (dieser EPIC)
  ├── T002652 (Questionnaire) — kann sofort starten
  ├── T002653 (Summaries)     — kann sofort starten (braucht nur LLM)
  └── T002654 (RAG)           — braucht T002658 (S1 Retrieval) + T002652 (Embedding validiert)
```

## Status

| Schritt | Ticket | Status |
|---------|--------|--------|
| EPIC-Design | T002649 | ✅ proposal + design geschrieben |
| Embedding-Pipeline | — | ⬜ zu verifizieren |
| Questionnaire-Analyse | T002652 | ⬜ bereit zum Dispatch |
| Session-Summaries | T002653 | ⬜ bereit zum Dispatch |
| RAG-Assistent | T002654 | ⬜ bereit zum Dispatch (wartet auf T002658) |
