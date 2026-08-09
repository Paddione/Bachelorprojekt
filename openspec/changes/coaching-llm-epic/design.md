# Design: Coaching-LLM-Integration

## System-Übersicht

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Admin-Cockpit                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐    │
│  │ Questionnaire │  │ Session-         │  │ RAG-Coaching-       │    │
│  │ Insights      │  │ Zusammenfassungen│  │ Assistent (Chat)    │    │
│  │ (T002652)     │  │ (T002653)        │  │ (T002654)           │    │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬──────────┘    │
│         │                   │                       │               │
├─────────┼───────────────────┼───────────────────────┼───────────────┤
│         ▼                   ▼                       ▼               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  API-Schicht (Astro Endpoints)                │   │
│  │  /api/admin/coaching/questionnaire/insights                   │   │
│  │  /api/admin/coaching/sessions/[id]/summary                    │   │
│  │  /api/admin/coaching/rag/chat                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │                   │                       │               │
├─────────┼───────────────────┼───────────────────────┼───────────────┤
│         ▼                   ▼                       ▼               │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐    │
│  │ Embedding    │  │ LLM Provider     │  │ Knowledge Retrieval │    │
│  │ (bge-m3)     │  │ (coaching-ki-    │  │ (pgvector +         │    │
│  │              │  │  config)         │  │  Cross-Encoder)     │    │
│  └──────────────┘  └──────────────────┘  └─────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Datenschicht                                │   │
│  │  questionnaire_db  │  coaching.sessions  │  coaching.books     │   │
│  │  (Antworten)       │  (Steps + Beats)    │  → knowledge.       │   │
│  │                    │  + audit_log        │    collections      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. Questionnaire-Analyse (T002652)

**Input:** Fragebogen-Antworten aus `questionnaire_db`
**Pipeline:**
1. Antworten embedden via `bge-mcp` (bge-m3, Dimension 1024)
2. Embeddings in `knowledge.chunks` speichern (source='questionnaire')
3. Semantische Cluster via pgvector cosine distance + DBSCAN
4. Pro Cluster: repräsentative Antworten + Label via LLM
5. Insights als JSON in Cockpit rendern

**API-Endpoint:** `POST /api/admin/coaching/questionnaire/insights`
- Body: `{ questionnaireId: string }`
- Response: `{ clusters: [{ label, representativeAnswers, size }], generatedAt }`

**DB:** `knowledge.chunks` (source='questionnaire', collection_id via neue Collection)

### 2. Session-Zusammenfassungen (T002653)

**Input:** Session-Steps + Beat-Responses aus `coaching.sessions` + `session_steps` + `audit_log`
**Pipeline:**
1. Session-Daten aggregieren: Steps, Beat-Antworten, Coach-Notizen
2. Prompt bauen aus Template (coaching-templates-db Muster)
3. LLM-Call via aktiven KI-Provider (coaching-ki-config, gleicher Pfad wie generate.ts)
4. Summary in DB speichern (neue Spalte oder `session_audit_log` event)
5. Im Cockpit anzeigen (SessionReport-Komponente)

**API-Endpoint:** `POST /api/admin/coaching/sessions/[id]/summary`
- Response: `{ summary: string, model, generatedAt }`
- Idempotent: existierende Summary wird zurückgegeben, nicht neu generiert

**DB:** Neue Spalte `coaching.sessions.llm_summary TEXT` oder `session_audit_log` event_type='llm_summary'

### 3. RAG-Coaching-Assistent (T002654)

**Input:** Coach-Frage + Coaching-Wissen (books → chunks)
**Pipeline:**
1. Coach-Frage embedden via bge-m3
2. Retrieval: pgvector cosine similarity über `knowledge.chunks` (collection_id aus coaching.books)
3. Rerank: Cross-Encoder (bge-reranker-v2-m3) über Top-K Kandidaten
4. LLM-Call mit gerankten Chunks als Kontext + Coach-Frage
5. Antwort + Quellen im Chat-UI rendern

**API-Endpoint:** `POST /api/admin/coaching/rag/chat`
- Body: `{ question: string, sessionId?: string }`
- Response (stream): SSE mit Chunks
- Response (non-stream): `{ answer, sources: [{ chunkId, bookTitle, score }] }`

**Verwendet:** `coaching-collections.ts` (resolveCoachingCollectionIds), bge-embed, bge-rerank, active KI-Provider

## Gemeinsame Infrastruktur

### Embedding-Pipeline

Alle drei Kinder teilen dieselbe bge-Embedding-Infrastruktur:
- `bge-mcp` (scripts/bge-mcp/server.mjs, Port 13005)
- CPU-only bge-Paar im k3d (k3d/llm-gpu.yaml)
- Client: `scripts/knowledge/lib-context-retrieve.mjs` (nach T002658)

### KI-Provider

Session-Summaries und RAG-Assistent nutzen den aktiven KI-Provider aus `coaching-ki-config`:
- Provider-Auswahl via `getActiveProvider(pool, brand)`
- Gleiche Konfiguration (model, temperature, maxTokens) wie generate.ts
- Fallback: Hardcoded Step-Definitions (STEP_DEFINITIONS)

### DSGVO/Privacy

- Questionnaire-Analyse: Embeddings enthalten keine PII (Texte werden vor Embedding gescrubbt)
- Session-Summaries: Gleicher PII-Scrubber wie generate.ts (`scrubClientPii`)
- RAG-Assistent: Coach-Fragen enthalten keine Klienten-PII (Coach fragt über Coaching-Methodik)

## Implementierungs-Reihenfolge

1. **T002652 zuerst** — Questionnaire-Analyse ist unabhängig und testet die Embedding-Pipeline
2. **T002653 parallel** — Session-Summaries nutzen nur LLM, keine Embeddings
3. **T002654 zuletzt** — RAG-Assistent braucht sowohl Embeddings (aus T002652 validiert) als auch
   Retrieval (T002658 S1)
