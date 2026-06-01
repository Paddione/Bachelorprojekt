# Spec: Software Factory — Agentic Workflow Pipeline

**Vorhaben-Ticket:** T000413
**Datum:** 2026-06-01
**Status:** design-approved

## 1. Vision & Goals

Unser nächstes Major-Release: Eine **Software Factory** — ein System, das Agentic Workflows (Multi-Agent-Orchestrierung, parallele Subagenten, adversarial verification) nutzt, um die Feature-Output-Rate drastisch zu erhöhen, während Qualität durch systematische Review-Gates und automatisierte Tests gesichert bleibt.

### Grundsatz-Entscheidungen

| Dimension | Entscheidung |
|---|---|
| Autonomie-Level | **Full Auto-Pilot** — Feature-Request rein, deploytes Feature raus, Mensch nur bei Eskalation |
| Feature-Spektrum | **Alles** — von Config-Änderungen bis zu neuen Services |
| Harte Gates | **CI grün + Tests grün** → Auto-Merge + Auto-Deploy; kein menschlicher Approval im Happy Path |
| Erfolgsmetriken | **Throughput** (Features/Tag) und **Cycle Time** (Ticket-Erstellung bis Deploy) |
| Parallelität | **Massiv parallel (Fleet-Mode)** — 3 initiale Slots, beliebig skalierbar |

### Ziele

1. **Throughput maximieren**: Parallele Feature-Entwicklung durch isolierte Worktrees + unabhängige Subagenten
2. **Qualität halten/steigern**: Systematische Code-Review-, Test- und Verifikations-Gates im Workflow
3. **Kontext-Management**: Shared Context Pool (Vorhaben-Ticket + pgvector + Attachments), aus dem Subagenten ziehen
4. **Pipeline-Automatisierung**: Von der Idee zum deployten Feature mit minimaler menschlicher Intervention

---

## 2. Architektur: Drei Ebenen

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: DISPATCHER                                          │
│ Queue-Manager · Konflikt-Detektor · Scheduler · Watchdog    │
│ (Eine Session / Cron-Job — hält NUR Koordinations-Kontext)  │
└──────────────────────┬──────────────────────────────────────┘
                       │ ordnet Feature zu, startet Pipeline
┌──────────────────────▼──────────────────────────────────────┐
│ TIER 2: PIPELINE pro Feature (Workflow Script)              │
│ Scout → Design → Plan → Implement → Verify → Deploy         │
│ (Eigenes Worktree · eigenes Context Window · adversarisch)  │
└──────────────────────┬──────────────────────────────────────┘
                       │ fächert Tasks parallel auf
┌──────────────────────▼──────────────────────────────────────┐
│ TIER 3: AGENT POOL                                          │
│ Subagenten pro Task · parallel in Worktrees · schema-       │
│ validierte Outputs · Code-Review-Agent · Test-Agent         │
└─────────────────────────────────────────────────────────────┘
```

### Genommene Stärken aus drei Architektur-Ansätzen

| Workflow-nativ (Ansatz 1) | Event-Driven Fleet (Ansatz 2) | Hybrid Dispatcher (Ansatz 3) |
|---|---|---|
| Pipeline-Phasen mit adversarial Verify | Unabhängige Sessions pro Feature (kein Context-Sharing nötig) | Konflikt-bewusstes Scheduling |
| Schema-validierte Outputs pro Phase | Horizontale Skalierung (Feature-Parallelität) | Komplexitäts-Routing |
| Workflow-Tool als Implementierungs-Motor | Fehlerisolation (Crash in Feature A stoppt B nicht) | Inkrementeller Build-up |

---

## 3. Pipeline-Phasen (Tier 2)

Jedes Feature durchläuft sechs Phasen. Die Tiefe skaliert mit der Komplexität (simple / medium / complex).

```
FEATURE REQUEST
      │
      ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ ① SCOUT  │──▶│ ② DESIGN │──▶│ ③ PLAN   │──▶│④ IMPLEMENT│──▶│⑤ VERIFY  │──▶│⑥ DEPLOY  │
│          │   │          │   │          │   │ (parallel)│   │          │   │          │
│ erkunden │   │ spezifi- │   │ tasks    │   │ subagents │   │ merge +  │   │ PR merge │
│ betroffe-│   │ zieren + │   │ zerlegen │   │ pro task  │   │ CI+Tests  │   │ + rollout│
│ ne Files │   │ adversar.│   │ + reihen │   │ + worktree│   │ + review  │   │          │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Komplexitäts-Skalierung

- **SIMPEL** (Config, CSS, Ein-File-Bugfix): ① → direkt ⑤ → ⑥ (Scout identifiziert es als simpel, überspringt Design/Plan/Implement)
- **MEDIUM** (neue API-Route, UI-Komponente, DB-Migration): ① → ②(light) → ③ → ④(2-3 agents) → ⑤ → ⑥
- **KOMPLEX** (neuer Service, systemübergreifend): ① → ②(deep adversarial) → ③(mit Abhängigkeitsgraph) → ④(5+ agents) → ⑤ → ⑥

### Phasen im Detail

**① Scout** — Ein Explore-Agent analysiert das Feature-Request gegen die Codebase. Output (Schema-validiert): `touched_files`, `complexity`, `risk_areas`, `similar_tickets` (via pgvector), `estimated_slots`.

**② Design** — Brainstorming → Spec. Bei medium/complex Features: ein zweiter Agent versucht, das Design zu widerlegen (adversarial verify). Spec wird als Attachment am Feature-Ticket gespeichert (Context-Pool).

**③ Plan** — Zerlegt Spec in unabhängige Tasks. Jeder Task bekommt: Ziel-Files, Akzeptanzkriterien, Abhängigkeiten. Tasks werden nach File-Overlap sequenziert (keine zwei Tasks touchen dieselbe Datei parallel).

**④ Implement** — `pipeline(tasks, implement, verify)` — jeder Task läuft im eigenen Worktree, schreibt Code, führt lokale Tests aus. Output pro Task: Diff + Test-Resultat (Schema-validiert).

**⑤ Verify** — Alle Task-Branches mergen → Full Test Suite → CI. Code-Review-Agent macht Final Pass (Layer 3). Bei Rot: automatischer Fix-Versuch (max 2 Retries), dann Eskalation.

**⑥ Deploy** — PR mergen per Squash-and-Merge → Feature-Task-Deploy → Ticket auf `done`.

---

## 4. Dispatcher (Tier 1)

Das Gehirn der Factory. Läuft als Cron-Job (Session-Wakeup oder `CronCreate`). Hält **keinen** Feature-Kontext, nur Scheduling-Metadaten.

### Dispatcher Loop

```
① POLL Queue (tickets WHERE type=feature, status=backlog)
        │
        ▼
② KLASSIFIZIEREN (Scout-Agent pro Feature)
   → touched_files, complexity, risk
        │
        ▼
③ KONFLIKT-ANALYSE
   Feature A toucht: k3d/website.yaml
   Feature B toucht: website/src/pages/
   → Kein Overlap → PARALLEL
   Feature C toucht: k3d/website.yaml
   → Overlap mit A → SEQUENZIELL nach A
        │
        ▼
④ SCHEDULING (Prio-Feld + FIFO innerhalb gleicher Prio)
   SLOT 1: Feature A (hoch)   SLOT 2: Feature B (mittel)   SLOT 3: WARTEND (Konflikt mit A)
        │
        ▼
⑤ LAUNCH Pipeline pro Feature (eigene Session + Worktree)
        │
        ▼
⑥ MONITOR (Watchdog)
   → Pipeline hängt >30min ohne Fortschritt? → Ping/Eskalation
   → Tests rot nach 2 Retries? → Eskalation
   → Worktree aufräumen nach Completion
        │
        ▼
⑦ METRIKEN sammeln + ins Vorhaben-Ticket schreiben
```

### Kern-Mechaniken

**Konflikt-Detektor:**
- Vor dem Start: Scout-Agent gibt `touched_files` zurück (Dateipfade)
- Konflikt-Matrix: Zwei Features im selben Slot, die eine Datei überschneiden? → Sequenzieren
- Verzeichnis-Level-Heuristik: `k3d/` und `prod/` → sequenziell (Infra-Shared-State), `website/src/pages/` → parallel (unabhängige Pages)

**Slot-Management:**
- 3 parallele Slots initial
- Slot-Freigabe: Pipeline completed → Slot frei → nächstes nicht-konfliktierendes Feature startet
- Stale-Slot-Detection: Pipeline > 30min ohne Fortschritt → Watchdog-Alert

**Eskalations-Pfad:**
- Test-Failure nach 2 Retries → Ticket auf `status=blocked`, Kommentar mit Fehlerlog
- Merge-Konflikt nicht auflösbar → Ticket auf `status=blocked`, Differenz zeigen
- Pipeline-Crash (Session-Timeout) → Ticket auf `status=triage`, kehrt in Queue zurück

**Dispatcher-Evolution:**
- Phase 1: Manuell (`/dev-flow-plan` Aufruf)
- Phase 2: Cron-basiert (alle 10 Minuten)
- Phase 3: Event-getriggert (Webhook auf Ticket-Erstellung)

---

## 5. Context Pool (pgvector + Templates)

### Shared Context Pool Struktur

```
┌────────────────────────────────────────────────────────────┐
│                    SHARED CONTEXT POOL                      │
│                                                             │
│  ┌──────────────────────────────┐  ┌────────────────────┐  │
│  │ VORHABEN T000413            │  │ FEATURE T000xxx     │  │
│  │ • Vision, Goals             │  │ • Spec (Attachment) │  │
│  │ • Architektur-Entscheidungen│  │ • Plan              │  │
│  │ • Konventionen              │  │ • touched_files[]   │  │
│  │ • Bekannte Footguns         │  │ • Status-Timeline   │  │
│  │ • Metriken (v_factory_metrics)│ │ • Build-Logs       │  │
│  └──────────────────────────────┘  └────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ KONFLIKT-MATRIX (Dispatcher managed)                 │  │
│  │ Feature A: [k3d/website.yaml, website/src/api/]      │  │
│  │ Feature B: [k3d/configmap-domains.yaml]              │  │
│  │ Feature C: [website/src/pages/index.astro]           │  │
│  │ Overlaps: none → parallel ✓                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ TICKET EMBEDDINGS (pgvector)                         │  │
│  │ • Semantic Search über vergangene Features           │  │
│  │ • HNSW-Index (vector_cosine_ops)                     │  │
│  │ • bge-m3 1024-dim Embeddings                          │  │
│  │ • Chunks: summary, spec, decision, lesson            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Datenmodell-Erweiterungen

**Neue Spalten in `tickets.tickets`:**
```sql
ALTER TABLE tickets.tickets ADD COLUMN touched_files TEXT[];
ALTER TABLE tickets.tickets ADD COLUMN pipeline_slot INTEGER;
```

**Ticket-Embeddings-Tabelle:**
```sql
CREATE TABLE tickets.ticket_embeddings (
    ticket_id   UUID REFERENCES tickets.tickets(id),
    chunk       TEXT NOT NULL,
    chunk_type  TEXT CHECK (chunk_type IN ('summary','spec','decision','lesson')),
    embedding   VECTOR(1024),
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON tickets.ticket_embeddings 
    USING hnsw (embedding vector_cosine_ops);
```

**Metriken-View:**
```sql
CREATE VIEW tickets.v_factory_metrics AS
SELECT 
    date_trunc('day', created_at) AS day,
    COUNT(*) FILTER (WHERE status = 'done') AS features_shipped,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600) 
        FILTER (WHERE status = 'done') AS avg_cycle_time_h,
    COUNT(*) FILTER (WHERE status = 'blocked') AS escalations
FROM tickets.tickets 
WHERE type = 'feature' AND created_at > NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1;
```

**Dispatcher-View:**
```sql
CREATE VIEW tickets.v_active_features AS
SELECT * FROM tickets.tickets 
WHERE type = 'feature' 
  AND status IN ('backlog', 'in_progress', 'in_review')
  AND touched_files IS NOT NULL
ORDER BY 
  CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END,
  created_at;
```

### Templates (von Agenten auszufüllen)

**Scout-Template:**
```
├─ touched_files:     TEXT[]
├─ complexity:        simple|medium|complex
├─ risk_areas:        TEXT[]
├─ similar_tickets:   TEXT[]  (via pgvector semantic search)
└─ estimated_slots:   INTEGER
```

**Design-Template:**
```
├─ spec_file:         TEXT (Pfad zur Spec-Datei)
├─ architectural_decision: TEXT
├─ tradeoffs:         JSONB
├─ adversarial_review: TEXT (Gegenargument + Verdict)
└─ vector_embedding:  VECTOR(1024)
```

**Lessons-Learned-Template (Post-Deploy):**
```
├─ what_worked:       TEXT
├─ what_failed:       TEXT
├─ footgun_discovered: TEXT
└─ vector_embedding:  VECTOR(1024)
```

### pgvector-Integration

**Infrastruktur vorhanden:**
- `pgvector/pgvector:0.8.0-pg16` ist Standard-Image für `shared-db`
- `CREATE EXTENSION IF NOT EXISTS vector` bereits im Schema
- HNSW-Index mit `vector_cosine_ops` bereits im Einsatz
- bge-m3 Embedding-Pipeline (TEI via `llm-gateway-embed:8081`) aktiv
- Voyage-multilingual-2 als Fallback für ausgewählte Collections

**Agent-Nutzung:**
1. **Scout-Phase:** `SELECT * FROM ticket_embeddings ORDER BY embedding <=> query_embedding LIMIT 5` → findet ähnliche vergangene Features, Architekturentscheidungen, Footguns
2. **Design-Phase:** Speichert Spec als Embedding → andere Features finden sie später
3. **Post-Deploy:** Lessons Learned embedded → akkumulierendes Wissen über Zeit

### Asset-Upload

Existierende Infrastruktur:
```bash
scripts/ticket-attach.sh "$TICKET_UUID" <pfade>
scripts/ticket.sh get-attachments --id <external_id> --out-dir <dir>
```

Erweiterung: Text-Attachments (Specs, Logs, Templates) werden beim Upload automatisch via bge-m3 embedded → landen in `ticket_embeddings` → semantisch suchbar.

### Anti-Patterns (verboten)

- ❌ Agenten speichern Kontext lokal (Session-Gedächtnis ist flüchtig)
- ❌ Agenten kommunizieren direkt miteinander (kein Side-Channel)
- ❌ Worktree-übergreifende File-Locks (git merge regelt das)
- ✅ Alles relevante Wissen landet im Ticket-System

---

## 6. Quality Gates & Verifikation

### Multi-Layer-Verifikation

**Layer 1: PRE-COMMIT (pro Task-Agent)**
- `task test:all` (lokal im Worktree)
- `task workspace:validate` (Kustomize)
- Linter (falls vorhanden)
- ROT → Agent bekommt Fehleroutput, fix, retry

**Layer 2: POST-MERGE (nach Task-Zusammenführung)**
- Full Test Suite (alle Tests)
- CI komplett (build + test + lint + validate)
- ROT → Automatischer Fix-Versuch (max 2 Retries)

**Layer 3: ADVERSARIAL REVIEW (vor PR-Merge)**

Drei Agenten mit verschiedenen Brillen:

| Agent | Prompt-Fokus | Schema-Output |
|---|---|---|
| **Bug-Hunter** | Finde logische Fehler, Race Conditions, Null-References | `{severity, file, line, description}` |
| **Security-Auditor** | Finde Injection, Leaks, unsichere Defaults | `{vulnerability, severity, fix}` |
| **Pattern-Enforcer** | Verstößt der Code gegen Projekt-Konventionen? | `{violation, pattern_expected, fix}` |

Entscheidungslogik:
- Alle 3 grün → Merge
- 1-2 LOW/MEDIUM Findings → Agent fixt, re-verify
- 1+ HIGH/CRITICAL → Ticket auf `blocked`, Eskalation an Mensch

**Layer 4: CANARY SMOKE (nach Deploy, vor Done)**
- Smoke-Test gegen Produktiv-Umgebung
- Health-Check der betroffenen Services
- ROT → Auto-Rollback + Ticket-Eskalation

### Automatischer Fix-Versuch (Retry-Loop)

```
ROT → Fehler-Log parsen → Agent analysiert → Fix generieren
     │                                              │
     └─── max 2 Retries ──▶ immer noch ROT? ──▶ ESKALATION
```

Jeder Retry produziert einen Kommentar im Ticket mit Fehleroutput, Analyse, generiertem Fix (Diff) und neuem Test-Resultat.

### Test-Abdeckungs-Check (vor Merge)

- Neue Dateien erstellt? → Tests dafür vorhanden?
- Bestehende Logik geändert? → Bestehende Tests aktualisiert?
- Happy Path des Features getestet?

Fehlende Tests werden vom Agenten nachgeneriert (Teil des Implement-Scopes).

---

## 7. Bootstrapping-Roadmap

### Phase 1: Foundation (jetzt)

**"Augmented Single-Feature"** — ohne neue Infrastruktur

- Dispatcher = manuell (`/dev-flow-plan`)
- Pipeline = Workflow Script (single feature, N parallele Tasks)
- Agent Pool = Subagenten pro Task (vorhanden)
- Context Pool = T000413 + pgvector (vorhanden)
- Verifikation = Layer 1+2+3
- Parallelität = 1 Feature, N Tasks

**Beweis:** Workflow-Tool kann Feature-Implementierung fächern.

### Phase 2: Dispatcher (als nächstes)

**"Multi-Feature Dispatcher"** — Cron-basierte Orchestrierung

- CronCreate alle 10 Minuten
- Polled Queue + Konflikt-Analyse
- 3 parallele Slots
- Automatische Status-Updates
- Watchdog (30min Timeout)
- Metriken in T000413

**Beweis:** 3 Features parallel, konfliktfrei, autonom.

### Phase 3: Full Auto-Pilot (Ziel)

**"Software Factory"** — voll autonom

- Dispatcher = dedizierter Service (evtl. eigenes Deployment)
- Event-getriggert (Webhook auf Ticket-Erstellung)
- Canary Deploy + Auto-Rollback
- Selbst-heilende Retry-Loops
- Feature-Flags für Dark Launching
- Dashboard mit Live-Metriken

**Beweis:** Feature-Request → Deploytes Feature ohne menschliche Intervention.

---

## 8. Scope & Out of Scope

**In Scope:**
- Dispatcher (Queue-Manager, Konflikt-Detektor, Scheduler, Watchdog)
- Pipeline-Script (Scout → Design → Plan → Implement → Verify → Deploy)
- pgvector-Integration für Ticket-Embeddings (semantische Suche)
- Strukturierte Templates (Scout, Design, Lessons-Learned)
- Multi-Layer-Verifikation (4 Layer)
- Metriken-Tracking (Throughput, Cycle Time, Eskalationen)
- DB-Schema-Erweiterungen (`touched_files`, `pipeline_slot`, `ticket_embeddings`)

**Out of Scope (Phase 3):**
- Dedizierter Dispatcher-Service (nicht Cron-basiert)
- Webhook-Trigger
- Feature-Flags
- Live-Dashboard
- Dark Launching

---

## 9. Verwandte Specs & Infrastruktur

- `docs/superpowers/specs/2026-05-31-dev-flow-improvements-design.md` — Skill-Refactoring (notwendige Vorarbeit für Phase 1)
- `k3d/website-schema.yaml` — pgvector-Extension + HNSW-Indizes (existiert)
- `k3d/shared-db.yaml` — pgvector/pgvector:0.8.0-pg16 Image (existiert)
- `scripts/ticket.sh` — CLI-Ticket-Helper (existiert)
- `scripts/ticket-attach.sh` — Asset-Upload (existiert)
- LLM-Pipeline: `llm-gateway-embed:8081` (TEI/bge-m3) + Voyage-API (existiert)
