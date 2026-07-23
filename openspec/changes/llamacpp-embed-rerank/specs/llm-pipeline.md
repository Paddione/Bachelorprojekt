## ADDED Requirements

### Requirement: Embedding-Server als llama.cpp-Instanz mit CLS-Pooling

The system SHALL serve `bge-m3` embeddings from a dedicated `llama-server` instance running the
Q8_0 GGUF with GPU offload, bound to `0.0.0.0:8095`, started with explicit `--pooling cls` and the
default L2 normalisation (`--embd-normalize 2`), and SHALL NOT depend on a TEI container or any
socat forwarder.

#### Scenario: Embedding-Endpunkt liefert 1024-dimensionale Vektoren

- **GIVEN** der Embedding-Server läuft auf `:8095` mit `--embedding --pooling cls`
- **WHEN** `POST /v1/embeddings` mit `{model, input}` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und `data[0].embedding` hat 1024 Dimensionen

#### Scenario: Startskript setzt Pooling explizit

- **GIVEN** das versionierte Startskript für den Embedding-Server
- **WHEN** sein Inhalt geprüft wird
- **THEN** enthält es `--pooling cls` — der Modell-Default wird nicht implizit übernommen

---

### Requirement: Rerank-Server als eigenständige llama.cpp-Instanz

The system SHALL serve `bge-reranker-v2-m3` from a separate `llama-server` instance started with
`--reranking` on `0.0.0.0:8096`, because llama.cpp cannot serve embedding and reranking pooling
modes from a single process.

#### Scenario: Rerank-Endpunkt sortiert nach Relevanz

- **GIVEN** der Rerank-Server läuft auf `:8096` mit `--reranking`
- **WHEN** `POST /v1/rerank` mit `{model, query, documents}` gesendet wird
- **THEN** antwortet der Server mit HTTP 200 und `results[]` enthält genau so viele Einträge wie
  übergebene Dokumente, jeder mit `index` und `relevance_score`

#### Scenario: Embedding- und Rerank-Server sind getrennte Prozesse

- **GIVEN** die versionierten Startskripte
- **WHEN** ihr Inhalt geprüft wird
- **THEN** existieren zwei getrennte Skripte mit unterschiedlichen Ports, und keines setzt
  `--embedding` und `--reranking` gemeinsam

---

### Requirement: Neustartfeste LLM-Server über Windows Scheduled Tasks

The system SHALL start the embedding, reranking and Bonsai `llama-server` instances automatically
after host reboot via Windows Scheduled Tasks (`At system startup`, `RunAs SYSTEM`, restart on
failure), driven by versioned PowerShell start scripts under `scripts/llm/`, and the registration
script SHALL be idempotent.

#### Scenario: Startskripte sind versioniert

- **GIVEN** das Repository
- **WHEN** `scripts/llm/` geprüft wird
- **THEN** existieren Startskripte für Embedding-, Rerank- und Bonsai-Server sowie ein
  Registrierungsskript für die Scheduled Tasks

#### Scenario: Wiederholte Registrierung ist folgenlos

- **GIVEN** die Scheduled Tasks sind bereits registriert
- **WHEN** das Registrierungsskript erneut ausgeführt wird
- **THEN** endet es erfolgreich, ohne doppelte Tasks anzulegen

---

### Requirement: VRAM-Notausstieg per Umgebungsvariable

The system SHALL allow moving the embedding model off the GPU on demand via the `LLM_EMBED_NGL`
environment variable (default `99`, `0` = CPU only), and SHALL NOT offload automatically, because
silent automatic offloading would degrade latency by orders of magnitude without warning.

#### Scenario: Startskript reicht LLM_EMBED_NGL durch

- **GIVEN** das Embedding-Startskript
- **WHEN** sein Inhalt geprüft wird
- **THEN** liest es `LLM_EMBED_NGL` mit Default `99` und übergibt den Wert an `-ngl`

---

### Requirement: Vektor-Äquivalenz-Gate vor dem Cutover

The system SHALL verify embedding equivalence between the previous TEI float32 endpoint and the new
Q8_0 GGUF endpoint before switching any environment variable, using a fixed multilingual text
sample and mean cosine similarity, with a pass threshold of **0.99**. The previous TEI container
SHALL remain running until the measurement passes.

#### Scenario: Gate bestanden

- **GIVEN** die mittlere Kosinus-Ähnlichkeit über das Textsample beträgt mindestens 0.99
- **WHEN** der Cutover durchgeführt wird
- **THEN** werden die Env-Vars umgestellt und der TEI-Container anschließend abgeschaltet

#### Scenario: Gate gerissen

- **GIVEN** die mittlere Kosinus-Ähnlichkeit liegt unter 0.99
- **WHEN** das Messergebnis vorliegt
- **THEN** bleiben die Env-Vars auf TEI, der Cutover unterbleibt, und ein Folgeticket für den
  pgvector-Reindex wird angelegt

---

### Requirement: Vier parallele Slots auf dem lokalen Chat-Server

The system SHALL run the Bonsai `llama-server` with `-np 4` so that four subagents can be served
concurrently, and SHALL size `-c` such that each slot retains at least 32k context, with the
concrete value determined by VRAM measurement rather than estimation.

#### Scenario: Startskript konfiguriert vier Slots

- **GIVEN** das Bonsai-Startskript
- **WHEN** sein Inhalt geprüft wird
- **THEN** enthält es `-np 4` und ein `-c`, das geteilt durch 4 mindestens 32768 ergibt

---

### Requirement: Keine Referenzen auf abgeschaltete LLM-Endpunkte

The system SHALL NOT reference the decommissioned LM Studio endpoint or the TEI gateway services in
environment configuration or Kubernetes manifests.

#### Scenario: Konfiguration ist frei von toten Endpunkten

- **GIVEN** `environments/*.yaml`, `environments/schema.yaml` und `k3d/llm-gpu.yaml`
- **WHEN** ihr Inhalt geprüft wird
- **THEN** kommen weder `llm-gateway-lmstudio`, `llm-gateway-tei-embed`, `llm-gateway-tei-rerank`
  noch `LLM_LMSTUDIO_URL` darin vor

## MODIFIED Requirements

### Requirement: Rerank-Client mit Graceful Degradation

The system SHALL re-rank candidate documents by relevance score in descending order via the
llama.cpp reranking endpoint (`POST /v1/rerank` with `{model, query, documents}`, responding with
`{results:[{index, relevance_score}]}`) and SHALL degrade gracefully (returning all documents with
`score: 0`) when the service is disabled, unavailable, or the input is empty. Every degraded call
caused by an error or a non-OK response SHALL emit a warning log entry, so that an outage cannot
pass unnoticed.

#### Scenario: Erfolgreiches Reranking

- **GIVEN** `LLM_RERANK_ENABLED=true` und der Rerank-Server antwortet mit `results[].relevance_score`
- **WHEN** `rerankCandidates` mit einer Query und drei Kandidaten aufgerufen wird
- **THEN** gibt die Funktion die Dokumente absteigend nach `relevance_score` sortiert zurück

#### Scenario: Reranking deaktiviert

- **GIVEN** `LLM_RERANK_ENABLED=false` oder `LLM_RERANKER_URL` ist nicht gesetzt
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** gibt die Funktion alle Eingabedokumente in Originalreihenfolge mit `score: 0` zurück,
  ohne einen Fehler zu werfen und ohne eine Warnung zu loggen

#### Scenario: Rerank-Server nicht verfügbar

- **GIVEN** `LLM_RERANK_ENABLED=true`, aber der Rerank-Server antwortet mit einem Fehlerstatus oder
  die Verbindung schlägt fehl
- **WHEN** `rerankCandidates` aufgerufen wird
- **THEN** gibt die Funktion alle Eingabedokumente mit `score: 0` zurück **und** loggt eine Warnung

---

### Requirement: LLM-Router Strict-Fail bei Embedding-Ausfall (E2E)
<!-- e2e: fa-34-llm-strict-fail.spec.ts -->

The system SHALL return HTTP 5xx (not a silent 200 with Voyage fallback) for `bge-m3` embedding
requests when the embedding service is down, enforcing fail-closed behaviour. The service in
question is the llama.cpp embedding server; the previous TEI container is no longer part of the
path.

#### Scenario: bge-m3 Embedding gibt 5xx zurück wenn der Embedding-Server ausgefallen ist *(E2E)*

- **GIVEN** der Embedding-Ausfall ist extern simuliert und `LLM_EMBED_URL` ist konfiguriert
- **WHEN** `POST /v1/embeddings` mit `model: 'bge-m3'` und Header `X-Embedding-Purpose: index`
  gesendet wird
- **THEN** antwortet der Router mit HTTP 5xx — ein HTTP 200 würde einen verbotenen
  Silent-Fallback signalisieren
