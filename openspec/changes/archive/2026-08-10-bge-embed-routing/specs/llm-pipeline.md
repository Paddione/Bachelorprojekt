## ADDED Requirements

### Requirement: bge-m3 als primärer Embedding-Provider mit Voyage-Fallback

The system SHALL call the bge-m3 embedding endpoint at `LLM_EMBED_URL` first from `embedAll()` in
`scripts/knowledge/lib-knowledge-pg.mjs`, and SHALL fall back to the Voyage AI API for the rest of
the current process run — with a logged warning — only when the bge call fails or `LLM_EMBED_URL`
is not configured. The system SHALL NOT depend on `LLM_ROUTER_URL` /
`llm-router.workspace.svc.cluster.local:4000`, because that Service does not exist in the cluster
(dead code path).

#### Scenario: bge erreichbar → bge-Vektoren

- **GIVEN** `LLM_EMBED_URL` zeigt auf `http://llm-gateway-embed.workspace.svc.cluster.local:8081` und der Endpoint antwortet
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** liefert das System die 1024-dimensionalen bge-m3-Embeddings des Endpoints ohne Voyage-Aufruf

#### Scenario: bge unerreichbar → Voyage-Fallback mit Warnung

- **GIVEN** `LLM_EMBED_URL` gesetzt ist, aber der Endpoint nicht erreichbar ist
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** loggt das System eine Fallback-Warnung und liefert Voyage-Embeddings, und bge wird für den Rest des Prozesslaufs nicht erneut versucht

#### Scenario: LLM_EMBED_URL nicht konfiguriert

- **GIVEN** `LLM_EMBED_URL` ist nicht gesetzt
- **WHEN** `embedAll(['text'])` aufgerufen wird
- **THEN** loggt das System eine Warnung und nutzt direkt die Voyage-API

---

### Requirement: LLM_EMBED_URL in knowledge-ingest CronJobs verdrahtet

The system SHALL provide `LLM_EMBED_URL` (value `http://llm-gateway-embed.workspace.svc.cluster.local:8081`)
in the env block of all three knowledge-ingest CronJob containers (`knowledge-ingest-bugs`,
`knowledge-ingest-prs`, `knowledge-ingest-markdown`) in `k3d/knowledge-ingest-cronjob.yaml`, so the
new bge-primär embedding path can be reached from the cluster.

#### Scenario: CronJob-Container haben die Env-Var

- **GIVEN** `k3d/knowledge-ingest-cronjob.yaml`
- **WHEN** die env-Blöcke der drei CronJob-Container geprüft werden
- **THEN** enthält jeder `LLM_EMBED_URL` mit dem Cluster-DNS-Wert auf Port 8081

---

### Requirement: LLM_RERANKER_URL im website-Deployment verdrahtet

The system SHALL wire `LLM_RERANKER_URL: "${LLM_RERANKER_URL}"` into the website Deployment env
block in `k3d/website.yaml`, directly next to the existing `LLM_EMBED_URL` entry, so reranking is
functional as soon as `LLM_RERANK_ENABLED=true` is set (previously a silent gap).

#### Scenario: website-Deployment hat die Env-Var

- **GIVEN** `k3d/website.yaml`
- **WHEN** der env-Block des website-Deployments geprüft wird
- **THEN** enthält er `LLM_RERANKER_URL` mit dem `${LLM_RERANKER_URL}`-Platzhalter

---

### Requirement: Keine toten :8095-Fallbacks in index-repo

The system SHALL reference port 8081 instead of the decommissioned port 8095 in
`resolveEmbedConfig()` of `scripts/index-repo.ts` — both the host-local fallback URL and the
cluster-DNS fallback — and SHALL keep the explanatory comment in sync with the actual Service
port.

#### Scenario: Fallbacks zeigen auf 8081

- **GIVEN** `scripts/index-repo.ts`
- **WHEN** der Code von `resolveEmbedConfig()` geprüft wird
- **THEN** referenziert weder `localUrl` noch der Cluster-Fallback den Port 8095
